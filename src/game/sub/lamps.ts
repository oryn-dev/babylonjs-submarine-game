import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { SpotLight } from "@babylonjs/core/Lights/spotLight";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import { makeShader } from "../gfx/shader";
import { WATER_FUNCTIONS, WATER_UNIFORMS, type Water } from "../gfx/water";
import type { Glows } from "../world/backdrop";

const MOUNTS = [new Vector3(-0.72, 1.08, 1.75), new Vector3(0.72, 1.08, 1.75)];
const LENGTH = 36;
/** Radius at the lamp, growth per metre, and how far each beam turns out and down. */
const WIDTH = 0.24;
const SPREAD = 0.07;
const TOE = 0.16;
const DIP = 0.02;
const STEPS = 14;

/** Two headlights: one wide spot for the surfaces, a cone of lit water each, and a soft fill so the hull stays readable. */
export class Lamps {
  readonly spot: SpotLight;
  private fill: PointLight;
  private cone: Mesh;
  private shader;
  private level = 0;
  /** Direction the beam points, eased towards the view. */
  readonly direction = new Vector3(0, 0, 1);

  constructor(scene: Scene, private water: Water, private hull: TransformNode, hullMeshes: Mesh[]) {
    this.spot = new SpotLight("headlights", Vector3.Zero(), new Vector3(0, 0, 1), 2.4, 8, scene);
    this.spot.diffuse.set(1, 0.93, 0.78);
    this.spot.specular.set(0.5, 0.48, 0.42);
    this.spot.falloffType = SpotLight.FALLOFF_STANDARD;
    this.spot.intensity = 0;
    this.fill = new PointLight("hull-fill", new Vector3(0, 3.4, -4.6), scene);
    this.fill.parent = hull;
    this.fill.diffuse.set(0.55, 0.8, 0.95);
    this.fill.specular.set(0.06, 0.08, 0.09);
    this.fill.falloffType = PointLight.FALLOFF_STANDARD;
    this.fill.range = 26;
    this.fill.includedOnlyMeshes = hullMeshes;

    const positions: number[] = [];
    const normals: number[] = [];
    const axes: number[] = [];
    const indices: number[] = [];
    const ring = 24;
    for (const mount of MOUNTS) {
      const base = positions.length / 3;
      const axis = new Vector3(Math.sign(mount.x) * TOE, -DIP, 1).normalize();
      const side = Vector3.Cross(Vector3.Up(), axis).normalize();
      const up = Vector3.Cross(axis, side);
      for (let r = 0; r <= 8; r++) for (let i = 0; i <= ring; i++) {
        const a = (i / ring) * Math.PI * 2;
        const along = Math.pow(r / 8, 1.5) * LENGTH;
        const p = mount.add(axis.scale(along)).add(side.scale(Math.cos(a) * (WIDTH + along * SPREAD))).add(up.scale(Math.sin(a) * (WIDTH + along * SPREAD)));
        positions.push(p.x, p.y, p.z);
        normals.push(mount.x, mount.y, mount.z);
        axes.push(axis.x, axis.y, axis.z, 0);
      }
      for (let r = 0; r < 8; r++) for (let i = 0; i < ring; i++) {
        const p = base + r * (ring + 1) + i;
        indices.push(p, p + ring + 2, p + 1, p, p + ring + 1, p + ring + 2);
      }
    }
    this.cone = new Mesh("beams", scene);
    // The normal carries the lamp's place, the tangent the beam's axis.
    Object.assign(new VertexData(), { positions, normals, tangents: axes, indices }).applyToMesh(this.cone);
    this.cone.parent = hull;
    this.cone.isPickable = false;
    this.cone.alwaysSelectAsActiveMesh = true;
    this.cone.alphaIndex = 7;
    const step = (i: number) => `
q = rel + ray * ((${i}.0 + grain) / ${STEPS}.0 * path);
along = dot(q, axis);
edge = clamp(1.0 - length(q - axis * along) / (${WIDTH} + along * ${SPREAD}), 0.0, 1.0);
dust = TEX(causticMap, (q.xz + apex.xz) * 0.09 + vec2(q.y * 0.11, u_zenith.w * 0.012)).g;
total = total + edge * edge * (3.0 - 2.0 * edge) * exp(-along * 0.11) * (1.0 - smoothstep(10.0, ${LENGTH}.0, along)) * smoothstep(-0.1, 0.6, along) * (0.35 + 1.3 * dust);`;
    this.shader = water.track(makeShader(scene, "beams", {
      attributes: { a_position: "vec3", a_normal: "vec3", a_tangent: "vec4" },
      varyings: { v_pos: "vec3", v_apex: "vec3", v_axis: "vec3" },
      uniforms: { ...WATER_UNIFORMS, u_level: "float" },
      samplers: ["causticMap"],
      shared: WATER_FUNCTIONS,
      vertex: `
vec4 p = u_world * vec4(a_position, 1.0);
vec4 lamp = u_world * vec4(a_normal, 1.0);
v_pos = p.xyz;
v_apex = lamp.xyz;
v_axis = (u_world * vec4(a_tangent.xyz, 0.0)).xyz;
POSITION = u_viewProjection * p;`,
      // Light scattered towards the eye, summed along the ray through the cone.
      fragment: `
vec3 axis = normalize(v_axis);
vec3 apex = v_apex;
vec3 ray = normalize(v_pos - u_eye);
vec3 rel = v_pos - apex;
float fwd = dot(ray, axis);
float start = dot(rel, axis);
float across = length(ray - axis * fwd);
float path = min((${LENGTH}.0 - start) / max(fwd, 0.05), (${WIDTH} + start * ${SPREAD}) * 2.0 / max(across - fwd * ${SPREAD}, 0.02));
float grain = fract(sin(dot(ray, vec3(1219.9, 7823.3, 3711.7))) * 4375.54);
vec3 q = rel;
float along = 0.0;
float edge = 0.0;
float dust = 0.0;
float total = 0.0;
${Array.from({ length: STEPS }, (_, i) => step(i)).join("")}
total = total * path / ${STEPS}.0;
COLOR = vec4(mix(vec3(1.0, 0.94, 0.74), vec3(0.35, 0.75, 0.8), clamp(start / 14.0, 0.0, 1.0)), (1.0 - exp(-total * u_level * 0.42)) * smoothstep(1.0, 4.0, length(u_eye - v_pos)));`,
      blend: "add",
    }));
    this.shader.setTexture("causticMap", water.caustics);
    this.shader.backFaceCulling = true;
    this.cone.material = this.shader;
  }

