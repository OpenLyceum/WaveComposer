/**
 * SpectrumNode.ts
 *
 * Instantaneous FFT power spectrum (magnitude in dB vs frequency), with optional
 * integer-harmonic markers at multiples of the fundamental.
 *
 * Physics pedagogy overlays: allowed-harmonic bands for pipe/string boundary
 * models and mode-number labels on the harmonic markers.
 *
 * The frequency axis plots a {@link FrequencyScale} coordinate rather than raw Hz,
 * so the same chart serves a linear Hz axis and a per-octave logarithmic one.
 */
import { CanvasLinePlot, ChartCanvasNode, type ChartTransform } from "scenerystack/bamboo";
import { Range, Vector2 } from "scenerystack/dot";
import { Shape } from "scenerystack/kite";
import { Node, Path, Rectangle, Text } from "scenerystack/scenery";
import type { SpectrumChartModel } from "../../common/model/HarmonicChartModel.js";
import { isModeAllowed, PipeBoundary } from "../../common/model/PipeBoundary.js";
import { ChartFrame } from "../../common/view/ChartFrame.js";
import type { ChartOverlayProperties } from "../../common/view/ChartOverlayProperties.js";
import {
  FrequencyScale,
  formatScaleTick,
  LOG_MIN_FREQUENCY_HZ,
  scaleRangeFor,
  tickSpacingFor,
  toScaleCoordinate,
} from "../../common/view/FrequencyScale.js";
import { StringManager } from "../../i18n/StringManager.js";
import WaveComposerColors from "../../WaveComposerColors.js";
import { WaveComposerConstants } from "../../WaveComposerConstants.js";

interface SpectrumNodeOptions {
  viewWidth: number;
  viewHeight: number;
}

const DB_TICK_SPACING = 20;
const HARMONIC_BAND_WIDTH_HZ = 18;
/** Clear space (view px) required between consecutive mode-number labels. */
const MODE_LABEL_MIN_GAP = 6;

export class SpectrumNode extends Node {
  private readonly model: SpectrumChartModel;
  private readonly viewProperties: ChartOverlayProperties;
  private readonly viewWidth: number;
  private readonly viewHeight: number;
  private readonly frame: ChartFrame;
  private readonly chartTransform: ChartTransform;
  private readonly spectrumPlot: CanvasLinePlot;
  private readonly chartCanvas: ChartCanvasNode;
  private readonly harmonicMarkers: Path;
  private readonly allowedHarmonicLayer: Node;
  private readonly modeNumberLayer: Node;

  public constructor(model: SpectrumChartModel, viewProperties: ChartOverlayProperties, options: SpectrumNodeOptions) {
    super();
    this.model = model;
    this.viewProperties = viewProperties;
    this.viewWidth = options.viewWidth;
    this.viewHeight = options.viewHeight;
    const axisStrings = StringManager.getInstance().getAxisStrings();
    const scale = this.frequencyScale;

    const [xMin, xMax] = scaleRangeFor(model.minFrequencyProperty.value, model.maxFrequencyProperty.value, scale);
    const frame = new ChartFrame({
      viewWidth: options.viewWidth,
      viewHeight: options.viewHeight,
      xRange: new Range(xMin, xMax),
      yRange: new Range(WaveComposerConstants.SPECTRUM_MIN_DB, WaveComposerConstants.SPECTRUM_MAX_DB),
      xSpacing: tickSpacingFor(scale),
      ySpacing: DB_TICK_SPACING,
      xLabel: axisStrings.frequencyStringProperty,
      yLabel: axisStrings.magnitudeStringProperty,
      createXTickLabel: (value) => this.createFrequencyTickLabel(value),
    });
    this.frame = frame;
    this.chartTransform = frame.chartTransform;

    this.allowedHarmonicLayer = new Node();
    frame.plotLayer.addChild(this.allowedHarmonicLayer);

    this.spectrumPlot = new CanvasLinePlot(this.chartTransform, [], {
      stroke: WaveComposerColors.spectrumCurveColorProperty.value.toCSS(),
      lineWidth: 1.5,
    });
    this.chartCanvas = new ChartCanvasNode(this.chartTransform, [this.spectrumPlot]);
    frame.plotLayer.addChild(this.chartCanvas);

    this.harmonicMarkers = new Path(null, {
      stroke: WaveComposerColors.harmonicMarkerColorProperty,
      lineWidth: 0.5,
      opacity: 0.6,
    });
    frame.plotLayer.addChild(this.harmonicMarkers);

    this.modeNumberLayer = new Node();
    frame.plotLayer.addChild(this.modeNumberLayer);

    this.addChild(frame);

    WaveComposerColors.spectrumCurveColorProperty.lazyLink((color) => {
      this.spectrumPlot.setStroke(color.toCSS());
      this.chartCanvas.update();
    });
    viewProperties.showHarmonicsProperty.lazyLink(() => this.update());
    viewProperties.showPipeOverlayProperty.lazyLink(() => this.update());
    viewProperties.showModeNumbersProperty.lazyLink(() => this.update());
    model.pipeBoundaryProperty.lazyLink(() => this.update());

    const retarget = () => {
      const [min, max] = scaleRangeFor(
        model.minFrequencyProperty.value,
        model.maxFrequencyProperty.value,
        this.frequencyScale,
      );
      this.frame.setXAxis(new Range(min, max), tickSpacingFor(this.frequencyScale), (value) =>
        this.createFrequencyTickLabel(value),
      );
      this.update();
    };
    model.minFrequencyProperty.lazyLink(retarget);
    model.maxFrequencyProperty.lazyLink(retarget);
    viewProperties.frequencyScaleProperty?.lazyLink(retarget);

    model.frameProcessedEmitter.addListener(() => this.update());
  }

