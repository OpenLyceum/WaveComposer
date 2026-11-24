/**
 * ComposePanelNode.ts
 *
 * Partial controls and pedagogical presets for the Composer screen.
 *
 * Each partial is one block: a color-swatch checkbox that switches it on, and
 * compact single-row frequency / amplitude / phase controls beneath. The swatch
 * color is the partial's identity — the same color draws its component trace in
 * the waveform chart, so a slider can be traced to the curve it moves. A partial
 * that is switched off dims but stays adjustable, so it can be set up before it
 * is heard.
 */
import { PatternStringProperty, type TReadOnlyProperty } from "scenerystack/axon";
import { Range, roundSymmetric } from "scenerystack/dot";
import { AlignGroup, Circle, HBox, Line, type Node, Text, VBox } from "scenerystack/scenery";
import { Checkbox, ComboBox, Panel } from "scenerystack/sun";
import { Tandem } from "scenerystack/tandem";
import { ComposePreset, ComposePresetValues } from "../../common/model/CompositionState.js";
import { createCompactNumberControl } from "../../common/view/CompactNumberControl.js";
import { StringManager } from "../../i18n/StringManager.js";
import WaveComposerColors, { PARTIAL_COLOR_PROPERTIES } from "../../WaveComposerColors.js";
import { WaveComposerConstants } from "../../WaveComposerConstants.js";
import type { ComposerModel } from "../model/ComposerModel.js";

const PANEL_WIDTH = 226;
/** Control rows span the panel's inner width exactly. */
const ROW_WIDTH = PANEL_WIDTH - 2 * WaveComposerConstants.PANEL_X_MARGIN;
const SWATCH_RADIUS = 5;
/** Opacity of a switched-off partial's controls — dimmed, but still adjustable. */
const DISABLED_PARTIAL_OPACITY = 0.5;

const FREQUENCY_RANGE = new Range(50, 2000);
const AMPLITUDE_RANGE = new Range(0, 1);
const PHASE_RANGE = new Range(0, 2 * Math.PI);
/** Phase steps in whole degrees (15° per arrow press) — the presets speak in degrees too. */
const PHASE_STEP_RAD = Math.PI / 12;
const DEGREES_PER_RADIAN = 180 / Math.PI;

