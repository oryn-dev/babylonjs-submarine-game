import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";
import { el } from "./dom";
import { ICONS, type IconName } from "./icons";

export interface Marker {
  key: string;
  position: Vector3;
  kind: "ship" | "cargo" | "page" | "signal" | "lantern";
  label: string;
}

interface Box { l: number; t: number; r: number; b: number }
interface Entry { node: HTMLElement; text: HTMLElement; label: string; x: number; y: number; edge: boolean }

const SYMBOL: Record<Marker["kind"], IconName> = { ship: "ship", cargo: "hold", page: "page", signal: "sonar", lantern: "lantern" };
const RANK: Record<Marker["kind"], number> = { lantern: 0, page: 1, signal: 1, ship: 2, cargo: 3 };
/** What the signs keep clear of. */
const OCCUPIED = ".ds-dials, .ds-hold, .ds-buttons, .ds-prompt, .ds-notes > *, .ds-warn, .oryn-stick-base, .oryn-touch-button";
const SIGN = 14;
const GAP = 36;
const EDGE_CARGO = 2;
const TEXTS = 2;

const around = (x: number, y: number, w: number, h: number): Box => ({ l: x - w, t: y - h, r: x + w, b: y + h });
const meet = (a: Box, b: Box) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;

/** Small signs over things in the world. Those out of view sit at the screen's edge; none covers the submarine, the HUD or another sign. */
export class Markers {
  readonly root = el("div", "ds-markers");
  private entries = new Map<string, Entry>();
  private occupied: Box[] = [];
  private frame = 0;

  update(scene: Scene, markers: Marker[], from: Vector3) {
    const camera = scene.activeCamera!;
    const width = this.root.clientWidth || 1;
    const height = this.root.clientHeight || 1;
    const view = camera.getViewMatrix();
    const lens = camera.getProjectionMatrix().m;
    if (this.frame++ % 15 === 0) this.measure();
    const toScreen = (p: Vector3) => ({ x: (0.5 + (p.x * lens[0]) / p.z / 2) * width, y: (0.5 - (p.y * lens[5]) / p.z / 2) * height });

    const own = Vector3.TransformCoordinates(from, view);
    const at = toScreen(own);
    const size = (lens[5] * height) / Math.max(own.z, 2);
    const sub = around(at.x, at.y, size * 1.3, size * 0.95);
    const safe: Box = { l: SIGN + 12, t: SIGN + 12, r: width - SIGN - 12, b: height - SIGN - 12 };
    const blocks = [...this.occupied, sub];
    const taken: Box[] = [];
    const free = (x: number, y: number) => {
      const box = around(x, y, SIGN, SIGN);
      const wide = around(x, y, GAP - SIGN, GAP - SIGN);
      return !blocks.some((block) => meet(box, block)) && !taken.some((other) => meet(wide, other));
    };

    const sorted = markers.map((marker) => ({ marker, meters: Vector3.Distance(marker.position, from) })).sort((a, b) => RANK[a.marker.kind] - RANK[b.marker.kind] || a.meters - b.meters);
    const shown: { marker: Marker; meters: number; x: number; y: number }[] = [];
    let edgeCargo = 0;
    for (const { marker, meters } of sorted) {
      const p = Vector3.TransformCoordinates(marker.position, view);
      let spot: { x: number; y: number } | undefined;
      let edge = false;
      if (p.z > 0.5) {
        const s = toScreen(p);
        if (s.x > safe.l && s.x < safe.r && s.y > safe.t && s.y < safe.b) spot = beside(s, sub, free);
      }
      if (!spot) {
        edge = true;
        if (marker.kind === "cargo" && edgeCargo >= EDGE_CARGO) continue;
        const flat = Math.hypot(p.x, p.z);
        const u = (Math.atan2(p.x, p.z) / Math.atan(1 / lens[0])) * (flat / (p.length() || 1));
        const v = Math.atan2(p.y, flat) / Math.atan(1 / lens[5]);
        spot = slide(safe, u, v, free);
        if (!spot) continue;
        if (marker.kind === "cargo") edgeCargo++;
      }
      const placed = this.place(marker, spot, edge, free);
      taken.push(around(placed.x, placed.y, SIGN, SIGN));
      shown.push({ marker, meters, ...placed });
    }

    const texts = [...shown].sort((a, b) => a.meters - b.meters).slice(0, TEXTS);
    for (const item of shown) {
      const entry = this.entries.get(item.marker.key)!;
      const meters = `${Math.round(item.meters)} m`;
      const around = [...blocks, ...taken.filter((box) => box.l > item.x || box.r < item.x || box.t > item.y || box.b < item.y)];
      let side = "";
      let label = "";
      if (texts.includes(item)) for (label of [`${item.marker.label}  ${meters}`, meters]) if ((side = this.side(item, label, width, around, taken))) break;
      if (side && entry.label !== label) entry.text.textContent = entry.label = label;
      entry.node.classList.toggle("is-silent", !side);
      entry.node.classList.toggle("is-right", side === "left");
    }
    const keys = new Set(shown.map(({ marker }) => marker.key));
    for (const [key, entry] of this.entries) if (!keys.has(key)) {
      entry.node.remove();
      this.entries.delete(key);
    }
  }

