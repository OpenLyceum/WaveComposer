/**
 * voicePresets.ts
 *
 * Synthesized singing and phonetics demos for the Voice & Vowels screen. Formant
 * targets follow typical adult-male values; consonants illustrate fricative noise,
 * plosive bursts, and voiced nasals described in the user-facing spectral guide.
 */
import type { PresetGenerator } from "./PresetFrameSource.js";
import { generateVowel, generateWhiteNoise } from "./SyntheticFrameSource.js";

const AMPLITUDE = 0.7;
const VIBRATO_RATE_HZ = 5.5;
const VIBRATO_DEPTH = 0.025;
const VOWEL_HOLD_S = 0.85;
const SINGING_NOTE_S = 0.7;

type VowelSpec = {
  readonly formantsHz: readonly number[];
  readonly bandwidthsHz: readonly number[];
};

const VOWEL_SPECS: Record<string, VowelSpec> = {
  vowelUh: { formantsHz: [500, 1500, 2500, 3500], bandwidthsHz: [80, 90, 120, 130] },
  vowelOh: { formantsHz: [500, 1000, 2500, 3500], bandwidthsHz: [80, 90, 120, 130] },
  vowelAy: { formantsHz: [660, 1700, 2400, 3400], bandwidthsHz: [80, 100, 120, 130] },
  vowelEr: { formantsHz: [500, 1500, 2400, 3400], bandwidthsHz: [90, 110, 120, 130] },
  vowelIh: { formantsHz: [280, 2250, 3000, 3600], bandwidthsHz: [80, 100, 120, 130] },
  vowelOo: { formantsHz: [300, 870, 2400, 3400], bandwidthsHz: [80, 90, 120, 130] },
};

const NASAL_M: VowelSpec = { formantsHz: [280, 1000, 2200, 3000], bandwidthsHz: [90, 120, 130, 140] };
const NASAL_N: VowelSpec = { formantsHz: [280, 1700, 2400, 3200], bandwidthsHz: [90, 110, 120, 130] };

const F0_SPEECH_HZ = 120;
const F0_SOPRANO_HZ = 440;
const SOPRANO_MELODY_HZ = [440, 494, 554, 659, 554, 494];
const SINGING_MELODY_HZ = [220, 261.63, 329.63, 392.0, 329.63, 261.63];
const AH_FORMANTS_HZ = [730, 1090, 2440, 3400];
const AH_BANDWIDTHS_HZ = [80, 90, 120, 130];

function sustainedVowelGenerator(spec: VowelSpec, f0Hz = F0_SPEECH_HZ): PresetGenerator {
  return (out, sampleRate) => {
    out.set(generateVowel(spec.formantsHz, spec.bandwidthsHz, f0Hz, sampleRate, out.length, AMPLITUDE));
  };
}

function cyclingVowelGenerator(specs: readonly VowelSpec[], f0Hz = F0_SPEECH_HZ): PresetGenerator {
  return (out, sampleRate, timeS) => {
    const index = Math.floor(timeS / VOWEL_HOLD_S) % specs.length;
    const spec = specs[index] ?? specs[0];
    if (!spec) {
      return;
    }
    out.set(generateVowel(spec.formantsHz, spec.bandwidthsHz, f0Hz, sampleRate, out.length, AMPLITUDE));
  };
}

function fricativeGenerator(seed: number, amplitude = 0.55): PresetGenerator {
  return (out) => {
    out.set(generateWhiteNoise(out.length, amplitude, seed));
  };
}

/** Short noise burst followed by silence (plosive release). */
function plosiveGenerator(seed: number): PresetGenerator {
  const periodS = 0.45;
  const burstS = 0.04;
  return (out, _sampleRate, timeS) => {
    out.fill(0);
    const phase = timeS % periodS;
    if (phase < burstS) {
      const burst = generateWhiteNoise(out.length, 0.85, seed + Math.floor(timeS / periodS));
      const attack = Math.min(1, phase / 0.008);
      const decay = Math.max(0, 1 - phase / burstS);
      for (let i = 0; i < out.length; i++) {
        out[i] = (burst[i] ?? 0) * attack * decay;
      }
    }
  };
}

