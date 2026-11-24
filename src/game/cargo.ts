import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import type { CargoStats, Tune } from "./data/tune";
import { LOOSE, WRECKS, type CargoKind } from "./data/wrecks";
import { seaMaterial, type SeaMaterial } from "./gfx/plugin";
import type { Water } from "./gfx/water";
import type { Glows } from "./world/backdrop";
import { centerX, heightAt } from "./world/height";
import type { Wrecks } from "./world/wrecks";

export interface Item {
  id: string;
  kind: CargoKind;
  stats: CargoStats;
  mesh: InstancedMesh;
  home: Vector3;
  turn: Quaternion;
  state: "lying" | "held" | "stowed" | "sold";
  /** Seconds the sonar keeps it marked. */
  marked: number;
}

export interface Page {
  wreck: string;
  position: Vector3;
  mesh: InstancedMesh;
  found: boolean;
  marked: number;
}

const SIZE: Record<CargoKind, number> = { crate: 1, barrel: 1, chest: 1.1, canister: 1, engine: 1.15, bell: 1.1, case: 1.1, core: 1.15, safe: 1.05, amphora: 1 };
const REST: Record<CargoKind, number> = { crate: 0.46, barrel: 0.55, chest: 0.32, canister: 0.26, engine: 0.36, bell: 0.5, case: 0.32, core: 0.6, safe: 0.5, amphora: 0.5 };

/** Everything worth grabbing: where it lies, whether it is taken, and how it glows. */
export class Cargo {
  readonly items: Item[] = [];
  readonly pages: Page[] = [];
  private material: SeaMaterial;

  constructor(scene: Scene, private water: Water, tune: Tune, parts: Map<string, Mesh>, wrecks: Wrecks) {
    this.material = seaMaterial(scene, water, "cargo", { roughness: 0.5, glow: 1, rim: true });
    const sources = new Map<string, Mesh>();
    for (const [key, mesh] of parts) {
      mesh.material = this.material;
      mesh.hasVertexAlpha = true;
      mesh.position.setAll(0);
      mesh.setEnabled(false);
      sources.set(key.split(":")[0], mesh);
    }
    let seed = 3;
    const random = () => ((seed = (seed * 48271) % 2147483647) - 1) / 2147483646;
    const put = (id: string, kind: CargoKind, p: Vector3, onFloor: boolean) => {
      const mesh = sources.get(kind)!.createInstance(id);
      const turn = Quaternion.RotationYawPitchRoll(random() * 6.28, (random() - 0.5) * 0.4, (random() - 0.5) * 0.4);
      const home = p.clone();
      if (onFloor) home.y = Math.max(home.y, heightAt(p.x, p.z) + REST[kind] * 0.9);
      mesh.scaling.setAll(SIZE[kind]);
      this.items.push({ id, kind, stats: tune.cargo(kind), mesh, home, turn, state: "lying", marked: 0 });
    };
    for (const wreck of WRECKS) {
      wreck.cargo.forEach(([kind, x, y, z], i) => put(`${wreck.id}-${i}`, kind, wrecks.spot(wreck.id, [x, y, z]), true));
      const mesh = sources.get("case")!.createInstance(`page-${wreck.id}`);
      mesh.scaling.set(0.8, 0.45, 0.8);
      const position = wrecks.spot(wreck.id, wreck.log);
      position.y = heightAt(position.x, position.z) + 0.35;
      mesh.position.copyFrom(position);
      mesh.rotationQuaternion = Quaternion.RotationYawPitchRoll(random() * 6, 0.1, 0.1);
      this.pages.push({ wreck: wreck.id, position, mesh, found: false, marked: 0 });
    }
    LOOSE.forEach(([kind, dx, z], i) => {
      const x = centerX(z) + dx;
      put(`loose-${i}`, kind, new Vector3(x, heightAt(x, z), z), true);
    });
    this.reset([], []);
  }

  /** Puts everything back except what was sold and read. */
  reset(sold: string[], read: string[]) {
    for (const item of this.items) {
      item.state = sold.includes(item.id) ? "sold" : "lying";
      item.marked = 0;
      this.lay(item);
    }
    for (const page of this.pages) {
      page.found = read.includes(page.wreck);
      page.mesh.setEnabled(!page.found);
    }
  }

  lay(item: Item) {
    item.mesh.setEnabled(item.state === "lying");
    item.mesh.position.copyFrom(item.home);
    item.mesh.rotationQuaternion = item.turn.clone();
    item.mesh.scaling.setAll(SIZE[item.kind]);
  }

  nearest(from: Vector3, forward: Vector3, range: number) {
    let best: Item | null = null;
    let score = Infinity;
    for (const item of this.items) {
      if (item.state !== "lying") continue;
      const to = item.home.subtract(from);
      const d = to.length();
      if (d > range) continue;
      const s = d - Vector3.Dot(to, forward) * 0.35;
      if (s < score) [score, best] = [s, item];
    }
    return best;
  }

  update(dt: number, time: number, eye: Vector3, glows: Glows) {
    this.material.sea.glow = 1.5 + 0.4 * Math.sin(time * 3);
    for (const item of this.items) {
      item.marked = Math.max(0, item.marked - dt);
      if (item.state !== "lying") continue;
      const d = Vector3.Distance(item.home, eye);
      item.mesh.setEnabled(d < 110);
      if (d > 110) continue;
      const beat = 0.75 + 0.25 * Math.sin(time * 2.4 + item.home.x);
      const soft = Math.max(0, 1 - d / 40) * 0.75;
      const mark = Math.min(1, item.marked / 2) * 0.55;
      if (soft + mark > 0.02) glows.add(item.home.x, item.home.y + 0.15, item.home.z, 2 + mark * 1.4, 1, 0.58, 0.14, (soft + mark) * beat * (1.9 - this.water.darkness), 1 - mark * 0.6);
    }
    for (const page of this.pages) {
      page.marked = Math.max(0, page.marked - dt);
      if (page.found) continue;
      const d = Vector3.Distance(page.position, eye);
      if (d < 90) glows.add(page.position.x, page.position.y + 0.3, page.position.z, 1.6, 0.35, 1, 0.85, (Math.max(0, 1 - d / 40) * 0.5 + Math.min(1, page.marked) * 0.5) * (0.7 + 0.3 * Math.sin(time * 4)), 0.7);
    }
  }
}
