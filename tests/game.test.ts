import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS } from '../src/game/achievements';
import { CHALLENGES, FX, GENERATORS, HARDWARE, TOTAL_GRAPHICS_UPGRADES, TRACKS } from '../src/game/data';
import {
  Game, HYPE_COOLDOWN, HYPE_DURATION, HYPE_MULT, clickValue, generatorCost, hypeRemaining, maxAffordable, nextGoal,
  nextTrackCost, pixelsPerSecond, simulatedFps, teraflopGain, upgradeCount,
} from '../src/game/logic';
import { exportSave, hydrate, importSave, newState } from '../src/game/state';
import { fmt, fmtFps, fmtTime } from '../src/ui/format';

const fresh = () => new Game(newState());

describe('content', () => {
  it('has strictly increasing costs within every track and for hardware', () => {
    for (const tr of TRACKS) {
      for (let i = 2; i < tr.tiers.length; i++) expect(tr.tiers[i].cost).toBeGreaterThan(tr.tiers[i - 1].cost);
    }
    for (let i = 1; i < HARDWARE.length; i++) expect(HARDWARE[i].cost).toBeGreaterThan(HARDWARE[i - 1].cost);
  });

  it('has unique achievement ids and counts 60 graphics upgrades', () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
    expect(TOTAL_GRAPHICS_UPGRADES).toBe(60);
  });

  it('keeps every challenge goal reachable', () => {
    for (const ch of CHALLENGES) expect(ch.goal).toBeLessThan(TOTAL_GRAPHICS_UPGRADES);
  });
});

describe('economy', () => {
  it('earns from clicks and refuses purchases it cannot afford', () => {
    const g = fresh();
    expect(g.buyTrack('resolution')).toBe(false);
    for (let i = 0; i < 15; i++) g.click();
    expect(g.state.pixels).toBeCloseTo(15);
    expect(g.buyTrack('resolution')).toBe(true);
    expect(g.state.tracks.resolution).toBe(1);
    expect(g.state.pixels).toBeCloseTo(0);
  });

  it('produces pixels over time from staff', () => {
    const g = fresh();
    g.state.pixels = 1e4;
    expect(g.buyGenerator('intern', 10)).toBe(10);
    const pps = pixelsPerSecond(g.state);
    expect(pps).toBeGreaterThan(0);
    const before = g.state.pixels;
    g.tick(10);
    expect(g.state.pixels - before).toBeCloseTo(pps * 10);
  });

  it('computes bulk generator cost and max affordable consistently', () => {
    const g = fresh();
    const intern = GENERATORS[0];
    g.state.pixels = 5000;
    const n = maxAffordable(g.state, intern);
    expect(generatorCost(g.state, intern, n)).toBeLessThanOrEqual(5000);
    expect(generatorCost(g.state, intern, n + 1)).toBeGreaterThan(5000);
    expect(g.buyGenerator('intern', -1)).toBe(n);
  });

  it('trades frame rate for fidelity, and effects only count while enabled', () => {
    const g = fresh();
    g.state.pixels = 1e30;
    const fpsBefore = simulatedFps(g.state);
    for (let i = 0; i < 4; i++) g.buyTrack('resolution');
    expect(simulatedFps(g.state)).toBeLessThan(fpsBefore);
    g.buyFx('bloom');
    const withBloom = upgradeCount(g.state);
    g.toggleFx('bloom');
    expect(upgradeCount(g.state)).toBe(withBloom - 1);
  });

  it('can max everything', () => {
    const g = fresh();
    g.state.pixels = 1e40;
    for (const tr of TRACKS) while (nextTrackCost(g.state, tr.id) !== null) expect(g.buyTrack(tr.id)).toBe(true);
    for (const fx of FX) expect(g.buyFx(fx.id)).toBe(true);
    expect(upgradeCount(g.state)).toBe(TOTAL_GRAPHICS_UPGRADES);
  });
});

describe('goals, hype and the ending', () => {
  it('points at the cheapest outstanding upgrade', () => {
    const g = fresh();
    expect(nextGoal(g.state)).toMatchObject({ kind: 'track', id: 'resolution', cost: 15 });
    g.state.pixels = 1e60;
    let guard = 0;
    for (let goal = nextGoal(g.state); goal && guard < 200; goal = nextGoal(g.state), guard++) {
      if (goal.kind === 'track') g.buyTrack(goal.id as never);
      else if (goal.kind === 'fx') g.buyFx(goal.id as never);
      else g.buyHardware();
    }
    expect(nextGoal(g.state)).toBeNull();
    expect(upgradeCount(g.state)).toBe(TOTAL_GRAPHICS_UPGRADES);
  });

  it('doubles production for a limited time after a viral screenshot', () => {
    const g = fresh();
    g.state.pixels = 1e4;
    g.buyGenerator('intern', 10);
    const base = pixelsPerSecond(g.state);
    expect(g.takePhoto()).toBe(true);
    expect(pixelsPerSecond(g.state)).toBeCloseTo(base * HYPE_MULT);
    expect(g.takePhoto()).toBe(false);
    expect(g.state.stats.photos).toBe(2);
    // A long tick only pays the bonus for the seconds hype actually lasted.
    const before = g.state.pixels;
    g.tick(HYPE_DURATION * 3);
    expect(g.state.pixels - before).toBeCloseTo(base * HYPE_DURATION * (3 + HYPE_MULT - 1));
    expect(hypeRemaining(g.state)).toBe(0);
    expect(g.takePhoto()).toBe(false);
    g.tick(HYPE_COOLDOWN);
    expect(g.takePhoto()).toBe(true);
  });

  it('unlocks gameplay once everything is owned, and keeps it through prestige', () => {
    const g = fresh();
    const events: string[] = [];
    g.on((e) => events.push(e.type));
    expect(g.jump()).toBe(false);
    g.state.pixels = g.state.runEarned = 1e60;
    for (const tr of TRACKS) while (g.buyTrack(tr.id));
    for (const fx of FX) g.buyFx(fx.id);
    g.tick(0.1);
    g.tick(0.1);
    expect(events.filter((e) => e === 'ending')).toHaveLength(1);
    expect(g.jump()).toBe(true);
    expect(g.state.stats.jumps).toBe(1);
    expect(g.prestige()).toBe(true);
    expect(g.state.gameplayUnlocked).toBe(true);
  });
});

