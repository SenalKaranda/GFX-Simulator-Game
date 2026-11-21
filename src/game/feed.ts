// The satirical layer: forum posts, patch notes and review scores.
import { CHALLENGES, FX, GENERATORS, HARDWARE, generationName, trackById } from './data';
import type { GameEvent } from './logic';
import { completion, hypeRemaining, simulatedFps } from './logic';
import type { GameState } from './state';

export interface Post {
  user: string;
  text: string;
  kind: 'forum' | 'news' | 'system';
}

const USERS = [
  'xX_RayTr4cer_Xx', 'FrameTimeFrank', 'ultrawide_ulf', 'PixelPeeper9000', 'ModsAreAsleep', 'i_count_polygons',
  'DigitalFoundling', '4090_owner_btw', 'cinematic_24fps', 'BenchmarkBarry', 'gameplay_is_optional', 'TextureTed',
  'NativeResOrBust', 'ShaderCompilingAt3am', 'uncapped_ulrika', 'HDRisALifestyle', 'DownvotedForTruth', 'zoom_400_percent',
];

const IDLE: string[] = [
  'Is there a story? Asking so I know what to skip.',
  'I zoomed in 400% on a rock and I have some concerns.',
  'Gameplay footage looks great. When does the gameplay start?',
  'Refunded. The puddles in the trailer were shinier.',
  'My friend says it is fun. I asked what resolution his fun was running at. No answer.',
  'Day 412 of asking for an FOV slider.',
  'I do not play games. I benchmark them.',
  'The grass does not react to my footsteps. Literally unplayable.',
  'Has anyone tried actually playing it? Not me, just curious.',
  '10/10 graphics, 0/10 everything else, 10/10 overall.',
  'I upgraded my monitor to see the difference. I cannot see the difference. Worth it.',
  'Unpopular opinion: a game should be judged by its water.',
  'Counting the frames by eye. Definitely dropped one.',
  'The lighting made me cry. So did my electricity bill.',
  'Screenshot comparison thread: page 847.',
  'They downgraded the clouds since the reveal trailer. I have proof.',
  'I bought it twice so I could compare versions.',
  'Does this have ultrawide support? I need to see more of the nothing.',
  'Please stop asking about gameplay, some of us are trying to look at shadows.',
  'Turned every setting to Ultra. Game is now a slideshow. Best slideshow I have ever seen.',
  'My rig runs this at 14 FPS and I have never been happier.',
  'Is the grass tessellated? I will not buy a game with untessellated grass.',
  'Paid extra for early access to the graphics settings menu.',
  'I only buy games I can use to justify my GPU.',
  'They should remove the character so we can see more of the lighting.',
  'Waiting for the analysis video before I decide what I think.',
  'There is a 40 GB day-one patch that makes the shadows 3% softer. Downloading now.',
  'Returned my copy because the puddles do not have puddles in them.',
  'Do the rocks have subsurface scattering? Do not answer, I will zoom in.',
  'Reminder that the human eye can only see 16K.',
  'I have 900 hours in this. Mostly in the settings menu.',
  'Honestly the loading screen was the best level.',
];

const pick = <T>(list: T[]): T => list[Math.floor(Math.random() * list.length)];
const forum = (text: string): Post => ({ user: pick(USERS), text, kind: 'forum' });
const news = (text: string): Post => ({ user: 'PATCH NOTES', text, kind: 'news' });

