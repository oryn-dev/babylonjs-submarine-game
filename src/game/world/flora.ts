import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import "@babylonjs/core/Meshes/thinInstanceMesh";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { PhysicsMotionType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody";
import { PhysicsShapeSphere } from "@babylonjs/core/Physics/v2/physicsShape";
import type { Scene } from "@babylonjs/core/scene";
import { SHIP, STATION, WRECKS } from "../data/wrecks";
import { MASK_SUB, MASK_WORLD } from "../camera";
import { seaMaterial, type SeaMaterial } from "../gfx/plugin";
import type { Water } from "../gfx/water";
import { centerX, fbm, halfWidth, heightAt, normalAt, smooth, WORLD } from "./height";
import type { groundTextures } from "./terrain";

interface Kind {
  mesh: string;
  material: SeaMaterial;
  colors: string[];
  scale: [number, number];
  /** Chance per sample point by depth and patch noise (0..1). */
  density: (depth: number, patch: number, slope: number) => number;
  sink: number;
  tilt: number;
  step: number;
  /** Share of the scale that stays clear around wrecks. */
  clear?: boolean;
  collide?: number;
  reach: number;
}

const BAND = 52;

function seeded(seed: number) {
  let s = seed;
  return () => ((s = (s * 48271) % 2147483647) - 1) / 2147483646;
}

/** Corals, kelp, grass and rocks, as thin instances in bands along the dive so only near bands are drawn. */
export class Flora {
  private bands: { mesh: Mesh; z: number; reach: number }[] = [];
  count = 0;

  constructor(private scene: Scene, water: Water, parts: Map<string, Mesh>, textures: ReturnType<typeof groundTextures>) {
    const coral = seaMaterial(scene, water, "coral", { roughness: 0.7, thin: 0.12 });
    const soft = seaMaterial(scene, water, "soft", { roughness: 0.6, thin: 0.2, motion: "sway", amount: 0.12, doubleSided: true });
    const grass = seaMaterial(scene, water, "grass", { roughness: 0.6, thin: 0.3, motion: "sway", amount: 0.22, doubleSided: true });
    const kelp = seaMaterial(scene, water, "kelp", { roughness: 0.5, thin: 0.42, motion: "sway", amount: 0.0075, doubleSided: true });
    const rock = seaMaterial(scene, water, "rock", { ground: textures, amount: 0.6, roughness: 0.95 });
    const stone = seaMaterial(scene, water, "chimney", { grime: true, roughness: 0.95 });

    const reef = (near: number) => (depth: number, patch: number) => (1 - smooth(24, 40, depth)) * smooth(0.46, 0.62, patch) * near;
    const warm = ["#ff6f61", "#ff9a3d", "#ff5d8f", "#ffc04d", "#e06bd6"];
    const cool = ["#9c6bff", "#4fd1ff", "#ff7fb0", "#c8f04a", "#ffb03d"];
    const kinds: Kind[] = [
      { mesh: "coral_branch", material: coral, colors: warm, scale: [1.1, 2.6], density: reef(0.5), sink: 0.05, tilt: 0.7, step: 2.6, reach: 60 },
      { mesh: "coral_table", material: coral, colors: ["#d9a066", "#c77dbb", "#7fc4b0", "#e8b04d"], scale: [1.1, 2.8], density: reef(0.3), sink: 0.1, tilt: 0.5, step: 3.4, reach: 70 },
      { mesh: "coral_brain", material: coral, colors: ["#e3c04f", "#7fbf6a", "#d98b6a", "#b88bd0"], scale: [0.7, 1.9], density: reef(0.35), sink: 0.25, tilt: 1, step: 3.2, reach: 65 },
      { mesh: "coral_fan", material: soft, colors: ["#c03bd0", "#ff5577", "#ffa63d", "#8a5cff"], scale: [1.2, 2.6], density: (d, p) => Math.max(reef(0.3)(d, p), (1 - smooth(70, 90, d)) * smooth(0.56, 0.7, p) * 0.12), sink: 0.05, tilt: 0.3, step: 3.4, reach: 55 },
      { mesh: "sponge", material: coral, colors: cool, scale: [0.8, 1.9], density: (d, p) => (1 - smooth(60, 85, d)) * smooth(0.5, 0.66, p) * 0.26, sink: 0.05, tilt: 0.5, step: 3.2, reach: 60 },
      { mesh: "anemone", material: soft, colors: ["#ffb3d1", "#b8ffcf", "#ffe08a", "#c9b3ff"], scale: [0.7, 1.4], density: reef(0.36), sink: 0.03, tilt: 0.8, step: 3, reach: 40 },
      { mesh: "grass", material: grass, colors: ["#ffffff", "#d9ffb0", "#b8e08a"], scale: [0.7, 1.4], density: (d, p, s) => (1 - smooth(46, 62, d)) * (1 - smooth(0.4, 0.56, p)) * smooth(0.8, 0.95, s) * 0.5, sink: 0.03, tilt: 0.6, step: 2.3, reach: 42 },
      { mesh: "kelp", material: kelp, colors: ["#ffffff", "#e8ffd0", "#ffe9b0"], scale: [0.75, 1.35], density: (d, p, s) => smooth(30, 37, d) * (1 - smooth(54, 62, d)) * smooth(0.36, 0.55, p) * smooth(0.6, 0.8, s) * 0.5, sink: 0.2, tilt: 0.1, step: 4.4, clear: true, reach: 105 },
      { mesh: "rock0", material: rock, colors: ["#ffffff", "#d8d8d8", "#bfc6c9"], scale: [0.7, 3.4], density: (_d, p) => 0.05 + smooth(0.55, 0.7, p) * 0.1, sink: 0.35, tilt: 0.8, step: 6, clear: true, collide: 0.85, reach: 100 },
      { mesh: "rock1", material: rock, colors: ["#ffffff", "#cfcfcf"], scale: [0.6, 3], density: (_d, p) => 0.04 + smooth(0.5, 0.7, p) * 0.08, sink: 0.25, tilt: 0.8, step: 5.4, clear: true, collide: 0.75, reach: 95 },
      { mesh: "rock2", material: rock, colors: ["#ffffff", "#c8cdd0"], scale: [1.4, 5.5], density: (d, p) => smooth(40, 110, d) * 0.06 + smooth(0.6, 0.72, p) * 0.06, sink: 0.4, tilt: 0.35, step: 10, clear: true, collide: 0.85, reach: 110 },
      { mesh: "chimney", material: stone, colors: ["#ffffff", "#e8d0b0"], scale: [0.7, 1.7], density: (d, p) => smooth(150, 180, d) * smooth(0.45, 0.6, p) * 0.4, sink: 0.4, tilt: 0.15, step: 12, clear: true, collide: 0.9, reach: 95 },
    ];
    kinds.forEach((kind, index) => this.scatter(kind, parts.get(`${kind.mesh}:matte`)!, index));
  }

  private scatter(kind: Kind, source: Mesh, index: number) {
    const random = seeded(101 + index * 37);
    const bands = new Map<number, { matrices: number[]; colors: number[] }>();
    const spots = [...WRECKS.map((w) => [w.x, w.z, w.pad * 0.85]), [STATION.x, STATION.z, STATION.pad * 0.9], [SHIP.x, SHIP.z, 10]];
    for (let z = WORLD.minZ + 6; z < WORLD.maxZ - 20; z += kind.step) {
      const span = Math.min(118, halfWidth(z) * 1.25);
      const mid = centerX(z);
      for (let x = mid - span; x < mid + span; x += kind.step) {
        const roll = random();
        const px = x + (random() - 0.5) * kind.step;
        const pz = z + (random() - 0.5) * kind.step;
        const pick = random();
        const size = kind.scale[0] + (kind.scale[1] - kind.scale[0]) * Math.pow(random(), 1.8);
        const turn = random() * Math.PI * 2;
        const depth = -heightAt(px, pz);
        if (depth < 4) continue;
        const patch = fbm(px * 0.06 + index * 0.37, pz * 0.06 + 70);
        const chance = kind.density(depth, patch, 1);
        if (roll >= chance) continue;
        const n = normalAt(px, pz);
        if (roll >= kind.density(depth, patch, n.y)) continue;
        if (n.y < 0.45 && !kind.collide) continue;
        if (spots.some(([sx, sz, r]) => Math.hypot(px - sx, pz - sz) < (kind.clear ? r : r * 0.35))) continue;
        const up = new Vector3(n.x * kind.tilt, 1 - kind.tilt + n.y * kind.tilt, n.z * kind.tilt).normalize();
        const rotation = Quaternion.FromUnitVectorsToRef(Vector3.Up(), up, new Quaternion()).multiply(Quaternion.RotationAxis(Vector3.Up(), turn));
        const y = -depth - kind.sink * size;
        const band = Math.floor((pz - WORLD.minZ) / BAND);
        if (!bands.has(band)) bands.set(band, { matrices: [], colors: [] });
        const into = bands.get(band)!;
        Matrix.Compose(new Vector3(size, size * (0.85 + random() * 0.3), size), rotation, new Vector3(px, y, pz)).copyToArray(into.matrices, into.matrices.length);
        const color = Color3.FromHexString(kind.colors[Math.floor(pick * kind.colors.length)]).toLinearSpace();
        into.colors.push(color.r, color.g, color.b, 1);
        this.count++;
        if (kind.collide && size > 1.3) this.collider(px, y + size * 0.3, pz, size * kind.collide);
      }
    }
    for (const [band, { matrices, colors }] of bands) {
      const mesh = source.clone(`${kind.mesh}-${band}`, null);
      mesh.makeGeometryUnique();
      mesh.hasVertexAlpha = false;
      mesh.material = kind.material;
      mesh.thinInstanceSetBuffer("matrix", new Float32Array(matrices), 16, true);
      mesh.thinInstanceSetBuffer("color", new Float32Array(colors), 4, true);
      mesh.thinInstanceRefreshBoundingInfo(true);
      mesh.freezeWorldMatrix();
      this.bands.push({ mesh, z: WORLD.minZ + (band + 0.5) * BAND, reach: kind.reach + BAND / 2 });
    }
    source.setEnabled(false);
  }

  private collider(x: number, y: number, z: number, radius: number) {
    const node = new TransformNode("rock-collider", this.scene);
    node.position.set(x, y, z);
    const body = new PhysicsBody(node, PhysicsMotionType.STATIC, false, this.scene);
    body.shape = new PhysicsShapeSphere(Vector3.Zero(), radius, this.scene);
    body.shape.filterMembershipMask = MASK_WORLD;
    body.shape.filterCollideMask = MASK_SUB;
  }

  update(eye: Vector3) {
    for (const { mesh, z, reach } of this.bands) mesh.setEnabled(Math.abs(z - eye.z) < reach);
  }
}
