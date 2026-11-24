import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Cargo, Item, Page } from "./cargo";
import type { Tune } from "./data/tune";
import { WRECKS } from "./data/wrecks";
import type { Save } from "./progress";
import type { Sound } from "./sound";
import type { World } from "./world/world";

export interface DiveEvents {
  stored(item: Item): void;
  page(page: Page): void;
  note(text: string, kind?: "plain" | "gain" | "bad"): void;
  lost(reason: string): void;
  hurt(amount: number): void;
}

/** The rules of one dive: power, hull, sonar, the arm and the hold. */
export class Dive {
  power = 1;
  hull = 1;
  readonly hold: Item[] = [];
  over = false;
  private charge = 1;
  private cooldown = 0;
  private pinged = 99;
  private origin = new Vector3();
  private fading = 0;
  private reaching: Item | null = null;

  constructor(private world: World, private save: Save, private tune: Tune, private sound: Sound, private events: DiveEvents) {}

  private get cargo(): Cargo {
    return this.world.cargo;
  }

  get used() {
    return this.hold.reduce((sum, item) => sum + item.stats.slots, 0);
  }

  get value() {
    return this.hold.reduce((sum, item) => sum + item.stats.value, 0);
  }

  get limit() {
    return this.save.stat("hull");
  }

  get busy() {
    return this.reaching !== null;
  }

  begin() {
    this.power = this.charge = this.hull = 1;
    this.over = false;
    this.hold.length = 0;
    this.reaching = null;
    this.pinged = 99;
    this.world.water.ping[3] = -1;
  }

  /** Puts the finds back where they lay. */
  drop() {
    for (const item of this.hold) {
      item.state = "lying";
      this.cargo.lay(item);
    }
    this.hold.length = 0;
    this.release();
  }

  release() {
    this.world.sub.arm.cancel();
    if (this.reaching && this.reaching.state !== "stowed") {
      this.reaching.state = "lying";
      this.cargo.lay(this.reaching);
    }
    this.reaching = null;
  }

  sell() {
    const sold = this.hold.map((item) => ({ name: item.stats.name, value: item.stats.value }));
    for (const item of this.hold) {
      item.state = "sold";
      this.save.data.sold.push(item.id);
    }
    const total = this.value;
    this.save.data.credits += total;
    this.save.data.earned += total;
    this.hold.length = 0;
    return { sold, total };
  }

  ping() {
    if (this.cooldown > 0 || this.over) return false;
    this.cooldown = this.tune.num("sonar_cooldown", 2.2);
    this.charge -= this.tune.num("drain_ping", 1) / this.save.stat("battery");
    this.pinged = 0;
    this.origin.copyFrom(this.world.sub.position);
    this.sound.play("ping", 0.75);
    return true;
  }

  /** The find the arm would take now, and why it could not. */
  candidate() {
    const { sub } = this.world;
    const item = this.cargo.nearest(sub.position, sub.forward(), this.save.stat("arm"));
    if (!item) return null;
    const tooHeavy = item.stats.arm > this.save.data.levels.arm;
    const full = this.used + item.stats.slots > this.save.stat("hold");
    return { item, tooHeavy, full };
  }

  grab() {
    if (this.reaching || this.over) return false;
    const found = this.candidate();
    if (!found) return false;
    if (found.tooHeavy || found.full) {
      this.sound.play("deny", 0.6);
      this.events.note(found.full ? "The hold is full" : `Too heavy for arm level ${this.save.data.levels.arm}`, "bad");
      return false;
    }
    const { item } = found;
    const { sub } = this.world;
    this.reaching = item;
    const seconds = 1.15 - this.save.data.levels.arm * 0.15;
    sub.arm.reach(() => item.mesh.position, seconds, () => {
      item.state = "held";
      this.sound.play("grab", 0.8);
      this.world.effects.burst(item.home, 14, 10);
    }, () => {
      item.state = "stowed";
      item.mesh.setEnabled(false);
      this.hold.push(item);
      this.reaching = null;
      this.sound.play("clunk", 0.6);
      this.world.effects.burst(sub.position.add(new Vector3(0, -1.4, 0)), 10);
      this.events.stored(item);
    });
    return true;
  }

