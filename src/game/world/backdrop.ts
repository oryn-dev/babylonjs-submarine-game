import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { type Vector3, Vector4 } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import type { Scene } from "@babylonjs/core/scene";
import { makeShader } from "../gfx/shader";
import { WATER_FUNCTIONS, WATER_UNIFORMS, type Water } from "../gfx/water";

/** Open water all around, the surface seen from below, light shafts and drifting particles. */
export function createBackdrop(scene: Scene, water: Water) {
  const dome = CreateSphere("water-dome", { diameter: 2, segments: 20, sideOrientation: Mesh.BACKSIDE }, scene);
  dome.material = water.track(makeShader(scene, "waterDome", {
    attributes: { a_position: "vec3" },
    varyings: { v_dir: "vec3" },
    uniforms: WATER_UNIFORMS,
    shared: WATER_FUNCTIONS,
    vertex: `v_dir = a_position; POSITION = u_viewProjection * u_world * vec4(a_position, 1.0);`,
    fragment: `COLOR = vec4(waterColor(normalize(v_dir)), 1.0);`,
  }));
  dome.material.backFaceCulling = false;
  dome.scaling.setAll(205);
  dome.infiniteDistance = true;
  dome.isPickable = false;

  const surface = CreateGround("sea-surface", { width: 420, height: 420, subdivisions: 2 }, scene);
  const surfaceShader = water.track(makeShader(scene, "seaSurface", {
    attributes: { a_position: "vec3" },
    varyings: { v_pos: "vec3" },
    uniforms: WATER_UNIFORMS,
    samplers: ["causticMap"],
    shared: WATER_FUNCTIONS,
    vertex: `vec4 p = u_world * vec4(a_position, 1.0); v_pos = p.xyz; POSITION = u_viewProjection * p;`,
    fragment: `
vec2 q = v_pos.xz;
float t = u_zenith.w;
float a = TEX(causticMap, q * 0.018 + vec2(t * 0.013, t * 0.009)).g;
float b = TEX(causticMap, q * 0.047 + vec2(-t * 0.021, t * 0.016)).g;
float web = TEX(causticMap, q * 0.05 + vec2(a, b) * 0.35 + vec2(t * 0.01, 0.0)).r;
vec3 toPoint = v_pos - u_eye;
vec3 dir = normalize(toPoint);
float open = smoothstep(0.5, 0.86, dir.y + (a + b - 1.0) * 0.55);
vec3 sky = u_zenith.rgb * (1.15 + 0.5 * b) + vec3(0.35, 0.36, 0.3) * u_absorb.w;
float sun = clamp(dot(normalize(dir + vec3(a - 0.5, 0.0, b - 0.5) * 0.35), vec3(-0.22, 0.93, 0.29)), 0.0, 1.0);
vec3 c = mix(u_horizon.rgb * (0.75 + 0.6 * a), sky, open);
c = c + vec3(1.0, 1.0, 0.9) * (web * 0.45 * (0.25 + open) + pow(sun, 26.0) * 3.2) * u_absorb.w;
COLOR = vec4(underWater(c, toPoint * (0.75 + 0.4 * (1.0 - clamp(dir.y * 4.0, 0.0, 1.0)))), 1.0);`,
  }));
  surfaceShader.setTexture("causticMap", water.caustics);
  surface.material = surfaceShader;
  surface.isPickable = false;

  const rays = quads(scene, "rays", 40, (i, corner) => [((i * 0.618) % 1) * 2 - 1, corner[0], ((i * 0.381) % 1) * 2 - 1, corner[1], 0.35 + ((i * 0.737) % 1)]);
  const rayShader = water.track(makeShader(scene, "lightRays", {
    attributes: { a_position: "vec3", a_uv: "vec2" },
    varyings: { v_uv: "vec2", v_seed: "float", v_far: "float" },
    uniforms: { ...WATER_UNIFORMS },
    samplers: ["causticMap"],
    vertex: `
vec3 axis = vec3(0.22, -0.93, -0.29);
float span = 64.0;
vec2 cell = a_position.xz * span * 0.5;
vec2 wrapped = cell - floor((cell - u_eye.xz) / span + 0.5) * span;
vec3 base = vec3(wrapped.x, 0.0, wrapped.y);
float along = a_uv.x;
vec3 p = base + axis * along * 46.0;
vec3 side = normalize(cross(axis, p - u_eye));
p = p + side * a_position.y * a_uv.y * (1.5 + 3.2 * along);
v_uv = vec2(a_position.y, along);
v_seed = a_uv.y * 7.0 + a_position.x;
v_far = length(p.xz - u_eye.xz);
POSITION = u_viewProjection * vec4(p, 1.0);`,
    fragment: `
float flick = TEX(causticMap, vec2(v_seed, u_zenith.w * 0.022 + v_seed * 0.7)).g;
float stripe = TEX(causticMap, vec2(v_uv.x * 0.16 + v_seed, u_zenith.w * 0.012)).g;
float edge = 1.0 - v_uv.x * v_uv.x;
float along = smoothstep(0.0, 0.12, v_uv.y) * (1.0 - v_uv.y) * (1.0 - v_uv.y);
float near = smoothstep(3.0, 14.0, v_far) * (1.0 - smoothstep(24.0, 32.0, v_far));
float k = edge * edge * along * near * smoothstep(0.35, 0.75, flick) * (0.35 + stripe);
COLOR = vec4(u_zenith.rgb + 0.12, k * 0.95 * u_absorb.w);`,
    blend: "add",
  }));
  rayShader.setTexture("causticMap", water.caustics);
  rays.material = rayShader;
  rays.alphaIndex = 5;

  const snow = quads(scene, "marine-snow", 620, (i, corner) => [(i * 0.6180339) % 1, (i * 0.7548776) % 1, (i * 0.5698403) % 1, corner[0], corner[1] * 2 - 1]);
  const snowShader = water.track(makeShader(scene, "marineSnow", {
    attributes: { a_position: "vec3", a_uv: "vec2" },
    varyings: { v_uv: "vec2", v_light: "vec4" },
    uniforms: { ...WATER_UNIFORMS, u_lamp: "vec4", u_lampDir: "vec4", u_right: "vec3", u_up: "vec3" },
    vertex: `
vec3 span = vec3(30.0, 22.0, 30.0);
vec3 p = a_position * span + vec3(sin(u_zenith.w * 0.21 + a_position.y * 40.0) * 0.7, -u_zenith.w * 0.16, cos(u_zenith.w * 0.17 + a_position.x * 50.0) * 0.7);
p = p - floor((p - u_eye) / span + 0.5) * span;
float size = 0.014 + 0.03 * fract(a_position.x * 91.7) * fract(a_position.z * 47.3);
vec3 toLamp = p - u_lamp.xyz;
float away = length(toLamp);
float cone = smoothstep(0.78, 0.97, dot(toLamp / max(away, 0.01), u_lampDir.xyz)) * u_lampDir.w / (1.0 + away * away * 0.012);
float dist = length(p - u_eye);
float fade = smoothstep(0.6, 2.4, dist) * (1.0 - smoothstep(9.0, 14.5, dist));
v_light = vec4(u_zenith.rgb * 0.75 + u_horizon.rgb * 0.5 + vec3(1.0, 0.93, 0.78) * cone * 1.4, fade);
v_uv = vec2(a_uv.x * 2.0 - 1.0, a_uv.y);
p = p + (u_right * (a_uv.x * 2.0 - 1.0) + u_up * a_uv.y) * size;
POSITION = u_viewProjection * vec4(p, 1.0);`,
    fragment: `
float r = dot(v_uv, v_uv);
COLOR = vec4(v_light.rgb, v_light.a * smoothstep(0.0, 1.0, 1.0 - r) * 0.75);`,
    blend: "add",
  }));
  snow.material = snowShader;
  snow.alphaIndex = 6;

  return {
    surface, rays, snowShader,
    lamp(position: Vector3, direction: Vector3, strength: number) {
      snowShader.setVector4("u_lamp", new Vector4(position.x, position.y, position.z, 1));
      snowShader.setVector4("u_lampDir", new Vector4(direction.x, direction.y, direction.z, strength));
    },
    update() {
      surface.position.set(Math.round(water.eye.x / 20) * 20, 0, Math.round(water.eye.z / 20) * 20);
      surface.setEnabled(water.depth < 55);
      rays.setEnabled(water.depth < 70);
    },
  };
}