export function idlePost(s: GameState): Post {
  const fps = simulatedFps(s);
  const c = completion(s);
  const contextual: string[] = [];
  if (fps < 5) contextual.push(`${fps.toFixed(1)} FPS. I can count the frames. Each one is beautiful.`, 'It is not lag, it is a deliberate pace.');
  else if (fps < 24) contextual.push('Sub-24 FPS is actually MORE cinematic than cinema.', 'The human eye cannot see above whatever this is running at.');
  else if (fps >= 60 && c > 0.3) contextual.push('Locked 60. Suspicious. What are they not rendering?');
  if (c < 0.1) contextual.push('Is this a phone game?', 'My calculator has better graphics.', 'I have seen sharper images on a potato. An actual potato.');
  if (c > 0.6) contextual.push('I showed my mum and she asked if it was a photo. She was looking at the loading screen.', 'This is it. This is what games are for.');
  if (s.tracks.hair >= 3) contextual.push('The hair alone has more engineering than my car.');
  if (s.tracks.resolution >= 6 && s.tracks.textures <= 1) contextual.push('Great, now I can see how bad the textures are in 4K.');
  if (s.fxOwned.brown && s.fxOn.brown) contextual.push('Finally, a realistic colour palette: brown, dark brown, and bloom.');
  if (s.fxOwned.motionBlur && s.fxOn.motionBlur) contextual.push('First thing I do in any game is turn off motion blur. Why is it still on?');
  if (s.generators.nested > 0) contextual.push('The people inside the Nested Simulation have started their own forum. They are complaining about OUR frame rate.');
  if (hypeRemaining(s) > 0) contextual.push('That screenshot is everywhere. Has anyone checked whether there is a game attached?');
  if (s.gameplayUnlocked) contextual.push('I heard they added gameplay. Uninstalling until it is patched out.', 'The jump is fine, but is it ray traced?');
  if (s.perks.framegen) contextual.push('Half of these frames are made up, and honestly they are the better half.');
  if (s.challenge) contextual.push('Playing with a handicap? In a game with no gameplay? Respect.');
  if (s.generation >= 3) contextual.push(`Generation ${s.generation} already? I only just finished the shader compilation on the last one.`);
  return forum(contextual.length && Math.random() < 0.55 ? pick(contextual) : pick(IDLE));
}

export function postFor(e: GameEvent, s: GameState): Post | null {
  switch (e.type) {
    case 'buyTrack': {
      const tr = trackById(e.track);
      const tier = tr.tiers[e.level];
      const lines: Record<string, string> = {
        resolution: `${tier.name}?! I can finally see what I am complaining about.`,
        colour: `${tier.name}. My eyes were not ready.`,
        polygons: `They upgraded to "${tier.name}". The rocks have never been rounder.`,
        textures: `${tier.name} textures. I pressed my face against the monitor. Recommended.`,
        lighting: `${tier.name}. Light now behaves better than I do.`,
        shadows: `${tier.name}. I spent an hour looking at the ground.`,
        antialiasing: `${tier.name} enabled. Not a jaggy in sight, and I looked.`,
        drawDistance: `Draw distance is now "${tier.name}". I can see places I will never be allowed to visit.`,
        foliage: `Foliage set to "${tier.name}". The grass has better production values than most films.`,
        water: `Water is now "${tier.name}". Pre-ordered the sequel.`,
        hair: `${tier.name}. Finally, a reason to own a GPU.`,
      };
      return Math.random() < 0.5 ? news(`${tr.name} upgraded to ${tier.name}. Gameplay unchanged (none).`) : forum(lines[e.track]);
    }
    case 'buyFx': {
      const fx = FX.find((f) => f.id === e.fx)!;
      return news(`Added ${fx.name}. It cannot be disabled. (It can. Please do not.)`);
    }
    case 'toggleFx':
      return e.on ? null : forum('Somebody turned an effect OFF? In MY graphics simulator?');
    case 'buyHardware':
      return forum(`Just got the ${HARDWARE[e.level].name}. Had to sell the car, but the car was only 30 FPS anyway.`);
    case 'buyGenerator': {
      const g = GENERATORS.find((x) => x.id === e.id)!;
      const owned = s.generators[e.id];
      if (owned === e.count) return news(`The studio has hired its first ${g.name}.`);
      if ([10, 25, 50, 100, 150, 200].some((m) => owned >= m && owned - e.count < m)) {
        return news(`${owned} × ${g.name}: output doubled through "synergy".`);
      }
      return null;
    }
    case 'prestige':
      return news(`Generation ${e.generation} ("${generationName(e.generation)}") launched! Last generation's graphics are now officially "dated". +${e.gained} Teraflops.`);
    case 'challengeStart':
      return news(`Challenge accepted: ${CHALLENGES.find((c) => c.id === e.id)!.name}.`);
    case 'challengeComplete':
      return news(`Challenge complete: ${CHALLENGES.find((c) => c.id === e.id)!.name}. Reward unlocked.`);
    case 'challengeFailed':
      return news(`Challenge failed: ${CHALLENGES.find((c) => c.id === e.id)!.name}. The speedrun community is disappointed.`);
    case 'deadPixel':
      return forum('Found a dead pixel. Filed a 14-page warranty claim.');
    case 'hype':
      return news('Your screenshot went viral. Hype: 2× pixels for 60 seconds. Nobody asked what the game is about.');
    case 'ending':
      return news('GFX Simulator has gone gold. The graphics are finished. As a reward, gameplay has been unlocked.');
    case 'jump': {
      const lines = [
        'Wait. Was that... a mechanic?',
        'The jump animation has 400 bones. I felt every one.',
        'Jumping does nothing. Bold narrative choice.',
        '0.7 seconds of gameplay. Bloated. Trim it.',
        'Please patch out the gameplay, it is distracting from the hair.',
        'Does the jump scale with resolution? Asking for a benchmark.',
        'I preferred it when it was a tech demo.',
      ];
      if (e.count === 1) return forum(lines[0]);
      return e.count % 8 === 0 ? forum(lines[1 + ((e.count / 8) % (lines.length - 1))]) : null;
    }
    case 'gameplay':
      return { user: 'PRODUCER', text: gameplayResponse(e.count), kind: 'system' };
    default:
      return null;
  }
}

