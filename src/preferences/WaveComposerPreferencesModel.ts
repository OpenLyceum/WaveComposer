/**
 * WaveComposerPreferencesModel.ts
 *
 * Model for the simulation-specific preferences shown in Preferences →
 * Simulation. Each preference Property takes its initial value from the
 * corresponding query parameter in waveComposerQueryParameters.
 *
 * Shared DSP analysis settings (FFT size, LPC order, window function) used by
 * every screen's audio pipeline.
 */

import { NumberProperty, Property } from "scenerystack/axon";
import { StringIO, type Tandem } from "scenerystack/tandem";
import { WINDOW_TYPE_VALUES, type WindowType } from "../common/model/dsp/WindowFunction.js";
import WaveComposerNamespace from "../WaveComposerNamespace.js";
import { FFT_SIZE_VALUES, LPC_ORDER_RANGE } from "./AnalysisConstants.js";
import waveComposerQueryParameters from "./waveComposerQueryParameters.js";

export class WaveComposerPreferencesModel {
  public readonly fftSizeProperty: NumberProperty;
  public readonly lpcOrderProperty: NumberProperty;
  public readonly windowTypeProperty: Property<WindowType>;

  public constructor(tandem?: Tandem) {
    this.fftSizeProperty = new NumberProperty(waveComposerQueryParameters.fftSize, {
      validValues: [...FFT_SIZE_VALUES],
      ...(tandem && { tandem: tandem.createTandem("fftSizeProperty") }),
    });
    this.lpcOrderProperty = new NumberProperty(waveComposerQueryParameters.lpcOrder, {
      range: LPC_ORDER_RANGE,
      ...(tandem && { tandem: tandem.createTandem("lpcOrderProperty") }),
    });
    // Plain string union, so it instruments as StringIO for PhET-iO with the
    // union as validValues (NumberProperty infers its IO type; a generic
    // Property over strings does not).
    this.windowTypeProperty = new Property<WindowType>(waveComposerQueryParameters.windowType as WindowType, {
      phetioValueType: StringIO,
      validValues: [...WINDOW_TYPE_VALUES],
      ...(tandem && { tandem: tandem.createTandem("windowTypeProperty") }),
    });
  }

  public reset(): void {
    this.fftSizeProperty.reset();
    this.lpcOrderProperty.reset();
    this.windowTypeProperty.reset();
  }
}

WaveComposerNamespace.register("WaveComposerPreferencesModel", WaveComposerPreferencesModel);
