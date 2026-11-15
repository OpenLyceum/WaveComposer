/**
 * presets.ts
 *
 * Synthesized sources for presets without a bundled clip (or when the clip is not
 * yet downloaded). Uses deterministic harmonic / source–filter models suited to
 * spectrum demos. Real recordings are preferred — see CREDITS.md and
 * scripts/download-preset-audio.sh.
 */
import type { PresetGenerator } from "./PresetGenerator.js";
import { generateSine } from "./SyntheticFrameSource.js";
import { SyntheticWebAudioSource } from "./SyntheticWebAudioSource.js";
import { createVoiceSyntheticGenerator } from "./voicePresets.js";

const AMPLITUDE = 0.7;
const NOTE_DURATION_S = 0.7;

/** Bowed-string scale: rich harmonic ladder (f, 2f, 3f, …). */
const CELLO_MELODY_HZ = [130.81, 146.83, 164.81, 196.0, 220.0, 246.94];

/** Oboe-like scale: strong odd harmonics (cylindrical bore). */
const OBOE_MELODY_HZ = [261.63, 293.66, 329.63, 349.23, 392.0, 440.0];

function fillHarmonicSeries(
  out: Float32Array,
  sampleRate: number,
  timeS: number,
  f0Hz: number,
  harmonics: readonly number[],
  amplitudes: readonly number[],
): void {
  out.fill(0);
  for (let h = 0; h < harmonics.length; h++) {
    const harmonic = harmonics[h] ?? 1;
    const amp = (amplitudes[h] ?? 0) * AMPLITUDE;
    if (amp <= 0) {
      continue;
    }
    const partial = generateSine(f0Hz * harmonic, sampleRate, out.length, amp, 2 * Math.PI * f0Hz * timeS);
    for (let i = 0; i < out.length; i++) {
      out[i] = (out[i] ?? 0) + (partial[i] ?? 0);
    }
  }
}

function createMelodyHarmonicGenerator(
  melodyHz: readonly number[],
  harmonics: readonly number[],
  amplitudes: readonly number[],
): PresetGenerator {
  return (out, sampleRate, timeS) => {
    const noteIndex = Math.floor(timeS / NOTE_DURATION_S) % melodyHz.length;
    const f0 = melodyHz[noteIndex] ?? melodyHz[0] ?? 220;
    fillHarmonicSeries(out, sampleRate, timeS, f0, harmonics, amplitudes);
  };
}

/** Bowed cello: dense decaying harmonic series. */
function createCelloGenerator(): PresetGenerator {
  const harmonics = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const amplitudes = [1, 0.85, 0.7, 0.58, 0.48, 0.4, 0.33, 0.27, 0.22, 0.18];
  return createMelodyHarmonicGenerator(CELLO_MELODY_HZ, harmonics, amplitudes);
}

/** Oboe: odd-harmonic emphasis (closed cylindrical pipe). */
function createOboeGenerator(): PresetGenerator {
  const harmonics = [1, 3, 5, 7, 9];
  const amplitudes = [1, 0.75, 0.5, 0.32, 0.2];
  return createMelodyHarmonicGenerator(OBOE_MELODY_HZ, harmonics, amplitudes);
}

const INSTRUMENT_SYNTHETIC_GENERATORS: Record<string, () => PresetGenerator> = {
  cello: createCelloGenerator,
  oboe: createOboeGenerator,
};

/** Returns a synthesized generator for the given preset id, if one exists. */
function createSyntheticGenerator(presetId: string): PresetGenerator | undefined {
  return INSTRUMENT_SYNTHETIC_GENERATORS[presetId]?.() ?? createVoiceSyntheticGenerator(presetId);
}

/** Web Audio source for a synthesized preset. */
export function createSyntheticSource(presetId: string, fftSize: number): SyntheticWebAudioSource | undefined {
  const generate = createSyntheticGenerator(presetId);
  return generate ? new SyntheticWebAudioSource(generate, fftSize) : undefined;
}
