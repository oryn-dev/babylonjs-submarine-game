/** The shape of the sea floor. Depth grows along +z; every zone has its own floor, edges and colours. */
const hash = (x: number, y: number) => {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
};

export function noise2(x: number, y: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  return (hash(xi, yi) * (1 - u) + hash(xi + 1, yi) * u) * (1 - v) + (hash(xi, yi + 1) * (1 - u) + hash(xi + 1, yi + 1) * u) * v;
}

export const fbm = (x: number, y: number) => noise2(x, y) * 0.5 + noise2(x * 2.03 + 7, y * 2.03 + 3) * 0.27 + noise2(x * 4.1 + 1, y * 4.1 + 9) * 0.15 + noise2(x * 8.3, y * 8.3 + 5) * 0.08;

export const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

type Row = [z: number, floor: number, half: number, rough: number];

/** z, floor depth, half width of the open part, height of the bumps. */
const PROFILE: Row[] = [
  [-90, 3, 30, 3], [-55, 12, 60, 3], [-25, 18, 74, 4], [20, 19, 78, 4], [60, 24, 74, 6], [90, 33, 66, 6], [125, 42, 64, 5], [165, 53, 66, 6],
  [190, 70, 72, 6], [215, 80, 88, 4], [300, 93, 92, 5], [322, 101, 74, 6], [338, 128, 46, 8], [356, 150, 40, 7], [385, 176, 42, 8], [402, 204, 46, 7],
  [430, 226, 58, 4], [480, 230, 64, 4], [505, 222, 50, 8], [530, 150, 20, 10],
];

function row(z: number) {
  let i = 0;
  while (i < PROFILE.length - 2 && PROFILE[i + 1][0] < z) i++;
  const a = PROFILE[i];
  const b = PROFILE[i + 1];
  const t = smooth(a[0], b[0], z);
  return { floor: a[1] + (b[1] - a[1]) * t, half: a[2] + (b[2] - a[2]) * t, rough: a[3] + (b[3] - a[3]) * t };
}

export const centerX = (z: number) => 16 * Math.sin(z * 0.013) * smooth(30, 120, z) - 10 * smooth(330, 400, z) * Math.sin((z - 330) * 0.03);

/** Flat spots kept clear for wrecks: x, z, radius, floor depth. */
const PADS: [number, number, number, number][] = [];
export const addPad = (x: number, z: number, radius: number, depth: number) => PADS.push([x, z, radius, depth]);

/** Height (negative depth) of the floor. */
export function heightAt(x: number, z: number) {
  const { floor, half, rough } = row(z);
  const side = Math.abs(x - centerX(z)) / half;
  const n = fbm(x * 0.045 + 20, z * 0.045 + 8);
  const dunes = fbm(x * 0.017 + 3, z * 0.017 + 31);
  let y = -floor + (n - 0.5) * rough * 1.5 + (dunes - 0.5) * rough * 1.2;
  const wall = smooth(0.72, 1.35, side + (n - 0.5) * 0.35);
  const ridge = Math.abs(fbm(x * 0.03 + 50, z * 0.03) - 0.5) * 2;
  y += wall * (floor * 0.74 + 4) * (0.8 + ridge * 0.4);
  // Ledges on steep ground.
  const step = 5.5;
  const ledge = (Math.floor(y / step) + smooth(0.25, 0.75, y / step - Math.floor(y / step))) * step;
  y += (ledge - y) * 0.55 * wall;
  for (const [px, pz, radius, depth] of PADS) {
    const d = Math.hypot(x - px, z - pz);
    if (d < radius * 1.6) y += (-depth + (n - 0.5) * 0.8 - y) * (1 - smooth(radius * 0.75, radius * 1.6, d));
  }
  return Math.min(y, -2.2);
}

export function normalAt(x: number, z: number, e = 1) {
  const nx = heightAt(x - e, z) - heightAt(x + e, z);
  const nz = heightAt(x, z - e) - heightAt(x, z + e);
  const l = Math.hypot(nx, 2 * e, nz);
  return { x: nx / l, y: (2 * e) / l, z: nz / l };
}

export const halfWidth = (z: number) => row(z).half;
export const WORLD = { minX: -130, maxX: 130, minZ: -78, maxZ: 524 };

export const ZONES = [
  { id: "reef", name: "Coral Reef", depth: 0 },
  { id: "kelp", name: "Kelp Forest", depth: 32 },
  { id: "wrecks", name: "Wreck Field", depth: 68 },
  { id: "trench", name: "The Trench", depth: 112 },
] as const;

export function zoneAt(depth: number) {
  let i = 0;
  while (i < ZONES.length - 1 && depth >= ZONES[i + 1].depth) i++;
  return i;
}
