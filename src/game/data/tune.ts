import type { Tuning } from "../../oryn/tuning";
import type { CargoKind } from "./wrecks";

export type UpgradeId = "hull" | "battery" | "lights" | "sonar" | "arm" | "hold";
export const UPGRADE_IDS: UpgradeId[] = ["hull", "battery", "lights", "sonar", "arm", "hold"];
export const MAX_LEVEL = 3;

export interface CargoStats {
  name: string;
  value: number;
  slots: number;
  /** Arm level needed, 0 to 3. */
  arm: number;
}

const CARGO_NAMES: Record<CargoKind, string> = {
  crate: "Supply crate", barrel: "Sealed drum", chest: "Sea chest", canister: "Gas flask", engine: "Aero engine",
  bell: "Ship's bell", case: "Instrument case", core: "Power core", safe: "Strongbox", amphora: "Old amphora",
};

/** Every gameplay number, read from game/tuning.json. */
export class Tune {
  constructor(private tuning: Tuning) {}

  num(id: string, fallback: number) {
    return this.tuning.number(id, fallback);
  }

  stat(id: UpgradeId, level: number) {
    return this.num(`${id}_${level}`, 1);
  }

  cost(id: UpgradeId, next: number) {
    return this.num(`${id}_cost_${next}`, 100 * next);
  }

  cargo(kind: CargoKind): CargoStats {
    return { name: CARGO_NAMES[kind], value: this.num(`${kind}_value`, 100), slots: this.num(`${kind}_slots`, 1), arm: this.num(`${kind}_arm`, 0) };
  }
}
