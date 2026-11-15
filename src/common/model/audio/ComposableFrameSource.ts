/**
 * ComposableFrameSource.ts
 *
 * Multi-sine wave composition: sums enabled partials with independent frequency,
 * amplitude, and phase. Phase stays continuous across frames via the absolute start time supplied
 * by SyntheticWebAudioSource.
 */
import type { PresetGenerator } from "./PresetGenerator.js";
import { SyntheticWebAudioSource } from "./SyntheticWebAudioSource.js";

/** One sinusoidal partial in the composition. */
export type CompositionPartial = {
  readonly frequencyHz: number;
  readonly amplitude: number;
  readonly phaseRad: number;
  readonly enabled: boolean;
};

const MAX_PARTIALS = 4;
const TWO_PI = 2 * Math.PI;

/** Builds a phase-continuous generator that reads partials each frame. */
export function createComposableGenerator(getPartials: () => readonly CompositionPartial[]): PresetGenerator {
  return (out, sampleRate, timeS) => {
    out.fill(0);
    const partials = getPartials();
    for (const partial of partials) {
      if (!partial?.enabled || partial.amplitude <= 0 || partial.frequencyHz <= 0) {
        continue;
      }
      const omega = (TWO_PI * partial.frequencyHz) / sampleRate;
      const phase0 = partial.phaseRad + TWO_PI * partial.frequencyHz * timeS;
      for (let i = 0; i < out.length; i++) {
        out[i] = (out[i] ?? 0) + partial.amplitude * Math.sin(omega * i + phase0);
      }
    }
  };
}

/** Web Audio source for the interactive compose lab. */
export function createComposableSource(
  getPartials: () => readonly CompositionPartial[],
  fftSize: number,
): SyntheticWebAudioSource {
  return new SyntheticWebAudioSource(createComposableGenerator(getPartials), fftSize);
}

export const CompositionConstants = {
  MAX_PARTIALS,
} as const;
