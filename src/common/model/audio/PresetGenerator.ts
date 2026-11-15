/** Fills one synthetic audio frame starting at absolute time timeS (seconds). */
export type PresetGenerator = (out: Float32Array, sampleRate: number, timeS: number) => void;
