/**
 * AnalyzerModel.test.ts
 *
 * The Analyzer listens to instruments and to whistling, both of which run well
 * above the human voice's range. Feeding whistle-range tones through the real
 * DSP pipeline pins the screen's F0 search band, because a source above that
 * band is not reported as "no pitch" — it is reported as an exact sub-harmonic
 * of itself, which silently renumbers every harmonic marker on the spectrum.
 *
 * Mocks match BaseAnalysisModel.test.ts: the model reaches into
 * `scenerystack/sim`, which drags in the whole scenery display stack.
 */
import { BooleanProperty } from "scenerystack/axon";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AnalyzerModel } from "../../../src/analyzer-screen/model/AnalyzerModel.js";
import type { AudioFrameSource } from "../../../src/common/model/audio/AudioFrameSource.js";
import { WaveComposerPreferencesModel } from "../../../src/preferences/WaveComposerPreferencesModel.js";

vi.hoisted(() => {
  const globals = globalThis as unknown as Record<string, unknown>;
  globals["self"] = globalThis;
  globals["location"] = { search: "", href: "http://localhost/", protocol: "http:", hostname: "localhost" };
});

vi.mock("scenerystack/sim", () => ({
  audioManager: { audioAndSoundEnabledProperty: new BooleanProperty(true) },
}));

const SOURCE_ID = "tone";
const SAMPLE_RATE = 44100;
/** One animation frame at 60 Hz, the cadence the model is stepped at. */
const DT = 1 / 60;

/** Emits a continuous sine, as a microphone picking up a whistle would. */
class ToneSource implements AudioFrameSource {
  public readonly sampleRate = SAMPLE_RATE;
  public readonly isActive = true;
  public frequencyHz = 1500;
  private phase = 0;

  public getFrame(out: Float32Array): boolean {
    for (let i = 0; i < out.length; i++) {
      out[i] = 0.3 * Math.sin(this.phase);
      this.phase += (2 * Math.PI * this.frequencyHz) / SAMPLE_RATE;
    }
    return true;
  }
}

class TestAnalyzerModel extends AnalyzerModel {
  public readonly tone = new ToneSource();

  public constructor() {
    super(new WaveComposerPreferencesModel());
    this.registerAdditionalSource(SOURCE_ID, this.tone);
    this.audioSourceProperty.value = SOURCE_ID;
  }
}

describe("AnalyzerModel pitch range", () => {
  let model: TestAnalyzerModel;

  beforeEach(() => {
    model = new TestAnalyzerModel();
  });

  // Regression: whistling reads around 1-2.5 kHz, above the voice's 800 Hz
  // ceiling. With that ceiling the shortest period the detector could search was
  // already the second multiple of the real one, so a whistle came back at
  // exactly half its pitch and the marker for n = 1 landed on the true n = 2.
  it.each([1000, 1500, 2000, 2500])("reports a %d Hz whistle at its own pitch", (frequencyHz) => {
    model.tone.frequencyHz = frequencyHz;
    // A few frames: the first ones fill the analysis buffer.
    for (let i = 0; i < 5; i++) {
      model.step(DT);
    }
    expect(model.f0Property.value / frequencyHz).toBeGreaterThan(0.97);
    expect(model.f0Property.value / frequencyHz).toBeLessThan(1.03);
  });

  it("still reports instrument-range pitches", () => {
    model.tone.frequencyHz = 220;
    for (let i = 0; i < 5; i++) {
      model.step(DT);
    }
    expect(Math.abs(model.f0Property.value - 220)).toBeLessThan(3);
  });
});
