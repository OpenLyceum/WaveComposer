# Model - Wave Composer

This document describes the model (the underlying signal processing, math, and behavior) for the
simulation, in terms appropriate for an educator. It is the companion to
[implementation-notes.md](./implementation-notes.md), which targets developers.

## Overview

Wave Composer is a real-time **sound-analysis** simulation in the spirit of voice-spectrography tools
(e.g. VoceVista). Its "physics" is a **digital signal processing (DSP) pipeline**: audio arrives in
short overlapping frames, and each frame is transformed into frequency-domain and acoustic
representations musicians and speech scientists use. There is no Newtonian mechanics — the model is
the analysis chain itself.

Three screens share the same per-frame pipeline (`BaseAnalysisModel` + `VoiceAnalyzer`) but expose
different pedagogical views:

- **Composer** — the signal is *synthesized* from user-chosen sinusoids, beats, harmonic stacks, and
  standing-wave modes so students hear and see how partials build a complex tone.
- **Analyzer** — live **spectrogram** (frequency vs. time), instantaneous **spectrum** with optional
  harmonic / allowed-harmonic overlays, and time-domain **waveform**. Aimed at listening to music and
  instruments: the frequency axes read either linearly in Hz or logarithmically (one octave per equal
  step), and the spectrogram's scroll speed is adjustable. Voice measurements live on the Voice &
  Vowels screen.
- **Voice & Vowels** — **F1×F2 vowel plot**, **cepstrum**, source–filter diagram, and voice-quality
  readouts from the same analysis.

Audio defaults to the **microphone** but capture starts only when the student presses Start;
permission-free **preset recordings** (and synthesized fallbacks) allow classroom use without a mic.

The key ideas a student should take away:

- A periodic sound repeats in time; its **spectrum** shows which frequencies are present.
- **Windowing** before the FFT reduces spectral leakage from analyzing finite chunks.
- **LPC** fits a smooth envelope whose peaks approximate **formants** — vocal-tract resonances.
- The **cepstrum** separates **source** (pitch periodicity) from **filter** (formant structure).
- Adding sinusoids in the Composer screen demonstrates **superposition** in the time and frequency domains.

## Quantities and units

| Quantity | Symbol | Units | Notes |
|---|---|---|---|
| Sample rate | f_s | Hz | From Web Audio context (typically 44.1 or 48 kHz) |
| Frame (FFT) size | N | samples | Preference: 1024 / 2048 / 4096; Δf = f_s / N |
| Frequency bin | k | — | Maps to f = k · f_s / N |
| Time | t | s | Spectrogram horizontal axis; frame advance |
| Magnitude / level | — | dB | Power spectrum and spectrogram display |
| Fundamental (pitch) | f₀ | Hz | YIN estimate; search band ~60–800 Hz |
| Formants | F1, F2, … | Hz | Peaks of LPC envelope (≤ 5 reported) |
| LPC order | p | — | Preference, typically 8–16 |
| Quefrency | τ | s | Cepstrum horizontal axis; peak ⇒ f₀ ≈ 1/τ |
| HNR / CPP | — | dB | Harmonic-to-noise ratio; cepstral peak prominence |

## Governing computations

**Frame acquisition.** Active `AudioFrameSource` implementations (`MicrophoneInput`, preset file
playback, synthetic Web Audio, user recordings) supply N-sample frames at f_s.

**Window + FFT.** Each frame is multiplied by a window (Hann, Hamming, Blackman, … — user preference),
then transformed with an in-place **FFT** to a **power spectrum in dB**:

```
X[k] = FFT{ w[n] · x[n] }
P[k] = 20 log₁₀ |X[k]|
```

The spectrogram stacks successive P[k] over time with a user-selected colormap. Each analyzed frame
advances the display by the chosen **scroll speed** in columns, and rows map to frequency either
linearly or by octave, depending on the selected frequency scale.

**Pitch (YIN).** The **YIN** autocorrelation-difference algorithm estimates f₀ and a confidence score;
a frame is **voiced** when confidence exceeds ~0.5 and f₀ > 0.

**Stabilized pitch.** Everything a learner *reads* — the numeric pitch and note, the harmonic markers,
the mode numbers, the allowed-harmonic bands — uses a median-filtered f₀ over roughly the last
four-tenths of a second, republished eight times a second and held unless the new value is more than
about a quarter tone away and stays there. A real note change reaches the display in about a third of
a second, fast enough to follow a melody played at speed. A single frame that latches onto a harmonic instead of
the fundamental would otherwise renumber every mode label on the chart, since mode numbers are just
the ordinals of the multiples of f₀. Displays that follow the signal frame by frame (spectrum,
spectrogram, cepstrum) still use the raw per-frame estimate.

**LPC formants.** For formant analysis the chain applies **pre-emphasis**, a confined-Gaussian window,
**decimation** toward ~11 kHz, **autocorrelation**, and **Levinson–Durbin** to obtain LPC coefficients.
The all-pole filter envelope peaks are **formants** (F1, F2, …) plotted on the vowel chart.

**Cepstrum.** Real cepstrum from log-magnitude spectrum:

```
c[τ] = IFFT{ log |X[k]| }
```

Peaks at low quefrency indicate periodicity (pitch); the **CPP** metric summarizes cepstral peak
prominence. **HNR** uses autocorrelation harmonic vs. noise energy.

**Composer synthesis.** `CompositionState` sums up to four sinusoids (frequency, amplitude, phase);
optional beat pairs, harmonic stacks, and standing-wave boundary modes feed the same analyzer as live
input.

Analysis advances in `BaseAnalysisModel.step(dt)` when the screen is active and audio is running;
inactive screens pause their pipeline to save CPU.

## Simplifications and assumptions

- **Short-time stationarity:** each frame is analyzed as if the signal were steady over N samples.
- **LPC formants** are a standard peak-picking approximation, not an articulatory vocal-tract model.
- **Composer sources** are ideal sinusoids — no instrument body, breath noise, or inharmonicity model.
- Microphone permission and device quality affect real recordings; presets avoid that variability.
- Pitch and formant trackers can fail on noisy, unvoiced, or polyphonic audio — confidence gates
  hide unreliable readouts.
- **Low-pitch floor vs. frame size:** YIN searches lags up to N/2 samples, so the effective F0 floor is
  ≈ 2·f_s/N — at the smallest frame size (N = 1024, f_s = 48 kHz) that is ≈ 94 Hz, above the nominal
  60 Hz band edge. Use a larger FFT size to reach the lowest voices.

## References

- A. de Cheveigné & H. Kawahara, "YIN, a fundamental frequency estimator for speech and music,"
  *J. Acoust. Soc. Am.* 111(4), 2002.
- L. Rabiner & B. Gold, *Theory and Application of Digital Signal Processing* — FFT, windowing, LPC.
- J. Markel & A. Gray, *Linear Prediction of Speech* — formant extraction via LPC.
- VoceVista / spectrographic voice analysis pedagogy (UI inspiration).
