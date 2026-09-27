/**
 * StringManager.ts
 *
 * Centralizes all localized string access for the simulation.
 *
 * Strings are loaded from JSON files per locale and wrapped in reactive
 * Property objects by SceneryStack. When the user switches language in the
 * Preferences dialog, all StringProperties update automatically.
 *
 * ── How to add a locale ───────────────────────────────────────────────────────
 * 1. Create src/i18n/strings_XX.json with the same keys as strings_en.json
 * 2. Import it below and add `XX: stringsXX` to the locale map
 * 3. Add "XX" to `availableLocales` in src/init.ts
 *
 * ── How to add a string ───────────────────────────────────────────────────────
 * 1. Add the key + English value to strings_en.json
 * 2. Add the same key + translated value to ALL other locale files
 *    (TypeScript will show an error here if any locale is missing a key)
 * 3. Expose the new StringProperty via a new getter method below
 */

import type { ReadOnlyProperty } from "scenerystack/axon";
import { LocalizedString } from "scenerystack/chipper";
import stringsEn from "./strings_en.json";
import stringsEs from "./strings_es.json";
import stringsFr from "./strings_fr.json";

// ── Compile-time key-parity check ─────────────────────────────────────────────
// English is the canonical shape; every other locale must match it exactly.
// TypeScript errors here if any locale file is missing (or adds) a key relative to
// English. Add one `satisfies` line per new locale so the check stays exhaustive.
// biome-ignore lint/complexity/noVoid: intentional compile-time type assertion
void (stringsFr satisfies typeof stringsEn);
// biome-ignore lint/complexity/noVoid: intentional compile-time type assertion
void (stringsEn satisfies typeof stringsFr);
// biome-ignore lint/complexity/noVoid: intentional compile-time type assertion
void (stringsEs satisfies typeof stringsEn);
// biome-ignore lint/complexity/noVoid: intentional compile-time type assertion
void (stringsEn satisfies typeof stringsEs);

// ── Build the reactive string property tree ───────────────────────────────────
const stringProperties = LocalizedString.getNestedStringProperties({
  en: stringsEn,
  fr: stringsFr,
  es: stringsEs,
});

/**
 * StringManager is a singleton that provides typed access to all localized
 * strings. Use `StringManager.getInstance()` everywhere — never construct it
 * directly.
 */
export class StringManager {
  private static instance: StringManager | null = null;

  private constructor() {
    // Private — obtain via getInstance()
  }

  public static getInstance(): StringManager {
    if (StringManager.instance === null) {
      StringManager.instance = new StringManager();
    }
    return StringManager.instance;
  }

  /**
   * The simulation title shown in the navigation bar and browser tab.
   * Updates automatically when the locale changes.
   */
  public getTitleStringProperty(): ReadOnlyProperty<string> {
    return stringProperties.titleStringProperty;
  }

  /**
   * Accessibility (Interactive Description) StringProperties, grouped per screen
   * (`composer`, `analyzer`, `voice`): screen-summary regions and a current-details
   * paragraph. See the shared OpenLyceum ACCESSIBILITY.md convention.
   */
  public getA11yStrings() {
    return stringProperties.a11y;
  }

  /**
   * Screen name StringProperties used when constructing Screen instances.
   * Each property updates automatically when the locale changes.
   */
  public getScreenNames(): {
    readonly analyzerStringProperty: ReadOnlyProperty<string>;
    readonly composerStringProperty: ReadOnlyProperty<string>;
    readonly voiceStringProperty: ReadOnlyProperty<string>;
  } {
    return {
      analyzerStringProperty: stringProperties.screens.analyzerStringProperty,
      composerStringProperty: stringProperties.screens.composerStringProperty,
      voiceStringProperty: stringProperties.screens.voiceStringProperty,
    };
  }

  /** Panel-title strings. */
  public getPanelStrings() {
    return stringProperties.panel;
  }

  /** Control-panel labels (source, freeze, FFT size, overlays, …). */
  public getControlStrings() {
    return stringProperties.control;
  }

  /** Analyzer-screen instrument preset names + captions. */
  public getPresetStrings() {
    return stringProperties.presets;
  }

  /** Voice & Vowels screen preset names + captions (vowels, consonants, singing). */
  public getVoicePresetStrings() {
    return stringProperties.voicePresets;
  }

  /** Window-function names (Hann / Hamming / Blackman). */
  public getWindowStrings() {
    return stringProperties.window;
  }

  /** Colormap names (Viridis / Inferno / Magma / Grayscale). */
  public getColormapStrings() {
    return stringProperties.colormap;
  }

  /** Preferences-dialog descriptions for shared analysis settings. */
  public getPreferencesStrings() {
    return stringProperties.preferences;
  }

  /** Measurement readout labels (pitch, formants, HNR, CPP, …). */
  public getReadoutStrings() {
    return stringProperties.readout;
  }

  /** Chart axis titles. */
  public getAxisStrings() {
    return stringProperties.axis;
  }

  /** Unit suffixes (Hz, dB, ms, cents). */
  public getUnitStrings() {
    return stringProperties.units;
  }

  /** Wave-composition partial controls and demo presets. */
  public getComposeStrings() {
    return stringProperties.compose;
  }

  /** Composer screen readouts and intro copy. */
  public getComposerScreenStrings() {
    return stringProperties.composerScreen;
  }

  /** Wave-physics pedagogy strings (boundary models, resonances). */
  public getPhysicsStrings() {
    return stringProperties.physics;
  }
}
