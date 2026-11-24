import { Effect } from "@babylonjs/core/Materials/effect";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { ShaderStore } from "@babylonjs/core/Engines/shaderStore";
import type { Scene } from "@babylonjs/core/scene";

/*
 * Shaders are written once in a small GLSL dialect and translated for WebGPU.
 * a_x attribute, v_x varying, u_x uniform, TEX(name, uv) a lookup without derivatives, TEXM(name, uv) one with mips.
 */
const TYPES: Record<string, string> = { float: "f32", vec2: "vec2f", vec3: "vec3f", vec4: "vec4f", mat4: "mat4x4f" };

export function toWgsl(source: string, stage: "vertex" | "fragment" | "shared") {
  const type = (name: string) => TYPES[name];
  return source
    .replace(/\b(float|vec2|vec3|vec4)\s+(\w+)\s*\(([^)]*)\)\s*\{/g, (_, result, name, params: string) => {
      const list = params.split(",").map((part) => part.trim()).filter(Boolean).map((part) => part.split(/\s+/)).map(([kind, id]) => `${id}: ${type(kind)}`);
      return `fn ${name}(${list.join(", ")}) -> ${type(result)} {`;
    })
    .replace(/(^|[;{}\s])(float|vec2|vec3|vec4|mat4)\s+(\w+)\s*=/g, (_, before, kind, id) => `${before}var ${id}: ${type(kind)} =`)
    .replace(/\b(vec2|vec3|vec4)\(/g, (_, kind) => `${type(kind)}(`)
    .replace(/\bfloat\(/g, "f32(")
    .replace(/\bTEXM\((\w+),/g, "textureSample($1, $1Sampler,")
    .replace(/\bTEX\((\w+),((?:[^()]|\((?:[^()]|\([^()]*\))*\))*)\)/g, "textureSampleLevel($1, $1Sampler,$2, 0.0)")
    .replace(/\bu_(world|viewProjection)\b/g, "uniforms.$1")
    .replace(/\bu_(\w+)/g, "uniforms.u_$1")
    .replace(/\ba_(\w+)/g, "vertexInputs.$1")
    .replace(/\bv_(\w+)/g, stage === "vertex" ? "vertexOutputs.v_$1" : "fragmentInputs.v_$1");
}

export function toGlsl(source: string) {
  return source.replace(/\bTEXM?\((\w+),/g, "texture2D($1,").replace(/\bu_(world|viewProjection)\b/g, "$1").replace(/\ba_(\w+)/g, "$1");
}

type Kind = "float" | "vec2" | "vec3" | "vec4" | "mat4";

export interface ShaderSpec {
  attributes: Record<string, Kind>;
  varyings: Record<string, Kind>;
  /** Beside u_viewProjection and u_world, which Babylon binds, and u_eye, which Water keeps. */
  uniforms: Record<string, Kind>;
  samplers?: string[];
  shared?: string;
  /** Sets POSITION. */
  vertex: string;
  /** Sets COLOR. */
  fragment: string;
  blend?: "add" | "alpha";
}

export function makeShader(scene: Scene, name: string, spec: ShaderSpec) {
  const wgsl = scene.getEngine().isWebGPU;
  const uniforms: Record<string, Kind> = { viewProjection: "mat4", world: "mat4", u_eye: "vec3", ...spec.uniforms };
  const list = (entries: Record<string, Kind>, line: (id: string, kind: Kind) => string) => Object.entries(entries).map(([id, kind]) => line(id, kind)).join("\n");
  if (wgsl) {
    const u = list(uniforms, (id, kind) => `uniform ${id}: ${TYPES[kind]};`);
    const v = list(spec.varyings, (id, kind) => `varying ${id}: ${TYPES[kind]};`);
    const s = (spec.samplers ?? []).map((id) => `var ${id}Sampler: sampler; var ${id}: texture_2d<f32>;`).join("\n");
    const shared = toWgsl(spec.shared ?? "", "shared");
    const clean = (code: string, stage: "vertex" | "fragment") => toWgsl(code, stage).replace(/\bPOSITION\b/g, "vertexOutputs.position").replace(/\bCOLOR\b/g, "fragmentOutputs.color");
    ShaderStore.ShadersStoreWGSL[`${name}VertexShader`] = `${list(spec.attributes, (id, kind) => `attribute ${id.slice(2)}: ${TYPES[kind]};`)}\n${u}\n${v}\n${s}\n${shared}\n@vertex\nfn main(input: VertexInputs) -> FragmentInputs {\n${clean(spec.vertex, "vertex")}\n}`;
    ShaderStore.ShadersStoreWGSL[`${name}FragmentShader`] = `${u}\n${v}\n${s}\n${shared}\n@fragment\nfn main(input: FragmentInputs) -> FragmentOutputs {\n${clean(spec.fragment, "fragment")}\n}`;
  } else {
    const u = list(uniforms, (id, kind) => `uniform ${kind} ${id};`);
    const v = list(spec.varyings, (id, kind) => `varying ${kind} ${id};`);
    const s = (spec.samplers ?? []).map((id) => `uniform sampler2D ${id};`).join("\n");
    const head = `precision highp float;\n${u}\n${v}\n${s}\n${toGlsl(spec.shared ?? "")}`;
    Effect.ShadersStore[`${name}VertexShader`] = `${list(spec.attributes, (id, kind) => `attribute ${kind} ${id.slice(2)};`)}\n${head}\nvoid main() {\n${toGlsl(spec.vertex).replace(/\bPOSITION\b/g, "gl_Position")}\n}`;
    Effect.ShadersStore[`${name}FragmentShader`] = `${head}\nvoid main() {\n${toGlsl(spec.fragment).replace(/\bCOLOR\b/g, "gl_FragColor")}\n}`;
  }
  const material = new ShaderMaterial(name, scene, name, {
    attributes: Object.keys(spec.attributes).map((id) => id.slice(2)),
    uniforms: Object.keys(uniforms),
    samplers: spec.samplers ?? [],
    needAlphaBlending: Boolean(spec.blend),
    shaderLanguage: wgsl ? ShaderLanguage.WGSL : ShaderLanguage.GLSL,
  });
  material.backFaceCulling = false;
  if (spec.blend) {
    material.alphaMode = spec.blend === "add" ? 1 : 2;
    material.disableDepthWrite = true;
  }
  return material;
}
