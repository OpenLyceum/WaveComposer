/**
 * SpectrogramNode.ts
 *
 * Scrolling waterfall display (time × frequency × intensity). A ChartFrame
 * supplies the frequency (y) axis and labels; the intensity raster is drawn by an
 * inner Canvas-2D node.
 *
 * The raster is a pixel ring buffer painted by {@link CanvasNode}: each analyzed
 * frame writes one vertical column (frequency bins → colormap), advancing a write
 * index. `paintCanvas` copies the ring in order into a small offscreen canvas so
 * the newest column is always at the right edge and older data scrolls left — no
 * per-frame self-copy — then scales that canvas into the chart with `drawImage`.
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
  /** Ring buffer, column-major RGBA. Column `c` starts at `c * rows * 4`. */
  private readonly history: Uint8ClampedArray;
  /** One frequency column, RGBA, copied into {@link history} on each write. */
  private readonly column: Uint8ClampedArray;
  /**
   * Offscreen canvas holding one pixel per history cell, scaled up when drawn. It
   * must stay: putImageData ignores the canvas transform, so writing straight into
   * the scenery context lands the raster at the top-left of the whole display
   * instead of inside the chart. drawImage respects the transform.
   */
  private readonly sampleCanvas: HTMLCanvasElement;
  private readonly sampleContext: CanvasRenderingContext2D | null;
  /** Unwrapped, row-major copy of {@link history}, reused across paints. */
  private readonly sampleImage: ImageData | null;
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
    this.history = new Uint8ClampedArray(this.cols * this.rows * 4);
    this.column = new Uint8ClampedArray(this.rows * 4);
    this.sampleCanvas = document.createElement("canvas");
    this.sampleCanvas.width = this.cols;
    this.sampleCanvas.height = this.rows;
    this.sampleContext = this.sampleCanvas.getContext("2d");
    this.sampleImage = this.sampleContext?.createImageData(this.cols, this.rows) ?? null;

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
    this.fillWithChartBackground(this.history);
    this.writeIndex = 0;
    this.columnCredit = 0;
    this.invalidatePaint();
  }

  /** Writes the current chart-background profile color through an RGBA buffer. */
  private fillWithChartBackground(target: Uint8ClampedArray): void {
    const color = WaveComposerColors.chartBackgroundColorProperty.value;
    const red = color.red;
    const green = color.green;
    const blue = color.blue;
    const alpha = Math.round(color.alpha * 255);
    for (let i = 0; i < target.length; i += 4) {
      target[i] = red;
      target[i + 1] = green;
      target[i + 2] = blue;
      target[i + 3] = alpha;
    }
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
      this.column[o] = lut[lutIndex] ?? 0;
      this.column[o + 1] = lut[lutIndex + 1] ?? 0;
      this.column[o + 2] = lut[lutIndex + 2] ?? 0;
      this.column[o + 3] = 255;
    }
    for (let c = 0; c < columnCount; c++) {
      this.history.set(this.column, this.writeIndex * this.rows * 4);
      this.writeIndex = (this.writeIndex + 1) % this.cols;
    }
    this.invalidatePaint();
  }

  public override paintCanvas(context: CanvasRenderingContext2D): void {
    const sampleContext = this.sampleContext;
    const sampleImage = this.sampleImage;
    if (!(sampleContext && sampleImage)) {
      return;
    }
    const dest = sampleImage.data;
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        // Oldest column (writeIndex) on the left, newest just left of it.
        const srcCol = (this.writeIndex + x) % this.cols;
        const src = (srcCol * this.rows + y) * 4;
        const dst = (y * this.cols + x) * 4;
        dest[dst] = this.history[src] ?? 0;
        dest[dst + 1] = this.history[src + 1] ?? 0;
        dest[dst + 2] = this.history[src + 2] ?? 0;
        dest[dst + 3] = this.history[src + 3] ?? 0;
      }
    }
    sampleContext.putImageData(sampleImage, 0, 0);

    // Nearest-neighbour keeps each analyzed frame a crisp column.
    context.imageSmoothingEnabled = false;
    context.drawImage(this.sampleCanvas, 0, 0, this.viewWidth, this.viewHeight);
  }
}
