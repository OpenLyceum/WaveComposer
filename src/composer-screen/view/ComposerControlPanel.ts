/**
 * ComposerControlPanel.ts
 *
 * Playback, analysis settings, overlay toggles, and boundary-model controls
 * for the Composer screen.
 */
import type { Property, TReadOnlyProperty } from "scenerystack/axon";
import { Dimension2, Range } from "scenerystack/dot";
import { AlignGroup, Line, type Node, Text, VBox } from "scenerystack/scenery";
import { Checkbox, ComboBox, Panel } from "scenerystack/sun";
import { Tandem } from "scenerystack/tandem";
import { PipeBoundary, PipeBoundaryValues } from "../../common/model/PipeBoundary.js";
import { createCompactNumberControl } from "../../common/view/CompactNumberControl.js";
import { StringManager } from "../../i18n/StringManager.js";
import WaveComposerColors from "../../WaveComposerColors.js";
import { WaveComposerConstants } from "../../WaveComposerConstants.js";
import type { ComposerModel } from "../model/ComposerModel.js";
import type { ComposerViewProperties } from "./ComposerViewProperties.js";

const MAX_FREQUENCY_RANGE = new Range(500, 3000);
const PANEL_WIDTH = 232;
/** Shorter track than the partial sliders: these titles and values are wider. */
const RANGE_SLIDER_TRACK_SIZE = new Dimension2(40, 3);
/** Control rows span the panel's inner width exactly. */
const ROW_WIDTH = PANEL_WIDTH - 2 * WaveComposerConstants.PANEL_X_MARGIN;

export class ComposerControlPanel extends Panel {
  public constructor(model: ComposerModel, viewProperties: ComposerViewProperties, listParent: Node) {
    const controls = StringManager.getInstance().getControlStrings();
    const panelStrings = StringManager.getInstance().getPanelStrings();
    const physics = StringManager.getInstance().getPhysicsStrings();

    const pipeBoundaryLabels: Record<PipeBoundary, TReadOnlyProperty<string>> = {
      [PipeBoundary.NONE]: physics.noneStringProperty,
      [PipeBoundary.STRING]: physics.stringStringProperty,
      [PipeBoundary.OPEN_PIPE]: physics.openPipeStringProperty,
      [PipeBoundary.CLOSED_PIPE]: physics.closedPipeStringProperty,
    };

    const a11yControls = StringManager.getInstance().getA11yStrings().controls;

    // Shared columns so the two range controls line up.
    const titleGroup = new AlignGroup({ matchVertical: false });
    const valueGroup = new AlignGroup({ matchVertical: false });

    const overlays = new VBox({
      align: "left",
      spacing: 4,
      children: [
        sectionLabel(controls.overlaysStringProperty),
        makeCheckbox(viewProperties.showComponentsProperty, controls.showComponentsStringProperty),
        makeCheckbox(viewProperties.showHarmonicsProperty, controls.showHarmonicsStringProperty),
        makeCheckbox(viewProperties.showPipeOverlayProperty, controls.showPipeOverlayStringProperty),
        makeCheckbox(viewProperties.showModeNumbersProperty, controls.showModeNumbersStringProperty),
      ],
    });

    const content = new VBox({
      align: "left",
      spacing: 6,
      children: [
        new Text(panelStrings.controlsStringProperty, {
          font: WaveComposerConstants.PANEL_TITLE_FONT,
          fill: WaveComposerColors.textColorProperty,
        }),
        makeCheckbox(
          model.isAudioEnabledProperty,
          controls.playAudioStringProperty,
          a11yControls.playAudioStringProperty,
          // Greyed out while sound is off globally, where checking it would do nothing.
          model.isGlobalAudioEnabledProperty,
        ),
        makeCheckbox(model.isFrozenProperty, controls.freezeStringProperty, a11yControls.freezeStringProperty),
        divider(),
        createCompactNumberControl(
          controls.maxFrequencyStringProperty,
          model.maxFrequencyProperty,
          MAX_FREQUENCY_RANGE,
          {
            titleGroup,
            valueGroup,
            delta: 500,
            numberDisplayOptions: { valuePattern: "{{value}} Hz" },
            rowWidth: ROW_WIDTH,
            sliderOptions: { trackSize: RANGE_SLIDER_TRACK_SIZE, keyboardStep: 500 },
          },
        ),
        createCompactNumberControl(
          controls.timeWindowStringProperty,
          viewProperties.timeWindowMsProperty,
          WaveComposerConstants.TIME_WINDOW_MS_RANGE,
          {
            titleGroup,
            valueGroup,
            delta: 10,
            numberDisplayOptions: { valuePattern: "{{value}} ms" },
            rowWidth: ROW_WIDTH,
            sliderOptions: { trackSize: RANGE_SLIDER_TRACK_SIZE, keyboardStep: 10 },
          },
        ),
        divider(),
        overlays,
        sectionLabel(controls.pipeBoundaryStringProperty),
        new ComboBox(
          model.pipeBoundaryProperty,
          PipeBoundaryValues.map((value) => ({
            value,
            createNode: () => controlText(pipeBoundaryLabels[value]),
          })),
          listParent,
          {
            buttonFill: WaveComposerColors.buttonFillColorProperty,
            buttonStroke: WaveComposerColors.panelBorderColorProperty,
            listFill: WaveComposerColors.buttonFillColorProperty,
            listStroke: WaveComposerColors.panelBorderColorProperty,
            highlightFill: WaveComposerColors.comboBoxHighlightColorProperty,
            accessibleName: controls.pipeBoundaryStringProperty,
            tandem: Tandem.OPT_OUT,
          },
        ),
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