  private measure() {
    const origin = this.root.getBoundingClientRect();
    this.occupied = [...document.querySelectorAll(OCCUPIED)].map((node) => node.getBoundingClientRect()).filter((rect) => rect.width > 4 && rect.height > 4).map((rect) => ({ l: rect.left - origin.left - 10, t: rect.top - origin.top - 10, r: rect.right - origin.left + 10, b: rect.bottom - origin.top + 10 }));
  }

  /** On which side of a sign its text fits, if any; a placed text takes its room. */
  private side(item: { x: number; y: number }, label: string, width: number, blocks: Box[], taken: Box[]) {
    const length = label.length * 7.4 + 28;
    const right = { l: item.x + SIGN, t: item.y - 13, r: item.x + SIGN + length, b: item.y + 13 };
    const left = { ...right, l: item.x - SIGN - length, r: item.x - SIGN };
    const order = item.x > width / 2 ? [["right", right], ["left", left]] as const : [["left", left], ["right", right]] as const;
    for (const [name, box] of order) if (box.l > 6 && box.r < width - 6 && !blocks.some((block) => meet(box, block))) {
      taken.push(box);
      return name;
    }
    return "";
  }

  /** Signs at the edge glide, those over something stay on it. */
  private place(marker: Marker, spot: { x: number; y: number }, edge: boolean, free: (x: number, y: number) => boolean) {
    let entry = this.entries.get(marker.key);
    if (!entry) {
      const symbol = el("span", "ds-marker-sign");
      symbol.innerHTML = ICONS[SYMBOL[marker.kind]];
      const text = el("span", "ds-marker-text");
      const node = el("div", `ds-marker is-${marker.kind} is-silent`, [symbol, text]);
      this.root.append(node);
      entry = { node, text, label: "", ...spot, edge };
      this.entries.set(marker.key, entry);
    }
    const next = { x: entry.x + (spot.x - entry.x) * 0.3, y: entry.y + (spot.y - entry.y) * 0.3 };
    const glides = edge && entry.edge && Math.hypot(spot.x - entry.x, spot.y - entry.y) < 90 && free(next.x, next.y);
    Object.assign(entry, glides ? next : spot);
    entry.edge = edge;
    entry.node.classList.toggle("is-edge", edge);
    entry.node.style.transform = `translate(${entry.x.toFixed(1)}px, ${entry.y.toFixed(1)}px)`;
    return { x: entry.x, y: entry.y };
  }
}

/** The spot itself, or the closest free one beside the submarine or the next sign. */
function beside(s: { x: number; y: number }, sub: Box, free: (x: number, y: number) => boolean) {
  const spots = [s];
  if (meet(around(s.x, s.y, SIGN, SIGN), sub)) spots.push({ x: s.x, y: sub.t - SIGN - 1 }, { x: sub.l - SIGN - 1, y: s.y }, { x: sub.r + SIGN + 1, y: s.y });
  else spots.push({ x: s.x, y: s.y - GAP }, { x: s.x + GAP, y: s.y }, { x: s.x - GAP, y: s.y });
  return spots.sort((a, b) => Math.hypot(a.x - s.x, a.y - s.y) - Math.hypot(b.x - s.x, b.y - s.y)).find(({ x, y }) => free(x, y));
}

/** The point on the frame towards (u, v), or the next free one along it. */
function slide(frame: Box, u: number, v: number, free: (x: number, y: number) => boolean) {
  const w = frame.r - frame.l;
  const h = frame.b - frame.t;
  const k = 1 / Math.max(Math.abs(u), Math.abs(v), 1e-4);
  const x = (0.5 + (u * k) / 2) * w;
  const y = (0.5 - (v * k) / 2) * h;
  const start = y <= 0.01 ? x : x >= w - 0.01 ? w + y : y >= h - 0.01 ? w + h + (w - x) : 2 * w + h + (h - y);
  const around = 2 * (w + h);
  for (let i = 0; i < around / 6; i++) {
    const t = (start + (i % 2 ? -1 : 1) * Math.ceil(i / 2) * 6 + around * 2) % around;
    const spot = t < w ? { x: t, y: 0 } : t < w + h ? { x: w, y: t - w } : t < 2 * w + h ? { x: 2 * w + h - t, y: h } : { x: 0, y: around - t };
    if (free(frame.l + spot.x, frame.t + spot.y)) return { x: frame.l + spot.x, y: frame.t + spot.y };
  }
  return undefined;
}
