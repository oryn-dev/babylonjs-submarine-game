import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { ChaseCamera } from "./camera";
import { STATION } from "./data/wrecks";
import type { Sound } from "./sound";
import type { World } from "./world/world";

/** The submarine docks, the lantern wakes, and the giant comes to answer. */
export class Ending {
  private time = -1;
  private from = new Vector3();
  private turn = 0;
  private called = 0;
  private done: () => void = () => {};
  private shown = false;

  constructor(private world: World, private chase: ChaseCamera, private sound: Sound) {}

  play(done: () => void) {
    this.time = 0;
    this.called = 0;
    this.shown = false;
    this.done = done;
    this.from.copyFrom(this.world.sub.position);
    this.turn = this.world.sub.heading;
    this.sound.play("dock", 0.9);
  }

  leave() {
    this.time = -1;
    this.chase.shot = null;
    this.chase.yaw = this.world.sub.heading;
  }

  update(dt: number) {
    if (this.time < 0) return;
    this.time += dt;
    const { sub, wrecks, leviathan, effects } = this.world;
    const k = Math.min(1, this.time / 4);
    const e = k * k * (3 - 2 * k);
    const turn = Math.atan2(Math.sin(this.turn), Math.cos(this.turn));
    if (k < 1) sub.teleport(Vector3.Lerp(this.from, wrecks.collar().add(new Vector3(0, 0, -1)), e), turn * (1 - e));
    if (this.called === 0 && this.time > 3.6) {
      this.called = 1;
      this.sound.play("clunk", 1);
      effects.burst(wrecks.collar(), 40, 20);
      this.chase.shake(0.4);
    }
    // Lamps come on in steps, then steady.
    const wake = Math.max(0, this.time - 4.6);
    const flicker = wake < 2.2 ? (Math.sin(wake * 23) > 0.2 ? 0.25 : 0.04) * Math.min(1, wake) : Math.min(1, 0.3 + (wake - 2.2) * 0.3);
    wrecks.power = wake > 0 ? flicker : 0;
    if (this.called === 1 && wake > 2.2) {
      this.called = 2;
      this.sound.play("upgrade", 0.6, 0.6);
      leviathan.greeting = true;
    }
    if (this.called === 2 && wake > 5) {
      this.called = 3;
      this.sound.play("call1", 1);
    }
    if (this.called === 3 && wake > 10.5) {
      this.called = 4;
      this.sound.play("call2", 1);
    }
    const { x, z } = STATION;
    const y = -STATION.depth;
    const a = -2.0 + this.time * 0.055;
    const r = 30 + Math.min(22, this.time * 1.5);
    if (this.time < 5) this.chase.shot = { from: sub.position.add(new Vector3(8, 3.5, -8)), to: sub.position.add(new Vector3(0, 1, 5)) };
    else this.chase.shot = { from: new Vector3(x + Math.cos(a) * r, y + 14 + Math.min(8, this.time * 0.4), z + Math.sin(a) * r), to: new Vector3(x, y + 17, z) };
    if (!this.shown && wake > 13) {
      this.shown = true;
      this.done();
    }
  }
}
