// Builds the diorama at a given set of quality tiers. The whole world is rebuilt
// whenever a geometry-affecting setting changes, which only happens on purchase.
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import type { FxId, TrackId } from '../game/data';
import { buildHero } from './hero';
import { FLAT_COLOURS, getTextures, getWaterNormals } from './textures';
import type { TextureKind } from './textures';

export type GfxConfig = Record<TrackId, number> & { fx: Record<FxId, boolean> };

/** Radial segment counts per Polygon Count tier. */
const RADIAL = [3, 6, 10, 16, 32, 64];
const SPHERE: [number, number][] = [[4, 2], [6, 4], [10, 6], [16, 12], [32, 24], [64, 48]];
const TERRAIN_SEGMENTS = [14, 22, 36, 64, 110, 180];
const ICO_DETAIL = [0, 0, 1, 2, 3, 5];
const TREE_COUNT = [3, 9, 22, 48, 95];
const GRASS_COUNT = [0, 500, 5000, 22000, 70000];
const FLOWER_COUNT = [0, 0, 250, 1400, 4500];
const SHADOW_MAP = [0, 0, 512, 2048, 4096];
/**
 * Performance saver levels (0 = off, 3 = emergency). These cut the real cost of
 * the most expensive tiers without changing what the player owns.
 */
const PERF_INSTANCE_SCALE = [1, 0.5, 0.2, 0.08];
const PERF_SHADOW_CAP = [4096, 1024, 512, 256];
const FLOWER_COLOURS = [0xffffff, 0xffd84d, 0xff7bb5, 0xb48cff, 0xff5d5d, 0x8fd3ff];

export const SUN_DIRECTION = new THREE.Vector3(0.75, 0.3, 0.5).normalize();
const POND = new THREE.Vector2(5.5, 2.5);
const POND_RADIUS = 4.2;
const HERO = new THREE.Vector3(-1.5, 0, 0.5);

const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Terrain height. Flat in the middle, rolling further out, mountains at the rim. */
export function terrainHeight(x: number, z: number): number {
  const r = Math.hypot(x, z);
  const hills = 2.2 * Math.sin(x * 0.09 + 1.3) * Math.cos(z * 0.08 - 0.4) + 1.1 * Math.sin(x * 0.23 + z * 0.19);
  const angle = Math.atan2(z, x);
  const ring = smoothstep(42, 68, r) * (11 + 6 * Math.sin(angle * 6) + 3 * Math.sin(angle * 13 + 1));
  return smoothstep(16, 34, r) * hills + ring;
}

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface MatOptions {
  rough?: number;
  metal?: number;
  /** Replaces the base colour outright. */
  colour?: number;
  /** Multiplies the base colour (texture or flat), for variations on a material. */
  tint?: number;
  textured?: boolean;
  doubleSided?: boolean;
  vertexColors?: boolean;
  transparent?: boolean;
  opacity?: number;
  /** Force at least this lighting tier (water needs specular to read as water). */
  minLighting?: number;
}

