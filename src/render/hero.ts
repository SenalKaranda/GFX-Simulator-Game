// The hero: a knight resting both hands on a planted sword.
//
// One skeleton serves every Polygon Count tier. The cheap tiers hang crude
// prisms on it (no elbows, no face); the expensive ones add a shaped torso,
// bent limbs, armour, a face, a cape and properly combed hair.
import * as THREE from 'three';
import type { TextureKind } from './textures';
import type { GfxConfig, MatOptions } from './world';

export interface HeroKit {
  cfg: GfxConfig;
  /** Multiplier on strand counts while the performance saver is active. */
  instanceScale: number;
  time: { value: number };
  mat(kind: TextureKind, o?: MatOptions): THREE.Material;
  /** Creates a mesh with the right shadow flags and attaches it to `parent`. */
  mesh(geo: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D): THREE.Mesh;
}

export interface Hero {
  group: THREE.Group;
  update(t: number): void;
}

type V3 = THREE.Vector3;
type Profile = [y: number, radius: number][];

/** Detail per Polygon Count tier. */
const RADIAL = [3, 6, 8, 12, 20, 32];
const ROUND: [number, number][] = [[4, 2], [6, 4], [8, 6], [12, 8], [20, 14], [28, 20]];
const LATHE = [3, 6, 8, 16, 28, 48];

const HAIR_STRANDS = [0, 0, 110, 4500, 26000];
const HAIR_WIDTH = [0, 0, 0.03, 0.0062, 0.0032];
const HAIR_SEGMENTS = [0, 0, 5, 5, 6];
const HAIR_COLOUR = 0x3d2414;
/** The scalp is a cap around an axis tilted back, so the hairline sits high in front and low behind. */
const SCALP_TILT = 0.61;
const SCALP_AXIS = new THREE.Vector3(0, Math.cos(SCALP_TILT), -Math.sin(SCALP_TILT));
const SCALP_ANGLE = (85 * Math.PI) / 180;

/** Head ellipsoid radii (x, y, z) and where its centre sits. */
const HEAD = new THREE.Vector3(0.124, 0.158, 0.146);
const HEAD_CENTRE = new THREE.Vector3(0, 1.745, 0.012);
/**
 * Silhouette of the detailed head, tapering to a defined chin. It must stay
 * inside the HEAD ellipsoid everywhere, because the hair is laid over that.
 */
const HEAD_PROFILE: Profile = [
  [-0.158, 0.001], [-0.153, 0.03], [-0.135, 0.062], [-0.1, 0.088], [-0.05, 0.108], [0, 0.1225],
  [0.04, 0.1185], [0.085, 0.1035], [0.122, 0.078], [0.148, 0.043], [0.158, 0.001],
];

/** Tabard skirt, from mid-thigh up to the belt. */
const SKIRT: Profile = [[0.75, 0.208], [0.84, 0.2], [0.95, 0.188], [1.03, 0.178], [1.095, 0.168]];