function createSingingGenerator(): PresetGenerator {
  return (out, sampleRate, timeS) => {
    const noteIndex = Math.floor(timeS / SINGING_NOTE_S) % SINGING_MELODY_HZ.length;
    const baseF0 = SINGING_MELODY_HZ[noteIndex] ?? SINGING_MELODY_HZ[0] ?? 220;
    const f0 = baseF0 * (1 + VIBRATO_DEPTH * Math.sin(2 * Math.PI * VIBRATO_RATE_HZ * timeS));
    out.set(generateVowel(AH_FORMANTS_HZ, AH_BANDWIDTHS_HZ, f0, sampleRate, out.length, AMPLITUDE));
  };
}

function createSingingVibratoGenerator(): PresetGenerator {
  return (out, sampleRate, timeS) => {
    const f0 = 280 * (1 + VIBRATO_DEPTH * Math.sin(2 * Math.PI * VIBRATO_RATE_HZ * timeS));
    out.set(generateVowel(AH_FORMANTS_HZ, AH_BANDWIDTHS_HZ, f0, sampleRate, out.length, AMPLITUDE));
  };
}

function createSopranoScaleGenerator(): PresetGenerator {
  return (out, sampleRate, timeS) => {
    const noteIndex = Math.floor(timeS / SINGING_NOTE_S) % SOPRANO_MELODY_HZ.length;
    const f0 = SOPRANO_MELODY_HZ[noteIndex] ?? F0_SOPRANO_HZ;
    // High-note "soprano tuning": boost F1 toward f0 for resonance demo.
    const f1 = Math.min(f0 * 0.95, 700);
    const formants = [f1, 2100, 2800, 3600];
    out.set(generateVowel(formants, AH_BANDWIDTHS_HZ, f0, sampleRate, out.length, AMPLITUDE));
  };
}

function createVowelArpeggioGenerator(): PresetGenerator {
  const ah: VowelSpec = { formantsHz: AH_FORMANTS_HZ, bandwidthsHz: AH_BANDWIDTHS_HZ };
  const ee: VowelSpec = { formantsHz: [280, 2250, 3000, 3600], bandwidthsHz: [80, 100, 120, 130] };
  const oo = VOWEL_SPECS["vowelOo"] ?? ah;
  return cyclingVowelGenerator([ah, ee, VOWEL_SPECS["vowelIh"] ?? ee, oo, VOWEL_SPECS["vowelUh"] ?? ah]);
}

const VOICE_SYNTHETIC_GENERATORS: Record<string, () => PresetGenerator> = {
  vowelUh: () => sustainedVowelGenerator(VOWEL_SPECS["vowelUh"] ?? NASAL_M),
  vowelOh: () => sustainedVowelGenerator(VOWEL_SPECS["vowelOh"] ?? NASAL_M),
  vowelAy: () => sustainedVowelGenerator(VOWEL_SPECS["vowelAy"] ?? NASAL_M),
  vowelEr: () => sustainedVowelGenerator(VOWEL_SPECS["vowelEr"] ?? NASAL_M),
  vowelIh: () => sustainedVowelGenerator(VOWEL_SPECS["vowelIh"] ?? NASAL_M),
  vowelOo: () => sustainedVowelGenerator(VOWEL_SPECS["vowelOo"] ?? NASAL_M),
  consonantM: () => sustainedVowelGenerator(NASAL_M),
  consonantN: () => sustainedVowelGenerator(NASAL_N),
  consonantS: () => fricativeGenerator(0x5a5a),
  consonantSh: () => fricativeGenerator(0x5a5b, 0.5),
  consonantF: () => fricativeGenerator(0x5a5c, 0.4),
  consonantP: () => plosiveGenerator(0x7001),
  consonantT: () => plosiveGenerator(0x7002),
  consonantB: () => plosiveGenerator(0x7003),
  singing: createSingingGenerator,
  singingVibrato: createSingingVibratoGenerator,
  sopranoScale: createSopranoScaleGenerator,
  vowelArpeggio: createVowelArpeggioGenerator,
};

/** Voice/phonetics synthesizer for a preset id, if defined here. */
export function createVoiceSyntheticGenerator(presetId: string): PresetGenerator | undefined {
  return VOICE_SYNTHETIC_GENERATORS[presetId]?.();
}
