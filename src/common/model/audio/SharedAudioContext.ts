/**
 * SharedAudioContext.ts
 *
 * Speaker output for file playback and synthetic sources shares tambo's audio
 * context and a single {@link SoundGenerator} registered with {@link soundManager}.
 * Selecting through many presets never opens another context, and the master
 * mute (navigation-bar sound, Preferences → Audio) silences this output.
 * Analysis taps the graph before that gain, so the displays keep working muted.
 */
import { phetAudioContext, SoundGenerator, soundManager } from "scenerystack/tambo";

const DEFAULT_SAMPLE_RATE = 44100;

/**
 * Routes monitoring audio through tambo's master gain. Constructed on first
 * playback so importing this module does not touch the audio graph.
 */
class SharedMonitoringOutput extends SoundGenerator {
  public constructor() {
    super();
    soundManager.addSoundGenerator(this);
  }

  public get context(): AudioContext {
    return this.audioContext;
  }

  /** Connect a source into the generator, ahead of the master gain. */
  public connectSource(source: AudioNode): void {
    source.connect(this.soundSourceDestination);
  }
}

let output: SharedMonitoringOutput | null = null;
let gestureResumeInstalled = false;

function getOutput(): SharedMonitoringOutput {
  if (!output) {
    output = new SharedMonitoringOutput();
  }
  return output;
}

/** Sample rate of tambo's context, without building the monitoring generator. */
export function getSharedSampleRate(): number {
  return phetAudioContext.sampleRate || DEFAULT_SAMPLE_RATE;
}

/** tambo's shared context. Creates the monitoring generator on first use. */
export function getSharedAudioContext(): AudioContext {
  return getOutput().context;
}

/**
 * Sends `source` to the speakers through the registered SoundGenerator.
 * Call again only after `source.disconnect()` — Web Audio connections add up.
 */
export function connectSharedMonitoringOutput(source: AudioNode): void {
  getOutput().connectSource(source);
}

/**
 * Some browsers (notably Safari) only honour `resume()` when it is called from
 * inside a user-gesture handler, and a `resume()` issued earlier stays pending
 * forever. Install one-shot listeners that re-issue `resume()` on the first
 * gesture so a context started outside a gesture (e.g. the Composer screen's
 * synth graph built at sim startup) still comes alive once the user interacts.
 */
function installGestureResume(context: AudioContext): void {
  if (gestureResumeInstalled) {
    return;
  }
  gestureResumeInstalled = true;
  const events = ["pointerdown", "touchend", "keydown"] as const;
  const onGesture = () => {
    context
      .resume()
      .then(() => {
        for (const event of events) {
          window.removeEventListener(event, onGesture);
        }
        gestureResumeInstalled = false;
      })
      .catch(() => undefined);
  };
  for (const event of events) {
    window.addEventListener(event, onGesture, { passive: true });
  }
}

/** Resumes tambo's context after a user gesture (required by autoplay policy). */
export async function resumeSharedAudioContext(): Promise<AudioContext> {
  const context = getSharedAudioContext();
  if (context.state === "suspended") {
    installGestureResume(context);
    await context.resume();
  }
  return context;
}
