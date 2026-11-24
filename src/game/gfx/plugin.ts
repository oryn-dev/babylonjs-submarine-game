import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { MaterialPluginBase } from "@babylonjs/core/Materials/materialPluginBase";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture";
import type { Texture } from "@babylonjs/core/Materials/Textures/texture";
import type { UniformBuffer } from "@babylonjs/core/Materials/uniformBuffer";
import type { Scene } from "@babylonjs/core/scene";
import { toGlsl, toWgsl } from "./shader";
import { WATER_FUNCTIONS, type Water } from "./water";

export type Motion = "none" | "sway" | "swim" | "pulse" | "cruise";

export interface SeaOptions {
  /** How the vertices move. Amount is the amplitude, in metres where that applies. */
  motion?: Motion;
  amount?: number;
  /** Sand, rust and growth gather on this surface. */
  grime?: boolean;
  /** Blends sand and rock by slope. */
  ground?: { sand: Texture; sandNormal: Texture; rock: Texture; rockNormal: Texture };
  /** Warm pulse at the edges, for things worth grabbing. */
  rim?: boolean;
  /** Brightness of the parts marked as glowing by vertex alpha 0. */
  glow?: number;
  /** Extra light the water lets through thin things. */
  thin?: number;
}

const UNIFORMS = ["u_zenith", "u_horizon", "u_abyss", "u_absorb", "u_ping", "u_misc", "u_shadow", "u_own"] as const;

/** Gives a PBR material the sea: water colour by distance, caustics, the sonar ring, and the options above. */
export class SeaPlugin extends MaterialPluginBase {
  /** Own glow factor and highlight, changed by the game. */
  glow: number;

  constructor(material: PBRMaterial, private water: Water, private options: SeaOptions) {
    super(material, "Sea", 120, { SEA: true }, false);
    this.glow = options.glow ?? 1;
    this._pluginManager._addPlugin(this);
    this._enable(true);
  }

  override getClassName() {
    const { motion, grime, ground, rim, glow, thin } = this.options;
    // The name keys the compiled shader, so every variant needs its own.
    return `SeaPlugin-${[motion, grime, Boolean(ground), rim, glow !== undefined, thin].join("-")}`;
  }

  override isCompatible(language: ShaderLanguage) {
    return language === ShaderLanguage.GLSL || language === ShaderLanguage.WGSL;
  }

  override prepareDefines(defines: Record<string, unknown>, _scene: Scene, _mesh: AbstractMesh) {
    defines.SEA = true;
  }

  private get textures(): Record<string, BaseTexture> {
    const { ground } = this.options;
    return { causticMap: this.water.caustics, ...(ground && { sandMap: ground.sand, sandNormalMap: ground.sandNormal, rockMap: ground.rock, rockNormalMap: ground.rockNormal }) };
  }

  override getSamplers(samplers: string[]) {
    samplers.push(...Object.keys(this.textures));
  }

  override getActiveTextures(list: BaseTexture[]) {
    list.push(...Object.values(this.textures));
  }

  override hasTexture(texture: BaseTexture) {
    return Object.values(this.textures).includes(texture);
  }

  override isReadyForSubMesh() {
    return Object.values(this.textures).every((texture) => texture.isReady());
  }

  override getUniforms() {
    return { ubo: UNIFORMS.map((name) => ({ name, size: 4, type: "vec4" })), vertex: UNIFORMS.map((name) => `uniform vec4 ${name};`).join("\n"), fragment: UNIFORMS.map((name) => `uniform vec4 ${name};`).join("\n") };
  }

  override bindForSubMesh(ubo: UniformBuffer) {
    const { water } = this;
    const put = (name: string, v: readonly number[]) => ubo.updateFloat4(name, v[0], v[1], v[2], v[3]);
    put("u_zenith", water.zenith);
    put("u_horizon", water.horizon);
    put("u_abyss", water.abyss);
    put("u_absorb", water.absorb);
    put("u_ping", water.ping);
    put("u_misc", water.misc);
    put("u_shadow", water.shadow);
    put("u_own", [this.glow, this.options.amount ?? 0, 0, 0]);
    for (const [name, texture] of Object.entries(this.textures)) ubo.setTexture(name, texture);
  }

