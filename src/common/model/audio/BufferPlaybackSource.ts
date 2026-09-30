/**
 * BufferPlaybackSource.ts
 *
 * Shared base for {@link AudioFrameSource}s that loop a decoded {@link AudioBuffer}
 * through an {@link AnalyserNode}: a bundled clip ({@link AudioFileFrameSource}) or
 * an in-memory microphone recording ({@link RecordedAudioSource}). Each `getFrame`
 * taps the current time-domain window — exactly the path {@link MicrophoneInput}
 * uses — so the buffer plays at real time. When monitoring is enabled the same
 * signal is routed to a {@link GainNode} connected to `destination`.
 *
 * All buffer sources share tambo's audio context (see {@link SharedAudioContext})
 * so cycling through many presets never exhausts the browser's per-page budget.
 * Speaker output goes through a SoundGenerator, so the sim stays silent when muted.
 * Subclasses only provide the buffer via {@link resolveBuffer}.
 */
import { AnalyserTap } from "./AnalyserTap.js";
import type { PlayableAudioSource } from "./AudioFrameSource.js";
import type { MonitoredAudioSource } from "./MonitoredAudioSource.js";
import { connectSharedMonitoringOutput, getSharedSampleRate, resumeSharedAudioContext } from "./SharedAudioContext.js";

export abstract class BufferPlaybackSource implements PlayableAudioSource, MonitoredAudioSource {
  public readonly isPlayable = true as const;

  private readonly tap: AnalyserTap;
  protected buffer: AudioBuffer | null = null;
  private bufferPromise: Promise<AudioBuffer | null> | null = null;
  private sourceNode: AudioBufferSourceNode | null = null;
  /** Serialises concurrent start() calls so only one audio graph is built. */
  private startInProgress: Promise<void> | null = null;
  /**
   * Bumped by every {@link stop}; {@link doStart} re-checks it after each await so
   * a stop that arrives mid-start abandons the (now-stale) attempt instead of
   * starting playback after the caller asked to stop.
   */
  private startGeneration = 0;

  protected constructor(fftSize: number) {
    this.tap = new AnalyserTap(fftSize);
  }

  public get sampleRate(): number {
    return getSharedSampleRate();
  }

  public get isActive(): boolean {
    return this.sourceNode !== null;
  }

  /**
   * Resolves the buffer to loop (fetched + decoded, generated, or recorded). Called
   * once on first {@link start}; the result is cached. May return null if the buffer
   * is unavailable.
   */
  protected abstract resolveBuffer(audioContext: AudioContext): Promise<AudioBuffer | null>;

  /**
   * Resumes the shared audio context, resolves the buffer on first use (cached
   * afterward), and starts looping it through the analyser. Idempotent and
   * concurrency-safe: concurrent callers share the same in-flight promise.
   * Must be called from a user gesture so the context may start.
   */
  public start(): Promise<void> {
    if (this.sourceNode) {
      return Promise.resolve();
    }
    if (!this.startInProgress) {
      this.startInProgress = this.doStart().finally(() => {
        this.startInProgress = null;
      });
    }
    return this.startInProgress;
  }

  private async doStart(): Promise<void> {
    if (this.sourceNode) {
      return;
    }
    const generation = this.startGeneration;
    const audioContext = await resumeSharedAudioContext();
    // A stop() landed while the context was resuming — abandon this attempt.
    if (generation !== this.startGeneration) {
      return;
    }
    if (!this.buffer) {
      if (!this.bufferPromise) {
        this.bufferPromise = this.resolveBuffer(audioContext);
      }
      try {
        this.buffer = await this.bufferPromise;
      } catch {
        // Clear the cached rejection so the next start() attempt can retry.
        this.bufferPromise = null;
        return;
      }
    }
    // A stop() landed while the buffer was being fetched/decoded — do not start.
    if (generation !== this.startGeneration) {
      return;
    }
    const buffer = this.buffer;
    if (!buffer) {
      return;
    }
    const { analyser, gainNode } = this.tap.setup(audioContext);

    const sourceNode = audioContext.createBufferSource();
    sourceNode.buffer = buffer;
    sourceNode.loop = true;
    sourceNode.connect(analyser);
    sourceNode.connect(gainNode);
    connectSharedMonitoringOutput(gainNode);
    sourceNode.start(0);
    this.sourceNode = sourceNode;
  }

  public setMonitoringEnabled(enabled: boolean): void {
    this.tap.setMonitoringEnabled(enabled);
  }

  /** Stops playback but keeps the resolved buffer for a fast restart. */
  public stop(): void {
    // Invalidate any in-flight doStart() so a late-resolving buffer/context does
    // not start playback after the caller asked to stop.
    this.startGeneration++;
    if (this.sourceNode) {
      try {
        this.sourceNode.stop();
      } catch {
        // Already stopped; ignore.
      }
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    // Disconnect the gain node so the next start() does not accumulate duplicate
    // destination connections — Web Audio connections are additive, not idempotent.
    this.tap.gainNode?.disconnect();
  }

  /** Updates the analyser FFT size (frame length). */
  public setFftSize(fftSize: number): void {
    this.tap.setFftSize(fftSize);
  }

  public getFrame(out: Float32Array): boolean {
    if (!this.sourceNode) {
      return false;
    }
    return this.tap.readFrame(out);
  }
}
