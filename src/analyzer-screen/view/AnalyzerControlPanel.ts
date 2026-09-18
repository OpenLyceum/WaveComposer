/**
 * AnalyzerControlPanel.ts
 *
 * All Analyzer-screen controls: audio source (microphone / demo) with a
 * start/stop button, a freeze toggle, the displayed frequency range and scale,
 * the spectrogram scroll speed, and the harmonic-marker checkboxes. Analysis
 * settings bind to the model; display settings bind to the AnalyzerViewProperties.
 */
import { DerivedProperty, type NumberProperty, type Property, type TReadOnlyProperty } from "scenerystack/axon";
import { Dimension2, Range } from "scenerystack/dot";
import { Line, type Node, Text, VBox } from "scenerystack/scenery";
import { NumberControl } from "scenerystack/scenery-phet";
import { ButtonNode, Checkbox, Panel, TextPushButton, VerticalAquaRadioButtonGroup } from "scenerystack/sun";
import { Tandem } from "scenerystack/tandem";
import { AudioSource } from "../../common/model/BaseAnalysisModel.js";
import { FrequencyScale, FrequencyScaleValues } from "../../common/view/FrequencyScale.js";
import { createSourceSelector } from "../../common/view/SourceSelector.js";
import { StringManager } from "../../i18n/StringManager.js";
import WaveComposerColors from "../../WaveComposerColors.js";
import { WaveComposerConstants } from "../../WaveComposerConstants.js";
import type { AnalyzerModel } from "../model/AnalyzerModel.js";
import { type AnalyzerViewProperties, SCROLL_SPEED_RANGE } from "./AnalyzerViewProperties.js";

const MAX_FREQUENCY_RANGE = new Range(2000, 10000);
const PANEL_WIDTH = 232;

export class AnalyzerControlPanel extends Panel {
  public constructor(model: AnalyzerModel, viewProperties: AnalyzerViewProperties, listParent: Node) {
    const controls = StringManager.getInstance().getControlStrings();
    const panelStrings = StringManager.getInstance().getPanelStrings();

    // ── Source + start/stop + freeze ────────────────────────────────────────
    const sourceSelector = createSourceSelector(model, listParent);

    const startStopLabel = new DerivedProperty(
      [model.isListeningProperty, controls.startMicrophoneStringProperty, controls.stopMicrophoneStringProperty],
      (listening, start, stop) => (listening ? stop : start),
    );
    const startStopButton = new TextPushButton(startStopLabel, {
      font: WaveComposerConstants.CONTROL_FONT,
      baseColor: WaveComposerColors.buttonFillColorProperty,
      disabledColor: WaveComposerColors.buttonDisabledFillColorProperty,
      textFill: WaveComposerColors.textColorProperty,
      buttonAppearanceStrategy: ButtonNode.FlatAppearanceStrategy,
      maxTextWidth: PANEL_WIDTH - 20,
      enabledProperty: new DerivedProperty([model.audioSourceProperty], (s) => s === AudioSource.MICROPHONE),
      listener: () => {
        if (model.isListeningProperty.value) {
          model.stopListening();
        } else {
          model.startListening().catch(() => undefined);
        }
      },
      tandem: Tandem.OPT_OUT,
    });

    const a11yControls = StringManager.getInstance().getA11yStrings().controls;
    const freezeCheckbox = makeCheckbox(
      model.isFrozenProperty,
      controls.freezeStringProperty,
      a11yControls.freezeStringProperty,
    );
    const playAudioCheckbox = makeCheckbox(
      model.isAudioEnabledProperty,
      controls.playAudioStringProperty,
      a11yControls.playAudioStringProperty,
      // Greyed out while sound is off globally, where checking it would do nothing.
      model.isGlobalAudioEnabledProperty,
    );

    // ── Display settings ────────────────────────────────────────────────────
    const maxFreqControl = makeNumberControl(
      controls.maxFrequencyStringProperty,
      model.maxFrequencyProperty,
      MAX_FREQUENCY_RANGE,
      500,
      " Hz",
    );

    const frequencyScaleLabels: Record<FrequencyScale, TReadOnlyProperty<string>> = {
      [FrequencyScale.LINEAR]: controls.linearScaleStringProperty,
      [FrequencyScale.LOGARITHMIC]: controls.logScaleStringProperty,
    };
    const frequencyScaleControl = new VerticalAquaRadioButtonGroup(
      viewProperties.frequencyScaleProperty,
      FrequencyScaleValues.map((value) => ({
        value,
        createNode: () => controlText(frequencyScaleLabels[value]),
        options: { accessibleName: frequencyScaleLabels[value] },
      })),
      {
        spacing: 4,
        radioButtonOptions: {
          radius: 7,
          selectedColor: WaveComposerColors.accentColorProperty,
          deselectedColor: WaveComposerColors.chartBackgroundColorProperty,
          stroke: WaveComposerColors.panelBorderColorProperty,
        },
        accessibleName: controls.frequencyScaleStringProperty,
        tandem: Tandem.OPT_OUT,
      },
    );

    const scrollSpeedControl = makeNumberControl(
      controls.scrollSpeedStringProperty,
      viewProperties.scrollSpeedProperty,
      SCROLL_SPEED_RANGE,
      0.5,
      "×",
      1,
    );

    // ── Overlay visibility ──────────────────────────────────────────────────
    const overlays = new VBox({
      align: "left",
      spacing: 4,
      children: [
        sectionLabel(controls.overlaysStringProperty),
        makeCheckbox(viewProperties.showHarmonicsProperty, controls.showHarmonicsStringProperty),
        makeCheckbox(viewProperties.showModeNumbersProperty, controls.showModeNumbersStringProperty),
      ],
    });

    const content = new VBox({
      align: "left",
      spacing: 8,
      children: [
        new Text(panelStrings.controlsStringProperty, {
          font: WaveComposerConstants.PANEL_TITLE_FONT,
          fill: WaveComposerColors.textColorProperty,
        }),
        sectionLabel(controls.sourceStringProperty),
        sourceSelector,
        startStopButton,
        playAudioCheckbox,
        freezeCheckbox,
        divider(),
        maxFreqControl,
        sectionLabel(controls.frequencyScaleStringProperty),
        frequencyScaleControl,
        scrollSpeedControl,
        divider(),
        overlays,
      ],
    });

    super(content, {
      fill: WaveComposerColors.panelBackgroundColorProperty,
      stroke: WaveComposerColors.panelBorderColorProperty,
      xMargin: WaveComposerConstants.PANEL_X_MARGIN,
      yMargin: WaveComposerConstants.PANEL_Y_MARGIN,
      cornerRadius: WaveComposerConstants.CORNER_RADIUS,
      align: "left",
    });
  }
}

