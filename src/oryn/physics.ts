import HavokPhysics from "@babylonjs/havok";
import wasm from "@babylonjs/havok/lib/esm/HavokPhysics.wasm?url";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";
import "@babylonjs/core/Physics/joinedPhysicsEngineComponent";
import type { Scene } from "@babylonjs/core/scene";

/**
 * Turns on Havok physics for the scene, with its WASM file bundled by Vite. After it, Babylon's PhysicsAggregate,
 * PhysicsBody and PhysicsCharacterController work on the scene.
 */
export async function enablePhysics(scene: Scene, gravity = new Vector3(0, -9.81, 0)) {
  const havok = await HavokPhysics({ locateFile: () => wasm });
  const plugin = new HavokPlugin(true, havok);
  scene.enablePhysics(gravity, plugin);
  return plugin;
}
