/**
 * YinPitchDetector.ts
 *
 * Fundamental-frequency (F0) estimation via the YIN algorithm.
 * Ported from references/vocal-pitch-monitor/src/engine/AudioEngine.ts, with an
 * added F0 search-range restriction so sub-harmonics outside the configured
 * band are not selected.
 *
 * Pipeline: RMS silence gate → difference function → cumulative mean normalized
 * difference (CMND) → absolute-threshold valley → parabolic interpolation. Each
 * stage is a small helper run once per frame. When no lag crosses the threshold
 * the fallback breaks near-ties toward the shortest lag, so a noisy frame reports
 * the fundamental rather than one of its sub-harmonics.
 *
 * The difference function is evaluated in O(N log N) via the FFT identity
 *   d[τ] = Σ_i x[i]² + Σ_i x[i+τ]² − 2·Σ_i x[i]·x[i+τ]
 * where the cross-correlation term is the inverse FFT of conj(F)·G. The naive
 * double loop is O(N²) and dominated this analyzer's per-frame cost.
 */
import { Fft } from "./Fft.js";
import { rms } from "./SignalUtils.js";
import type { PitchResult } from "./types.js";

export interface PitchOptions {
  readonly sampleRate: number;
  readonly minFrequencyHz: number;
  readonly maxFrequencyHz: number;
  /** CMND acceptance threshold (YIN default 0.15). Lower = stricter. */
  readonly threshold: number;
  /** RMS below this is treated as silence (unvoiced). */
  readonly silenceThreshold: number;
}

/** Above this CMND minimum, even the best lag is deemed unvoiced. */
const APERIODICITY_REJECT = 0.8;

/**
 * How much worse than the deepest valley a shorter lag may be and still be
 * preferred, when no lag crosses the absolute threshold.
 *
 * A noisy frame lifts the whole CMND curve, so the valleys at τ0, 2τ0, 3τ0 … end
 * up within a few percent of each other (measured: 0.293 / 0.278 / 0.313 for one
 * mic-like frame). Taking the deepest of those is a coin flip that reports f0/2
 * or f0/3 whenever a sub-multiple wins by a hair. Every one of those valleys is a
 * true period of the signal; the fundamental is the shortest of them, so a
 * near-tie is broken toward the shortest lag rather than the deepest valley.
 */
const SUBHARMONIC_TOLERANCE = 1.2;

/** Shortest lag whose CMND is meaningful; below this the normalization is noise. */
const MIN_MEANINGFUL_LAG = 3;

export class YinPitchDetector {
  /** Analysis frame length N; the difference function spans lags 0..N/2. */
  private frameSize: number;
  private yinBuffer: Float32Array;
  // Cross-correlation via FFT runs on a 2N buffer so linear (non-circular) lags
  // up to N/2 never wrap around. All buffers below have that length.
  private fft: Fft;
  private corrRefRe: Float32Array;
  private corrRefIm: Float32Array;
  private corrFullRe: Float32Array;
  private corrFullIm: Float32Array;
  private corrProductRe: Float32Array;
  private corrProductIm: Float32Array;

  public constructor(bufferSize: number) {
    this.frameSize = bufferSize;
    this.yinBuffer = new Float32Array(bufferSize >> 1);
    const m = bufferSize << 1;
    this.fft = new Fft(m);
    this.corrRefRe = new Float32Array(m);
    this.corrRefIm = new Float32Array(m);
    this.corrFullRe = new Float32Array(m);
    this.corrFullIm = new Float32Array(m);
    this.corrProductRe = new Float32Array(m);
    this.corrProductIm = new Float32Array(m);
  }

  /** Resizes the internal scratch buffers when the analysis frame size changes. */
  public setBufferSize(bufferSize: number): void {
    if (this.frameSize === bufferSize) {
      return;
    }
    this.frameSize = bufferSize;
    this.yinBuffer = new Float32Array(bufferSize >> 1);
    const m = bufferSize << 1;
    this.fft = new Fft(m);
    this.corrRefRe = new Float32Array(m);
    this.corrRefIm = new Float32Array(m);
    this.corrFullRe = new Float32Array(m);
    this.corrFullIm = new Float32Array(m);
    this.corrProductRe = new Float32Array(m);
    this.corrProductIm = new Float32Array(m);
  }

