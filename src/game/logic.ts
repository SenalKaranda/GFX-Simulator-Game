import {
  BASE_FPS,
  CHALLENGES,
  FIDELITY_INCOME_MULT,
  FIDELITY_LOAD_MULT,
  FPS_CAP,
  FX,
  GENERATORS,
  GENERATOR_COST_GROWTH,
  GENERATOR_MILESTONES,
  HARDWARE,
  PERKS,
  RANKS,
  TOTAL_GRAPHICS_UPGRADES,
  TRACKS,
  trackById,
} from './data';
import type { ChallengeId, FxId, Generator, PerkId, TrackId } from './data';
import type { GameState } from './state';

export type GameEvent =
  | { type: 'buyTrack'; track: TrackId; level: number }
  | { type: 'buyFx'; fx: FxId }
  | { type: 'toggleFx'; fx: FxId; on: boolean }
  | { type: 'buyGenerator'; id: string; count: number }
  | { type: 'buyHardware'; level: number }
  | { type: 'buyPerk'; perk: PerkId }
  | { type: 'prestige'; gained: number; generation: number }
  | { type: 'challengeStart'; id: ChallengeId }
  | { type: 'challengeComplete'; id: ChallengeId }
  | { type: 'challengeFailed'; id: ChallengeId }
  | { type: 'challengeAbandon'; id: ChallengeId }
  | { type: 'achievement'; id: string }
  | { type: 'click'; value: number }
  | { type: 'deadPixel'; value: number }
  | { type: 'hype' }
  | { type: 'ending' }
  | { type: 'jump'; count: number }
  | { type: 'gameplay'; count: number };

export type Listener = (e: GameEvent) => void;

const ACH_BONUS = 0.02;
const ACH_BONUS_COLLECTOR = 0.05;
export const TERAFLOP_BONUS = 0.05;
/** Pixels earned in a generation before the first Teraflop is awarded. */
export const TERAFLOP_THRESHOLD = 1e7;
export const OFFLINE_CAP_SECONDS = 8 * 3600;
/** A screenshot going viral: production multiplier, how long it lasts, and how often. */
export const HYPE_MULT = 2;
export const HYPE_DURATION = 60;
export const HYPE_COOLDOWN = 300;

export function enabledFxCount(s: GameState): number {
  return FX.reduce((n, fx) => n + (s.fxOwned[fx.id] && s.fxOn[fx.id] ? 1 : 0), 0);
}

export function ownedFxCount(s: GameState): number {
  return FX.reduce((n, fx) => n + (s.fxOwned[fx.id] ? 1 : 0), 0);
}

export function trackLevels(s: GameState): number {
  return TRACKS.reduce((n, tr) => n + s.tracks[tr.id], 0);
}

/** Graphics tiers owned plus effects currently enabled. Drives income, GPU load and rank. */
export function upgradeCount(s: GameState): number {
  return trackLevels(s) + enabledFxCount(s);
}

export function completion(s: GameState): number {
  return upgradeCount(s) / TOTAL_GRAPHICS_UPGRADES;
}

export function rankName(s: GameState): string {
  const c = completion(s);
  let name = RANKS[0].name;
  for (const r of RANKS) if (c >= r.at - 1e-9) name = r.name;
  return name;
}

const fidelityOf = (cost: number): number => Math.round(10 * Math.log10(cost + 10) ** 2);

/** Vanity score: bigger number, better game. */
export function fidelityScore(s: GameState): number {
  let score = 0;
  for (const tr of TRACKS) {
    for (let i = 1; i <= s.tracks[tr.id]; i++) score += fidelityOf(tr.tiers[i].cost);
  }
  for (const fx of FX) if (s.fxOwned[fx.id] && s.fxOn[fx.id]) score += fidelityOf(fx.cost);
  return score;
}

export function gpuPower(s: GameState): number {
  return HARDWARE[s.hardware].power * (s.challengesDone.console ? 2 : 1);
}

/** The simulated frame rate: hardware power divided by everything you switched on. */
export function simulatedFps(s: GameState): number {
  const load = FIDELITY_LOAD_MULT ** upgradeCount(s);
  const fps = ((BASE_FPS * gpuPower(s)) / load) * (s.perks.framegen ? 2 : 1);
  return Math.min(FPS_CAP, fps);
}

/** Production scales between 50% (slideshow) and 100% (locked 60). */
export function fpsFactor(s: GameState): number {
  return 0.5 + (0.5 * simulatedFps(s)) / FPS_CAP;
}

