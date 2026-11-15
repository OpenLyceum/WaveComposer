/**
 * Fleet-standard memory-leak regression suite.
 *
 * No class in src/ has a dispose(), so the custom suites below use create/drop + forceGC:
 *  - DSP helpers: Decimator and VoiceAnalyzer;
 *  - screen models: ComposerModel, AnalyzerModel and VoiceModel (each with a
 *    WaveComposerPreferencesModel, whose Properties the model links to — they are created
 *    and dropped together, as the sim keeps both for the whole run).
 * describeDisposalLeaks([]) at the bottom keeps the fleet harness sanity checks.
 */

import { BooleanProperty } from "scenerystack/axon";
import { describe, expect, it, vi } from "vitest";
import { AnalyzerModel } from "../src/analyzer-screen/model/AnalyzerModel.js";
import { Decimator } from "../src/common/model/dsp/Decimator.js";
import { VoiceAnalyzer } from "../src/common/model/VoiceAnalyzer.js";
import { ComposerModel } from "../src/composer-screen/model/ComposerModel.js";
import { WaveComposerPreferencesModel } from "../src/preferences/WaveComposerPreferencesModel.js";
import { VoiceModel } from "../src/voice-screen/model/VoiceModel.js";
import { describeDisposalLeaks, forceGC } from "./helpers/memoryLeak.js";

function createAndDropDecimator(): WeakRef<object> {
  const decimator = new Decimator(4);
  return new WeakRef<object>(decimator);
}

function createAndDropVoiceAnalyzer(): WeakRef<object> {
  const analyzer = new VoiceAnalyzer({
    sampleRate: 44100,
    fftSize: 1024,
    windowType: "hann",
    lpcOrder: 12,
    f0MinHz: 60,
    f0MaxHz: 800,
    formantMaxHz: 5000,
  });
  // Run one frame so every lazily touched buffer/FFT path is exercised.
  analyzer.analyze(new Float32Array(1024));
  return new WeakRef<object>(analyzer);
}

// The models read `audioManager` from `scenerystack/sim`, which drags in the whole scenery
// display stack; mock it as the model specs do. Runs above the imports because scenerystack's
// globals module reads `self` and `location` at import time.
vi.hoisted(() => {
  const globals = globalThis as unknown as Record<string, unknown>;
  globals["self"] = globalThis;
  globals["location"] = { search: "", href: "http://localhost/", protocol: "http:", hostname: "localhost" };
});

// Each model construction gets its own audio-enabled Property. The real one is a global that
// lives for the whole run, and BaseAnalysisModel.isMonitoringProperty (a DerivedProperty over
// it, with no dispose()) adds a listener to it that closes over the model — so a model built on
// the global Property can never be collected. The models live for the whole sim, so that is
// harmless in production, but it would mask any other leak in these checks.
vi.mock("scenerystack/sim", () => ({
  audioManager: {
    get audioAndSoundEnabledProperty() {
      return new BooleanProperty(true);
    },
  },
}));

type ScreenModel = ComposerModel | AnalyzerModel | VoiceModel;

const SCREEN_MODELS: readonly { name: string; create: (preferences: WaveComposerPreferencesModel) => ScreenModel }[] = [
  { name: "ComposerModel", create: (preferences) => new ComposerModel(preferences) },
  { name: "AnalyzerModel", create: (preferences) => new AnalyzerModel(preferences) },
  { name: "VoiceModel", create: (preferences) => new VoiceModel(preferences) },
];

function createAndDropScreenModel(create: (preferences: WaveComposerPreferencesModel) => ScreenModel): WeakRef<object> {
  const preferences = new WaveComposerPreferencesModel();
  const model = create(preferences);
  for (let i = 0; i < 10; i++) {
    model.step(1 / 60);
  }
  // Changing an analysis preference reconfigures the model through its linked listeners.
  preferences.lpcOrderProperty.value = preferences.lpcOrderProperty.value === 10 ? 12 : 10;
  model.reset();
  return new WeakRef<object>(model);
}

describe("Screen models (no dispose(): create/drop)", () => {
  for (const { name, create } of SCREEN_MODELS) {
    it(`${name} is collected after drop together with its preferences`, async () => {
      const ref = createAndDropScreenModel(create);
      await forceGC(ref);
      expect(ref.deref()).toBeUndefined();
    });

    it(`${name}: repeated create/drop cycles leave no survivors`, async () => {
      const refs: WeakRef<object>[] = [];
      for (let i = 0; i < 10; i++) {
        refs.push(createAndDropScreenModel(create));
      }
      await forceGC(refs);
      expect(refs.filter((r) => r.deref() !== undefined).length).toBe(0);
    });
  }
});

describe("Memory leak regression", () => {
  it("Decimator is collected after drop", async () => {
    const ref = createAndDropDecimator();
    await forceGC(ref);
    expect(ref.deref()).toBeUndefined();
  });

  it("VoiceAnalyzer (full DSP pipeline) is collected after drop", async () => {
    const ref = createAndDropVoiceAnalyzer();
    await forceGC(ref);
    expect(ref.deref()).toBeUndefined();
  });

  it("repeated create/drop cycles leave no survivors", async () => {
    const refs: WeakRef<object>[] = [];
    for (let i = 0; i < 10; i++) {
      refs.push(createAndDropDecimator());
    }
    await forceGC(refs);
    const survivors = refs.filter((r) => r.deref() !== undefined).length;
    expect(survivors).toBe(0);
  });
});

// Nothing in src/ has a dispose(), so there is no case to list. The custom suites above cover:
// Decimator and VoiceAnalyzer (DSP), plus ComposerModel, AnalyzerModel and VoiceModel.
describeDisposalLeaks([]);
