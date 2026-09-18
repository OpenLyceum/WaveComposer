/**
 * ChartOverlayProperties.ts
 *
 * View-only overlay toggles shared by Analyzer and Composer chart nodes.
 */
import type { BooleanProperty, NumberProperty, Property } from "scenerystack/axon";
import type { FrequencyScale } from "./FrequencyScale.js";

export type ChartOverlayProperties = {
  readonly showHarmonicsProperty: BooleanProperty;
  readonly showPipeOverlayProperty: BooleanProperty;
  readonly showModeNumbersProperty: BooleanProperty;
  readonly timeWindowMsProperty: NumberProperty;
  /** Frequency-axis scale; charts plot linearly when a screen does not offer the choice. */
  readonly frequencyScaleProperty?: Property<FrequencyScale>;
};