const UP = new THREE.Vector3(0, 1, 0);
const v = (x: number, y: number, z: number): V3 => new THREE.Vector3(x, y, z);

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildHero(kit: HeroKit): Hero {
  const P = kit.cfg.polygons;
  const group = new THREE.Group();

  // ------------------------------------------------------------- materials
  const steel = kit.mat('metal', { rough: 0.32, metal: 1 });
  const tabard = kit.mat('cloth', { rough: 0.9 });
  const tabardOpen = kit.mat('cloth', { rough: 0.9, doubleSided: true });
  const slate = kit.mat('linen', { tint: 0x4d566b, rough: 0.85 });
  const leather = kit.mat('leather', { rough: 0.7 });
  const skin = kit.mat('skin', { rough: 0.55 });

  // --------------------------------------------------------------- helpers
  const ball = (radius: number, material: THREE.Material, parent: THREE.Object3D, at: V3, scale?: V3): THREE.Mesh => {
    const [w, h] = ROUND[P];
    const m = kit.mesh(new THREE.SphereGeometry(radius, w, h), material, parent);
    m.position.copy(at);
    if (scale) m.scale.copy(scale);
    return m;
  };

  /** A tapered segment from `a` to `b`, with rounded joints once the tier can afford them. */
  const limb = (a: V3, b: V3, ra: number, rb: number, material: THREE.Material, parent: THREE.Object3D = group): THREE.Mesh => {
    const m = kit.mesh(new THREE.CylinderGeometry(rb, ra, a.distanceTo(b), RADIAL[P], 1), material, parent);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(UP, b.clone().sub(a).normalize());
    if (P >= 3) {
      ball(ra, material, parent, a);
      ball(rb, material, parent, b);
    }
    return m;
  };

  /** A surface of revolution from a bottom-to-top profile, flattened front to back by `depth`. */
  const lathe = (profile: Profile, material: THREE.Material, parent: THREE.Object3D, depth = 1): THREE.Mesh => {
    const points = profile.map(([y, r]) => new THREE.Vector2(r, y));
    const m = kit.mesh(new THREE.LatheGeometry(points, LATHE[P]), material, parent);
    m.scale.z = depth;
    return m;
  };

  const box = (w: number, h: number, d: number, material: THREE.Material, parent: THREE.Object3D, at: V3): THREE.Mesh => {
    const m = kit.mesh(new THREE.BoxGeometry(w, h, d), material, parent);
    m.position.copy(at);
    return m;
  };

  const detail = (m: THREE.Mesh): THREE.Mesh => {
    m.castShadow = false;
    return m;
  };

  /** Adds a time-driven offset to a material's vertices, weighted by `uv.y`. */
  const sway = (material: THREE.Material, expression: string): void => {
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = kit.time;
      shader.vertexShader =
        'uniform float uTime;\n' +
        shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n${expression}`);
    };
    material.customProgramCacheKey = () => `hero-sway:${expression}`;
  };

  // ------------------------------------------------------------------ legs
  for (const side of [-1, 1]) {
    const hip = v(side * 0.095, 0.95, 0);
    const knee = v(side * 0.105, 0.52, 0.02);
    const ankle = v(side * 0.11, 0.1, -0.005);
    if (P <= 1) {
      // No knees yet: one straight prism per leg.
      limb(hip, v(side * 0.11, 0.02, 0), 0.085, 0.06, P === 0 ? steel : slate);
      continue;
    }
    limb(hip, knee, 0.09, 0.066, slate);
    limb(knee, ankle, 0.064, 0.047, P >= 3 ? slate : steel);
    // Boots.
    limb(v(ankle.x, 0.3, 0.004), v(ankle.x, 0.06, -0.005), 0.07, 0.056, leather);
    const foot = kit.mesh(new THREE.CapsuleGeometry(0.052, 0.13, 4, RADIAL[P]), leather, group);
    foot.rotation.x = Math.PI / 2;
    foot.position.set(ankle.x, 0.042, 0.05);
    foot.scale.set(1, 1, 0.78);
    if (P >= 3) {
      // Greaves over the shin.
      limb(v(knee.x, 0.47, 0.022), v(ankle.x, 0.3, 0.004), 0.072, 0.064, steel);
      if (P >= 4) {
        ball(0.066, steel, group, v(knee.x, 0.525, 0.045), v(1, 0.95, 0.8));
        // Boot cuff.
        limb(v(ankle.x, 0.31, 0.004), v(ankle.x, 0.285, 0.003), 0.077, 0.074, leather);
      }
    }
  }

  // ----------------------------------------------------------------- torso
  if (P <= 2) {
    const chest = kit.mesh(new THREE.CylinderGeometry(0.21, 0.16, 0.6, RADIAL[P], 1), P === 2 ? steel : tabard, group);
    chest.position.y = 1.22;
    chest.scale.z = 0.7;
    if (P === 2) lathe(SKIRT, tabardOpen, group, 0.74);
  } else {
    // Arming doublet underneath, breastplate over the top, tabard skirt below the belt.
    lathe([[0.9, 0.13], [0.96, 0.172], [1.04, 0.17], [1.1, 0.158], [1.2, 0.168], [1.32, 0.196], [1.41, 0.212], [1.48, 0.205], [1.525, 0.15], [1.555, 0.08], [1.575, 0.06]], slate, group, 0.68);
    lathe([[1.105, 0.164], [1.15, 0.168], [1.24, 0.186], [1.33, 0.207], [1.41, 0.222], [1.475, 0.215], [1.515, 0.165], [1.54, 0.105]], steel, group, 0.71);
    lathe(SKIRT, tabardOpen, group, 0.74);
    // Belt.
    const belt = kit.mesh(new THREE.CylinderGeometry(0.173, 0.176, 0.05, LATHE[P], 1), leather, group);
    belt.position.y = 1.085;
    belt.scale.z = 0.72;
    if (P >= 4) detail(box(0.05, 0.058, 0.014, steel, group, v(0, 1.085, 0.128)));
    if (P >= 5) {
      // A pouch, a gorget and a ridge down the breastplate: detail nobody will see.
      box(0.07, 0.075, 0.04, leather, group, v(0.13, 1.04, 0.085)).rotation.y = 0.5;
      const gorget = kit.mesh(new THREE.TorusGeometry(0.082, 0.02, 8, LATHE[P]), steel, group);
      gorget.rotation.x = Math.PI / 2;
      gorget.position.y = 1.545;
      gorget.scale.y = 0.85;
      detail(box(0.012, 0.3, 0.012, steel, group, v(0, 1.3, 0.15)));
    }
  }

  // ------------------------------------------------------------------ arms
  const pommel = v(0, 1.13, 0.275);
  for (const side of [-1, 1]) {
    const shoulder = v(side * 0.226, 1.462, 0);
    const elbow = v(side * 0.29, 1.19, 0.03);
    const wrist = v(side * 0.066, pommel.y, 0.24);
    const hand = v(side * 0.03, pommel.y - 0.01, pommel.z - 0.004);
    if (P <= 1) {
      // Elbows are a Mid-poly feature.
      limb(shoulder, hand, 0.062, 0.05, P === 0 ? steel : slate);
      if (P === 1) ball(0.1, steel, group, shoulder);
      continue;
    }
    limb(shoulder, elbow, 0.064, 0.052, slate);
    limb(elbow, wrist, 0.05, 0.04, P >= 3 ? slate : steel);
    ball(0.047, leather, group, hand, v(0.95, 1.1, 1.1));
    if (P === 2) {
      ball(0.1, steel, group, shoulder);
      continue;
    }
    // Bracer along the forearm.
    limb(elbow.clone().lerp(wrist, 0.22), elbow.clone().lerp(wrist, 0.92), 0.058, 0.047, steel);
    // Pauldron: a tilted dome, layered with a second plate at the better tiers.
    const [w, h] = ROUND[P];
    const dome = (radius: number, at: V3, tilt: number): void => {
      const m = kit.mesh(new THREE.SphereGeometry(radius, w, h, 0, Math.PI * 2, 0, Math.PI * 0.56), steel, group);
      m.position.copy(at);
      m.rotation.z = -side * tilt;
      m.scale.set(1, 0.86, 1.08);
    };
    dome(0.1, v(shoulder.x + side * 0.012, shoulder.y + 0.018, 0), 0.55);
    if (P >= 4) {
      dome(0.088, v(shoulder.x + side * 0.04, shoulder.y - 0.055, 0.004), 0.95);
      ball(0.058, steel, group, v(elbow.x + side * 0.012, elbow.y, elbow.z - 0.012), v(0.9, 1, 1));
    }
  }

  // ------------------------------------------------------------------ cape
  if (P >= 4) {
    const nx = 10;
    const ny = 16;
    const positions: number[] = [];
    const uvs: number[] = [];
    const index: number[] = [];
    for (let j = 0; j <= ny; j++) {
      const down = j / ny;
      // Gathered between the shoulder blades, fanning out towards an uneven hem.
      const width = 0.3 + 0.36 * down ** 0.8;
      for (let i = 0; i <= nx; i++) {
        const across = i / nx;
        const x = (across - 0.5) * width;
        const fold = Math.sin(across * Math.PI * 7 + 0.6);
        const y = 1.49 - down * (1.06 + 0.035 * fold);
        // Hugs the shoulders at the top, then drapes back and out in deepening folds.
        const wrap = (1 - down) ** 3 * x * x * 3.4;
        const z = -(0.172 + 0.04 * Math.sin(down * 2.6) + 0.11 * down) + wrap + 0.03 * fold * down ** 0.7;
        positions.push(x, y, z);
        uvs.push(across, down);
      }
    }
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const a = j * (nx + 1) + i;
        const b = a + nx + 1;
        index.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(index);
    geo.computeVertexNormals();
    const cloth = kit.mat('cloth', { rough: 0.92, doubleSided: true, tint: 0xb9a8a8 });
    sway(cloth, 'transformed.z += sin(uTime * 1.3 + position.x * 7.0 + position.y * 4.0) * 0.03 * uv.y * uv.y;');
    kit.mesh(geo, cloth, group);
  }

  // ----------------------------------------------------------- neck & head
  if (P >= 2) limb(v(0, 1.52, 0.004), v(0, 1.63, 0.01), 0.058, 0.054, skin);
  const head = new THREE.Group();
  head.position.copy(HEAD_CENTRE);
  group.add(head);
  if (P <= 2) {
    const [w, h] = ROUND[P];
    kit.mesh(new THREE.SphereGeometry(1, w, h), skin, head).scale.copy(HEAD);
  } else {
    lathe(HEAD_PROFILE, skin, head, HEAD.z / HEAD.x);
  }
  addFace(head);
  addHair(head);

  // ----------------------------------------------------------------- sword
  const sword = new THREE.Group();
  sword.position.set(0, 0, pommel.z);
  group.add(sword);
  if (P <= 1) {
    box(0.1, 0.98, 0.02, steel, sword, v(0, 0.47, 0));
    box(0.34, 0.045, 0.05, steel, sword, v(0, 0.97, 0));
  } else {
    // A longsword: diamond-section blade with crisp facets, tip buried in the turf.
    const bright = kit.mat('metal', { rough: 0.24, metal: 0.6 });
    const blade = new THREE.CylinderGeometry(0.056, 0.032, 0.98, 4, 1).toNonIndexed();
    blade.computeVertexNormals();
    const bladeMesh = kit.mesh(blade, bright, sword);
    bladeMesh.position.y = 0.47;
    bladeMesh.scale.z = 0.2;
    box(0.36, 0.04, 0.06, steel, sword, v(0, 0.972, 0));
    limb(v(0, 0.99, 0), v(0, 1.1, 0), 0.02, 0.018, leather, sword);
    ball(0.036, steel, sword, v(0, pommel.y - 0.004, 0), v(1, 0.85, 1));
    if (P >= 4) {
      // Fuller down the blade and finials on the guard.
      detail(box(0.016, 0.62, 0.024, kit.mat('metal', { rough: 0.5, metal: 0.8, tint: 0x9aa0ad }), sword, v(0, 0.6, 0)));
      for (const side of [-1, 1]) ball(0.028, steel, sword, v(side * 0.18, 0.972, 0));
    }
  }

  // ------------------------------------------------------------------ face
  /** Half-width of the head at height `y` (head-local), for whichever head shape this tier uses. */
  function headRadius(y: number): number {
    if (P <= 2) return HEAD.x * Math.sqrt(Math.max(0, 1 - (y / HEAD.y) ** 2));
    for (let i = 1; i < HEAD_PROFILE.length; i++) {
      const [y0, r0] = HEAD_PROFILE[i - 1];
      const [y1, r1] = HEAD_PROFILE[i];
      if (y <= y1) return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0);
    }
    return 0;
  }

  /** Where the front of the face is at (x, y), so features sit on the surface rather than in it. */
  function faceZ(x: number, y: number): number {
    return (HEAD.z / HEAD.x) * Math.sqrt(Math.max(1e-6, headRadius(y) ** 2 - x * x));
  }

  function addFace(parent: THREE.Object3D): void {
    if (P < 2) return;
    const dark = new THREE.MeshBasicMaterial({ color: 0x17110e });
    const eyeX = 0.043;
    const eyeY = -0.004;
    const eyeZ = faceZ(eyeX, eyeY);
    if (P === 2) {
      for (const side of [-1, 1]) detail(ball(0.014, dark, parent, v(side * eyeX, eyeY, eyeZ)));
      return;
    }

    // Nose: a bridge running down to a rounded tip.
    const tipY = -0.044;
    const tip = v(0, tipY, faceZ(0, tipY) + 0.011);
    detail(limb(v(0, eyeY + 0.004, faceZ(0, eyeY) - 0.006), tip, 0.006, 0.0092, skin, parent));
    detail(ball(0.0112, skin, parent, tip, v(1.05, 0.8, 0.85)));
    if (P >= 4) {
      for (const side of [-1, 1]) detail(ball(0.0066, skin, parent, v(side * 0.0098, tipY - 0.0035, tip.z - 0.009)));
    }

    const mouthY = -0.097;
    const mouthZ = faceZ(0, mouthY);
    for (const side of [-1, 1]) {
      const x = side * eyeX;
      if (P === 3) {
        detail(ball(0.0115, dark, parent, v(x, eyeY, eyeZ - 0.002), v(1.15, 0.8, 0.5)));
      } else {
        // Eyeball, iris, pupil, and an upper lid so he looks focused rather than startled.
        const white = kit.mat('linen', { textured: false, colour: 0xece8e0, rough: 0.35 });
        const iris = new THREE.MeshBasicMaterial({ color: 0x3c2a1c });
        detail(ball(0.0172, white, parent, v(x, eyeY, eyeZ - 0.0068), v(1.2, 0.68, 0.6)));
        detail(ball(0.0088, iris, parent, v(x, eyeY + 0.0004, eyeZ + 0.0012), v(1, 1, 0.45)));
        detail(ball(0.0043, dark, parent, v(x, eyeY + 0.0004, eyeZ + 0.0037), v(1, 1, 0.4)));
        detail(ball(0.0182, skin, parent, v(x, eyeY + 0.0112, eyeZ - 0.0066), v(1.26, 0.56, 0.68)));
        // Ears.
        detail(ball(0.027, skin, parent, v(side * (headRadius(-0.012) + 0.001), -0.012, -0.008), v(0.4, 1, 0.68)));
      }
      // Brows: inner ends slightly lower. Determined, not surprised.
      const browY = eyeY + 0.03;
      const brow = detail(box(0.04, 0.0075, 0.01, new THREE.MeshBasicMaterial({ color: 0x2a1a10 }), parent, v(side * 0.045, browY, faceZ(0.045, browY) + 0.001)));
      brow.rotation.z = side * 0.12;
      brow.rotation.y = side * 0.3;
    }
    if (P === 3) {
      detail(box(0.034, 0.004, 0.006, new THREE.MeshBasicMaterial({ color: 0x7a4034 }), parent, v(0, mouthY, mouthZ)));
    } else {
      const lips = kit.mat('skin', { rough: 0.5, tint: 0xd9a39c });
      detail(ball(0.016, lips, parent, v(0, mouthY + 0.0035, mouthZ - 0.004), v(1.25, 0.26, 0.5)));
      detail(ball(0.016, lips, parent, v(0, mouthY - 0.0045, mouthZ - 0.005), v(1.05, 0.3, 0.5)));
      detail(box(0.03, 0.002, 0.004, new THREE.MeshBasicMaterial({ color: 0x5a2c26 }), parent, v(0, mouthY, mouthZ + 0.0025)));
    }
  }

  // ------------------------------------------------------------------ hair
  function addHair(parent: THREE.Object3D): void {
    const tier = kit.cfg.hair;
    if (tier === 0) return;
    // The cap under the strands is darker and matt, so gaps read as depth rather than scalp.
    const solid = kit.mat('linen', { textured: false, colour: HAIR_COLOUR, tint: tier === 1 ? 0xffffff : 0x9a9a9a, rough: 0.92, doubleSided: true });
    const [w, h] = ROUND[Math.max(P, 2)];
    // Scalp cap: on its own at tier 1 ("hair helmet"), and under the strands afterwards.
    const lump = tier === 1 ? 1.1 : 1.014;
    const scalp = new THREE.Group();
    scalp.scale.copy(HEAD).multiplyScalar(lump);
    parent.add(scalp);
    kit.mesh(new THREE.SphereGeometry(1, w * 2, h, 0, Math.PI * 2, 0, SCALP_ANGLE), solid, scalp).rotation.x = -SCALP_TILT;
    if (tier === 1) {
      ball(0.105, solid, parent, v(0, -0.05, -0.078), v(1.18, 1.1, 0.9));
      return;
    }

    const count = Math.round(HAIR_STRANDS[tier] * (tier >= 3 ? kit.instanceScale : 1));
    const segments = HAIR_SEGMENTS[tier];
    const width = HAIR_WIDTH[tier];
    const { x: a, y: b, z: c } = HEAD;
    const rand = rng(77);
    const positions = new Float32Array(count * (segments + 1) * 2 * 3);
    const normals = new Float32Array(positions.length);
    const colours = new Float32Array(positions.length);
    const uvs = new Float32Array(count * (segments + 1) * 2 * 2);
    const index: number[] = [];
    const base = new THREE.Color(HAIR_COLOUR);
    const d = new THREE.Vector3();
    const p = new THREE.Vector3();
    const n = new THREE.Vector3();
    const flow = new THREE.Vector3();
    const dir = new THREE.Vector3();
    const edge = new THREE.Vector3();
    const shellOf = (q: V3): number => Math.sqrt((q.x / a) ** 2 + (q.y / b) ** 2 + (q.z / c) ** 2);
    let vi = 0;

    for (let s = 0; s < count; s++) {
      // Root: a random direction inside the scalp cap.
      do {
        const y = rand() * 2 - 1;
        const angle = rand() * Math.PI * 2;
        const r = Math.sqrt(1 - y * y);
        d.set(Math.cos(angle) * r, y, Math.sin(angle) * r);
      } while (d.angleTo(SCALP_AXIS) > SCALP_ANGLE);
      const fringe = d.z > 0.28;
      const shell = 1.02 + rand() * 0.05;
      const length = fringe ? 0.065 + rand() * 0.06 : 0.17 + 0.2 * Math.max(0, d.y) + rand() * 0.1;
      const step = length / segments;
      // Parted just left of centre; everything combs away from the parting and back.
      const part = d.x > -0.035 ? 1 : -1;
      const drift = (rand() - 0.5) * 0.35;
      const driftBack = (rand() - 0.5) * 0.2;
      // A few sun-lightened strands, and a per-strand tilt of the shading normal so the
      // crown catches light fibre by fibre instead of as one polished dome.
      const shade = (0.62 + rand() * 0.6) * (rand() < 0.06 ? 1.5 : 1);
      const tiltX = (rand() - 0.5) * 0.42;
      const tiltZ = (rand() - 0.5) * 0.42;
      p.set(d.x * a, d.y * b, d.z * c).multiplyScalar(shell);

      for (let i = 0; i <= segments; i++) {
        n.set(p.x / (a * a), p.y / (b * b), p.z / (c * c)).normalize();
        if (fringe) flow.set(part * 0.95, -0.4, 0.12);
        else flow.set(drift + part * 0.25 * Math.max(0, d.y), -1, -0.3 + driftBack);
        const onHead = p.y > -0.5 * b && shellOf(p) < 1.3;
        if (onHead) {
          // Lie along the scalp: remove the part of the flow that points into or out of the head.
          dir.copy(flow).addScaledVector(n, -flow.dot(n));
          if (dir.lengthSq() < 1e-6) dir.copy(flow);
          dir.normalize();
        } else {
          // Past the nape the hair hangs free, flaring very slightly outward.
          dir.set(n.x * 0.14, -1, n.z * 0.14 - 0.04).normalize();
        }
        const along = i / segments;
        edge.crossVectors(dir, n).normalize().multiplyScalar(width * (1 - 0.72 * along));
        const tone = shade * (0.72 + 0.4 * along);
        for (const sign of [-1, 1]) {
          const o = vi * 3;
          positions[o] = p.x + edge.x * sign;
          positions[o + 1] = p.y + edge.y * sign;
          positions[o + 2] = p.z + edge.z * sign;
          normals[o] = n.x + tiltX;
          normals[o + 1] = n.y + 0.25;
          normals[o + 2] = n.z + tiltZ;
          colours[o] = base.r * tone;
          colours[o + 1] = base.g * tone;
          colours[o + 2] = base.b * tone;
          uvs[vi * 2] = sign > 0 ? 1 : 0;
          uvs[vi * 2 + 1] = along;
          vi++;
        }
        if (i < segments) {
          index.push(vi - 2, vi - 1, vi, vi, vi - 1, vi + 1);
          p.addScaledVector(dir, step);
          // Stay on the strand's own shell while on the head; never sink inside it.
          const q = shellOf(p);
          if (q < shell || (onHead && q < 1.3)) p.multiplyScalar(shell / q);
        }
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colours, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(index);
    geo.normalizeNormals();
    const material = kit.mat('linen', { textured: false, colour: 0xffffff, vertexColors: true, doubleSided: true, rough: 0.74 });
    // Per-follicle simulation: every strand gets to move. Slightly.
    if (tier >= 4) sway(material, 'transformed.x += sin(uTime * 1.6 + position.y * 38.0 + position.z * 21.0) * 0.007 * uv.y * uv.y;');
    const hair = kit.mesh(geo, material, parent);
    hair.castShadow = kit.cfg.shadows >= 3;
    hair.frustumCulled = false;
  }

  return {
    group,
    update(t: number): void {
      // He surveys the meadow. There is nothing else for him to do.
      head.rotation.y = Math.sin(t * 0.42) * 0.3 + Math.sin(t * 0.17) * 0.12;
      head.rotation.x = Math.sin(t * 0.31) * 0.04;
    },
  };
}
