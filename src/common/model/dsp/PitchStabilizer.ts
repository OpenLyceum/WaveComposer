/**
 * PitchStabilizer.ts
 *
 * Turns the per-frame F0 estimate into a pitch that holds still long enough to
 * read and to hang harmonic markers on.
 *
 * YIN runs once per animation frame (~60 Hz). Within one held note its estimate
 * jitters by a few Hz, and every so often a frame lands on a harmonic or a
 * sub-harmonic instead of the fundamental — a jump by a whole integer factor.
 * Fed straight to the view, that makes the numeric readout unreadable and, worse,
 * shuffles the spectrum's harmonic markers: the mode numbers are just the ordinals
 * of the multiples of F0, so an F0 that jumps by 5x renumbers every marker on the
 * chart. The musical content did not change, so the labels must not either.
 *
 * Three rules, in order:
 *
 *  1. **Median, not mean** over a sliding window of recent frames. A stray octave
 *     jump is outvoted rather than averaged in, which is what a mean would do
 *     (dragging the value to a pitch that was never measured).
 *  2. **Publish on a slow clock.** The value is recomputed a few times a second,
 *     not 60, so markers and digits are never mid-flicker.
 *  3. **Hysteresis.** Changes smaller than a quarter tone leave the published
 *     value alone, and a genuinely different pitch has to win several consecutive
 *     updates before it is adopted. A detector bouncing between F0 and one of its
 *     harmonics therefore stays pinned to whichever one it reports most often
 *     instead of flipping back and forth.
 *
 * The cost is latency: a real note change takes roughly a third of a second to
 * show up. The window is deliberately short enough to follow a melody played at
 * speed - anything slower reads as the display ignoring the notes - and long
 * enough that the per-frame jitter never reaches the screen.
 */

/**
 * Seconds of frames the median is taken over. A new pitch takes over the median
 * once it holds half the window, so this is most of the tracking latency: keep it
 * near a fast note's duration.
 */
const DEFAULT_WINDOW_S = 0.4;

/** Seconds between recomputes of the published value. */
const DEFAULT_UPDATE_INTERVAL_S = 0.125;

/**
 * How far the window median may sit from the published pitch before it counts as
 * a different pitch, in cents. A quarter tone (50¢) is the widest anything can be
 * from a note and still be that note, so 40¢ keeps vibrato and tuning drift from
 * moving the value while a real semitone step (100¢) always registers.
 */
const DEFAULT_HOLD_CENTS = 40;

/** Consecutive updates a new pitch must win before it is adopted. */
const DEFAULT_CONFIRM_UPDATES = 2;

/**
 * Fraction of the window that must be voiced for a pitch to be published at all.
 * Below it the input is silence or noise and the stabilizer reports 0 (no pitch),
 * which the views render as a blank readout and no harmonic markers.
 */
const DEFAULT_VOICED_FRACTION = 0.5;

export interface PitchStabilizerOptions {
  windowSeconds?: number;
  updateIntervalSeconds?: number;
  holdCents?: number;
  confirmUpdates?: number;
  voicedFraction?: number;
}

export class PitchStabilizer {
  private readonly windowSeconds: number;
  private readonly updateIntervalSeconds: number;
  private readonly holdCents: number;
  private readonly confirmUpdates: number;
  private readonly voicedFraction: number;

  /** Per-frame estimates in the current window, 0 for unvoiced frames. */
  private readonly samples: number[] = [];
  /** Each sample's dt, in seconds; parallel to {@link samples}. */
  private readonly sampleDurations: number[] = [];
  /** Seconds of audio held in {@link samples}. */
  private windowDuration = 0;
  /** Seconds accumulated toward the next recompute. */
  private sinceUpdate = 0;

  private stableHz = 0;
  /** A pitch seen since the last adoption that differs from {@link stableHz}. */
  private candidateHz = 0;
  /** Consecutive updates {@link candidateHz} has survived. */
  private candidateUpdates = 0;

