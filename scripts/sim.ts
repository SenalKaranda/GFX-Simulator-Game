// Headless balance check: a greedy bot plays the game and prints the pacing.
import { FX, GENERATORS, HARDWARE, PERKS, TOTAL_GRAPHICS_UPGRADES, TRACKS } from '../src/game/data';
import {
  Game, fxCost, generatorCost, generatorRate, nextTrackCost, pixelsPerSecond, simulatedFps,
  teraflopGain, upgradeCount,
} from '../src/game/logic';
import { newState } from '../src/game/state';

const CLICKS_PER_SECOND = Number(process.env.CPS ?? 3);
const HOURS = Number(process.env.HOURS ?? 12);
const game = new Game(newState());
const s = game.state;
const fmt = (t: number) => `${Math.floor(t / 3600)}h${String(Math.floor((t % 3600) / 60)).padStart(2, '0')}m`;
let time = 0;
let nextReport = 5;
let achievementsGranted = 0;

function cheapestGraphics(): { cost: number; buy: () => boolean } | null {
  let best: { cost: number; buy: () => boolean } | null = null;
  const consider = (cost: number | null, buy: () => boolean) => {
    if (cost !== null && (!best || cost < best.cost)) best = { cost, buy };
  };
  for (const tr of TRACKS) consider(nextTrackCost(s, tr.id), () => game.buyTrack(tr.id));
  for (const fx of FX) if (!s.fxOwned[fx.id]) consider(fxCost(s, fx.id), () => game.buyFx(fx.id));
  const hw = HARDWARE[s.hardware + 1];
  if (hw) consider(hw.cost, () => game.buyHardware());
  return best;
}

function step(): void {
  game.tick(1);
  for (let i = 0; i < CLICKS_PER_SECOND; i++) game.click();
  // Roughly model achievements trickling in with progress.
  const expected = Math.min(45, Math.floor(upgradeCount(s) / 2 + s.generation * 2 + time / 1800));
  while (achievementsGranted < expected) game.unlockAchievement(`sim${achievementsGranted++}`);

  for (let guard = 0; guard < 200; guard++) {
    const gfx = cheapestGraphics();
    if (gfx && gfx.cost <= s.pixels) { gfx.buy(); continue; }
    let pick: { id: string; cost: number; payback: number } | null = null;
    for (const g of GENERATORS) {
      const cost = generatorCost(s, g);
      if (cost > s.pixels) continue;
      const before = generatorRate(s, g);
      s.generators[g.id]++;
      const gain = generatorRate(s, g) - before;
      s.generators[g.id]--;
      const payback = cost / gain;
      if (!pick || payback < pick.payback) pick = { id: g.id, cost, payback };
    }
    if (!pick) break;
    const pps = pixelsPerSecond(s) + 1e-9;
    const waitForGfx = gfx ? (gfx.cost - s.pixels) / pps : Infinity;
    if (pick.payback < Math.max(60, waitForGfx * 1.5) || !gfx) game.buyGenerator(pick.id, 1);
    else break;
  }
  for (const perk of PERKS) game.buyPerk(perk.id);

  const gain = teraflopGain(s);
  const gfx = cheapestGraphics();
  const stalled = gfx ? (gfx.cost - s.pixels) / (pixelsPerSecond(s) + 1e-9) > 480 : false;
  if (gain >= 1 && stalled && gain >= Math.max(1, s.teraflopsTotal * 0.6)) {
    console.log(`${fmt(time)}  PRESTIGE gen ${s.generation} -> +${gain} TF (run ${fmt(s.stats.runTime)}, upgrades ${upgradeCount(s)}/${TOTAL_GRAPHICS_UPGRADES})`);
    game.prestige();
    nextReport = 5;
  }
}

for (; time < HOURS * 3600; time++) {
  step();
  if (upgradeCount(s) >= nextReport) {
    console.log(`${fmt(time)}  gen ${s.generation} upgrades ${upgradeCount(s)} pps ${pixelsPerSecond(s).toExponential(2)} fps ${simulatedFps(s).toFixed(1)} hw ${s.hardware} TF ${s.teraflopsTotal}`);
    nextReport += 5;
  }
  if (upgradeCount(s) >= TOTAL_GRAPHICS_UPGRADES) {
    console.log(`${fmt(time)}  EVERYTHING MAXED in generation ${s.generation}`);
    break;
  }
}
console.log(`end ${fmt(time)} gen ${s.generation} upgrades ${upgradeCount(s)}/${TOTAL_GRAPHICS_UPGRADES} TF ${s.teraflopsTotal}`);
