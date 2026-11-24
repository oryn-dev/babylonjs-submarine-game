import { TargetCamera } from "@babylonjs/core/Cameras/targetCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { PhysicsRaycastResult } from "@babylonjs/core/Physics/physicsRaycastResult";
import type { PhysicsEngine } from "@babylonjs/core/Physics/v2/physicsEngine";
import type { Scene } from "@babylonjs/core/scene";
import type { Tune } from "./data/tune";
import { heightAt } from "./world/height";

export const MASK_WORLD = 1;
export const MASK_SUB = 2;

/** Behind the submarine, on a soft arm that shortens before walls. */
export class ChaseCamera {
  readonly camera: TargetCamera;
  yaw = 0;
  pitch = 0.12;
  private reach = 10;
  private focus = new Vector3();
  private shakeAmount = 0;
  private hit = new PhysicsRaycastResult();
  /** A fixed shot for menus and the ending: position and target, blended in by `cut`. */
  shot: { from: Vector3; to: Vector3 } | null = null;
  private cut = 0;
  private shotFrom = new Vector3();
  private shotTo = new Vector3();

  constructor(private scene: Scene, private tune: Tune) {
    this.camera = new TargetCamera("camera", new Vector3(0, -12, -20), scene);
    this.camera.minZ = 0.35;
    this.camera.maxZ = 230;
    this.camera.fov = 0.95;
    scene.activeCamera = this.camera;
  }

  shake(amount: number) {
    this.shakeAmount = Math.min(1.2, this.shakeAmount + amount);
  }

  jump(position: Vector3) {
    this.focus.copyFrom(position);
  }

  update(dt: number, sub: Vector3, velocity: Vector3, portrait: boolean) {
    this.pitch = Math.min(1.1, Math.max(-0.75, this.pitch));
    const follow = 1 - Math.exp(-dt * 7);
    this.focus.x += (sub.x - this.focus.x) * follow;
    this.focus.y += (sub.y - this.focus.y) * follow;
    this.focus.z += (sub.z - this.focus.z) * follow;
    const dir = new Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), -Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
    const head = this.focus.add(new Vector3(0, this.tune.num("camera_height", 2.7), 0));
    const speed = velocity.length();
    const want = this.tune.num("camera_distance", 10.5) + speed * 0.22 + (portrait ? 3 : 0);
    const end = head.subtract(dir.scale(want));
    let free = want;
    const physics = this.scene.getPhysicsEngine() as PhysicsEngine | null;
    if (physics) {
      physics.raycastToRef(head, end, this.hit, { collideWith: MASK_WORLD });
      if (this.hit.hasHit) free = Math.max(3.4, this.hit.hitDistance - 0.6);
    }
    this.reach += (free - this.reach) * (1 - Math.exp(-dt * (free < this.reach ? 14 : 2.5)));
    const eye = head.subtract(dir.scale(this.reach));
    eye.y = Math.min(-1.1, Math.max(eye.y, heightAt(eye.x, eye.z) + 0.8));
    const aim = head.add(dir.scale(9));
    this.shakeAmount *= Math.exp(-dt * 5);
    const s = this.shakeAmount;
    const t = performance.now() / 1000;
    eye.x += Math.sin(t * 41) * s * 0.18 + Math.sin(t * 0.9) * 0.05;
    eye.y += Math.sin(t * 37) * s * 0.2 + Math.sin(t * 0.7) * 0.07;
    aim.x += Math.sin(t * 33) * s * 0.3;

    if (this.shot) {
      this.shotFrom.copyFrom(this.shot.from);
      this.shotTo.copyFrom(this.shot.to);
    }
    this.cut += ((this.shot ? 1 : 0) - this.cut) * (1 - Math.exp(-dt * 1.7));
    if (this.cut > 0.002) {
      const k = this.cut * this.cut * (3 - 2 * this.cut);
      Vector3.LerpToRef(eye, this.shotFrom, k, eye);
      Vector3.LerpToRef(aim, this.shotTo, k, aim);
    }
    this.camera.position.copyFrom(eye);
    this.camera.setTarget(aim);
    this.camera.fov = 0.95 + Math.min(0.06, speed * 0.006) + (portrait ? 0.22 : 0);
  }
}
