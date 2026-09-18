/**
 * SpectrogramNode.ts
 *
 * Scrolling waterfall display (time × frequency × intensity). A ChartFrame
 * supplies the frequency (y) axis and labels; the intensity raster is drawn by an
 * inner Canvas-2D node.
 *
 * The raster is kept in an offscreen canvas used as a ring buffer: each analyzed
 * frame writes one vertical column (frequency bins → colormap), advancing a write
 * index. `paintCanvas` blits the ring in two slices so the newest column is always
 * at the right edge and older data scrolls left — no per-frame self-copy.
 *
 * The scroll speed sets how many columns a frame advances, so the same history
 * can be stretched out for a slow look or hurried past for a fast one. Rows map
 * to frequency through the selected {@link FrequencyScale}: evenly spaced in Hz,
 * or one octave per equal slice of height.
 */
import { Bounds2, Range } from "scenerystack/dot";
import { type EmptySelfOptions, optionize } from "scenerystack/phet-core";
import { CanvasNode, type CanvasNodeOptions, Node, Text } from "scenerystack/scenery";
import { ChartFrame } from "../../common/view/ChartFrame.js";
import { getColormapLut } from "../../common/view/Colormaps.js";
import {
  formatScaleTick,
  fromScaleCoordinate,
  scaleRangeFor,
  tickSpacingFor,
} from "../../common/view/FrequencyScale.js";
import { StringManager } from "../../i18n/StringManager.js";
import WaveComposerColors from "../../WaveComposerColors.js";
import { WaveComposerConstants } from "../../WaveComposerConstants.js";
import type { AnalyzerModel } from "../model/AnalyzerModel.js";
import type { AnalyzerViewProperties } from "./AnalyzerViewProperties.js";

interface SpectrogramNodeOptions {
  viewWidth: number;
  viewHeight: number;
}

export class SpectrogramNode extends Node {
  private readonly raster: SpectrogramRaster;

  public constructor(model: AnalyzerModel, viewProperties: AnalyzerViewProperties, options: SpectrogramNodeOptions) {
    super();
    const { viewWidth, viewHeight } = options;
    const axisStrings = StringManager.getInstance().getAxisStrings();

    const scaleRange = () =>
      scaleRangeFor(
        model.minFrequencyProperty.value,
        model.maxFrequencyProperty.value,
        viewProperties.frequencyScaleProperty.value,
      );
    const createTickLabel = (value: number) =>
      new Text(formatScaleTick(value, viewProperties.frequencyScaleProperty.value), {
        font: WaveComposerConstants.TICK_FONT,
        fill: WaveComposerColors.textColorProperty,
      });

    const [yMin, yMax] = scaleRange();
    const frame = new ChartFrame({
      viewWidth,
      viewHeight,
      xRange: new Range(0, 1),
      yRange: new Range(yMin, yMax),
      ySpacing: tickSpacingFor(viewProperties.frequencyScaleProperty.value),
      yLabel: axisStrings.frequencyStringProperty,
      createYTickLabel: createTickLabel,
    });
    this.raster = new SpectrogramRaster(model, viewProperties, viewWidth, viewHeight);
    frame.plotLayer.addChild(this.raster);
    this.addChild(frame);

    // Keep the frequency axis in sync with the analysis display range and scale;
    // the raster mapping changes too, so clear the history to avoid mixing scales.
    const retarget = () => {
      const [min, max] = scaleRange();
      frame.setYAxis(new Range(min, max), tickSpacingFor(viewProperties.frequencyScaleProperty.value), createTickLabel);
      this.raster.clear();
    };
    model.minFrequencyProperty.lazyLink(retarget);
    model.maxFrequencyProperty.lazyLink(retarget);
    viewProperties.frequencyScaleProperty.lazyLink(retarget);
  }

  public reset(): void {
    this.raster.clear();
  }
}

/** Canvas-2D scrolling raster. */
class SpectrogramRaster extends CanvasNode {
  private readonly model: AnalyzerModel;
  private readonly viewProperties: AnalyzerViewProperties;
  private readonly viewWidth: number;
  private readonly viewHeight: number;
  private readonly cols: number;
  private readonly rows: number;
  private readonly offscreen: HTMLCanvasElement;
  private readonly offContext: CanvasRenderingContext2D;
  private readonly columnImage: ImageData;
  private writeIndex = 0;
  /**
   * Fractional columns owed to the display. A speed below 1× writes a column only
   * every few frames, so the remainder has to carry over instead of rounding away.
   */
  private columnCredit = 0;

