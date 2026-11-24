/**
 * ColormapPreferenceControl.ts
 *
 * Spectrogram colormap selector for Preferences → Visual.
 */
import type { Property, TReadOnlyProperty } from "scenerystack/axon";
import { PreferencesControl, PreferencesDialogConstants } from "scenerystack/joist";
import type { Node } from "scenerystack/scenery";
import { Text } from "scenerystack/scenery";
import { ComboBox } from "scenerystack/sun";
import { Tandem } from "scenerystack/tandem";
import { StringManager } from "../i18n/StringManager.js";
import { COLORMAP_NAME_VALUES, type ColormapName } from "./AnalysisConstants.js";

export function createColormapPreferenceControl(colormapProperty: Property<ColormapName>, listParent: Node): Node {
  const controls = StringManager.getInstance().getControlStrings();
  const colormapStrings = StringManager.getInstance().getColormapStrings();

  const colormapLabels: Record<ColormapName, TReadOnlyProperty<string>> = {
    viridis: colormapStrings.viridisStringProperty,
    inferno: colormapStrings.infernoStringProperty,
    magma: colormapStrings.magmaStringProperty,
    grayscale: colormapStrings.grayscaleStringProperty,
  };

  const comboBoxItems = COLORMAP_NAME_VALUES.map((name) => ({
    value: name,
    createNode: () => new Text(colormapLabels[name], PreferencesDialogConstants.PANEL_SECTION_CONTENT_OPTIONS),
  }));

  const comboBox = new ComboBox(colormapProperty, comboBoxItems, listParent, {
    tandem: Tandem.OPT_OUT,
  });

  return new PreferencesControl({
    labelNode: new Text(controls.colormapStringProperty, PreferencesDialogConstants.CONTROL_LABEL_OPTIONS),
    controlNode: comboBox,
  });
}
