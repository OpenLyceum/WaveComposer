/**
 * SourceSelector.ts
 *
 * The shared audio-source picker used by both screens' controls: a ComboBox over
 * microphone, presets from a screen-specific catalog, and user recordings, plus a
 * one-line caption and Record / Save buttons. Each screen has an independent
 * model, so the selector uses the preset catalog configured on that model.
 */
import { DerivedProperty, type TReadOnlyProperty } from "scenerystack/axon";
import { HBox, Node, Text, VBox } from "scenerystack/scenery";
import { ButtonNode, ComboBox, type ComboBoxOptions, TextPushButton } from "scenerystack/sun";
import { Tandem } from "scenerystack/tandem";
import { StringManager } from "../../i18n/StringManager.js";
import WaveComposerColors from "../../WaveComposerColors.js";
import { WaveComposerConstants } from "../../WaveComposerConstants.js";
import { downloadBlob, encodeWav } from "../model/audio/WavEncoder.js";
import { AudioNotice, AudioSource, type BaseAnalysisModel } from "../model/BaseAnalysisModel.js";

const CAPTION_MAX_WIDTH = 200;
const BUTTON_MAX_TEXT_WIDTH = 180;

interface SourceSelectorOptions {
  /** Direction the dropdown opens; use "above" when the control sits near the bottom. */
  listPosition?: "above" | "below";
}

