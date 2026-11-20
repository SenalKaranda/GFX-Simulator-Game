// Owns the WebGL renderer, camera and post-processing chain, and maps the
// player's purchased settings onto real rendering changes.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { AfterimagePass } from 'three/addons/postprocessing/AfterimagePass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { makeSkyCanvas } from './textures';
import { SUN_DIRECTION, SUN_DISTANCE, World } from './world';
import type { GfxConfig } from './world';

/** Internal render height per Resolution tier (capped at what the display can show). */
export const RESOLUTION_HEIGHTS = [36, 90, 180, 360, 720, 1080, 2160, 4320, 8640];
const CAMERA_FAR = [30, 55, 115, 270, 1600];
const FOG: [number, number][] = [[5, 22], [9, 42], [20, 95], [45, 240], [160, 1100]];
const SKY_TOP = '#3f7fe0';
const SKY_HORIZON = '#cfe3f5';

const FinalShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uAspect: { value: 1 },
    uLevels: { value: 0 },
    uMono: { value: 0 },
    uDither: { value: 0 },
    uHdr: { value: 0 },
    uVignette: { value: 0 },
    uGrain: { value: 0 },
    uChromatic: { value: 0 },
    uBrown: { value: 0 },
    uDirt: { value: 0 },
    uFlare: { value: 0 },
    uSun: { value: new THREE.Vector3() },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uAspect, uLevels, uMono, uDither, uHdr;
    uniform float uVignette, uGrain, uChromatic, uBrown, uDirt, uFlare;
    uniform vec3 uSun; // xy = screen uv, z = visibility
    varying vec2 vUv;

    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

    float bayer(vec2 p) {
      ivec2 i = ivec2(mod(p, 4.0));
      int idx = i.x + i.y * 4;
      float m[16];
      m[0]=0.;  m[1]=8.;  m[2]=2.;  m[3]=10.;
      m[4]=12.; m[5]=4.;  m[6]=14.; m[7]=6.;
      m[8]=3.;  m[9]=11.; m[10]=1.; m[11]=9.;
      m[12]=15.;m[13]=7.; m[14]=13.;m[15]=5.;
      float v = 0.0;
      for (int k = 0; k < 16; k++) if (k == idx) v = m[k];
      return (v + 0.5) / 16.0;
    }

    float blob(vec2 uv, vec2 c, float r) {
      vec2 d = (uv - c) * vec2(uAspect, 1.0);
      return smoothstep(r, r * 0.3, length(d));
    }

    void main() {
      vec2 centred = vUv - 0.5;
      vec3 col;
      if (uChromatic > 0.5) {
        vec2 off = centred * (0.012 + 0.03 * dot(centred, centred));
        col = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      } else {
        col = texture2D(tDiffuse, vUv).rgb;
      }

      if (uFlare > 0.5 && uSun.z > 0.0) {
        vec2 toCentre = vec2(0.5) - uSun.xy;
        vec3 flare = vec3(0.0);
        flare += vec3(1.0, 0.75, 0.4) * blob(vUv, uSun.xy + toCentre * 0.45, 0.07) * 0.35;
        flare += vec3(0.4, 0.8, 1.0) * blob(vUv, uSun.xy + toCentre * 0.9, 0.035) * 0.45;
        flare += vec3(0.6, 1.0, 0.5) * blob(vUv, uSun.xy + toCentre * 1.35, 0.11) * 0.22;
        flare += vec3(1.0, 0.5, 0.8) * blob(vUv, uSun.xy + toCentre * 1.8, 0.05) * 0.4;
        flare += vec3(0.5, 0.6, 1.0) * blob(vUv, uSun.xy + toCentre * 2.3, 0.16) * 0.18;
        // Anamorphic streak, as mandated by every sci-fi film since 2009.
        vec2 d = vUv - uSun.xy;
        flare += vec3(0.45, 0.65, 1.0) * exp(-abs(d.y) * 90.0) * exp(-abs(d.x) * 2.2) * 0.8;
        flare += vec3(1.0, 0.9, 0.7) * blob(vUv, uSun.xy, 0.3) * 0.35;
        col += flare * uSun.z;
      }

      if (uDirt > 0.5) {
        float dirt = 0.0;
        for (int i = 0; i < 14; i++) {
          vec2 c = vec2(hash(vec2(float(i), 1.7)), hash(vec2(float(i), 9.2)));
          dirt += blob(vUv, c, 0.04 + 0.1 * hash(vec2(float(i), 4.4))) * (0.3 + 0.7 * hash(vec2(float(i), 6.1)));
        }
        float lum = dot(col, vec3(0.299, 0.587, 0.114));
        col += dirt * (0.05 + 0.22 * lum) * vec3(1.0, 0.92, 0.8);
      }

      if (uBrown > 0.5) {
        float lum = dot(col, vec3(0.299, 0.587, 0.114));
        vec3 sepia = lum * vec3(1.18, 0.9, 0.58);
        col = mix(col, sepia, 0.72);
        col = (col - 0.5) * 1.12 + 0.47;
      }

      if (uHdr > 0.5) {
        float lum = dot(col, vec3(0.299, 0.587, 0.114));
        col = mix(vec3(lum), col, 1.35);
        col = (col - 0.5) * 1.08 + 0.5;
      }

      if (uVignette > 0.5) {
        col *= smoothstep(0.95, 0.25, length(centred * vec2(1.0, 0.85)) * 1.15);
      }

      if (uGrain > 0.5) {
        col += (hash(gl_FragCoord.xy + fract(uTime) * 91.7) - 0.5) * 0.13;
      }

      col = clamp(col, 0.0, 1.0);
      if (uLevels > 0.5) {
        float threshold = uDither > 0.5 ? bayer(gl_FragCoord.xy) : 0.5;
        if (uMono > 0.5) {
          float lum = dot(col, vec3(0.299, 0.587, 0.114));
          // Stretch contrast first so a 1-bit image still reads as sky, ground and hero.
          lum = clamp((lum - 0.52) * 2.6 + 0.5, 0.0, 1.0);
          col = vec3(step(threshold, lum));
        } else {
          float n = uLevels - 1.0;
          col = floor(col * n + threshold) / n;
        }
      }
      gl_FragColor = vec4(col, 1.0);
    }`,
};

/** Posterisation per Colour Depth tier: [levels per channel, mono, dither]. */
const COLOUR_MODES: [number, number, number][] = [
  [2, 1, 1],
  [2, 0, 1],
  [4, 0, 1],
  [8, 0, 1],
  [32, 0, 0],
  [0, 0, 0],
  [0, 0, 0],
];

export class GfxRenderer {
  readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 100);
  private readonly controls: OrbitControls;
  private readonly clock = new THREE.Clock();
  private composer: EffectComposer | null = null;
  private finalPass: ShaderPass | null = null;
  private bokeh: BokehPass | null = null;
  private fxaa: ShaderPass | null = null;
  private world: World | null = null;
  private worldKey = '';
  private cfg: GfxConfig | null = null;
  private envMap: THREE.Texture | null = null;
  private backgrounds = new Map<number, THREE.Texture>();
  private readonly sunWorld = SUN_DIRECTION.clone().multiplyScalar(SUN_DISTANCE);
  private readonly tmp = new THREE.Vector3();
  private lastRender = 0;
  private cssWidth = 1;
  private cssHeight = 1;
  /** Actual internal resolution, for display in the HUD. */
  renderWidth = 1;
  renderHeight = 1;
  /** True if the last pointer interaction was a drag rather than a click. */
  dragged = false;

  constructor(private readonly container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.canvas = this.renderer.domElement;
    this.canvas.className = 'scene-canvas';
    container.appendChild(this.canvas);
    this.renderer.setPixelRatio(1);
    this.renderer.setClearColor(0x000000);

    this.camera.position.set(6.8, 2.9, 6.6);
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.target.set(0.2, 1.5, 0.8);
    this.controls.enablePan = false;
    this.controls.enableDamping = true;
    this.controls.minDistance = 4;
    this.controls.maxDistance = 14;
    this.controls.minPolarAngle = 0.5;
    this.controls.maxPolarAngle = 1.53;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.7;
    this.controls.addEventListener('start', () => (this.dragged = false));
    let moved = 0;
    this.canvas.addEventListener('pointerdown', () => (moved = 0));
    this.canvas.addEventListener('pointermove', (e) => {
      moved += Math.abs(e.movementX) + Math.abs(e.movementY);
      if (moved > 6) this.dragged = true;
    });

    new ResizeObserver(() => this.resize()).observe(container);
  }

  static isSupported(): boolean {
    try {
      const c = document.createElement('canvas');
      return !!(c.getContext('webgl2') || c.getContext('webgl'));
    } catch {
      return false;
    }
  }

  setAutoRotate(on: boolean): void {
    this.controls.autoRotate = on;
  }

  /** Apply a new set of quality tiers. Cheap when nothing relevant changed. */
  apply(cfg: GfxConfig): void {
    this.cfg = cfg;
    const key = [cfg.polygons, cfg.textures, cfg.lighting, cfg.shadows, cfg.drawDistance, cfg.foliage, cfg.water, cfg.hair].join(',');
    if (key !== this.worldKey) {
      this.worldKey = key;
      if (this.world) {
        this.scene.remove(this.world.group);
        this.world.dispose();
      }
      this.renderer.shadowMap.enabled = cfg.shadows >= 2;
      this.renderer.shadowMap.type = cfg.shadows >= 3 ? THREE.PCFSoftShadowMap : THREE.BasicShadowMap;
      this.world = new World(cfg, this.renderer.capabilities.getMaxAnisotropy());
      this.scene.add(this.world.group);
      this.applyAtmosphere(cfg);
    }
    this.renderer.toneMapping = cfg.colour >= 6 ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.buildComposer();
    this.resize();
  }

  private applyAtmosphere(cfg: GfxConfig): void {
    const L = cfg.lighting;
    const bands = L === 0 ? 1 : L === 1 ? 6 : 0;
    let bg = this.backgrounds.get(bands);
    if (!bg) {
      bg = new THREE.CanvasTexture(makeSkyCanvas(SKY_TOP, SKY_HORIZON, bands));
      bg.colorSpace = THREE.SRGBColorSpace;
      this.backgrounds.set(bands, bg);
    }
    this.scene.background = bands === 1 ? new THREE.Color(0x6fa2ee) : bg;
    const [near, far] = FOG[cfg.drawDistance];
    this.scene.fog = new THREE.Fog(bands === 1 ? 0x6fa2ee : 0xcfe3f5, near, far);
    this.camera.far = CAMERA_FAR[cfg.drawDistance];
    this.camera.updateProjectionMatrix();

    if (L >= 3) {
      this.envMap ??= this.makeEnvironment();
      this.scene.environment = this.envMap;
      this.scene.environmentIntensity = L >= 5 ? 0.9 : L >= 4 ? 0.6 : 0.3;
    } else {
      this.scene.environment = null;
    }
  }

  private makeEnvironment(): THREE.Texture {
    const envScene = new THREE.Scene();
    const skyTex = new THREE.CanvasTexture(makeSkyCanvas(SKY_TOP, SKY_HORIZON, 0));
    skyTex.colorSpace = THREE.SRGBColorSpace;
    const dome = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide }));
    envScene.add(dome);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(50, 16), new THREE.MeshBasicMaterial({ color: 0x41602c }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -1;
    envScene.add(ground);
    const sunMat = new THREE.MeshBasicMaterial();
    sunMat.color.setRGB(30, 26, 20);
    const sun = new THREE.Mesh(new THREE.SphereGeometry(3, 16, 8), sunMat);
    sun.position.copy(SUN_DIRECTION).multiplyScalar(40);
    envScene.add(sun);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const tex = pmrem.fromScene(envScene, 0.02).texture;
    pmrem.dispose();
    skyTex.dispose();
    return tex;
  }

  private buildComposer(): void {
    const cfg = this.cfg!;
    this.composer?.dispose();
    const samples = cfg.antialiasing >= 3 ? 4 : 0;
    const target = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples });
    const composer = new EffectComposer(this.renderer, target);
    composer.setPixelRatio(1);
    composer.addPass(new RenderPass(this.scene, this.camera));
    this.bokeh = null;
    this.fxaa = null;
    if (cfg.fx.dof) {
      this.bokeh = new BokehPass(this.scene, this.camera, { focus: 12, aperture: 0.0009, maxblur: 0.012 });
      composer.addPass(this.bokeh);
    }
    if (cfg.fx.bloom) composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), 0.85, 0.7, 0.72));
    if (cfg.fx.motionBlur) composer.addPass(new AfterimagePass(0.86));
    if (cfg.antialiasing === 1) {
      this.fxaa = new ShaderPass(FXAAShader);
      composer.addPass(this.fxaa);
    } else if (cfg.antialiasing >= 2) {
      composer.addPass(new SMAAPass(4, 4));
    }
    composer.addPass(new OutputPass());
    const final = new ShaderPass(FinalShader);
    const u = final.uniforms;
    const [levels, mono, dither] = COLOUR_MODES[cfg.colour];
    u.uLevels.value = levels;
    u.uMono.value = mono;
    u.uDither.value = dither;
    u.uHdr.value = cfg.colour >= 6 ? 1 : 0;
    u.uVignette.value = cfg.fx.vignette ? 1 : 0;
    u.uGrain.value = cfg.fx.grain ? 1 : 0;
    u.uChromatic.value = cfg.fx.chromatic ? 1 : 0;
    u.uBrown.value = cfg.fx.brown ? 1 : 0;
    u.uDirt.value = cfg.fx.lensDirt ? 1 : 0;
    u.uFlare.value = cfg.fx.lensFlare ? 1 : 0;
    composer.addPass(final);
    this.finalPass = final;
    this.composer = composer;
  }

  private resize(): void {
    const rect = this.container.getBoundingClientRect();
    this.cssWidth = Math.max(1, rect.width);
    this.cssHeight = Math.max(1, rect.height);
    const cfg = this.cfg;
    if (!cfg || !this.composer) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const nativeHeight = Math.round(this.cssHeight * dpr);
    const height = Math.max(2, Math.min(RESOLUTION_HEIGHTS[cfg.resolution], nativeHeight));
    const aspect = this.cssWidth / this.cssHeight;
    const width = Math.max(2, Math.round(height * aspect));
    this.renderWidth = width;
    this.renderHeight = height;
    this.renderer.setSize(width, height, false);
    this.composer.setSize(width, height);
    this.fxaa?.uniforms.resolution.value.set(1 / width, 1 / height);
    this.canvas.classList.toggle('pixelated', height < nativeHeight * 0.9);
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    if (this.finalPass) this.finalPass.uniforms.uAspect.value = aspect;
    this.lastRender = 0;
  }

  /**
   * Called every animation frame. Only renders when the simulated frame rate
   * says a frame is due, so a 4 FPS build really does look like 4 FPS.
   */
  frame(nowMs: number, targetFps: number): boolean {
    if (!this.composer || !this.world) return false;
    this.controls.update();
    if (targetFps < 58 && nowMs - this.lastRender < 1000 / targetFps - 2) return false;
    this.lastRender = nowMs;
    this.render();
    return true;
  }

  private render(): void {
    const t = this.clock.getElapsedTime();
    this.world!.update(t);
    if (this.finalPass) {
      const u = this.finalPass.uniforms;
      u.uTime.value = t;
      const p = this.tmp.copy(this.sunWorld).project(this.camera);
      const inFront = p.z < 1 && Math.abs(p.x) < 1.6 && Math.abs(p.y) < 1.6;
      (u.uSun.value as THREE.Vector3).set(p.x * 0.5 + 0.5, p.y * 0.5 + 0.5, inFront ? 1 : 0);
    }
    if (this.bokeh) {
      (this.bokeh.uniforms as Record<string, THREE.IUniform>).focus.value = this.camera.position.distanceTo(this.controls.target);
    }
    this.composer!.render();
  }

  /** Render a fresh frame and return the canvas, valid to read synchronously. */
  capture(): HTMLCanvasElement {
    if (this.composer && this.world) this.render();
    return this.canvas;
  }
}
