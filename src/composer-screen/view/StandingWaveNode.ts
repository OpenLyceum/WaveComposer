/**
 * StandingWaveNode.ts
 *
 * Compact 1D standing-wave strip: y(x,t) = Σ Aₙ·φₙ(x)·cos(2πn·f_anim·t), synced
 * to the detected F0 (or the compose-lab fundamental when that source is active).
 *
 * The spatial shape φₙ(x) follows the selected boundary model, and modes the
 * boundary disallows (even harmonics of a closed pipe) are not drawn — matching
 * the spectrum overlay's allowed-harmonic bands:
 *   - string (fixed–fixed):      φₙ = sin(nπx)        (nodes at both ends)
 *   - open pipe (displacement):  φₙ = cos(nπx)        (antinodes at both ends)
 *   - closed pipe (displacement): φₙ = sin(nπx/2), n odd (node at closed end,
 *     antinode at open end)
 *
 * The animation runs in deliberate slow motion (mode n oscillates at
 * n·SLOW_MOTION_RATE_HZ) — animating at the real f₀ against the display refresh
 * rate would alias into meaningless flicker.
 */
import type { TReadOnlyProperty } from "scenerystack/axon";
import { Bounds2, Range } from "scenerystack/dot";
import { CanvasNode, Node, Text } from "scenerystack/scenery";
import type { HarmonicChartModel } from "../../common/model/HarmonicChartModel.js";
import { isModeAllowed, PipeBoundary } from "../../common/model/PipeBoundary.js";
import { ChartFrame } from "../../common/view/ChartFrame.js";
import { StringManager } from "../../i18n/StringManager.js";
import WaveComposerColors from "../../WaveComposerColors.js";
import { WaveComposerConstants } from "../../WaveComposerConstants.js";

interface StandingWaveNodeOptions {
  viewWidth: number;
  viewHeight: number;
  /**
   * Caption shown in place of the curve when there is a fundamental but no modes
   * to draw. Only meaningful where "no modes" has a definite cause — on the
   * Composer screen it means the partials are not a harmonic series; from
   * measured audio it just means no harmonics were resolved, so it is omitted.
   */
  emptyMessage?: TReadOnlyProperty<string>;
}

const POINT_COUNT = 200;
const TWO_PI = 2 * Math.PI;
/** Slow-motion oscillation rate of the fundamental, in Hz of wall-clock time. */
const SLOW_MOTION_RATE_HZ = 0.4;
/** Cap on the per-frame clock advance so background tabs don't jump on return. */
const MAX_FRAME_DT_S = 0.1;

export class StandingWaveNode extends Node {
  public constructor(model: HarmonicChartModel, options: StandingWaveNodeOptions) {
    super();
    const physics = StringManager.getInstance().getPhysicsStrings();
    const axisStrings = StringManager.getInstance().getAxisStrings();

    const frame = new ChartFrame({
      viewWidth: options.viewWidth,
      viewHeight: options.viewHeight,
      xRange: new Range(0, 1),
      yRange: new Range(-1, 1),
      xSpacing: 0.25,
      ySpacing: 0.5,
      xLabel: physics.standingWaveStringProperty,
      yLabel: axisStrings.displacementStringProperty,
    });

    frame.plotLayer.addChild(new StandingWaveCanvas(model, options.viewWidth, options.viewHeight));

    // A blank strip is ambiguous: it looks the same whether the partials are silent
    // or simply cannot stand on one string. Say which it is.
    if (options.emptyMessage) {
      const emptyCaption = new Text(options.emptyMessage, {
        font: WaveComposerConstants.LABEL_FONT,
        fill: WaveComposerColors.axisColorProperty,
        maxWidth: options.viewWidth - 16,
        centerX: options.viewWidth / 2,
        centerY: options.viewHeight / 2,
        visible: false,
      });
      frame.plotLayer.addChild(emptyCaption);
      model.frameProcessedEmitter.addListener(() => {
        emptyCaption.visible = model.getFundamentalHz() > 0 && model.getStandingWaveModes().length === 0;
      });
    }

    this.addChild(frame);
  }
}

class StandingWaveCanvas extends CanvasNode {
  private readonly model: HarmonicChartModel;
  private readonly viewWidth: number;
  private readonly viewHeight: number;
  /** Slow-motion animation clock (s), advanced by real elapsed time while voiced. */
  private clockS = 0;
  private lastFrameMs: number | null = null;

  public constructor(model: HarmonicChartModel, viewWidth: number, viewHeight: number) {
    super({ canvasBounds: new Bounds2(0, 0, viewWidth, viewHeight) });
    this.model = model;
    this.viewWidth = viewWidth;
    this.viewHeight = viewHeight;

    model.frameProcessedEmitter.addListener(() => {
      const nowMs = performance.now();
      if (this.model.getFundamentalHz() > 0) {
        const dtS = this.lastFrameMs === null ? 0 : (nowMs - this.lastFrameMs) / 1000;
        this.clockS += Math.min(dtS, MAX_FRAME_DT_S);
      }
      this.lastFrameMs = nowMs;
      this.invalidatePaint();
    });
  }

  /** Spatial mode shape φₙ(x) for the current boundary model (x in [0, 1]). */
  private static modeShape(n: number, xNorm: number, boundary: PipeBoundary): number {
    if (boundary === PipeBoundary.OPEN_PIPE) {
      // Displacement antinodes at both open ends.
      return Math.cos(n * Math.PI * xNorm);
    }
    if (boundary === PipeBoundary.CLOSED_PIPE) {
      // Node at the closed end (x = 0), antinode at the open end (x = 1).
      return Math.sin((n * Math.PI * xNorm) / 2);
    }
    // String (and the unspecified default): nodes at both fixed ends.
    return Math.sin(n * Math.PI * xNorm);
  }

  public override paintCanvas(context: CanvasRenderingContext2D): void {
    const f0 = this.model.getFundamentalHz();
    if (f0 <= 0) {
      return;
    }

    const boundary = this.model.pipeBoundaryProperty.value;
    const modes = [...this.model.getStandingWaveModes()].filter(
      (mode) => boundary === PipeBoundary.NONE || isModeAllowed(mode.modeNumber, boundary),
    );
    // No modes means no wave — drawing the flat y = 0 line instead would read as a
    // real (motionless) standing wave, and it sits on top of the empty-state caption.
    if (modes.length === 0) {
      return;
    }
    const stroke = WaveComposerColors.standingWaveColorProperty.value.toCSS();
    context.strokeStyle = stroke;
    context.lineWidth = 2;
    context.beginPath();

    for (let i = 0; i <= POINT_COUNT; i++) {
      const xNorm = i / POINT_COUNT;
      let y = 0;
      for (const mode of modes) {
        if (!mode || mode.amplitude <= 0) {
          continue;
        }
        const n = mode.modeNumber;
        const spatial = StandingWaveCanvas.modeShape(n, xNorm, boundary);
        const temporal = Math.cos(TWO_PI * SLOW_MOTION_RATE_HZ * n * this.clockS);
        y += mode.amplitude * spatial * temporal;
      }
      const px = xNorm * this.viewWidth;
      const py = this.viewHeight / 2 - (y * this.viewHeight) / 2;
      if (i === 0) {
        context.moveTo(px, py);
      } else {
        context.lineTo(px, py);
      }
    }
    context.stroke();
  }
}