export function achievementCount(s: GameState): number {
  return Object.keys(s.achievements).length;
}

export function globalMultiplier(s: GameState): number {
  let m = FIDELITY_INCOME_MULT ** upgradeCount(s);
  m *= 1 + TERAFLOP_BONUS * s.teraflopsTotal;
  m *= 1 + (s.perks.collector ? ACH_BONUS_COLLECTOR : ACH_BONUS) * achievementCount(s);
  m *= fpsFactor(s);
  if (s.challengesDone.patch) m *= 1.5;
  if (s.challenge === 'patch') m /= 6;
  return m;
}

export function milestoneMultiplier(owned: number): number {
  let m = 1;
  for (const at of GENERATOR_MILESTONES) if (owned >= at) m *= 2;
  return m;
}

export function generatorRate(s: GameState, g: Generator): number {
  const owned = s.generators[g.id];
  if (owned <= 0) return 0;
  let rate = owned * g.baseRate * milestoneMultiplier(owned);
  if (s.perks.dlc) rate *= 3;
  if (g.id === 'intern' && s.challengesDone.solo) rate *= 25;
  return rate * globalMultiplier(s);
}

export function hypeRemaining(s: GameState): number {
  return Math.max(0, s.hypeEnds - s.stats.playTime);
}

export function hypeCooldown(s: GameState): number {
  return Math.max(0, s.hypeReadyAt - s.stats.playTime);
}

const hypeMultiplier = (s: GameState): number => (hypeRemaining(s) > 0 ? HYPE_MULT : 1);

/** Staff production before any temporary hype boost. */
export function basePixelsPerSecond(s: GameState): number {
  let total = 0;
  for (const g of GENERATORS) total += generatorRate(s, g);
  return total;
}

export function pixelsPerSecond(s: GameState): number {
  return basePixelsPerSecond(s) * hypeMultiplier(s);
}

function baseClickValue(s: GameState): number {
  if (s.challenge === 'noclick') return 0;
  let v = HARDWARE[s.hardware].click * globalMultiplier(s) + 0.04 * basePixelsPerSecond(s);
  if (s.challengesDone.noclick) v *= 5;
  return v;
}

export function clickValue(s: GameState): number {
  return baseClickValue(s) * hypeMultiplier(s);
}

export interface NextGoal {
  kind: 'track' | 'fx' | 'hardware';
  id: string;
  label: string;
  cost: number;
}

/** The cheapest graphics purchase still available: what the player should aim for next. */
export function nextGoal(s: GameState): NextGoal | null {
  let best: NextGoal | null = null;
  const consider = (g: NextGoal): void => {
    if (!best || g.cost < best.cost) best = g;
  };
  for (const tr of TRACKS) {
    const cost = nextTrackCost(s, tr.id);
    if (cost === null || trackLocked(s, tr.id)) continue;
    consider({ kind: 'track', id: tr.id, label: `${tr.name}: ${tr.tiers[s.tracks[tr.id] + 1].name}`, cost });
  }
  for (const fx of FX) {
    if (!s.fxOwned[fx.id]) consider({ kind: 'fx', id: fx.id, label: fx.name, cost: fxCost(s, fx.id) });
  }
  const hw = HARDWARE[s.hardware + 1];
  if (hw && s.challenge !== 'console') consider({ kind: 'hardware', id: 'gpu', label: `GPU: ${hw.name}`, cost: hw.cost });
  return best;
}

const graphicsDiscount = (s: GameState): number => (s.perks.licence ? 0.6 : 1);

export function nextTrackCost(s: GameState, id: TrackId): number | null {
  const tr = trackById(id);
  const next = tr.tiers[s.tracks[id] + 1];
  return next ? next.cost * graphicsDiscount(s) : null;
}

export function fxCost(s: GameState, id: FxId): number {
  return FX.find((f) => f.id === id)!.cost * graphicsDiscount(s);
}

export function trackLocked(s: GameState, id: TrackId): boolean {
  return s.challenge === 'console' && id === 'resolution' && s.tracks.resolution >= 2;
}

export function generatorLocked(s: GameState, id: string): boolean {
  return s.challenge === 'solo' && id !== 'intern';
}

function generatorCostFactor(s: GameState): number {
  return (s.challengesDone.indie ? 0.85 : 1) * (s.challenge === 'indie' ? 10 : 1);
}

