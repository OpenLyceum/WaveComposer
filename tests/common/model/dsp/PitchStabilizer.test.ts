/**
 * PitchStabilizer.test.ts
 *
 * The stabilizer exists so the harmonic markers and the numeric pitch readout
 * hold still, so the specs are about what the display does NOT do: follow a
 * stray frame, follow a brief burst of octave errors, or twitch with vibrato.
 */
import { describe, expect, it } from "vitest";
import { PitchStabilizer } from "../../../../src/common/model/dsp/PitchStabilizer.js";

/** One animation frame at 60 fps, which is how often the analyzer runs. */
const FRAME_S = 1 / 60;

/** Feeds `seconds` of a steady pitch and returns the published value. */
function feed(stabilizer: PitchStabilizer, seconds: number, frequencyHz: number): number {
  const frames = Math.round(seconds / FRAME_S);
  let value = stabilizer.value;
  for (let i = 0; i < frames; i++) {
    value = stabilizer.update(FRAME_S, frequencyHz);
  }
  return value;
}

describe("PitchStabilizer", () => {
  it("reports no pitch before the first update interval", () => {
    const stabilizer = new PitchStabilizer();
    expect(feed(stabilizer, 0.05, 220)).toBe(0);
  });

  it("locks onto the first pitch it hears without waiting for confirmation", () => {
    const stabilizer = new PitchStabilizer();
    expect(feed(stabilizer, 0.3, 220)).toBeCloseTo(220, 5);
  });

  it("ignores a single octave-jumped frame", () => {
    const stabilizer = new PitchStabilizer();
    feed(stabilizer, 1, 220);
    stabilizer.update(FRAME_S, 440);
    expect(feed(stabilizer, 0.3, 220)).toBeCloseTo(220, 5);
  });

  it("ignores a burst of octave errors too short to take over the window", () => {
    const stabilizer = new PitchStabilizer();
    feed(stabilizer, 1, 220);
    // The detector reports the second harmonic for 0.15 s - long enough to be
    // several frames, short enough that it never holds half the median window.
    expect(feed(stabilizer, 0.15, 440)).toBeCloseTo(220, 5);
    expect(feed(stabilizer, 1, 220)).toBeCloseTo(220, 5);
  });

  it("does not move for vibrato-sized wobble around one note", () => {
    const stabilizer = new PitchStabilizer();
    const locked = feed(stabilizer, 1, 220);
    for (let i = 0; i < 120; i++) {
      // +/- 20 cents, alternating frame to frame.
      stabilizer.update(FRAME_S, 220 * 2 ** ((i % 2 === 0 ? 20 : -20) / 1200));
    }
    expect(stabilizer.value).toBe(locked);
  });

  it("follows a real note change within about a third of a second", () => {
    const stabilizer = new PitchStabilizer();
    feed(stabilizer, 1, 220);
    // Fast enough to keep up with a melody: A3 to D4 is on the display well
    // inside half a second. Slower than this and the sim looks like it has
    // stopped listening.
    expect(feed(stabilizer, 0.4, 293.66)).toBeCloseTo(293.66, 5);
  });

  it("makes a new pitch win several updates before adopting it", () => {
    const stabilizer = new PitchStabilizer({ windowSeconds: 0.25, updateIntervalSeconds: 0.25, confirmUpdates: 3 });
    feed(stabilizer, 1, 220);
    // The window is full of the new pitch after 0.25 s, but three consecutive
    // updates have to agree before the display moves.
    expect(feed(stabilizer, 0.5, 660)).toBeCloseTo(220, 5);
    expect(feed(stabilizer, 0.5, 660)).toBeCloseTo(660, 5);
  });

  it("reports no pitch once the input has been mostly unvoiced for a window", () => {
    const stabilizer = new PitchStabilizer();
    feed(stabilizer, 1, 220);
    expect(feed(stabilizer, 0.2, 0)).toBeCloseTo(220, 5);
    expect(feed(stabilizer, 1, 0)).toBe(0);
  });

  it("locks on again immediately after silence", () => {
    const stabilizer = new PitchStabilizer();
    feed(stabilizer, 1, 220);
    feed(stabilizer, 1, 0);
    expect(feed(stabilizer, 0.8, 660)).toBeCloseTo(660, 5);
  });

  it("forgets everything on reset", () => {
    const stabilizer = new PitchStabilizer();
    feed(stabilizer, 1, 220);
    stabilizer.reset();
    expect(stabilizer.value).toBe(0);
    expect(feed(stabilizer, 0.1, 440)).toBe(0);
  });
});
