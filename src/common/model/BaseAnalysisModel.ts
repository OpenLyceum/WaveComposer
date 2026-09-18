/**
 * BaseAnalysisModel.ts
 *
 * Shared per-screen audio and DSP model. Each screen owns its own instance so
 * source selection, recordings, microphone state, analyzer settings, and analysis
 * outputs are isolated from the other screens.
 */
import {
  BooleanProperty,
  createObservableArray,
  DerivedProperty,
  Emitter,
  NumberProperty,
  type ObservableArray,
  Property,
  type TReadOnlyProperty,
} from "scenerystack/axon";
import { Range } from "scenerystack/dot";
import type { TModel } from "scenerystack/joist";
import { audioManager } from "scenerystack/sim";
import type { WaveComposerPreferencesModel } from "../../preferences/WaveComposerPreferencesModel.js";
import { AudioFileFrameSource } from "./audio/AudioFileFrameSource.js";
import { type AudioFrameSource, isPlayableSource } from "./audio/AudioFrameSource.js";
import { MicrophoneInput } from "./audio/MicrophoneInput.js";
import { isMonitoredAudioSource } from "./audio/MonitoredAudioSource.js";
import { getPresetAssetUrl } from "./audio/presetAssets.js";
import type { PresetCatalogEntry, PresetId } from "./audio/presetCatalog.js";
import { createSyntheticSource } from "./audio/presets.js";
import { RecordedAudioSource } from "./audio/RecordedAudioSource.js";
import { SyntheticWebAudioSource } from "./audio/SyntheticWebAudioSource.js";
import { centsFromFrequency, noteNameFromFrequency } from "./dsp/NoteUtils.js";
import { PitchStabilizer } from "./dsp/PitchStabilizer.js";
import type { FormantData } from "./dsp/types.js";
import type { WindowType } from "./dsp/WindowFunction.js";
import { type AnalysisResult, type AnalyzerConfig, VoiceAnalyzer } from "./VoiceAnalyzer.js";

const DEFAULT_MAX_FREQUENCY_HZ = 5000;
const MAX_FREQUENCY_RANGE = new Range(0, 22050);

// Fixed F0 / voice-quality search band (Hz). Covers low male speech to high
// singing without wandering into formant territory.
/** Default F0 search band: the human voice. See {@link BaseAnalysisModel.f0SearchRangeHz}. */
const F0_MIN_HZ = 60;
const F0_MAX_HZ = 800;

// A voiced frame needs both a positive F0 and enough periodicity confidence.
const VOICED_CONFIDENCE_THRESHOLD = 0.5;

const EMPTY_FORMANTS: readonly FormantData[] = [];
const DEFAULT_SAMPLE_RATE_HZ = 44100;

/** Live microphone input id (not in the preset catalogs). */
export const AudioSource = {
  MICROPHONE: "microphone",
} as const;

export type AudioSource = (typeof AudioSource)[keyof typeof AudioSource] | PresetId | string;

/**
 * Keys for user-facing audio failure/limit notices. The model reports a key and
 * the view maps it to a localized string, so notices localize like every other
 * string in the sim.
 */
export const AudioNotice = {
  MICROPHONE_DENIED: "microphoneDenied",
  MICROPHONE_UNAVAILABLE: "microphoneUnavailable",
  RECORDING_LIMIT: "recordingLimit",
} as const;

export type AudioNotice = (typeof AudioNotice)[keyof typeof AudioNotice];

/** Prefix for the dynamic ids of user recordings (e.g. "recording-1"). */
const RECORDING_ID_PREFIX = "recording-";

/**
 * A user-captured microphone recording, exposed as a selectable source. The raw PCM
 * is kept so it can be saved to a WAV file; `source` loops it for playback/analysis.
 */
export interface RecordingEntry {
  readonly id: string;
  /** 1-based ordinal used for the "Recording N" label and the download filename. */
  readonly index: number;
  readonly samples: Float32Array;
  readonly sampleRate: number;
  readonly source: RecordedAudioSource;
}

function createPresetSource(entry: PresetCatalogEntry, fftSize: number): AudioFrameSource {
  if (entry.asset) {
    const url = getPresetAssetUrl(entry.asset);
    if (url) {
      return new AudioFileFrameSource(url, fftSize);
    }
  }
  const synthetic = createSyntheticSource(entry.id, fftSize);
  if (synthetic) {
    return synthetic;
  }
  throw new Error(`No audio asset or synthesizer for preset: ${entry.id}`);
}

