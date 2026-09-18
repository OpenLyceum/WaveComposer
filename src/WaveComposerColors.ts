/**
 * WaveComposerColors.ts
 *
 * Defines all dynamic colors for the simulation using ProfileColorProperty.
 *
 * Each color has two profiles:
 *   - "default"   — used in standard (dark) mode
 *   - "projector" — used when the user enables Projector Mode in Preferences
 *
 * SceneryStack switches profiles automatically; no manual toggling is needed.
 *
 * ── Usage ─────────────────────────────────────────────────────────────────────
 * Import WaveComposerColors and pass properties directly to Node's fillProperty or
 * strokeProperty options:
 *
 *   import WaveComposerColors from "../../WaveComposerColors.js";
 *
 *   new Rectangle( 0, 0, 100, 50, {
 *     fillProperty: WaveComposerColors.backgroundColorProperty,
 *   });
 *
 * ── How to add a color ────────────────────────────────────────────────────────
 * Add a new ProfileColorProperty entry to the WaveComposerColors object below.
 * Always provide both "default" and "projector" values.
 */
import { ProfileColorProperty } from "scenerystack/scenery";
import WaveComposerNamespace from "./WaveComposerNamespace.js";

const WaveComposerColors = {
  /**
   * Background color for the simulation screen.
   * Deep navy in default mode; white in projector mode.
   */
  backgroundColorProperty: new ProfileColorProperty(WaveComposerNamespace, "background", {
    default: "#1a1a2e",
    projector: "#ffffff",
  }),

  /**
   * Primary accent color for highlights, selected items, and key UI elements.
   * Sky blue in default mode; dark navy in projector mode.
   */
  accentColorProperty: new ProfileColorProperty(WaveComposerNamespace, "accent", {
    default: "#4fc3f7",
    projector: "#1a1a2e",
  }),

  /**
   * Background fill for control panels and dialogs.
   * Deep blue in default mode; light gray in projector mode.
   */
  panelBackgroundColorProperty: new ProfileColorProperty(WaveComposerNamespace, "panelBackground", {
    default: "#16213e",
    projector: "#f5f5f5",
  }),

  /**
   * Border/stroke color for control panels and dialogs.
   * Teal-navy in default mode; medium gray in projector mode.
   */
  panelBorderColorProperty: new ProfileColorProperty(WaveComposerNamespace, "panelBorder", {
    default: "#0f3460",
    projector: "#999999",
  }),

  /**
   * Text color for labels, readouts, and general UI text.
   * Near-white in default mode; near-black in projector mode.
   */
  textColorProperty: new ProfileColorProperty(WaveComposerNamespace, "text", {
    default: "#e0e0e0",
    projector: "#1a1a1a",
  }),

  /** Attention color for transient notices (e.g. mic permission denied). */
  noticeColorProperty: new ProfileColorProperty(WaveComposerNamespace, "notice", {
    default: "#ff8a80",
    projector: "#b00020",
  }),

  // ── Interactive controls (push buttons + combo boxes) ─────────────────────────
  /**
   * Base fill for push buttons and combo-box buttons/lists. Pairs with
   * textColorProperty for the label, so the control reads correctly in both modes:
   * dark blue with light text in default mode, light gray with dark text in
   * projector mode. (The previous accent-blue button base went near-black in
   * projector mode, leaving the black label unreadable.)
   */
  buttonFillColorProperty: new ProfileColorProperty(WaveComposerNamespace, "buttonFill", {
    default: "#243a63",
    projector: "#e0e0e0",
  }),
  /**
   * Fill for a disabled push button (e.g. start/stop while the demo source is
   * selected). Stays dark in default mode so the dimmed light label remains
   * legible; the sun default (light gray) made light-on-light text vanish.
   */
  buttonDisabledFillColorProperty: new ProfileColorProperty(WaveComposerNamespace, "buttonDisabledFill", {
    default: "#2c3450",
    projector: "#d6d6d6",
  }),
  /** Hover/selection highlight for combo-box list items (kept readable behind the label). */
  comboBoxHighlightColorProperty: new ProfileColorProperty(WaveComposerNamespace, "comboBoxHighlight", {
    default: "#35538c",
    projector: "#cdd8ea",
  }),

  // ── Chart chrome ────────────────────────────────────────────────────────────
  /** Plotting-area background (spectrum, waveform, cepstrum, vowel plot). */
  chartBackgroundColorProperty: new ProfileColorProperty(WaveComposerNamespace, "chartBackground", {
    default: "#0d1117",
    projector: "#ffffff",
  }),
  /** Faint grid lines inside charts. */
  gridLineColorProperty: new ProfileColorProperty(WaveComposerNamespace, "gridLine", {
    default: "#2a3550",
    projector: "#dddddd",
  }),
  /** Chart axis lines and tick marks. */
  axisColorProperty: new ProfileColorProperty(WaveComposerNamespace, "axis", {
    default: "#8a97b8",
    projector: "#555555",
  }),

  // ── Spectrum / waveform / cepstrum curves ────────────────────────────────────
  /** Instantaneous FFT magnitude curve. */
  spectrumCurveColorProperty: new ProfileColorProperty(WaveComposerNamespace, "spectrumCurve", {
    default: "#4fc3f7",
    projector: "#1565c0",
  }),
  /** LPC spectral-envelope overlay. */
  lpcEnvelopeColorProperty: new ProfileColorProperty(WaveComposerNamespace, "lpcEnvelope", {
    default: "#ffb74d",
    projector: "#e65100",
  }),
  /** Time-domain oscilloscope trace. */
  waveformColorProperty: new ProfileColorProperty(WaveComposerNamespace, "waveform", {
    default: "#81c784",
    projector: "#2e7d32",
  }),
  /** Cepstrum trace. */
  cepstrumCurveColorProperty: new ProfileColorProperty(WaveComposerNamespace, "cepstrumCurve", {
    default: "#4fc3f7",
    projector: "#1565c0",
  }),
  /** Marker for the detected cepstral peak / harmonic markers. */
  harmonicMarkerColorProperty: new ProfileColorProperty(WaveComposerNamespace, "harmonicMarker", {
    default: "#fff176",
    projector: "#f9a825",
  }),

  // ── Formant palette (Voice & Vowels readouts, screen icons) ───────────────────
  formant1ColorProperty: new ProfileColorProperty(WaveComposerNamespace, "formant1", {
    default: "#ff5252",
    projector: "#c62828",
  }),
  formant2ColorProperty: new ProfileColorProperty(WaveComposerNamespace, "formant2", {
    default: "#69f0ae",
    projector: "#00897b",
  }),
  formant3ColorProperty: new ProfileColorProperty(WaveComposerNamespace, "formant3", {
    default: "#40c4ff",
    projector: "#0277bd",
  }),
  formant4ColorProperty: new ProfileColorProperty(WaveComposerNamespace, "formant4", {
    default: "#e040fb",
    projector: "#8e24aa",
  }),

  // ── Readout indicators ────────────────────────────────────────────────────────
  /** Voiced-state indicator (lit). */
  voicedColorProperty: new ProfileColorProperty(WaveComposerNamespace, "voiced", {
    default: "#69f0ae",
    projector: "#2e7d32",
  }),
  /** Unvoiced/silent indicator. */
  unvoicedColorProperty: new ProfileColorProperty(WaveComposerNamespace, "unvoiced", {
    default: "#546e7a",
    projector: "#b0bec5",
  }),

  // ── Vowel plot ─────────────────────────────────────────────────────────────────
  /** Reference IPA vowel markers + labels. */
  vowelReferenceColorProperty: new ProfileColorProperty(WaveComposerNamespace, "vowelReference", {
    default: "#90a4ae",
    projector: "#607d8b",
  }),
  /** The live, measured vowel position. */
  vowelCurrentColorProperty: new ProfileColorProperty(WaveComposerNamespace, "vowelCurrent", {
    default: "#ffca28",
    projector: "#ef6c00",
  }),

  // ── Composer partials ─────────────────────────────────────────────────────────
  // One identity color per partial, shared by its swatch in the Compose panel and
  // its component trace in the waveform chart, so a slider can be read straight
  // off the curve it moves. Kept clear of the summed-waveform green.
  partial1ColorProperty: new ProfileColorProperty(WaveComposerNamespace, "partial1", {
    default: "#64b5f6",
    projector: "#1565c0",
  }),
  partial2ColorProperty: new ProfileColorProperty(WaveComposerNamespace, "partial2", {
    default: "#ba68c8",
    projector: "#6a1b9a",
  }),
  partial3ColorProperty: new ProfileColorProperty(WaveComposerNamespace, "partial3", {
    default: "#4dd0e1",
    projector: "#00838f",
  }),
  partial4ColorProperty: new ProfileColorProperty(WaveComposerNamespace, "partial4", {
    default: "#f06292",
    projector: "#ad1457",
  }),

  // ── Wave-physics overlays ─────────────────────────────────────────────────────
  /** Shaded bands for allowed harmonics on the spectrum. */
  allowedHarmonicBandColorProperty: new ProfileColorProperty(WaveComposerNamespace, "allowedHarmonicBand", {
    default: "#4fc3f7",
    projector: "#90caf9",
  }),
  /** 1D standing-wave mode curve. */
  standingWaveColorProperty: new ProfileColorProperty(WaveComposerNamespace, "standingWave", {
    default: "#ffab91",
    projector: "#d84315",
  }),
  /** Source–filter diagram accents on the Voice screen. */
  sourceFilterColorProperty: new ProfileColorProperty(WaveComposerNamespace, "sourceFilter", {
    default: "#ce93d8",
    projector: "#7b1fa2",
  }),
  /** Live resonance-tuning indicator. */
  resonanceTuningColorProperty: new ProfileColorProperty(WaveComposerNamespace, "resonanceTuning", {
    default: "#ffd54f",
    projector: "#f9a825",
  }),

  // ── Light control surfaces ───────────────────────────────────────────────────
  // White chrome (combo boxes, flat push buttons, editable input fields) stays light
  // in both profiles; its text stays dark. Same values in default and projector mode,
  // but defined here so every color lives in one themeable place.

  /** Fill of light control surfaces: combo-box button/list, editable input fields. */
  controlSurfaceColorProperty: new ProfileColorProperty(WaveComposerNamespace, "controlSurface", {
    default: "#ffffff",
    projector: "#ffffff",
  }),

  /** Fill of a disabled control surface (grayed-out editable input field). */
  controlSurfaceDisabledColorProperty: new ProfileColorProperty(WaveComposerNamespace, "controlSurfaceDisabled", {
    default: "#cccccc",
    projector: "#cccccc",
  }),

  /** Text on light control surfaces: combo items, flat-button labels, field values, preferences. */
  controlSurfaceTextColorProperty: new ProfileColorProperty(WaveComposerNamespace, "controlSurfaceText", {
    default: "#1a1a1a",
    projector: "#1a1a1a",
  }),
};

/** Partial identity colors, indexed by partial number − 1. */
export const PARTIAL_COLOR_PROPERTIES = [
  WaveComposerColors.partial1ColorProperty,
  WaveComposerColors.partial2ColorProperty,
  WaveComposerColors.partial3ColorProperty,
  WaveComposerColors.partial4ColorProperty,
] as const;

export default WaveComposerColors;
