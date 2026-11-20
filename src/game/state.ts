import { CHALLENGES, FX, GENERATORS, PERKS, TRACKS } from './data';
import type { ChallengeId, FxId, PerkId, TrackId } from './data';

export const SAVE_VERSION = 1;
export const SAVE_KEY = 'gfx-simulator-save-v1';

export interface Settings {
  sfx: boolean;
  music: boolean;
  fan: boolean;
  volume: number;
  /** Throttle the real render loop to the simulated frame rate. */
  authenticFps: boolean;
  autoRotate: boolean;
  buyAmount: 1 | 10 | -1;
}

export interface Stats {
  clicks: number;
  playTime: number;
  runTime: number;
  gameplayRequests: number;
  photos: number;
  deadPixels: number;
  fxToggles: number;
  offlineReturns: number;
  fastestGeneration: number;
}

export interface GameState {
  version: number;
  pixels: number;
  runEarned: number;
  totalEarned: number;
  tracks: Record<TrackId, number>;
  fxOwned: Record<FxId, boolean>;
  fxOn: Record<FxId, boolean>;
  generators: Record<string, number>;
  hardware: number;
  generation: number;
  teraflops: number;
  teraflopsTotal: number;
  perks: Record<PerkId, boolean>;
  challenge: ChallengeId | null;
  challengeTime: number;
  challengesDone: Record<ChallengeId, boolean>;
  achievements: Record<string, number>;
  stats: Stats;
  settings: Settings;
  lastSaved: number;
}

const record = <K extends string, V>(keys: K[], value: V): Record<K, V> =>
  Object.fromEntries(keys.map((k) => [k, value])) as Record<K, V>;

export function newState(): GameState {
  return {
    version: SAVE_VERSION,
    pixels: 0,
    runEarned: 0,
    totalEarned: 0,
    tracks: record(TRACKS.map((x) => x.id), 0),
    fxOwned: record(FX.map((x) => x.id), false),
    fxOn: record(FX.map((x) => x.id), true),
    generators: record(GENERATORS.map((x) => x.id), 0),
    hardware: 0,
    generation: 1,
    teraflops: 0,
    teraflopsTotal: 0,
    perks: record(PERKS.map((x) => x.id), false),
    challenge: null,
    challengeTime: 0,
    challengesDone: record(CHALLENGES.map((x) => x.id), false),
    achievements: {},
    stats: {
      clicks: 0,
      playTime: 0,
      runTime: 0,
      gameplayRequests: 0,
      photos: 0,
      deadPixels: 0,
      fxToggles: 0,
      offlineReturns: 0,
      fastestGeneration: 0,
    },
    settings: {
      sfx: true,
      music: true,
      fan: true,
      volume: 0.6,
      authenticFps: true,
      autoRotate: true,
      buyAmount: 1,
    },
    lastSaved: Date.now(),
  };
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Copy values from `src` onto `base`, keeping only keys `base` knows and matching types. */
function mergeInto(base: Record<string, unknown>, src: Record<string, unknown>, open = false): void {
  for (const key of Object.keys(open ? src : base)) {
    const b = base[key];
    const s = src[key];
    if (s === undefined) continue;
    if (isObj(b) && isObj(s)) mergeInto(b, s, key === 'achievements');
    else if (b === null) {
      // Only nullable fields (the active challenge) may hold null or a string id.
      if (s === null || typeof s === 'string') base[key] = s;
    } else if (s === null) continue;
    else if (b === undefined ? typeof s === 'number' : typeof b === typeof s) {
      if (typeof s === 'number' && !Number.isFinite(s)) continue;
      base[key] = s;
    }
  }
}

/** Build a valid state from untrusted saved data, tolerating missing or extra fields. */
export function hydrate(raw: unknown): GameState {
  const state = newState();
  if (!isObj(raw)) return state;
  mergeInto(state as unknown as Record<string, unknown>, raw, false);
  state.version = SAVE_VERSION;
  for (const tr of TRACKS) {
    state.tracks[tr.id] = Math.max(0, Math.min(tr.tiers.length - 1, Math.floor(state.tracks[tr.id])));
  }
  if (state.challenge && !CHALLENGES.some((c) => c.id === state.challenge)) state.challenge = null;
  if (![1, 10, -1].includes(state.settings.buyAmount)) state.settings.buyAmount = 1;
  return state;
}

export function serialize(state: GameState): string {
  return JSON.stringify(state);
}

export function exportSave(state: GameState): string {
  return btoa(unescape(encodeURIComponent(serialize(state))));
}

export function importSave(text: string): GameState | null {
  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(escape(atob(text.trim()))));
    if (!isObj(parsed) || typeof parsed.pixels !== 'number') return null;
    return hydrate(parsed);
  } catch {
    return null;
  }
}
