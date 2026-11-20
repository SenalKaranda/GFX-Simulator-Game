// Static game content: everything the player can buy, and what it is called.

export interface Tier {
  name: string;
  desc: string;
  /** Cost in pixels to reach this tier. Tier 0 is the free starting state. */
  cost: number;
}

export type TrackId =
  | 'resolution'
  | 'colour'
  | 'polygons'
  | 'textures'
  | 'lighting'
  | 'shadows'
  | 'antialiasing'
  | 'drawDistance'
  | 'foliage'
  | 'water'
  | 'hair';

export interface Track {
  id: TrackId;
  name: string;
  icon: string;
  tiers: Tier[];
}

/**
 * Late-game prices are stretched so a single console generation stalls well short of
 * the top; the rest needs Teraflops. Costs below the knee are used as written.
 */
const KNEE = 1e8;
const STRETCH = 1.35;
export const steep = (cost: number): number => {
  if (cost <= KNEE) return cost;
  const v = KNEE * (cost / KNEE) ** STRETCH;
  const mag = 10 ** (Math.floor(Math.log10(v)) - 1);
  return Math.round(v / mag) * mag;
};

const t = (name: string, cost: number, desc: string): Tier => ({ name, cost: steep(cost), desc });

export const TRACKS: Track[] = [
  {
    id: 'resolution',
    name: 'Resolution',
    icon: '▦',
    tiers: [
      t('64 × 36', 0, 'Technically an image.'),
      t('160 × 90', 15, 'Squint and it is art.'),
      t('320 × 180', 400, 'Retro. Deliberately. We swear.'),
      t('640 × 360', 2.5e4, 'The "performance mode" of tomorrow.'),
      t('720p', 2e6, 'HD Ready, as the sticker said.'),
      t('1080p', 3e8, 'Finally acceptable to forum users.'),
      t('4K', 6e10, 'Four whole Ks.'),
      t('8K', 2e13, 'Your monitor is 1080p. Buy it anyway.'),
      t('16K Ultra-Mega HD', 2e16, 'More pixels than the human eye, the human brain, or the human wallet.'),
    ],
  },
  {
    id: 'colour',
    name: 'Colour Depth',
    icon: '◐',
    tiers: [
      t('1-bit', 0, 'Black. White. Nothing else is canon.'),
      t('8 colours', 40, 'Now with cyan AND magenta.'),
      t('64 colours', 1.2e3, 'A box of crayons, most of them brown.'),
      t('512 colours', 6e4, 'Gradients are almost legal.'),
      t('High Colour', 5e6, 'Banding is a stylistic choice.'),
      t('True Colour', 9e8, '16.7 million colours. You will use six.'),
      t('HDR10000', 4e12, 'Brighter than the sun. Sunglasses sold separately.'),
    ],
  },
  {
    id: 'polygons',
    name: 'Polygon Count',
    icon: '△',
    tiers: [
      t('12 polygons', 0, 'The hero is a prism. Deal with it.'),
      t('Low-poly', 100, 'Round things now have six sides.'),
      t('Mid-poly', 5e3, 'Elbows have been discovered.'),
      t('High-poly', 4e5, 'Spheres are legally spheres.'),
      t('Movie quality', 6e7, 'Each rock has a 40 MB download.'),
      t('Nano-micro-geometry', 2e11, 'Individually modelled pores on every pebble.'),
    ],
  },
  {
    id: 'textures',
    name: 'Texture Quality',
    icon: '▩',
    tiers: [
      t('Flat colours', 0, 'Textures are a crutch.'),
      t('8 × 8', 250, 'Sixty-four texels of pure craft.'),
      t('32 × 32', 1.5e4, 'You can tell it is meant to be grass.'),
      t('256 × 256', 1.2e6, 'Bilinear filtering: now everything is smooth and sad.'),
      t('2K + anisotropic', 2e8, 'Crisp at every angle nobody looks from.'),
      t('8K photogrammetry', 9e11, 'We scanned an actual field. Install size: 380 GB.'),
    ],
  },
  {
    id: 'lighting',
    name: 'Lighting Model',
    icon: '☀',
    tiers: [
      t('Unlit', 0, 'Light has not been invented.'),
      t('Flat shading', 800, 'Every face picks one brightness and commits.'),
      t('Smooth shading', 8e4, 'Shiny highlights on everything, including dirt.'),
      t('Physically based', 1.5e7, 'Obeys the laws of physics, unlike the budget.'),
      t('Global illumination', 6e9, 'Light bounces. The frame rate does not.'),
      t('Fully ray traced', 5e13, 'Every puddle is now a mirror. There are a lot of puddles.'),
    ],
  },
  {
    id: 'shadows',
    name: 'Shadows',
    icon: '◗',
    tiers: [
      t('None', 0, 'Objects float mysteriously.'),
      t('Blob shadows', 2.5e3, 'A dark circle. Trust us, it is a shadow.'),
      t('Hard shadow maps', 3e5, 'Shadows with the edge quality of a staircase.'),
      t('Soft shadows', 1.2e8, 'Gently blurred at great expense.'),
      t('Ray-traced contact shadows', 3e12, 'Shadows inside the shadows.'),
    ],
  },
  {
    id: 'antialiasing',
    name: 'Anti-Aliasing',
    icon: '⟋',
    tiers: [
      t('Off', 0, 'Jaggies build character.'),
      t('FXAA', 6e5, 'Smears the image until the jaggies give up.'),
      t('SMAA', 4e9, 'Like FXAA, but with a longer acronym explanation.'),
      t('64x Super-Duper-Sampling', 8e14, 'Renders the game 64 times and averages your regret.'),
    ],
  },
  {
    id: 'drawDistance',
    name: 'Draw Distance',
    icon: '⛰',
    tiers: [
      t('Arm\'s length', 0, 'The fog is a feature.'),
      t('Short', 1e4, 'You can see the tree before you hit it.'),
      t('Medium', 2.5e6, 'Pop-in happens at a respectful distance.'),
      t('Far', 2e9, 'Mountains! Unreachable ones, obviously.'),
      t('Horizon and beyond', 1.5e13, 'Renders things behind the curvature of the earth.'),
    ],
  },
  {
    id: 'foliage',
    name: 'Foliage Density',
    icon: '♣',
    tiers: [
      t('Barren', 0, 'Grass is too expensive.'),
      t('Sparse', 4e4, 'A few blades, for the trailer.'),
      t('Lawn', 1.5e7, 'Each blade casts opinions.'),
      t('Meadow', 2.5e10, 'You can no longer see your character\'s feet.'),
      t('Jungle Simulator', 1.5e14, 'The grass has more polygons than the hero.'),
    ],
  },
  {
    id: 'water',
    name: 'Water Quality',
    icon: '≈',
    tiers: [
      t('Blue rectangle', 0, 'It is blue, so it is water.'),
      t('Animated', 2e5, 'It moves! Sort of.'),
      t('Specular + transparent', 5e8, 'You can see the nothing underneath.'),
      t('Planar reflections', 1e12, 'The whole scene, rendered twice, upside down.'),
    ],
  },
  {
    id: 'hair',
    name: 'Hair Technology',
    icon: '♆',
    tiers: [
      t('Bald', 0, 'Hair is the final boss of graphics.'),
      t('Hair helmet', 3e4, 'One solid, immovable lump.'),
      t('Hair cards', 4e7, 'A hundred floppy strips.'),
      t('HairFX™', 1e11, 'Thousands of strands. Costs 40 FPS. Worth it.'),
      t('Per-follicle simulation', 5e15, 'Every strand has a physics body and a backstory.'),
    ],
  },
];

