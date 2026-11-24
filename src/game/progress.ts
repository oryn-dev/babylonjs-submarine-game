import { saves } from "../oryn/saves";
import { MAX_LEVEL, UPGRADE_IDS, type Tune, type UpgradeId } from "./data/tune";

export interface Progress {
  credits: number;
  earned: number;
  levels: Record<UpgradeId, number>;
  sold: string[];
  pages: string[];
  dives: number;
  deepest: number;
  seconds: number;
  finished: boolean;
  /** How far the first dive's tips got. */
  lesson: number;
}

const SLOT = "main";

export class Save {
  data: Progress;

  constructor(private tune: Tune) {
    this.data = this.fresh();
  }

  fresh(): Progress {
    return { credits: this.tune.num("start_credits", 0), earned: 0, levels: { hull: 0, battery: 0, lights: 0, sonar: 0, arm: 0, hold: 0 }, sold: [], pages: [], dives: 0, deepest: 0, seconds: 0, finished: false, lesson: 0 };
  }

  /** True when there was progress to continue. */
  async load() {
    try {
      const stored = await Promise.race([saves.load<Partial<Progress>>(SLOT), new Promise<null>((done) => setTimeout(() => done(null), 3500))]);
      if (!stored || typeof stored !== "object") return false;
      const base = this.fresh();
      this.data = { ...base, ...stored, levels: { ...base.levels, ...stored.levels } };
      for (const id of UPGRADE_IDS) this.data.levels[id] = Math.min(MAX_LEVEL, Math.max(0, Math.floor(this.data.levels[id]) || 0));
      return this.data.dives > 0 || this.data.lesson > 0;
    } catch {
      return false;
    }
  }

  store() {
    void saves.save(SLOT, this.data).catch(() => undefined);
  }

  reset() {
    this.data = this.fresh();
    this.store();
  }

  stat(id: UpgradeId) {
    return this.tune.stat(id, this.data.levels[id]);
  }

  nextCost(id: UpgradeId) {
    const next = this.data.levels[id] + 1;
    return next > MAX_LEVEL ? null : this.tune.cost(id, next);
  }

  buy(id: UpgradeId) {
    const cost = this.nextCost(id);
    if (cost === null || cost > this.data.credits) return false;
    this.data.credits -= cost;
    this.data.levels[id]++;
    this.store();
    return true;
  }
}
