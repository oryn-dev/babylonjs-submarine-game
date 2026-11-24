import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import { STATION } from "../data/wrecks";
import { seaMaterial, type SeaMaterial } from "../gfx/plugin";
import type { Water } from "../gfx/water";
import type { Glows } from "./backdrop";
import { centerX } from "./height";

/** The very large thing: it keeps to the edge of the light, circling, and only comes close at the end. */
export class Leviathan {
  readonly root: TransformNode;
  private material: SeaMaterial;
  private angle = 2;
  private time = 0;
  private radius = 60;
  private call = 14;
  private shown = 0;
  /** Set by the ending: it comes to the lantern and answers. */
  greeting = false;
  onCall: (near: number) => void = () => {};

  constructor(scene: Scene, water: Water, parts: Map<string, Mesh>) {
    this.root = new TransformNode("leviathan", scene);
    this.material = seaMaterial(scene, water, "leviathan", { roughness: 0.55, motion: "cruise", amount: 3.2, glow: 2.2, thin: 0.3 });
    for (const mesh of parts.values()) {
      mesh.parent = this.root;
      mesh.position.setAll(0);
      mesh.material = this.material;
      mesh.alwaysSelectAsActiveMesh = true;
    }
    this.root.setEnabled(false);
  }

  update(dt: number, sub: Vector3, sonar: boolean, glows: Glows) {
    const deep = this.greeting || -sub.y > 122;
    this.shown += ((deep ? 1 : 0) - this.shown) * Math.min(1, dt * 0.4);
    this.root.setEnabled(this.shown > 0.03);
    if (this.shown <= 0.03) return;
    this.time += dt;
    const target = this.greeting ? 30 : 46 + Math.sin(this.time * 0.13) * 13 - (sonar ? 8 : 0);
    this.radius += (target - this.radius) * Math.min(1, dt * 0.35);
    const speed = this.greeting ? 0.17 : 0.1;
    this.angle += dt * speed;
    const cx = this.greeting ? STATION.x : sub.x * 0.85 + centerX(sub.z) * 0.15;
    const cz = this.greeting ? STATION.z - 2 : sub.z + 6;
    const cy = this.greeting ? -STATION.depth + 25 + Math.sin(this.time * 0.21) * 5 : Math.max(sub.y + 9 + Math.sin(this.time * 0.17) * 7, -STATION.depth + 12);
    const x = cx + Math.cos(this.angle) * this.radius;
    const z = cz + Math.sin(this.angle) * this.radius;
    const follow = Math.min(1, dt * 1.2);
    if (Vector3.Distance(this.root.position, sub) > 220) this.root.position.set(x, cy, z);
    this.root.position.x += (x - this.root.position.x) * follow;
    this.root.position.y += (cy - this.root.position.y) * follow * 0.5;
    this.root.position.z += (z - this.root.position.z) * follow;
    this.root.rotation.set(Math.sin(this.time * 0.21) * 0.08, Math.atan2(-Math.sin(this.angle), Math.cos(this.angle)), -0.16);

    const own = this.greeting ? 1 : 0;
    this.material.emissiveColor.set(0.006 * own, 0.045 * own, 0.06 * own);
    const pulse = 0.5 + 0.5 * Math.sin(this.time * (this.greeting ? 2.4 : 0.9));
    this.material.sea.glow = (this.greeting ? 3.2 + pulse * 5 : 0.5 + pulse * 1.3) * this.shown;
    const forward = this.root.getDirection(Vector3.Forward());
    const side = this.root.getDirection(Vector3.Right());
    for (let i = 0; i < 9; i++) {
      const along = 17 - i * 4.4;
      for (const s of [-1, 1]) {
        const w = (4.1 - i * 0.4) * s;
        const p = this.root.position;
        glows.add(p.x + forward.x * along + side.x * w, p.y + 0.6, p.z + forward.z * along + side.z * w, 1.5, 0.45, 0.85, 1, (this.greeting ? 0.85 : 0.22) * this.shown * (0.5 + 0.5 * Math.sin(this.time * 2 - i * 0.7)), 0.7);
      }
    }
    this.call -= dt * (sonar ? 3 : 1);
    if (this.call <= 0) {
      this.call = 20 + Math.random() * 12;
      this.onCall(1 - Math.min(1, Vector3.Distance(this.root.position, sub) / 110));
    }
  }
}