/** Cost of buying `count` more of a generator. */
export function generatorCost(s: GameState, g: Generator, count = 1): number {
  const owned = s.generators[g.id];
  const r = GENERATOR_COST_GROWTH;
  return (g.baseCost * generatorCostFactor(s) * r ** owned * (r ** count - 1)) / (r - 1);
}

export function maxAffordable(s: GameState, g: Generator): number {
  const owned = s.generators[g.id];
  const r = GENERATOR_COST_GROWTH;
  const first = g.baseCost * generatorCostFactor(s) * r ** owned;
  if (s.pixels < first) return 0;
  return Math.max(0, Math.floor(Math.log((s.pixels * (r - 1)) / first + 1) / Math.log(r) + 1e-9));
}

/** Teraflops awarded for launching the next generation right now. */
export function teraflopGain(s: GameState): number {
  const base = (s.runEarned / TERAFLOP_THRESHOLD) ** 0.12;
  if (base < 1) return 0;
  return Math.floor(base * (s.challengesDone.speedrun ? 1.25 : 1));
}

export class Game {
  private listeners: Listener[] = [];

  constructor(public state: GameState) {}

  on(fn: Listener): void {
    this.listeners.push(fn);
  }

  private emit(e: GameEvent): void {
    for (const fn of this.listeners) fn(e);
  }

  private earn(amount: number): void {
    if (!(amount > 0)) return;
    this.state.pixels += amount;
    this.state.runEarned += amount;
    this.state.totalEarned += amount;
  }

  private spend(cost: number): boolean {
    if (this.state.pixels + 1e-9 < cost) return false;
    this.state.pixels = Math.max(0, this.state.pixels - cost);
    return true;
  }

  /** Advance the simulation by `dt` seconds. */
  tick(dt: number): void {
    const s = this.state;
    // Hype may run out part-way through a long tick, so weight only the hyped seconds.
    const effective = dt + Math.min(dt, hypeRemaining(s)) * (HYPE_MULT - 1);
    this.earn(basePixelsPerSecond(s) * effective);
    if (s.perks.macro) this.earn(baseClickValue(s) * 4 * effective);
    s.stats.playTime += dt;
    if (!s.gameplayUnlocked && upgradeCount(s) >= TOTAL_GRAPHICS_UPGRADES) {
      s.gameplayUnlocked = true;
      this.emit({ type: 'ending' });
    }
    s.stats.runTime += dt;
    if (s.challenge) {
      s.challengeTime += dt;
      const ch = CHALLENGES.find((c) => c.id === s.challenge)!;
      if (upgradeCount(s) >= ch.goal) {
        s.challengesDone[ch.id] = true;
        s.challenge = null;
        this.emit({ type: 'challengeComplete', id: ch.id });
      } else if (ch.timeLimit && s.challengeTime > ch.timeLimit) {
        s.challenge = null;
        this.emit({ type: 'challengeFailed', id: ch.id });
      }
    }
  }

  click(): number {
    const value = clickValue(this.state);
    this.state.stats.clicks++;
    this.earn(value);
    this.emit({ type: 'click', value });
    return value;
  }

  /** Reward for catching a dead pixel: a chunk of production, with a sane floor. */
  catchDeadPixel(): number {
    const s = this.state;
    const value = Math.max(pixelsPerSecond(s) * 90, clickValue(s) * 30, 25);
    s.stats.deadPixels++;
    this.earn(value);
    this.emit({ type: 'deadPixel', value });
    return value;
  }

  buyTrack(id: TrackId): boolean {
    const s = this.state;
    const cost = nextTrackCost(s, id);
    if (cost === null || trackLocked(s, id) || !this.spend(cost)) return false;
    s.tracks[id]++;
    this.emit({ type: 'buyTrack', track: id, level: s.tracks[id] });
    return true;
  }

  buyFx(id: FxId): boolean {
    const s = this.state;
    if (s.fxOwned[id] || !this.spend(fxCost(s, id))) return false;
    s.fxOwned[id] = true;
    s.fxOn[id] = true;
    this.emit({ type: 'buyFx', fx: id });
    return true;
  }

  toggleFx(id: FxId): void {
    const s = this.state;
    if (!s.fxOwned[id]) return;
    s.fxOn[id] = !s.fxOn[id];
    s.stats.fxToggles++;
    this.emit({ type: 'toggleFx', fx: id, on: s.fxOn[id] });
  }