  override getCustomCode(stage: string, language = ShaderLanguage.GLSL): Record<string, string> | null {
    const wgsl = language === ShaderLanguage.WGSL;
    const samplers = wgsl ? Object.keys(this.textures).map((id) => `var ${id}Sampler: sampler; var ${id}: texture_2d<f32>;`).join("\n") : Object.keys(this.textures).map((id) => `uniform sampler2D ${id};`).join("\n");
    if (stage === "vertex") {
      const code = this.vertexCode();
      return code ? { CUSTOM_VERTEX_UPDATE_WORLDPOS: wgsl ? toWgsl(code, "shared") : toGlsl(code) } : null;
    }
    const translate = (code: string) =>
      wgsl
        ? toWgsl(code, "shared").replace(/\bPOS\b/g, "fragmentInputs.vPositionW").replace(/\bEYE\b/g, "scene.vEyePosition.xyz").replace(/\bVCOLOR\b/g, "fragmentInputs.vColor")
        : toGlsl(code).replace(/\bPOS\b/g, "vPositionW").replace(/\bEYE\b/g, "vEyePosition.xyz").replace(/\bVCOLOR\b/g, "vColor");
    const own: Record<string, string> = {
      CUSTOM_FRAGMENT_DEFINITIONS: samplers + "\n" + translate(WATER_FUNCTIONS + SHARED),
      CUSTOM_FRAGMENT_BEFORE_LIGHTS: translate(this.surfaceCode()),
      CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR: translate(this.finalCode()),
    };
    return own;
  }

  private vertexCode() {
    switch (this.options.motion ?? "none") {
      case "sway":
        return `
float swayH = positionUpdated.y;
float swayP = finalWorld[3].x * 0.31 + finalWorld[3].z * 0.23;
float swayA = u_own.y * swayH * swayH;
worldPos.x += swayA * (sin(u_zenith.w * 0.62 + swayP + swayH * 0.16) + 0.45 * sin(u_zenith.w * 1.17 + swayP * 1.7 + swayH * 0.33));
worldPos.z += swayA * 0.7 * cos(u_zenith.w * 0.53 + swayP * 1.3 + swayH * 0.2);`;
      case "swim":
        return `
float swimZ = positionUpdated.z;
float swimP = finalWorld[3].x * 0.7 + finalWorld[3].z * 0.9;
float swimW = u_own.y * (0.35 - swimZ) * (0.35 - swimZ);
vec4 swimSide = finalWorld * vec4(1.0, 0.0, 0.0, 0.0);
worldPos += swimSide * (swimW * sin(u_zenith.w * 9.0 + swimP + swimZ * 4.0));`;
      case "pulse":
        return `
float pulseP = finalWorld[3].x + finalWorld[3].z;
float pulseK = sin(u_zenith.w * 1.8 + pulseP + positionUpdated.y * 0.9);
vec4 pulseOut = finalWorld * vec4(positionUpdated.x, 0.0, positionUpdated.z, 0.0);
worldPos += pulseOut * (u_own.y * pulseK);
worldPos.y += 0.25 * sin(u_zenith.w * 1.8 + pulseP - 0.9);`;
      case "cruise":
        return `
float cruiseK = clamp((12.0 - positionUpdated.z) / 36.0, 0.0, 1.0);
float cruiseF = max(abs(positionUpdated.x) - 4.2, 0.0) * step(0.0, positionUpdated.z);
worldPos.y += u_own.y * cruiseK * cruiseK * sin(u_zenith.w * 1.15 + positionUpdated.z * 0.11) + cruiseF * 0.16 * sin(u_zenith.w * 0.8);`;
      default:
        return "";
    }
  }

