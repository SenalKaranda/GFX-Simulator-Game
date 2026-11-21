import './style.css';
import { ACHIEVEMENTS, achievementById } from './game/achievements';
import { FX, TRACKS, generationName, trackById } from './game/data';
import type { FxId } from './game/data';
import { idlePost, postFor } from './game/feed';
import { Game, HYPE_DURATION, OFFLINE_CAP_SECONDS, hypeCooldown, simulatedFps } from './game/logic';
import type { GameEvent } from './game/logic';
import { SAVE_KEY, exportSave, hydrate, importSave, newState, serialize } from './game/state';
import type { GameState } from './game/state';
import { Sound } from './audio';
import { GfxRenderer } from './render/renderer';
import type { GfxConfig } from './render/world';
import { fmt, fmtFps, fmtTime } from './ui/format';
import { canvasToBlob, composePhoto } from './ui/photo';
import { UI } from './ui/ui';

function load(): GameState {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? hydrate(JSON.parse(raw)) : newState();
  } catch {
    return newState();
  }
}

const game = new Game(load());
const sound = new Sound();
const viewport = document.getElementById('viewport')!;
let resetting = false;

function save(): void {
  if (resetting) return;
  game.state.lastSaved = Date.now();
  try {
    localStorage.setItem(SAVE_KEY, serialize(game.state));
  } catch {
    // Storage may be full or blocked (private mode); the game still runs.
  }
}

// ------------------------------------------------------------------ renderer

let renderer: GfxRenderer | null = null;
try {
  if (GfxRenderer.isSupported()) renderer = new GfxRenderer(viewport);
} catch (err) {
  console.error('WebGL initialisation failed', err);
  renderer = null;
}
if (!renderer) {
  const msg = document.createElement('div');
  msg.className = 'no-webgl';
  msg.textContent = 'Your browser could not start WebGL, so the graphics are being rendered by your imagination. The rest of the game still works.';
  viewport.prepend(msg);
}

function configFrom(s: GameState): GfxConfig {
  const fx = Object.fromEntries(FX.map((f) => [f.id, s.fxOwned[f.id] && s.fxOn[f.id]])) as Record<FxId, boolean>;
  return { ...s.tracks, fx };
}

// Before/after comparison wipe, in the style of a graphics analysis video.
const wipe = document.getElementById('wipe')!;
const wipeLine = document.getElementById('wipe-line')!;
const wipeCanvas = document.getElementById('wipe-canvas') as HTMLCanvasElement;
let wipeTimer = 0;

function startWipe(before: HTMLCanvasElement): void {
  const ctx = wipeCanvas.getContext('2d');
  if (!ctx || before.width < 2) return;
  wipeCanvas.width = before.width;
  wipeCanvas.height = before.height;
  ctx.drawImage(before, 0, 0);
  wipeCanvas.classList.toggle('pixelated', before.classList.contains('pixelated'));
  for (const el of [wipe, wipeLine]) {
    el.hidden = false;
    el.classList.remove('run');
    void el.offsetWidth;
    el.classList.add('run');
  }
  window.clearTimeout(wipeTimer);
  wipeTimer = window.setTimeout(() => {
    wipe.hidden = true;
    wipeLine.hidden = true;
  }, 1500);
}

let appliedKey = '';
function syncRenderer(): void {
  if (!renderer) return;
  const cfg = configFrom(game.state);
  const key = JSON.stringify(cfg);
  if (key === appliedKey) return;
  try {
    // Grab the old look first; the canvas is only readable straight after a render.
    if (appliedKey && game.state.settings.wipe && !document.hidden) startWipe(renderer.capture());
    appliedKey = key;
    renderer.apply(cfg);
  } catch (err) {
    appliedKey = key;
    console.error('Failed to apply graphics settings', err);
  }
}

function resolutionLabel(): string {
  const s = game.state;
  const tier = trackById('resolution').tiers[s.tracks.resolution].name;
  if (!renderer) return tier;
  const actual = `${renderer.renderWidth} × ${renderer.renderHeight}`;
  // Past what the display can show, be honest about it.
  return s.tracks.resolution >= 4 ? `${tier} (shown at ${actual})` : actual;
}

// ------------------------------------------------------------------------ ui

