import { Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import "@babylonjs/core/Particles/particleSystemComponent";
import type { Scene } from "@babylonjs/core/scene";
import { bubbleTexture, puffTexture } from "../gfx/textures";
import type { Water } from "../gfx/water";
import { heightAt } from "../world/height";
import type { Submarine } from "./sub";

/** Bubbles behind the propeller, silt near the floor, and bursts where something happens. */
export class Effects {
  private wake: ParticleSystem;
  private silt: ParticleSystem;
  private burstBubbles: ParticleSystem;
  private burstSilt: ParticleSystem;

  constructor(scene: Scene, private water: Water) {
    const bubble = bubbleTexture(scene);
    const puff = puffTexture(scene);
    this.wake = this.system(scene, "wake", 260, bubble);
    this.wake.minLifeTime = 0.8;
    this.wake.maxLifeTime = 2.2;
    this.wake.minSize = 0.05;
    this.wake.maxSize = 0.2;
    this.wake.gravity.set(0, 1.6, 0);
    this.silt = this.system(scene, "silt", 120, puff);
    this.silt.minLifeTime = 1.6;
    this.silt.maxLifeTime = 3.4;
    this.silt.minSize = 1.2;
    this.silt.maxSize = 2.6;
    this.silt.addSizeGradient(0, 0.5, 0.9);
    this.silt.addSizeGradient(1, 2.6, 4.2);
    this.silt.minAngularSpeed = -0.5;
    this.silt.maxAngularSpeed = 0.5;
    this.burstBubbles = this.system(scene, "burst-bubbles", 160, bubble);
    this.burstBubbles.minLifeTime = 0.7;
    this.burstBubbles.maxLifeTime = 2.4;
    this.burstBubbles.minSize = 0.05;
    this.burstBubbles.maxSize = 0.26;
    this.burstBubbles.gravity.set(0, 2.4, 0);
    this.burstSilt = this.system(scene, "burst-silt", 60, puff);
    this.burstSilt.minLifeTime = 1.2;
    this.burstSilt.maxLifeTime = 2.8;
    this.burstSilt.addSizeGradient(0, 0.4, 0.8);
    this.burstSilt.addSizeGradient(1, 2, 3.4);
  }

  private system(scene: Scene, name: string, capacity: number, texture: ReturnType<typeof bubbleTexture>) {
    const p = new ParticleSystem(name, capacity, scene);
    p.particleTexture = texture;
    p.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    p.emitRate = 0;
    p.emitter = Vector3.Zero();
    p.updateSpeed = 1 / 60;
    p.minEmitBox = new Vector3(-0.3, -0.3, -0.3);
    p.maxEmitBox = new Vector3(0.3, 0.3, 0.3);
    p.direction1 = new Vector3(-0.5, -0.2, -0.5);
    p.direction2 = new Vector3(0.5, 0.6, 0.5);
    p.minEmitPower = 0.4;
    p.maxEmitPower = 1.4;
    p.start();
    return p;
  }

  burst(at: Vector3, bubbles: number, silt = 0) {
    (this.burstBubbles.emitter as Vector3).copyFrom(at);
    this.burstBubbles.manualEmitCount = bubbles;
    if (!silt) return;
    (this.burstSilt.emitter as Vector3).copyFrom(at);
    this.burstSilt.manualEmitCount = silt;
  }

  update(dt: number, sub: Submarine, powered: boolean) {
    const speed = Math.max(0.2, 1 - this.water.darkness * 0.75);
    const light = this.water.zenith;
    const lit = 0.16 + this.water.darkness * 0.1;
    const bubble = (alpha: number) => new Color4(light[0] * 0.8 + 0.25 * speed + lit, light[1] * 0.8 + 0.25 * speed + lit, light[2] * 0.8 + 0.25 * speed + lit, alpha);
    for (const p of [this.wake, this.burstBubbles]) {
      p.color1 = bubble(0.75);
      p.color2 = bubble(0.45);
      p.colorDead = bubble(0);
      p.updateSpeed = dt;
    }
    const sand = (alpha: number) => new Color4(this.water.horizon[0] * 0.9 + 0.2 * speed + 0.07, this.water.horizon[1] * 0.7 + 0.18 * speed + 0.065, this.water.horizon[2] * 0.6 + 0.12 * speed + 0.05, alpha);
    for (const p of [this.silt, this.burstSilt]) {
      p.color1 = sand(0.5);
      p.color2 = sand(0.3);
      p.colorDead = sand(0);
      p.updateSpeed = dt;
    }
    const f = sub.forward();
    const push = powered ? Math.abs(sub.thrust) : 0;
    (this.wake.emitter as Vector3).copyFrom(sub.position).subtractInPlace(f.scale(3.2));
    this.wake.emitRate = push * 85 + (powered ? 2 : 0);
    const back = f.scale(-Math.sign(sub.thrust || 1) * (1.5 + push * 2.5));
    this.wake.direction1 = back.add(new Vector3(-0.5, -0.4, -0.5));
    this.wake.direction2 = back.add(new Vector3(0.5, 0.6, 0.5));

    const p = sub.position;
    const floor = heightAt(p.x, p.z);
    const above = p.y - floor;
    const stir = Math.max(0, 1 - (above - 1) / 4.2) * Math.min(1, sub.velocity.length() / 4 + push * 0.5);
    this.silt.emitRate = stir * 26;
    (this.silt.emitter as Vector3).set(p.x - f.x * 2.6, floor + 0.4, p.z - f.z * 2.6);
    this.silt.minEmitBox.set(-1.2, 0, -1.2);
    this.silt.maxEmitBox.set(1.2, 0.3, 1.2);
  }
}
