# Multi-Screen Simulations

Wave Composer is a **three-screen** sound-analysis sim. Each screen owns its
own analysis model (`ComposerModel`, `AnalyzerModel`, `VoiceModel`) built in
`main.ts` and sharing one `WaveComposerPreferencesModel`. Icons are wired in
each `*Screen.ts`.

For pedagogy and architecture, see [model.md](./model.md) and
[implementation-notes.md](./implementation-notes.md).

---

## Screens in this sim

| Order | UI name | Folder | Screen class | Icon factory |
|---|---|---|---|---|
| 1 | Compose | `src/composer-screen/` | `ComposerScreen` | `createComposerIcon()` |
| 2 | Analyzer | `src/analyzer-screen/` | `AnalyzerScreen` | `createAnalyzerIcon()` |
| 3 | Voice & Vowels | `src/voice-screen/` | `VoiceScreen` | `createVoiceIcon()` |

```
main.ts
  creates WaveComposerPreferencesModel + three models
  ├─ ComposerScreen(composerModel, { name, tandem, viewProperties, … })
  ├─ AnalyzerScreen(analyzerModel, { name, tandem, viewProperties, … })
  └─ VoiceScreen(voiceModel, { name, tandem, … })
```

Models are constructed **before** screens and passed into the Screen
constructor (factory returns the same instance). `linkAnalysisModelToScreenActive`
pauses inactive screens’ DSP pipelines.

Because the models exist before any screen is shown, a model starts out
“screen inactive” and refuses to start playback until joist reports its screen
active — otherwise the Composer’s synth, which selects its source in the
constructor, would be heard on whichever screen the user opens first.

---

## Folder layout

```
src/
├─ common/
│   ├─ WaveComposerScreenIcons.ts
│   ├─ model/          # BaseAnalysisModel, VoiceAnalyzer, DSP, audio sources
│   └─ view/
├─ composer-screen/
│   ├─ ComposerScreen.ts
│   ├─ model/ComposerModel.ts
│   └─ view/
├─ analyzer-screen/
│   ├─ AnalyzerScreen.ts
│   ├─ model/AnalyzerModel.ts
│   └─ view/
└─ voice-screen/
    ├─ VoiceScreen.ts
    ├─ model/VoiceModel.ts
    └─ view/
```

Icons live only in `src/common/WaveComposerScreenIcons.ts`.

---

## Wiring in `main.ts` and `*Screen.ts`

```typescript
// src/main.ts
const analysisPreferences = new WaveComposerPreferencesModel();
const analyzerModel = new AnalyzerModel(analysisPreferences);
const composerModel = new ComposerModel(analysisPreferences);
const voiceModel = new VoiceModel(analysisPreferences);

const screens = [
  new ComposerScreen(composerModel, {
    name: screenNames.composerStringProperty,
    tandem: Tandem.ROOT.createTandem("composerScreen"),
    viewProperties: composerViewProperties,
    backgroundColorProperty: WaveComposerColors.backgroundColorProperty,
  }),
  new AnalyzerScreen(analyzerModel, { /* … */ }),
  new VoiceScreen(voiceModel, { /* … */ }),
];
```

```typescript
// e.g. src/composer-screen/ComposerScreen.ts
import { createComposerIcon } from "../common/WaveComposerScreenIcons.js";

optionize<ComposerScreenOptions, EmptySelfOptions, ScreenOptions>()(
  {
    backgroundColorProperty: WaveComposerColors.backgroundColorProperty,
    createKeyboardHelpNode: () => new WaveComposerKeyboardHelpContent(),
    homeScreenIcon: createComposerIcon(),
    navigationBarIcon: createComposerIcon(),
  },
  options,
);
```

Composer and Analyzer also take screen-local `*ViewProperties` for chart
overlays; Voice does not.

---

## Home screen icons

### Fleet convention

```
src/common/WaveComposerScreenIcons.ts
```

| Screen | Factory |
|---|---|
| Compose | `createComposerIcon()` |
| Analyzer | `createAnalyzerIcon()` |
| Voice & Vowels | `createVoiceIcon()` |

Drawn on the PhET **548 × 373** canvas with `WaveComposerColors`.

---

## Screen options reference

| Option | Type | Purpose |
|---|---|---|
| `name` | `ReadOnlyProperty<string>` | Localizable tab label |
| `tandem` | `Tandem` | PhET-iO registration root |
| `backgroundColorProperty` | `TReadOnlyProperty<Color>` | Screen background |
| `createKeyboardHelpNode` | `() => Node` | Keyboard help |
| `homeScreenIcon` | `ScreenIcon` | Home-screen icon |
| `navigationBarIcon` | `ScreenIcon` | Nav-bar icon |
| `viewProperties` | `ComposerViewProperties` / `AnalyzerViewProperties` | Chart UI state (Composer / Analyzer) |

---

## Strings and accessibility

Titles via `getScreenNames()`: `composer` (“Compose”), `analyzer`, `voice`
(“Voice & Vowels”).

Shared keyboard help: `WaveComposerKeyboardHelpContent`. Prefer per-screen
summary content when describing distinct instruments.

---

## Adding another screen

1. Add a `screens` key in every locale; expose it from `getScreenNames()`.
2. Add `src/<name>-screen/` with Screen, model (usually extending
   `BaseAnalysisModel`), and view.
3. Add `create…Icon()` to `WaveComposerScreenIcons.ts` and wire both icons in
   the Screen’s `optionize` defaults.
4. Construct the model in `main.ts`, pass it into the Screen, and append to
   the `screens` array.