/** Builds the source ComboBox + caption + record/save buttons as a left-aligned column. */
export function createSourceSelector(
  model: BaseAnalysisModel,
  listParent: Node,
  options?: SourceSelectorOptions,
): Node {
  const catalog = model.presetCatalog;
  const instrumentStrings = StringManager.getInstance().getPresetStrings();
  const voiceStrings = StringManager.getInstance().getVoicePresetStrings();
  const controls = StringManager.getInstance().getControlStrings();

  const captionByPresetId = new Map(
    catalog.map((entry) => [
      entry.id,
      entry.stringGroup === "voicePresets"
        ? voiceStrings[`${entry.captionKey}StringProperty`]
        : instrumentStrings[`${entry.captionKey}StringProperty`],
    ]),
  );
  const nameByPresetId = new Map(
    catalog.map((entry) => [
      entry.id,
      entry.stringGroup === "voicePresets"
        ? voiceStrings[`${entry.nameKey}StringProperty`]
        : instrumentStrings[`${entry.nameKey}StringProperty`],
    ]),
  );

  const recordingLabelCache = new Map<string, TReadOnlyProperty<string> & { dispose(): void }>();
  function nameProperty(value: string): TReadOnlyProperty<string> {
    if (value === AudioSource.MICROPHONE) {
      return instrumentStrings.microphoneStringProperty;
    }
    const presetName = nameByPresetId.get(value);
    if (presetName) {
      return presetName;
    }
    let label = recordingLabelCache.get(value);
    if (!label) {
      const index = model.getRecording(value)?.index ?? 0;
      label = new DerivedProperty([instrumentStrings.recordingStringProperty], (text) => `${text} ${index}`);
      recordingLabelCache.set(value, label);
    }
    return label;
  }

  const comboBoxOptions: ComboBoxOptions = {
    buttonFill: WaveComposerColors.buttonFillColorProperty,
    buttonStroke: WaveComposerColors.panelBorderColorProperty,
    listFill: WaveComposerColors.buttonFillColorProperty,
    listStroke: WaveComposerColors.panelBorderColorProperty,
    highlightFill: WaveComposerColors.comboBoxHighlightColorProperty,
    listPosition: options?.listPosition ?? "below",
    accessibleName: controls.sourceStringProperty,
    tandem: Tandem.OPT_OUT,
  };

  const comboContainer = new Node();
  let combo: ComboBox<string> | null = null;
  let comboValues: string[] = [];
  function rebuildCombo(): void {
    if (combo) {
      comboContainer.removeChild(combo);
      combo.dispose();
      combo = null;
    }
    comboValues = model.getSourceValues();
    // Drop (and dispose) cached labels for recordings that no longer exist,
    // e.g. after Reset All — the DerivedProperties would otherwise accumulate.
    for (const [id, labelProperty] of [...recordingLabelCache]) {
      if (!comboValues.includes(id)) {
        labelProperty.dispose();
        recordingLabelCache.delete(id);
      }
    }
    combo = new ComboBox(
      model.audioSourceProperty,
      comboValues.map((value) => ({
        value,
        createNode: () =>
          new Text(nameProperty(value), {
            font: WaveComposerConstants.CONTROL_FONT,
            fill: WaveComposerColors.textColorProperty,
          }),
      })),
      listParent,
      comboBoxOptions,
    );
    comboContainer.addChild(combo);
  }

  // Recordings are dynamic choices, so rebuild the ComboBox when that list changes.
  model.recordings.lengthProperty.lazyLink(rebuildCombo);
  rebuildCombo();

  const captionProperty = DerivedProperty.deriveAny(
    [
      model.audioSourceProperty,
      instrumentStrings.microphoneCaptionStringProperty,
      instrumentStrings.recordingCaptionStringProperty,
      ...captionByPresetId.values(),
    ],
    () => {
      const value = model.audioSourceProperty.value;
      if (value === AudioSource.MICROPHONE) {
        return instrumentStrings.microphoneCaptionStringProperty.value;
      }
      const caption = captionByPresetId.get(value);
      if (caption) {
        return caption.value;
      }
      return instrumentStrings.recordingCaptionStringProperty.value;
    },
  );
  const caption = new Text(captionProperty, {
    font: WaveComposerConstants.LABEL_FONT,
    fill: WaveComposerColors.textColorProperty,
    maxWidth: CAPTION_MAX_WIDTH,
  });

  const recordLabelProperty = new DerivedProperty(
    [model.isRecordingProperty, controls.recordStringProperty, controls.stopRecordingStringProperty],
    (recording, record, stop) => (recording ? stop : record),
  );
  const recordButton = new TextPushButton(recordLabelProperty, {
    font: WaveComposerConstants.CONTROL_FONT,
    baseColor: WaveComposerColors.buttonFillColorProperty,
    textFill: WaveComposerColors.textColorProperty,
    buttonAppearanceStrategy: ButtonNode.FlatAppearanceStrategy,
    maxTextWidth: BUTTON_MAX_TEXT_WIDTH,
    listener: () => {
      if (model.isRecordingProperty.value) {
        model.stopRecording();
      } else {
        model.startRecording().catch(() => undefined);
      }
    },
    tandem: Tandem.OPT_OUT,
  });

  const saveButton = new TextPushButton(controls.saveRecordingStringProperty, {
    font: WaveComposerConstants.CONTROL_FONT,
    baseColor: WaveComposerColors.buttonFillColorProperty,
    disabledColor: WaveComposerColors.buttonDisabledFillColorProperty,
    textFill: WaveComposerColors.textColorProperty,
    buttonAppearanceStrategy: ButtonNode.FlatAppearanceStrategy,
    maxTextWidth: BUTTON_MAX_TEXT_WIDTH,
    enabledProperty: new DerivedProperty([model.audioSourceProperty], (value) => model.isRecordingId(value)),
    listener: () => {
      const entry = model.getRecording(model.audioSourceProperty.value);
      if (entry) {
        downloadBlob(encodeWav(entry.samples, entry.sampleRate), `recording-${entry.index}.wav`);
      }
    },
    tandem: Tandem.OPT_OUT,
  });

  const recordControls = new HBox({ spacing: 6, align: "center", children: [recordButton, saveButton] });

  // Transient feedback for audio failures (e.g. microphone permission denied),
  // hidden until the model reports one so it never reserves layout space. The
  // model exposes an AudioNotice key; the localized text lives with the other
  // control strings so it follows locale switches.
  const noticeStringProperties: Record<AudioNotice, TReadOnlyProperty<string>> = {
    [AudioNotice.MICROPHONE_DENIED]: controls.noticeMicrophoneDeniedStringProperty,
    [AudioNotice.MICROPHONE_UNAVAILABLE]: controls.noticeMicrophoneUnavailableStringProperty,
    [AudioNotice.RECORDING_LIMIT]: controls.noticeRecordingLimitStringProperty,
  };
  const noticeTextProperty = DerivedProperty.deriveAny(
    [model.audioNoticeProperty, ...Object.values(noticeStringProperties)],
    () => {
      const key = model.audioNoticeProperty.value;
      return key ? noticeStringProperties[key].value : "";
    },
  );
  const notice = new Text(noticeTextProperty, {
    font: WaveComposerConstants.LABEL_FONT,
    fill: WaveComposerColors.noticeColorProperty,
    maxWidth: CAPTION_MAX_WIDTH,
    visibleProperty: new DerivedProperty([model.audioNoticeProperty], (key) => key !== null),
  });

  return new VBox({ align: "left", spacing: 4, children: [comboContainer, caption, recordControls, notice] });
}