const GAMEPLAY_RESPONSES = [
  'Gameplay has been added to the backlog. The backlog is not a real place.',
  'Focus groups found gameplay "distracting from the puddles".',
  'Gameplay would cost 3 FPS. Request denied.',
  'We looked into it. Gameplay does not show up in screenshots.',
  'Gameplay is planned for the sequel. (It is not.)',
  'Marketing asks: can the gameplay be ray traced? No? Then no.',
  'A junior designer suggested a jump button and has been reassigned to grass.',
  'Have you considered looking at the water instead?',
  'Gameplay is a legacy feature from the low-resolution era.',
  'The gameplay budget was spent on hair.',
];

export function gameplayResponse(count: number): string {
  if (count === 25) return 'You have asked 25 times. The answer is rendered in 16K: no.';
  if (count === 100) return 'Fine. Here is your gameplay: you clicked a button 100 times. That was it. That was the gameplay.';
  return GAMEPLAY_RESPONSES[(count - 1) % GAMEPLAY_RESPONSES.length];
}

export interface Review {
  graphics: string;
  gameplay: string;
  story: string;
  performance: string;
  overall: string;
  quote: string;
}

/** The only review that matters. Note which categories affect the overall score. */
export function review(s: GameState): Review {
  const c = completion(s);
  const fps = simulatedFps(s);
  const graphics = (1 + 9 * c).toFixed(1);
  const quotes = [
    'It certainly is a video game, visually.',
    'A promising tech demo for a console two generations old.',
    'Screenshots well. Has been compared favourably to other screenshots.',
    'We forgot to play it. Stunning.',
    'A new benchmark for benchmarks.',
    'Reality should be embarrassed.',
  ];
  const jumps = s.stats.jumps;
  return {
    graphics,
    gameplay: !s.gameplayUnlocked ? 'N/A' : jumps === 0 ? 'Unplayed' : jumps < 100 ? '1.0' : '1.1',
    story: s.gameplayUnlocked ? 'Still skipped' : 'Skipped',
    performance: fps >= 55 ? 'Suspiciously smooth' : fps >= 24 ? 'Cinematic' : fps >= 5 ? 'Very cinematic' : 'Art-house',
    overall: graphics,
    quote: jumps > 0 ? 'There is a jump button now. It adds nothing. Graphics remain flawless.' : quotes[Math.min(quotes.length - 1, Math.floor(c * quotes.length))],
  };
}
