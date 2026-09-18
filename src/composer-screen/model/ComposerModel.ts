/**
 * ComposerModel.ts
 *
 * Dedicated wave-composition screen model. Synthesizes a user-defined sum of up to
 * four sinusoids and feeds the shared DSP pipeline for live waveform, spectrum,
 * and standing-wave displays.
 */
import { NumberProperty } from "scenerystack/axon";
import { Range } from "scenerystack/dot";
import { createComposableGenerator, createComposableSource } from "../../common/model/audio/ComposableFrameSource.js";
import { BaseAnalysisModel } from "../../common/model/BaseAnalysisModel.js";
import { COMPOSE_SOURCE_ID, CompositionState } from "../../common/model/CompositionState.js";
import type { HarmonicChartModel, StandingWaveMode } from "../../common/model/HarmonicChartModel.js";
import { createPipeBoundaryProperty, PipeBoundary } from "../../common/model/PipeBoundary.js";
import type { WaveComposerPreferencesModel } from "../../preferences/WaveComposerPreferencesModel.js";

const DEFAULT_MIN_FREQUENCY_HZ = 0;
const FREQUENCY_RANGE = new Range(0, 22050);

// Two tones only produce audible beating when their frequencies are close;
// beyond ~20 Hz the percept becomes roughness / separate tones, so the readout
// would be physically misleading (an octave pair is not "beating at 220 Hz").
const MAX_BEAT_RATE_HZ = 20;

// A partial counts as harmonic when f/f1 is within this of an integer. Tight
// enough that a beats pair (e.g. 224/220 → 1.018) is NOT folded into mode 1.
const HARMONIC_RATIO_TOLERANCE = 0.01;

export class ComposerModel extends BaseAnalysisModel implements HarmonicChartModel {
  public readonly minFrequencyProperty = new NumberProperty(DEFAULT_MIN_FREQUENCY_HZ, { range: FREQUENCY_RANGE });
  public readonly composition = new CompositionState();
  public readonly pipeBoundaryProperty = createPipeBoundaryProperty(PipeBoundary.STRING);
  private readonly displayGenerator = createComposableGenerator(() => this.composition.getPartials());
  /** One single-partial generator per partial, for the oscilloscope's component traces. */
  private readonly partialGenerators = this.composition.partials.map((partial) =>
    createComposableGenerator(() => [partial.toPartial()]),
  );

  public constructor(analysisPreferences: WaveComposerPreferencesModel) {
    super([], analysisPreferences, { includeMicrophone: false });
    this.registerAdditionalSource(
      COMPOSE_SOURCE_ID,
      createComposableSource(() => this.composition.getPartials(), analysisPreferences.fftSizeProperty.value),
    );
    this.audioSourceProperty.value = COMPOSE_SOURCE_ID;
  }

  protected override getAdditionalSourceIds(): string[] {
    return [COMPOSE_SOURCE_ID];
  }

  public override getSourceValues(): string[] {
    return [COMPOSE_SOURCE_ID];
  }

  public override reset(): void {
    super.reset();
    this.minFrequencyProperty.reset();
    this.composition.reset();
    this.pipeBoundaryProperty.reset();
    this.audioSourceProperty.value = COMPOSE_SOURCE_ID;
  }

  /** Lowest active partial frequency (the fundamental), or 0 if none are active. */
  public getFundamentalHz(): number {
    let fundamental = 0;
    for (const partial of this.composition.partials) {
      const frequency = partial.frequencyProperty.value;
      if (partial.enabledProperty.value && frequency > 0 && (fundamental === 0 || frequency < fundamental)) {
        fundamental = frequency;
      }
    }
    return fundamental;
  }

  /**
   * Standing-wave modes for the display strip, but only when the active partials
   * actually form a harmonic series over the lowest one (mode number = frequency
   * ratio). Non-harmonic sets (beats pairs, triads) return no modes: a single
   * string cannot host those partials, so drawing them as modes 1..k would be
   * physically wrong.
   */
  public getStandingWaveModes(): readonly StandingWaveMode[] {
    const fundamental = this.getFundamentalHz();
    if (fundamental <= 0) {
      return [];
    }
    const modes: StandingWaveMode[] = [];
    const usedModeNumbers = new Set<number>();
    for (const partial of this.composition.partials) {
      const frequency = partial.frequencyProperty.value;
      const amplitude = partial.amplitudeProperty.value;
      if (!partial.enabledProperty.value || frequency <= 0 || amplitude <= 0) {
        continue;
      }
      const ratio = frequency / fundamental;
      const modeNumber = Math.round(ratio);
      // A non-integer ratio (detuned partial) or two partials landing on the
      // same mode means this is not a harmonic series — hide the strip.
      if (Math.abs(ratio - modeNumber) > HARMONIC_RATIO_TOLERANCE * modeNumber || usedModeNumbers.has(modeNumber)) {
        return [];
      }
      usedModeNumbers.add(modeNumber);
      modes.push({ modeNumber, amplitude });
    }
    return modes;
  }

  /** Beat rate (Hz) when exactly two close partials are active; otherwise 0. */
  public getBeatRateHz(): number {
    const frequencies = this.composition.partials
      .filter((p) => p.enabledProperty.value && p.frequencyProperty.value > 0)
      .map((p) => p.frequencyProperty.value)
      .sort((a, b) => a - b);
    if (frequencies.length !== 2) {
      return 0;
    }
    const low = frequencies[0] ?? 0;
    const high = frequencies[1] ?? 0;
    const beatHz = Math.abs(high - low);
    // Only report a rate the ear would actually perceive as beating.
    return beatHz <= MAX_BEAT_RATE_HZ ? beatHz : 0;
  }

  /**
   * Fills `out` with a phase-continuous sum of the enabled partials. Used by the
   * oscilloscope so the displayed time window is not capped at one FFT frame.
   */
  public fillDisplayWaveform(out: Float32Array): void {
    this.displayGenerator(out, this.sampleRateProperty.value, this.getSourcePlaybackTimeS(COMPOSE_SOURCE_ID));
  }

  /**
   * Fills `out` with one partial's contribution on the same time base as
   * {@link fillDisplayWaveform}, so a component trace lines up sample-for-sample
   * with the sum drawn over it. Returns false when the partial contributes
   * nothing (off, silent, or out of range), in which case `out` is left zeroed.
   */
  public fillPartialWaveform(index: number, out: Float32Array): boolean {
    const partial = this.composition.partials[index];
    const generator = this.partialGenerators[index];
    if (!(partial && generator && partial.enabledProperty.value) || partial.amplitudeProperty.value <= 0) {
      out.fill(0);
      return false;
    }
    generator(out, this.sampleRateProperty.value, this.getSourcePlaybackTimeS(COMPOSE_SOURCE_ID));
    return true;
  }
}
