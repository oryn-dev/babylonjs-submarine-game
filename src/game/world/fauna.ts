import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import { seaMaterial } from "../gfx/plugin";
import type { Water } from "../gfx/water";
import type { Glows } from "./backdrop";
import { centerX, heightAt } from "./height";

interface School {
  kind: "fish_a" | "fish_b";
  x: number;
  z: number;
  above: number;
  radius: number;
  size: number;
  speed: number;
  scare: Vector3;
  fish: { phase: number; lane: number; rise: number; scale: number }[];
}

interface Jelly {
  x: number;
  y: number;
  z: number;
  phase: number;
  size: number;
}

const SCHOOLS: [School["kind"], number, number, number, number, number, number][] = [
  // kind, offset from the middle, z, height above the floor, circle, fish, size
  ["fish_a", 10, 30, 4, 7, 30, 0.75], ["fish_a", -22, 8, 3, 8, 26, 0.7], ["fish_b", 4, 46, 7, 12, 40, 0.7], ["fish_a", 30, 64, 4, 8, 26, 0.8],
  ["fish_b", -30, 88, 8, 12, 40, 0.8], ["fish_b", 10, 120, 8, 13, 44, 0.85], ["fish_b", -18, 152, 10, 12, 40, 0.9], ["fish_b", 24, 236, 10, 14, 34, 1], ["fish_b", -20, 284, 12, 16, 30, 1],
];

/** Fish schools that circle and scatter from the submarine, and jellyfish in the dim middle water. */
export class Fauna {
  private schools: School[] = [];
  private meshes: Record<School["kind"], Mesh>;
  private buffers: Record<School["kind"], Float32Array>;
  private jellies: Jelly[] = [];
  private jellyMesh: Mesh;
  private time = 0;

  constructor(scene: Scene, water: Water, parts: Map<string, Mesh>) {
    const random = (i: number) => ((Math.sin(i * 127.1) * 43758.5) % 1 + 1) % 1;
    SCHOOLS.forEach(([kind, dx, z, above, radius, count, size], s) => {
      this.schools.push({
        kind, x: centerX(z) + dx, z, above, radius, size, speed: (s % 2 ? 1 : -1) * (kind === "fish_a" ? 0.28 : 0.36), scare: new Vector3(),
        fish: Array.from({ length: count }, (_, i) => ({ phase: random(i + s * 50) * 1.9, lane: random(i * 3 + s) * 2 - 1, rise: random(i * 7 + s) * 2 - 1, scale: 0.75 + random(i * 11) * 0.5 })),
      });
    });
    const build = (kind: School["kind"]) => {
      const mesh = parts.get(`${kind}:matte`)!;
      mesh.hasVertexAlpha = false;
      mesh.material = seaMaterial(scene, water, kind, { roughness: 0.4, motion: "swim", amount: 0.16, doubleSided: true, thin: 0.08 });
      mesh.alwaysSelectAsActiveMesh = true;
      const count = this.schools.filter((s) => s.kind === kind).reduce((sum, s) => sum + s.fish.length, 0);
      const buffer = new Float32Array(count * 16);
      mesh.thinInstanceSetBuffer("matrix", buffer, 16, false);
      return [mesh, buffer] as const;
    };
    const [a, aBuffer] = build("fish_a");
    const [b, bBuffer] = build("fish_b");
    this.meshes = { fish_a: a, fish_b: b };
    this.buffers = { fish_a: aBuffer, fish_b: bBuffer };

    this.jellyMesh = parts.get("jelly:matte")!;
    this.jellyMesh.hasVertexAlpha = false;
    const jelly = seaMaterial(scene, water, "jelly", { roughness: 0.3, motion: "pulse", amount: 0.16, doubleSided: true, thin: 0.5 });
    jelly.alpha = 0.78;
    jelly.emissiveColor.set(0.1, 0.13, 0.22);
    this.jellyMesh.material = jelly;
    for (let i = 0; i < 26; i++) {
      const z = 190 + random(i + 3) * 170;
      const x = centerX(z) + (random(i + 91) * 2 - 1) * 52;
      this.jellies.push({ x, z, y: Math.min(-30, heightAt(x, z) + 8 + random(i + 17) * 26), phase: random(i) * 6.28, size: 0.7 + random(i + 5) * 1.1 });
    }
    this.jellyMesh.thinInstanceSetBuffer("matrix", new Float32Array(this.jellies.length * 16), 16, false);
    this.jellyMesh.alwaysSelectAsActiveMesh = true;
  }

