/**
 * presetCatalog.ts
 *
 * Demo sources for the source ComboBox. The Analyzer screen lists
 * {@link INSTRUMENT_PRESET_CATALOG}; Voice & Vowels lists {@link VOICE_PRESET_CATALOG}.
 * The merged catalog drives {@link PresetId} typing.
 */
export type PresetCatalogEntry = {
  readonly id: string;
  /** Bundled filename under src/assets/audio/, or null for synthesized sources. */
  readonly asset: string | null;
  /** Key in strings_*.json (under `presets` or `voicePresets`). */
  readonly nameKey: string;
  /** Caption key in the same string group as nameKey. */
  readonly captionKey: string;
  /** Which localized string group supplies labels for this entry. */
  readonly stringGroup: "presets" | "voicePresets";
};

/** Analyzer screen: orchestral / percussion demos (no speech vowels). */
export const INSTRUMENT_PRESET_CATALOG: readonly PresetCatalogEntry[] = [
  { id: "clarinet", asset: "clarinet.ogg", nameKey: "clarinet", captionKey: "clarinetCaption", stringGroup: "presets" },
  { id: "flute", asset: "flute.ogg", nameKey: "flute", captionKey: "fluteCaption", stringGroup: "presets" },
  { id: "piccolo", asset: "piccolo.ogg", nameKey: "piccolo", captionKey: "piccoloCaption", stringGroup: "presets" },
  { id: "oboe", asset: "oboe.ogg", nameKey: "oboe", captionKey: "oboeCaption", stringGroup: "presets" },
  { id: "bassoon", asset: "bassoon.ogg", nameKey: "bassoon", captionKey: "bassoonCaption", stringGroup: "presets" },
  {
    id: "saxophone",
    asset: "saxophone.ogg",
    nameKey: "saxophone",
    captionKey: "saxophoneCaption",
    stringGroup: "presets",
  },
  { id: "trumpet", asset: "trumpet.ogg", nameKey: "trumpet", captionKey: "trumpetCaption", stringGroup: "presets" },
  { id: "horn", asset: "horn.ogg", nameKey: "horn", captionKey: "hornCaption", stringGroup: "presets" },
  { id: "trombone", asset: "trombone.ogg", nameKey: "trombone", captionKey: "tromboneCaption", stringGroup: "presets" },
  { id: "violin", asset: "violin.ogg", nameKey: "violin", captionKey: "violinCaption", stringGroup: "presets" },
  { id: "viola", asset: "viola.ogg", nameKey: "viola", captionKey: "violaCaption", stringGroup: "presets" },
  { id: "cello", asset: "cello.ogg", nameKey: "cello", captionKey: "celloCaption", stringGroup: "presets" },
  { id: "piano", asset: "piano.ogg", nameKey: "piano", captionKey: "pianoCaption", stringGroup: "presets" },
  { id: "guitar", asset: "guitar-scale.ogg", nameKey: "guitar", captionKey: "guitarCaption", stringGroup: "presets" },
  { id: "snare", asset: "snare.ogg", nameKey: "snare", captionKey: "snareCaption", stringGroup: "presets" },
  { id: "timpani", asset: "timpani.ogg", nameKey: "timpani", captionKey: "timpaniCaption", stringGroup: "presets" },
  { id: "cymbals", asset: "cymbals.ogg", nameKey: "cymbals", captionKey: "cymbalsCaption", stringGroup: "presets" },
] as const;