  private surfaceCode() {
    const { ground, grime } = this.options;
    if (ground)
      return `
vec3 gN = normalize(normalW);
vec3 gW = abs(gN) * abs(gN) * abs(gN);
gW = gW / (gW.x + gW.y + gW.z);
vec3 gP = POS;
float gNoise = TEX(causticMap, gP.xz * 0.021).g;
vec3 rock = TEXM(rockMap, gP.zy * 0.16).rgb * gW.x + TEXM(rockMap, gP.xz * 0.16).rgb * gW.y + TEXM(rockMap, gP.xy * 0.16).rgb * gW.z;
vec3 rockN = (TEXM(rockNormalMap, gP.zy * 0.16).rgb * gW.x + TEXM(rockNormalMap, gP.xz * 0.16).rgb * gW.y + TEXM(rockNormalMap, gP.xy * 0.16).rgb * gW.z) * 2.0 - 1.0;
vec3 sand = TEXM(sandMap, gP.xz * 0.13).rgb;
vec3 sandN = TEXM(sandNormalMap, gP.xz * 0.13).rgb * 2.0 - 1.0;
float slope = smoothstep(0.62, 0.86, gN.y + (gNoise - 0.5) * 0.34 + (rock.r - 0.3) * 0.25) * (1.0 - u_own.y);
float ripple = sin(gP.x * 2.1 + gP.z * 4.7 + gNoise * 26.0) * slope;
vec3 detail = mix(rock * rock * vec3(2.1, 2.15, 2.4), sand * sand * vec3(1.7, 1.56, 1.3), slope);
surfaceAlbedo = VCOLOR.rgb * detail * (0.72 + 0.5 * gNoise) * (1.0 + ripple * 0.07);
vec2 bump = mix(rockN.xy * 1.5, sandN.xy * 0.8 + vec2(0.18, 0.4) * cos(gP.x * 2.1 + gP.z * 4.7 + gNoise * 26.0) * 0.5, slope);
normalW = normalize(gN + vec3(bump.x, 0.0, bump.y) * 0.75 * (0.35 + gW.y) + vec3(0.0, bump.y, bump.x) * 0.5 * gW.x + vec3(bump.x, bump.y, 0.0) * 0.5 * gW.z);`;
    if (grime)
      return `
vec3 wP = POS;
vec3 wN = normalize(normalW);
vec3 wT = abs(wN) * abs(wN);
wT = wT / (wT.x + wT.y + wT.z);
float wA = TEX(causticMap, wP.xz * 0.09 + vec2(wP.y * 0.07, wP.y * 0.05)).g;
float wB = TEX(causticMap, wP.zy * 0.31).b * wT.x + TEX(causticMap, wP.xz * 0.31).b * wT.y + TEX(causticMap, wP.xy * 0.31).b * wT.z;
float wF = TEX(causticMap, wP.zy * 1.13).g * wT.x + TEX(causticMap, wP.xz * 1.13).g * wT.y + TEX(causticMap, wP.xy * 1.13).g * wT.z;
float wS = TEX(causticMap, vec2(wP.z * 0.46, wP.y * 0.06)).b * wT.x + wB * wT.y + TEX(causticMap, vec2(wP.x * 0.46, wP.y * 0.06)).b * wT.z;
float rust = smoothstep(0.42, 0.66, wA * 0.6 + wS * 0.45 + (wF - 0.5) * 0.25);
surfaceAlbedo = mix(surfaceAlbedo, surfaceAlbedo * vec3(0.62, 0.4, 0.27) + vec3(0.022, 0.009, 0.003), rust * 0.75);
float drip = smoothstep(0.5, 0.78, wS) * (1.0 - wT.y);
surfaceAlbedo = mix(surfaceAlbedo, vec3(0.1, 0.038, 0.014), drip * 0.5);
surfaceAlbedo = surfaceAlbedo * (0.56 + 0.5 * wB + 0.4 * wF);
float grow = smoothstep(0.25, 0.75, wN.y * 0.75 + wA * 0.7 + wB * 0.25 - 0.28 + (wF - 0.5) * 0.3);
vec3 growColor = mix(vec3(0.075, 0.11, 0.055), vec3(0.25, 0.21, 0.13), clamp((-wP.y - 25.0) / 70.0, 0.0, 1.0));
surfaceAlbedo = mix(surfaceAlbedo, growColor * (0.45 + 0.7 * wB + 0.5 * wF), grow * 0.8);
float spots = smoothstep(0.78, 0.86, TEX(causticMap, wP.zy * 0.63).b * wT.x + TEX(causticMap, wP.xz * 0.63).b * wT.y + TEX(causticMap, wP.xy * 0.63).b * wT.z);
surfaceAlbedo = mix(surfaceAlbedo, vec3(0.42, 0.4, 0.33), spots * 0.4);
normalW = normalize(wN + (vec3(wB, wF, wS) - 0.5) * 0.45 + (vec3(wF, wB, wA) - 0.5) * 0.3);`;
    return "";
  }

