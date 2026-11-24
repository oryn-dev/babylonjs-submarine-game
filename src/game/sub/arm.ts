import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";

const SHOULDER = new Vector3(0, -1.06, 1.35);
const UPPER = 1.1;
const LOWER = 1.02;
const REST = new Vector3(0.0, -1.35, 2.35);
const BASKET = new Vector3(0, -1.5, 0.1);

type Phase = "rest" | "reach" | "close" | "back";

/** Two telescoping links that bend to a target in hull space, and three claws. */
export class Arm {
  phase: Phase = "rest";
  private turret: TransformNode;
  private upper: TransformNode;
  private lower: TransformNode;
  private claws: TransformNode[] = [];
  private tip = REST.clone();
  private from = REST.clone();
  private t = 0;
  private grip = 0.35;
  private target: (() => Vector3) | null = null;
  private time = 1;
  private onClosed: () => void = () => {};
  private onStowed: () => void = () => {};

  constructor(scene: Scene, private hull: TransformNode, parts: Map<string, Mesh[]>) {
    const joint = (name: string, parent: TransformNode, meshes: Mesh[]) => {
      const node = new TransformNode(name, scene);
      node.parent = parent;
      node.rotationQuaternion = Quaternion.Identity();
      for (const mesh of meshes) {
        mesh.parent = node;
        mesh.position.setAll(0);
      }
      return node;
    };
    this.turret = joint("arm-turret", hull, parts.get("turret")!);
    this.turret.position.copyFrom(SHOULDER);
    this.upper = joint("arm-upper", hull, parts.get("upper")!);
    this.lower = joint("arm-lower", hull, parts.get("lower")!);
    const source = parts.get("claw")!;
    for (let i = 0; i < 3; i++) this.claws.push(joint(`arm-claw-${i}`, hull, i ? source.map((mesh) => mesh.clone(`claw-${i}`, null)) : source));
    this.pose();
  }

  get busy() {
    return this.phase !== "rest";
  }

  /** Where a held thing hangs, in the world. */
  hold() {
    return Vector3.TransformCoordinates(this.tip.add(new Vector3(0, -0.15, 0.25)), this.hull.getWorldMatrix());
  }

  /** `target` in world space, read every frame so the reach follows as the hull drifts. */
  reach(target: () => Vector3, seconds: number, onClosed: () => void, onStowed: () => void) {
    this.target = target;
    this.time = seconds;
    this.onClosed = onClosed;
    this.onStowed = onStowed;
    this.go("reach");
  }

  cancel() {
    if (this.phase !== "rest") this.go("back");
    this.onStowed = () => {};
    this.onClosed = () => {};
  }

  private go(phase: Phase) {
    this.phase = phase;
    this.from.copyFrom(this.tip);
    this.t = 0;
  }

  update(dt: number) {
    const ease = (t: number) => t * t * (3 - 2 * t);
    if (this.phase === "reach") {
      this.t += dt / this.time;
      const local = Vector3.TransformCoordinates(this.target!(), this.hull.getWorldMatrix().clone().invert());
      Vector3.LerpToRef(this.from, local, ease(Math.min(1, this.t)), this.tip);
      this.grip += (1 - this.grip) * Math.min(1, dt * 5);
      if (this.t >= 1) this.go("close");
    } else if (this.phase === "close") {
      this.t += dt / 0.28;
      this.tip.copyFrom(Vector3.TransformCoordinates(this.target!(), this.hull.getWorldMatrix().clone().invert()));
      this.grip += (0.12 - this.grip) * Math.min(1, dt * 14);
      if (this.t >= 1) {
        this.onClosed();
        this.go("back");
      }
    } else if (this.phase === "back") {
      this.t += dt / (this.time * 0.9);
      const k = ease(Math.min(1, this.t));
      const a = Vector3.Lerp(this.from, REST, Math.min(1, k * 1.6));
      Vector3.LerpToRef(a, BASKET, Math.max(0, k * 1.8 - 0.8), this.tip);
      if (this.t >= 1) {
        this.onStowed();
        this.go("rest");
      }
    } else {
      this.t = Math.min(1, this.t + dt / 0.6);
      Vector3.LerpToRef(this.from, REST, ease(this.t), this.tip);
      this.grip += (0.35 - this.grip) * Math.min(1, dt * 4);
    }
    this.pose();
  }

  private pose() {
    const reach = this.tip.subtract(SHOULDER);
    const length = Math.max(0.5, reach.length() - 0.35);
    const dir = reach.normalizeToNew();
    const wrist = SHOULDER.add(dir.scale(length));
    const stretch = Math.max(1, length / (UPPER + LOWER - 0.12));
    const a = UPPER * stretch;
    const b = LOWER * stretch;
    const cos = Math.max(-1, Math.min(1, (a * a + length * length - b * b) / (2 * a * length)));
    const side = Vector3.Cross(dir, Vector3.Up());
    if (side.lengthSquared() < 1e-4) side.set(1, 0, 0);
    side.normalize();
    const bend = Quaternion.RotationAxis(side, Math.acos(cos));
    const upDir = new Vector3();
    dir.rotateByQuaternionToRef(bend, upDir);
    const alternative = new Vector3();
    dir.rotateByQuaternionToRef(Quaternion.Inverse(bend), alternative);
    if (alternative.y > upDir.y) upDir.copyFrom(alternative);
    const elbow = SHOULDER.add(upDir.scale(a));
    const point = (node: TransformNode, at: Vector3, towards: Vector3, scale: number) => {
      node.position.copyFrom(at);
      Quaternion.FromLookDirectionLHToRef(towards.subtract(at).normalize(), Vector3.Up(), node.rotationQuaternion!);
      node.scaling.z = scale;
    };
    this.turret.rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), Math.atan2(dir.x, dir.z));
    point(this.upper, SHOULDER, elbow, stretch);
    point(this.lower, elbow, wrist, stretch);
    const base = Quaternion.FromLookDirectionLH(dir, Vector3.Up());
    this.claws.forEach((claw, i) => {
      claw.position.copyFrom(wrist);
      claw.rotationQuaternion = base.multiply(Quaternion.RotationAxis(Vector3.Forward(), (i * Math.PI * 2) / 3)).multiply(Quaternion.RotationAxis(Vector3.Right(), -this.grip * 0.9));
    });
  }
}