  update(dt: number, forward: Vector3, aim: Vector3, on: boolean, reach: number, glows: Glows) {
    const dark = this.water.darkness;
    const day = Math.min(1, this.water.depth / 40);
    this.level += ((on ? 1 : 0) - this.level) * Math.min(1, dt * 6);
    const goal = forward.scale(0.45).add(aim.scale(0.55)).normalize();
    Vector3.LerpToRef(this.direction, goal, 1 - Math.exp(-dt * 5), this.direction);
    this.direction.normalize();
    const matrix = this.hull.getWorldMatrix();
    const at = Vector3.TransformCoordinates(new Vector3(0, 0.9, 1.9), matrix);
    this.spot.position.copyFrom(at);
    this.spot.direction.copyFrom(this.direction);
    this.spot.range = reach * 2.1;
    this.spot.intensity = this.level * (0.06 + day * 0.14 + dark * 1.1) * (26 + reach * 0.9);
    this.fill.intensity = this.level * dark * 3.2 + dark * 0.8;
    const strength = this.level * (0.03 + 0.16 * Math.min(1, this.water.depth / 60) + 0.4 * dark);
    this.shader.setFloat("u_level", strength);
    this.cone.setEnabled(strength > 0.004);
    if (this.level > 0.03) for (const mount of MOUNTS) {
      const p = Vector3.TransformCoordinates(mount, matrix);
      const facing = Math.max(0, Vector3.Dot(this.water.eye.subtract(p).normalize(), this.direction));
      glows.add(p.x, p.y, p.z, 0.55 + facing * 1.6 + dark * 0.35, 1, 0.9, 0.66, this.level * (0.35 + dark * 0.4), 0.5);
    }
  }
}
