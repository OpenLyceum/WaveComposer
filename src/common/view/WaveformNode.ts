/**
 * WaveformNode.ts
 *
 * Time-domain oscilloscope of the current frame. Shows the first
 * `timeWindowMsProperty` milliseconds of the analyzed waveform, decimated to
 * roughly one point per view pixel so longer windows stay cheap to draw.
 *
 * Callers may supply {@link WaveformComponentTrace}s — individual signals that
 * add up to the displayed curve. They are drawn faintly underneath it, which is
 * what turns the Composer screen's oscilloscope into a picture of superposition
 * rather than just its result.
 */
import type { TReadOnlyProperty } from "scenerystack/axon";
import { CanvasLinePlot, ChartCanvasNode, type ChartTransform } from "scenerystack/bamboo";
import { Range, Vector2 } from "scenerystack/dot";
import { type Color, Node } from "scenerystack/scenery";
import { StringManager } from "../../i18n/StringManager.js";
import WaveComposerColors from "../../WaveComposerColors.js";
import { WaveComposerConstants } from "../../WaveComposerConstants.js";
import type { BaseAnalysisModel } from "../model/BaseAnalysisModel.js";
import { hasDisplayWaveform } from "../model/HarmonicChartModel.js";
import { ChartFrame } from "./ChartFrame.js";
import type { ChartOverlayProperties } from "./ChartOverlayProperties.js";

/** One constituent signal of the displayed waveform. */
export interface WaveformComponentTrace {
  readonly colorProperty: TReadOnlyProperty<Color>;
  /** Fills `out` with this component's samples; returns false when it has nothing to draw. */
  fill(out: Float32Array): boolean;
}

interface WaveformNodeOptions {
  viewWidth: number;
  viewHeight: number;
  /** Constituent signals drawn faintly beneath the summed curve. */
  componentTraces?: readonly WaveformComponentTrace[];
  /** Gates the component traces; ignored when no traces are supplied. */
  componentsVisibleProperty?: TReadOnlyProperty<boolean>;
}

const TIME_TICK_SPACING_MS = 10;
const AMPLITUDE_TICK_SPACING = 0.5;
/** Component traces sit behind the sum: thinner and translucent. */
const COMPONENT_LINE_WIDTH = 1;
const COMPONENT_ALPHA = 0.65;

export class WaveformNode extends Node {
  private readonly model: BaseAnalysisModel;
  private readonly viewProperties: ChartOverlayProperties;
  private readonly maxPoints: number;
  private readonly chartTransform: ChartTransform;
  private readonly plot: CanvasLinePlot;
  private readonly chartCanvas: ChartCanvasNode;
  private readonly componentTraces: readonly WaveformComponentTrace[];
  private readonly componentPlots: readonly CanvasLinePlot[];
  private displayWaveformBuffer = new Float32Array(0);
  private componentBuffer = new Float32Array(0);