export class BaseAnalysisModel implements TModel {
  public readonly presetCatalog: readonly PresetCatalogEntry[];
  public readonly analysisPreferences: WaveComposerPreferencesModel;

  // ── Settings (inputs) ───────────────────────────────────────────────────────
  public readonly maxFrequencyProperty = new NumberProperty(DEFAULT_MAX_FREQUENCY_HZ, { range: MAX_FREQUENCY_RANGE });

  // ── State ───────────────────────────────────────────────────────────────────
  public readonly audioSourceProperty = new Property<string>(AudioSource.MICROPHONE);
  /** User-captured recordings, in creation order; each is also a selectable source. */
  public readonly recordings: ObservableArray<RecordingEntry> = createObservableArray<RecordingEntry>();
  /** When true, the microphone is being recorded into a new clip. */
  public readonly isRecordingProperty = new BooleanProperty(false);
  /** Whether the microphone is currently capturing. */
  public readonly isListeningProperty = new BooleanProperty(false);
  /** When true, the active source is routed to the speakers. */
  public readonly isAudioEnabledProperty = new BooleanProperty(true);
  /**
   * When true, analysis is paused so the current display can be inspected. Audio
   * stops with it: a frozen display whose sound kept running would describe a
   * moment that has already passed.
   */
  public readonly isFrozenProperty = new BooleanProperty(false);
  /**
   * The global audio state: the navigation-bar sound button AND
   * Preferences > Audio > Sounds. Re-exported here so views can grey out their
   * audio controls without reaching for the joist singleton themselves.
   */
  public readonly isGlobalAudioEnabledProperty: TReadOnlyProperty<boolean> = audioManager.audioAndSoundEnabledProperty;
  /**
   * Whether the active source actually reaches the speakers: the screen's own
   * audio toggle AND the global audio state. This sim monitors raw Web Audio
   * graphs instead of tambo SoundGenerators, so nothing mutes it for us - the
   * global state has to be folded in explicitly or the sim keeps playing with
   * sound switched off.
   */
  public readonly isMonitoringProperty: TReadOnlyProperty<boolean> = DerivedProperty.and([
    this.isAudioEnabledProperty,
    this.isGlobalAudioEnabledProperty,
    DerivedProperty.not(this.isFrozenProperty),
  ]);
  /** Sample rate (Hz) of the active source; the view needs it to map FFT bins to Hz. */
  public readonly sampleRateProperty = new NumberProperty(DEFAULT_SAMPLE_RATE_HZ);
  /**
   * Non-null when the last audio action failed (e.g. microphone permission denied)
   * or hit a limit (recording cap). Holds an {@link AudioNotice} key that the view
   * localizes; cleared on the next successful start or reset.
   */
  public readonly audioNoticeProperty = new Property<AudioNotice | null>(null);

  // ── Outputs (scalar results) ────────────────────────────────────────────────
  public readonly f0Property = new NumberProperty(0);
  public readonly f0ConfidenceProperty = new NumberProperty(0);
  public readonly rmsLevelProperty = new NumberProperty(0);
  public readonly hnrProperty = new NumberProperty(0);
  public readonly cppProperty = new NumberProperty(0);
  public readonly formantsProperty = new Property<readonly FormantData[]>(EMPTY_FORMANTS);

  // ── Outputs (derived) ───────────────────────────────────────────────────────
  public readonly isVoicedProperty: TReadOnlyProperty<boolean> = new DerivedProperty(
    [this.f0Property, this.f0ConfidenceProperty],
    (f0, confidence) => f0 > 0 && confidence >= VOICED_CONFIDENCE_THRESHOLD,
  );
  /**
   * Pitch for anything a person reads rather than watches: the numeric readouts
   * and the harmonic / mode-number overlays. A {@link PitchStabilizer} holds it
   * still through the per-frame jitter and the occasional octave error, which
   * would otherwise renumber every harmonic marker several times a second.
   * Displays that follow the signal frame by frame, such as the cepstrum's
   * pitch-quefrency marker, use the per-frame {@link f0Property} instead.
   */
  public readonly stableF0Property = new NumberProperty(0);
  public readonly noteNameProperty: TReadOnlyProperty<string> = new DerivedProperty([this.stableF0Property], (f0) =>
    noteNameFromFrequency(f0),
  );
  public readonly centsProperty: TReadOnlyProperty<number> = new DerivedProperty([this.stableF0Property], (f0) =>
    f0 > 0 ? centsFromFrequency(f0) : 0,
  );
  public readonly f1FrequencyProperty: TReadOnlyProperty<number> = this.createFormantFrequencyProperty(0);
  public readonly f2FrequencyProperty: TReadOnlyProperty<number> = this.createFormantFrequencyProperty(1);
  public readonly f3FrequencyProperty: TReadOnlyProperty<number> = this.createFormantFrequencyProperty(2);
  public readonly f4FrequencyProperty: TReadOnlyProperty<number> = this.createFormantFrequencyProperty(3);

