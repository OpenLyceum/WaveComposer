/**
 * SyntheticWebAudioSource.ts
 *
 * Real-time synthetic {@link AudioFrameSource} backed by a Web Audio graph.
 * A {@link ScriptProcessorNode} runs the preset generator at the audio sample
 * rate; an {@link AnalyserNode} feeds the analyzer and a {@link GainNode} can
 * route the same signal to the speakers.
 */
import { AnalyserTap } from "./AnalyserTap.js";
import type { PlayableAudioSource } from "./AudioFrameSource.js";
import type { MonitoredAudioSource } from "./MonitoredAudioSource.js";
import type { PresetGenerator } from "./PresetFrameSource.js";
import { connectSharedMonitoringOutput, getSharedSampleRate, resumeSharedAudioContext } from "./SharedAudioContext.js";

const SCRIPT_BUFFER_SIZE = 2048;

export class SyntheticWebAudioSource implements PlayableAudioSource, MonitoredAudioSource {
  public readonly isPlayable = true as const;

  private readonly generate: PresetGenerator;
  private readonly tap: AnalyserTap;
  private scriptNode: ScriptProcessorNode | null = null;
  /** Serialises concurrent start() calls so only one audio graph is built. */
  private startInProgress: Promise<void> | null = null;
  /**
   * Bumped by every {@link stop}; {@link doStart} re-checks it after the context
   * resume await so a stop that arrives mid-start abandons the (now-stale)
   * attempt instead of starting synthesis after the caller asked to stop.
   */
  private startGeneration = 0;
  private elapsedPlaybackTimeS = 0;

  public constructor(generate: PresetGenerator, fftSize: number) {
    this.generate = generate;
    this.tap = new AnalyserTap(fftSize);
  }

  public get sampleRate(): number {
    return getSharedSampleRate();
  }

  public get isActive(): boolean {
    return this.scriptNode !== null;
  }

  /** Elapsed synthesis time (s) since the last {@link start}; used for phase-continuous displays. */
  public get playbackTimeS(): number {
    return this.elapsedPlaybackTimeS;
  }

  /**
   * Starts the synthesis graph. Idempotent and concurrency-safe: concurrent
   * callers share the same in-flight promise. Must be called from a user gesture
   * so the shared context may start.
   */
  public start(): Promise<void> {
    if (this.scriptNode) {
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
    if (this.scriptNode) {
      return;
    }
    const generation = this.startGeneration;
    const audioContext = await resumeSharedAudioContext();
    // A stop() landed while the context was resuming — abandon this attempt.
    if (generation !== this.startGeneration) {
      return;
    }

    const { analyser, gainNode } = this.tap.setup(audioContext);

    const scriptNode = audioContext.createScriptProcessor(SCRIPT_BUFFER_SIZE, 0, 1);
    scriptNode.onaudioprocess = (event) => {
      const out = event.outputBuffer.getChannelData(0);
      this.generate(out, audioContext.sampleRate, this.elapsedPlaybackTimeS);
      this.elapsedPlaybackTimeS += out.length / audioContext.sampleRate;
    };
    scriptNode.connect(analyser);
    scriptNode.connect(gainNode);
    connectSharedMonitoringOutput(gainNode);
    this.scriptNode = scriptNode;
  }

  /** Stops synthesis but keeps nodes for a fast restart. */
  public stop(): void {
    // Invalidate any in-flight doStart() so a late-resolving context resume does
    // not start synthesis after the caller asked to stop.
    this.startGeneration++;
    this.scriptNode?.disconnect();
    this.scriptNode = null;
    // Disconnect the gain node so the next start() does not accumulate duplicate
    // destination connections — Web Audio connections are additive, not idempotent.
    this.tap.gainNode?.disconnect();
    this.elapsedPlaybackTimeS = 0;
  }

  public setMonitoringEnabled(enabled: boolean): void {
    this.tap.setMonitoringEnabled(enabled);
  }

  public setFftSize(fftSize: number): void {
    this.tap.setFftSize(fftSize);
  }

  public getFrame(out: Float32Array): boolean {
    if (!this.scriptNode) {
      return false;
    }
    return this.tap.readFrame(out);
  }
}
