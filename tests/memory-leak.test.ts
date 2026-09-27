/**
 * Fleet-standard memory-leak regression suite (node / pure-DSP environment).
 * WaveComposer unit tests avoid SceneryStack axon imports; we GC a DSP helper instead.
 */

import { describe, expect, it } from "vitest";
import { Decimator } from "../src/common/model/dsp/Decimator.js";
import { VoiceAnalyzer } from "../src/common/model/VoiceAnalyzer.js";
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

describeDisposalLeaks([]);
