/**
 * AnalyzerModel.ts
 *
 * Screen-specific model for the Analyzer screen. It owns an independent
 * audio/DSP pipeline configured for instrument presets plus Analyzer-only state
 * (the display frequency floor).
 */
import { NumberProperty } from "scenerystack/axon";
import { Range } from "scenerystack/dot";
import { INSTRUMENT_PRESET_CATALOG } from "../../common/model/audio/presetCatalog.js";
import { BaseAnalysisModel } from "../../common/model/BaseAnalysisModel.js";
import type { SpectrumChartModel } from "../../common/model/HarmonicChartModel.js";
import type { WaveComposerPreferencesModel } from "../../preferences/WaveComposerPreferencesModel.js";

const DEFAULT_MIN_FREQUENCY_HZ = 0;
const FREQUENCY_RANGE = new Range(0, 22050);

/**
 * F0 search band for this screen, in Hz. Well above the voice's 800 Hz ceiling:
 * whistling sits around 1–2.5 kHz and a piccolo's top note is ~4.2 kHz, and a
 * source above the band is reported as an exact sub-harmonic of itself rather
 * than as silence. The floor stays at the voice's, which already reaches below
 * a cello's low C.
 */
const ANALYZER_F0_MIN_HZ = 60;
const ANALYZER_F0_MAX_HZ = 5000;

export class AnalyzerModel extends BaseAnalysisModel implements SpectrumChartModel {
  public readonly minFrequencyProperty = new NumberProperty(DEFAULT_MIN_FREQUENCY_HZ, { range: FREQUENCY_RANGE });

  public constructor(analysisPreferences: WaveComposerPreferencesModel) {
    super(INSTRUMENT_PRESET_CATALOG, analysisPreferences);
  }

  public override reset(): void {
    super.reset();
    this.minFrequencyProperty.reset();
  }

  protected override get f0SearchRangeHz(): { readonly minHz: number; readonly maxHz: number } {
    return { minHz: ANALYZER_F0_MIN_HZ, maxHz: ANALYZER_F0_MAX_HZ };
  }

  /**
   * Fundamental the harmonic markers and mode numbers hang on. This is the
   * stabilized pitch, not the per-frame estimate: the mode numbers are the
   * ordinals of the multiples of F0, so a single octave-jumped frame would
   * renumber the whole ladder for one animation frame.
   */
  public getFundamentalHz(): number {
    return this.stableF0Property.value;
  }
}