function controlText(content: string | TReadOnlyProperty<string>): Node {
  return new Text(content, { font: WaveComposerConstants.CONTROL_FONT, fill: WaveComposerColors.textColorProperty });
}

function sectionLabel(stringProperty: TReadOnlyProperty<string>): Node {
  return new Text(stringProperty, {
    font: WaveComposerConstants.LABEL_FONT,
    fill: WaveComposerColors.textColorProperty,
  });
}

function divider(): Node {
  return new Line(0, 0, PANEL_WIDTH, 0, { stroke: WaveComposerColors.panelBorderColorProperty, lineWidth: 1 });
}

function makeCheckbox(
  property: Property<boolean>,
  labelProperty: TReadOnlyProperty<string>,
  accessibleName?: TReadOnlyProperty<string>,
  enabledProperty?: TReadOnlyProperty<boolean>,
): Checkbox {
  return new Checkbox(property, controlText(labelProperty), {
    boxWidth: 16,
    checkboxColor: WaveComposerColors.textColorProperty,
    checkboxColorBackground: WaveComposerColors.chartBackgroundColorProperty,
    tandem: Tandem.OPT_OUT,
    ...(accessibleName ? { accessibleName } : {}),
    ...(enabledProperty ? { enabledProperty } : {}),
  });
}

function makeNumberControl(
  title: TReadOnlyProperty<string>,
  property: NumberProperty,
  range: Range,
  delta: number,
  unit = "",
  decimalPlaces = 0,
): NumberControl {
  return new NumberControl(title, property, range, {
    delta,
    titleNodeOptions: { font: WaveComposerConstants.LABEL_FONT, fill: WaveComposerColors.textColorProperty },
    numberDisplayOptions: {
      valuePattern: `{{value}}${unit}`,
      decimalPlaces,
      textOptions: { font: WaveComposerConstants.CONTROL_FONT },
    },
    sliderOptions: { trackSize: new Dimension2(120, 3), thumbSize: new Dimension2(13, 22) },
    tandem: Tandem.OPT_OUT,
  });
}
