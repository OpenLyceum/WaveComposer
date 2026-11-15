/** Tests the synthetic source used by the application with a controlled Web Audio clock. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SyntheticWebAudioSource } from "../../../../src/common/model/audio/SyntheticWebAudioSource.js";

const { context, processor } = vi.hoisted(() => {
  const mockProcessor = {
    onaudioprocess: null as ((event: AudioProcessingEvent) => void) | null,
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
  const mockContext = {
    sampleRate: 8000,
    createScriptProcessor: () => mockProcessor,
    createAnalyser: () => ({
      fftSize: 0,
      smoothingTimeConstant: 0,
      getFloatTimeDomainData: (out: Float32Array) => out.fill(0.25),
    }),
    createGain: () => ({ gain: { value: 1 }, disconnect: vi.fn() }),
  };
  return { context: mockContext, processor: mockProcessor };
});

vi.mock("../../../../src/common/model/audio/SharedAudioContext.js", () => ({
  getSharedSampleRate: () => context.sampleRate,
  resumeSharedAudioContext: async () => context,
  connectSharedMonitoringOutput: vi.fn(),
}));

function processFrame(out: Float32Array): void {
  expect(processor.onaudioprocess).not.toBeNull();
  processor.onaudioprocess?.({
    outputBuffer: { getChannelData: () => out },
  } as unknown as AudioProcessingEvent);
}

beforeEach(() => {
  vi.clearAllMocks();
  processor.onaudioprocess = null;
});

describe("SyntheticWebAudioSource", () => {
  it("starts and stops the actual playback graph at the shared sample rate", async () => {
    const source = new SyntheticWebAudioSource(() => undefined, 1024);
    const frame = new Float32Array(1024);
    expect(source.isActive).toBe(false);
    expect(source.getFrame(frame)).toBe(false);
    expect(source.sampleRate).toBe(8000);
    await source.start();
    expect(source.isActive).toBe(true);
    expect(source.getFrame(frame)).toBe(true);
    expect(frame[0]).toBeCloseTo(0.25);
    source.stop();
    expect(source.isActive).toBe(false);
    expect(source.getFrame(frame)).toBe(false);
    expect(processor.disconnect).toHaveBeenCalledOnce();
  });

  it("advances synthesis time by the processed frame length and resets on restart", async () => {
    const seen: number[] = [];
    const source = new SyntheticWebAudioSource((_out, _sampleRate, timeS) => seen.push(timeS), 1024);
    const frame = new Float32Array(1024);
    await source.start();
    processFrame(frame);
    processFrame(frame);
    expect(seen).toEqual([0, 1024 / context.sampleRate]);
    expect(source.playbackTimeS).toBeCloseTo((2 * frame.length) / context.sampleRate, 10);
    source.stop();
    expect(source.playbackTimeS).toBe(0);
    await source.start();
    processFrame(frame);
    expect(seen[2]).toBe(0);
    source.stop();
  });

  it("fills the Web Audio output buffer through its generator", async () => {
    const generate = vi.fn((out: Float32Array) => out.fill(0.42));
    const source = new SyntheticWebAudioSource(generate, 1024);
    const frame = new Float32Array(8);
    await source.start();
    processFrame(frame);
    expect(generate).toHaveBeenCalledWith(frame, context.sampleRate, 0);
    for (const value of frame) {
      expect(value).toBeCloseTo(0.42, 5);
    }
    source.stop();
  });
});
