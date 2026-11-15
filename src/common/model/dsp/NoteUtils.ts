/**
 * NoteUtils.ts
 *
 * Frequency ↔ MIDI ↔ note-name conversions for the pitch readout.
 * Reference pitch: A4 = 440 Hz = MIDI 69 (12-tone equal temperament).
 */

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

const A4_FREQUENCY_HZ = 440;
const A4_MIDI = 69;

/**
 * Fractional MIDI note number for a frequency (Hz).
 * @internal Exported for unit tests; not part of the application API.
 */
export function frequencyToMidi(frequencyHz: number): number {
  return 12 * Math.log2(frequencyHz / A4_FREQUENCY_HZ) + A4_MIDI;
}

/**
 * Frequency (Hz) for a (possibly fractional) MIDI note number.
 * @internal Exported for unit tests; not part of the application API.
 */
export function midiToFrequency(midi: number): number {
  return A4_FREQUENCY_HZ * 2 ** ((midi - A4_MIDI) / 12);
}

/**
 * Note name with octave for a MIDI number, e.g. 69 → "A4", 60 → "C4".
 * @internal Exported for unit tests; not part of the application API.
 */
export function midiToNoteName(midi: number): string {
  const rounded = Math.round(midi);
  const index = ((rounded % 12) + 12) % 12;
  const octave = Math.floor(rounded / 12) - 1;
  return `${NOTE_NAMES[index] ?? ""}${octave}`;
}

/** Signed deviation from the nearest equal-tempered note, in cents (±50). */
export function centsFromFrequency(frequencyHz: number): number {
  const midi = frequencyToMidi(frequencyHz);
  return Math.round((midi - Math.round(midi)) * 100);
}

/** Note name with octave for a frequency, or "" for non-positive input. */
export function noteNameFromFrequency(frequencyHz: number): string {
  if (frequencyHz <= 0) {
    return "";
  }
  return midiToNoteName(frequencyToMidi(frequencyHz));
}
