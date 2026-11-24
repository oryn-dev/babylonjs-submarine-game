import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import type { Assets } from "../../oryn/assets";

/** Every mesh of a file in plain world axes (forward +z), its own origin kept as position, keyed by node name and material: "body:paint". */
export async function loadParts(scene: Scene, assets: Assets, path: string) {
  const container = await assets.load(scene, path);
  const parts = new Map<string, Mesh>();
  for (const source of container.meshes) {
    if (!source.getTotalVertices()) continue;
    const mesh = source as Mesh;
    const node = mesh.name.replace(/_primitive\d+$/, "");
    const key = `${node}:${mesh.material?.name ?? ""}`;
    mesh.computeWorldMatrix(true);
    const world = mesh.getWorldMatrix().clone();
    const origin = world.getTranslation();
    world.setTranslation(Vector3.Zero());
    mesh.parent = null;
    mesh.position.setAll(0);
    mesh.rotationQuaternion = Quaternion.Identity();
    mesh.scaling.setAll(1);
    mesh.bakeTransformIntoVertices(world);
    mesh.position.copyFrom(origin);
    mesh.hasVertexAlpha = mesh.isVerticesDataPresent(VertexBuffer.ColorKind);
    mesh.material = null;
    mesh.name = key;
    mesh.isPickable = false;
    scene.addMesh(mesh);
    parts.set(key, mesh);
  }
  return parts;
}
