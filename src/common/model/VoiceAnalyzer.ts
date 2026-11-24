/**
 * VoiceAnalyzer.ts
 *
 * Pure per-frame orchestrator that wires the DSP modules into a single analysis
 * pass. It owns all reusable scratch/output buffers and the FFT/YIN instances so
 * `analyze()` does no large allocation per frame (only a small result wrapper and
 * the formant list). It has no SceneryStack dependencies, which keeps it fully
 * unit-testable with synthetic signals.
 *
 * Pipeline per frame:
 *   raw frame ─▶ YIN ─▶ F0 + confidence
 *             ─▶ window ─▶ FFT power spectrum (dB)
 *                       └▶ real cepstrum ─▶ CPP
 *             ─▶ pre-emphasis ─▶ window ─▶ autocorr ─▶ LPC ─▶ formants + envelope
 *             ─▶ autocorr ─▶ HNR
 */
import { autocorrelate } from "./dsp/Autocorrelation.js";
import { Decimator } from "./dsp/Decimator.js";
import { Fft } from "./dsp/Fft.js";
import { computeLpcEnvelope, extractFormants } from "./dsp/FormantAnalyzer.js";
import { levinsonDurbin } from "./dsp/LinearPredictor.js";
import { preEmphasis } from "./dsp/SignalUtils.js";
import type { FormantData, PitchResult } from "./dsp/types.js";
import { cepstralPeakProminence, computeRealCepstrum, harmonicToNoiseRatio } from "./dsp/VoiceQuality.js";
import { applyWindow, createGaussianWindow, createWindow, type WindowType } from "./dsp/WindowFunction.js";
import { YinPitchDetector } from "./dsp/YinPitchDetector.js";

export interface AnalyzerConfig {
  readonly sampleRate: number;
  readonly fftSize: number;
  readonly windowType: WindowType;
  readonly lpcOrder: number;
  /** Lower bound of the F0 / voice-quality search band, in Hz. */
  readonly f0MinHz: number;
  /** Upper bound of the F0 / voice-quality search band, in Hz. */
  readonly f0MaxHz: number;
  /** Upper bound for formant frequencies, in Hz (lower bound is fixed). */
  readonly formantMaxHz: number;
}

export interface AnalysisResult {
  readonly pitch: PitchResult;
  readonly formants: readonly FormantData[];
  readonly hnrDb: number;
  readonly cppDb: number;
  readonly rms: number;
  /** Raw time-domain frame, length N. Reused — copy if you must retain it. */
  readonly waveform: Float32Array;
  /** Power spectrum in dB, length N/2. Reused. */
  readonly powerSpectrumDb: Float32Array;
  /** LPC spectral envelope in dB, length N/2. Reused. */
  readonly lpcEnvelopeDb: Float32Array;
  /** Real cepstrum, length N. Reused. */
  readonly cepstrum: Float32Array;
}

const YIN_THRESHOLD = 0.15;
const SILENCE_RMS = 1e-4;
const FORMANT_MIN_HZ = 90;
const MAX_FORMANTS = 5;
// White-noise correction: lifts the autocorrelation's zero-lag term slightly so
// the Levinson recursion stays well-conditioned on near-singular (strongly
// band-limited) voice frames.
const LPC_REGULARIZATION = 1e-5;
// Target rate the formant LPC runs at, in Hz. Capture rates are decimated by an
// integer factor to land near this (44.1 kHz → 11.025, 48 kHz → 12). Keeping LPC
// near ~11 kHz concentrates the poles in the formant band, matching the
// reference (in-formant formants.cpp resamples to 11 kHz). See Decimator.
const FORMANT_LPC_RATE_HZ = 11025;
// High-pass pre-emphasis corner, in Hz: alpha = exp(-2π·f/fs) (formants.cpp).
const PREEMPH_FREQUENCY_HZ = 200;
// Confined-Gaussian window shape for the LPC branch (formants.cpp uses 2.5).
const GAUSSIAN_ALPHA = 2.5;
// Pole-magnitude floor passed to FilteredLP (filteredlp.cpp uses 0.6).
const FORMANT_MIN_RADIUS = 0.6;

/** Integer decimation factor that brings `sampleRate` closest to ~11 kHz. */
function formantDecimation(sampleRate: number): number {
  return Math.max(1, Math.round(sampleRate / FORMANT_LPC_RATE_HZ));
}