export class ComposePanelNode extends Panel {
  public constructor(model: ComposerModel, listParent: Node) {
    const compose = StringManager.getInstance().getComposeStrings();
    const a11yControls = StringManager.getInstance().getA11yStrings().controls;

    const presetLabels: Record<ComposePreset, TReadOnlyProperty<string>> = {
      [ComposePreset.CUSTOM]: compose.customStringProperty,
      [ComposePreset.PURE_TONE]: compose.pureToneStringProperty,
      [ComposePreset.OCTAVE]: compose.octaveStringProperty,
      [ComposePreset.MAJOR_TRIAD]: compose.majorTriadStringProperty,
      [ComposePreset.BEATS]: compose.beatsStringProperty,
      [ComposePreset.PHASE_CANCEL]: compose.phaseCancelStringProperty,
      [ComposePreset.PHASE_QUADRATURE]: compose.phaseQuadratureStringProperty,
      [ComposePreset.HARMONIC_SERIES]: compose.harmonicSeriesStringProperty,
      [ComposePreset.SAWTOOTH_ISH]: compose.sawtoothIshStringProperty,
      [ComposePreset.SQUARE_ISH]: compose.squareIshStringProperty,
      [ComposePreset.TRIANGLE_ISH]: compose.triangleIshStringProperty,
    };

    const presetCombo = new ComboBox(
      model.composition.presetProperty,
      ComposePresetValues.map((value) => ({
        value,
        createNode: () => controlText(presetLabels[value]),
      })),
      listParent,
      {
        buttonFill: WaveComposerColors.buttonFillColorProperty,
        buttonStroke: WaveComposerColors.panelBorderColorProperty,
        listFill: WaveComposerColors.buttonFillColorProperty,
        listStroke: WaveComposerColors.panelBorderColorProperty,
        highlightFill: WaveComposerColors.comboBoxHighlightColorProperty,
        accessibleName: compose.presetStringProperty,
        maxWidth: PANEL_WIDTH,
        tandem: Tandem.OPT_OUT,
      },
    );

    // Shared groups keep every row's title column and value column the same width,
    // so all twelve sliders line up down the panel.
    const titleGroup = new AlignGroup({ matchVertical: false });
    const valueGroup = new AlignGroup({ matchVertical: false });

    const partialSections: Node[] = model.composition.partials.map((partial, index) => {
      const partialNumber = index + 1;
      const patternValues = { n: partialNumber };
      const label = new PatternStringProperty(compose.partialLabelStringProperty, patternValues);
      const swatchColorProperty = PARTIAL_COLOR_PROPERTIES[index] ?? WaveComposerColors.accentColorProperty;

      const enabledCheckbox = new Checkbox(
        partial.enabledProperty,
        new HBox({
          spacing: 6,
          children: [new Circle(SWATCH_RADIUS, { fill: swatchColorProperty }), controlText(label)],
        }),
        {
          boxWidth: 16,
          checkboxColor: WaveComposerColors.textColorProperty,
          checkboxColorBackground: WaveComposerColors.chartBackgroundColorProperty,
          accessibleName: label,
          tandem: Tandem.OPT_OUT,
        },
      );

      const sliders = new VBox({
        align: "left",
        spacing: 1,
        children: [
          createCompactNumberControl(compose.frequencyStringProperty, partial.frequencyProperty, FREQUENCY_RANGE, {
            titleGroup,
            valueGroup,
            rowWidth: ROW_WIDTH,
            delta: 1,
            accessibleName: new PatternStringProperty(a11yControls.partialFrequencyStringProperty, patternValues),
            numberDisplayOptions: { valuePattern: "{{value}} Hz" },
            sliderOptions: { keyboardStep: 10, shiftKeyboardStep: 1, pageKeyboardStep: 100 },
          }),
          createCompactNumberControl(compose.amplitudeStringProperty, partial.amplitudeProperty, AMPLITUDE_RANGE, {
            titleGroup,
            valueGroup,
            rowWidth: ROW_WIDTH,
            delta: 0.05,
            accessibleName: new PatternStringProperty(a11yControls.partialAmplitudeStringProperty, patternValues),
            numberDisplayOptions: { decimalPlaces: 2 },
            sliderOptions: { keyboardStep: 0.05, shiftKeyboardStep: 0.01, pageKeyboardStep: 0.2 },
          }),
          createCompactNumberControl(compose.phaseStringProperty, partial.phaseProperty, PHASE_RANGE, {
            titleGroup,
            valueGroup,
            rowWidth: ROW_WIDTH,
            delta: PHASE_STEP_RAD,
            accessibleName: new PatternStringProperty(a11yControls.partialPhaseStringProperty, patternValues),
            numberDisplayOptions: {
              numberFormatter: (radians) => `${roundSymmetric(radians * DEGREES_PER_RADIAN)}\u00b0`,
            },
            sliderOptions: {
              keyboardStep: PHASE_STEP_RAD,
              shiftKeyboardStep: PHASE_STEP_RAD / 3,
              pageKeyboardStep: PHASE_STEP_RAD * 6,
            },
          }),
        ],
      });
      // Dim, but do not disable: a partial can be dialed in before it is switched on.
      partial.enabledProperty.link((enabled) => {
        sliders.opacity = enabled ? 1 : DISABLED_PARTIAL_OPACITY;
      });

      return new VBox({
        align: "left",
        spacing: 3,
        children: [enabledCheckbox, sliders],
      });
    });

    const content = new VBox({
      align: "left",
      spacing: 7,
      children: [
        new Text(compose.titleStringProperty, {
          font: WaveComposerConstants.PANEL_TITLE_FONT,
          fill: WaveComposerColors.textColorProperty,
        }),
        sectionLabel(compose.presetStringProperty),
        presetCombo,
        divider(),
        ...partialSections,
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