const SkyShader = {
  vertexShader: /* glsl */ `
    varying vec3 vDir;
    void main() {
      vDir = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 uTop, uHorizon, uSunDir, uSunColor;
    uniform float uBands, uFlat, uClouds, uSunPower, uGlow, uTime;
    varying vec3 vDir;

    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
    }
    float fbm(vec2 p) {
      float sum = 0.0, amp = 0.5;
      for (int i = 0; i < 5; i++) { sum += amp * noise(p); p = p * 2.03 + vec2(11.7, 3.1); amp *= 0.5; }
      return sum;
    }

    void main() {
      vec3 d = normalize(vDir);
      vec3 col;
      if (uFlat > 0.5) {
        col = mix(uHorizon, uTop, 0.55);
      } else {
        float t = pow(clamp(d.y, 0.0, 1.0), 0.5);
        if (uBands > 0.5) t = floor(t * uBands + 0.5) / uBands;
        col = mix(uHorizon, uTop, t);
      }
      if (uClouds > 0.0 && d.y > 0.0) {
        vec2 p = d.xz / (d.y + 0.18) * 1.3 + vec2(uTime * 0.012, uTime * 0.004);
        float n = fbm(p);
        float edge = 1.0 - uClouds * 0.62;
        float density = smoothstep(edge, edge + 0.22, n);
        // Cheap self-shadowing: compare against a sample taken towards the sun.
        float shade = clamp(0.72 + (n - fbm(p + uSunDir.xz * 0.25)) * 1.6, 0.55, 1.05);
        vec3 cloud = mix(vec3(0.6, 0.66, 0.78), vec3(1.0), shade);
        col = mix(col, cloud, density * smoothstep(0.0, 0.16, d.y) * 0.95);
      }
      float sd = dot(d, uSunDir);
      col = mix(col, uSunColor * uSunPower, smoothstep(0.99925, 0.9996, sd));
      col += uSunColor * uGlow * (pow(max(sd, 0.0), 90.0) * 0.5 + pow(max(sd, 0.0), 10.0) * 0.12);
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export const SKY_TOP = 0x3f7fe0;
export const SKY_HORIZON = 0xcfe3f5;

export class World {
  readonly group = new THREE.Group();
  private readonly time = { value: 0 };
  private readonly animators: ((t: number) => void)[] = [];
  private readonly extras: { dispose(): void }[] = [];
  private readonly cfg: GfxConfig;
  private readonly maxAniso: number;
  private readonly perf: number;
  private dome: THREE.Mesh | null = null;
  private jumpStart = -10;

  constructor(cfg: GfxConfig, maxAnisotropy: number, perf = 0) {
    this.cfg = cfg;
    this.maxAniso = maxAnisotropy;
    this.perf = Math.min(PERF_INSTANCE_SCALE.length - 1, Math.max(0, perf));
    this.addLights();
    this.addTerrain();
    this.addHero();
    this.addProps();
    this.addTrees();
    this.addGrass();
    this.addFlowers();
    this.addWater();
    this.addSky();
    if (cfg.lighting >= 5) this.addPuddles();
  }

  update(t: number, camera: THREE.PerspectiveCamera): void {
    this.time.value = t;
    for (const fn of this.animators) fn(t);
    if (this.dome) {
      // The sky follows the camera and always sits just inside the far plane.
      this.dome.position.copy(camera.position);
      this.dome.scale.setScalar(camera.far * 0.9);
    }
  }

  /** The gameplay. */
  jump(): void {
    if (this.time.value - this.jumpStart > 0.7) this.jumpStart = this.time.value;
  }

  dispose(): void {
    this.group.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const m = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(m)) m.forEach((x) => x.dispose());
      else if (m) m.dispose();
    });
    for (const x of this.extras) x.dispose();
  }

  // ---------------------------------------------------------------- materials

  private mat(kind: TextureKind, o: MatOptions = {}): THREE.Material {
    const L = Math.max(this.cfg.lighting, o.minLighting ?? 0);
    const tex = o.textured === false ? { map: null, bumpMap: null } : getTextures(kind, this.cfg.textures, this.maxAniso);
    const colour = new THREE.Color(o.colour ?? (tex.map ? 0xffffff : FLAT_COLOURS[kind]));
    if (o.tint !== undefined) colour.multiply(new THREE.Color(o.tint));
    const base = {
      map: tex.map,
      color: colour,
      side: o.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
      vertexColors: o.vertexColors ?? false,
      transparent: o.transparent ?? false,
      opacity: o.opacity ?? 1,
    };
    const rough = o.rough ?? 0.85;
    const metal = o.metal ?? 0;
    if (L === 0) return new THREE.MeshBasicMaterial(base);
    if (L === 1) return new THREE.MeshLambertMaterial({ ...base, flatShading: true });
    if (L === 2) {
      return new THREE.MeshPhongMaterial({ ...base, shininess: 8 + 90 * (1 - rough), specular: metal > 0.5 ? 0x999999 : 0x222222 });
    }
    const rayTraced = L >= 5;
    return new THREE.MeshStandardMaterial({
      ...base,
      roughness: rayTraced && metal > 0.5 ? 0.08 : rough,
      metalness: metal,
      bumpMap: tex.bumpMap,
      bumpScale: tex.bumpMap ? 1.5 : 1,
    });
  }

  /** Adds a time uniform and a wind sway to an instanced material. */
  private addSway(material: THREE.Material, amplitude: string): void {
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.time;
      shader.vertexShader =
        'uniform float uTime;\n' +
        shader.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          #ifdef USE_INSTANCING
            float swayPhase = uTime * 1.7 + instanceMatrix[3].x * 0.6 + instanceMatrix[3].z * 0.4 + instanceMatrix[3].y * 9.0;
            transformed.x += sin(swayPhase) * ${amplitude};
          #endif`,
        );
    };
    material.customProgramCacheKey = () => `sway:${amplitude}`;
  }

  private add<T extends THREE.Object3D>(obj: T, parent: THREE.Object3D = this.group): T {
    parent.add(obj);
    return obj;
  }

  private mesh(geo: THREE.BufferGeometry, material: THREE.Material, parent?: THREE.Object3D): THREE.Mesh {
    const m = new THREE.Mesh(geo, material);
    const shadows = this.cfg.shadows >= 2;
    m.castShadow = shadows;
    m.receiveShadow = shadows;
    return this.add(m, parent);
  }

  private sphere(radius: number, phiLength = Math.PI): THREE.SphereGeometry {
    const [w, h] = SPHERE[this.cfg.polygons];
    return new THREE.SphereGeometry(radius, w, h, 0, Math.PI * 2, 0, phiLength);
  }

  private cylinder(top: number, bottom: number, height: number): THREE.CylinderGeometry {
    return new THREE.CylinderGeometry(top, bottom, height, RADIAL[this.cfg.polygons], 1);
  }

  // ------------------------------------------------------------------- pieces

  private addLights(): void {
    const L = this.cfg.lighting;
    const S = this.cfg.shadows;
    const sun = new THREE.DirectionalLight(0xfff0dd, L >= 4 ? 2.3 : L >= 3 ? 2.7 : 2.4);
    sun.position.copy(SUN_DIRECTION).multiplyScalar(45);
    if (S >= 2) {
      sun.castShadow = true;
      sun.shadow.mapSize.setScalar(Math.min(SHADOW_MAP[S], PERF_SHADOW_CAP[this.perf]));
      const cam = sun.shadow.camera;
      cam.left = cam.bottom = -24;
      cam.right = cam.top = 24;
      cam.near = 1;
      cam.far = 110;
      sun.shadow.bias = -0.0006;
      sun.shadow.normalBias = 0.04;
      sun.shadow.radius = S >= 3 ? 4 : 1;
    }
    this.add(sun);
    this.add(sun.target);
    this.add(new THREE.AmbientLight(0x9fb4d8, L >= 4 ? 0.3 : 1.0));
    if (L >= 4) this.add(new THREE.HemisphereLight(0xa9ccff, 0x55683a, 0.45));
  }

  private addTerrain(): void {
    const segs = TERRAIN_SEGMENTS[this.cfg.polygons];
    const geo = new THREE.PlaneGeometry(150, 150, segs, segs);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const uv = geo.attributes.uv;
    const colours = new Float32Array(pos.count * 3);
    const grass = new THREE.Color(1, 1, 1);
    const rock = new THREE.Color(0.75, 0.72, 0.78);
    const snow = new THREE.Color(1.6, 1.65, 1.8);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const h = terrainHeight(pos.getX(i), pos.getZ(i));
      pos.setY(i, h);
      uv.setXY(i, uv.getX(i) * 30, uv.getY(i) * 30);
      c.copy(grass).lerp(rock, smoothstep(4, 9, h)).lerp(snow, smoothstep(12, 17, h));
      colours.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colours, 3));
    geo.computeVertexNormals();
    const ground = this.mesh(geo, this.mat('grass', { vertexColors: true, rough: 0.95 }));
    ground.castShadow = false;
  }

  private addHero(): void {
    const hero = buildHero({
      cfg: this.cfg,
      instanceScale: PERF_INSTANCE_SCALE[this.perf],
      time: this.time,
      mat: (kind, o) => this.mat(kind, o),
      mesh: (geo, material, parent) => this.mesh(geo, material, parent),
    });
    hero.group.position.copy(HERO);
    hero.group.scale.setScalar(1.5);
    hero.group.rotation.y = 0.5;
    this.add(hero.group);
    this.animators.push((t) => {
      hero.update(t);
      const j = (t - this.jumpStart) / 0.7;
      hero.group.position.y = j > 0 && j < 1 ? 4.4 * j * (1 - j) : 0;
    });
    this.blob(HERO.x, HERO.z, 0.95);
  }

  private blobs: { x: number; z: number; r: number }[] = [];

  private blob(x: number, z: number, r: number): void {
    this.blobs.push({ x, z, r });
  }

  private addProps(): void {
    const crate = this.mesh(new THREE.BoxGeometry(1.1, 1.1, 1.1), this.mat('crate', { rough: 0.8 }));
    crate.position.set(-4.4, 0.55, -2.4);
    crate.rotation.y = 0.4;
    this.blob(-4.4, -2.4, 1.0);
    const barrel = this.mesh(this.cylinder(0.45, 0.45, 1.15), this.mat('barrel', { rough: 0.75 }));
    barrel.position.set(-3.1, 0.575, -3.5);
    this.blob(-3.1, -3.5, 0.75);

    const rand = rng(11);
    const geo = new THREE.IcosahedronGeometry(1, ICO_DETAIL[this.cfg.polygons]);
    const rocks = new THREE.InstancedMesh(geo, this.mat('rock', { rough: 0.9 }), 16);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    for (let i = 0; i < 16; ) {
      const a = rand() * Math.PI * 2;
      const r = 4 + rand() * 26;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (Math.hypot(x - POND.x, z - POND.y) < POND_RADIUS + 1.2 || Math.hypot(x - HERO.x, z - HERO.z) < 2.5) continue;
      const s = 0.35 + rand() * 0.9;
      q.setFromEuler(e.set(rand() * 3, rand() * 3, rand() * 3));
      m.compose(new THREE.Vector3(x, terrainHeight(x, z) + s * 0.25, z), q, new THREE.Vector3(s * 1.3, s * 0.8, s));
      rocks.setMatrixAt(i, m);
      this.blob(x, z, s * 1.2);
      i++;
    }
    rocks.castShadow = rocks.receiveShadow = this.cfg.shadows >= 2;
    this.add(rocks);
  }

  private addTrees(): void {
    const count = TREE_COUNT[this.cfg.foliage];
    const rand = rng(5);
    // Decide every tree up front so lower foliage tiers are a strict subset of higher ones.
    const trees: { x: number; y: number; z: number; s: number; turn: number; leafy: boolean; shade: number }[] = [];
    while (trees.length < count) {
      const a = rand() * Math.PI * 2;
      const r = 17 + rand() ** 1.4 * 40;
      const s = 0.8 + rand() * 0.9;
      const turn = rand() * 6;
      const leafy = rand() < 0.32;
      const shade = 0.78 + rand() * 0.4;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (Math.hypot(x - POND.x, z - POND.y) < POND_RADIUS + 2) continue;
      trees.push({ x, y: terrainHeight(x, z) - 0.15, z, s, turn, leafy, shade });
    }
    const pines = trees.filter((t) => !t.leafy);
    const leafy = trees.filter((t) => t.leafy);
    const radial = RADIAL[this.cfg.polygons];
    const shadows = this.cfg.shadows >= 2;
    const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.26, 2.2, radial, 1), this.mat('bark', { rough: 0.9 }), trees.length);
    const cones = new THREE.InstancedMesh(new THREE.ConeGeometry(1.5, 2.4, radial, 1), this.mat('leaves', { rough: 0.8 }), Math.max(1, pines.length * 3));
    const crowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, ICO_DETAIL[this.cfg.polygons]), this.mat('leaves', { rough: 0.8 }), Math.max(1, leafy.length * 2));
    cones.count = pines.length * 3;
    crowns.count = leafy.length * 2;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const yAxis = new THREE.Vector3(0, 1, 0);
    const tint = new THREE.Color();
    trees.forEach((t, i) => {
      q.setFromAxisAngle(yAxis, t.turn);
      m.compose(new THREE.Vector3(t.x, t.y + 1.1 * t.s, t.z), q, new THREE.Vector3(t.s, t.s, t.s));
      trunks.setMatrixAt(i, m);
      this.blob(t.x, t.z, 1.7 * t.s);
    });
    pines.forEach((t, i) => {
      q.setFromAxisAngle(yAxis, t.turn);
      for (let k = 0; k < 3; k++) {
        const ls = t.s * (1 - k * 0.24);
        m.compose(new THREE.Vector3(t.x, t.y + (2.6 + k * 1.25) * t.s, t.z), q, new THREE.Vector3(ls, t.s, ls));
        cones.setMatrixAt(i * 3 + k, m);
        cones.setColorAt(i * 3 + k, tint.setRGB(t.shade * 0.92, t.shade, t.shade * 0.95));
      }
    });
    leafy.forEach((t, i) => {
      q.setFromAxisAngle(yAxis, t.turn);
      const s = t.s;
      m.compose(new THREE.Vector3(t.x, t.y + 3.3 * s, t.z), q, new THREE.Vector3(1.75 * s, 1.5 * s, 1.75 * s));
      crowns.setMatrixAt(i * 2, m);
      m.compose(new THREE.Vector3(t.x + Math.cos(t.turn) * 0.9 * s, t.y + 4.2 * s, t.z + Math.sin(t.turn) * 0.9 * s), q, new THREE.Vector3(1.15 * s, 1.05 * s, 1.15 * s));
      crowns.setMatrixAt(i * 2 + 1, m);
      // Broadleaf crowns lean warmer and lighter than the pines.
      tint.setRGB(t.shade * 1.25, t.shade * 1.12, t.shade * 0.7);
      crowns.setColorAt(i * 2, tint);
      crowns.setColorAt(i * 2 + 1, tint);
    });
    for (const inst of [trunks, cones, crowns]) {
      if (inst.count === 0) {
        inst.geometry.dispose();
        (inst.material as THREE.Material).dispose();
        continue;
      }
      inst.castShadow = inst.receiveShadow = shadows;
      inst.frustumCulled = false;
      this.add(inst);
    }
  }

  private addGrass(): void {
    const count = Math.round(GRASS_COUNT[this.cfg.foliage] * PERF_INSTANCE_SCALE[this.perf]);
    if (!count) return;
    const detailed = this.cfg.polygons >= 3;
    const geo = new THREE.BufferGeometry();
    const w = 0.05;
    const verts = detailed
      ? [-w, 0, 0, w, 0, 0, -w * 0.6, 0.5, 0.04, w, 0, 0, w * 0.6, 0.5, 0.04, -w * 0.6, 0.5, 0.04, -w * 0.6, 0.5, 0.04, w * 0.6, 0.5, 0.04, 0, 1, 0.16]
      : [-w, 0, 0, w, 0, 0, 0, 1, 0];
    const n = verts.length / 3;
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(n).fill([0, 1, 0]).flat(), 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(n * 2).fill(0.5), 2));
    // Darker at the root, lighter at the tip, so a dense lawn has some depth to it.
    const shades: number[] = [];
    for (let i = 0; i < n; i++) {
      const k = 0.45 + 0.65 * verts[i * 3 + 1];
      shades.push(k, k, k);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(shades, 3));
    const material = this.mat('grass', { colour: 0xffffff, textured: false, doubleSided: true, rough: 0.8, vertexColors: true });
    this.addSway(material, '0.22 * position.y * position.y');
    const grass = new THREE.InstancedMesh(geo, material, count);
    const rand = rng(31);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const yAxis = new THREE.Vector3(0, 1, 0);
    const tint = new THREE.Color();
    for (let i = 0; i < count; ) {
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(rand()) * 34;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (Math.hypot(x - POND.x, z - POND.y) < POND_RADIUS + 0.1) continue;
      // Leave a small clearing so blades do not grow through the hero's boots and sword.
      if (Math.hypot(x - HERO.x, z - HERO.z) < 0.75) continue;
      q.setFromAxisAngle(yAxis, rand() * Math.PI * 2);
      const h = 0.3 + rand() * 0.5;
      m.compose(new THREE.Vector3(x, terrainHeight(x, z) - 0.02, z), q, new THREE.Vector3(1.2, h, 1.2));
      grass.setMatrixAt(i, m);
      const dry = rand();
      grass.setColorAt(i, tint.setRGB(0.24 + dry * 0.22, 0.5 + rand() * 0.2, 0.12 + rand() * 0.08, THREE.SRGBColorSpace));
      i++;
    }
    grass.castShadow = false;
    grass.receiveShadow = this.cfg.shadows >= 2;
    grass.frustumCulled = false;
    this.add(grass);
  }

  private addFlowers(): void {
    const count = Math.round(FLOWER_COUNT[this.cfg.foliage] * PERF_INSTANCE_SCALE[this.perf]);
    if (!count) return;
    const material = this.mat('cloth', { colour: 0xffffff, textured: false, rough: 0.6 });
    const flowers = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.075, this.cfg.polygons >= 4 ? 1 : 0), material, count);
    const rand = rng(63);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const tint = new THREE.Color();
    for (let i = 0; i < count; ) {
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(rand()) * 30;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const lift = 0.3 + rand() * 0.22;
      const s = 0.7 + rand() * 0.8;
      const colour = FLOWER_COLOURS[Math.floor(rand() * FLOWER_COLOURS.length)];
      if (Math.hypot(x - POND.x, z - POND.y) < POND_RADIUS + 0.2) continue;
      m.compose(new THREE.Vector3(x, terrainHeight(x, z) + lift, z), q, new THREE.Vector3(s, s * 0.6, s));
      flowers.setMatrixAt(i, m);
      flowers.setColorAt(i, tint.set(colour));
      i++;
    }
    flowers.castShadow = false;
    flowers.receiveShadow = this.cfg.shadows >= 2;
    flowers.frustumCulled = false;
    this.add(flowers);
  }

  private addWater(): void {
    const W = this.cfg.water;
    const y = 0.05;
    if (W === 0) {
      // It is blue, so it is water.
      const slab = this.add(new THREE.Mesh(new THREE.PlaneGeometry(7.4, 7.4), new THREE.MeshBasicMaterial({ color: 0x1f4fd8 })));
      slab.rotation.x = -Math.PI / 2;
      slab.position.set(POND.x, y, POND.y);
      return;
    }
    const radial = Math.max(8, RADIAL[this.cfg.polygons]);
    if (W === 1) {
      const geo = new THREE.RingGeometry(0.001, POND_RADIUS, radial, 6);
      geo.rotateX(-Math.PI / 2);
      const material = this.mat('metal', { colour: 0x2f74d6, textured: false, rough: 0.4 });
      const water = this.add(new THREE.Mesh(geo, material));
      water.position.set(POND.x, y, POND.y);
      water.receiveShadow = this.cfg.shadows >= 2;
      const pos = geo.attributes.position;
      const base = (material as THREE.MeshBasicMaterial).color.clone();
      this.animators.push((t) => {
        for (let i = 0; i < pos.count; i++) pos.setY(i, Math.sin(t * 2 + pos.getX(i) * 1.6 + pos.getZ(i)) * 0.035);
        pos.needsUpdate = true;
        (material as THREE.MeshBasicMaterial).color.copy(base).multiplyScalar(0.92 + 0.08 * Math.sin(t * 3));
      });
      return;
    }
    const normals = getWaterNormals();
    normals.repeat.set(3, 3);
    const circle = new THREE.CircleGeometry(POND_RADIUS, Math.max(24, radial));
    circle.rotateX(-Math.PI / 2);
    const mirrored = W >= 3 && this.perf < 2;
    if (mirrored) {
      const size = this.perf >= 1 ? 512 : 1024;
      const mirrorGeo = new THREE.CircleGeometry(POND_RADIUS, Math.max(24, radial));
      const mirror = new Reflector(mirrorGeo, { textureWidth: size, textureHeight: size, color: 0x77808a, clipBias: 0.003 });
      mirror.rotation.x = -Math.PI / 2;
      mirror.position.set(POND.x, y, POND.y);
      this.add(mirror);
      this.extras.push(mirror);
    }
    const surface = this.mat('metal', {
      colour: mirrored ? 0x7fb0d0 : 0x1d5f96,
      textured: false,
      rough: 0.06,
      metal: 0.2,
      transparent: true,
      opacity: mirrored ? 0.16 : 0.74,
      minLighting: 2,
    }) as THREE.MeshPhongMaterial | THREE.MeshStandardMaterial;
    surface.normalMap = normals;
    surface.normalScale = new THREE.Vector2(0.5, 0.5);
    surface.depthWrite = false;
    if (mirrored && surface instanceof THREE.MeshStandardMaterial) surface.envMapIntensity = 0.15;
    if (surface instanceof THREE.MeshPhongMaterial) {
      surface.shininess = 160;
      surface.specular.set(0xffffff);
    }
    const water = this.add(new THREE.Mesh(circle, surface));
    water.position.set(POND.x, y + 0.02, POND.y);
    water.receiveShadow = this.cfg.shadows >= 2;
    this.animators.push((t) => normals.offset.set(t * 0.03, t * 0.021));
  }

  private addPuddles(): void {
    // Ray tracing has been enabled, so the ground is now inexplicably wet.
    const material = new THREE.MeshStandardMaterial({ color: 0x151a20, metalness: 1, roughness: 0.03 });
    const spots: [number, number, number][] = [[-3.4, 3.2, 1.1], [0.6, -3.6, 0.9], [-6.5, 0.8, 0.8], [2.2, 8.2, 1.3], [-1.2, -7.4, 1.0], [-8.4, -5.6, 1.2]];
    for (const [x, z, r] of spots) {
      const geo = new THREE.CircleGeometry(r, 28);
      geo.rotateX(-Math.PI / 2);
      const puddle = this.add(new THREE.Mesh(geo, material));
      puddle.position.set(x, 0.025, z);
      puddle.scale.set(1, 1, 0.7);
      puddle.receiveShadow = true;
    }
  }

  private addSky(): void {
    const D = this.cfg.drawDistance;
    const L = this.cfg.lighting;
    // Sky dome: gradient, sun and (at the better lighting tiers) drifting clouds.
    const cloudAmount = L >= 3 ? [0, 0, 0.55, 0.7, 0.8][D] : 0;
    const sky = new THREE.ShaderMaterial({
      uniforms: {
        uTop: { value: new THREE.Color(SKY_TOP) },
        uHorizon: { value: new THREE.Color(SKY_HORIZON) },
        uSunDir: { value: SUN_DIRECTION },
        uSunColor: { value: new THREE.Color(1, 0.9, 0.66) },
        uBands: { value: L === 1 ? 6 : 0 },
        uFlat: { value: L === 0 ? 1 : 0 },
        uClouds: { value: cloudAmount },
        // An HDR sun feeds the bloom pass; the cheap tiers get a plain disc.
        uSunPower: { value: L >= 2 ? 7 : 1.15 },
        uGlow: { value: L >= 2 ? 1 : 0 },
        uTime: this.time,
      },
      vertexShader: SkyShader.vertexShader,
      fragmentShader: SkyShader.fragmentShader,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
    });
    const dome = this.add(new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), sky));
    dome.renderOrder = -1000;
    dome.frustumCulled = false;
    this.dome = dome;

    // Below "physically based" lighting, clouds are just squashed spheres.
    if (D >= 2 && L < 3) {
      const clouds = this.add(new THREE.Group());
      const cloudMat = L === 0 ? new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }) : new THREE.MeshLambertMaterial({ color: 0xffffff, fog: false, emissive: 0x556677 });
      const rand = rng(99);
      for (let i = 0; i < 9; i++) {
        const a = rand() * Math.PI * 2;
        const r = 22 + rand() * 60;
        for (let k = 0; k < 3; k++) {
          const puff = new THREE.Mesh(this.sphere(3 + rand() * 3), cloudMat);
          puff.position.set(Math.cos(a) * r + (k - 1) * 4.2, 21 + rand() * 12 + (k === 1 ? 1.2 : 0), Math.sin(a) * r + rand() * 2);
          puff.scale.y = 0.55;
          clouds.add(puff);
        }
      }
      this.animators.push((t) => (clouds.rotation.y = t * 0.012));
    }

    if (D >= 4) {
      // Mountains you will never be allowed to visit.
      const far = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, Math.max(5, RADIAL[this.cfg.polygons]), 1), new THREE.MeshLambertMaterial({ color: 0x7f93b4 }), 22);
      const rand = rng(404);
      const m = new THREE.Matrix4();
      for (let i = 0; i < 22; i++) {
        const a = (i / 22) * Math.PI * 2 + rand() * 0.2;
        const r = 420 + rand() * 160;
        const h = 90 + rand() * 130;
        m.compose(new THREE.Vector3(Math.cos(a) * r, h / 2 - 8, Math.sin(a) * r), new THREE.Quaternion(), new THREE.Vector3(80 + rand() * 60, h, 80 + rand() * 60));
        far.setMatrixAt(i, m);
      }
      far.frustumCulled = false;
      this.add(far);
    }

    // Blob shadows: used on their own at tier 1 and as "contact shadows" at the top tier.
    const S = this.cfg.shadows;
    if (S === 1 || S === 4) {
      const geo = new THREE.CircleGeometry(1, Math.max(8, RADIAL[this.cfg.polygons]));
      geo.rotateX(-Math.PI / 2);
      const material = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: S === 1 ? 0.38 : 0.22, depthWrite: false });
      const blobs = new THREE.InstancedMesh(geo, material, this.blobs.length);
      const m = new THREE.Matrix4();
      this.blobs.forEach((b, i) => {
        const r = S === 1 ? b.r : b.r * 0.6;
        m.compose(new THREE.Vector3(b.x, terrainHeight(b.x, b.z) + 0.035, b.z), new THREE.Quaternion(), new THREE.Vector3(r, 1, r));
        blobs.setMatrixAt(i, m);
      });
      blobs.frustumCulled = false;
      blobs.renderOrder = 1;
      this.add(blobs);
    }
  }
}
