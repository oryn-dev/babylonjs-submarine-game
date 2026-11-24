import { countUp, gsap, stagger } from "../../oryn/juice";
import { settings, updateSettings } from "../../oryn/settings";
import { MAX_LEVEL, UPGRADE_IDS, type Tune, type UpgradeId } from "../data/tune";
import { WRECKS } from "../data/wrecks";
import type { Save } from "../progress";
import type { Sound } from "../sound";
import { button, el, money } from "./dom";
import { icon, type IconName } from "./icons";

const UPGRADES: Record<UpgradeId, { name: string; icon: IconName; unit: (v: number) => string }> = {
  hull: { name: "Hull", icon: "hull", unit: (v) => `safe to ${v} m` },
  battery: { name: "Battery", icon: "battery", unit: (v) => `${v} charge` },
  lights: { name: "Lights", icon: "lights", unit: (v) => `reach ${v} m` },
  sonar: { name: "Sonar", icon: "sonar", unit: (v) => `hears ${v} m` },
  arm: { name: "Arm", icon: "arm", unit: (v) => `reach ${v} m` },
  hold: { name: "Hold", icon: "hold", unit: (v) => `${v} slots` },
};

const ARM_LIFTS = ["light finds", "chests", "engines and cores", "everything, fast"];

/** Full screens over the running scene: ship, logbook page, pause, lost dive, ending. */
export class Screens {
  readonly root = el("div", "ds-screens");
  private open: HTMLElement | null = null;
  private restoring: (() => void) | null = null;

  constructor(private save: Save, private tune: Tune, private sound: Sound) {}

  get shown() {
    return this.open !== null;
  }

