/**
 * WaveComposerConstants.ts
 *
 * Shared layout, range, and font constants for the view layer. Keeping these in
 * one place means the two screens stay visually consistent and the display
 * ranges (dB floors, time windows, quefrency band) are easy to tune.
 *
 * Colors live in WaveComposerColors.ts and display text lives in the i18n JSON — never
 * here.
 */
import { Range } from "scenerystack/dot";
import { PhetFont } from "scenerystack/scenery-phet";
import WaveComposerNamespace from "./WaveComposerNamespace.js";

export const WaveComposerConstants = {
  /** Margin between screen edges and panels/buttons (layout-bounds units). */
  SCREEN_MARGIN: 20,
  /** Gap between stacked panels / nodes. */
  SPACING: 10,
  /** Inner padding for control/readout panels. */
  PANEL_X_MARGIN: 12,
  PANEL_Y_MARGIN: 12,
  CORNER_RADIUS: 6,

  // ── Spectrum analyzer (instantaneous FFT) ────────────────────────────────
  /** dB range for the spectrum y-axis and the spectrogram color mapping. */
  SPECTRUM_MIN_DB: -100,
  SPECTRUM_MAX_DB: 0,
  /** Narrower band used to map spectrogram intensity → colormap (clips floor/ceiling). */
  SPECTROGRAM_MIN_DB: -90,
  SPECTROGRAM_MAX_DB: -20,

  // ── Waveform oscilloscope ─────────────────────────────────────────────────
  WAVEFORM_AMPLITUDE: 1,
  DEFAULT_TIME_WINDOW_MS: 30,
  TIME_WINDOW_MS_RANGE: new Range(10, 100),

  // ── Cepstrum ──────────────────────────────────────────────────────────────
  /** Quefrency display band (ms): F0 60–800 Hz → 1.25–16.7 ms, padded a little. */
  CEPSTRUM_MIN_MS: 1,
  CEPSTRUM_MAX_MS: 20,

  // ── Spectrogram ───────────────────────────────────────────────────────────
  /** Number of time columns kept in the scrolling history. */
  SPECTROGRAM_HISTORY_COLUMNS: 300,

  // ── Vowel plot (F1×F2) ────────────────────────────────────────────────────
  /** Axes are inverted so the layout matches the conventional vowel quadrilateral. */
  VOWEL_F1_RANGE: new Range(200, 1000), // y-axis (inverted)
  VOWEL_F2_RANGE: new Range(600, 2800), // x-axis (inverted)

  // ── Fonts ─────────────────────────────────────────────────────────────────
  TITLE_FONT: new PhetFont({ size: 14, weight: "bold" }),
  PANEL_TITLE_FONT: new PhetFont({ size: 13, weight: "bold" }),
  LABEL_FONT: new PhetFont(12),
  CONTROL_FONT: new PhetFont(12),
  AXIS_LABEL_FONT: new PhetFont({ size: 11, weight: "bold" }),
  TICK_FONT: new PhetFont(9),
  READOUT_VALUE_FONT: new PhetFont({ size: 16, weight: "bold" }),
  READOUT_LABEL_FONT: new PhetFont(11),
  VOWEL_LABEL_FONT: new PhetFont({ size: 13, weight: "bold" }),
} as const;

/** Corner radius shared by themed panels (px). */
export const PANEL_CORNER_RADIUS = WaveComposerConstants.CORNER_RADIUS;

WaveComposerNamespace.register("WaveComposerConstants", {
  WaveComposerConstants,
  PANEL_CORNER_RADIUS,
});