  /** Fires after each analyzed frame; listeners read {@link analysis} buffers. */
  public readonly frameProcessedEmitter = new Emitter();

  private readonly micInput: MicrophoneInput | null;
  /** Every selectable source, keyed by source id ({@link AudioSource} or recording id). */
  private readonly sources: Map<string, AudioFrameSource>;
  /** Counts captured recordings so each gets a stable, ever-increasing ordinal. */
  private recordingCounter = 0;
  private readonly analyzer: VoiceAnalyzer;
  private frameBuffer: Float32Array;
  private latestResult: AnalysisResult | null = null;
  /** Smooths the per-frame F0 into {@link stableF0Property}. */
  private readonly pitchStabilizer = new PitchStabilizer();
  /**
   * Whether this screen is the one on display. Starts false: every screen's model
   * is built before joist shows a screen, so a source selected in the constructor
   * (e.g. the Composer's synth) must not reach the speakers until
   * {@link linkAnalysisModelToScreenActive} reports this screen active.
   */
  private isScreenActive = false;
  /** Whether the selected source should play while this screen is active. */
  private wantsPlayback = false;
  /** Whether the microphone was capturing when this screen was hidden. */
  private resumeMicAfterScreenActive = false;

  public get fftSizeProperty(): NumberProperty {
    return this.analysisPreferences.fftSizeProperty;
  }

  public get lpcOrderProperty(): NumberProperty {
    return this.analysisPreferences.lpcOrderProperty;
  }

  public get windowTypeProperty(): Property<WindowType> {
    return this.analysisPreferences.windowTypeProperty;
  }

  public constructor(
    presetCatalog: readonly PresetCatalogEntry[],
    analysisPreferences: WaveComposerPreferencesModel,
    options?: { includeMicrophone?: boolean },
  ) {
    this.presetCatalog = presetCatalog;
    this.analysisPreferences = analysisPreferences;
    const includeMicrophone = options?.includeMicrophone !== false;
    const initialFftSize = analysisPreferences.fftSizeProperty.value;
    this.micInput = includeMicrophone ? new MicrophoneInput(initialFftSize) : null;
    const presetSources: [string, AudioFrameSource][] = presetCatalog.map((entry) => [
      entry.id,
      createPresetSource(entry, initialFftSize),
    ]);
    if (this.micInput) {
      // When an in-progress recording hits the in-memory cap, finalize it and
      // tell the user instead of silently dropping further audio.
      this.micInput.onRecordingLimitReached = () => {
        if (this.isRecordingProperty.value) {
          this.stopRecording();
          this.audioNoticeProperty.value = AudioNotice.RECORDING_LIMIT;
        }
      };
    }
    const micEntry: [string, AudioFrameSource][] = this.micInput ? [[AudioSource.MICROPHONE, this.micInput]] : [];
    this.sources = new Map<string, AudioFrameSource>([...micEntry, ...presetSources]);
    this.analyzer = new VoiceAnalyzer(this.buildConfig());
    this.frameBuffer = new Float32Array(initialFftSize);

    // Reconfigure the analyzer + sources whenever an analysis setting changes.
    this.fftSizeProperty.lazyLink(() => this.applyConfig());
    this.windowTypeProperty.lazyLink(() => this.applyConfig());
    this.lpcOrderProperty.lazyLink(() => this.applyConfig());
    this.maxFrequencyProperty.lazyLink(() => this.applyConfig());
    this.audioSourceProperty.lazyLink((source, oldSource) => {
      this.deactivate(oldSource);
      this.activate(source);
      this.applyConfig();
    });
    this.isMonitoringProperty.lazyLink(() => this.applyMonitoring());
  }

  /** The audio source the analyzer currently reads from, or null if none is registered. */
  private get source(): AudioFrameSource | null {
    // No silent fallback: an unknown id means "no source", so step() no-ops
    // rather than analyzing the microphone under another source's label.
    return this.sources.get(this.audioSourceProperty.value) ?? null;
  }