export class VoiceAnalyzer {
  private config: AnalyzerConfig;
  private frameBuffers: ReturnType<VoiceAnalyzer["allocateFrameBuffers"]>;
  private lpcAutocorr: Float64Array;
  private hnrAutocorr: Float32Array;
  private hnrMaxLag: number;

  // Formant-branch decimation: LPC runs at `formantSampleRate` (~11 kHz).
  private decimator: Decimator;
  private formantSampleRate: number;
  private preEmphasisAlpha: number;

  public constructor(config: AnalyzerConfig) {
    this.config = config;
    this.frameBuffers = this.allocateFrameBuffers(config);
    this.lpcAutocorr = new Float64Array(config.lpcOrder + 1);
    this.hnrMaxLag = Math.min(config.fftSize - 1, Math.ceil(config.sampleRate / config.f0MinHz));
    this.hnrAutocorr = new Float32Array(this.hnrMaxLag + 1);
    this.preEmphasisAlpha = Math.exp((-2 * Math.PI * PREEMPH_FREQUENCY_HZ) / config.sampleRate);
    const decimation = formantDecimation(config.sampleRate);
    this.decimator = new Decimator(decimation);
    this.formantSampleRate = config.sampleRate / decimation;
  }

  /**
   * (Re)allocates every frame-size-dependent buffer plus the FFT, YIN, and
   * windows. Called from the constructor and whenever the FFT size changes, so
   * the two paths cannot drift out of sync.
   */
  private allocateFrameBuffers({ fftSize: n, windowType }: AnalyzerConfig) {
    const half = n >> 1;
    return {
      fft: new Fft(n),
      yin: new YinPitchDetector(n),
      window: createWindow(windowType, n),
      gaussianWindow: createGaussianWindow(n, GAUSSIAN_ALPHA),

      waveform: new Float32Array(n),
      windowed: new Float32Array(n),
      preEmphasized: new Float32Array(n),
      windowedPreEmphasized: new Float32Array(n),
      decimated: new Float32Array(n),
      powerScratch: new Float32Array(half),
      powerSpectrumDb: new Float32Array(half),
      lpcEnvelopeDb: new Float32Array(half),
      envReScratch: new Float32Array(n),
      envImScratch: new Float32Array(n),
      cepstrumReal: new Float32Array(n),
      cepstrumImag: new Float32Array(n),
    };
  }

  /** The current configuration (read-only snapshot). */
  public get currentConfig(): AnalyzerConfig {
    return this.config;
  }

  /** The analysis frame size in samples. */
  public get frameSize(): number {
    return this.config.fftSize;
  }

  /**
   * Applies a new configuration, rebuilding only what changed (FFT/window on
   * size change, window on type change, autocorrelation buffers on rate change).
   */
  public reconfigure(config: AnalyzerConfig): void {
    const prev = this.config;
    const n = config.fftSize;

    if (config.fftSize !== prev.fftSize) {
      // Rebuilds the FFT, YIN, windows, and every frame-size-dependent buffer.
      this.frameBuffers = this.allocateFrameBuffers(config);
    } else if (config.windowType !== prev.windowType) {
      this.frameBuffers.window = createWindow(config.windowType, n);
    }

    if (config.lpcOrder !== prev.lpcOrder) {
      this.lpcAutocorr = new Float64Array(config.lpcOrder + 1);
    }

    if (config.sampleRate !== prev.sampleRate || config.f0MinHz !== prev.f0MinHz || config.fftSize !== prev.fftSize) {
      this.hnrMaxLag = Math.min(n - 1, Math.ceil(config.sampleRate / config.f0MinHz));
      this.hnrAutocorr = new Float32Array(this.hnrMaxLag + 1);
    }

    if (config.sampleRate !== prev.sampleRate) {
      const decimation = formantDecimation(config.sampleRate);
      this.decimator = new Decimator(decimation);
      this.formantSampleRate = config.sampleRate / decimation;
      this.preEmphasisAlpha = Math.exp((-2 * Math.PI * PREEMPH_FREQUENCY_HZ) / config.sampleRate);
    }

    this.config = config;
  }

