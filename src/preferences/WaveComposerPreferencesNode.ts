/**
 * WaveComposerPreferencesNode.ts
 *
 * The sim's Preferences → Visual content: the shared DSP-analysis controls (FFT size, LPC order,
 * analysis window) plus the spectrogram colormap selector, composed into a single Node so the sim
 * registers one customPreferences entry (the {Prefix}PreferencesNode convention).
 */
import type { Property } from "scenerystack/axon";
import { PreferencesDialogConstants } from "scenerystack/joist";
import { getGlobal } from "scenerystack/phet-core";
import { Node, VBox } from "scenerystack/scenery";
import type { ColormapName } from "../common/view/Colormaps.js";
import { createAnalysisPreferenceControls } from "./AnalysisPreferenceControls.js";
import { createColormapPreferenceControl } from "./ColormapPreferenceControl.js";
import type { WaveComposerPreferencesModel } from "./WaveComposerPreferencesModel.js";

export class WaveComposerPreferencesNode extends VBox {
  public constructor(preferences: WaveComposerPreferencesModel, colormapProperty: Property<ColormapName>) {
    const listParent: unknown = getGlobal("phet.joist.sim.topLayer");
    if (!(listParent instanceof Node)) {
      throw new Error("Preferences require the simulation's top layer");
    }

    super({
      align: "left",
      spacing: PreferencesDialogConstants.CONTENT_SPACING,
      children: [
        createAnalysisPreferenceControls(preferences, listParent),
        createColormapPreferenceControl(colormapProperty, listParent),
      ],
    });
  }
}