  /** Starts a newly selected source. File/synthetic/recorded clips auto-play; the mic stays lazy. */
  private activate(value: string): void {
    const source = this.sources.get(value);
    this.wantsPlayback = source !== undefined && isPlayableSource(source);
    // A source selected while this screen is hidden waits for the screen to be
    // shown; starting it here would play one screen's audio over another's.
    if (this.wantsPlayback && this.isScreenActive) {
      this.startPlayback(value);
    }
    this.applyMonitoring();
  }

  /** Builds and starts the audio graph for a playable source id. */
  private startPlayback(value: string): void {
    const source = this.sources.get(value);
    if (!(source && isPlayableSource(source))) {
      return;
    }
    // The source's sampleRate is only guaranteed accurate once start() has
    // resolved (the shared AudioContext is created synchronously today, but
    // that is an implementation detail of start()). Re-apply the analyzer
    // config afterward so every frequency mapping uses the real device rate.
    source
      .start()
      .then(() => {
        if (this.audioSourceProperty.value === value) {
          this.applyConfig();
        }
      })
      .catch(() => undefined);
  }

  /** Releases a source we are leaving (mic device / clip playback). */
  private deactivate(value: string): void {
    if (value === AudioSource.MICROPHONE) {
      this.stopListening();
      return;
    }
    const source = this.sources.get(value);
    if (source && isPlayableSource(source)) {
      source.stop();
    }
  }

  /** Pushes the effective play-audio state to every source that supports speaker output. */
  private applyMonitoring(): void {
    const enabled = this.isMonitoringProperty.value;
    for (const source of this.sources.values()) {
      if (isMonitoredAudioSource(source)) {
        source.setMonitoringEnabled(enabled);
      }
    }
  }

  /**
   * The most recent per-frame analysis, including the reused buffers (waveform,
   * power spectrum dB, LPC envelope dB, cepstrum), or null before the first frame.
   */
  public get analysis(): AnalysisResult | null {
    return this.latestResult;
  }

  /**
   * Starts microphone capture (prompts for permission on first call) and selects
   * the microphone as the active source.
   */
  public async startListening(): Promise<void> {
    if (!this.micInput) {
      return;
    }
    this.audioSourceProperty.value = AudioSource.MICROPHONE;
    try {
      await this.micInput.start();
    } catch (error) {
      // Surface the failure instead of swallowing it, so the view can react.
      this.audioNoticeProperty.value =
        error instanceof DOMException && error.name === "NotAllowedError"
          ? AudioNotice.MICROPHONE_DENIED
          : AudioNotice.MICROPHONE_UNAVAILABLE;
      this.isListeningProperty.value = false;
      return;
    }
    if (!this.isScreenActive) {
      // The user left this screen while the permission prompt was up. Release
      // the device instead of capturing behind a hidden screen, and arm the
      // resume so the microphone comes back when they return.
      this.micInput.stop();
      this.isListeningProperty.value = false;
      this.resumeMicAfterScreenActive = true;
      return;
    }
    this.audioNoticeProperty.value = null;
    // The AudioContext's sample rate is known only after start.
    this.applyConfig();
    this.applyMonitoring();
    this.isListeningProperty.value = true;
  }

  /**
   * Stops all speaker output while this screen is not selected. Called from
   * {@link linkAnalysisModelToScreenActive}; playback can be restored on return.
   */
  public suspendAudioForInactiveScreen(): void {
    if (!this.isScreenActive) {
      return;
    }
    this.isScreenActive = false;

    const sourceId = this.audioSourceProperty.value;
    if (sourceId === AudioSource.MICROPHONE) {
      this.resumeMicAfterScreenActive = this.isListeningProperty.value;
    }
    // Stop unconditionally rather than only when the source reports isActive: a
    // start() issued before the first user gesture is still pending while the
    // shared AudioContext is suspended, so the source is not active yet even
    // though its graph is about to come alive. stop() cancels that in-flight
    // start; an isActive check would let it through and the hidden screen would
    // become audible on the user's first click.
    this.deactivate(sourceId);
  }

  /** Restores playback that {@link suspendAudioForInactiveScreen} paused when the screen is shown again. */
  public resumeAudioForActiveScreen(): void {
    if (this.isScreenActive) {
      return;
    }
    this.isScreenActive = true;

    if (this.audioSourceProperty.value === AudioSource.MICROPHONE) {
      if (this.resumeMicAfterScreenActive) {
        this.resumeMicAfterScreenActive = false;
        this.startListening().catch(() => undefined);
      }
      return;
    }

    if (this.wantsPlayback) {
      this.startPlayback(this.audioSourceProperty.value);
    }
  }

