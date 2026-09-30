/**
 * MicrophoneInput.ts
 *
 * Live microphone {@link AudioFrameSource}: getUserMedia → AudioContext →
 * AnalyserNode. Each `getFrame` pulls the current time-domain window via
 * `getFloatTimeDomainData`, which is exactly what the per-frame analyzer needs.
 *
 * Audio enhancements (echo cancellation, noise suppression, AGC) are disabled so
 * the analysis sees the raw signal.
 *
 * While capturing, the same source node can be tapped by a {@link ScriptProcessorNode}
 * to record the raw PCM into memory (see {@link startRecording}); the captured clip
 * is replayed through a {@link RecordedAudioSource}.
 */
import { AnalyserTap } from "./AnalyserTap.js";
import type { AudioFrameSource } from "./AudioFrameSource.js";
import type { MonitoredAudioSource } from "./MonitoredAudioSource.js";
import { connectSharedMonitoringOutput, getSharedAudioContext } from "./SharedAudioContext.js";

const DEFAULT_SAMPLE_RATE = 44100;
const RECORD_BUFFER_SIZE = 4096;
// Caps in-memory recording at ~2 min (44.1 kHz / 4096 samples per chunk ≈ 10.8 chunks/s).
const MAX_RECORDING_CHUNKS = 1300;

/** A captured microphone clip: mono PCM samples and the rate they were recorded at. */
export interface RecordedClip {
  readonly samples: Float32Array;
  readonly sampleRate: number;
}

export class MicrophoneInput implements AudioFrameSource, MonitoredAudioSource {
  private readonly tap: AnalyserTap;
  private audioContext: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private stream: MediaStream | null = null;
  /** Serialises concurrent start() calls: both callers await the same promise. */
  private startInProgress: Promise<void> | null = null;
  // Recording tap: a ScriptProcessorNode that accumulates raw PCM while active.
  // It must be connected to the destination to run, so its (silent) output is
  // routed through a muted gain to avoid echoing the microphone to the speakers.
  private recordProcessor: ScriptProcessorNode | null = null;
  private recordSink: GainNode | null = null;
  private recordedChunks: Float32Array[] = [];
  /** Guards {@link onRecordingLimitReached} so it fires at most once per recording. */
  private recordingLimitNotified = false;
  /**
   * Bumped by every {@link stop}; {@link doStart} re-checks it after each await so
   * a stop that arrives mid-start abandons the (now-stale) stream instead of
   * leaving the microphone live.
   */
  private startGeneration = 0;
  /** Fired once when an in-progress recording reaches the in-memory cap. */
  public onRecordingLimitReached: (() => void) | null = null;

  public constructor(fftSize: number) {
    this.tap = new AnalyserTap(fftSize);
  }

  public get sampleRate(): number {
    return this.audioContext?.sampleRate ?? DEFAULT_SAMPLE_RATE;
  }

  public get isActive(): boolean {
    return this.tap.analyser !== null;
  }

  /**
   * Requests microphone access and starts the audio graph. Idempotent and
   * concurrency-safe: concurrent callers share the same in-flight promise.
   */
  public start(): Promise<void> {
    if (this.tap.analyser) {
      return Promise.resolve();
    }
    if (!this.startInProgress) {
      this.startInProgress = this.doStart().finally(() => {
        this.startInProgress = null;
      });
    }
    return this.startInProgress;
  }

  /**
   * Whether this document's Permissions-Policy allows `getUserMedia({ audio })`.
   * Calling getUserMedia when the policy forbids microphone logs a console error
   * (`Permissions policy violation`) even if the promise is caught.
   */
  private static isMicrophoneAllowedByPolicy(): boolean {
    if (typeof document === "undefined") {
      return false;
    }
    const policyHolder = document as Document & {
      permissionsPolicy?: { allowsFeature: (feature: string) => boolean };
      featurePolicy?: { allowsFeature: (feature: string) => boolean };
    };
    const policy = policyHolder.permissionsPolicy ?? policyHolder.featurePolicy;
    if (policy && typeof policy.allowsFeature === "function") {
      return policy.allowsFeature("microphone");
    }
    return true;
  }