  /**
   * Analyzes one time-domain frame (`frame.length` must equal the FFT size) and
   * returns the per-frame results. Returned buffers are reused on the next call.
   */
  public analyze(frame: Float32Array): AnalysisResult {
    if (frame.length !== this.config.fftSize) {
      throw new Error("Frame length must equal the configured FFT size");
    }
    const { sampleRate, lpcOrder, f0MinHz, f0MaxHz, formantMaxHz } = this.config;

    this.frameBuffers.waveform.set(frame);

    // Pitch (YIN) on the raw frame.
    const pitch = this.frameBuffers.yin.detect(frame, {
      sampleRate,
      minFrequencyHz: f0MinHz,
      maxFrequencyHz: f0MaxHz,
      threshold: YIN_THRESHOLD,
      silenceThreshold: SILENCE_RMS,
    });

    // Windowed frame → power spectrum (dB).
    applyWindow(frame, this.frameBuffers.window, this.frameBuffers.windowed);
    this.frameBuffers.fft.powerSpectrum(this.frameBuffers.windowed, this.frameBuffers.powerScratch);
    for (let k = 0; k < this.frameBuffers.powerSpectrumDb.length; k++) {
      this.frameBuffers.powerSpectrumDb[k] = 10 * Math.log10((this.frameBuffers.powerScratch[k] ?? 0) + 1e-12);
    }

    // Real cepstrum (from the windowed frame) → CPP.
    this.frameBuffers.cepstrumReal.set(this.frameBuffers.windowed);
    computeRealCepstrum(this.frameBuffers.fft, this.frameBuffers.cepstrumReal, this.frameBuffers.cepstrumImag);
    const cppDb = cepstralPeakProminence(this.frameBuffers.cepstrumReal, sampleRate, f0MinHz, f0MaxHz);

    // Formant branch: pre-emphasis + Gaussian window → decimate to ~11 kHz →
    // autocorrelation → LPC → formants + envelope. LPC runs at the decimated rate
    // so its poles concentrate in the formant band (see FORMANT_LPC_RATE_HZ).
    const fsLpc = this.formantSampleRate;
    const decimation = this.decimator.factor;
    preEmphasis(frame, this.preEmphasisAlpha, this.frameBuffers.preEmphasized);
    applyWindow(
      this.frameBuffers.preEmphasized,
      this.frameBuffers.gaussianWindow,
      this.frameBuffers.windowedPreEmphasized,
    );
    const decimatedLength = this.decimator.process(
      this.frameBuffers.windowedPreEmphasized,
      this.frameBuffers.decimated,
    );
    autocorrelate(this.frameBuffers.decimated, lpcOrder, this.lpcAutocorr, decimatedLength);
    this.lpcAutocorr[0] = (this.lpcAutocorr[0] ?? 0) * (1 + LPC_REGULARIZATION);
    const lpc = levinsonDurbin(this.lpcAutocorr, lpcOrder);
    const formants = extractFormants(lpc.coefficients, {
      sampleRate: fsLpc,
      maxFormants: MAX_FORMANTS,
      minFrequencyHz: FORMANT_MIN_HZ,
      maxFrequencyHz: Math.min(formantMaxHz, fsLpc / 2),
      minRadius: FORMANT_MIN_RADIUS,
    });
    // Rescale the residual energy to the full-frame sample count so the envelope
    // stays on the same dB scale as the (full-rate) power spectrum it overlays.
    const envelopeGain = decimatedLength > 0 ? (lpc.gain * frame.length) / decimatedLength : lpc.gain;
    computeLpcEnvelope(
      this.frameBuffers.fft,
      lpc.coefficients,
      envelopeGain,
      this.frameBuffers.envReScratch,
      this.frameBuffers.envImScratch,
      this.frameBuffers.lpcEnvelopeDb,
      decimation,
    );

    // Harmonics-to-noise ratio: normalize by (n − lag) so r[τ]/r[0] → 1 for
    // periodic signals regardless of lag length (avoids systematic underestimation
    // at low F0 where τ is large relative to the frame).
    autocorrelate(frame, this.hnrMaxLag, this.hnrAutocorr, frame.length, true);
    const hnrDb = harmonicToNoiseRatio(this.hnrAutocorr, sampleRate, f0MinHz, f0MaxHz);

    return {
      pitch,
      formants,
      hnrDb,
      cppDb,
      rms: pitch.rms,
      waveform: this.frameBuffers.waveform,
      powerSpectrumDb: this.frameBuffers.powerSpectrumDb,
      lpcEnvelopeDb: this.frameBuffers.lpcEnvelopeDb,
      cepstrum: this.frameBuffers.cepstrumReal,
    };
  }
}
