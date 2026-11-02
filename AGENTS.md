# AGENTS.md — Wave Composer

Sim-specific context for AI assistants. General SceneryStack guidance: [OpenLyceum/.github/AGENTS.md](https://github.com/OpenLyceum/.github/blob/main/AGENTS.md).

Upstream audio/spectrogram references live under `../Baseline/WaveComposer/` (OpenLyceum/Baseline); they are not part of the shipped sim.

## Project

VoceVista-style real-time **voice-analysis** simulation with three screens. Each screen has an isolated model extending `BaseAnalysisModel` (own audio source + DSP pipeline):

- **Composer** (`src/composer-screen/`) — superpose sinusoids, beats, harmonics, standing-wave modes
- **Analyzer** (`src/analyzer-screen/`) — music/instrument listening: spectrogram (adjustable scroll
  speed), spectrum with harmonic / allowed-harmonic overlays, waveform; linear or logarithmic
  frequency axes. Voice-specific displays belong on Voice & Vowels, not here.
- **Voice & Vowels** (`src/voice-screen/`) — F1×F2 vowel plot, cepstrum, voice-quality readout

Audio defaults to **microphone** but starts lazily on the Start button (no permission prompt on load). Permission-free **presets** use `AudioFileFrameSource` / `PresetFrameSource`. Attributions in `CREDITS.md`.

Physics for educators: `doc/model.md`. Architecture: `doc/implementation-notes.md`.

## Key files

| Area | Location |
|---|---|
| Shared model | `src/common/model/BaseAnalysisModel.ts`, `VoiceAnalyzer.ts`, `HarmonicChartModel.ts` |
| Audio sources | `src/common/model/audio/` (`MicrophoneInput`, presets, file playback, synthetic sources) |
| DSP | `src/common/model/dsp/` (FFT, LPC, YIN, formants, cepstrum, windows) |
| Shared view | `src/common/view/BaseAnalysisScreenView.ts`, `ChartFrame`, `WaveComposerScreenSummaryContent.ts` |
| Screens | `src/composer-screen/`, `src/analyzer-screen/`, `src/voice-screen/` |
| Assets | `src/assets/audio/` (bundled preset `.ogg` recordings) |
| Constants | `src/WaveComposerConstants.ts`, `src/preferences/AnalysisConstants.ts` |
| Colors / strings | `WaveComposerColors.ts`, `src/i18n/StringManager.ts` |

## Model

`BaseAnalysisModel` runs a per-frame DSP pipeline: audio frames → window → FFT → spectrum/spectrogram/LPC/formant/cepstrum analysis via `VoiceAnalyzer`. There is no Newtonian mechanics — the model **is** the analysis chain.

| Concept | Meaning |
|---|---|
| Sample rate `f_s` | from Web Audio context (~44.1 or 48 kHz) |
| Frame size `N` | preference 1024 / 2048 / 4096; Δf = f_s / N |
| Pitch `f₀` | YIN estimate (~60–800 Hz band) |
| Formants F1, F2, … | LPC envelope peaks |
| Composer partials | user-summed sinusoids → synthesized frame source |

Each screen model adds screen-specific Properties (harmonic stacks, spectrogram range, vowel plot selection, etc.) on top of the shared pipeline.

## Accessibility

Follows the shared [OpenLyceum accessibility convention](https://github.com/OpenLyceum/Baton/blob/main/ACCESSIBILITY.md).
Each screen registers the shared `WaveComposerScreenSummaryContent` (constructed with the screen's
own `a11y` subgroup — `composer` / `analyzer` / `voice`) via the `screenSummaryContent`
super-option. A11y strings live under the top-level `a11y` key in each locale JSON, via
`StringManager.getA11yStrings()`. Current-details is static per screen; it can be made live by
deriving from each screen's model.

## Compliance carve-outs

- **Nested constants:** DSP/layout constants beside analysis models under `src/common/model/` and `src/preferences/AnalysisConstants.ts` (multi-screen tool layout).
- **PWA Workbox globPatterns:** also precaches `wav`/`mp3`/`ogg` so bundled preset audio clips work offline.

## Testing

| Path | Purpose |
|---|---|
| `vitest.config.ts` | Fleet template: `happy-dom`, `setupFiles: ["./tests/setup.ts"]`, `execArgv: ["--expose-gc"]` |
| `tests/**/*.test.ts` | Model/DSP unit tests — mirror `src/common/model/` under `tests/common/model/` |
| `tests/memory-leak.test.ts` | WeakRef + `forceGC` dispose regression (fleet pattern) |

Actual specs:

- `tests/analyzer-screen/model/AnalyzerModel.test.ts`
- `tests/common/model/BaseAnalysisModel.test.ts`
- `tests/common/model/VoiceAnalyzer.test.ts`
- `tests/common/model/audio/ComposableFrameSource.test.ts`
- `tests/common/model/audio/PresetFrameSource.test.ts`
- `tests/common/model/dsp/Decimator.test.ts`
- `tests/common/model/dsp/Fft.test.ts`
- `tests/common/model/dsp/FormantAnalyzer.test.ts`
- `tests/common/model/dsp/LinearPredictor.test.ts`
- `tests/common/model/dsp/NoteUtils.test.ts`
- `tests/common/model/dsp/PitchStabilizer.test.ts`
- `tests/common/model/dsp/PolynomialRootFinder.test.ts`
- `tests/common/model/dsp/VoiceQuality.test.ts`
- `tests/common/model/dsp/WindowFunction.test.ts`
- `tests/common/model/dsp/YinPitchDetector.test.ts`
- `tests/memory-leak.test.ts`

Run `npm test`. CI runs the suite when a `test` script is present.

## Development notes

- When adding a feature, extend the appropriate screen model/view or `BaseAnalysisModel` if shared across screens.