function applySettings(): void {
  const st = game.state.settings;
  sound.configure({ sfx: st.sfx, music: st.music, fan: st.fan, volume: st.volume });
  renderer?.setAutoRotate(st.autoRotate);
  renderer?.setPerfSaver(st.perfSaver);
}

function doJump(): void {
  if (!game.jump()) return;
  renderer?.jump();
  sound.jump();
}

const ui = new UI(
  game,
  {
    photo: takePhoto,
    settingsChanged: () => {
      applySettings();
      save();
    },
    exportSave: () => {
      save();
      return exportSave(game.state);
    },
    importSave: (text) => {
      const imported = importSave(text);
      if (!imported) return false;
      game.state = imported;
      afterStateReplaced();
      ui.toast('Save imported', 'Welcome back to your pixels.');
      return true;
    },
    hardReset: () => {
      resetting = true;
      localStorage.removeItem(SAVE_KEY);
      location.reload();
    },
    resolutionLabel,
    perfLevel: () => renderer?.perfLevel ?? 0,
    jump: doJump,
  },
  sound,
);

if (renderer) {
  renderer.onPerfChange = (level) => {
    ui.toast(
      'Performance saver',
      level >= 2
        ? 'Still struggling, so more real detail has been turned down. Your fidelity score is unaffected.'
        : 'Your actual GPU was struggling, so some real detail has been quietly turned down. Your fidelity score is unaffected: appearances are what matter.',
    );
    ui.invalidate();
  };
}

function afterStateReplaced(): void {
  applySettings();
  syncRenderer();
  save();
  ui.invalidate();
}

game.on((e: GameEvent) => {
  const s = game.state;
  const post = postFor(e, s);
  if (post) ui.post(post);
  switch (e.type) {
    case 'achievement': {
      const a = achievementById(e.id);
      if (a) ui.toast(a.name, a.desc, 'trophy');
      sound.achievement();
      break;
    }
    case 'prestige':
      sound.prestige();
      ui.toast(`Generation ${e.generation}: ${generationName(e.generation)}`, `+${fmt(e.gained)} Teraflops. Everything you built is now retro.`);
      break;
    case 'challengeComplete':
      sound.achievement();
      ui.toast('Challenge complete', 'Permanent reward unlocked.');
      break;
    case 'challengeFailed':
      sound.deny();
      ui.toast('Challenge failed', 'Out of time. The generation continues without the handicap.');
      break;
    case 'hype':
      sound.achievement();
      break;
    case 'ending':
      showEnding();
      break;
    case 'jump':
      return;
    case 'click':
      sound.click();
      return;
  }
  syncRenderer();
  ui.invalidate();
  if (e.type !== 'deadPixel' && e.type !== 'gameplay') save();
});

function checkAchievements(): void {
  const s = game.state;
  for (const a of ACHIEVEMENTS) {
    if (!s.achievements[a.id] && a.check(s)) game.unlockAchievement(a.id);
  }
}

// --------------------------------------------------------------------- input

viewport.addEventListener('click', (e) => {
  sound.unlock();
  const target = e.target as HTMLElement;
  if (target.closest('.dead-pixel, .jump-btn')) return;
  if (renderer?.dragged) return;
  const value = game.click();
  const rect = viewport.getBoundingClientRect();
  ui.floater(e.clientX - rect.left, e.clientY - rect.top, value > 0 ? `+${fmt(value)}` : 'no clicking!');
});
window.addEventListener('pointerdown', () => sound.unlock(), { once: true });
window.addEventListener('keydown', (e) => {
  sound.unlock();
  const tag = (e.target as HTMLElement).tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || e.ctrlKey || e.metaKey || e.altKey) return;
  if (!document.getElementById('modal-root')!.hidden) return;
  const key = e.key.toLowerCase();
  if (key === 'p') takePhoto();
  else if (key === 'm') toggleMute();
  else if (key === 'b') ui.buyGoal();
  else if (key >= '1' && key <= '5') ui.selectTab(Number(key) - 1);
  else if (key === ' ' && game.state.gameplayUnlocked && tag !== 'BUTTON') {
    e.preventDefault();
    doJump();
  }
});
document.getElementById('btn-jump')!.addEventListener('click', (e) => {
  e.stopPropagation();
  sound.unlock();
  doJump();
});