  update(dt: number, sub: Vector3, glows: Glows) {
    this.time += dt;
    const used = { fish_a: 0, fish_b: 0 };
    const position = new Vector3();
    const scale = new Vector3();
    const rotation = new Quaternion();
    const matrix = new Matrix();
    for (const school of this.schools) {
      const far = Math.abs(school.z - sub.z) > 75;
      const cy = heightAt(school.x, school.z) + school.above;
      const dx = school.x - sub.x;
      const dz = school.z - sub.z;
      const gap = Math.hypot(dx, dz, cy - sub.y);
      const push = Math.max(0, 1 - gap / (school.radius + 6)) * 9;
      school.scare.x += ((dx / (gap + 0.1)) * push - school.scare.x) * Math.min(1, dt * 2.2);
      school.scare.z += ((dz / (gap + 0.1)) * push - school.scare.z) * Math.min(1, dt * 2.2);
      school.scare.y += (push * 0.3 - school.scare.y) * Math.min(1, dt * 2);
      const buffer = this.buffers[school.kind];
      for (const fish of school.fish) {
        const at = used[school.kind]++ * 16;
        if (far) {
          buffer.fill(0, at, at + 16);
          continue;
        }
        const a = this.time * school.speed + fish.phase + Math.sin(this.time * 0.7 + fish.phase * 5) * 0.1;
        const spread = school.radius * (1 + fish.lane * 0.22) + Math.sin(a * 3 + fish.lane * 4) * 0.8;
        position.set(school.x + Math.cos(a) * spread + school.scare.x, cy + fish.rise * 1.9 + Math.sin(a * 2 + fish.phase) * 0.9 + school.scare.y, school.z + Math.sin(a) * spread * 0.8 + school.scare.z);
        const heading = Math.atan2(-Math.sin(a) * school.speed, Math.cos(a) * 0.8 * school.speed);
        Quaternion.RotationYawPitchRollToRef(heading + school.scare.x * 0.06, -Math.cos(a * 2 + fish.phase) * 0.16, 0, rotation);
        scale.setAll(school.size * fish.scale);
        Matrix.ComposeToRef(scale, rotation, position, matrix);
        matrix.copyToArray(buffer, at);
      }
    }
    this.meshes.fish_a.thinInstanceBufferUpdated("matrix");
    this.meshes.fish_b.thinInstanceBufferUpdated("matrix");
    this.meshes.fish_a.setEnabled(sub.z < 160);

    const near = sub.z > 110 && sub.z < 420;
    this.jellyMesh.setEnabled(near);
    if (!near) return;
    const jelly = this.jellyMesh._thinInstanceDataStorage.matrixData!;
    this.jellies.forEach((j, i) => {
      position.set(j.x + Math.sin(this.time * 0.11 + j.phase) * 4, j.y + Math.sin(this.time * 0.23 + j.phase) * 2.4, j.z + Math.cos(this.time * 0.09 + j.phase) * 4);
      Quaternion.RotationYawPitchRollToRef(j.phase, Math.sin(this.time * 0.4 + j.phase) * 0.2, 0.12, rotation);
      scale.setAll(j.size);
      Matrix.ComposeToRef(scale, rotation, position, matrix);
      matrix.copyToArray(jelly, i * 16);
      if (Math.abs(position.z - sub.z) < 60) glows.add(position.x, position.y + 0.3, position.z, j.size * 1.9, 0.35, 0.5, 1, 0.3 + 0.12 * Math.sin(this.time * 1.8 + j.phase));
    });
    this.jellyMesh.thinInstanceBufferUpdated("matrix");
  }
}
