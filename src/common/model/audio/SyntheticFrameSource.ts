/**
 * SyntheticFrameSource.ts
 *
 * Deterministic signal generators used by the unit tests (known pitch / known
 * formants / noise) and handy for manual checks without a microphone.
 *
 * The vowel generator drives a glottal impulse train through a cascade of
 * second-order resonators, so its poles sit exactly at the requested formant
 * frequencies — which is what LPC formant extraction should recover.
 */

/** Small deterministic xorshift PRNG so noise-based tests are reproducible. */
function createRandom(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    // Map to [-1, 1).
    return (state / 0xffffffff) * 2 - 1;
  };
}

/** A pure sine wave of the given frequency and amplitude. */
export function generateSine(
  frequencyHz: number,
  sampleRate: number,
  length: number,
  amplitude = 0.8,
  phase = 0,
): Float32Array {
  const out = new Float32Array(length);
  const omega = (2 * Math.PI * frequencyHz) / sampleRate;
  for (let i = 0; i < length; i++) {
    out[i] = amplitude * Math.sin(omega * i + phase);
  }
  return out;
}

/** Deterministic white noise in [-amplitude, amplitude). */
export function generateWhiteNoise(length: number, amplitude = 0.5, seed = 12345): Float32Array {
  const out = new Float32Array(length);
  const random = createRandom(seed);
  for (let i = 0; i < length; i++) {
    out[i] = amplitude * random();
  }
  return out;
}

/** Excitation source for {@link generateVowel}. */
export const VowelExcitation = {
  /** Periodic glottal impulse train → voiced (has a clear F0). */
  IMPULSE: "impulse",
  /** White noise → unvoiced; yields the cleanest formant envelope for LPC. */
  NOISE: "noise",
} as const;

export type VowelExcitation = (typeof VowelExcitation)[keyof typeof VowelExcitation];

/**
 * Synthesizes a vowel-like signal by passing an excitation source through a
 * cascade of resonators at the given formant frequencies/bandwidths. Output is
 * peak-normalized to `amplitude`.
 *
 * Use `IMPULSE` excitation (the default) for a voiced signal with a clear F0;
 * use `NOISE` for the cleanest formant spectrum (LPC recovers the resonances
 * more reliably without the line spectrum of an impulse train).
 */
export function generateVowel(
  formantsHz: readonly number[],
  bandwidthsHz: readonly number[],
  f0Hz: number,
  sampleRate: number,
  length: number,
  amplitude = 0.8,
  excitation: VowelExcitation = VowelExcitation.IMPULSE,
): Float32Array {
  const out = new Float32Array(length);
  if (excitation === VowelExcitation.NOISE) {
    const random = createRandom(0xc0ffee);
    for (let i = 0; i < length; i++) {
      out[i] = random();
    }
  } else {
    // Glottal source: unit impulses every (sampleRate / f0) samples.
    const period = sampleRate / f0Hz;
    let nextPulse = 0;
    for (let i = 0; i < length; i++) {
      if (i >= nextPulse) {
        out[i] = 1;
        nextPulse += period;
      }
    }
  }

  // Glottal spectral tilt (~ -6 dB/oct): a leaky integrator whose pole matches
  // the analysis pre-emphasis zero, so a realistic voiced spectrum is produced
  // and pre-emphasis leaves a flat excitation for LPC formant estimation.
  let tilt = 0;
  for (let i = 0; i < length; i++) {
    tilt = 0.97 * tilt + (out[i] ?? 0);
    out[i] = tilt;
  }

  // Cascade of 2nd-order resonators: y[n] = x[n] + 2r·cosθ·y[n-1] − r²·y[n-2].
  for (let f = 0; f < formantsHz.length; f++) {
    const freq = formantsHz[f] ?? 0;
    const bandwidth = bandwidthsHz[f] ?? 80;
    const r = Math.exp((-Math.PI * bandwidth) / sampleRate);
    const theta = (2 * Math.PI * freq) / sampleRate;
    const a1 = 2 * r * Math.cos(theta);
    const a2 = -(r * r);
    let y1 = 0;
    let y2 = 0;
    for (let i = 0; i < length; i++) {
      const x = out[i] ?? 0;
      const y = x + a1 * y1 + a2 * y2;
      out[i] = y;
      y2 = y1;
      y1 = y;
    }
  }

  // Peak-normalize.
  let peak = 0;
  for (let i = 0; i < length; i++) {
    const a = Math.abs(out[i] ?? 0);
    if (a > peak) {
      peak = a;
    }
  }
  if (peak > 0) {
    const scale = amplitude / peak;
    for (let i = 0; i < length; i++) {
      out[i] = (out[i] ?? 0) * scale;
    }
  }
  return out;
}