function toggleMute(): void {
  const st = game.state.settings;
  const anyOn = st.sfx || st.music || st.fan;
  st.sfx = st.music = st.fan = !anyOn;
  applySettings();
  ui.invalidate();
  save();
}
document.getElementById('btn-mute')!.addEventListener('click', toggleMute);
document.getElementById('btn-photo')!.addEventListener('click', takePhoto);

// ---------------------------------------------------------------- photo mode

function takePhoto(): void {
  if (!renderer) {
    ui.toast('Photo mode unavailable', 'There is nothing to photograph without WebGL.');
    return;
  }
  const s = game.state;
  const tierName = trackById('resolution').tiers[s.tracks.resolution].name;
  const photo = composePhoto(renderer.capture(), s, tierName);
  const viral = game.takePhoto();
  sound.shutter();
  viewport.classList.remove('flash');
  void viewport.offsetWidth;
  viewport.classList.add('flash');
  const filename = `gfx-simulator-gen${s.generation}-${Date.now()}.png`;
  const caption = viral
    ? `<b>It went viral.</b> Hype: 2× pixels for ${HYPE_DURATION} seconds. Nobody needs to know about the frame rate.`
    : `Proof that it looked this good. The internet has seen one of these recently; the next one goes viral in ${fmtTime(hypeCooldown(s))}.`;
  const box = ui.modal('Photo mode', `<div class="photo-wrap"></div><p class="note">${caption}</p>`, [
    {
      label: 'Download',
      primary: true,
      keepOpen: true,
      onClick: () => {
        void canvasToBlob(photo).then((blob) => {
          if (!blob) return;
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = filename;
          a.click();
          window.setTimeout(() => URL.revokeObjectURL(url), 2000);
        });
      },
    },
    {
      label: 'Share',
      keepOpen: true,
      onClick: () => {
        void canvasToBlob(photo).then(async (blob) => {
          if (!blob) return;
          const file = new File([blob], filename, { type: 'image/png' });
          try {
            if (navigator.canShare?.({ files: [file] })) {
              await navigator.share({ files: [file], title: 'GFX Simulator', text: 'Look at these graphics. Do not ask about the gameplay.' });
            } else if (navigator.clipboard && 'ClipboardItem' in window) {
              await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
              ui.toast('Copied', 'Screenshot copied to the clipboard.');
            } else {
              ui.toast('Sharing unavailable', 'Use Download instead.');
            }
          } catch {
            // The user cancelled the share sheet, or the browser refused; nothing to do.
          }
        });
      },
    },
    { label: 'Close' },
  ]);
  photo.className = 'photo';
  box.querySelector('.photo-wrap')!.appendChild(photo);
  checkAchievements();
}

// -------------------------------------------------------------------- ending

function showEnding(): void {
  const s = game.state;
  sound.prestige();
  ui.modal(
    'The graphics are finished.',
    `<p>60 of 60. Every setting maxed, every effect on. There is nothing left to improve${simulatedFps(s) < 30 ? ` and, at ${fmtFps(simulatedFps(s))}, barely anything left to see` : `. It even runs at ${fmtFps(simulatedFps(s))}, which nobody can explain`}.</p>
     <dl class="stats">
       <dt>Time played</dt><dd>${fmtTime(s.stats.playTime)}</dd>
       <dt>Console generations</dt><dd>${s.generation}</dd>
       <dt>Pixels rendered</dt><dd>${fmt(s.totalEarned)}</dd>
       <dt>Scene clicks</dt><dd>${fmt(s.stats.clicks)}</dd>
       <dt>Gameplay requests denied</dt><dd>${s.stats.gameplayRequests}</dd>
     </dl>
     <p class="credits-roll">Directed by <b>the settings menu</b> · Written by <b>nobody</b> · Level design: <b>one (1) field</b> · Gameplay programmer: <b>position unfilled</b></p>
     <p>As promised on the roadmap (it was never on the roadmap), <b>gameplay has been unlocked</b>. Reviewers are standing by.</p>`,
    [{ label: 'Play the game', primary: true }],
    true,
  );
}