/** One mesh of many quads; `make` gives [x, y, z, u, v] per corner, corner being [0..1 along, -1..1 across] or [0..1, 0..1]. */
function quads(scene: Scene, name: string, count: number, make: (index: number, corner: [number, number]) => number[]) {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const corners: [number, number][] = name === "rays" ? [[-1, 0], [1, 0], [1, 1], [-1, 1]] : [[0, 0], [1, 0], [1, 1], [0, 1]];
  for (let i = 0; i < count; i++) {
    for (const corner of corners) {
      const [x, y, z, u, v] = make(i, corner);
      positions.push(x, y, z);
      uvs.push(u, v);
    }
    const a = i * 4;
    indices.push(a, a + 1, a + 2, a, a + 2, a + 3);
  }
  const mesh = new Mesh(name, scene);
  Object.assign(new VertexData(), { positions, uvs, indices }).applyToMesh(mesh);
  mesh.alwaysSelectAsActiveMesh = true;
  mesh.isPickable = false;
  return mesh;
}

/** Soft glowing spots facing the camera, for lamps, finds and lights far away. */
export class Glows {
  private mesh: Mesh;
  private positions: Float32Array;
  private colors: Float32Array;
  private sizes: Float32Array;
  private used = 0;

  constructor(scene: Scene, water: Water, private capacity = 160) {
    this.mesh = CreatePlane("glows", { size: 1 }, scene);
    this.positions = new Float32Array(capacity * 12);
    this.colors = new Float32Array(capacity * 16);
    this.sizes = new Float32Array(capacity * 8);
    const uvs2: number[] = [];
    const indices: number[] = [];
    for (let i = 0; i < capacity; i++) {
      uvs2.push(-1, -1, 1, -1, 1, 1, -1, 1);
      indices.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
    }
    const data = Object.assign(new VertexData(), { positions: this.positions, colors: this.colors, uvs: this.sizes, uvs2, indices });
    data.applyToMesh(this.mesh, true);
    const shader = water.track(makeShader(scene, "glowSpots", {
      attributes: { a_position: "vec3", a_color: "vec4", a_uv: "vec2", a_uv2: "vec2" },
      varyings: { v_uv: "vec2", v_color: "vec4" },
      uniforms: { ...WATER_UNIFORMS, u_right: "vec3", u_up: "vec3" },
      vertex: `
float dist = length(a_position - u_eye);
float through = exp(-dist * u_horizon.w * a_uv.y);
v_color = vec4(a_color.rgb * exp(-dist * u_absorb.rgb * 0.6), a_color.a * through);
v_uv = a_uv2;
vec3 p = a_position + (u_right * a_uv2.x + u_up * a_uv2.y) * a_uv.x * (1.0 + dist * 0.006);
p = p + normalize(u_eye - a_position) * min(1.7, dist * 0.2);
POSITION = u_viewProjection * vec4(p, 1.0);`,
      fragment: `
float r = length(v_uv);
float k = clamp(1.0 - r, 0.0, 1.0);
COLOR = vec4(v_color.rgb, v_color.a * (k * k * 0.75 + pow(k, 7.0) * 1.6));`,
      blend: "add",
    }));
    this.mesh.material = shader;
    this.mesh.alwaysSelectAsActiveMesh = true;
    this.mesh.isPickable = false;
    this.mesh.alphaIndex = 8;
    this.shader = shader;
  }

  readonly shader;

  begin() {
    this.used = 0;
  }

  /** `reach` scales how much water dims it: 1 normal, less shines further. */
  add(x: number, y: number, z: number, size: number, r: number, g: number, b: number, strength = 1, reach = 1) {
    if (this.used >= this.capacity) return;
    const i = this.used++;
    for (let k = 0; k < 4; k++) {
      this.positions.set([x, y, z], i * 12 + k * 3);
      this.colors.set([r, g, b, strength], i * 16 + k * 4);
      this.sizes.set([size, reach], i * 8 + k * 2);
    }
  }

  end() {
    for (let i = this.used * 16 + 3; i < this.colors.length; i += 4) this.colors[i] = 0;
    for (let i = this.used * 8; i < this.sizes.length; i += 2) this.sizes[i] = 0;
    this.mesh.updateVerticesData("position", this.positions);
    this.mesh.updateVerticesData("color", this.colors);
    this.mesh.updateVerticesData("uv", this.sizes);
  }
}
