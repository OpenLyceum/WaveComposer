/**
 * VoiceScreenView.ts
 *
 * The Voice & Vowels screen: an F1×F2 vowel chart on the left, a cepstrum chart
 * on the right, and a voice-quality readout below it. The screen owns an
 * independent VoiceModel, so its source and analysis settings are isolated.
 */
import { type EmptySelfOptions, optionize } from "scenerystack/phet-core";
import { Node } from "scenerystack/scenery";
import type { ScreenViewOptions } from "scenerystack/sim";
import { BaseAnalysisScreenView } from "../../common/view/BaseAnalysisScreenView.js";
import { WaveComposerScreenSummaryContent } from "../../common/view/WaveComposerScreenSummaryContent.js";
import { StringManager } from "../../i18n/StringManager.js";
import { WaveComposerConstants } from "../../WaveComposerConstants.js";
import type { VoiceModel } from "../model/VoiceModel.js";
import { AudioSourceControl } from "./AudioSourceControl.js";
import { CepstrumNode } from "./CepstrumNode.js";
import { SourceFilterDiagramNode } from "./SourceFilterDiagramNode.js";
import { VoiceQualityReadout } from "./VoiceQualityReadout.js";
import { VowelPlotNode } from "./VowelPlotNode.js";

const MARGIN = WaveComposerConstants.SCREEN_MARGIN;
const SPACING = WaveComposerConstants.SPACING;
const CHART_LEFT_GUTTER = 56;
const VOWEL_PLOT_SIZE = 360;
const CEPSTRUM_HEIGHT = 200;

export type VoiceScreenViewOptions = ScreenViewOptions;

export class VoiceScreenView extends BaseAnalysisScreenView {
  private readonly vowelPlot: VowelPlotNode;

  public constructor(model: VoiceModel, providedOptions?: VoiceScreenViewOptions) {
    const options = optionize<VoiceScreenViewOptions, EmptySelfOptions, ScreenViewOptions>()(
      {
        screenSummaryContent: new WaveComposerScreenSummaryContent(StringManager.getInstance().getA11yStrings().voice),
      },
      providedOptions,
    );
    super(options);

    // ── Vowel plot (left) ───────────────────────────────────────────────────
    this.vowelPlot = new VowelPlotNode(model, { viewWidth: VOWEL_PLOT_SIZE, viewHeight: VOWEL_PLOT_SIZE });
    const vowelContainer = new Node({ children: [this.vowelPlot] });
    vowelContainer.left = this.layoutBounds.minX + MARGIN;
    vowelContainer.top = this.layoutBounds.minY + MARGIN;
    this.addChild(vowelContainer);

    // ── Audio source control (below the vowel plot) ─────────────────────────
    const sourceControl = new AudioSourceControl(model, this.popupLayer);
    sourceControl.left = vowelContainer.left;
    sourceControl.top = vowelContainer.bottom + SPACING;
    this.addChild(sourceControl);

    // ── Cepstrum + readout (right) ──────────────────────────────────────────
    // The panels below line up with the cepstrum's axis labels, which take up the
    // gutter to the left of its plotting area, so the plot itself gets what is left.
    const rightLeft = vowelContainer.right + SPACING + CHART_LEFT_GUTTER;
    const cepstrumWidth = this.layoutBounds.maxX - MARGIN - rightLeft - CHART_LEFT_GUTTER;

    const cepstrum = new CepstrumNode(model, { viewWidth: cepstrumWidth, viewHeight: CEPSTRUM_HEIGHT });
    const cepstrumContainer = new Node({ children: [cepstrum] });
    cepstrumContainer.left = rightLeft;
    cepstrumContainer.top = this.layoutBounds.minY + MARGIN;
    this.addChild(cepstrumContainer);

    const sourceFilterDiagram = new SourceFilterDiagramNode(model);
    sourceFilterDiagram.left = rightLeft;
    sourceFilterDiagram.top = cepstrumContainer.bottom + SPACING;
    this.addChild(sourceFilterDiagram);

    const readout = new VoiceQualityReadout(model);
    readout.left = rightLeft;
    readout.top = sourceFilterDiagram.bottom + SPACING;
    this.addChild(readout);

    this.addResetAllButton(model, () => this.reset());
    this.establishPdomOrder([vowelContainer, sourceControl, cepstrumContainer, sourceFilterDiagram, readout]);
    this.addPopupLayer();
  }

  public reset(): void {
    this.vowelPlot.reset();
  }
}
