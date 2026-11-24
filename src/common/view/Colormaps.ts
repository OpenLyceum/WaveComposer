/**
 * Colormaps.ts
 *
 * Perceptually-ordered colormaps for the spectrogram, built once at module load
 * by linearly interpolating a handful of anchor colors into a 256-entry RGB
 * lookup table (`Uint8ClampedArray`, length 256×3). This keeps the file small
 * (no 256-row literal tables) while still producing smooth, recognizable maps.
 *
 * The anchors approximate matplotlib's viridis/inferno/magma plus a plain
 * grayscale. Index a LUT with `lut[i*3 + {0,1,2}]` for the R/G/B of bin `i`.
 */

import { ColormapName } from "../../preferences/AnalysisConstants.js";

type Rgb = readonly [number, number, number];

// Five evenly-spaced anchors (t = 0, .25, .5, .75, 1) per map.
const ANCHORS: Record<ColormapName, readonly Rgb[]> = {
  [ColormapName.VIRIDIS]: [
    [68, 1, 84],
    [59, 82, 139],
    [33, 145, 140],
    [94, 201, 98],
    [253, 231, 37],
  ],
  [ColormapName.INFERNO]: [
    [0, 0, 4],
    [87, 16, 110],
    [188, 55, 84],
    [249, 142, 9],
    [252, 255, 164],
  ],
  [ColormapName.MAGMA]: [
    [0, 0, 4],
    [81, 18, 124],
    [183, 55, 121],
    [252, 137, 97],
    [252, 253, 191],
  ],
  [ColormapName.GRAYSCALE]: [
    [0, 0, 0],
    [64, 64, 64],
    [128, 128, 128],
    [192, 192, 192],
    [255, 255, 255],
  ],
};

const LUT_SIZE = 256;

function buildLut(anchors: readonly Rgb[]): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(LUT_SIZE * 3);
  const segments = anchors.length - 1;
  for (let i = 0; i < LUT_SIZE; i++) {
    const t = (i / (LUT_SIZE - 1)) * segments;
    const seg = Math.min(Math.floor(t), segments - 1);
    const frac = t - seg;
    const a = anchors[seg];
    const b = anchors[seg + 1];
    if (!(a && b)) {
      continue;
    }
    lut[i * 3] = a[0] + frac * (b[0] - a[0]);
    lut[i * 3 + 1] = a[1] + frac * (b[1] - a[1]);
    lut[i * 3 + 2] = a[2] + frac * (b[2] - a[2]);
  }
  return lut;
}

const LUTS: Record<ColormapName, Uint8ClampedArray> = {
  [ColormapName.VIRIDIS]: buildLut(ANCHORS[ColormapName.VIRIDIS]),
  [ColormapName.INFERNO]: buildLut(ANCHORS[ColormapName.INFERNO]),
  [ColormapName.MAGMA]: buildLut(ANCHORS[ColormapName.MAGMA]),
  [ColormapName.GRAYSCALE]: buildLut(ANCHORS[ColormapName.GRAYSCALE]),
};

/** The 256×3 RGB lookup table for a colormap. */
export function getColormapLut(name: ColormapName): Uint8ClampedArray {
  return LUTS[name];
}