/** Voice & Vowels screen: singing, vowels, and phonetics (no instruments). */
export const VOICE_PRESET_CATALOG: readonly PresetCatalogEntry[] = [
  {
    id: "vowelAh",
    asset: "vowel-ah.ogg",
    nameKey: "vowelAh",
    captionKey: "vowelAhCaption",
    stringGroup: "voicePresets",
  },
  {
    id: "vowelEe",
    asset: "vowel-ee.ogg",
    nameKey: "vowelEe",
    captionKey: "vowelEeCaption",
    stringGroup: "voicePresets",
  },
  {
    id: "vowelIh",
    asset: "vowel-ih.ogg",
    nameKey: "vowelIh",
    captionKey: "vowelIhCaption",
    stringGroup: "voicePresets",
  },
  {
    id: "vowelOo",
    asset: "vowel-oo.ogg",
    nameKey: "vowelOo",
    captionKey: "vowelOoCaption",
    stringGroup: "voicePresets",
  },
  {
    id: "vowelUh",
    asset: "vowel-uh.ogg",
    nameKey: "vowelUh",
    captionKey: "vowelUhCaption",
    stringGroup: "voicePresets",
  },
  {
    id: "vowelOh",
    asset: "vowel-oh.ogg",
    nameKey: "vowelOh",
    captionKey: "vowelOhCaption",
    stringGroup: "voicePresets",
  },
  {
    id: "vowelAy",
    asset: "vowel-ay.ogg",
    nameKey: "vowelAy",
    captionKey: "vowelAyCaption",
    stringGroup: "voicePresets",
  },
  {
    id: "vowelEr",
    asset: "vowel-er.ogg",
    nameKey: "vowelEr",
    captionKey: "vowelErCaption",
    stringGroup: "voicePresets",
  },
  {
    id: "consonantM",
    asset: "consonant-m.ogg",
    nameKey: "consonantM",
    captionKey: "consonantMCaption",
    stringGroup: "voicePresets",
  },
  {
    id: "consonantN",
    asset: "consonant-n.ogg",
    nameKey: "consonantN",
    captionKey: "consonantNCaption",
    stringGroup: "voicePresets",
  },
  {
    id: "consonantS",
    asset: "consonant-s.ogg",
    nameKey: "consonantS",
    captionKey: "consonantSCaption",
    stringGroup: "voicePresets",
  },
  {
    id: "consonantSh",
    asset: "consonant-sh.ogg",
    nameKey: "consonantSh",
    captionKey: "consonantShCaption",
    stringGroup: "voicePresets",
  },
  {
    id: "consonantF",
    asset: "consonant-f.wav",
    nameKey: "consonantF",
    captionKey: "consonantFCaption",
    stringGroup: "voicePresets",
  },
  {
    id: "consonantP",
    asset: "consonant-p.wav",
    nameKey: "consonantP",
    captionKey: "consonantPCaption",
    stringGroup: "voicePresets",
  },
  {
    id: "consonantT",
    asset: "consonant-t.wav",
    nameKey: "consonantT",
    captionKey: "consonantTCaption",
    stringGroup: "voicePresets",
  },
  {
    id: "consonantB",
    asset: "consonant-b.wav",
    nameKey: "consonantB",
    captionKey: "consonantBCaption",
    stringGroup: "voicePresets",
  },
  {
    id: "singing",
    asset: "singing-arpeggio.mp3",
    nameKey: "singing",
    captionKey: "singingCaption",
    stringGroup: "voicePresets",
  },
  {
    id: "singingVibrato",
    asset: "singing-vibrato.wav",
    nameKey: "singingVibrato",
    captionKey: "singingVibratoCaption",
    stringGroup: "voicePresets",
  },
  {
    id: "sopranoScale",
    asset: "soprano-scale.mp3",
    nameKey: "sopranoScale",
    captionKey: "sopranoScaleCaption",
    stringGroup: "voicePresets",
  },
  {
    id: "vowelArpeggio",
    asset: "vowel-chain.ogg",
    nameKey: "vowelArpeggio",
    captionKey: "vowelArpeggioCaption",
    stringGroup: "voicePresets",
  },
] as const;

function mergeCatalogs(
  a: readonly PresetCatalogEntry[],
  b: readonly PresetCatalogEntry[],
): readonly PresetCatalogEntry[] {
  const byId = new Map<string, PresetCatalogEntry>();
  for (const entry of [...a, ...b]) {
    byId.set(entry.id, entry);
  }
  return [...byId.values()];
}

/** Every preset id the model must instantiate (union of both screens). */
const ALL_PRESET_CATALOG: readonly PresetCatalogEntry[] = mergeCatalogs(
  INSTRUMENT_PRESET_CATALOG,
  VOICE_PRESET_CATALOG,
);

export type PresetId = (typeof ALL_PRESET_CATALOG)[number]["id"];