  /** Stops microphone capture and releases the device (discarding any active recording). */
  public stopListening(): void {
    if (this.isRecordingProperty.value) {
      this.micInput?.cancelRecording();
      this.isRecordingProperty.value = false;
    }
    this.micInput?.stop();
    this.isListeningProperty.value = false;
  }

  /**
   * Starts capturing the live microphone into a new recording. Ensures the
   * microphone is selected and running first (prompting for permission if needed).
   */
  public async startRecording(): Promise<void> {
    if (!this.micInput || this.isRecordingProperty.value) {
      return;
    }
    await this.startListening();
    // startListening() reports failures (e.g. permission denied) via
    // audioNoticeProperty instead of throwing; without a live microphone the
    // recording tap would be a silent no-op, so don't claim to be recording.
    if (!this.isListeningProperty.value) {
      return;
    }
    this.micInput.startRecording();
    this.isRecordingProperty.value = true;
  }

  /**
   * Stops recording, adds the captured clip to {@link recordings} as a new selectable
   * source, and switches to it (which auto-starts looped playback). A clip that
   * captured no audio is discarded.
   */
  public stopRecording(): void {
    if (!this.isRecordingProperty.value) {
      return;
    }
    const clip = this.micInput?.stopRecording() ?? null;
    this.isRecordingProperty.value = false;
    if (!clip) {
      return;
    }
    this.recordingCounter += 1;
    const index = this.recordingCounter;
    const id = `${RECORDING_ID_PREFIX}${index}`;
    const source = new RecordedAudioSource(clip.samples, clip.sampleRate, this.fftSizeProperty.value);
    this.sources.set(id, source);
    // Add to the list first so the selector rebuilds with this item before we
    // select it, then switch (which releases the mic and starts playback).
    this.recordings.push({ id, index, samples: clip.samples, sampleRate: clip.sampleRate, source });
    this.audioSourceProperty.value = id;
  }

  /** Looks up a recording by its source id. */
  public getRecording(id: string): RecordingEntry | undefined {
    return this.recordings.find((entry) => entry.id === id);
  }

  /** Whether a source id refers to a user recording. */
  public isRecordingId(id: string): boolean {
    return id.startsWith(RECORDING_ID_PREFIX);
  }

  /** Registers an extra selectable source (e.g. the Analyzer compose lab). */
  protected registerAdditionalSource(id: string, source: AudioFrameSource): void {
    this.sources.set(id, source);
    // A source added after construction starts out monitoring-enabled, so push
    // the current state onto it right away.
    this.applyMonitoring();
  }

  /** Extra source ids after microphone; override in screen-specific models. */
  protected getAdditionalSourceIds(): string[] {
    return [];
  }

  /** Playback time (s) for a synthetic source, or 0 when the source is not synthetic. */
  protected getSourcePlaybackTimeS(sourceId: string): number {
    const source = this.sources.get(sourceId);
    return source instanceof SyntheticWebAudioSource ? source.playbackTimeS : 0;
  }

  /** Source ids for a ComboBox: microphone (if present), extras, presets, then recordings. */
  public getSourceValues(): string[] {
    return [
      ...(this.micInput ? [AudioSource.MICROPHONE] : []),
      ...this.getAdditionalSourceIds(),
      ...this.presetCatalog.map((entry) => entry.id),
      ...this.recordings.map((e) => e.id),
    ];
  }

  /**
   * Resets all model state to initial values.
   * Called when the user presses the Reset All button.
   */
  public reset(): void {
    this.stopListening();
    this.audioSourceProperty.reset();
    this.sampleRateProperty.reset();
    this.maxFrequencyProperty.reset();
    this.isAudioEnabledProperty.reset();
    this.isFrozenProperty.reset();
    this.audioNoticeProperty.reset();
    this.f0Property.reset();
    this.stableF0Property.reset();
    this.pitchStabilizer.reset();
    this.f0ConfidenceProperty.reset();
    this.rmsLevelProperty.reset();
    this.hnrProperty.reset();
    this.cppProperty.reset();
    this.formantsProperty.reset();
    this.latestResult = null;

    for (const recording of this.recordings) {
      this.deactivate(recording.id);
      this.sources.delete(recording.id);
    }
    this.recordings.clear();
    this.recordingCounter = 0;
  }