export type FxId =
  | 'bloom'
  | 'vignette'
  | 'grain'
  | 'chromatic'
  | 'motionBlur'
  | 'lensFlare'
  | 'dof'
  | 'brown'
  | 'lensDirt';

export interface Fx {
  id: FxId;
  name: string;
  desc: string;
  cost: number;
}

/** "Cinematic" effects. Each can be toggled once owned; fidelity only counts while enabled. */
const FX_RAW: Fx[] = [
  { id: 'vignette', name: 'Vignette', cost: 2e3, desc: 'Darkens the corners so you know it is art.' },
  { id: 'bloom', name: 'Bloom', cost: 1.5e5, desc: 'Everything glows, especially things that should not.' },
  { id: 'grain', name: 'Film Grain', cost: 8e6, desc: 'Simulates a camera that was never there.' },
  { id: 'chromatic', name: 'Chromatic Aberration', cost: 7e8, desc: 'Simulates a broken camera that was never there.' },
  { id: 'motionBlur', name: 'Motion Blur', cost: 2e10, desc: 'Hides the frame rate you paid for.' },
  { id: 'lensFlare', name: 'Lens Flare', cost: 5e11, desc: 'A director once liked these.' },
  { id: 'dof', name: 'Depth of Field', cost: 8e12, desc: 'Blurs 80% of the detail you just bought.' },
  { id: 'brown', name: 'Realistic Colour Grading', cost: 3e14, desc: 'Real life is brown. Now so is the game.' },
  { id: 'lensDirt', name: 'Lens Dirt', cost: 4e15, desc: 'Your eyeballs are apparently a filthy camera.' },
];