  public detect(signal: Float32Array, options: PitchOptions): PitchResult {
    if (signal.length !== this.frameSize) {
      this.setBufferSize(signal.length);
    }
    const half = signal.length >> 1;
    const rmsLevel = rms(signal);
    if (rmsLevel < options.silenceThreshold) {
      return { frequencyHz: 0, confidence: 0, rms: rmsLevel };
    }

    const tauMin = Math.max(2, Math.floor(options.sampleRate / options.maxFrequencyHz));
    const tauMax = Math.min(half - 1, Math.ceil(options.sampleRate / options.minFrequencyHz));
    if (tauMax <= tauMin) {
      return { frequencyHz: 0, confidence: 0, rms: rmsLevel };
    }

    this.differenceFunction(signal, half);
    this.cumulativeMeanNormalize(half);

    let tau = this.thresholdLag(options.threshold, tauMin, tauMax);
    let aperiodicity: number;
    if (tau < 0) {
      const minimum = this.shortestNearMinimumLag(tauMin, tauMax);
      if (minimum.tau < 0 || minimum.value > APERIODICITY_REJECT) {
        return { frequencyHz: 0, confidence: 0, rms: rmsLevel };
      }
      tau = minimum.tau;
      aperiodicity = minimum.value;
    } else {
      aperiodicity = this.yinBuffer[tau] ?? 1;
    }

    // The lag search is confined to the band, so a source pitched above it would
    // otherwise be reported as one of its own multiples at full confidence.
    if (this.isMultipleOfAnOutOfBandPeriod(tau, tauMin, options.threshold)) {
      return { frequencyHz: 0, confidence: 0, rms: rmsLevel };
    }

    const frequencyHz = options.sampleRate / this.refineLag(tau, half);
    if (frequencyHz < options.minFrequencyHz || frequencyHz > options.maxFrequencyHz) {
      return { frequencyHz: 0, confidence: 0, rms: rmsLevel };
    }
    return { frequencyHz, confidence: Math.max(0, Math.min(1, 1 - aperiodicity)), rms: rmsLevel };
  }

  /**
   * Squared difference function d[τ] = Σ_{i<half} (x[i] − x[i+τ])², for τ in
   * 0..half. Expanded into a constant power term, a sliding power term, and an
   * FFT-computed cross-correlation so the whole stage is O(N log N).
   */
  private differenceFunction(signal: Float32Array, half: number): void {
    const correlation = this.crossCorrelation(signal, half);

    // powerTerm = Σ_{i<half} x[i]²  (constant across τ). for...of over the view
    // yields `number`, so no per-element guard is needed in this hot loop.
    let powerTerm = 0;
    for (const x of signal.subarray(0, half)) {
      powerTerm += x * x;
    }

    const yin = this.yinBuffer;
    // cumPower[τ] = Σ_{i=τ}^{τ+half-1} x[i]², maintained as a sliding window.
    let cumPower = powerTerm;
    yin[0] = Math.max(0, powerTerm + cumPower - 2 * (correlation[0] ?? 0));
    for (let tau = 1; tau < half; tau++) {
      const leaving = signal[tau - 1] ?? 0;
      const entering = signal[tau + half - 1] ?? 0;
      cumPower += entering * entering - leaving * leaving;
      // Floating-point cancellation can push a near-zero difference slightly
      // negative; clamp so the CMND and threshold logic stay well-behaved.
      yin[tau] = Math.max(0, powerTerm + cumPower - 2 * (correlation[tau] ?? 0));
    }
  }

  /**
   * corr[τ] = Σ_{i<half} x[i]·x[i+τ] for τ in 0..half, via inverse FFT of
   * conj(F)·G on a 2N buffer (zero-padded so the lags do not wrap). Returns the
   * real part buffer; only indices 0..half are meaningful.
   */
  private crossCorrelation(signal: Float32Array, half: number): Float32Array {
    const refRe = this.corrRefRe;
    const refIm = this.corrRefIm;
    const fullRe = this.corrFullRe;
    const fullIm = this.corrFullIm;
    refRe.fill(0);
    refIm.fill(0);
    fullRe.fill(0);
    fullIm.fill(0);
    // Reference window = first half; full window = the whole frame.
    for (let i = 0; i < half; i++) {
      refRe[i] = signal[i] ?? 0;
    }
    for (let i = 0; i < signal.length; i++) {
      fullRe[i] = signal[i] ?? 0;
    }
    this.fft.forward(refRe, refIm);
    this.fft.forward(fullRe, fullIm);

    const productRe = this.corrProductRe;
    const productIm = this.corrProductIm;
    for (let k = 0; k < productRe.length; k++) {
      const fr = refRe[k] ?? 0;
      const fi = refIm[k] ?? 0;
      const gr = fullRe[k] ?? 0;
      const gi = fullIm[k] ?? 0;
      // conj(F)·G = (fr − i·fi)·(gr + i·gi)
      productRe[k] = fr * gr + fi * gi;
      productIm[k] = fr * gi - fi * gr;
    }
    this.fft.inverse(productRe, productIm);
    return productRe;
  }

