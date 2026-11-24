import { centerX } from "../world/height";

export type CargoKind = "crate" | "barrel" | "chest" | "canister" | "engine" | "bell" | "case" | "core" | "safe" | "amphora";

/** [kind, x, y, z] in the wreck's own axes: x starboard, y up, z towards the bow. */
export type CargoSpot = [CargoKind, number, number, number];

export interface Wreck {
  id: string;
  name: string;
  model: string;
  x: number;
  z: number;
  /** Floor depth of its flat spot, that spot's radius, and how high the model's origin sits above it. */
  depth: number;
  pad: number;
  lift: number;
  yaw: number;
  pitch?: number;
  roll?: number;
  cargo: CargoSpot[];
  /** Where the logbook lies. */
  log: [number, number, number];
  page: { title: string; date: string; text: string };
}

const at = (dx: number, z: number) => ({ x: centerX(z) + dx, z });

export const WRECKS: Wreck[] = [
  {
    id: "marigold", name: "Marigold", model: "marigold", ...at(7, 24), depth: 18, pad: 12, lift: 1.7, yaw: -62, roll: 13, pitch: -3,
    cargo: [["crate", 5.8, -1.2, 4.6], ["crate", -0.4, 0.75, 2.4], ["canister", -4.2, -1.2, -3.4], ["barrel", 1.2, 0.5, -1.4], ["amphora", -5.6, -1.1, 4.8]],
    log: [4.4, -1.1, -5],
    page: { title: "Net log of the Marigold", date: "9 March", text: "Third night of lamps under the water north of the kelp. Not boats. They blink, wait, and something far below blinks back. Emil wants to follow them. The nets came up empty, so I let him." },
  },
  {
    id: "kittiwake", name: "Kittiwake", model: "kittiwake", ...at(-10, 128), depth: 44, pad: 14, lift: 2.2, yaw: 205, pitch: -9, roll: -8,
    cargo: [["case", 0.2, 1.3, 0.4], ["crate", 5.4, -1.4, -3], ["canister", -6, -1.5, 5.5], ["chest", 3.4, -1.5, 8.2], ["barrel", -3.2, -1.4, -6.6], ["case", 7.6, -1.3, 3.8]],
    log: [-1.6, -1.2, 9.2],
    page: { title: "Pilot's notes, flying boat Kittiwake", date: "2 April", text: "Delivered six months of film and tea to the people of Lantern Station. They asked me to fly home with my lights off. \"It thinks you are talking to it,\" the doctor said. I kept them on. I wanted to see." },
  },
  {
    id: "verena", name: "Saint Verena", model: "verena", ...at(-36, 232), depth: 84, pad: 20, lift: 4.6, yaw: 24, roll: -11,
    cargo: [["chest", 0.3, -3.6, 1], ["bell", -0.4, -0.2, 8.6], ["amphora", 1.6, -3.6, -4], ["chest", 7.4, -4, -3.5], ["amphora", -6.4, -4, 7], ["safe", -0.6, -3.4, -8]],
    log: [9.4, -4, 4.6],
    page: { title: "Master's journal, Saint Verena", date: "1871, the autumn crossing", text: "The whole watch saw it: a constellation under the keel, as long as four ships, turning with us all night. No one was afraid. At dawn it sank away, and the men stood at the rail a long while, as one does when a friend has left." },
  },
  {
    id: "halden", name: "Halden Star", model: "halden", ...at(22, 276), depth: 91, pad: 38, lift: 8.6, yaw: 152,
    cargo: [["engine", 1.6, -6.6, 13.2], ["safe", -2.4, -6.8, 19], ["barrel", -6.5, -7.6, 1], ["crate", 4.6, -7.6, -0.5], ["engine", 4.4, -5.6, -14.6], ["bell", 3.6, 8.9, -26], ["barrel", 12.5, -7.6, -8], ["case", 3, 2.6, -21.5], ["safe", -12, -7.6, 16]],
    log: [10.5, -7.6, 7],
    page: { title: "Bridge log of the Halden Star", date: "14 November", text: "Cargo for Lantern: lamps, four hundred of them, and one sealed power core. The sea fell flat and the plates began to sing. She broke on her own weight, not on anything else. We were in the boats when we saw it lift the bow section, gently, and set it down." },
  },
  {
    id: "perch", name: "Old Perch", model: "perch", ...at(-22, 321), depth: 100, pad: 11, lift: 1.1, yaw: 70, roll: 24, pitch: 6,
    cargo: [["canister", 3.4, -0.6, 1.5], ["case", -3.2, -0.6, -2], ["engine", 1.6, -0.4, -4.8], ["core", -3.6, -0.2, 4]],
    log: [2.8, -0.7, 4.8],
    page: { title: "Last dive card, salvage boat Perch", date: "20 November", text: "Number six of our line, same yard as yours. Took the crew of Lantern up, all nine, two at a time. Battery gone on the last run, so I left her here and swam the final rope. Station has no light now. Somebody should go and turn it on again." },
  },
  {
    id: "bell", name: "Relay Bell", model: "bell", ...at(6, 388), depth: 178, pad: 13, lift: 0.1, yaw: 30, roll: 4,
    cargo: [["core", 4.6, 0.6, 2], ["canister", -5, 0.5, 4], ["safe", -3.8, 0.6, -5.4], ["case", 6, 0.5, -5]],
    log: [0.6, 0.6, 6.4],
    page: { title: "Doctor Aune's tape, relay bell", date: "no date", text: "We blink, it answers. Never the same phrase, always the same length as ours. I believe it has been saying hello for a very long time, to every lantern that ever crossed over it. If you hear this: switch ours on." },
  },
];

export const STATION = { ...at(0, 458), depth: 229, pad: 34, yaw: 180 };

/** Cargo loose on the floor, [kind, offset from the middle, z]. */
export const LOOSE: [CargoKind, number, number][] = [
  ["amphora", -24, 8], ["crate", 30, 42], ["barrel", -32, 54], ["crate", -10, 72],
  ["canister", 22, 100], ["barrel", -30, 108], ["chest", 28, 146], ["case", -26, 160], ["barrel", 8, 178],
  ["engine", 44, 222], ["barrel", -8, 208], ["safe", -58, 262], ["chest", 2, 300], ["canister", 52, 306],
  ["case", 14, 350], ["chest", -14, 372], ["core", 20, 408], ["safe", -24, 432], ["core", 30, 478],
  // The first find, right ahead of where a new game starts.
  ["crate", -2.6, 13.5],
];

/** The Marlin at the surface, with the cradle hanging below. */
export const SHIP = { x: 0, z: -20, cradle: 9.2 };