  /**
   * Steps the model forward by dt seconds.
   * Called every animation frame by the Sim framework.
   *
   * @param dt - elapsed time in seconds since the last frame
   */
  public step(dt: number): void {
    const source = this.source;
    if (!source || this.isFrozenProperty.value || !source.isActive) {
      return;
    }
    if (!source.getFrame(this.frameBuffer)) {
      return;
    }

    const result = this.analyzer.analyze(this.frameBuffer);
    this.latestResult = result;

    this.f0Property.value = result.pitch.frequencyHz;
    this.f0ConfidenceProperty.value = result.pitch.confidence;
    this.rmsLevelProperty.value = result.rms;
    this.hnrProperty.value = result.hnrDb;
    this.cppProperty.value = result.cppDb;
    this.formantsProperty.value = result.formants;
    this.updateStablePitch(dt, result.pitch);

    this.frameProcessedEmitter.emit();
  }

  /**
   * Feeds one frame's pitch estimate into the stabilizer behind
   * {@link stableF0Property}. Frames the analyzer is not confident about are
   * passed as unpitched rather than as a number: a guess from a noisy frame is
   * exactly the kind of value that should not reach a readout.
   */
  private updateStablePitch(dt: number, pitch: AnalysisResult["pitch"]): void {
    const voicedHz = pitch.confidence >= VOICED_CONFIDENCE_THRESHOLD ? pitch.frequencyHz : 0;
    this.stableF0Property.value = this.pitchStabilizer.update(dt, voicedHz);
  }

  /**
   * Band of fundamentals the pitch detector searches, in Hz.
   *
   * A source pitched above this band does not read as "no pitch": the shortest
   * period the detector is allowed to consider is then the 2nd or 3rd multiple
   * of the real one, so it reports an exact sub-harmonic — half or a third of
   * the true pitch — and every harmonic marker hung on it is renumbered to
   * match. The default is the human voice; screens listening to other sources
   * override this.
   *
   * Read during construction, so overrides must not touch subclass fields.
   */
  protected get f0SearchRangeHz(): { readonly minHz: number; readonly maxHz: number } {
    return { minHz: F0_MIN_HZ, maxHz: F0_MAX_HZ };
  }

  /** Builds the analyzer config from the current settings + source sample rate. */
  private buildConfig(): AnalyzerConfig {
    const f0Range = this.f0SearchRangeHz;
    return {
      sampleRate: this.source?.sampleRate ?? DEFAULT_SAMPLE_RATE_HZ,
      fftSize: this.fftSizeProperty.value,
      windowType: this.windowTypeProperty.value,
      lpcOrder: this.lpcOrderProperty.value,
      f0MinHz: f0Range.minHz,
      f0MaxHz: f0Range.maxHz,
      formantMaxHz: this.maxFrequencyProperty.value,
    };
  }

  /** Pushes the current settings into the analyzer, the sources, and the frame buffer. */
  private applyConfig(): void {
    const fftSize = this.fftSizeProperty.value;
    // Sources backed by a Web Audio AnalyserNode need their FFT size kept in sync.
    this.micInput?.setFftSize(fftSize);
    for (const source of this.sources.values()) {
      if (isPlayableSource(source)) {
        source.setFftSize(fftSize);
      }
    }
    if (this.frameBuffer.length !== fftSize) {
      this.frameBuffer = new Float32Array(fftSize);
    }
    this.sampleRateProperty.value = this.source?.sampleRate ?? DEFAULT_SAMPLE_RATE_HZ;
    this.analyzer.reconfigure(this.buildConfig());
  }

  /** Derived property for the nth formant frequency (0 when absent). */
  private createFormantFrequencyProperty(index: number): TReadOnlyProperty<number> {
    return new DerivedProperty([this.formantsProperty], (formants) => formants[index]?.frequencyHz ?? 0);
  }
}

/**
 * Pauses a screen's audio when it is hidden and restores it when the user returns.
 * Wire once per analysis screen after constructing the {@link Sim}.
 */
export function linkAnalysisModelToScreenActive(
  screenActiveProperty: TReadOnlyProperty<boolean>,
  model: BaseAnalysisModel,
): void {
  screenActiveProperty.link((active) => {
    if (active) {
      model.resumeAudioForActiveScreen();
    } else {
      model.suspendAudioForInactiveScreen();
    }
  });
}