describe('prestige and challenges', () => {
  it('resets the run but keeps permanent progress', () => {
    const g = fresh();
    expect(g.prestige()).toBe(false);
    g.state.pixels = g.state.runEarned = 1e12;
    g.buyTrack('resolution');
    g.unlockAchievement('click1');
    const gain = teraflopGain(g.state);
    expect(gain).toBeGreaterThan(0);
    expect(g.prestige()).toBe(true);
    expect(g.state.generation).toBe(2);
    expect(g.state.teraflops).toBe(gain);
    expect(g.state.pixels).toBe(0);
    expect(g.state.tracks.resolution).toBe(0);
    expect(g.state.achievements.click1).toBeTruthy();
  });

  it('applies challenge handicaps and grants the reward on completion', () => {
    const g = fresh();
    expect(g.startChallenge('noclick')).toBe(false);
    g.state.generation = 2;
    expect(g.startChallenge('noclick')).toBe(true);
    expect(clickValue(g.state)).toBe(0);
    g.state.pixels = 1e30;
    const goal = CHALLENGES.find((c) => c.id === 'noclick')!.goal;
    while (upgradeCount(g.state) < goal) {
      const tr = TRACKS.find((x) => nextTrackCost(g.state, x.id) !== null)!;
      g.buyTrack(tr.id);
    }
    g.tick(0.1);
    expect(g.state.challenge).toBeNull();
    expect(g.state.challengesDone.noclick).toBe(true);
  });

  it('fails a timed challenge when the clock runs out', () => {
    const g = fresh();
    g.state.generation = 2;
    g.startChallenge('speedrun');
    g.tick(481);
    expect(g.state.challenge).toBeNull();
    expect(g.state.challengesDone.speedrun).toBe(false);
  });

  it('locks resolution and hardware during Console Port', () => {
    const g = fresh();
    g.state.generation = 2;
    g.startChallenge('console');
    g.state.pixels = 1e30;
    g.buyTrack('resolution');
    g.buyTrack('resolution');
    expect(g.buyTrack('resolution')).toBe(false);
    expect(g.buyHardware()).toBe(false);
  });
});

describe('saves', () => {
  it('round-trips through export and import', () => {
    const g = fresh();
    g.state.pixels = 1234.5;
    g.state.tracks.hair = 2;
    g.state.achievements.click1 = 42;
    const copy = importSave(exportSave(g.state))!;
    expect(copy.pixels).toBe(1234.5);
    expect(copy.tracks.hair).toBe(2);
    expect(copy.achievements.click1).toBe(42);
  });

  it('survives corrupt or hostile data', () => {
    expect(importSave('not a save')).toBeNull();
    const s = hydrate({ pixels: 'lots', tracks: { resolution: 999, bogus: 3 }, challenge: 'nope', settings: { volume: null }, extra: true });
    expect(s.pixels).toBe(0);
    expect(s.tracks.resolution).toBe(TRACKS[0].tiers.length - 1);
    expect('bogus' in s.tracks).toBe(false);
    expect(s.challenge).toBeNull();
    expect(s.settings.volume).toBe(0.6);
  });

  it('credits offline time at reduced efficiency, capped', () => {
    const g = fresh();
    g.state.pixels = 1e4;
    g.buyGenerator('intern', 10);
    const pps = pixelsPerSecond(g.state);
    g.state.lastSaved = 0;
    const before = g.state.pixels;
    const result = g.applyOffline(1000 * 3600 * 100)!;
    expect(result.seconds).toBe(8 * 3600);
    expect(g.state.pixels - before).toBeCloseTo(pps * 8 * 3600 * 0.25);
  });
});

describe('formatting', () => {
  it('formats numbers, times and frame rates', () => {
    expect(fmt(0)).toBe('0');
    expect(fmt(999)).toBe('999');
    expect(fmt(1234)).toBe('1.23K');
    expect(fmt(999999)).toBe('999K');
    expect(fmt(1e15)).toBe('1.00Qa');
    expect(fmt(1e40)).toBe('1.00e40');
    expect(fmtTime(3725)).toBe('1h 2m');
    expect(fmtFps(59.6)).toBe('60 FPS');
    expect(fmtFps(0.25)).toBe('4.0 SPF');
  });
});
