/**
 * BaseAnalysisModel.test.ts
 *
 * Screen-activity gating: only the screen on display may reach the speakers.
 *
 * The model pulls `audioManager` from `scenerystack/sim`, which drags in the
 * whole scenery display stack; it is mocked here so the spec keeps running in
 * the DOM-free `node` environment that the rest of the suite uses.
 */
import { BooleanProperty } from "scenerystack/axon";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlayableAudioSource } from "../../../src/common/model/audio/AudioFrameSource.js";
import { BaseAnalysisModel } from "../../../src/common/model/BaseAnalysisModel.js";
import { WaveComposerPreferencesModel } from "../../../src/preferences/WaveComposerPreferencesModel.js";

// Runs above the imports: scenerystack's globals module reads `self` and
// `location` at import time.
vi.hoisted(() => {
  const globals = globalThis as unknown as Record<string, unknown>;
  globals["self"] = globalThis;
  globals["location"] = { search: "", href: "http://localhost/", protocol: "http:", hostname: "localhost" };
});

vi.mock("scenerystack/sim", () => ({
  audioManager: { audioAndSoundEnabledProperty: new BooleanProperty(true) },
}));

const CLIP_ID = "clip";

/**
 * Stand-in for a Web Audio backed clip. `isActive` stays false until the graph
 * is really built, which is what a real source does while the shared
 * AudioContext is still suspended (i.e. before the first user gesture).
 */
class FakeClipSource implements PlayableAudioSource {
  public readonly isPlayable = true as const;
  public readonly sampleRate = 44100;
  public startCount = 0;
  public stopCount = 0;
  /** When false, start() leaves the source inactive, as a suspended context does. */
  public resolveToActive = false;
  private active = false;

  public get isActive(): boolean {
    return this.active;
  }

  public start(): Promise<void> {
    this.startCount++;
    if (this.resolveToActive) {
      this.active = true;
    }
    return Promise.resolve();
  }

  public stop(): void {
    this.stopCount++;
    this.active = false;
  }

  public setFftSize(): void {
    // no-op
  }

  public getFrame(_buffer: Float32Array): boolean {
    return false;
  }
}

/** A screen model that selects a clip in its constructor, like ComposerModel. */
class ClipScreenModel extends BaseAnalysisModel {
  public readonly clip = new FakeClipSource();

  public constructor() {
    super([], new WaveComposerPreferencesModel(), { includeMicrophone: false });
    this.registerAdditionalSource(CLIP_ID, this.clip);
    this.audioSourceProperty.value = CLIP_ID;
  }
}

describe("BaseAnalysisModel screen-activity gating", () => {
  let model: ClipScreenModel;

  beforeEach(() => {
    model = new ClipScreenModel();
  });

  it("does not start the selected source before the screen is shown", () => {
    expect(model.clip.startCount).toBe(0);
  });

  it("starts the source when the screen becomes active", () => {
    model.resumeAudioForActiveScreen();
    expect(model.clip.startCount).toBe(1);
  });

  it("stops a source whose start has not taken effect yet when the screen is hidden", () => {
    model.resumeAudioForActiveScreen();
    // The graph is still pending (suspended AudioContext), so isActive is false.
    expect(model.clip.isActive).toBe(false);
    model.suspendAudioForInactiveScreen();
    // Must still stop: otherwise the pending start comes alive on the user's
    // first gesture and the hidden screen becomes audible.
    expect(model.clip.stopCount).toBe(1);
  });

  it("restores playback when the screen is shown again", () => {
    model.clip.resolveToActive = true;
    model.resumeAudioForActiveScreen();
    model.suspendAudioForInactiveScreen();
    expect(model.clip.isActive).toBe(false);
    model.resumeAudioForActiveScreen();
    expect(model.clip.startCount).toBe(2);
    expect(model.clip.isActive).toBe(true);
  });

  it("ignores repeated activity notifications", () => {
    model.resumeAudioForActiveScreen();
    model.resumeAudioForActiveScreen();
    expect(model.clip.startCount).toBe(1);
    model.suspendAudioForInactiveScreen();
    model.suspendAudioForInactiveScreen();
    expect(model.clip.stopCount).toBe(1);
  });
});

/** A clip that fills every requested frame with a steady sine at {@link frequencyHz}. */
class SineClipSource extends FakeClipSource {
  /** Tone written into the next frame; change it to inject a rogue estimate. */
  public frequencyHz = 220;
  private phase = 0;

  public override getFrame(buffer: Float32Array): boolean {
    for (let i = 0; i < buffer.length; i++) {
      buffer[i] = Math.sin(this.phase);
      this.phase += (2 * Math.PI * this.frequencyHz) / this.sampleRate;
    }
    return true;
  }
}

/** A listening screen model fed by a sine clip. */
class SineScreenModel extends BaseAnalysisModel {
  public readonly clip = new SineClipSource();

  public constructor() {
    super([], new WaveComposerPreferencesModel(), { includeMicrophone: false });
    this.clip.resolveToActive = true;
    this.registerAdditionalSource(CLIP_ID, this.clip);
    this.audioSourceProperty.value = CLIP_ID;
    this.resumeAudioForActiveScreen();
  }

  /** Steps `frames` frames of `dt` seconds each, as the sim's animation loop would. */
  public stepFrames(frames: number, dt: number): void {
    for (let i = 0; i < frames; i++) {
      this.step(dt);
    }
  }
}

describe("BaseAnalysisModel stabilized pitch", () => {
  let model: SineScreenModel;

  beforeEach(() => {
    model = new SineScreenModel();
  });

  it("tracks the analyzed pitch on every frame", () => {
    model.stepFrames(1, 0.016);
    expect(model.f0Property.value).toBeGreaterThan(200);
    expect(model.f0Property.value).toBeLessThan(240);
  });

  it("holds the stabilized pitch until the slow update interval elapses", () => {
    model.stepFrames(1, 0.1);
    expect(model.stableF0Property.value).toBe(0);
    model.stepFrames(1, 0.1);
    expect(model.stableF0Property.value).toBeGreaterThan(200);
    expect(model.stableF0Property.value).toBeLessThan(240);
  });

  it("outvotes a rogue frame instead of showing it", () => {
    model.stepFrames(2, 0.1);
    // The rogue frame is the one that closes the interval, so a readout that
    // simply latched the newest estimate would show 440 Hz here.
    model.clip.frequencyHz = 440;
    model.stepFrames(1, 0.1);
    expect(model.stableF0Property.value).toBeLessThan(300);
  });

  it("follows a pitch that is really sustained", () => {
    model.stepFrames(60, 0.016);
    model.clip.frequencyHz = 440;
    model.stepFrames(120, 0.016);
    expect(model.stableF0Property.value).toBeGreaterThan(400);
    expect(model.stableF0Property.value).toBeLessThan(480);
  });

  it("clears the stabilized pitch when the model is reset", () => {
    model.stepFrames(4, 0.1);
    expect(model.stableF0Property.value).toBeGreaterThan(0);
    model.reset();
    expect(model.stableF0Property.value).toBe(0);
  });
});