  public constructor(options?: PitchStabilizerOptions) {
    this.windowSeconds = options?.windowSeconds ?? DEFAULT_WINDOW_S;
    this.updateIntervalSeconds = options?.updateIntervalSeconds ?? DEFAULT_UPDATE_INTERVAL_S;
    this.holdCents = options?.holdCents ?? DEFAULT_HOLD_CENTS;
    this.confirmUpdates = options?.confirmUpdates ?? DEFAULT_CONFIRM_UPDATES;
    this.voicedFraction = options?.voicedFraction ?? DEFAULT_VOICED_FRACTION;
  }

  /** The pitch to display: Hz, or 0 when nothing pitched is being heard. */
  public get value(): number {
    return this.stableHz;
  }

  /**
   * Feeds one analyzed frame in and returns the pitch to display.
   *
   * @param dtSeconds - time the frame covers
   * @param frequencyHz - that frame's F0 estimate, or 0 if the frame was unvoiced
   */
  public update(dtSeconds: number, frequencyHz: number): number {
    this.samples.push(frequencyHz > 0 ? frequencyHz : 0);
    this.sampleDurations.push(dtSeconds);
    this.windowDuration += dtSeconds;
    while (this.samples.length > 1 && this.windowDuration > this.windowSeconds) {
      this.windowDuration -= this.sampleDurations[0] ?? 0;
      this.samples.shift();
      this.sampleDurations.shift();
    }

    this.sinceUpdate += dtSeconds;
    if (this.sinceUpdate >= this.updateIntervalSeconds) {
      // Carry the overshoot rather than zeroing it, so a frame time that does
      // not divide the interval evenly cannot stretch the cadence frame by frame.
      this.sinceUpdate -= this.updateIntervalSeconds;
      this.publish();
    }
    return this.stableHz;
  }

  /** Drops every sample and the published pitch, as if nothing had been heard. */
  public reset(): void {
    this.samples.length = 0;
    this.sampleDurations.length = 0;
    this.windowDuration = 0;
    this.sinceUpdate = 0;
    this.stableHz = 0;
    this.candidateHz = 0;
    this.candidateUpdates = 0;
  }

  /** Recomputes the published pitch from the window. */
  private publish(): void {
    const voiced = this.samples.filter((hz) => hz > 0);
    if (voiced.length < this.voicedFraction * this.samples.length) {
      // Mostly silence: report no pitch right away. Showing nothing is never a
      // wrong reading, so this one direction needs no confirmation.
      this.stableHz = 0;
      this.candidateHz = 0;
      this.candidateUpdates = 0;
      return;
    }

    const candidate = median(voiced);
    if (this.stableHz <= 0) {
      // Nothing displayed yet - lock on immediately so the first note is not
      // held back by the confirmation rule.
      this.stableHz = candidate;
      this.candidateHz = 0;
      this.candidateUpdates = 0;
      return;
    }
    if (centsApart(candidate, this.stableHz) < this.holdCents) {
      // Same pitch, differently rounded: leave the display alone.
      this.candidateHz = 0;
      this.candidateUpdates = 0;
      return;
    }

    // A different pitch. Adopt it only once it has been the median several
    // updates running - a burst of octave errors will not last that long.
    if (this.candidateHz > 0 && centsApart(candidate, this.candidateHz) < this.holdCents) {
      this.candidateUpdates += 1;
    } else {
      this.candidateHz = candidate;
      this.candidateUpdates = 1;
    }
    if (this.candidateUpdates >= this.confirmUpdates) {
      this.stableHz = candidate;
      this.candidateHz = 0;
      this.candidateUpdates = 0;
    }
  }
}

/**
 * Upper median of a non-empty list. Never averages the two middle values: half of
 * an octave error is a pitch that was never measured.
 */
function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[sorted.length >> 1] ?? 0;
}

/** Distance between two positive frequencies, in cents (always >= 0). */
function centsApart(a: number, b: number): number {
  return Math.abs(1200 * Math.log2(a / b));
}