  public constructor(model: BaseAnalysisModel, viewProperties: ChartOverlayProperties, options: WaveformNodeOptions) {
    super();
    this.model = model;
    this.viewProperties = viewProperties;
    this.maxPoints = Math.max(2, Math.round(options.viewWidth));
    const axisStrings = StringManager.getInstance().getAxisStrings();

    const frame = new ChartFrame({
      viewWidth: options.viewWidth,
      viewHeight: options.viewHeight,
      xRange: new Range(0, viewProperties.timeWindowMsProperty.value),
      yRange: new Range(-WaveComposerConstants.WAVEFORM_AMPLITUDE, WaveComposerConstants.WAVEFORM_AMPLITUDE),
      xSpacing: TIME_TICK_SPACING_MS,
      ySpacing: AMPLITUDE_TICK_SPACING,
      xLabel: axisStrings.timeStringProperty,
      yLabel: axisStrings.amplitudeStringProperty,
    });
    this.chartTransform = frame.chartTransform;

    this.componentTraces = options.componentTraces ?? [];
    this.componentPlots = this.componentTraces.map(
      (trace) =>
        new CanvasLinePlot(this.chartTransform, [], {
          stroke: trace.colorProperty.value.withAlpha(COMPONENT_ALPHA).toCSS(),
          lineWidth: COMPONENT_LINE_WIDTH,
        }),
    );
    this.plot = new CanvasLinePlot(this.chartTransform, [], {
      stroke: WaveComposerColors.waveformColorProperty.value.toCSS(),
      lineWidth: 1.5,
    });
    // Components first so the sum they add up to is painted over them.
    this.chartCanvas = new ChartCanvasNode(this.chartTransform, [...this.componentPlots, this.plot]);
    frame.plotLayer.addChild(this.chartCanvas);
    this.addChild(frame);

    WaveComposerColors.waveformColorProperty.lazyLink((color) => {
      this.plot.setStroke(color.toCSS());
      this.chartCanvas.update();
    });
    this.componentTraces.forEach((trace, index) => {
      trace.colorProperty.lazyLink((color) => {
        this.componentPlots[index]?.setStroke(color.withAlpha(COMPONENT_ALPHA).toCSS());
        this.chartCanvas.update();
      });
    });
    options.componentsVisibleProperty?.link((visible) => {
      for (const plot of this.componentPlots) {
        plot.visible = visible;
      }
      this.update();
    });
    viewProperties.timeWindowMsProperty.lazyLink((ms) => {
      this.chartTransform.setModelXRange(new Range(0, ms));
      this.update();
    });

    model.frameProcessedEmitter.addListener(() => this.update());
  }

  private update(): void {
    const sampleRate = this.model.sampleRateProperty.value;
    const windowMs = this.viewProperties.timeWindowMsProperty.value;
    const windowSamples = Math.max(2, Math.round((windowMs / 1000) * sampleRate));

    let waveform: Float32Array;
    let sampleCount: number;
    if (hasDisplayWaveform(this.model)) {
      if (this.displayWaveformBuffer.length < windowSamples) {
        this.displayWaveformBuffer = new Float32Array(windowSamples);
      }
      waveform = this.displayWaveformBuffer.subarray(0, windowSamples);
      this.model.fillDisplayWaveform(waveform);
      sampleCount = windowSamples;
    } else {
      const analysis = this.model.analysis;
      if (!analysis) {
        return;
      }
      waveform = analysis.waveform;
      sampleCount = Math.min(waveform.length, windowSamples);
    }

    const step = Math.max(1, Math.ceil(sampleCount / this.maxPoints));
    this.plot.setDataSet(sampleSeries(waveform, sampleCount, step, sampleRate));
    this.updateComponentPlots(sampleCount, step, sampleRate);
    this.chartCanvas.update();
  }

  /** Redraws the constituent traces over the same window as the summed curve. */
  private updateComponentPlots(sampleCount: number, step: number, sampleRate: number): void {
    if (this.componentPlots.length === 0) {
      return;
    }
    if (this.componentBuffer.length < sampleCount) {
      this.componentBuffer = new Float32Array(sampleCount);
    }
    const buffer = this.componentBuffer.subarray(0, sampleCount);
    for (let i = 0; i < this.componentPlots.length; i++) {
      const plot = this.componentPlots[i];
      const trace = this.componentTraces[i];
      if (!(plot && trace)) {
        continue;
      }
      // Skip the per-sample work entirely while the traces are hidden.
      const hasData = plot.visible && trace.fill(buffer);
      plot.setDataSet(hasData ? sampleSeries(buffer, sampleCount, step, sampleRate) : []);
    }
  }
}

/** Decimates `samples` to one point per `step`, tagged with its time in ms. */
function sampleSeries(samples: Float32Array, sampleCount: number, step: number, sampleRate: number): Vector2[] {
  const data: Vector2[] = [];
  for (let i = 0; i < sampleCount; i += step) {
    data.push(new Vector2((i / sampleRate) * 1000, samples[i] ?? 0));
  }
  return data;
}
