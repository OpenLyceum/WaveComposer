/**
 * AnalyzerViewProperties.ts
 *
 * View-only reactive state for the Analyzer screen — display preferences that
 * don't belong in the model (they don't affect the DSP): the spectrogram
 * scroll speed, the frequency-axis scale, which overlays are shown,
 * and the waveform time window. Kept in one place so the control panel and the
 * display nodes share the same Properties and Reset All can restore them.
 */
import { BooleanProperty, NumberProperty, Property, type TReadOnlyProperty } from "scenerystack/axon";
import { Range } from "scenerystack/dot";
import { FrequencyScale, FrequencyScaleValues } from "../../common/view/FrequencyScale.js";
import type { ColormapName } from "../../preferences/AnalysisConstants.js";
import { WaveComposerConstants } from "../../WaveComposerConstants.js";

/**
 * Spectrogram columns written per analyzed frame. At 1× each frame writes one
 * column, so the history spans ~5 s at 60 fps; slower stretches that history over
 * more time, faster scrolls a shorter window past the eye more quickly.
 */
export const SCROLL_SPEED_RANGE = new Range(0.5, 4);
const DEFAULT_SCROLL_SPEED = 1;

export class AnalyzerViewProperties {
  /** Spectrogram colormap. */
  public readonly colormapProperty: TReadOnlyProperty<ColormapName>;
  /** Linear Hz or per-octave logarithmic frequency axes. */
  public readonly frequencyScaleProperty = new Property<FrequencyScale>(FrequencyScale.LINEAR, {
    validValues: [...FrequencyScaleValues],
  });
  /** How fast the spectrogram scrolls, in columns per analyzed frame. */
  public readonly scrollSpeedProperty = new NumberProperty(DEFAULT_SCROLL_SPEED, { range: SCROLL_SPEED_RANGE });
  /** Show integer-harmonic markers (multiples of F0) over the spectrum. */
  public readonly showHarmonicsProperty = new BooleanProperty(false);
  /** Label harmonic markers with standing-wave mode numbers (n = 1, 2, 3…). */
  public readonly showModeNumbersProperty = new BooleanProperty(false);
  /** Oscilloscope time window in milliseconds. */
  public readonly timeWindowMsProperty = new NumberProperty(WaveComposerConstants.DEFAULT_TIME_WINDOW_MS, {
    range: WaveComposerConstants.TIME_WINDOW_MS_RANGE,
  });

  public constructor(colormapProperty: TReadOnlyProperty<ColormapName>) {
    this.colormapProperty = colormapProperty;
  }

  public reset(): void {
    this.frequencyScaleProperty.reset();
    this.scrollSpeedProperty.reset();
    this.showHarmonicsProperty.reset();
    this.showModeNumbersProperty.reset();
    this.timeWindowMsProperty.reset();
  }
}