export const FX: Fx[] = FX_RAW.map((f) => ({ ...f, cost: steep(f.cost) }));

export interface Generator {
  id: string;
  name: string;
  desc: string;
  baseCost: number;
  /** Pixels per second per unit, before multipliers. */
  baseRate: number;
}

export const GENERATOR_COST_GROWTH = 1.15;
/** Owning this many of a generator doubles that generator's output (each threshold). */
export const GENERATOR_MILESTONES = [10, 25, 50, 100, 150, 200];

export const GENERATORS: Generator[] = [
  { id: 'intern', name: 'Unpaid Intern', baseCost: 15, baseRate: 0.2, desc: 'Places pixels by hand. Paid in "exposure".' },
  { id: 'artist', name: 'Texture Artist', baseCost: 120, baseRate: 1.5, desc: 'Has photographed 4,000 different rocks.' },
  { id: 'shader', name: 'Shader Wizard', baseCost: 1.4e3, baseRate: 10, desc: 'Speaks only in vec4. Do not make eye contact.' },
  { id: 'mocap', name: 'Mocap Studio', baseCost: 1.8e4, baseRate: 70, desc: 'Grown adults in ping-pong-ball suits.' },
  { id: 'farm', name: 'Render Farm', baseCost: 2.5e5, baseRate: 500, desc: 'A warehouse that turns electricity into heat and pixels.' },
  { id: 'bullshot', name: 'Bullshot Department', baseCost: 4e6, baseRate: 3.8e3, desc: 'Marketing screenshots, lovingly touched up.' },
  { id: 'crunch', name: 'Crunch Studio', baseCost: 7e7, baseRate: 3e4, desc: 'Passion-driven. Mandatory passion.' },
  { id: 'upscaler', name: 'AI Upscaler', baseCost: 1.5e9, baseRate: 2.6e5, desc: 'Invents detail that was never there. Mostly fingers.' },
  { id: 'quantum', name: 'Quantum GPU Cluster', baseCost: 4e10, baseRate: 2.5e6, desc: 'Renders every possible frame at once. Ships none.' },
  { id: 'reality', name: 'Reality Scanner', baseCost: 1.5e12, baseRate: 2.8e7, desc: 'Just points a camera out of the window.' },
];

export interface Hardware {
  name: string;
  desc: string;
  cost: number;
  /** Relative GPU power; drives the simulated frame rate. */
  power: number;
  /** Multiplier applied to click value. */
  click: number;
}

const HARDWARE_RAW: Hardware[] = [
  { name: 'Integrated Potato', cost: 0, power: 1, click: 1, desc: 'Shares memory with the toaster.' },
  { name: 'GTY 1050', cost: 3e3, power: 5, click: 3, desc: 'Second-hand. Smells of crypto.' },
  { name: 'RTZ 2060', cost: 1e6, power: 30, click: 10, desc: 'The box said "RAYS".' },
  { name: 'RTZ 4080', cost: 1e9, power: 250, click: 40, desc: 'Needs its own support bracket.' },
  { name: 'RTZ 6090 Ti', cost: 2e11, power: 2500, click: 200, desc: 'Draws 900 W. Doubles as a space heater.' },
  { name: 'RTZ 9090 Ti Super', cost: 1e14, power: 20000, click: 1200, desc: 'Ships with a dedicated substation.' },
  { name: 'Dyson Sphere Edition', cost: 1e17, power: 80000, click: 10000, desc: 'Harvests a star to render your grass.' },
];

