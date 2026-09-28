/**
 * AnalysisPreferenceControls.ts
 *
 * FFT size, LPC order, and analysis-window controls for Preferences → Visual.
 */
import type { NumberProperty, Property, TReadOnlyProperty } from "scenerystack/axon";
import { Dimension2 } from "scenerystack/dot";
import { PreferencesControl, PreferencesDialogConstants } from "scenerystack/joist";
import type { Node } from "scenerystack/scenery";
import { Text, VBox } from "scenerystack/scenery";
import { NumberControl } from "scenerystack/scenery-phet";
import { ComboBox } from "scenerystack/sun";
import { Tandem } from "scenerystack/tandem";
import { WINDOW_TYPE_VALUES, type WindowType } from "../common/model/dsp/WindowFunction.js";
import { StringManager } from "../i18n/StringManager.js";
import { FFT_SIZE_VALUES, LPC_ORDER_RANGE } from "./AnalysisConstants.js";
import type { WaveComposerPreferencesModel } from "./WaveComposerPreferencesModel.js";

function getSimTopLayer(): Node {
  const phetGlobals = globalThis as unknown as { phet: { joist: { sim: { topLayer: Node } } } };
  return phetGlobals.phet.joist.sim.topLayer;
}

function descriptionText(stringProperty: TReadOnlyProperty<string>): Text {
  return new Text(stringProperty, PreferencesDialogConstants.CONTROL_DESCRIPTION_OPTIONS);
}

export function createFftSizePreferenceControl(fftSizeProperty: NumberProperty): Node {
  const controls = StringManager.getInstance().getControlStrings();
  const preferences = StringManager.getInstance().getPreferencesStrings();

  const comboBoxItems = FFT_SIZE_VALUES.map((size) => ({
    value: size,
    createNode: () => new Text(`${size}`, PreferencesDialogConstants.PANEL_SECTION_CONTENT_OPTIONS),
  }));

  const comboBox = new ComboBox(fftSizeProperty, comboBoxItems, getSimTopLayer(), {
    tandem: Tandem.OPT_OUT,
  });

  return new PreferencesControl({
    labelNode: new Text(controls.fftSizeStringProperty, PreferencesDialogConstants.CONTROL_LABEL_OPTIONS),
    descriptionNode: descriptionText(preferences.fftSizeDescriptionStringProperty),
    controlNode: comboBox,
  });
}

export function createLpcOrderPreferenceControl(lpcOrderProperty: NumberProperty): Node {
  const controls = StringManager.getInstance().getControlStrings();
  const preferences = StringManager.getInstance().getPreferencesStrings();

  const slider = new NumberControl(controls.lpcOrderStringProperty, lpcOrderProperty, LPC_ORDER_RANGE, {
    delta: 1,
    titleNodeOptions: PreferencesDialogConstants.CONTROL_LABEL_OPTIONS,
    numberDisplayOptions: {
      valuePattern: "{{value}}",
      textOptions: PreferencesDialogConstants.PANEL_SECTION_CONTENT_OPTIONS,
    },
    sliderOptions: {
      trackSize: new Dimension2(120, 3),
      thumbSize: new Dimension2(13, 22),
    },
    tandem: Tandem.OPT_OUT,
  });

  return new PreferencesControl({
    labelNode: new Text(controls.lpcOrderStringProperty, PreferencesDialogConstants.CONTROL_LABEL_OPTIONS),
    descriptionNode: descriptionText(preferences.lpcOrderDescriptionStringProperty),
    controlNode: slider,
  });
}

export function createWindowPreferenceControl(windowTypeProperty: Property<WindowType>): Node {
  const controls = StringManager.getInstance().getControlStrings();
  const preferences = StringManager.getInstance().getPreferencesStrings();
  const windowStrings = StringManager.getInstance().getWindowStrings();

  const windowLabels: Record<WindowType, TReadOnlyProperty<string>> = {
    hann: windowStrings.hannStringProperty,
    hamming: windowStrings.hammingStringProperty,
    blackman: windowStrings.blackmanStringProperty,
  };

  const comboBoxItems = WINDOW_TYPE_VALUES.map((type) => ({
    value: type,
    createNode: () => new Text(windowLabels[type], PreferencesDialogConstants.PANEL_SECTION_CONTENT_OPTIONS),
  }));

  const comboBox = new ComboBox(windowTypeProperty, comboBoxItems, getSimTopLayer(), {
    tandem: Tandem.OPT_OUT,
  });

  return new PreferencesControl({
    labelNode: new Text(controls.windowStringProperty, PreferencesDialogConstants.CONTROL_LABEL_OPTIONS),
    descriptionNode: descriptionText(preferences.windowDescriptionStringProperty),
    controlNode: comboBox,
  });
}

export function createAnalysisPreferenceControls(analysisPreferences: WaveComposerPreferencesModel): Node {
  return new VBox({
    align: "left",
    spacing: PreferencesDialogConstants.CONTENT_SPACING,
    children: [
      createFftSizePreferenceControl(analysisPreferences.fftSizeProperty),
      createLpcOrderPreferenceControl(analysisPreferences.lpcOrderProperty),
      createWindowPreferenceControl(analysisPreferences.windowTypeProperty),
    ],
  });
}