  /** The active frequency scale; linear on screens that don't offer the choice. */
  private get frequencyScale(): FrequencyScale {
    return this.viewProperties.frequencyScaleProperty?.value ?? FrequencyScale.LINEAR;
  }

  /**
   * Lowest frequency actually drawn. A logarithmic axis starts at
   * {@link LOG_MIN_FREQUENCY_HZ}, so bins below it are left out rather than piled
   * onto the left edge by the clamp in {@link toScaleCoordinate}.
   */
  private get displayMinFrequencyHz(): number {
    const minF = this.model.minFrequencyProperty.value;
    return this.frequencyScale === FrequencyScale.LOGARITHMIC ? Math.max(minF, LOG_MIN_FREQUENCY_HZ) : minF;
  }

  /** Hz → x in chart-model coordinates (Hz when linear, octaves when logarithmic). */
  private toChartX(frequencyHz: number): number {
    return toScaleCoordinate(frequencyHz, this.frequencyScale);
  }

  private createFrequencyTickLabel(value: number): Node {
    return new Text(formatScaleTick(value, this.frequencyScale), {
      font: WaveComposerConstants.TICK_FONT,
      fill: WaveComposerColors.textColorProperty,
    });
  }

  private update(): void {
    const analysis = this.model.analysis;
    if (!analysis) {
      return;
    }
    const sampleRate = this.model.sampleRateProperty.value;
    const half = analysis.powerSpectrumDb.length;
    const fftSize = half * 2;
    const minF = this.displayMinFrequencyHz;
    const maxF = Math.max(this.model.maxFrequencyProperty.value, minF + 1);
    const binStart = Math.max(0, Math.floor((minF * fftSize) / sampleRate));
    const binEnd = Math.min(half - 1, Math.ceil((maxF * fftSize) / sampleRate));

    const spectrumData: Vector2[] = [];
    for (let bin = binStart; bin <= binEnd; bin++) {
      const freq = (bin * sampleRate) / fftSize;
      spectrumData.push(
        new Vector2(this.toChartX(freq), analysis.powerSpectrumDb[bin] ?? WaveComposerConstants.SPECTRUM_MIN_DB),
      );
    }
    this.spectrumPlot.setDataSet(spectrumData);
    this.chartCanvas.update();

    this.updateHarmonicMarkers(minF, maxF);
    this.updateAllowedHarmonicBands(minF, maxF);
  }

  private updateHarmonicMarkers(minF: number, maxF: number): void {
    this.modeNumberLayer.removeAllChildren();

    if (!this.viewProperties.showHarmonicsProperty.value) {
      this.harmonicMarkers.shape = null;
      return;
    }
    const f0 = this.model.getFundamentalHz();
    if (f0 <= 0) {
      this.harmonicMarkers.shape = null;
      return;
    }
    const shape = new Shape();
    const modeLabelPattern = StringManager.getInstance().getPhysicsStrings().modeLabelStringProperty.value;
    // Labels are only drawn where the previous one has room to end; a dense harmonic
    // stack would otherwise smear "n = 1 n = 2 n = 3 …" into an unreadable line.
    let lastLabelRight = Number.NEGATIVE_INFINITY;
    let modeNumber = 0;
    for (let freq = f0; freq <= maxF; freq += f0) {
      modeNumber += 1;
      if (freq >= minF) {
        const x = this.chartTransform.modelToViewX(this.toChartX(freq));
        shape.moveTo(x, 0).lineTo(x, this.viewHeight);
        if (this.viewProperties.showModeNumbersProperty.value) {
          const label = new Text(modeLabelPattern.replace("{{n}}", `${modeNumber}`), {
            font: WaveComposerConstants.LABEL_FONT,
            fill: WaveComposerColors.harmonicMarkerColorProperty,
            centerX: x,
            top: 2,
          });
          if (label.left > lastLabelRight + MODE_LABEL_MIN_GAP && label.right < this.viewWidth) {
            lastLabelRight = label.right;
            this.modeNumberLayer.addChild(label);
          }
        }
      }
    }
    this.harmonicMarkers.shape = shape;
  }

  private updateAllowedHarmonicBands(minF: number, maxF: number): void {
    this.allowedHarmonicLayer.removeAllChildren();
    if (!this.viewProperties.showPipeOverlayProperty.value) {
      return;
    }
    const boundary = this.model.pipeBoundaryProperty.value;
    if (boundary === PipeBoundary.NONE) {
      return;
    }
    const f0 = this.model.getFundamentalHz();
    if (f0 <= 0) {
      return;
    }

    let modeNumber = 0;
    for (let freq = f0; freq <= maxF; freq += f0) {
      modeNumber += 1;
      if (freq < minF || !isModeAllowed(modeNumber, boundary)) {
        continue;
      }
      const xLeft = this.chartTransform.modelToViewX(this.toChartX(Math.max(minF, freq - HARMONIC_BAND_WIDTH_HZ / 2)));
      const xRight = this.chartTransform.modelToViewX(this.toChartX(Math.min(maxF, freq + HARMONIC_BAND_WIDTH_HZ / 2)));
      this.allowedHarmonicLayer.addChild(
        new Rectangle(xLeft, 0, xRight - xLeft, this.viewHeight, {
          fill: WaveComposerColors.allowedHarmonicBandColorProperty,
          opacity: 0.12,
        }),
      );
    }
  }
}
