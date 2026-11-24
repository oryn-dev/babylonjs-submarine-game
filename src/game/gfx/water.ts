import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3, Vector4 } from "@babylonjs/core/Maths/math.vector";
import type { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import type { Texture } from "@babylonjs/core/Materials/Textures/texture";
import type { Scene } from "@babylonjs/core/scene";
import type { Look } from "../../oryn/look";
import { WATER_STOPS } from "../data/water";
import { causticTexture } from "./textures";

/** The colour of open water along a view direction, and what it does to light on the way to the eye. */
export const WATER_FUNCTIONS = `
vec3 waterColor(vec3 dir) {
  float up = clamp(dir.y, 0.0, 1.0);
  float down = clamp(-dir.y, 0.0, 1.0);
  vec3 c = mix(u_horizon.rgb, u_zenith.rgb, pow(up, 0.75));
  c = mix(c, u_abyss.rgb, 1.0 - (1.0 - down) * (1.0 - down));
  float sun = clamp(dot(dir, vec3(-0.22, 0.93, 0.29)), 0.0, 1.0);
  return c + u_zenith.rgb * u_absorb.w * (pow(sun, 5.0) * 0.5 + pow(sun, 40.0) * 0.9);
}
vec3 underWater(vec3 color, vec3 toPoint) {
  float dist = length(toPoint);
  vec3 dir = toPoint / max(dist, 0.001);
  float fog = 1.0 - exp(-dist * u_horizon.w);
  return color * exp(-dist * u_absorb.rgb) * (1.0 - fog) + waterColor(dir) * fog;
}`;

export const WATER_UNIFORMS = { u_zenith: "vec4", u_horizon: "vec4", u_abyss: "vec4", u_absorb: "vec4" } as const;

type Four = [number, number, number, number];

/** Water by camera depth: one state that every material, the backdrop and the lights read. */
export class Water {
  /** rgb + time, rgb + fog density, rgb + caustic strength, rgb absorption + sun glow. */
  readonly zenith: Four = [0, 0, 0, 0];
  readonly horizon: Four = [0, 0, 0, 0];
  readonly abyss: Four = [0, 0, 0, 0];
  readonly absorb: Four = [0, 0, 0, 0];
  /** xyz origin and radius, then strength, rim pulse, sway strength, glow. */
  readonly ping: Four = [0, 0, 0, -1];
  readonly misc: Four = [0, 0, 1, 1];
  readonly shadow: Four = [0, -999, 0, 0];
  readonly eye = new Vector3();
  readonly caustics: Texture;
  time = 0;
  depth = 0;
  /** 0 at the surface, 1 where only lamps show anything. */
  darkness = 0;

  private materials: ShaderMaterial[] = [];

  constructor(private scene: Scene, private look: Look) {
    this.caustics = causticTexture(scene);
    scene.fogEnabled = false;
  }

  track(material: ShaderMaterial) {
    this.materials.push(material);
    return material;
  }

  update(dt: number, eye: Vector3, flash = 0) {
    this.time += dt;
    this.eye.copyFrom(eye);
    const depth = (this.depth = Math.max(0, -eye.y));
    let i = 0;
    while (i < WATER_STOPS.length - 2 && WATER_STOPS[i + 1].depth < depth) i++;
    const a = WATER_STOPS[i];
    const b = WATER_STOPS[i + 1];
    const k = Math.min(1, Math.max(0, (depth - a.depth) / (b.depth - a.depth)));
    const mix = (x: number, y: number) => x + (y - x) * k;
    const put = (to: Four, from: Color3, till: Color3) => {
      to[0] = mix(from.r, till.r);
      to[1] = mix(from.g, till.g);
      to[2] = mix(from.b, till.b);
    };
    put(this.zenith, a.zenith, b.zenith);
    put(this.horizon, a.horizon, b.horizon);
    put(this.abyss, a.abyss, b.abyss);
    for (let c = 0; c < 3; c++) {
      this.absorb[c] = mix(a.absorb[c], b.absorb[c]);
      if (flash) this.horizon[c] += flash * [0.05, 0.16, 0.18][c];
    }
    this.horizon[3] = mix(a.density, b.density);
    this.zenith[3] = this.time;
    this.abyss[3] = mix(a.caustics, b.caustics);
    this.absorb[3] = mix(a.sunGlow, b.sunGlow);
    this.darkness = Math.min(1, Math.max(0, (depth - 35) / 75));
    this.misc[1] = this.time;

    const { sun, ambient } = this.look;
    sun.intensity = mix(a.sun, b.sun);
    sun.diffuse.set(mix(a.light.r, b.light.r), mix(a.light.g, b.light.g), mix(a.light.b, b.light.b));
    ambient.intensity = mix(a.ambient, b.ambient);
    ambient.diffuse.copyFrom(sun.diffuse);
    ambient.groundColor.set(this.abyss[0] * 1.5 + this.horizon[0] * 0.5, this.abyss[1] * 1.5 + this.horizon[1] * 0.5, this.abyss[2] * 1.5 + this.horizon[2] * 0.5);
    this.scene.environmentIntensity = mix(a.env, b.env);

    for (const material of this.materials) {
      material.setVector3("u_eye", this.eye);
      for (const [name, value] of [["u_zenith", this.zenith], ["u_horizon", this.horizon], ["u_abyss", this.abyss], ["u_absorb", this.absorb]] as const) {
        material.setVector4(name, Vector4.FromArray(value));
      }
    }
  }
}
