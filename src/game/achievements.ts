import { CHALLENGES, FX, GENERATORS, HARDWARE, PERKS, TOTAL_GRAPHICS_UPGRADES, trackById } from './data';
import type { TrackId } from './data';
import { enabledFxCount, ownedFxCount, simulatedFps, upgradeCount } from './logic';
import type { GameState } from './state';

export interface Achievement {
  id: string;
  name: string;
  desc: string;
  /** Hidden achievements show as ??? until earned. */
  secret?: boolean;
  check: (s: GameState) => boolean;
}

const maxed = (s: GameState, id: TrackId): boolean => s.tracks[id] >= trackById(id).tiers.length - 1;
const totalStaff = (s: GameState): number => GENERATORS.reduce((n, g) => n + s.generators[g.id], 0);
const a = (id: string, name: string, desc: string, check: (s: GameState) => boolean, secret = false): Achievement => ({
  id, name, desc, check, secret,
});

export const ACHIEVEMENTS: Achievement[] = [
  // Clicking
  a('click1', 'Hello, Triangle', 'Click the scene once.', (s) => s.stats.clicks >= 1),
  a('click500', 'Manual Rasterisation', 'Click the scene 500 times.', (s) => s.stats.clicks >= 500),
  a('click5k', 'Carpal Tunnel Shader', 'Click the scene 5,000 times.', (s) => s.stats.clicks >= 5000),
  a('click25k', 'Human Render Farm', 'Click the scene 25,000 times.', (s) => s.stats.clicks >= 25000),
  // Earnings
  a('earn1k', 'Kilopixel', 'Earn 1,000 pixels in total.', (s) => s.totalEarned >= 1e3),
  a('earn1m', 'Megapixel', 'Earn a million pixels in total.', (s) => s.totalEarned >= 1e6),
  a('earn1b', 'Gigapixel', 'Earn a billion pixels in total.', (s) => s.totalEarned >= 1e9),
  a('earn1t', 'Terapixel', 'Earn a trillion pixels in total.', (s) => s.totalEarned >= 1e12),
  a('earn1qa', 'More Pixels Than Sense', 'Earn a quadrillion pixels in total.', (s) => s.totalEarned >= 1e15),
  a('earn1qi', 'Pixel Singularity', 'Earn a quintillion pixels in total.', (s) => s.totalEarned >= 1e18),
  // Staff
  a('staff1', 'Exposure Is Payment', 'Hire your first intern.', (s) => s.generators.intern >= 1),
  a('staff50i', 'Internship Programme', 'Have 50 Unpaid Interns.', (s) => s.generators.intern >= 50),
  a('staffAll', 'Org Chart', 'Own at least one of every kind of staff.', (s) => GENERATORS.every((g) => s.generators[g.id] >= 1)),
  a('staff100', 'Studio Head', 'Employ 100 staff in total.', (s) => totalStaff(s) >= 100),
  a('staff500', 'Too Big To Ship', 'Employ 500 staff in total.', (s) => totalStaff(s) >= 500),
  a('staff100one', 'Department Of One Thing', 'Own 100 of a single kind of staff.', (s) => GENERATORS.some((g) => s.generators[g.id] >= 100)),
  // Graphics
  a('gfx1', 'It Begins', 'Buy your first graphics setting.', (s) => upgradeCount(s) >= 1),
  a('gfxHalf', 'Vertical Slice', 'Own half of all graphics upgrades.', (s) => upgradeCount(s) >= TOTAL_GRAPHICS_UPGRADES / 2),
  a('gfxAll', 'Indistinguishable From A Screenshot', 'Max every setting with every effect enabled.', (s) => upgradeCount(s) >= TOTAL_GRAPHICS_UPGRADES),
  a('res1080', 'Finally Playable', 'Reach 1080p.', (s) => s.tracks.resolution >= 5),
  a('resMax', 'Beyond The Human Eye', 'Max out Resolution.', (s) => maxed(s, 'resolution')),
  a('colMax', 'Retina Damage', 'Max out Colour Depth.', (s) => maxed(s, 'colour')),
  a('polyMax', 'Pore Budget', 'Max out Polygon Count.', (s) => maxed(s, 'polygons')),
  a('texMax', '380 GB Install', 'Max out Texture Quality.', (s) => maxed(s, 'textures')),
  a('lightMax', 'RAYS: TRACED', 'Unlock full ray tracing.', (s) => maxed(s, 'lighting')),
  a('shadowMax', 'Shadow Of The Shadow', 'Max out Shadows.', (s) => maxed(s, 'shadows')),
  a('aaMax', 'Smooth Operator', 'Max out Anti-Aliasing.', (s) => maxed(s, 'antialiasing')),
  a('drawMax', 'See That Mountain?', 'Max out Draw Distance. You still cannot go there.', (s) => maxed(s, 'drawDistance')),
  a('folMax', 'Touch Grass', 'Max out Foliage Density.', (s) => maxed(s, 'foliage')),
  a('waterMax', 'Wet Look', 'Max out Water Quality.', (s) => maxed(s, 'water')),
  a('hairMax', 'Because You\'re Worth It', 'Max out Hair Technology.', (s) => maxed(s, 'hair')),
  a('fxAll', 'Cinematic Experience', 'Have every post-processing effect enabled at once.', (s) => enabledFxCount(s) >= FX.length),
  a('fxNone', 'Purist', 'Own at least 5 effects and switch them all off.', (s) => ownedFxCount(s) >= 5 && enabledFxCount(s) === 0, true),
  a('lopsided', 'Priorities', 'Reach 4K while still on flat-colour textures.', (s) => s.tracks.resolution >= 6 && s.tracks.textures === 0, true),
  // Frame rate
  a('fps15', '30 FPS Is Cinematic', 'Let the frame rate drop below 15.', (s) => simulatedFps(s) < 15),
  a('fps1', 'PowerPoint Presentation', 'Let the frame rate drop below 1.', (s) => simulatedFps(s) < 1),
  a('fps60', 'Buttery Smooth', 'Hold 60 FPS with at least half of all graphics upgrades.', (s) => simulatedFps(s) >= 60 && upgradeCount(s) >= TOTAL_GRAPHICS_UPGRADES / 2),
  a('hwMax', 'Kardashev Type II Gamer', 'Buy the best GPU in existence.', (s) => s.hardware >= HARDWARE.length - 1),
  // Prestige & challenges
  a('gen2', 'Next-Gen Is Here', 'Launch a new console generation.', (s) => s.generation >= 2),
  a('gen5', 'Console War Veteran', 'Reach generation 5.', (s) => s.generation >= 5),
  a('gen10', 'Remaster Of The Remake', 'Reach generation 10.', (s) => s.generation >= 10),
  a('quickGen', 'Rushed To Market', 'Launch a generation less than 10 minutes after the last.', (s) => s.stats.fastestGeneration > 0 && s.stats.fastestGeneration < 600),
  a('perk1', 'Monetisation Strategy', 'Buy a Teraflop perk.', (s) => PERKS.some((p) => s.perks[p.id])),
  a('perkAll', 'Ultimate Edition', 'Buy every Teraflop perk.', (s) => PERKS.every((p) => s.perks[p.id])),
  a('chal1', 'Self-Imposed Suffering', 'Complete a challenge.', (s) => CHALLENGES.some((c) => s.challengesDone[c.id])),
  a('chalAll', 'Platinum Trophy', 'Complete every challenge.', (s) => CHALLENGES.every((c) => s.challengesDone[c.id])),
  // Silliness
  a('gameplay1', 'Feature Request', 'Ask for gameplay.', (s) => s.stats.gameplayRequests >= 1),
  a('gameplay25', 'Out Of Scope', 'Ask for gameplay 25 times.', (s) => s.stats.gameplayRequests >= 25, true),
  a('gameplay100', 'It Was Never About The Gameplay', 'Ask for gameplay 100 times.', (s) => s.stats.gameplayRequests >= 100, true),
  a('photo1', 'Bullshot', 'Take a screenshot in Photo Mode.', (s) => s.stats.photos >= 1),
  a('photo10', 'Virtual Photographer', 'Take 10 screenshots. Playing the game is optional.', (s) => s.stats.photos >= 10),
  a('hype1', 'Going Viral', 'Start a hype boost by taking a screenshot.', (s) => s.stats.hypes >= 1),
  a('hype10', 'Influencer', 'Go viral 10 times.', (s) => s.stats.hypes >= 10),
  a('dead1', 'Stuck Pixel', 'Catch a dead pixel.', (s) => s.stats.deadPixels >= 1),
  a('dead20', 'Warranty Claim', 'Catch 20 dead pixels.', (s) => s.stats.deadPixels >= 20),
  a('offline', 'Overnight Render', 'Come back to pixels earned while you were away.', (s) => s.stats.offlineReturns >= 1),
  a('hour1', 'Sunk Cost', 'Play for one hour.', (s) => s.stats.playTime >= 3600),
  a('ending', 'Gold Master', 'Finish the graphics. Unlock the gameplay.', (s) => s.gameplayUnlocked),
  a('jump1', 'Emergent Gameplay', 'Play the game.', (s) => s.stats.jumps >= 1, true),
  a('jump100', 'Platformer Of The Year', 'Jump 100 times. There is still nothing to jump over.', (s) => s.stats.jumps >= 100, true),
  a('silent', 'Silent Protagonist', 'Mute sound effects, music and the GPU fan.', (s) => !s.settings.sfx && !s.settings.music && !s.settings.fan, true),
];

export const achievementById = (id: string): Achievement | undefined => ACHIEVEMENTS.find((x) => x.id === id);
