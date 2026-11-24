import { el } from "./dom";
import { ICONS, type IconName } from "./icons";

const NS = "http://www.w3.org/2000/svg";
const SWEEP = 252;
const START = 234;

function arcPath(r: number, from: number, to: number) {
  const point = (deg: number) => {
    const a = ((deg - 90) * Math.PI) / 180;
    return `${(60 + r * Math.cos(a)).toFixed(2)} ${(60 + r * Math.sin(a)).toFixed(2)}`;
  };
  return `M${point(from)}A${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${point(to)}`;
}

/** One dial: a dark glass with a thick arc, used for depth, power and hull alike. */
export class Gauge {
  readonly root: HTMLElement;
  private arc: SVGPathElement;
  private danger: SVGPathElement;
  private text: HTMLElement;
  private length: number;
  private shown = "";

  constructor(kind: string, private label: string, symbol: IconName | null) {
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 120 120");
    const ticks = Array.from({ length: 10 }, (_, i) => {
      const a = ((START + (SWEEP * i) / 9 - 90) * Math.PI) / 180;
      return `<path d="M${60 + 38 * Math.cos(a)} ${60 + 38 * Math.sin(a)}L${60 + 34 * Math.cos(a)} ${60 + 34 * Math.sin(a)}"/>`;
    }).join("");
    svg.innerHTML = `<circle cx="60" cy="60" r="56" class="ds-dial"/><path class="ds-track" d="${arcPath(46, START, START + SWEEP)}"/><path class="ds-danger"/><path class="ds-arc" d="${arcPath(46, START, START + SWEEP)}"/><g class="ds-ticks">${ticks}</g>`;
    this.arc = svg.querySelector(".ds-arc")!;
    this.danger = svg.querySelector(".ds-danger")!;
    this.length = (46 * SWEEP * Math.PI) / 180;
    this.arc.style.strokeDasharray = `${this.length}`;
    this.text = el("span", "ds-gauge-value", "0");
    const mark = el("span", "ds-gauge-mark");
    mark.innerHTML = symbol ? ICONS[symbol] : "m";
    this.root = el("div", `ds-gauge ds-gauge-${kind}`, [svg, el("div", "ds-gauge-face", [this.text, mark])], { role: "img" });
  }

  /** `share` fills the arc; from `limit` on (0..1) the dial is marked as danger. */
  set(share: number, value: string, warn: boolean, limit?: number) {
    this.arc.style.strokeDashoffset = `${this.length * (1 - Math.min(1, Math.max(0, share)))}`;
    this.root.classList.toggle("is-warn", warn);
    if (value !== this.shown) {
      this.shown = value;
      this.text.textContent = value;
      this.root.setAttribute("aria-label", `${this.label} ${value}`);
    }
    if (limit !== undefined) this.danger.setAttribute("d", limit < 1 ? arcPath(46, START + SWEEP * limit, START + SWEEP) : "");
  }
}
