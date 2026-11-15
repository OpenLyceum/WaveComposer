/**
 * PresetFrameSource.ts
 *
 * A continuous, permission-free {@link AudioFrameSource} for the synthetic preset
 * sounds (vowels, clarinet, flute, violin, cymbals). Shaped after the old demo
 * source: it tracks elapsed time and hands the frame's start time to a generator
 * callback, so streamed tones stay phase-continuous across frames.
 *
 * One class covers every synthetic preset — the per-preset behavior lives in the
 * {@link PresetGenerator} closures built in {@link presets.ts}.
 */
import type { AudioFrameSource } from "./AudioFrameSource.js";

/** Fills `out` with one frame starting at absolute time `timeS` (seconds). */
export type PresetGenerator = (out: Float32Array, sampleRate: number, timeS: number) => void;

const DEFAULT_SAMPLE_RATE_HZ = 44100;

/** @internal Exported for unit tests; not part of the application API. */
export class PresetFrameSource implements AudioFrameSource {
  public readonly sampleRate: number;
  public readonly isActive = true;

  private readonly generate: PresetGenerator;
  // Elapsed time, advanced one frame at a time; drives phase continuity / vibrato.
  private timeS = 0;

  public constructor(generate: PresetGenerator, sampleRate: number = DEFAULT_SAMPLE_RATE_HZ) {
    this.generate = generate;
    this.sampleRate = sampleRate;
  }

  public getFrame(out: Float32Array): boolean {
    this.generate(out, this.sampleRate, this.timeS);
    this.timeS += out.length / this.sampleRate;
    return true;
  }
}