  private async doStart(): Promise<void> {
    if (this.tap.analyser) {
      return;
    }
    if (!(MicrophoneInput.isMicrophoneAllowedByPolicy() && navigator.mediaDevices?.getUserMedia)) {
      throw new Error("Microphone is not available in this document");
    }
    const generation = this.startGeneration;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    // A stop() landed while we were awaiting permission — release and bail.
    if (generation !== this.startGeneration) {
      for (const track of stream.getTracks()) {
        track.stop();
      }
      return;
    }
    const audioContext = getSharedAudioContext();
    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }
    if (generation !== this.startGeneration) {
      for (const track of stream.getTracks()) {
        track.stop();
      }
      return;
    }

    const { analyser, gainNode } = this.tap.setup(audioContext);
    const sourceNode = audioContext.createMediaStreamSource(stream);
    sourceNode.connect(analyser);
    sourceNode.connect(gainNode);
    connectSharedMonitoringOutput(gainNode);

    this.stream = stream;
    this.audioContext = audioContext;
    this.sourceNode = sourceNode;
  }

  public setMonitoringEnabled(enabled: boolean): void {
    this.tap.setMonitoringEnabled(enabled);
  }

  public get isRecording(): boolean {
    return this.recordProcessor !== null;
  }

  /** Begins accumulating raw PCM from the live microphone. No-op if not capturing. */
  public startRecording(): void {
    const audioContext = this.audioContext;
    const sourceNode = this.sourceNode;
    if (!(audioContext && sourceNode) || this.recordProcessor) {
      return;
    }
    this.recordedChunks = [];
    this.recordingLimitNotified = false;
    const processor = audioContext.createScriptProcessor(RECORD_BUFFER_SIZE, 1, 1);
    processor.onaudioprocess = (event) => {
      if (this.recordedChunks.length >= MAX_RECORDING_CHUNKS) {
        // At capacity: stop silently dropping audio — hand control back so the
        // owner can finalize the clip and surface the limit to the user.
        if (!this.recordingLimitNotified) {
          this.recordingLimitNotified = true;
          this.onRecordingLimitReached?.();
        }
        return;
      }
      // Copy: the input buffer is reused across callbacks.
      this.recordedChunks.push(Float32Array.from(event.inputBuffer.getChannelData(0)));
    };
    const sink = audioContext.createGain();
    sink.gain.value = 0;
    sourceNode.connect(processor);
    processor.connect(sink);
    connectSharedMonitoringOutput(sink);
    this.recordProcessor = processor;
    this.recordSink = sink;
  }

  /** Stops recording and returns the captured clip, or null if nothing was captured. */
  public stopRecording(): RecordedClip | null {
    if (!this.recordProcessor) {
      return null;
    }
    const sampleRate = this.audioContext?.sampleRate ?? DEFAULT_SAMPLE_RATE;
    const chunks = this.recordedChunks;
    this.teardownRecording();
    const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    if (total === 0) {
      return null;
    }
    const samples = new Float32Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      samples.set(chunk, offset);
      offset += chunk.length;
    }
    return { samples, sampleRate };
  }

  /** Discards an in-progress recording without producing a clip. */
  public cancelRecording(): void {
    this.teardownRecording();
  }

  private teardownRecording(): void {
    if (this.recordProcessor) {
      this.recordProcessor.onaudioprocess = null;
      this.recordProcessor.disconnect();
      this.recordProcessor = null;
    }
    if (this.recordSink) {
      this.recordSink.disconnect();
      this.recordSink = null;
    }
    this.recordedChunks = [];
  }

  /** Stops the audio graph and releases the microphone. */
  public stop(): void {
    // Invalidate any in-flight doStart() so a late-resolving getUserMedia does
    // not revive the device after we have torn everything down.
    this.startGeneration++;
    this.teardownRecording();
    this.sourceNode?.disconnect();
    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        track.stop();
      }
    }
    this.sourceNode = null;
    this.stream = null;
    this.audioContext = null;
    // Clear tap references so isActive returns false and readFrame returns false.
    // The context belongs to tambo, so it stays open for the rest of the sim.
    this.tap.clear();
  }

  /** Updates the analyser FFT size (frame length). */
  public setFftSize(fftSize: number): void {
    this.tap.setFftSize(fftSize);
  }

  public getFrame(out: Float32Array): boolean {
    return this.tap.readFrame(out);
  }
}
