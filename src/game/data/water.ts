import { Color3 } from "@babylonjs/core/Maths/math.color";

const c = (hex: string) => Color3.FromHexString(hex).toLinearSpace();

/** The look of the water by camera depth in metres; between two stops everything blends. */
export const WATER_STOPS = [
  { depth: 0, zenith: c("#b8fbf2"), horizon: c("#2ab4bd"), abyss: c("#0a6f88"), density: 0.02, absorb: [0.022, 0.006, 0.004], caustics: 1.1, sunGlow: 1, sun: 3.4, ambient: 0.75, env: 0.75, light: c("#fff6dc") },
  { depth: 18, zenith: c("#8df0e6"), horizon: c("#1a9fb0"), abyss: c("#075a78"), density: 0.021, absorb: [0.025, 0.006, 0.004], caustics: 0.95, sunGlow: 0.9, sun: 2.8, ambient: 0.7, env: 0.65, light: c("#e8fff0") },
  { depth: 38, zenith: c("#63cf9f"), horizon: c("#127a72"), abyss: c("#06414f"), density: 0.025, absorb: [0.03, 0.007, 0.007], caustics: 0.4, sunGlow: 0.6, sun: 1.7, ambient: 0.55, env: 0.45, light: c("#c8f7cf") },
  { depth: 62, zenith: c("#2f8fb0"), horizon: c("#0c4a6b"), abyss: c("#05273f"), density: 0.023, absorb: [0.034, 0.01, 0.005], caustics: 0.08, sunGlow: 0.3, sun: 0.8, ambient: 0.4, env: 0.28, light: c("#a8dcf2") },
  { depth: 92, zenith: c("#14506e"), horizon: c("#072b45"), abyss: c("#03141f"), density: 0.022, absorb: [0.036, 0.013, 0.007], caustics: 0, sunGlow: 0.1, sun: 0.28, ambient: 0.22, env: 0.13, light: c("#8cc4ea") },
  { depth: 130, zenith: c("#0a3147"), horizon: c("#061c2c"), abyss: c("#030c14"), density: 0.02, absorb: [0.036, 0.015, 0.01], caustics: 0, sunGlow: 0, sun: 0.04, ambient: 0.16, env: 0.08, light: c("#7ab4dd") },
  { depth: 180, zenith: c("#072031"), horizon: c("#05151f"), abyss: c("#020a10"), density: 0.018, absorb: [0.036, 0.016, 0.012], caustics: 0, sunGlow: 0, sun: 0, ambient: 0.16, env: 0.06, light: c("#6aa4cc") },
  { depth: 260, zenith: c("#061a29"), horizon: c("#04121b"), abyss: c("#02080d"), density: 0.017, absorb: [0.036, 0.016, 0.012], caustics: 0, sunGlow: 0, sun: 0, ambient: 0.16, env: 0.06, light: c("#6aa4cc") },
];
