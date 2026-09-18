/**
 * HarmonicChartModel.ts
 *
 * Shared model surfaces for the waveform, spectrum, and standing-wave chart nodes
 * on screens that visualize harmonics and wave superposition.
 */
import type { NumberProperty, Property } from "scenerystack/axon";
import type { BaseAnalysisModel } from "./BaseAnalysisModel.js";
import type { PipeBoundary } from "./PipeBoundary.js";

export type StandingWaveMode = {
  readonly modeNumber: number;
  readonly amplitude: number;
};

/**
 * What the spectrum chart needs: a display frequency floor, a fundamental to hang
 * harmonic markers on, and the boundary model that says which harmonics a pipe or
 * string is allowed to sound.
 */
export type SpectrumChartModel = BaseAnalysisModel & {
  readonly minFrequencyProperty: NumberProperty;
  readonly pipeBoundaryProperty: Property<PipeBoundary>;
  getFundamentalHz(): number;
};

/** Adds what the standing-wave strip needs, on top of {@link SpectrumChartModel}. */
export type HarmonicChartModel = SpectrumChartModel & {
  getStandingWaveModes(): readonly StandingWaveMode[];
};

/** Models that can synthesize a longer waveform for the oscilloscope time window. */
export type DisplayWaveformModel = {
  fillDisplayWaveform(out: Float32Array): void;
};

export function hasDisplayWaveform(model: BaseAnalysisModel): model is BaseAnalysisModel & DisplayWaveformModel {
  return "fillDisplayWaveform" in model && typeof model.fillDisplayWaveform === "function";
}
