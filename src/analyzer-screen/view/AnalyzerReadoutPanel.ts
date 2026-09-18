/**
 * AnalyzerReadoutPanel.ts
 *
 * Numeric measurement readouts for the music-analysis screen: pitch (F0), the
 * musical note it lands on, and an input-level meter. Pitch and note bind to the
 * model's slow readout pitch rather than the per-frame estimate, so they hold
 * still long enough to read; the panel itself holds no DSP state. Voice
 * measurements (formants, HNR, CPP) belong to the Voice & Vowels screen.
 */

import { DerivedProperty, type TReadOnlyProperty } from "scenerystack/axon";
import { GridBox, HBox, Node, Rectangle, Text, VBox } from "scenerystack/scenery";
import { Panel } from "scenerystack/sun";
import { StringManager } from "../../i18n/StringManager.js";
import WaveComposerColors from "../../WaveComposerColors.js";
import { WaveComposerConstants } from "../../WaveComposerConstants.js";
import type { AnalyzerModel } from "../model/AnalyzerModel.js";

const EMPTY = "—";
const LEVEL_BAR_WIDTH = 150;
const LEVEL_BAR_HEIGHT = 10;
const LEVEL_FULL_SCALE_RMS = 0.5;

export class AnalyzerReadoutPanel extends Panel {
  public constructor(model: AnalyzerModel) {
    const readout = StringManager.getInstance().getReadoutStrings();
    const panelStrings = StringManager.getInstance().getPanelStrings();

    // ── Numeric rows ──────────────────────────────────────────────────────────
    const hz = (n: number): string => (n > 0 ? `${Math.round(n)} Hz` : EMPTY);

    const pitchValue = new DerivedProperty([model.stableF0Property], hz);
    // A note name only means something once a pitch was actually found.
    const noteValue = new DerivedProperty([model.stableF0Property, model.noteNameProperty], (f0, note) =>
      f0 > 0 && note ? note : EMPTY,
    );

    const rows: Node[][] = [
      [label(readout.pitchStringProperty), value(pitchValue)],
      [label(readout.noteStringProperty), value(noteValue)],
    ];
    const grid = new GridBox({ rows, xSpacing: 16, ySpacing: 5, xAlign: "left" });

    // ── Input-level meter ──────────────────────────────────────────────────────
    const levelTrack = new Rectangle(0, 0, LEVEL_BAR_WIDTH, LEVEL_BAR_HEIGHT, {
      fill: WaveComposerColors.chartBackgroundColorProperty,
      stroke: WaveComposerColors.panelBorderColorProperty,
      cornerRadius: 2,
    });
    const levelFill = new Rectangle(0, 0, 0, LEVEL_BAR_HEIGHT, {
      fill: WaveComposerColors.accentColorProperty,
      cornerRadius: 2,
    });
    model.rmsLevelProperty.link((rms) => {
      const fraction = Math.max(0, Math.min(1, rms / LEVEL_FULL_SCALE_RMS));
      levelFill.setRect(0, 0, fraction * LEVEL_BAR_WIDTH, LEVEL_BAR_HEIGHT);
    });
    const levelMeter = new HBox({
      spacing: 8,
      children: [
        new Text(readout.levelStringProperty, {
          font: WaveComposerConstants.LABEL_FONT,
          fill: WaveComposerColors.textColorProperty,
        }),
        new Node({ children: [levelTrack, levelFill] }),
      ],
    });

    const content = new VBox({
      align: "left",
      spacing: 8,
      children: [
        new Text(panelStrings.measurementsStringProperty, {
          font: WaveComposerConstants.PANEL_TITLE_FONT,
          fill: WaveComposerColors.textColorProperty,
        }),
        grid,
        levelMeter,
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
