/**
 * main.ts
 *
 * Entry point for the simulation. Initializes SceneryStack, creates the
 * screens, and starts the main event loop.
 *
 * !! CRITICAL IMPORT ORDER !!
 * brand.js MUST be the first import. Each module imports the next, so the import nesting is
 *
 *   main → brand → splash → assert → init
 *
 * and therefore the actual EXECUTION order (deepest import runs first) is the reverse:
 *
 *   init → assert → splash → brand → main
 *
 * SceneryStack requires this exact load order. Never reorder these imports.
 */

// brand.js MUST be first; importing it runs the whole chain (init→assert→splash→brand) before main.
import "./brand.js";

import { onReadyToLaunch, PreferencesModel, Sim } from "scenerystack/sim";
import { Tandem } from "scenerystack/tandem";
import { AnalyzerScreen } from "./analyzer-screen/AnalyzerScreen.js";
import { AnalyzerModel } from "./analyzer-screen/model/AnalyzerModel.js";
import { AnalyzerViewProperties } from "./analyzer-screen/view/AnalyzerViewProperties.js";
import { ComposerScreen } from "./composer-screen/ComposerScreen.js";
import { ComposerModel } from "./composer-screen/model/ComposerModel.js";
import { ComposerViewProperties } from "./composer-screen/view/ComposerViewProperties.js";
import { StringManager } from "./i18n/StringManager.js";
import { WaveComposerPreferencesModel } from "./preferences/WaveComposerPreferencesModel.js";
import { WaveComposerPreferencesNode } from "./preferences/WaveComposerPreferencesNode.js";
import { VoiceModel } from "./voice-screen/model/VoiceModel.js";
import { VoiceScreen } from "./voice-screen/VoiceScreen.js";
import WaveComposerColors from "./WaveComposerColors.js";

onReadyToLaunch(() => {
  const stringManager = StringManager.getInstance();
  const screenNames = stringManager.getScreenNames();

  const analysisPreferences = new WaveComposerPreferencesModel();
  const analyzerModel = new AnalyzerModel(analysisPreferences);
  const composerModel = new ComposerModel(analysisPreferences);
  const voiceModel = new VoiceModel(analysisPreferences);

  const analyzerViewProperties = new AnalyzerViewProperties();
  const composerViewProperties = new ComposerViewProperties();

  const screens = [
    new ComposerScreen(composerModel, {
      name: screenNames.composerStringProperty,
      tandem: Tandem.ROOT.createTandem("composerScreen"),
      viewProperties: composerViewProperties,
      backgroundColorProperty: WaveComposerColors.backgroundColorProperty,
    }),
    new AnalyzerScreen(analyzerModel, {
      // The screen name Property updates automatically when the locale changes
      name: screenNames.analyzerStringProperty,
      tandem: Tandem.ROOT.createTandem("analyzerScreen"),
      viewProperties: analyzerViewProperties,
      backgroundColorProperty: WaveComposerColors.backgroundColorProperty,
    }),
    new VoiceScreen(voiceModel, {
      name: screenNames.voiceStringProperty,
      tandem: Tandem.ROOT.createTandem("voiceScreen"),
      backgroundColorProperty: WaveComposerColors.backgroundColorProperty,
    }),
  ];

  const sim = new Sim(stringManager.getTitleStringProperty(), screens, {
    preferencesModel: new PreferencesModel({
      visualOptions: {
        // Adds a "Projector Mode" toggle in Preferences → Visual
        supportsProjectorMode: true,
        // Enables keyboard-navigation highlight outlines
        supportsInteractiveHighlights: true,
        customPreferences: [
          {
            createContent: () =>
              new WaveComposerPreferencesNode(analysisPreferences, analyzerViewProperties.colormapProperty),
          },
        ],
      },
      audioOptions: {
        // Initializes tambo and the Audio preferences. Pair with supportsSound in src/init.ts.
        supportsSound: true,
        // Adds an "Extra Sounds" toggle (a second, optional sonification layer).
        // Requires supportsSound above.
        supportsExtraSound: true,
        // Adds Voicing (text-to-speech) controls and the Voicing toolbar.
        // Requires supportsVoicing: true in src/init.ts. Only active in English
        // on platforms with SpeechSynthesis; degrades gracefully elsewhere.
        // NOTE: supportsCoreVoicing is intentionally omitted — it is mutually
        // exclusive with supportsVoicing (asserts if both are on) and is a
        // phet-internal mode, not meant for sims.
        supportsVoicing: true,
      },
      inputOptions: {
        // Adds the Preferences → Input tab with a touchscreen gesture-control toggle.
        supportsGestureControl: true,
      },
      localizationOptions: {
        // Adds a language picker in Preferences → Language
        supportsDynamicLocale: true,
      },
    }),

    // Optional: fill in credits shown in Help → About
    credits: {
      leadDesign: "",
      softwareDevelopment: "",
      team: "",
      qualityAssurance: "",
    },
  });

  sim.start();
});