  /** Cumulative mean normalized difference, in place over the YIN buffer. */
  private cumulativeMeanNormalize(half: number): void {
    const yin = this.yinBuffer;
    yin[0] = 1;
    let runningSum = 0;
    for (let tau = 1; tau < half; tau++) {
      runningSum += yin[tau] ?? 0;
      yin[tau] = runningSum > 0 ? (yin[tau] ?? 0) * (tau / runningSum) : 1;
    }
  }

  /** First lag below `threshold` (valley-followed) within the band, or -1. */
  private thresholdLag(threshold: number, tauMin: number, tauMax: number): number {
    const yin = this.yinBuffer;
    for (let t = tauMin; t <= tauMax; t++) {
      if ((yin[t] ?? 1) < threshold) {
        let best = t;
        while (best + 1 <= tauMax && (yin[best + 1] ?? 1) < (yin[best] ?? 1)) {
          best++;
        }
        return best;
      }
    }
    return -1;
  }

  /**
   * Fallback lag when nothing crosses the absolute threshold: the shortest lag
   * that is within {@link SUBHARMONIC_TOLERANCE} of the band's deepest CMND
   * valley, which is the deepest valley itself unless a sub-multiple of the true
   * period happened to dip slightly lower. See {@link SUBHARMONIC_TOLERANCE}.
   */
  private shortestNearMinimumLag(tauMin: number, tauMax: number): { tau: number; value: number } {
    const yin = this.yinBuffer;
    const best = this.globalMinimum(tauMin, tauMax);
    if (best.tau < 0) {
      return best;
    }
    const ceiling = best.value * SUBHARMONIC_TOLERANCE;
    for (let t = tauMin; t < best.tau; t++) {
      const v = yin[t] ?? Number.POSITIVE_INFINITY;
      // Only a valley qualifies: a point part-way down a slope is not a period,
      // and accepting one would bias every estimate toward tauMin.
      if (
        v <= ceiling &&
        v <= (yin[t - 1] ?? Number.POSITIVE_INFINITY) &&
        v <= (yin[t + 1] ?? Number.POSITIVE_INFINITY)
      ) {
        return { tau: t, value: v };
      }
    }
    return best;
  }

  /** Global CMND minimum within the band. */
  private globalMinimum(tauMin: number, tauMax: number): { tau: number; value: number } {
    const yin = this.yinBuffer;
    let tau = -1;
    let value = Number.POSITIVE_INFINITY;
    for (let t = tauMin; t <= tauMax; t++) {
      const v = yin[t] ?? Number.POSITIVE_INFINITY;
      if (v < value) {
        value = v;
        tau = t;
      }
    }
    return { tau, value };
  }

  /**
   * Whether the signal is also periodic at a sub-multiple of `tau` lying below
   * the search band — that is, whether `tau` is a multiple of a real period the
   * band is too narrow to reach.
   *
   * A signal genuinely periodic at `tau` is not periodic at `tau`/2 or `tau`/3,
   * so a valley there means the true fundamental is above maxFrequencyHz and
   * `tau` is an artifact of where the search had to stop. Reporting it would be
   * wrong by an exact integer factor, which reads as a real pitch rather than as
   * a failure; the caller reports no pitch instead.
   */
  private isMultipleOfAnOutOfBandPeriod(tau: number, tauMin: number, threshold: number): boolean {
    const yin = this.yinBuffer;
    // A sub-multiple counts as a real period if it is nearly as good as the lag
    // we chose, or good enough to have been accepted on its own. The second test
    // carries a clean tone, where both CMND values sit near zero and their ratio
    // stops meaning anything.
    const ceiling = Math.max((yin[tau] ?? 1) * SUBHARMONIC_TOLERANCE, threshold);
    for (let k = 2; tau / k >= MIN_MEANINGFUL_LAG; k++) {
      const submultiple = tau / k;
      if (submultiple >= tauMin) {
        // Still inside the band, where the lag search already had its say.
        continue;
      }
      // tau/k rarely lands exactly on the shorter period's sample index.
      for (let t = Math.floor(submultiple); t <= Math.ceil(submultiple); t++) {
        if (t >= MIN_MEANINGFUL_LAG && (yin[t] ?? 1) <= ceiling) {
          return true;
        }
      }
    }
    return false;
  }

  /** Parabolic interpolation around `tau` for sub-sample lag accuracy. */
  private refineLag(tau: number, half: number): number {
    if (tau <= 0 || tau >= half - 1) {
      return tau;
    }
    const yin = this.yinBuffer;
    const x0 = yin[tau - 1] ?? 0;
    const x1 = yin[tau] ?? 0;
    const x2 = yin[tau + 1] ?? 0;
    const a = (x0 - 2 * x1 + x2) / 2;
    const b = (x2 - x0) / 2;
    return a !== 0 ? tau - b / (2 * a) : tau;
  }
}
