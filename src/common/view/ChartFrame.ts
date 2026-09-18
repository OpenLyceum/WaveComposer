/**
 * ChartFrame.ts
 *
 * Reusable static "chrome" for a bamboo chart: a bordered background rectangle,
 * major grid lines, edge tick marks + labels, and optional axis titles. It owns a
 * {@link ChartTransform} (model↔view mapping) and a clipped {@link plotLayer} that
 * callers populate with plots (e.g. a ChartCanvasNode of CanvasLinePlots, or a
 * ScatterPlot). The spectrum, waveform, cepstrum and vowel charts all share it so
 * they look consistent and the axis wiring lives in one place.
 *
 * Local origin (0,0) is the top-left corner of the plotting area; tick labels and
 * axis titles extend into small gutters to the left of / below it.
 */
import type { TReadOnlyProperty } from "scenerystack/axon";
import { ChartRectangle, ChartTransform, GridLineSet, TickLabelSet, TickMarkSet } from "scenerystack/bamboo";
import type { Range } from "scenerystack/dot";
import { toFixed } from "scenerystack/dot";
import { Shape } from "scenerystack/kite";
import { Orientation } from "scenerystack/phet-core";
import { Line, Node, Text } from "scenerystack/scenery";
import WaveComposerColors from "../../WaveComposerColors.js";
import { WaveComposerConstants } from "../../WaveComposerConstants.js";

const TICK_LENGTH = 5;
const Y_TITLE_GUTTER = 38;
const X_TITLE_GUTTER = 30;

export interface ChartFrameOptions {
  viewWidth: number;
  viewHeight: number;
  xRange: Range;
  yRange: Range;
  xRangeInverted?: boolean;
  yRangeInverted?: boolean;
  /** Spacing (model units) for grid + ticks on each axis. */
  xSpacing?: number;
  ySpacing?: number;
  xLabel?: string | TReadOnlyProperty<string>;
  yLabel?: string | TReadOnlyProperty<string>;
  /** Custom tick-label factories (default: rounded integer). */
  createXTickLabel?: (value: number) => Node;
  createYTickLabel?: (value: number) => Node;
}

export class ChartFrame extends Node {
  public readonly chartTransform: ChartTransform;
  /** Clipped layer for plot content; add CanvasLinePlot/ScatterPlot nodes here. */
  public readonly plotLayer: Node;
  /** Tick/grid sets per axis, kept so {@link setXAxis}/{@link setYAxis} can retarget them. */
  private readonly xAxisSets: AxisSets = {};
  private readonly yAxisSets: AxisSets = {};

