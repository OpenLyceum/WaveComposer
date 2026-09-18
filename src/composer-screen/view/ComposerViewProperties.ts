/**
 * ComposerViewProperties.ts
 *
 * View-only state for the Composer screen. Overlay toggles default on so
 * harmonic pedagogy is visible immediately.
 */
import { BooleanProperty, NumberProperty } from "scenerystack/axon";
import type { ChartOverlayProperties } from "../../common/view/ChartOverlayProperties.js";
import { WaveComposerConstants } from "../../WaveComposerConstants.js";

export class ComposerViewProperties implements ChartOverlayProperties {
  public readonly showHarmonicsProperty = new BooleanProperty(true);
  public readonly showPipeOverlayProperty = new BooleanProperty(true);
  public readonly showModeNumbersProperty = new BooleanProperty(true);
  /** Draw each partial's own sine under the summed waveform (superposition view). */
  public readonly showComponentsProperty = new BooleanProperty(true);
  public readonly timeWindowMsProperty = new NumberProperty(80, {
    range: WaveComposerConstants.TIME_WINDOW_MS_RANGE,
  });

  public reset(): void {
    this.showHarmonicsProperty.reset();
    this.showPipeOverlayProperty.reset();
    this.showModeNumbersProperty.reset();
    this.showComponentsProperty.reset();
    this.timeWindowMsProperty.reset();
  }
}
