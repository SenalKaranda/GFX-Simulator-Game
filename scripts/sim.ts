// Headless balance check: a greedy bot plays the game and prints the pacing.
// Usage: npm run sim            (full playthrough)
//        MODE=challenges npm run sim
import { CHALLENGES, FX, GENERATORS, HARDWARE, PERKS, TOTAL_GRAPHICS_UPGRADES, TRACKS } from '../src/game/data';
import {
  Game, fxCost, generatorCost, generatorLocked, generatorRate, nextTrackCost, pixelsPerSecond, simulatedFps,
  teraflopGain, trackLocked, upgradeCount,
} from '../src/game/logic';
import { newState } from '../src/game/state';

type GameT = Game;
const env = process.env;

const CPS = Number(env.CPS ?? 2);
const HOURS = Number(env.HOURS ?? 12);
const VERBOSE = env.VERBOSE === '1';
const fmt = (t: number) => `${Math.floor(t / 3600)}h${String(Math.floor((t % 3600) / 60)).padStart(2, '0')}m`;

function cheapestGraphics(game: GameT): { cost: number; buy: () => boolean } | null {
  const s = game.state;
  let best: { cost: number; buy: () => boolean } | null = null;
  const consider = (cost: number | null, buy: () => boolean) => {
    if (cost !== null && (!best || cost < best.cost)) best = { cost, buy };
  };
  for (const tr of TRACKS) if (!trackLocked(s, tr.id)) consider(nextTrackCost(s, tr.id), () => game.buyTrack(tr.id));
  for (const fx of FX) if (!s.fxOwned[fx.id]) consider(fxCost(s, fx.id), () => game.buyFx(fx.id));
  const hw = HARDWARE[s.hardware + 1];
  if (hw && s.challenge !== 'console') consider(hw.cost, () => game.buyHardware());
  return best;
}

let fakeAchievements = 0;
/** One simulated second of a reasonably attentive player. */
function step(game: GameT, playTime: number): void {
  const s = game.state;
  game.tick(1);
  for (let i = 0; i < CPS; i++) game.click();
  // Roughly model achievements trickling in with progress.
  const expected = Math.min(48, Math.floor(upgradeCount(s) / 2 + s.generation * 2 + playTime / 1800));
  while (fakeAchievements < expected) game.unlockAchievement(`sim${fakeAchievements++}`);

  for (let guard = 0; guard < 200; guard++) {
    const gfx = cheapestGraphics(game);
    if (gfx && gfx.cost <= s.pixels) { gfx.buy(); continue; }
    let pick: { id: string; payback: number } | null = null;
    for (const g of GENERATORS) {
      if (generatorLocked(s, g.id)) continue;
      const cost = generatorCost(s, g);
      if (cost > s.pixels) continue;
      const before = generatorRate(s, g);
      s.generators[g.id]++;
      const gain = generatorRate(s, g) - before;
      s.generators[g.id]--;
      const payback = cost / gain;
      if (!pick || payback < pick.payback) pick = { id: g.id, payback };
    }
    if (!pick) break;
    const pps = pixelsPerSecond(s) + 1e-9;
    const waitForGfx = gfx ? (gfx.cost - s.pixels) / pps : Infinity;
    if (pick.payback < Math.max(60, waitForGfx * 1.5) || !gfx) game.buyGenerator(pick.id, 1);
    else break;
  }
  for (const perk of PERKS) game.buyPerk(perk.id);
}

function stalledFor(game: GameT): number {
  const s = game.state;
  const gfx = cheapestGraphics(game);
  return gfx ? (gfx.cost - s.pixels) / (pixelsPerSecond(s) + 1e-9) : 0;
}

function playthrough(): void {
  const game = new Game(newState());
  const s = game.state;
  let time = 0;
  let nextReport = 10;
  const runs: string[] = [];
  const summary = env.MODE === 'summary';
  for (; time < HOURS * 3600; time++) {
    step(game, time);
    const gain = teraflopGain(s);
    if (gain >= 1 && stalledFor(game) > Number(env.STALL ?? 300) && gain >= Math.max(1, s.teraflopsTotal * 0.5)) {
      runs.push(`${Math.round(s.stats.runTime / 60)}m@${upgradeCount(s)}`);
      if (!summary) console.log(`${fmt(time)}  PRESTIGE gen ${s.generation} -> +${gain} TF (run ${fmt(s.stats.runTime)}, upgrades ${upgradeCount(s)}/${TOTAL_GRAPHICS_UPGRADES})`);
      game.prestige();
      nextReport = 10;
    }
    if (upgradeCount(s) >= nextReport) {
      if (!summary && (VERBOSE || s.generation === 1)) console.log(`${fmt(time)}  gen ${s.generation} upgrades ${upgradeCount(s)} pps ${pixelsPerSecond(s).toExponential(1)} fps ${simulatedFps(s).toFixed(1)} TF ${s.teraflopsTotal}`);
      nextReport += 10;
    }
    if (upgradeCount(s) >= TOTAL_GRAPHICS_UPGRADES) {
      if (!summary) console.log(`${fmt(time)}  EVERYTHING MAXED in generation ${s.generation}`);
      break;
    }
  }
  runs.push(`${Math.round(s.stats.runTime / 60)}m@${upgradeCount(s)}`);
  if (summary) {
    console.log(`${fmt(time)} total | ${runs.join(' ')} | TF ${s.teraflopsTotal}`);
    return;
  }
  console.log(`end ${fmt(time)} gen ${s.generation} upgrades ${upgradeCount(s)}/${TOTAL_GRAPHICS_UPGRADES} TF ${s.teraflopsTotal}`);
}

/** How long does each challenge take for players with a few, some, or many Teraflops? */
function challenges(): void {
  for (const tf of [4, 12, 30]) {
    for (const ch of CHALLENGES) {
      const game = new Game(newState());
      const s = game.state;
      s.generation = 3;
      s.teraflops = s.teraflopsTotal = tf;
      fakeAchievements = 0;
      for (const perk of PERKS) game.buyPerk(perk.id);
      game.startChallenge(ch.id);
      let t = 0;
      for (; t < 4 * 3600 && s.challenge; t++) step(game, 3600);
      const result = s.challengesDone[ch.id] ? `done in ${fmt(t)}` : s.challenge ? `NOT DONE after ${fmt(t)} (${upgradeCount(s)}/${ch.goal})` : `FAILED at ${fmt(t)} (${upgradeCount(s)}/${ch.goal})`;
      console.log(`TF ${String(tf).padStart(3)}  ${ch.name.padEnd(18)} goal ${ch.goal}  ${result}`);
    }
  }
}

if (env.MODE === 'challenges') challenges();
else playthrough();
