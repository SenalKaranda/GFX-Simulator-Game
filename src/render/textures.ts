// Procedural textures, generated at whatever resolution the player has paid for.
import * as THREE from 'three';

export type TextureKind = 'grass' | 'rock' | 'bark' | 'leaves' | 'crate' | 'metal' | 'skin' | 'cloth' | 'barrel';

type RGB = [number, number, number];

function hash(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

/** Tileable value noise: `period` lattice cells across the 0..1 range. */
function noise(u: number, v: number, period: number, seed: number): number {
  const x = u * period;
  const y = v * period;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const w = (n: number) => ((n % period) + period) % period;
  const a = hash(w(x0), w(y0), seed);
  const b = hash(w(x0 + 1), w(y0), seed);
  const c = hash(w(x0), w(y0 + 1), seed);
  const d = hash(w(x0 + 1), w(y0 + 1), seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function fbm(u: number, v: number, period: number, seed: number, octaves = 4): number {
  let sum = 0;
  let amp = 0.5;
  let p = period;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise(u, v, p, seed + i * 17);
    amp *= 0.5;
    p *= 2;
  }
  return sum / (1 - 0.5 ** octaves);
}

const mul = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];

/** Colour of each material at texture coordinate (u, v), in 0..1 sRGB. */
const PATTERNS: Record<TextureKind, (u: number, v: number) => RGB> = {
  grass: (u, v) => {
    const n = fbm(u, v, 6, 1);
    const streak = noise(u, v, 64, 2);
    return [0.2 + 0.2 * n, 0.38 + 0.3 * n + 0.08 * streak, 0.1 + 0.08 * n];
  },
  rock: (u, v) => {
    const n = fbm(u, v, 5, 3);
    const crack = Math.abs(fbm(u, v, 8, 4) - 0.5) < 0.025 ? 0.55 : 1;
    return mul([0.52, 0.5, 0.47], (0.55 + 0.75 * n) * crack);
  },
  bark: (u, v) => {
    const n = 0.6 * noise(u, v * 0.25, 24, 5) + 0.4 * fbm(u, v, 8, 6);
    return mul([0.42, 0.28, 0.16], 0.55 + 0.8 * n);
  },
  leaves: (u, v) => {
    const n = fbm(u, v, 10, 7);
    const spot = noise(u, v, 40, 8) > 0.72 ? 1.25 : 1;
    return mul([0.13, 0.4, 0.14], (0.6 + 0.7 * n) * spot);
  },
  crate: (u, v) => {
    const edge = Math.min(u, v, 1 - u, 1 - v);
    const plank = (v * 5) % 1;
    const grain = 0.75 + 0.35 * noise(u * 0.25, v, 48, 9);
    const diag = Math.abs(u - v) < 0.07 || Math.abs(u + v - 1) < 0.07;
    let k = grain;
    if (plank < 0.06) k *= 0.6;
    if (edge < 0.1 || diag) k *= 0.72;
    if (edge < 0.012) k *= 0.6;
    return mul([0.66, 0.47, 0.25], k);
  },
  barrel: (u, v) => {
    const stave = (u * 12) % 1 < 0.08 ? 0.6 : 1;
    const hoop = Math.abs(v - 0.2) < 0.04 || Math.abs(v - 0.8) < 0.04;
    if (hoop) return mul([0.35, 0.36, 0.4], 0.8 + 0.3 * noise(u, v, 32, 10));
    return mul([0.5, 0.31, 0.16], stave * (0.7 + 0.4 * noise(u, v * 0.3, 40, 11)));
  },
  metal: (u, v) => {
    const brushed = noise(u * 0.1, v, 96, 12);
    const wear = fbm(u, v, 6, 13) > 0.62 ? 0.82 : 1;
    return mul([0.66, 0.7, 0.78], (0.8 + 0.25 * brushed) * wear);
  },
  skin: (u, v) => mul([0.87, 0.67, 0.53], 0.93 + 0.1 * fbm(u, v, 12, 14)),
  cloth: (u, v) => {
    const weave = 0.5 + 0.25 * Math.sin(u * Math.PI * 64) + 0.25 * Math.sin(v * Math.PI * 64);
    return mul([0.62, 0.12, 0.14], 0.7 + 0.4 * weave * (0.7 + 0.3 * fbm(u, v, 6, 15)));
  },
};

/** The single flat colour used when textures are switched off. */
export const FLAT_COLOURS: Record<TextureKind, number> = {
  grass: 0x4f8a2c,
  rock: 0x7d7a74,
  bark: 0x6b4526,
  leaves: 0x2b6b2c,
  crate: 0xa5763c,
  barrel: 0x7a4c26,
  metal: 0xaab3c6,
  skin: 0xddab87,
  cloth: 0x9c2126,
};

/** Texture edge length per Texture Quality tier (tier 0 has no textures at all). */
export const TEXTURE_SIZES = [0, 8, 32, 256, 512, 512];

const cache = new Map<string, THREE.CanvasTexture>();

function paint(kind: TextureKind, size: number, asHeight: boolean): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const fn = PATTERNS[kind];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const c = fn((x + 0.5) / size, (y + 0.5) / size);
      const i = (y * size + x) * 4;
      if (asHeight) {
        const l = Math.min(255, (c[0] + c[1] + c[2]) * 85 * 1.4);
        img.data[i] = img.data[i + 1] = img.data[i + 2] = l;
      } else {
        img.data[i] = Math.min(255, c[0] * 255);
        img.data[i + 1] = Math.min(255, c[1] * 255);
        img.data[i + 2] = Math.min(255, c[2] * 255);
      }
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

export interface TextureSet {
  map: THREE.Texture | null;
  bumpMap: THREE.Texture | null;
}

export function getTextures(kind: TextureKind, tier: number, maxAnisotropy: number): TextureSet {
  const size = TEXTURE_SIZES[tier] ?? 0;
  if (!size) return { map: null, bumpMap: null };
  const make = (asHeight: boolean): THREE.CanvasTexture => {
    const key = `${kind}:${size}:${asHeight ? 'h' : 'c'}:${tier}`;
    let tex = cache.get(key);
    if (!tex) {
      tex = new THREE.CanvasTexture(paint(kind, size, asHeight));
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      if (!asHeight) tex.colorSpace = THREE.SRGBColorSpace;
      const crisp = tier <= 2;
      tex.magFilter = crisp ? THREE.NearestFilter : THREE.LinearFilter;
      tex.minFilter = crisp ? THREE.NearestFilter : THREE.LinearMipmapLinearFilter;
      tex.generateMipmaps = !crisp;
      tex.anisotropy = tier >= 4 ? maxAnisotropy : 1;
      cache.set(key, tex);
    }
    return tex;
  };
  return { map: make(false), bumpMap: tier >= 5 ? make(true) : null };
}

let waterNormals: THREE.CanvasTexture | null = null;

/** A tileable ripple normal map for the fancier water tiers. */
export function getWaterNormals(): THREE.CanvasTexture {
  if (waterNormals) return waterNormals;
  const size = 256;
  const height = (u: number, v: number) => fbm(u, v, 6, 21, 3);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const e = 1 / size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const dx = (height(u + e, v) - height(u - e, v)) * 6;
      const dy = (height(u, v + e) - height(u, v - e)) * 6;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      img.data[i] = (-dx / len) * 127 + 128;
      img.data[i + 1] = (-dy / len) * 127 + 128;
      img.data[i + 2] = (1 / len) * 127 + 128;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  waterNormals = new THREE.CanvasTexture(canvas);
  waterNormals.wrapS = waterNormals.wrapT = THREE.RepeatWrapping;
  return waterNormals;
}

/** Vertical sky gradient used as the scene background and environment. */
export function makeSkyCanvas(top: string, horizon: string, bands: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, top);
  grad.addColorStop(0.62, horizon);
  grad.addColorStop(1, horizon);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 4, 256);
  if (bands > 0) {
    // Quantise into visible bands for the cheaper lighting tiers.
    const src = ctx.getImageData(0, 0, 4, 256);
    const step = Math.ceil(256 / bands);
    for (let y = 0; y < 256; y++) {
      const sy = Math.min(255, Math.floor(y / step) * step);
      for (let x = 0; x < 4; x++) {
        for (let k = 0; k < 4; k++) src.data[(y * 4 + x) * 4 + k] = src.data[(sy * 4 + x) * 4 + k];
      }
    }
    ctx.putImageData(src, 0, 0);
  }
  return canvas;
}