  public constructor(options: ChartFrameOptions) {
    super();

    const transform = new ChartTransform({
      viewWidth: options.viewWidth,
      viewHeight: options.viewHeight,
      modelXRange: options.xRange,
      modelYRange: options.yRange,
      modelXRangeInverted: options.xRangeInverted ?? false,
      modelYRangeInverted: options.yRangeInverted ?? false,
    });
    this.chartTransform = transform;

    const background = new ChartRectangle(transform, {
      fill: WaveComposerColors.chartBackgroundColorProperty,
      stroke: WaveComposerColors.panelBorderColorProperty,
      lineWidth: 1,
      cornerXRadius: WaveComposerConstants.CORNER_RADIUS,
      cornerYRadius: WaveComposerConstants.CORNER_RADIUS,
    });
    this.addChild(background);

    if (options.xSpacing !== undefined) {
      this.xAxisSets.gridLines = new GridLineSet(transform, Orientation.HORIZONTAL, options.xSpacing, {
        stroke: WaveComposerColors.gridLineColorProperty,
        lineWidth: 0.5,
      });
      this.addChild(this.xAxisSets.gridLines);
    }
    if (options.ySpacing !== undefined) {
      this.yAxisSets.gridLines = new GridLineSet(transform, Orientation.VERTICAL, options.ySpacing, {
        stroke: WaveComposerColors.gridLineColorProperty,
        lineWidth: 0.5,
      });
      this.addChild(this.yAxisSets.gridLines);
    }

    this.plotLayer = new Node({
      clipArea: Shape.rectangle(0, 0, options.viewWidth, options.viewHeight),
    });
    this.addChild(this.plotLayer);

    // The y axis, pinned to the left edge of the plotting area. A bamboo AxisLine
    // is pinned to a model *value* instead, which wanders off the chart — dragging
    // the node's bounds with it — on any axis that doesn't contain that value,
    // such as a logarithmic frequency axis or the cepstrum's 1 ms floor.
    this.addChild(
      new Line(0, 0, 0, options.viewHeight, {
        stroke: WaveComposerColors.axisColorProperty,
        lineWidth: 1,
      }),
    );

    if (options.xSpacing !== undefined) {
      this.xAxisSets.tickMarks = new TickMarkSet(transform, Orientation.HORIZONTAL, options.xSpacing, {
        edge: "min",
        stroke: WaveComposerColors.axisColorProperty,
        extent: TICK_LENGTH,
      });
      this.xAxisSets.tickLabels = new TickLabelSet(transform, Orientation.HORIZONTAL, options.xSpacing, {
        edge: "min",
        createLabel: options.createXTickLabel ?? defaultTickLabel,
      });
      this.addChild(this.xAxisSets.tickMarks);
      this.addChild(this.xAxisSets.tickLabels);
    }
    if (options.ySpacing !== undefined) {
      this.yAxisSets.tickMarks = new TickMarkSet(transform, Orientation.VERTICAL, options.ySpacing, {
        edge: "min",
        stroke: WaveComposerColors.axisColorProperty,
        extent: TICK_LENGTH,
      });
      this.yAxisSets.tickLabels = new TickLabelSet(transform, Orientation.VERTICAL, options.ySpacing, {
        edge: "min",
        createLabel: options.createYTickLabel ?? defaultTickLabel,
      });
      this.addChild(this.yAxisSets.tickMarks);
      this.addChild(this.yAxisSets.tickLabels);
    }

    if (options.xLabel !== undefined) {
      const xTitle = new Text(options.xLabel, {
        font: WaveComposerConstants.AXIS_LABEL_FONT,
        fill: WaveComposerColors.textColorProperty,
        centerX: options.viewWidth / 2,
        top: options.viewHeight + X_TITLE_GUTTER * 0.5,
      });
      this.addChild(xTitle);
    }
    if (options.yLabel !== undefined) {
      const yTitle = new Text(options.yLabel, {
        font: WaveComposerConstants.AXIS_LABEL_FONT,
        fill: WaveComposerColors.textColorProperty,
        rotation: -Math.PI / 2,
      });
      yTitle.right = -Y_TITLE_GUTTER;
      yTitle.centerY = options.viewHeight / 2;
      this.addChild(yTitle);
    }
  }

  /**
   * Retargets the x-axis: model range, tick/grid spacing, and optionally the tick
   * label format. The Analyzer's spectrum uses this to switch its frequency axis
   * between linear Hz and per-octave log spacing without rebuilding the chart.
   */
  public setXAxis(range: Range, spacing?: number, createLabel?: (value: number) => Node): void {
    this.chartTransform.setModelXRange(range);
    retargetAxis(this.xAxisSets, spacing, createLabel);
  }

  /** {@link setXAxis} for the y-axis (the spectrogram's frequency axis). */
  public setYAxis(range: Range, spacing?: number, createLabel?: (value: number) => Node): void {
    this.chartTransform.setModelYRange(range);
    retargetAxis(this.yAxisSets, spacing, createLabel);
  }
}

/** The tick, grid, and label sets of one axis; absent when the axis has no spacing. */
type AxisSets = {
  gridLines?: GridLineSet;
  tickMarks?: TickMarkSet;
  tickLabels?: TickLabelSet;
};

function retargetAxis(sets: AxisSets, spacing?: number, createLabel?: (value: number) => Node): void {
  if (spacing !== undefined) {
    sets.gridLines?.setSpacing(spacing);
    sets.tickMarks?.setSpacing(spacing);
    sets.tickLabels?.setSpacing(spacing);
  }
  if (createLabel) {
    sets.tickLabels?.setCreateLabel(createLabel);
  }
}

function defaultTickLabel(value: number): Node {
  // Integers print plainly; fractional spacings keep up to two decimals (trailing
  // zeros trimmed) so adjacent ticks don't collapse to the same rounded label —
  // a 0.25 spacing has to read 0.25 / 0.5 / 0.75, not 0.3 / 0.5 / 0.8.
  const text = Number.isInteger(value) ? `${value}` : `${Number.parseFloat(toFixed(value, 2))}`;
  return new Text(text, {
    font: WaveComposerConstants.TICK_FONT,
    fill: WaveComposerColors.textColorProperty,
  });
}
