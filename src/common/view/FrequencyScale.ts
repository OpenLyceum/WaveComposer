/**
 * FrequencyScale.ts
 *
 * Linear vs. logarithmic frequency axes for the Analyzer's charts.
 *
 * Rather than bending bamboo's linear ChartTransform, the charts plot a
 * *transformed* frequency coordinate: Hz on a linear scale, log2(Hz) on a
 * logarithmic one. Grid lines and ticks then stay evenly spaced in that
 * coordinate — one per octave on the log scale, which is how musical pitch
 * actually spaces itself — and only the tick labels convert back to Hz.
 */

export const FrequencyScale = {
  LINEAR: "linear",
  LOGARITHMIC: "logarithmic",
} as const;

export type FrequencyScale = (typeof FrequencyScale)[keyof typeof FrequencyScale];

export const FrequencyScaleValues = [FrequencyScale.LINEAR, FrequencyScale.LOGARITHMIC] as const;

/**
 * Lowest frequency a logarithmic axis shows. The analysis range starts at 0 Hz,
 * which has no logarithm, and everything below hearing is noise on a display
 * whose lowest decade would otherwise eat half the chart.
 */
export const LOG_MIN_FREQUENCY_HZ = 20;

/** Tick/grid spacing in transformed units: 1 kHz linear, one octave logarithmic. */
export const LINEAR_TICK_SPACING_HZ = 1000;
export const LOG_TICK_SPACING_OCTAVES = 1;

/** Hz → plotting coordinate for the given scale. */
export function toScaleCoordinate(frequencyHz: number, scale: FrequencyScale): number {
  return scale === FrequencyScale.LOGARITHMIC ? Math.log2(Math.max(frequencyHz, LOG_MIN_FREQUENCY_HZ)) : frequencyHz;
}

/** Plotting coordinate → Hz for the given scale. */
export function fromScaleCoordinate(coordinate: number, scale: FrequencyScale): number {
  return scale === FrequencyScale.LOGARITHMIC ? 2 ** coordinate : coordinate;
}

/** Tick/grid spacing (transformed units) for the given scale. */
export function tickSpacingFor(scale: FrequencyScale): number {
  return scale === FrequencyScale.LOGARITHMIC ? LOG_TICK_SPACING_OCTAVES : LINEAR_TICK_SPACING_HZ;
}

/**
 * The [min, max] plotting range for a scale, clamped so a logarithmic axis never
 * reaches 0 Hz and always spans at least one octave.
 */
export function scaleRangeFor(minFrequencyHz: number, maxFrequencyHz: number, scale: FrequencyScale): [number, number] {
  if (scale === FrequencyScale.LOGARITHMIC) {
    const min = Math.max(minFrequencyHz, LOG_MIN_FREQUENCY_HZ);
    const max = Math.max(maxFrequencyHz, min * 2);
    return [Math.log2(min), Math.log2(max)];
  }
  return [minFrequencyHz, Math.max(maxFrequencyHz, minFrequencyHz + 1)];
}

/** Tick label text for a plotting coordinate: Hz below 1 kHz, "1k"-style above. */
export function formatScaleTick(coordinate: number, scale: FrequencyScale): string {
  const hz = fromScaleCoordinate(coordinate, scale);
  if (hz < 1000) {
    return `${Math.round(hz)}`;
  }
  const k = hz / 1000;
  return `${Number.isInteger(k) ? k : Math.round(k * 10) / 10}k`;
}