  private show(node: HTMLElement) {
    this.open?.remove();
    this.open = node;
    this.root.append(node);
    gsap.fromTo(node, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3 });
    const panel = node.querySelector(".ds-panel");
    if (panel) gsap.fromTo(panel, { y: 24, scale: 0.97 }, { y: 0, scale: 1, duration: 0.45, ease: "power3.out" });
  }

  close() {
    const node = this.open;
    this.open = null;
    this.restoring = null;
    if (!node) return;
    node.style.pointerEvents = "none";
    gsap.to(node, { autoAlpha: 0, duration: 0.25, onComplete: () => node.remove() });
  }

  /** The key or gamepad confirm for the open screen. */
  confirm() {
    this.restoring?.();
  }

  ship(sold: { name: string; value: number }[], earned: number, onDive: () => void) {
    const { save } = this;
    const credits = el("strong", "ds-credits-value", money(save.data.credits - earned));
    const body = el("div", "ds-ship-body");
    const tabs: HTMLButtonElement[] = [];
    const draw = (tab: "upgrades" | "log") => {
      tabs.forEach((t, i) => t.classList.toggle("is-on", (i === 0) === (tab === "upgrades")));
      body.replaceChildren(tab === "upgrades" ? this.upgrades(() => {
        countUp(credits, save.data.credits, { format: money });
        draw("upgrades");
      }) : this.logbook());
    };
    tabs.push(button("ds-tab", "Workshop", () => (this.sound.play("click", 0.5), draw("upgrades"))), button("ds-tab", `Logbook ${save.data.pages.length}/${WRECKS.length}`, () => (this.sound.play("page", 0.5), draw("log"))));
    const dive = button("ds-primary", "Dive", () => {
      this.sound.play("click", 0.6);
      this.close();
      onDive();
    });
    const list = sold.length ? el("ul", "ds-sold", sold.map((s) => el("li", "", [el("span", "", s.name), el("b", "", `+${money(s.value)}`)]))) : el("p", "ds-hint", this.advice());
    const panel = el("div", "ds-panel ds-ship", [
      el("aside", "ds-ship-side", [el("h2", "", sold.length ? "Sold" : "The Marlin"), el("div", "ds-credits", [icon("coin"), credits]), list, dive]),
      el("div", "ds-ship-main", [el("div", "ds-tabs", tabs), body]),
    ]);
    draw("upgrades");
    this.show(el("div", "ds-screen is-ship", [panel]));
    if (earned) {
      countUp(credits, save.data.credits, { from: save.data.credits - earned, duration: 1.3, format: money });
      stagger(panel.querySelectorAll(".ds-sold li"), 0.15);
      this.sound.play("sold", 0.7);
    }
    this.restoring = () => dive.click();
  }

  private advice() {
    const { data } = this.save;
    if (data.finished) return "The lantern burns. There is still cargo down there.";
    const next = WRECKS.find((w) => !data.pages.includes(w.id));
    if (data.pages.length === WRECKS.length) return "Every page is found. Lantern Station lies at 229 m.";
    const limit = this.save.stat("hull");
    if (next && next.depth > limit) return `The next signal lies at ${next.depth} m. This hull holds to ${limit} m.`;
    return next ? `A signal at ${next.depth} m waits for you.` : "";
  }

  private upgrades(changed: () => void) {
    const { save, tune } = this;
    const card = (id: UpgradeId) => {
      const level = save.data.levels[id];
      const info = UPGRADES[id];
      const cost = save.nextCost(id);
      const now = info.unit(tune.stat(id, level));
      const then = cost === null ? "" : info.unit(tune.stat(id, level + 1));
      const pips = el("div", "ds-levels", Array.from({ length: MAX_LEVEL }, (_, i) => el("i", i < level ? "is-full" : "")));
      const lines = id === "arm" ? [`lifts ${ARM_LIFTS[level]}`, cost === null ? "" : `next: ${ARM_LIFTS[level + 1]}`] : [now, then && `next: ${then}`];
      const buy = cost === null ? el("span", "ds-full", "Complete") : button("ds-buy", [icon("coin"), money(cost)], () => {
        if (save.buy(id)) {
          this.sound.play("upgrade", 0.7);
          changed();
        } else this.sound.play("deny", 0.6);
      }, `Upgrade ${info.name} for ${cost}`);
      if (cost !== null && cost > save.data.credits) buy.classList.add("is-poor");
      return el("div", "ds-card", [el("div", "ds-card-head", [icon(info.icon), el("h3", "", info.name), pips]), el("p", "", lines[0]), lines[1] ? el("p", "ds-next", lines[1]) : null, buy]);
    };
    return el("div", "ds-cards", UPGRADE_IDS.map(card));
  }

  private logbook() {
    const { pages } = this.save.data;
    return el("div", "ds-log", WRECKS.map((w) => pages.includes(w.id)
      ? el("article", "ds-entry", [el("h3", "", w.page.title), el("time", "", w.page.date), el("p", "", w.page.text)])
      : el("article", "ds-entry is-missing", [el("h3", "", "A page is still down there"), el("p", "", `Listen for a signal near ${w.depth} m.`)])));
  }

  page(id: string, onClose: () => void) {
    const wreck = WRECKS.find((w) => w.id === id)!;
    const done = () => {
      this.sound.play("page", 0.5);
      this.close();
      onClose();
    };
    const panel = el("div", "ds-panel ds-paper", [el("h2", "", wreck.page.title), el("time", "", wreck.page.date), el("p", "", wreck.page.text), button("ds-primary", "Keep it", done)]);
    this.show(el("div", "ds-screen", [panel]));
    this.sound.play("page", 0.7);
    this.restoring = done;
  }

  pause(onResume: () => void, onNew: () => void) {
    const resume = () => {
      this.close();
      onResume();
    };
    const volume = el("input", "ds-range", [], { type: "range", min: "0", max: "1", step: "0.05", value: String(settings.volume), "aria-label": "Volume" }) as HTMLInputElement;
    volume.addEventListener("input", () => updateSettings({ volume: Number(volume.value) }));
    const quality = el("div", "ds-choice", (["low", "medium", "high"] as const).map((q) => {
      const b = button(settings.quality === q ? "is-on" : "", q[0].toUpperCase() + q.slice(1), () => {
        updateSettings({ quality: q });
        quality.querySelectorAll("button").forEach((other) => other.classList.toggle("is-on", other === b));
      });
      return b;
    }));
    let sure = false;
    const fresh = button("ds-quiet", "Start over", () => {
      if (!sure) {
        sure = true;
        fresh.textContent = "Erase all progress?";
        return;
      }
      this.close();
      onNew();
    });
    const keys = [["W S", "drive"], ["A D or mouse", "steer"], ["Space, Shift", "up, down"], ["E or click", "grab"], ["F", "sonar"]];
    const panel = el("div", "ds-panel ds-pause", [
      el("div", "ds-pause-main", [el("h2", "", "Paused"), el("label", "ds-row", [el("span", "", "Volume"), volume]), el("div", "ds-row", [el("span", "", "Picture"), quality]), el("div", "ds-actions", [button("ds-primary", "Resume", resume), fresh])]),
      el("dl", "ds-keys", keys.flatMap(([k, t]) => [el("dt", "", k), el("dd", "", t)])),
    ]);
    this.show(el("div", "ds-screen", [panel]));
    this.restoring = resume;
  }

  lost(reason: string, cargo: number, onAgain: () => void) {
    const again = () => {
      this.close();
      onAgain();
    };
    const panel = el("div", "ds-panel ds-message", [el("h2", "", reason), el("p", "", cargo ? `The Marlin winched you up. ${cargo === 1 ? "One find" : `${cargo} finds`} slipped out of the basket and lie where you found them.` : "The Marlin winched you up. Nothing was lost but time."), button("ds-primary", "Repair and return", again)]);
    this.show(el("div", "ds-screen", [panel]));
    this.restoring = again;
  }

  ending(onStay: () => void, onNew: () => void) {
    const { data } = this.save;
    const minutes = Math.max(1, Math.round(data.seconds / 60));
    const stats: [string, string][] = [[String(data.dives), data.dives === 1 ? "dive" : "dives"], [`${minutes} min`, "under water"], [money(data.earned), "earned"], [`${data.pages.length}/${WRECKS.length}`, "pages found"]];
    const stay = () => {
      this.close();
      onStay();
    };
    const panel = el("div", "ds-ending", [
      el("h2", "", "The lantern is lit"),
      el("p", "", "Four hundred lamps, dark for thirty years, and something vast that never stopped waiting for an answer. It says hello. You blink your lights, twice."),
      el("div", "ds-stats", stats.map(([v, l]) => el("div", "", [el("b", "", v), el("span", "", l)]))),
      el("div", "ds-actions", [button("ds-primary", "Keep diving", stay), button("ds-quiet", "New voyage", () => {
        this.close();
        onNew();
      })]),
    ]);
    this.show(el("div", "ds-screen is-ending", [panel]));
    stagger(panel.children, 0.2);
    this.restoring = stay;
  }
}