  private finalCode() {
    const { rim, thin } = this.options;
    const marked = this.options.glow !== undefined ? `sea += surfaceAlbedo * step(VCOLOR.a, 0.5) * u_own.x;` : "";
    return `
vec3 sea = finalColor.rgb;
vec3 seaP = POS;
vec3 seaN = normalize(normalW);
${thin ? `sea += surfaceAlbedo * u_zenith.rgb * ${thin.toFixed(2)};` : ""}
float shade = blobShadow(seaP);
sea = sea * shade;
sea += surfaceAlbedo * (u_zenith.rgb * 0.6 + 0.5) * causticLight(seaP) * u_abyss.w * shade * clamp(seaN.y * 0.8 + 0.25, 0.0, 1.0);
${marked}
${rim ? `float edge = 1.0 - abs(dot(seaN, normalize(EYE - seaP)));
float find = clamp((edge * edge * 0.7 + 0.3) * (0.75 + 0.35 * sin(u_zenith.w * 3.1 + seaP.x)), 0.0, 1.0) * clamp(u_own.x, 0.0, 1.0);
sea = mix(sea, vec3(1.0, 0.43, 0.03) * (0.4 + 1.3 * u_zenith.g) * (0.45 + 0.9 * clamp(seaN.y * 0.5 + 0.5, 0.0, 1.0)), find * 0.75);` : ""}
vec3 toPoint = seaP - EYE;
sea = underWater(sea, toPoint);
sea += sonarGlow(seaP) * exp(-length(toPoint) * u_horizon.w * 0.45);
finalColor = vec4(sea, ${marked ? "1.0" : "finalColor.a"});`;
  }
}

const SHARED = `
float causticLight(vec3 p) {
  vec2 q = p.xz + p.y * vec2(0.22, -0.29);
  float a = TEX(causticMap, q * 0.085 + vec2(u_zenith.w * 0.016, u_zenith.w * 0.011)).r;
  float b = TEX(causticMap, q * 0.117 + vec2(-u_zenith.w * 0.013, u_zenith.w * 0.017) + 0.4).r;
  return (min(a, b) * 2.6 + a * b * 1.5) * exp(p.y * 0.012);
}
float blobShadow(vec3 p) {
  vec3 d = p - u_shadow.xyz;
  float under = clamp(-d.y - 0.6, 0.0, 22.0);
  vec2 q = d.xz - under * vec2(0.24, -0.31);
  float r = 2.2 + under * 0.16;
  float s = exp(-dot(q, q) / (r * r)) * step(0.9, -d.y) * exp(-under * 0.07);
  return 1.0 - s * u_shadow.w;
}
vec3 sonarGlow(vec3 p) {
  float d = length(p - u_ping.xyz);
  float behind = u_ping.w - d;
  float front = exp(-behind * behind * 1.1) * step(0.0, u_ping.w);
  float tail = clamp(1.0 - behind / 26.0, 0.0, 1.0) * step(0.0, behind) * step(0.0, u_ping.w);
  float contour = smoothstep(0.86, 0.98, abs(fract(p.y * 0.4) * 2.0 - 1.0));
  return vec3(0.04, 0.8, 0.78) * (front * 1.3 + tail * tail * (contour * 0.5 + 0.08)) * u_misc.x * (0.8 + u_zenith.g * 0.75);
}`;

export function seaMaterial(scene: Scene, water: Water, name: string, options: SeaOptions & { metallic?: number; roughness?: number; doubleSided?: boolean } = {}) {
  const material = new PBRMaterial(name, scene);
  material.metallic = options.metallic ?? 0;
  material.roughness = options.roughness ?? 0.85;
  material.backFaceCulling = !options.doubleSided;
  material.maxSimultaneousLights = 5;
  material.twoSidedLighting = Boolean(options.doubleSided);
  if (options.glow !== undefined) {
    material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHATEST;
    material.alphaCutOff = -1;
  }
  const sea = new SeaPlugin(material, water, options);
  return Object.assign(material, { sea });
}

export type SeaMaterial = ReturnType<typeof seaMaterial>;
