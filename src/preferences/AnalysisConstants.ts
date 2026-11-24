/**
 * AnalysisConstants.ts
 *
 * Default values and valid ranges for the shared analysis and spectrogram preferences.
 * Extracted into their own module so both WaveComposerPreferencesModel and
 * waveComposerQueryParameters can import them without a circular dependency.
 */

import { Range } from "scenerystack/dot";

export const DEFAULT_FFT_SIZE = 2048;
export const FFT_SIZE_VALUES = [1024, 2048, 4096] as const;
export const DEFAULT_LPC_ORDER = 12;
export const LPC_ORDER_RANGE = new Range(8, 16);

export const ColormapName = {
  VIRIDIS: "viridis",
  INFERNO: "inferno",
  MAGMA: "magma",
  GRAYSCALE: "grayscale",
} as const;
export type ColormapName = (typeof ColormapName)[keyof typeof ColormapName];

export const COLORMAP_NAME_VALUES: readonly ColormapName[] = [
  ColormapName.VIRIDIS,
  ColormapName.INFERNO,
  ColormapName.MAGMA,
  ColormapName.GRAYSCALE,
];
