/**
 * ComposerScreenView.ts
 *
 * The wave-composition screen: partial controls on the left, waveform / spectrum /
 * standing-wave charts in the center, and live readouts on the right.
 */

import { type EmptySelfOptions, optionize } from "scenerystack/phet-core";
import { VBox } from "scenerystack/scenery";
import type { ScreenViewOptions } from "scenerystack/sim";
import { SpectrumNode } from "../../analyzer-screen/view/SpectrumNode.js";
import { WaveformNode } from "../../analyzer-screen/view/WaveformNode.js";
import { BaseAnalysisScreenView } from "../../common/view/BaseAnalysisScreenView.js";
import { WaveComposerScreenSummaryContent } from "../../common/view/WaveComposerScreenSummaryContent.js";
import { StringManager } from "../../i18n/StringManager.js";
import WaveComposerColors, { PARTIAL_COLOR_PROPERTIES } from "../../WaveComposerColors.js";
import { WaveComposerConstants } from "../../WaveComposerConstants.js";
import type { ComposerModel } from "../model/ComposerModel.js";
import { ComposePanelNode } from "./ComposePanelNode.js";
import { ComposerControlPanel } from "./ComposerControlPanel.js";
import { ComposerReadoutPanel } from "./ComposerReadoutPanel.js";
import type { ComposerViewProperties } from "./ComposerViewProperties.js";
import { StandingWaveNode } from "./StandingWaveNode.js";

const MARGIN = WaveComposerConstants.SCREEN_MARGIN;
const SPACING = WaveComposerConstants.SPACING;
/** Horizontal space reserved for each chart's y-axis title + tick labels. */
const CHART_LEFT_GUTTER = 56;
/**
 * Vertical space a ChartFrame occupies *below* its plotting area for x-axis tick
 * labels and the axis title. Excluding it is what used to push the bottom chart
 * off the screen.
 */
const CHART_BOTTOM_GUTTER = 32;
/** Share of the available plot height given to each chart (must total 1). */
const WAVEFORM_HEIGHT_FRACTION = 0.32;
const SPECTRUM_HEIGHT_FRACTION = 0.42;

export type ComposerScreenViewOptions = ScreenViewOptions;

export class ComposerScreenView extends BaseAnalysisScreenView {
  private readonly viewProperties: ComposerViewProperties;

  public constructor(
    model: ComposerModel,
    viewProperties: ComposerViewProperties,
    providedOptions?: ComposerScreenViewOptions,
  ) {
    const options = optionize<ComposerScreenViewOptions, EmptySelfOptions, ScreenViewOptions>()(
      {
        screenSummaryContent: new WaveComposerScreenSummaryContent(
          StringManager.getInstance().getA11yStrings().composer,
        ),
      },
      providedOptions,
    );
    super(options);
    this.viewProperties = viewProperties;

    const readoutPanel = new ComposerReadoutPanel(model);
    readoutPanel.right = this.layoutBounds.maxX - MARGIN;
    readoutPanel.top = this.layoutBounds.minY + MARGIN;
    this.addChild(readoutPanel);

    // Both right-column panels hang off the right edge, so whichever ends up wider
    // stays inside the screen instead of growing off it.
    const controlPanel = new ComposerControlPanel(model, this.viewProperties, this.popupLayer);
    controlPanel.right = this.layoutBounds.maxX - MARGIN;
    controlPanel.top = readoutPanel.bottom + SPACING;
    this.addChild(controlPanel);

    const composePanel = new ComposePanelNode(model, this.popupLayer);
    composePanel.left = this.layoutBounds.minX + MARGIN;
    composePanel.top = this.layoutBounds.minY + MARGIN;
    this.addChild(composePanel);

    const chartLeft = composePanel.right + SPACING;
    const chartRight = Math.min(readoutPanel.left, controlPanel.left) - SPACING;
    const chartViewWidth = chartRight - chartLeft - CHART_LEFT_GUTTER;

    const chartsTop = this.layoutBounds.minY + MARGIN;
    const chartsBottom = this.layoutBounds.maxY - MARGIN;
    const interChartSpacing = SPACING;
    // Each chart also needs room under its plotting area for the x-axis labels. The
    // column stops short of the Reset All button horizontally, so it can run the
    // full height.
    const usableChartHeight = chartsBottom - chartsTop - 2 * interChartSpacing - 3 * CHART_BOTTOM_GUTTER;
    const waveformHeight = Math.round(usableChartHeight * WAVEFORM_HEIGHT_FRACTION);
    const spectrumHeight = Math.round(usableChartHeight * SPECTRUM_HEIGHT_FRACTION);
    const standingWaveHeight = usableChartHeight - waveformHeight - spectrumHeight;

    const waveform = new WaveformNode(model, this.viewProperties, {
      viewWidth: chartViewWidth,
      viewHeight: waveformHeight,
      componentsVisibleProperty: this.viewProperties.showComponentsProperty,
      componentTraces: model.composition.partials.map((_partial, index) => ({
        colorProperty: PARTIAL_COLOR_PROPERTIES[index] ?? WaveComposerColors.waveformColorProperty,
        fill: (out: Float32Array) => model.fillPartialWaveform(index, out),
      })),
    });
    const spectrum = new SpectrumNode(model, this.viewProperties, {
      viewWidth: chartViewWidth,
      viewHeight: spectrumHeight,
    });
    const standingWave = new StandingWaveNode(model, {
      viewWidth: chartViewWidth,
      viewHeight: standingWaveHeight,
      emptyMessage: StringManager.getInstance().getPhysicsStrings().noStandingWaveModesStringProperty,
    });

    const charts = new VBox({
      align: "left",
      spacing: interChartSpacing,
      children: [waveform, spectrum, standingWave],
    });
    charts.left = chartLeft;
    charts.top = chartsTop;
    this.addChild(charts);

    this.addResetAllButton(model, () => this.reset());
    this.establishPdomOrder([composePanel, charts, controlPanel, readoutPanel]);
    this.addPopupLayer();
  }

  public reset(): void {
    this.viewProperties.reset();
  }
}