  buyGenerator(id: string, amount: number): number {
    const s = this.state;
    const g = GENERATORS.find((x) => x.id === id);
    if (!g || generatorLocked(s, id)) return 0;
    const count = amount < 0 ? maxAffordable(s, g) : amount;
    if (count <= 0 || !this.spend(generatorCost(s, g, count))) return 0;
    s.generators[id] += count;
    this.emit({ type: 'buyGenerator', id, count });
    return count;
  }

  buyHardware(): boolean {
    const s = this.state;
    const next = HARDWARE[s.hardware + 1];
    if (!next || s.challenge === 'console' || !this.spend(next.cost)) return false;
    s.hardware++;
    this.emit({ type: 'buyHardware', level: s.hardware });
    return true;
  }

  buyPerk(id: PerkId): boolean {
    const s = this.state;
    const perk = PERKS.find((p) => p.id === id);
    if (!perk || s.perks[id] || s.teraflops < perk.cost) return false;
    s.teraflops -= perk.cost;
    s.perks[id] = true;
    this.emit({ type: 'buyPerk', perk: id });
    return true;
  }

  private resetRun(): void {
    const s = this.state;
    s.pixels = 0;
    s.runEarned = 0;
    for (const tr of TRACKS) s.tracks[tr.id] = 0;
    for (const fx of FX) s.fxOwned[fx.id] = false;
    for (const g of GENERATORS) s.generators[g.id] = 0;
    s.hardware = 0;
    s.stats.runTime = 0;
    s.challengeTime = 0;
    if (s.perks.preorder) {
      s.generators.intern = 5;
      s.hardware = 1;
    }
  }

  /** Scrap everything and launch the next console generation. */
  prestige(): boolean {
    const s = this.state;
    const gained = teraflopGain(s);
    if (gained < 1) return false;
    const fastest = s.stats.fastestGeneration;
    if (fastest === 0 || s.stats.runTime < fastest) s.stats.fastestGeneration = s.stats.runTime;
    s.teraflops += gained;
    s.teraflopsTotal += gained;
    s.generation++;
    s.challenge = null;
    this.resetRun();
    this.emit({ type: 'prestige', gained, generation: s.generation });
    return true;
  }

  canStartChallenge(): boolean {
    return this.state.generation >= 2;
  }

  startChallenge(id: ChallengeId): boolean {
    const s = this.state;
    if (!this.canStartChallenge() || s.challenge || s.challengesDone[id]) return false;
    this.resetRun();
    if (id === 'console') s.hardware = 0;
    s.challenge = id;
    this.emit({ type: 'challengeStart', id });
    return true;
  }

  abandonChallenge(): void {
    const s = this.state;
    if (!s.challenge) return;
    const id = s.challenge;
    s.challenge = null;
    this.emit({ type: 'challengeAbandon', id });
  }

  /** Record a screenshot. Returns true if it went viral and started a hype boost. */
  takePhoto(): boolean {
    const s = this.state;
    s.stats.photos++;
    if (hypeCooldown(s) > 0) return false;
    s.hypeEnds = s.stats.playTime + HYPE_DURATION;
    s.hypeReadyAt = s.stats.playTime + HYPE_COOLDOWN;
    s.stats.hypes++;
    this.emit({ type: 'hype' });
    return true;
  }

  /** The gameplay. All of it. */
  jump(): boolean {
    const s = this.state;
    if (!s.gameplayUnlocked) return false;
    this.emit({ type: 'jump', count: ++s.stats.jumps });
    return true;
  }

  requestGameplay(): number {
    const count = ++this.state.stats.gameplayRequests;
    this.emit({ type: 'gameplay', count });
    return count;
  }

  unlockAchievement(id: string): void {
    if (this.state.achievements[id]) return;
    this.state.achievements[id] = Date.now();
    this.emit({ type: 'achievement', id });
  }

  /** Credit time spent away. Returns what was earned, or null if nothing worth mentioning. */
  applyOffline(now: number): { seconds: number; earned: number } | null {
    const s = this.state;
    const seconds = Math.min(OFFLINE_CAP_SECONDS, (now - s.lastSaved) / 1000);
    if (!(seconds > 60)) return null;
    const earned = basePixelsPerSecond(s) * seconds * (s.perks.crunch ? 1 : 0.25);
    if (earned <= 0) return null;
    this.earn(earned);
    if (s.challenge) s.challengeTime += seconds;
    s.stats.offlineReturns++;
    return { seconds, earned };
  }
}