export const HARDWARE: Hardware[] = HARDWARE_RAW.map((h) => ({ ...h, cost: steep(h.cost) }));

/** Each owned graphics tier / enabled effect multiplies production and GPU load by these. */
export const FIDELITY_INCOME_MULT = 1.12;
export const FIDELITY_LOAD_MULT = 1.22;
export const BASE_FPS = 75;
export const FPS_CAP = 60;

export interface Perk {
  id: PerkId;
  name: string;
  desc: string;
  cost: number;
}

export type PerkId = 'preorder' | 'framegen' | 'macro' | 'dlc' | 'crunch' | 'licence' | 'collector';

/** Permanent upgrades bought with Teraflops. */
export const PERKS: Perk[] = [
  { id: 'preorder', name: 'Pre-order Bonus', cost: 1, desc: 'Start every generation with 5 interns and a GTY 1050.' },
  { id: 'macro', name: 'Macro Key', cost: 2, desc: 'Auto-clicks the scene 4 times per second.' },
  { id: 'framegen', name: 'Frame Generation', cost: 3, desc: 'Doubles FPS by making frames up. Nobody can tell. (They can.)' },
  { id: 'crunch', name: 'Crunch Culture', cost: 5, desc: 'Offline earnings rise from 25% to 100%. Sleep is for the shipped.' },
  { id: 'dlc', name: 'Day-One DLC', cost: 8, desc: 'All staff produce 3× as many pixels.' },
  { id: 'licence', name: 'Engine Licence', cost: 15, desc: 'Graphics settings and effects cost 40% less.' },
  { id: 'collector', name: 'Collector\'s Edition', cost: 30, desc: 'Each achievement gives +5% pixels instead of +2%.' },
];

export type ChallengeId = 'noclick' | 'solo' | 'indie' | 'patch' | 'console' | 'speedrun';

export interface Challenge {
  id: ChallengeId;
  name: string;
  rule: string;
  /** Number of graphics upgrades (tiers + enabled effects) needed to complete. */
  goal: number;
  /** Optional time limit in seconds. */
  timeLimit?: number;
  reward: string;
}

/** Challenges restart the generation under a handicap; finishing gives a permanent reward. */
export const CHALLENGES: Challenge[] = [
  { id: 'noclick', name: 'Walking Simulator', rule: 'Clicking the scene earns nothing.', goal: 22, reward: 'Clicks are worth 5× forever.' },
  { id: 'solo', name: 'Solo Dev', rule: 'You may only hire Unpaid Interns.', goal: 16, reward: 'Interns produce 25× forever.' },
  { id: 'indie', name: 'Indie Budget', rule: 'Staff cost 10× as much.', goal: 24, reward: 'Staff are 15% cheaper forever.' },
  { id: 'patch', name: 'Day-One Patch', rule: 'All production is divided by 20.', goal: 24, reward: '+50% pixels forever.' },
  { id: 'console', name: 'Console Port', rule: 'Resolution is locked at 320 × 180 and the GPU cannot be upgraded.', goal: 20, reward: 'GPU power is doubled forever.' },
  { id: 'speedrun', name: 'Any% Fidelity', rule: 'Reach the goal within 8 minutes.', goal: 22, timeLimit: 480, reward: 'Teraflop gains +25% forever.' },
];

export const RANKS: { at: number; name: string }[] = [
  { at: 0, name: 'Potato' },
  { at: 0.06, name: 'Tech Demo (1994)' },
  { at: 0.14, name: 'Launch Title' },
  { at: 0.24, name: 'Looks Fine, Honestly' },
  { at: 0.36, name: 'AA Production' },
  { at: 0.5, name: 'AAA Vertical Slice' },
  { at: 0.64, name: 'E3 Trailer (Pre-Downgrade)' },
  { at: 0.78, name: 'Photorealistic*' },
  { at: 0.9, name: 'Uncanny Valley' },
  { at: 1, name: 'Indistinguishable From A Screenshot' },
];

export const TOTAL_GRAPHICS_UPGRADES =
  TRACKS.reduce((n, tr) => n + tr.tiers.length - 1, 0) + FX.length;

export const trackById = (id: TrackId): Track => TRACKS.find((x) => x.id === id)!;
