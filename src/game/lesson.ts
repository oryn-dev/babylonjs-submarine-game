import type { Hud } from "./hud/hud";

const STEPS = [
  { text: "Drive and steer", keys: { keyboard: "W A S D", gamepad: "Left stick" } , touch: "Stick to drive, up and down on the right" },
  { text: "Take the glowing crate", keys: { keyboard: "E", gamepad: "Y" }, touch: "Come close and take the crate with the claw" },
  { text: "Ping the sonar to find more", keys: { keyboard: "F", gamepad: "X" }, touch: "Ping the sonar to find more" },
  { text: "Rise to the Marlin to sell", keys: { keyboard: "Space", gamepad: "A" }, touch: "Rise to the Marlin to sell" },
];

/** Four tips on the first dive; each goes away once done. */
export class Lesson {
  constructor(private hud: Hud, public step: number) {}

  get active() {
    return this.step < STEPS.length;
  }

  done(step: number) {
    if (this.step === step) this.step++;
  }

  show(touch: boolean) {
    const tip = STEPS[this.step];
    if (!tip) return;
    if (touch) this.hud.setPrompt(tip.touch);
    else this.hud.setPrompt(tip.text, tip.keys);
  }
}
