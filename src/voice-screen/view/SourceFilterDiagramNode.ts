/**
 * SourceFilterDiagramNode.ts
 *
 * Pedagogical source–filter diagram for the Voice screen: glottal excitation
 * drives a vocal-tract resonator whose peaks (F1–F3) shape the output spectrum.
 */
import { DerivedProperty, type TReadOnlyProperty } from "scenerystack/axon";
import { HBox, type Node, Rectangle, Text, VBox } from "scenerystack/scenery";
import { ArrowNode } from "scenerystack/scenery-phet";
import { Panel } from "scenerystack/sun";
import { StringManager } from "../../i18n/StringManager.js";
import WaveComposerColors from "../../WaveComposerColors.js";
import { WaveComposerConstants } from "../../WaveComposerConstants.js";
import type { VoiceModel } from "../model/VoiceModel.js";

const BOX_WIDTH = 88;
const BOX_HEIGHT = 44;

export class SourceFilterDiagramNode extends Panel {
  public constructor(model: VoiceModel) {
    const physics = StringManager.getInstance().getPhysicsStrings();
    const readout = StringManager.getInstance().getReadoutStrings();

    const sourceBox = labeledBox(physics.glottalSourceStringProperty, WaveComposerColors.sourceFilterColorProperty);
    const filterBox = labeledBox(physics.vocalTractStringProperty, WaveComposerColors.lpcEnvelopeColorProperty);
    const outputBox = labeledBox(physics.resonanceStringProperty, WaveComposerColors.accentColorProperty);

    const f1Label = formantResonanceLabel(readout.formant1StringProperty, model.f1FrequencyProperty);
    const f2Label = formantResonanceLabel(readout.formant2StringProperty, model.f2FrequencyProperty);
    const f3Label = formantResonanceLabel(readout.formant3StringProperty, model.f3FrequencyProperty);

    const filterDetail = new VBox({
      align: "center",
      spacing: 2,
      children: [filterBox, new HBox({ spacing: 6, children: [f1Label, f2Label, f3Label] })],
    });

    const diagram = new HBox({
      spacing: 10,
      align: "center",
      children: [
        sourceBox,
        new ArrowNode(0, 0, 28, 0, {
          fill: WaveComposerColors.textColorProperty,
          tailWidth: 6,
          headWidth: 10,
          headHeight: 8,
        }),
        filterDetail,
        new ArrowNode(0, 0, 28, 0, {
          fill: WaveComposerColors.textColorProperty,
          tailWidth: 6,
          headWidth: 10,
          headHeight: 8,
        }),
        outputBox,
      ],
    });

    const tuningIndicator = new Text(
      new DerivedProperty(
        // Stabilized pitch, so the callout does not blink in and out with the
        // per-frame estimate as it crosses the 60 Hz threshold.
        [model.stableF0Property, model.f1FrequencyProperty, physics.resonanceTuningStringProperty],
        (f0, f1, text) => (f0 > 0 && f1 > 0 && Math.abs(f0 - f1) < 60 ? text : ""),
      ),
      {
        font: WaveComposerConstants.LABEL_FONT,
        fill: WaveComposerColors.resonanceTuningColorProperty,
        maxWidth: 360,
      },
    );

    const content = new VBox({
      align: "left",
      spacing: 8,
      children: [
        new Text(physics.sourceFilterStringProperty, {
          font: WaveComposerConstants.PANEL_TITLE_FONT,
          fill: WaveComposerColors.textColorProperty,
        }),
        diagram,
        tuningIndicator,
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

function labeledBox(label: TReadOnlyProperty<string>, fill: import("scenerystack/scenery").ProfileColorProperty): Node {
  return new VBox({
    align: "center",
    spacing: 4,
    children: [
      new Rectangle(0, 0, BOX_WIDTH, BOX_HEIGHT, {
        fill,
        opacity: 0.35,
        stroke: WaveComposerColors.panelBorderColorProperty,
        cornerRadius: 4,
      }),
      new Text(label, {
        font: WaveComposerConstants.LABEL_FONT,
        fill: WaveComposerColors.textColorProperty,
        maxWidth: BOX_WIDTH,
      }),
    ],
  });
}

function formantResonanceLabel(
  nameProperty: TReadOnlyProperty<string>,
  frequencyProperty: TReadOnlyProperty<number>,
): Node {
  const text = new DerivedProperty([nameProperty, frequencyProperty], (name, hz) =>
    hz > 0 ? `${name} ${Math.round(hz)}` : name,
  );
  return new Text(text, { font: WaveComposerConstants.LABEL_FONT, fill: WaveComposerColors.textColorProperty });
}
