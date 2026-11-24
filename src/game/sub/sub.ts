import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { PhysicsMotionType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody";
import { PhysicsShapeCapsule } from "@babylonjs/core/Physics/v2/physicsShape";
import type { Scene } from "@babylonjs/core/scene";
import { MASK_SUB, MASK_WORLD } from "../camera";
import type { Controls } from "../controls";
import type { Tune } from "../data/tune";
import { seaMaterial, type SeaMaterial } from "../gfx/plugin";
import type { Water } from "../gfx/water";
import { centerX, halfWidth, heightAt, WORLD } from "../world/height";
import { Arm } from "./arm";
import { Lamps } from "./lamps";

const TOP = -2.6;

/** The submarine: model, heavy movement through a physics body, propeller, lamps and arm. */
export class Submarine {
  /** Physics body; carries position and heading. */
  readonly node: TransformNode;
  /** Model; adds roll and bob. */
  readonly hull: TransformNode;
  readonly arm: Arm;
  readonly lamps: Lamps;
  readonly velocity = new Vector3();
  readonly meshes: Mesh[] = [];
  heading = 0;
  pitch = 0;
  thrust = 0;
  onBump: (speed: number, point: Vector3) => void = () => {};
  /** While set the game moves the hull itself (docking, the ending). */
  frozen = false;
  private body: PhysicsBody;
  private turnSpeed = 0;
  private pitchSpeed = 0;
  private roll = 0;
  private time = 0;
  private spin = 0;
  private prop: Mesh;
  private glow: SeaMaterial;

  constructor(scene: Scene, water: Water, private tune: Tune, parts: Map<string, Mesh>) {
    this.node = new TransformNode("submarine", scene);
    this.node.rotationQuaternion = Quaternion.Identity();
    this.hull = new TransformNode("submarine-hull", scene);
    this.hull.parent = this.node;
    const materials: Record<string, SeaMaterial> = {
      paint: seaMaterial(scene, water, "sub-paint", { roughness: 0.36 }),
      metal: seaMaterial(scene, water, "sub-metal", { roughness: 0.34, metallic: 0.85 }),
      matte: seaMaterial(scene, water, "sub-matte", { roughness: 0.8 }),
      glow: (this.glow = seaMaterial(scene, water, "sub-glow", { roughness: 0.5, glow: 2.4 })),
      glass: seaMaterial(scene, water, "sub-glass", { roughness: 0.04 }),
    };
    materials.paint.clearCoat.isEnabled = true;
    materials.paint.clearCoat.intensity = 0.5;
    materials.paint.clearCoat.roughness = 0.2;
    materials.glass.alpha = 0.2;
    materials.glass.albedoColor.set(0.6, 0.9, 1);
    const groups = new Map<string, Mesh[]>();
    for (const [key, mesh] of parts) {
      const [node, kind] = key.split(":");
      mesh.material = materials[kind];
      mesh.hasVertexAlpha = kind === "glow";
      groups.set(node, [...(groups.get(node) ?? []), mesh]);
      this.meshes.push(mesh);
    }
    for (const mesh of [...groups.get("body")!, ...groups.get("dome")!, ...groups.get("prop")!]) mesh.parent = this.hull;
    this.prop = groups.get("prop")![0];
    this.arm = new Arm(scene, this.hull, groups);
    this.lamps = new Lamps(scene, water, this.hull, this.meshes);

    this.body = new PhysicsBody(this.node, PhysicsMotionType.DYNAMIC, false, scene);
    const shape = new PhysicsShapeCapsule(new Vector3(0, 0, -1.6), new Vector3(0, 0, 1.2), 1.35, scene);
    shape.material = { friction: 0.05, restitution: 0.25 };
    shape.filterMembershipMask = MASK_SUB;
    shape.filterCollideMask = MASK_WORLD;
    this.body.shape = shape;
    this.body.setMassProperties({ mass: 1, inertia: Vector3.Zero(), centerOfMass: Vector3.Zero() });
    this.body.setLinearDamping(0);
    this.body.setAngularDamping(0);
    this.body.disablePreStep = false;
    this.body.setCollisionCallbackEnabled(true);
    this.body.getCollisionObservable().add((event) => {
      if (event.type === "COLLISION_STARTED" && !this.frozen) this.onBump(event.impulse, event.point ?? this.position);
    });
  }

  get position() {
    return this.node.position;
  }

  forward() {
    return new Vector3(Math.sin(this.heading) * Math.cos(this.pitch), -Math.sin(this.pitch), Math.cos(this.heading) * Math.cos(this.pitch));
  }

  teleport(position: Vector3, heading: number) {
    this.node.position.copyFrom(position);
    this.heading = heading;
    this.pitch = 0;
    this.velocity.setAll(0);
    this.turnSpeed = this.pitchSpeed = 0;
    this.body.setLinearVelocity(Vector3.Zero());
    this.applyRotation();
  }

  /** `aimYaw`/`aimPitch`: where the view points; the hull follows it like a heavy thing does. */
  update(dt: number, controls: Controls, aimYaw: number, aimPitch: number, powered: boolean) {
    this.time += dt;
    const { tune } = this;
    const drive = powered ? controls.thrust : 0;
    const rise = powered ? controls.rise : 0;
    this.thrust += (Math.max(-1, Math.min(1, drive)) - this.thrust) * (1 - Math.exp(-dt * 2.6));

    const moving = Math.min(1, Math.abs(drive) + Math.abs(rise) * 0.4 + 0.45);
    let off = aimYaw - this.heading;
    off = Math.atan2(Math.sin(off), Math.cos(off));
    const spring = powered ? tune.num("turn_spring", 3.2) * moving : 0;
    this.turnSpeed += (off * spring - this.turnSpeed * tune.num("turn_damp", 3.1)) * dt;
    this.heading += this.turnSpeed * dt;
    const wantPitch = Math.max(-0.6, Math.min(0.7, (aimPitch - 0.12) * (Math.abs(drive) > 0.1 ? 0.85 : 0.15))) - rise * 0.1;
    this.pitchSpeed += ((wantPitch - this.pitch) * (powered ? 3.4 : 0.6) - this.pitchSpeed * 3) * dt;
    this.pitch += this.pitchSpeed * dt;

    if (this.frozen) {
      this.velocity.setAll(0);
      this.body.setLinearVelocity(Vector3.Zero());
    } else {
      this.body.getLinearVelocityToRef(this.velocity);
      const v = this.velocity;
      const f = this.forward();
      const push = tune.num("thrust", 5.2) * (this.thrust < 0 ? tune.num("reverse", 0.55) : 1) * this.thrust;
      v.addInPlace(f.scale(push * dt));
      v.y += rise * tune.num("lift", 4.6) * dt;
      if (!powered) v.y -= 0.25 * dt;
      const along = Vector3.Dot(v, f);
      const rest = v.subtract(f.scale(along));
      const sideDrag = Math.exp(-tune.num("drag_side", 1.25) * dt);
      const keep = f.scale(along * Math.exp(-tune.num("drag", 0.62) * dt));
      v.set(keep.x + rest.x * sideDrag, keep.y + rest.y * Math.exp(-tune.num("drag_vertical", 0.95) * dt), keep.z + rest.z * sideDrag);
      this.current(v, dt);
      this.body.setLinearVelocity(v);
    }
    this.applyRotation();

    this.roll += (-this.turnSpeed * 0.34 - this.roll) * (1 - Math.exp(-dt * 3));
    const idle = 1 - Math.min(1, this.velocity.length() / 4);
    this.hull.rotation.z = this.roll + Math.sin(this.time * 0.7) * 0.025 * idle;
    this.hull.rotation.x = Math.sin(this.time * 0.9 + 1) * 0.018 * idle;
    this.hull.position.y = Math.sin(this.time * 0.8) * 0.09 * idle;
    this.spin += (this.thrust * 24 + (powered ? 0.8 : 0)) * dt;
    this.prop.rotationQuaternion = Quaternion.RotationAxis(Vector3.Forward(), this.spin);
    this.glow.sea.glow = powered ? 2.4 : 0.15;
  }

  /** A gentle current keeps the hull inside the world, below the surface and off the void. */
  private current(v: Vector3, dt: number) {
    const p = this.position;
    if (p.y > TOP) v.y = Math.min(v.y, 0) - (p.y - TOP) * 6 * dt;
    const side = p.x - centerX(p.z);
    const limit = Math.min(112, halfWidth(p.z) + 26);
    if (Math.abs(side) > limit) v.x -= Math.sign(side) * Math.min(9, (Math.abs(side) - limit) * 1.4) * dt * 2;
    if (p.z < WORLD.minZ + 22) v.z += (WORLD.minZ + 22 - p.z) * 2 * dt;
    if (p.z > WORLD.maxZ - 26) v.z -= (p.z - WORLD.maxZ + 26) * 2 * dt;
    const floor = heightAt(p.x, p.z) + 1.0;
    if (p.y < floor - 1.5) {
      p.y = floor;
      v.y = Math.max(0, v.y);
    }
  }

  private applyRotation() {
    Quaternion.RotationYawPitchRollToRef(this.heading, this.pitch, 0, this.node.rotationQuaternion!);
    this.node.computeWorldMatrix(true);
  }
}
