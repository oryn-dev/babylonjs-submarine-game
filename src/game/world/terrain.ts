import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { PhysicsMotionType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody";
import { PhysicsShapeMesh } from "@babylonjs/core/Physics/v2/physicsShape";
import type { Scene } from "@babylonjs/core/scene";
import type { Assets } from "../../oryn/assets";
import { MASK_SUB, MASK_WORLD } from "../camera";
import { seaMaterial } from "../gfx/plugin";
import type { Water } from "../gfx/water";
import { WORLD, fbm, heightAt } from "./height";

const CELL = 2.2;
const CHUNK = 26;

const tint = (hex: string) => Color3.FromHexString(hex).toLinearSpace();
const TINTS: [number, Color3][] = [[6, tint("#fff0c4")], [26, tint("#f0e0ae")], [46, tint("#c4bd84")], [75, tint("#a9ad9c")], [105, tint("#8a8f90")], [150, tint("#5d5e66")], [240, tint("#4d4a52")]];

function tintAt(depth: number, out: Color3) {
  let i = 0;
  while (i < TINTS.length - 2 && TINTS[i + 1][0] < depth) i++;
  const k = Math.min(1, Math.max(0, (depth - TINTS[i][0]) / (TINTS[i + 1][0] - TINTS[i][0])));
  Color3.LerpToRef(TINTS[i][1], TINTS[i + 1][1], k, out);
}

export function groundTextures(scene: Scene, assets: Assets) {
  const load = (file: string) => new Texture(assets.url(`tex/${file}.jpg`), scene, { noMipmap: false, invertY: false });
  return { sand: load("sand"), sandNormal: load("sand_n"), rock: load("rock"), rockNormal: load("rock_n") };
}

export function addStatic(mesh: Mesh, scene: Scene) {
  const body = new PhysicsBody(mesh, PhysicsMotionType.STATIC, false, scene);
  body.shape = new PhysicsShapeMesh(mesh, scene);
  body.shape.filterMembershipMask = MASK_WORLD;
  body.shape.filterCollideMask = MASK_SUB;
  return body;
}

export function createTerrain(scene: Scene, water: Water, textures: ReturnType<typeof groundTextures>) {
  const material = seaMaterial(scene, water, "ground", { ground: textures, roughness: 0.95 });
  const columns = Math.round((WORLD.maxX - WORLD.minX) / CELL);
  const rows = Math.round((WORLD.maxZ - WORLD.minZ) / CELL);
  const heights = new Float32Array((columns + 1) * (rows + 1));
  for (let j = 0; j <= rows; j++) for (let i = 0; i <= columns; i++) heights[j * (columns + 1) + i] = heightAt(WORLD.minX + i * CELL, WORLD.minZ + j * CELL);
  const h = (i: number, j: number) => heights[Math.min(rows, Math.max(0, j)) * (columns + 1) + Math.min(columns, Math.max(0, i))];
  const chunks: Mesh[] = [];
  const color = new Color3();
  for (let start = 0; start < rows; start += CHUNK) {
    const end = Math.min(rows, start + CHUNK);
    const data = { positions: [] as number[], normals: [] as number[], colors: [] as number[], indices: [] as number[] };
    for (let j = start; j <= end; j++) {
      for (let i = 0; i <= columns; i++) {
        const x = WORLD.minX + i * CELL;
        const z = WORLD.minZ + j * CELL;
        const y = h(i, j);
        data.positions.push(x, y, z);
        const nx = h(i - 1, j) - h(i + 1, j);
        const nz = h(i, j - 1) - h(i, j + 1);
        const l = Math.hypot(nx, 2 * CELL, nz);
        data.normals.push(nx / l, (2 * CELL) / l, nz / l);
        tintAt(-y, color);
        const hollow = Math.min(1.12, Math.max(0.55, 1 + (y - (h(i - 2, j) + h(i + 2, j) + h(i, j - 2) + h(i, j + 2)) / 4) * 0.16));
        const patch = (0.8 + 0.4 * fbm(x * 0.05 + 90, z * 0.05)) * hollow;
        data.colors.push(color.r * patch, color.g * patch, color.b * patch, 1);
      }
    }
    const w = columns + 1;
    for (let j = 0; j < end - start; j++) for (let i = 0; i < columns; i++) {
      const a = j * w + i;
      data.indices.push(a, a + 1, a + w + 1, a, a + w + 1, a + w);
    }
    const mesh = new Mesh(`floor-${start}`, scene);
    Object.assign(new VertexData(), data).applyToMesh(mesh);
    mesh.material = material;
    mesh.isPickable = false;
    mesh.freezeWorldMatrix();
    mesh.doNotSyncBoundingInfo = true;
    addStatic(mesh, scene);
    chunks.push(mesh);
  }
  return chunks;
}
