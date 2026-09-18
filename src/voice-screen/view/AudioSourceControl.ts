/**
 * AudioSourceControl.ts
 *
 * Compact audio-source control for the Voice & Vowels screen: the source ComboBox
 * (microphone + voice presets) and a start/stop button.
 *
 * The Analyzer screen has its own, larger control panel; this mirrors just the
 * source picker so the input can also be chosen without leaving this screen.
 */
import { DerivedProperty } from "scenerystack/axon";
import { type Node, Text, VBox } from "scenerystack/scenery";
import { ButtonNode, Checkbox, Panel, TextPushButton } from "scenerystack/sun";
import { Tandem } from "scenerystack/tandem";
import { AudioSource } from "../../common/model/BaseAnalysisModel.js";
import { createSourceSelector } from "../../common/view/SourceSelector.js";
import { StringManager } from "../../i18n/StringManager.js";
import WaveComposerColors from "../../WaveComposerColors.js";
import { WaveComposerConstants } from "../../WaveComposerConstants.js";
import type { VoiceModel } from "../model/VoiceModel.js";

const MAX_BUTTON_TEXT_WIDTH = 170;

export class AudioSourceControl extends Panel {
  public constructor(model: VoiceModel, listParent: Node) {
    const controls = StringManager.getInstance().getControlStrings();

    // This panel sits near the bottom of the screen, so open the list upward.
    const sourceSelector = createSourceSelector(model, listParent, {
      listPosition: "above",
    });

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
      maxTextWidth: MAX_BUTTON_TEXT_WIDTH,
      // Start/stop only applies to the live microphone, not the synthetic demo.
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
    const playAudioCheckbox = new Checkbox(
      model.isAudioEnabledProperty,
      new Text(controls.playAudioStringProperty, {
        font: WaveComposerConstants.CONTROL_FONT,
        fill: WaveComposerColors.textColorProperty,
      }),
      {
        boxWidth: 16,
        checkboxColor: WaveComposerColors.textColorProperty,
        checkboxColorBackground: WaveComposerColors.chartBackgroundColorProperty,
        tandem: Tandem.OPT_OUT,
        accessibleName: a11yControls.playAudioStringProperty,
        // Greyed out while sound is off globally, where checking it would do nothing.
        enabledProperty: model.isGlobalAudioEnabledProperty,
      },
    );

    const content = new VBox({
      align: "left",
      spacing: 8,
      children: [
        new Text(controls.sourceStringProperty, {
          font: WaveComposerConstants.PANEL_TITLE_FONT,
          fill: WaveComposerColors.textColorProperty,
        }),
        sourceSelector,
        startStopButton,
        playAudioCheckbox,
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
