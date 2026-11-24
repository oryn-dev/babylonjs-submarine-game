import type { AudioEngineV2 } from "@babylonjs/core/AudioV2/abstractAudio/audioEngineV2";
import type { StaticSound } from "@babylonjs/core/AudioV2/abstractAudio/staticSound";
import type { Assets } from "../oryn/assets";

const SHOTS = ["ping", "contact", "creak1", "creak2", "creak3", "groan", "grab", "clunk", "thud", "bubbles", "bubbles2", "call1", "call2", "click", "coin", "sold", "upgrade", "deny", "alarm", "page", "dock"] as const;
export type Shot = (typeof SHOTS)[number];

/** Loops carry 0.12 s of wrapped padding at both ends; the length is what lies between. */
const PAD = 0.12;
const LOOPS = { engine: 6, servo: 1.2, amb_reef: 12, amb_deep: 12, music_reef: 44.8, music_deep: 51.2 } as const;
type Loop = keyof typeof LOOPS;

export class Sound {
  private shots = new Map<Shot, StaticSound>();
  private loops = new Map<Loop, { sound: StaticSound; level: number }>();
  private creak = 0;
  private alarm = 0;

  constructor(private audio: AudioEngineV2, private assets: Assets) {}

  async load() {
    const effects = SHOTS.map(async (name) => {
      this.shots.set(name, await this.audio.createSoundAsync(name, this.assets.url(`sfx/${name}.mp3`), { maxInstances: 4 }));
    });
    const loops = (Object.keys(LOOPS) as Loop[]).map(async (name) => {
      const sound = await this.audio.createSoundAsync(name, this.assets.url(`sfx/${name}.mp3`), { loop: true, loopStart: PAD, loopEnd: PAD + LOOPS[name], volume: 0 });
      this.loops.set(name, { sound, level: 0 });
    });
    await Promise.allSettled([...effects, ...loops]);
    await this.audio.unlockAsync();
    for (const { sound: loop } of this.loops.values()) loop.play({ startOffset: PAD });
  }

  play(name: Shot, volume = 1, pitch = 1) {
    const sound = this.shots.get(name);
    if (!sound || this.audio.state !== "running") return;
    sound.volume = volume;
    sound.playbackRate = pitch;
    sound.play();
  }

  private level(name: Loop, target: number, dt: number, rate = 1.5, pitch?: number) {
    const loop = this.loops.get(name);
    if (!loop || this.audio.state !== "running") return;
    loop.level += (target - loop.level) * Math.min(1, dt * rate);
    loop.sound.volume = loop.level;
    if (pitch !== undefined) loop.sound.playbackRate = pitch;
  }

  update(dt: number, state: { depth: number; thrust: number; speed: number; servo: boolean; pressure: number; low: boolean; quiet: boolean; music: number; powered: boolean }) {
    const deep = Math.min(1, Math.max(0, (state.depth - 40) / 60));
    const q = state.quiet ? 0.35 : 1;
    this.level("engine", state.powered ? (0.1 + Math.abs(state.thrust) * 0.34) * q : 0, dt, 3, 0.8 + Math.abs(state.thrust) * 0.35 + state.speed * 0.012);
    this.level("servo", state.servo ? 0.22 : 0, dt, 12);
    this.level("amb_reef", (1 - deep) * 0.36 * q, dt);
    this.level("amb_deep", (0.1 + deep * 0.5) * q, dt);
    this.level("music_reef", (1 - deep) * 0.42 * state.music, dt, 0.5);
    this.level("music_deep", deep * 0.5 * state.music, dt, 0.5);
    // Hull creaks: rarer and lighter in safe water, heavy near and past the limit.
    if (state.pressure > 0.45 && !state.quiet) {
      this.creak -= dt * (0.25 + state.pressure * state.pressure * 1.5);
      if (this.creak <= 0) {
        this.creak = 3.5 + Math.random() * 4;
        const k = state.pressure;
        this.play(k > 1 ? (Math.random() < 0.5 ? "creak3" : "groan") : k > 0.78 ? (Math.random() < 0.5 ? "creak2" : "creak3") : "creak1", Math.min(0.9, 0.25 + k * 0.5), 0.85 + Math.random() * 0.25);
      }
    }
    this.alarm -= dt;
    if (state.low && this.alarm <= 0 && !state.quiet) {
      this.alarm = 2.6;
      this.play("alarm", 0.32);
    }
  }
}
