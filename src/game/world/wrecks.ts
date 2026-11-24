import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import type { Scene } from "@babylonjs/core/scene";
import type { Assets } from "../../oryn/assets";
import { SHIP, STATION, WRECKS } from "../data/wrecks";
import { seaMaterial, type SeaMaterial } from "../gfx/plugin";
import type { Water } from "../gfx/water";
import type { Glows } from "./backdrop";
import { heightAt } from "./height";
import { loadParts } from "./models";
import { addStatic } from "./terrain";

const RAD = Math.PI / 180;

/** The wrecks, the ship and the station: static, solid, one mesh each. */
export class Wrecks {
  readonly nodes = new Map<string, TransformNode>();
  readonly station: TransformNode;
  readonly ship: TransformNode;
  /** 0 dark to 1 fully lit. */
  power = 0;
  private stationMaterial: SeaMaterial;
  private lantern: PointLight;
  private solid: Mesh[] = [];

  private constructor(private scene: Scene, models: Map<string, Mesh[]>, water: Water) {
    const hulk = seaMaterial(scene, water, "wreck", { grime: true, roughness: 0.82, doubleSided: true });
    this.stationMaterial = seaMaterial(scene, water, "station", { grime: true, roughness: 0.75, glow: 0.12 });
    const shipMaterial = seaMaterial(scene, water, "ship", { roughness: 0.6, glow: 2 });

    const place = (name: string, position: Vector3, rotation: Quaternion, material: SeaMaterial) => {
      const root = new TransformNode(name, scene);
      root.position.copyFrom(position);
      root.rotationQuaternion = rotation;
      for (const mesh of models.get(name)!) {
        mesh.parent = root;
        mesh.material = material;
        if (material === hulk || material === shipMaterial) mesh.hasVertexAlpha = material === shipMaterial;
        mesh.computeWorldMatrix(true);
        mesh.freezeWorldMatrix();
        this.solid.push(mesh);
      }
      return root;
    };
    for (const wreck of WRECKS) {
      const y = -wreck.depth + wreck.lift;
      this.nodes.set(wreck.id, place(wreck.model, new Vector3(wreck.x, y, wreck.z), Quaternion.RotationYawPitchRoll(wreck.yaw * RAD, (wreck.pitch ?? 0) * RAD, (wreck.roll ?? 0) * RAD), hulk));
    }
    this.station = place("station", new Vector3(STATION.x, -STATION.depth + 0.6, STATION.z), Quaternion.RotationYawPitchRoll(STATION.yaw * RAD, 0, 0), this.stationMaterial);
    this.ship = place("mothership", new Vector3(SHIP.x, 0.4, SHIP.z), Quaternion.Identity(), shipMaterial);

    this.lantern = new PointLight("lantern", new Vector3(STATION.x, -STATION.depth + 24, STATION.z), scene);
    this.lantern.diffuse.set(1, 0.72, 0.42);
    this.lantern.range = 130;
    this.lantern.intensity = 0;
    this.lantern.falloffType = PointLight.FALLOFF_STANDARD;
  }

  makeSolid() {
    for (const mesh of this.solid) addStatic(mesh, this.scene);
  }

  static async create(scene: Scene, assets: Assets, water: Water) {
    const names = [...WRECKS.map((w) => w.model), "station", "mothership"];
    const models = new Map<string, Mesh[]>();
    await Promise.all(names.map(async (name) => models.set(name, [...(await loadParts(scene, assets, `models/${name}.glb`)).values()])));
    return new Wrecks(scene, models, water);
  }

  /** World position of a spot in a wreck's own axes, kept above the floor. */
  spot(id: string, [x, y, z]: readonly number[]) {
    const node = this.nodes.get(id)!;
    node.computeWorldMatrix(true);
    const p = Vector3.TransformCoordinates(new Vector3(x, y, z), node.getWorldMatrix());
    p.y = Math.max(p.y, heightAt(p.x, p.z) + 0.4);
    return p;
  }

  /** Where the submarine stops to dock at the station. */
  collar() {
    return new Vector3(STATION.x, -STATION.depth + 4.8, STATION.z - 14.2);
  }

  update(time: number, glows: Glows) {
    const p = this.power;
    this.stationMaterial.sea.glow = 0.1 + p * 9;
    this.lantern.setEnabled(p > 0.01);
    this.lantern.intensity = p * 46;
    const { x, z } = STATION;
    const y = -STATION.depth;
    const beat = 0.75 + 0.25 * Math.sin(time * 1.1);
    glows.add(x, y + 23, z, 5 + p * 18, 2.6, 1.15, 0.42, 0.03 + p * 0.75 * beat, 0.45);
    if (p > 0.05) glows.add(x, y + 23, z, 7, 3, 1.5, 0.7, p * 1.1, 0.25);
    if (p > 0.05) for (const [dx, dz, r] of [[0, 0, 12], [13, -5, 8], [-12.5, -6, 8], [-2, -15, 7]]) glows.add(x + dx, y + 6, z + dz, r, 2.2, 0.95, 0.35, p * 0.22, 0.6);
    for (const side of [-1, 1]) for (const dz of [-4.2, 0, 4.2]) glows.add(SHIP.x + side * 3.2, -8.6, SHIP.z + dz, 1.25, 1, 0.8, 0.42, 0.4);
  }
}