  public constructor(
    model: AnalyzerModel,
    viewProperties: AnalyzerViewProperties,
    viewWidth: number,
    viewHeight: number,
    providedOptions?: CanvasNodeOptions,
  ) {
    const options = optionize<CanvasNodeOptions, EmptySelfOptions, CanvasNodeOptions>()(
      { canvasBounds: new Bounds2(0, 0, viewWidth, viewHeight) },
      providedOptions,
    );
    super(options);
    this.model = model;
    this.viewProperties = viewProperties;
    this.viewWidth = viewWidth;
    this.viewHeight = viewHeight;
    this.cols = WaveComposerConstants.SPECTROGRAM_HISTORY_COLUMNS;
    this.rows = Math.max(1, Math.round(viewHeight));

    const offscreen = document.createElement("canvas");
    offscreen.width = this.cols;
    offscreen.height = this.rows;
    this.offscreen = offscreen;
    this.offContext = offscreen.getContext("2d") as CanvasRenderingContext2D;
    this.columnImage = this.offContext.createImageData(1, this.rows);

    this.clear();

    model.frameProcessedEmitter.addListener(() => this.pushFrame());
    // New columns adopt the new colormap immediately; clear so it isn't mixed.
    model.fftSizeProperty.lazyLink(() => this.clear());
    viewProperties.colormapProperty.lazyLink(() => this.clear());
    // The ring buffer bakes in the background color, so a theme change (e.g.
    // projector mode) must repaint the history or stale-colored columns linger.
    WaveComposerColors.chartBackgroundColorProperty.lazyLink(() => this.clear());
  }

  /** Resets the scrolling history to the background color. */
  public clear(): void {
    this.offContext.fillStyle = WaveComposerColors.chartBackgroundColorProperty.value.toCSS();
    this.offContext.fillRect(0, 0, this.cols, this.rows);
    this.writeIndex = 0;
    this.columnCredit = 0;
    this.invalidatePaint();
  }

  private pushFrame(): void {
    const analysis = this.model.analysis;
    if (!analysis) {
      return;
    }
    // Fractional speeds mean some frames draw nothing and fast ones draw several.
    this.columnCredit += this.viewProperties.scrollSpeedProperty.value;
    const columnCount = Math.min(Math.floor(this.columnCredit), this.cols);
    if (columnCount < 1) {
      return;
    }
    this.columnCredit -= columnCount;

    const sampleRate = this.model.sampleRateProperty.value;
    const half = analysis.powerSpectrumDb.length;
    const fftSize = half * 2;
    const scale = this.viewProperties.frequencyScaleProperty.value;
    const [yMin, yMax] = scaleRangeFor(
      this.model.minFrequencyProperty.value,
      this.model.maxFrequencyProperty.value,
      scale,
    );
    const lut = getColormapLut(this.viewProperties.colormapProperty.value);
    const data = this.columnImage.data;
    const dbSpan = WaveComposerConstants.SPECTROGRAM_MAX_DB - WaveComposerConstants.SPECTROGRAM_MIN_DB;

    for (let r = 0; r < this.rows; r++) {
      // Row 0 is the top of the display = highest frequency.
      const frac = this.rows > 1 ? 1 - r / (this.rows - 1) : 0;
      const freq = fromScaleCoordinate(yMin + frac * (yMax - yMin), scale);
      let bin = Math.round((freq * fftSize) / sampleRate);
      if (bin < 0) {
        bin = 0;
      } else if (bin >= half) {
        bin = half - 1;
      }
      const db = analysis.powerSpectrumDb[bin] ?? WaveComposerConstants.SPECTROGRAM_MIN_DB;
      let t = (db - WaveComposerConstants.SPECTROGRAM_MIN_DB) / dbSpan;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const lutIndex = Math.round(t * 255) * 3;
      const o = r * 4;
      data[o] = lut[lutIndex] ?? 0;
      data[o + 1] = lut[lutIndex + 1] ?? 0;
      data[o + 2] = lut[lutIndex + 2] ?? 0;
      data[o + 3] = 255;
    }
    for (let c = 0; c < columnCount; c++) {
      this.offContext.putImageData(this.columnImage, this.writeIndex, 0);
      this.writeIndex = (this.writeIndex + 1) % this.cols;
    }
    this.invalidatePaint();
  }

  public override paintCanvas(context: CanvasRenderingContext2D): void {
    context.imageSmoothingEnabled = false;
    const scaleX = this.viewWidth / this.cols;
    const wi = this.writeIndex;
    const leftCount = this.cols - wi;

    // Oldest columns [wi .. cols-1] on the left, then [0 .. wi-1] on the right.
    if (leftCount > 0) {
      context.drawImage(this.offscreen, wi, 0, leftCount, this.rows, 0, 0, leftCount * scaleX, this.viewHeight);
    }
    if (wi > 0) {
      context.drawImage(this.offscreen, 0, 0, wi, this.rows, leftCount * scaleX, 0, wi * scaleX, this.viewHeight);
    }
  }
}
