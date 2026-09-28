/**
 * waveComposerQueryParameters.ts
 *
 * Sim-specific startup query parameters. This is the single place where every
 * sim-specific query parameter is declared and documented. Public-facing
 * parameters (intended for end users / sharing links) must set `public: true`.
 *
 * ── How to add a query parameter ──────────────────────────────────────────────
 * 1. Add an entry below with a `type`, `defaultValue`, and (if user-facing)
 *    `public: true`. Add `isValidValue` to bound numeric ranges.
 * 2. If it should also be user-editable at runtime, surface it as a preference
 *    in WaveComposerPreferencesModel (initialize that Property from this query parameter).
 *
 * Usage: append e.g. `?fftSize=4096&lpcOrder=14` to the sim URL.
 */

import { logGlobal } from "scenerystack/phet-core";
import { QueryStringMachine } from "scenerystack/query-string-machine";
import { WINDOW_TYPE_VALUES, WindowType } from "../common/model/dsp/WindowFunction.js";
import WaveComposerNamespace from "../WaveComposerNamespace.js";
import { DEFAULT_FFT_SIZE, DEFAULT_LPC_ORDER, FFT_SIZE_VALUES, LPC_ORDER_RANGE } from "./AnalysisConstants.js";

const waveComposerQueryParameters = QueryStringMachine.getAll({
  /** FFT window size used by the analysis pipeline. */
  fftSize: {
    type: "number" as const,
    defaultValue: DEFAULT_FFT_SIZE,
    validValues: [...FFT_SIZE_VALUES],
    public: true,
  },

  /** Linear-prediction (LPC) order. */
  lpcOrder: {
    type: "number" as const,
    defaultValue: DEFAULT_LPC_ORDER,
    isValidValue: (value: number) =>
      Number.isInteger(value) && value >= LPC_ORDER_RANGE.min && value <= LPC_ORDER_RANGE.max,
    public: true,
  },

  /** Window function applied before the FFT. */
  windowType: {
    type: "string",
    defaultValue: WindowType.HANN,
    validValues: [...WINDOW_TYPE_VALUES],
    public: true,
  },
});

WaveComposerNamespace.register("waveComposerQueryParameters", waveComposerQueryParameters);

// Log query parameters (for the console / PhET-iO).
logGlobal("phet.chipper.queryParameters");

export default waveComposerQueryParameters;
