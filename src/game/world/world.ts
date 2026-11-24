import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";
import type { Assets } from "../../oryn/assets";
import type { Look } from "../../oryn/look";
import { enablePhysics } from "../../oryn/physics";
import { Cargo } from "../cargo";
import type { Tune } from "../data/tune";
import { STATION, WRECKS } from "../data/wrecks";
import { Water } from "../gfx/water";
import { Submarine } from "../sub/sub";
import { Effects } from "../sub/effects";
import { Glows, createBackdrop } from "./backdrop";
import { Fauna } from "./fauna";
import { Flora } from "./flora";
import { addPad } from "./height";
import { Leviathan } from "./leviathan";
import { loadParts } from "./models";
import { createTerrain, groundTextures } from "./terrain";
import { Wrecks } from "./wrecks";

/** Builds everything that is in the sea. */
export async function createWorld(scene: Scene, assets: Assets, look: Look, tune: Tune) {
  for (const wreck of WRECKS) addPad(wreck.x, wreck.z, wreck.pad, wreck.depth);
  addPad(STATION.x, STATION.z, STATION.pad, STATION.depth);
  const water = new Water(scene, look);
  const textures = groundTextures(scene, assets);
  const load = (name: string) => loadParts(scene, assets, `models/${name}.glb`);
  const [, nature, cargoParts, giantParts, subParts, wrecks] = await Promise.all([
    enablePhysics(scene, Vector3.Zero()), load("nature"), load("cargo"), load("leviathan"), load("sub"), Wrecks.create(scene, assets, water),
  ]);
  const terrain = createTerrain(scene, water, textures);
  wrecks.makeSolid();
  const flora = new Flora(scene, water, nature, textures);
  const fauna = new Fauna(scene, water, nature);
  const cargo = new Cargo(scene, water, tune, cargoParts, wrecks);
  const leviathan = new Leviathan(scene, water, giantParts);
  const backdrop = createBackdrop(scene, water);
  const glows = new Glows(scene, water);
  const sub = new Submarine(scene, water, tune, subParts);
  const effects = new Effects(scene, water);
  for (const mesh of terrain) mesh.receiveShadows = false;
  return { water, terrain, wrecks, flora, fauna, cargo, leviathan, backdrop, glows, sub, effects };
}

export type World = Awaited<ReturnType<typeof createWorld>>;