  update(dt: number, active: boolean) {
    const { water, sub } = this.world;
    const depth = -sub.position.y;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.sonar(dt, depth);
    this.carry(dt);
    if (!active || this.over) return;

    const capacity = this.save.stat("battery");
    const lamps = water.depth > 30 ? this.tune.num("drain_lights", 0.1) : 0;
    this.charge -= ((this.tune.num("drain_idle", 0.2) + Math.abs(sub.thrust) * this.tune.num("drain_thrust", 0.42) + lamps) * dt) / capacity;
    this.power = Math.max(0, this.charge);
    const over = depth - this.limit;
    if (over > 0) this.damage(((this.tune.num("crush_damage", 3.2) + (over / 10) * this.tune.num("crush_growth", 1.6)) / 100) * dt, true);
    this.readPages();
    if (this.power <= 0 || this.hull <= 0) {
      this.fading += dt;
      if (this.fading > (this.hull <= 0 ? 0.6 : 2.6)) {
        this.over = true;
        this.fading = 0;
        this.events.lost(this.hull <= 0 ? "The hull gave out" : "Out of power");
      }
    } else this.fading = 0;
  }

  bump(speed: number, point: Vector3) {
    const hard = speed - this.tune.num("impact_speed", 2.6);
    this.world.effects.burst(point, Math.min(26, 4 + speed * 4), Math.min(16, speed * 3));
    if (speed > 0.8) this.sound.play("thud", Math.min(0.9, 0.12 + speed * 0.13), 0.9 + Math.random() * 0.2);
    if (hard > 0) this.damage((hard * this.tune.num("impact_damage", 4.5)) / 100);
  }

  private damage(amount: number, slow = false) {
    this.hull = Math.max(0, this.hull - amount);
    if (!slow) this.events.hurt(amount);
  }

  private sonar(dt: number, depth: number) {
    const range = this.save.stat("sonar");
    const before = this.pinged;
    this.pinged += dt * this.tune.num("sonar_speed", 42);
    const { ping, misc } = this.world.water;
    ping[0] = this.origin.x;
    ping[1] = this.origin.y;
    ping[2] = this.origin.z;
    const shown = this.pinged < range + 30;
    ping[3] = shown ? this.pinged : -1;
    misc[0] = shown ? Math.max(0, 1 - Math.max(0, this.pinged - range) / 30) * (0.75 + Math.min(0.45, depth / 180)) : 0;
    if (before > range) return;
    const hold = this.tune.num("sonar_hold", 16);
    for (const item of this.cargo.items) {
      if (item.state !== "lying") continue;
      const d = Vector3.Distance(item.home, this.origin);
      if (d > before && d <= Math.min(range, this.pinged)) {
        item.marked = hold;
        this.sound.play("contact", 0.28, 0.9 + (1 - d / range) * 0.4);
      }
    }
    for (const page of this.cargo.pages) {
      const d = Vector3.Distance(page.position, this.origin);
      if (!page.found && d > before && d <= Math.min(range, this.pinged)) page.marked = hold;
    }
  }

  private carry(dt: number) {
    const item = this.reaching;
    if (!item || item.state !== "held") return;
    const to = this.world.sub.arm.hold();
    Vector3.LerpToRef(item.mesh.position, to, 1 - Math.exp(-dt * 24), item.mesh.position);
    const size = item.mesh.scaling.x;
    item.mesh.scaling.setAll(size + (0.5 - size) * (1 - Math.exp(-dt * 1.6)));
  }

  private readPages() {
    for (const page of this.cargo.pages) {
      if (page.found || Vector3.Distance(page.position, this.world.sub.position) > 4.6) continue;
      page.found = true;
      page.mesh.setEnabled(false);
      this.save.data.pages.push(page.wreck);
      this.events.page(page);
    }
  }

  /** The nearest wreck whose page is still missing, for the guiding signal. */
  signal() {
    let best: Page | null = null;
    let gap = Infinity;
    for (const page of this.cargo.pages) {
      if (page.found) continue;
      const depth = WRECKS.find((w) => w.id === page.wreck)!.depth;
      const d = Vector3.Distance(page.position, this.world.sub.position) + Math.max(0, depth - this.limit) * 6;
      if (d < gap) [gap, best] = [d, page];
    }
    return best;
  }
}
