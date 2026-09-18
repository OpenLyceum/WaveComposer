import { describe, expect, it } from "vitest";
import { generateSine, generateWhiteNoise } from "../../../../src/common/model/audio/SyntheticFrameSource.js";
import type { PitchOptions } from "../../../../src/common/model/dsp/YinPitchDetector.js";
import { YinPitchDetector } from "../../../../src/common/model/dsp/YinPitchDetector.js";

const SAMPLE_RATE = 44100;
const FRAME = 4096;

const options: PitchOptions = {
  sampleRate: SAMPLE_RATE,
  minFrequencyHz: 60,
  maxFrequencyHz: 800,
  threshold: 0.15,
  silenceThreshold: 1e-4,
};

/**
 * Deterministic LCG, so a noise-robustness expectation cannot fail on one run in
 * twenty. Any fixed seed exercises the same code path a real noisy frame does.
 */
function seededNoise(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000 - 0.5;
  };
}

/** Harmonic-rich tone (1/n rolloff) plus broadband noise, as a microphone delivers. */
function noisyHarmonicTone(f0: number, sampleRate: number, n: number, noiseAmp: number, seed: number): Float32Array {
  const rand = seededNoise(seed);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let sample = 0;
    for (let h = 1; h * f0 < sampleRate / 2 && h <= 20; h++) {
      sample += Math.sin((2 * Math.PI * h * f0 * i) / sampleRate) / h;
    }
    out[i] = 0.2 * sample + noiseAmp * 2 * rand();
  }
  return out;
}

describe("YinPitchDetector", () => {
  it("detects the pitch of pure sine tones within ~1 Hz", () => {
    const detector = new YinPitchDetector(FRAME);
    for (const freq of [110, 220, 440]) {
      const result = detector.detect(generateSine(freq, SAMPLE_RATE, FRAME), options);
      expect(Math.abs(result.frequencyHz - freq)).toBeLessThan(1);
      expect(result.confidence).toBeGreaterThan(0.8);
    }
  });

  it("reports silence as unvoiced", () => {
    const detector = new YinPitchDetector(FRAME);
    const result = detector.detect(new Float32Array(FRAME), options);
    expect(result.frequencyHz).toBe(0);
    expect(result.confidence).toBe(0);
  });

  it("does not report confident pitch for white noise", () => {
    const detector = new YinPitchDetector(FRAME);
    const result = detector.detect(generateWhiteNoise(FRAME, 0.5), options);
    expect(result.frequencyHz === 0 || result.confidence < 0.5).toBe(true);
  });

  it("survives a frame-size change via setBufferSize", () => {
    const detector = new YinPitchDetector(FRAME);
    detector.setBufferSize(2048);
    const result = detector.detect(generateSine(200, SAMPLE_RATE, 2048), options);
    expect(Math.abs(result.frequencyHz - 200)).toBeLessThan(2);
  });
  // Regression: a noisy frame lifts the CMND curve so nothing crosses the absolute
  // threshold, and the valleys at t0, 2*t0, 3*t0 land within a few percent of each
  // other. Picking the deepest of those reported f0/2 or f0/3 on live microphone
  // input while the clean presets stayed correct.
  it("does not fall to a sub-harmonic when noise stops the threshold being crossed", () => {
    for (const frame of [1024, 2048, 4096]) {
      const detector = new YinPitchDetector(frame);
      for (const freq of [110, 196, 220, 440]) {
        for (const seed of [1, 7, 12345]) {
          const signal = noisyHarmonicTone(freq, SAMPLE_RATE, frame, 0.2, seed);
          const { frequencyHz } = detector.detect(signal, options);
          expect(frequencyHz / freq).toBeGreaterThan(0.9);
          expect(frequencyHz / freq).toBeLessThan(1.1);
        }
      }
    }
  });

  // Regression: the lag search is confined to [sampleRate/maxFrequencyHz,
  // sampleRate/minFrequencyHz], so for a tone above the band the shortest lag in
  // range is already the 2nd or 3rd multiple of the real period. That came back
  // as an exact half or third at full confidence rather than as a failure.
  it("reports a tone above the search band as unpitched, not as a sub-harmonic", () => {
    const detector = new YinPitchDetector(FRAME);
    for (const freq of [1000, 1500, 2000, 2500]) {
      const result = detector.detect(generateSine(freq, SAMPLE_RATE, FRAME), options);
      expect(result.frequencyHz).toBe(0);
    }
  });

  it("detects whistle-range tones when the search band reaches them", () => {
    const detector = new YinPitchDetector(FRAME);
    const wideOptions: PitchOptions = { ...options, maxFrequencyHz: 5000 };
    for (const freq of [1000, 1500, 2000, 2500]) {
      const result = detector.detect(generateSine(freq, SAMPLE_RATE, FRAME), wideOptions);
      expect(Math.abs(result.frequencyHz - freq) / freq).toBeLessThan(0.01);
    }
  });

  it("leaves in-band pitches alone when the band is widened", () => {
    const detector = new YinPitchDetector(FRAME);
    const wideOptions: PitchOptions = { ...options, maxFrequencyHz: 5000 };
    for (const freq of [110, 220, 440]) {
      const result = detector.detect(generateSine(freq, SAMPLE_RATE, FRAME), wideOptions);
      expect(Math.abs(result.frequencyHz - freq)).toBeLessThan(1);
    }
  });
});
