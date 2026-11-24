import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Constants } from "@babylonjs/core/Engines/constants";
import type { Scene } from "@babylonjs/core/scene";

function seeded(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

/** Tiling noise and caustic web in one texture: r caustic lines, g soft noise, b fine noise. */
export function causticTexture(scene: Scene, size = 256) {
  const random = seeded(77);
  const cells = 7;
  const points = Array.from({ length: cells * cells }, (_, i) => [((i % cells) + random()) / cells, (Math.floor(i / cells) + random()) / cells]);
  const lattice = (n: number) => {
    const values = Array.from({ length: n * n }, random);
    return (u: number, v: number) => {
      const x = u * n;
      const y = v * n;
      const xi = Math.floor(x);
      const yi = Math.floor(y);
      const fx = (x - xi) * (x - xi) * (3 - 2 * (x - xi));
      const fy = (y - yi) * (y - yi) * (3 - 2 * (y - yi));
      const at = (i: number, j: number) => values[(((j % n) + n) % n) * n + (((i % n) + n) % n)];
      return (at(xi, yi) * (1 - fx) + at(xi + 1, yi) * fx) * (1 - fy) + (at(xi, yi + 1) * (1 - fx) + at(xi + 1, yi + 1) * fx) * fy;
    };
  };
  const [n5, n9, n18, n40] = [5, 9, 18, 40].map(lattice);
  const data = new Uint8Array(size * size * 4);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const u0 = i / size;
      const v0 = j / size;
      const u = u0 + (n5(u0, v0) - 0.5) * 0.08;
      const v = v0 + (n5(v0, u0) - 0.5) * 0.08;
      let near = 9;
      let next = 9;
      for (const [px, py] of points) {
        const dx = Math.abs(u - px - Math.round(u - px));
        const dy = Math.abs(v - py - Math.round(v - py));
        const d = dx * dx + dy * dy;
        if (d < near) [next, near] = [near, d];
        else if (d < next) next = d;
      }
      const edge = (Math.sqrt(next) - Math.sqrt(near)) * cells;
      const line = Math.pow(Math.max(0, 1 - edge * 1.15), 2.4);
      const at = (j * size + i) * 4;
      data[at] = 255 * Math.min(1, line);
      data[at + 1] = 255 * (n5(u0, v0) * 0.5 + n9(u0, v0) * 0.3 + n18(u0, v0) * 0.2);
      data[at + 2] = 255 * (n18(u0, v0) * 0.5 + n40(u0, v0) * 0.5);
      data[at + 3] = 255;
    }
  }
  const texture = RawTexture.CreateRGBATexture(data, size, size, scene, true, false, Texture.TRILINEAR_SAMPLINGMODE, Constants.TEXTURETYPE_UNSIGNED_BYTE);
  texture.wrapU = texture.wrapV = Texture.WRAP_ADDRESSMODE;
  return texture;
}

function painted(scene: Scene, name: string, size: number, paint: (context: CanvasRenderingContext2D) => void) {
  const texture = new DynamicTexture(name, size, scene, true);
  paint(texture.getContext() as CanvasRenderingContext2D);
  texture.update();
  texture.hasAlpha = true;
  return texture;
}

export const bubbleTexture = (scene: Scene) =>
  painted(scene, "bubble", 64, (c) => {
    const rim = c.createRadialGradient(32, 32, 14, 32, 32, 29);
    rim.addColorStop(0, "rgba(255,255,255,.06)");
    rim.addColorStop(0.75, "rgba(255,255,255,.3)");
    rim.addColorStop(0.93, "rgba(255,255,255,.9)");
    rim.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = rim;
    c.fillRect(0, 0, 64, 64);
    const spot = c.createRadialGradient(23, 21, 0, 23, 21, 8);
    spot.addColorStop(0, "rgba(255,255,255,1)");
    spot.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = spot;
    c.fillRect(0, 0, 64, 64);
  });

export const puffTexture = (scene: Scene) =>
  painted(scene, "puff", 128, (c) => {
    const random = seeded(5);
    for (let i = 0; i < 26; i++) {
      const a = random() * 6.28;
      const r = random() * 34;
      const x = 64 + Math.cos(a) * r;
      const y = 64 + Math.sin(a) * r;
      const size = 12 + random() * 18;
      const fill = c.createRadialGradient(x, y, 0, x, y, size);
      fill.addColorStop(0, "rgba(255,255,255,.16)");
      fill.addColorStop(1, "rgba(255,255,255,0)");
      c.fillStyle = fill;
      c.fillRect(0, 0, 128, 128);
    }
  });
