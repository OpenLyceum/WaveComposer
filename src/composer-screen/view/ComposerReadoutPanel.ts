/**
 * ComposerReadoutPanel.ts
 *
 * Live readouts for the wave-composition screen: fundamental, beat rate, active
 * partial count, and a short pedagogical caption.
 */

import { DerivedProperty, type TReadOnlyProperty } from "scenerystack/axon";
import { toFixed } from "scenerystack/dot";
import { GridBox, type Node, Text, VBox } from "scenerystack/scenery";
import { Panel } from "scenerystack/sun";
import { noteNameFromFrequency } from "../../common/model/dsp/NoteUtils.js";
import { StringManager } from "../../i18n/StringManager.js";
import WaveComposerColors from "../../WaveComposerColors.js";
import { WaveComposerConstants } from "../../WaveComposerConstants.js";
import type { ComposerModel } from "../model/ComposerModel.js";

const EMPTY = "—";

export class ComposerReadoutPanel extends Panel {
  public constructor(model: ComposerModel) {
    const readout = StringManager.getInstance().getReadoutStrings();
    const composerStrings = StringManager.getInstance().getComposerScreenStrings();
    const panelStrings = StringManager.getInstance().getPanelStrings();

    const partialDependencies = model.composition.partials.flatMap((partial) => [
      partial.frequencyProperty,
      partial.amplitudeProperty,
      partial.enabledProperty,
    ]);

    // The composition's own fundamental, not the analyzed one: here the user sets
    // the partials, so the exact value is already known and follows the sliders
    // with no detector lag.
    const fundamentalValue = DerivedProperty.deriveAny(partialDependencies, () => {
      const f0 = model.getFundamentalHz();
      return f0 > 0 ? `${Math.round(f0)} Hz` : EMPTY;
    });
    const noteValue = DerivedProperty.deriveAny(
      partialDependencies,
      () => noteNameFromFrequency(model.getFundamentalHz()) || EMPTY,
    );
    const beatValue = DerivedProperty.deriveAny(partialDependencies, () => {
      const beatHz = model.getBeatRateHz();
      return beatHz > 0 ? `${toFixed(beatHz, 1)} Hz` : EMPTY;
    });
    const partialCountValue = DerivedProperty.deriveAny(partialDependencies, () => {
      const count = model.composition.partials.filter(
        (partial) => partial.enabledProperty.value && partial.frequencyProperty.value > 0,
      ).length;
      return `${count}`;
    });

    const grid = new GridBox({
      xSpacing: 16,
      ySpacing: 7,
      xAlign: "left",
      rows: [
        [label(readout.pitchStringProperty), value(fundamentalValue)],
        [label(readout.noteStringProperty), value(noteValue)],
        [label(composerStrings.beatRateStringProperty), value(beatValue)],
        [label(composerStrings.activePartialsStringProperty), value(partialCountValue)],
      ],
    });

    const caption = new Text(composerStrings.introStringProperty, {
      font: WaveComposerConstants.LABEL_FONT,
      fill: WaveComposerColors.textColorProperty,
      maxWidth: 220,
    });

    const content = new VBox({
      align: "left",
      spacing: 10,
      children: [
        new Text(panelStrings.measurementsStringProperty, {
          font: WaveComposerConstants.PANEL_TITLE_FONT,
          fill: WaveComposerColors.textColorProperty,
        }),
        grid,
        caption,
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