function showIntro(): void {
  ui.modal(
    'Welcome to GFX Simulator',
    `<p>The only game honest enough to admit what you came for.</p>
     <ul class="intro-list">
       <li><b>Click the scene</b> to render pixels.</li>
       <li><b>Spend pixels on graphics.</b> Every upgrade really changes the picture, and really costs frame rate.</li>
       <li><b>Hire staff</b> so the pixels keep coming while you admire the puddles.</li>
     </ul>
     <p class="note">There is no gameplay. Please do not ask.</p>`,
    [
      {
        label: 'Start rendering',
        primary: true,
        onClick: () => {
          game.state.introSeen = true;
          sound.unlock();
          save();
        },
      },
    ],
    true,
  );
}

// ---------------------------------------------------------------- dead pixel

const deadPixel = document.getElementById('dead-pixel') as HTMLButtonElement;
let deadPixelAt = performance.now() + 40000 + Math.random() * 30000;
let deadPixelUntil = 0;

function updateDeadPixel(now: number): void {
  if (deadPixel.hidden && now >= deadPixelAt) {
    deadPixel.style.left = `${8 + Math.random() * 84}%`;
    deadPixel.style.top = `${14 + Math.random() * 62}%`;
    deadPixel.hidden = false;
    deadPixelUntil = now + 14000;
  } else if (!deadPixel.hidden && now >= deadPixelUntil) {
    deadPixel.hidden = true;
    deadPixelAt = now + 60000 + Math.random() * 70000;
  }
}

deadPixel.addEventListener('click', (e) => {
  e.stopPropagation();
  sound.unlock();
  const rect = viewport.getBoundingClientRect();
  const value = game.catchDeadPixel();
  ui.floater(e.clientX - rect.left, e.clientY - rect.top, `DEAD PIXEL +${fmt(value)}`, true);
  sound.upgrade();
  deadPixel.hidden = true;
  deadPixelAt = performance.now() + 60000 + Math.random() * 70000;
});

// ---------------------------------------------------------------- main loops

let lastTick = Date.now();
function advance(): void {
  const now = Date.now();
  const dt = Math.min(OFFLINE_CAP_SECONDS, Math.max(0, (now - lastTick) / 1000));
  lastTick = now;
  if (dt > 0) game.tick(dt);
}

function frame(now: number): void {
  advance();
  if (renderer) {
    const st = game.state.settings;
    const target = st.authenticFps ? Math.max(2, simulatedFps(game.state)) : 60;
    try {
      renderer.frame(now, target);
    } catch (err) {
      console.error('Render failed', err);
    }
  }
  requestAnimationFrame(frame);
}

// Timers keep the economy moving while the tab is in the background.
window.setInterval(() => {
  advance();
  checkAchievements();
  updateDeadPixel(performance.now());
  sound.setFanLoad(1 - simulatedFps(game.state) / 60);
}, 1000);
window.setInterval(() => ui.tick(), 200);
window.setInterval(save, 15000);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) save();
});
window.addEventListener('pagehide', save);

function scheduleIdlePost(): void {
  window.setTimeout(() => {
    if (!document.hidden) ui.post(idlePost(game.state));
    scheduleIdlePost();
  }, 9000 + Math.random() * 9000);
}

// ---------------------------------------------------------------------- boot

applySettings();
syncRenderer();
const away = game.applyOffline(Date.now());
ui.post({ user: 'PATCH NOTES', kind: 'news', text: 'Welcome to GFX Simulator. Version 1.0 contains graphics. Gameplay is on the roadmap (it is not).' });
ui.tick();
if (away) {
  ui.modal(
    'While you were away',
    `<p>Your staff kept rendering for <b>${fmtTime(away.seconds)}</b> and produced <b>${fmt(away.earned)} px</b>${game.state.perks.crunch ? ', at full crunch.' : ' (25% efficiency without supervision).'}</p>`,
    [{ label: 'Excellent', primary: true }],
  );
}
else if (!game.state.introSeen && game.state.totalEarned === 0) showIntro();
checkAchievements();
scheduleIdlePost();
requestAnimationFrame(frame);
save();

if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__gfx = { game, ui, renderer, TRACKS, sync: syncRenderer };
}
