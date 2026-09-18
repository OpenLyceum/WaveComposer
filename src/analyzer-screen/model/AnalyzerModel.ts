/**
 * AnalyzerModel.ts
 *
 * Screen-specific model for the Analyzer screen. It owns an independent
 * audio/DSP pipeline configured for instrument presets plus Analyzer-only state
 * (display frequency floor, boundary-model hints for instrument pedagogy).
 */
import { NumberProperty } from "scenerystack/axon";
import { Range } from "scenerystack/dot";
import { INSTRUMENT_PRESET_CATALOG } from "../../common/model/audio/presetCatalog.js";
import { BaseAnalysisModel } from "../../common/model/BaseAnalysisModel.js";
import type { SpectrumChartModel } from "../../common/model/HarmonicChartModel.js";
import { createPipeBoundaryProperty, PipeBoundary } from "../../common/model/PipeBoundary.js";
import type { WaveComposerPreferencesModel } from "../../preferences/WaveComposerPreferencesModel.js";

const DEFAULT_MIN_FREQUENCY_HZ = 0;
const FREQUENCY_RANGE = new Range(0, 22050);

/** Presets whose captions describe odd-harmonic cylindrical bores. */
const CLOSED_PIPE_PRESET_IDS = new Set(["clarinet", "oboe"]);

/** Presets whose captions describe rich / conical harmonic content. */
const OPEN_PIPE_PRESET_IDS = new Set(["flute", "horn", "saxophone"]);

/** Presets whose captions describe bowed / plucked string ladders. */
const STRING_PRESET_IDS = new Set(["violin", "viola", "cello", "piano", "guitar"]);

export class AnalyzerModel extends BaseAnalysisModel implements SpectrumChartModel {
  public readonly minFrequencyProperty = new NumberProperty(DEFAULT_MIN_FREQUENCY_HZ, { range: FREQUENCY_RANGE });
  /**
   * Expected allowed harmonics for pedagogy overlays. Auto-updates when certain
   * instrument presets are selected; user can override via the control panel.
   */
  public readonly pipeBoundaryProperty = createPipeBoundaryProperty(PipeBoundary.NONE);

  public constructor(analysisPreferences: WaveComposerPreferencesModel) {
    super(INSTRUMENT_PRESET_CATALOG, analysisPreferences);
    this.audioSourceProperty.lazyLink((source) => this.syncPipeBoundaryForPreset(source));
  }

  public override reset(): void {
    super.reset();
    this.minFrequencyProperty.reset();
    this.pipeBoundaryProperty.reset();
  }

  /**
   * Fundamental the harmonic markers, mode numbers, and allowed-harmonic bands
   * hang on. This is the stabilized pitch, not the per-frame estimate: the mode
   * numbers are the ordinals of the multiples of F0, so a single octave-jumped
   * frame would renumber the whole ladder for one animation frame.
   */
  public getFundamentalHz(): number {
    return this.stableF0Property.value;
  }

  private syncPipeBoundaryForPreset(sourceId: string): void {
    if (CLOSED_PIPE_PRESET_IDS.has(sourceId)) {
      this.pipeBoundaryProperty.value = PipeBoundary.CLOSED_PIPE;
    } else if (OPEN_PIPE_PRESET_IDS.has(sourceId)) {
      this.pipeBoundaryProperty.value = PipeBoundary.OPEN_PIPE;
    } else if (STRING_PRESET_IDS.has(sourceId)) {
      this.pipeBoundaryProperty.value = PipeBoundary.STRING;
    } else {
      this.pipeBoundaryProperty.value = PipeBoundary.NONE;
    }
  }
}
