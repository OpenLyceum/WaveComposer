/**
 * VoiceQualityReadout.ts
 *
 * Compact panel for the Voice screen: a voiced/unvoiced indicator plus the
 * pitch, note, and the two voice-quality metrics (HNR and CPP). Values bind to
 * the screen model via DerivedProperties.
 */

import { DerivedProperty, type TReadOnlyProperty } from "scenerystack/axon";
import { roundSymmetric, toFixed } from "scenerystack/dot";
import { Circle, type Color, GridBox, HBox, type Node, Text, VBox } from "scenerystack/scenery";
import { Panel } from "scenerystack/sun";
import { StringManager } from "../../i18n/StringManager.js";
import WaveComposerColors from "../../WaveComposerColors.js";
import { WaveComposerConstants } from "../../WaveComposerConstants.js";
import type { VoiceModel } from "../model/VoiceModel.js";

const EMPTY = "—";

export class VoiceQualityReadout extends Panel {
  public constructor(model: VoiceModel) {
    const readout = StringManager.getInstance().getReadoutStrings();
    const panelStrings = StringManager.getInstance().getPanelStrings();

    const voicedFillProperty = new DerivedProperty(
      [model.isVoicedProperty, WaveComposerColors.voicedColorProperty, WaveComposerColors.unvoicedColorProperty],
      (voiced, on, off): Color => (voiced ? on : off),
    );
    const voicedTextProperty = new DerivedProperty(
      [model.isVoicedProperty, readout.voicedStringProperty, readout.unvoicedStringProperty],
      (voiced, on, off) => (voiced ? on : off),
    );
    const indicator = new HBox({
      spacing: 6,
      children: [
        new Circle(7, { fill: voicedFillProperty }),
        new Text(voicedTextProperty, {
          font: WaveComposerConstants.LABEL_FONT,
          fill: WaveComposerColors.textColorProperty,
        }),
      ],
    });

    const db = (n: number, valid: boolean): string => (valid ? `${toFixed(n, 1)} dB` : EMPTY);
    // Pitch and note read the model's slow readout pitch: the per-frame estimate
    // changes faster than the numbers can be read. Cents deviation stays here -
    // singing on pitch is the point of this screen - and rides the same clock.
    const pitchValueProperty = new DerivedProperty([model.stableF0Property], (f0) =>
      f0 > 0 ? `${roundSymmetric(f0)} Hz` : EMPTY,
    );
    const noteValueProperty = new DerivedProperty(
      [model.stableF0Property, model.noteNameProperty, model.centsProperty],
      (f0, note, cents) => (f0 > 0 && note ? `${note} ${cents >= 0 ? "+" : ""}${cents}¢` : EMPTY),
    );
    const hnrValueProperty = new DerivedProperty([model.hnrProperty, model.isVoicedProperty], (v, voiced) =>
      db(v, voiced),
    );
    const cppValueProperty = new DerivedProperty([model.cppProperty, model.isVoicedProperty], (v, voiced) =>
      db(v, voiced),
    );

    const grid = new GridBox({
      xSpacing: 16,
      ySpacing: 7,
      xAlign: "left",
      rows: [
        [label(readout.pitchStringProperty), value(pitchValueProperty)],
        [label(readout.noteStringProperty), value(noteValueProperty)],
        [label(readout.hnrStringProperty), value(hnrValueProperty)],
        [label(readout.cppStringProperty), value(cppValueProperty)],
      ],
    });

    const content = new VBox({
      align: "left",
      spacing: 10,
      children: [
        new Text(panelStrings.voiceQualityStringProperty, {
          font: WaveComposerConstants.PANEL_TITLE_FONT,
          fill: WaveComposerColors.textColorProperty,
        }),
        indicator,
        grid,
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

function label(stringProperty: TReadOnlyProperty<string>): Node {
  return new Text(stringProperty, {
    font: WaveComposerConstants.READOUT_LABEL_FONT,
    fill: WaveComposerColors.textColorProperty,
  });
}

function value(stringProperty: TReadOnlyProperty<string>): Node {
  return new Text(stringProperty, {
    font: WaveComposerConstants.READOUT_VALUE_FONT,
    fill: WaveComposerColors.accentColorProperty,
  });
}
