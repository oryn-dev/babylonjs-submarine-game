import type { Input } from "../../oryn/input";
import { countUp, gsap, pop, shake } from "../../oryn/juice";
import { button, el, money } from "./dom";
import { Gauge } from "./gauges";
import { ICONS, icon } from "./icons";
import { Markers } from "./markers";

export interface HudState {
  depth: number;
  limit: number;
  power: number;
  hull: number;
  slots: number;
  used: number;
  value: number;
}

/** What shows while diving: dials, hold, markers, prompt, notes and the opening title. */
export class Hud {
  readonly root = el("div", "ds-hud");
  readonly markers = new Markers();
  private depth = new Gauge("depth", "Depth in metres", null);
  private power = new Gauge("power", "Power percent", "battery");
  private hull = new Gauge("hull", "Hull percent", "hull");
  private pips = el("div", "ds-pips");
  private value = el("span", "ds-hold-value", "0");
  private prompt = el("div", "ds-prompt");
  private notes = el("div", "ds-notes", [], { role: "status" });
  private banner = el("div", "ds-banner");
  private title = el("div", "ds-title");
  private warn = el("div", "ds-warn");
  private promptShown = "";
  private pipKey = "";
  private soundButton: HTMLButtonElement;

  constructor(private input: Input, actions: { pause(): void; sound(): boolean }) {
    this.soundButton = button("ds-round", [icon("sound")], () => this.setSound(actions.sound()), "Sound on or off");
    const hold = el("div", "ds-hold", [icon("hold"), this.pips, this.value]);
    this.root.append(
      this.markers.root,
      el("div", "ds-vignette"),
      el("div", "ds-dials", [this.depth.root, el("div", "ds-dials-small", [this.power.root, this.hull.root])]),
      el("div", "ds-corner", [hold, el("div", "ds-buttons", [this.soundButton, button("ds-round", [icon("pause")], actions.pause, "Pause")])]),
      this.warn, this.banner, this.notes, this.prompt, this.title,
    );
  }

  setSound(on: boolean) {
    this.soundButton.firstElementChild!.innerHTML = ICONS[on ? "sound" : "mute"];
  }

  setVisible(visible: boolean) {
    this.root.classList.toggle("is-hidden", !visible);
  }

  showTitle() {
    this.title.replaceChildren(el("h1", "", "Deep Salvage"), el("p", "", "The sea keeps everything. Go and get it."));
    gsap.fromTo(this.title, { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 1.1, ease: "power2.out", delay: 0.2 });
  }

  hideTitle() {
    gsap.to(this.title, { autoAlpha: 0, y: -18, duration: 0.9, ease: "power2.in", overwrite: true });
  }

  zone(name: string) {
    this.banner.textContent = name;
    gsap.killTweensOf(this.banner);
    gsap.timeline().fromTo(this.banner, { autoAlpha: 0, letterSpacing: "0.5em" }, { autoAlpha: 1, letterSpacing: "0.16em", duration: 1.2, ease: "power3.out" }).to(this.banner, { autoAlpha: 0, duration: 1.1, delay: 1.8 });
  }

  note(text: string, kind: "plain" | "gain" | "bad" = "plain") {
    const node = el("div", `ds-note is-${kind}`, text);
    this.notes.prepend(node);
    while (this.notes.children.length > 3) this.notes.lastElementChild!.remove();
    pop(node);
    gsap.to(node, { autoAlpha: 0, y: -10, delay: 2.8, duration: 0.5, onComplete: () => node.remove() });
  }

  /** `keys` holds the key to press per device; the text stays the same. */
  setPrompt(text: string, keys?: { keyboard: string; gamepad: string; touch?: string }) {
    const key = keys ? (this.input.device === "keyboard" ? keys.keyboard : this.input.device === "gamepad" ? keys.gamepad : (keys.touch ?? "")) : "";
    const next = `${key}|${text}`;
    if (next === this.promptShown) return;
    this.promptShown = next;
    this.prompt.classList.toggle("is-shown", Boolean(text));
    if (!text) return;
    this.prompt.replaceChildren(...(key ? [el("kbd", "", key)] : []), el("span", "", text));
    gsap.fromTo(this.prompt, { scale: 0.94 }, { scale: 1, duration: 0.3, ease: "back.out(2.4)" });
  }

  hit() {
    shake(".ds-dials", 9, 0.4);
    const v = this.root.querySelector(".ds-vignette");
    gsap.fromTo(v, { opacity: 0.85 }, { opacity: 0, duration: 0.9, overwrite: true });
  }

  stored(value: number) {
    countUp(this.value, value, { format: money });
    gsap.fromTo(".ds-hold", { scale: 1.18 }, { scale: 1, duration: 0.5, ease: "elastic.out(1, 0.5)" });
  }

  update(s: HudState) {
    const scale = Math.max(60, s.limit * 1.3);
    this.depth.set(s.depth / scale, String(Math.round(s.depth)), s.depth > s.limit, s.limit / scale);
    this.power.set(s.power, String(Math.max(0, Math.ceil(s.power * 100))), s.power < 0.25);
    this.hull.set(s.hull, String(Math.max(0, Math.ceil(s.hull * 100))), s.hull < 0.35);
    const message = s.depth > s.limit ? "Too deep for this hull" : s.power < 0.12 ? "Power almost gone" : s.power < 0.25 ? "Head back, power low" : s.hull < 0.35 ? "Hull damaged" : "";
    if (this.warn.textContent !== message) {
      this.warn.textContent = message;
      this.warn.classList.toggle("is-shown", Boolean(message));
    }
    const key = `${s.slots}/${s.used}`;
    if (key !== this.pipKey) {
      this.pipKey = key;
      this.pips.replaceChildren(...Array.from({ length: s.slots }, (_, i) => el("i", i < s.used ? "is-full" : "")));
      if (!s.used) this.value.textContent = "0";
    }
  }
}
