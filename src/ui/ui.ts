// DOM user interface. Tabs are rendered as HTML strings on state changes and
// kept fresh between changes by a light-weight tick that only touches text/classes.
import { ACHIEVEMENTS } from '../game/achievements';
import {
  CHALLENGES, FIDELITY_INCOME_MULT, FIDELITY_LOAD_MULT, FX, GENERATORS, GENERATOR_MILESTONES, HARDWARE, PERKS,
  TOTAL_GRAPHICS_UPGRADES, TRACKS,
} from '../game/data';
import type { ChallengeId, FxId, PerkId, TrackId } from '../game/data';
import { review } from '../game/feed';
import type { Post } from '../game/feed';
import {
  TERAFLOP_BONUS, achievementCount, clickValue, completion, fidelityScore, fxCost, generatorCost, generatorLocked,
  generatorRate, maxAffordable, nextTrackCost, pixelsPerSecond, rankName, simulatedFps, teraflopGain, trackLocked,
  upgradeCount,
} from '../game/logic';
import type { Game } from '../game/logic';
import { fmt, fmtFps, fmtTime } from './format';

type TabId = 'graphics' | 'studio' | 'nextgen' | 'trophies' | 'options';

const TABS: { id: TabId; label: string }[] = [
  { id: 'graphics', label: 'Graphics' },
  { id: 'studio', label: 'Studio' },
  { id: 'nextgen', label: 'Next-Gen' },
  { id: 'trophies', label: 'Trophies' },
  { id: 'options', label: 'Options' },
];

export interface UIHooks {
  photo(): void;
  settingsChanged(): void;
  exportSave(): string;
  importSave(text: string): boolean;
  hardReset(): void;
  resolutionLabel(): string;
}

interface ModalAction {
  label: string;
  primary?: boolean;
  danger?: boolean;
  keepOpen?: boolean;
  onClick?: (root: HTMLElement) => void;
}

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

export class UI {
  private tab: TabId = 'graphics';
  private readonly body = $('tab-body');
  private readonly tabs = $('tabs');
  private readonly feed = $('feed');
  private dirty = true;
  private lastReview = '';

  constructor(
    private readonly game: Game,
    private readonly hooks: UIHooks,
    private readonly sounds: { buy(): void; upgrade(): void; deny(): void },
  ) {
    this.tabs.innerHTML = TABS.map(
      (t) => `<button class="tab" role="tab" data-tab="${t.id}">${t.label}<i class="dot"></i></button>`,
    ).join('');
    this.tabs.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-tab]');
      if (!btn) return;
      this.tab = btn.dataset.tab as TabId;
      this.body.scrollTop = 0;
      this.invalidate();
      this.tick();
    });
    this.body.addEventListener('click', (e) => this.onAction(e));
    this.body.addEventListener('input', (e) => this.onInput(e));
    $('review').addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('[data-action="gameplay"]')) this.game.requestGameplay();
    });
    $('modal-root').addEventListener('click', (e) => {
      if (e.target === e.currentTarget && !(e.currentTarget as HTMLElement).dataset.sticky) this.closeModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !$('modal-root').dataset.sticky) this.closeModal();
    });
  }

  /** Mark the active tab for a full re-render on the next tick. */
  invalidate(): void {
    this.dirty = true;
  }

  // ------------------------------------------------------------------ actions

  private onAction(e: Event): void {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!el) return;
    const g = this.game;
    const s = g.state;
    const id = el.dataset.id ?? '';
    let ok: boolean | null = null;
    switch (el.dataset.action) {
      case 'track':
        ok = g.buyTrack(id as TrackId);
        if (ok) this.sounds.upgrade();
        break;
      case 'fx':
        ok = g.buyFx(id as FxId);
        if (ok) this.sounds.upgrade();
        break;
      case 'fxToggle':
        g.toggleFx(id as FxId);
        break;
      case 'hardware':
        ok = g.buyHardware();
        if (ok) this.sounds.upgrade();
        break;
      case 'generator':
        ok = g.buyGenerator(id, s.settings.buyAmount) > 0;
        if (ok) this.sounds.buy();
        break;
      case 'amount':
        s.settings.buyAmount = Number(id) as 1 | 10 | -1;
        break;
      case 'perk':
        ok = g.buyPerk(id as PerkId);
        if (ok) this.sounds.upgrade();
        break;
      case 'prestige':
        this.confirmPrestige();
        break;
      case 'challenge':
        this.confirmChallenge(id as ChallengeId);
        break;
      case 'abandon':
        g.abandonChallenge();
        break;
      case 'toggle': {
        const key = id as 'sfx' | 'music' | 'fan' | 'authenticFps' | 'autoRotate';
        s.settings[key] = !s.settings[key];
        this.hooks.settingsChanged();
        break;
      }
      case 'export':
        this.showExport();
        break;
      case 'import':
        this.showImport();
        break;
      case 'reset':
        this.modal('Delete everything?', '<p>This wipes your save, including Teraflops, trophies and challenge rewards. There is no undo, and no achievement for it.</p>', [
          { label: 'Keep my pixels', primary: true },
          { label: 'Delete save', danger: true, onClick: () => this.hooks.hardReset() },
        ]);
        break;
      case 'gameplay':
        g.requestGameplay();
        break;
      case 'photo':
        this.hooks.photo();
        break;
    }
    if (ok === false) {
      this.sounds.deny();
      el.classList.remove('shake');
      void el.offsetWidth;
      el.classList.add('shake');
    }
    this.invalidate();
    this.tick();
  }

  private onInput(e: Event): void {
    const el = e.target as HTMLInputElement;
    if (el.dataset.input === 'volume') {
      this.game.state.settings.volume = Number(el.value) / 100;
      this.hooks.settingsChanged();
    }
  }

  private confirmPrestige(): void {
    const s = this.game.state;
    const gain = teraflopGain(s);
    if (gain < 1) {
      this.sounds.deny();
      return;
    }
    this.modal(
      `Launch Generation ${s.generation + 1}?`,
      `<p>Last generation's graphics become embarrassing overnight. You lose <b>all pixels, graphics settings, effects, staff and your GPU</b>.</p>
       <p>You keep trophies, perks and challenge rewards, and gain <b class="tf-text">+${fmt(gain)} Teraflops</b> (each one is +${Math.round(TERAFLOP_BONUS * 100)}% pixels, forever).</p>
       ${s.challenge ? '<p class="warn">Your active challenge will be abandoned.</p>' : ''}`,
      [{ label: 'Not yet' }, { label: 'Launch it', primary: true, onClick: () => this.game.prestige() }],
    );
  }

  private confirmChallenge(id: ChallengeId): void {
    const ch = CHALLENGES.find((c) => c.id === id)!;
    this.modal(
      `Start "${ch.name}"?`,
      `<p>This restarts the current generation from nothing, <b>without</b> awarding Teraflops.</p>
       <p><b>Rule:</b> ${ch.rule}<br><b>Goal:</b> own ${ch.goal} graphics upgrades.<br><b>Reward:</b> ${ch.reward}</p>`,
      [{ label: 'Cancel' }, { label: 'Start challenge', primary: true, onClick: () => this.game.startChallenge(id) }],
    );
  }

  private showExport(): void {
    this.modal('Export save', `<p>Copy this text somewhere safe.</p><textarea class="save-text" readonly>${this.hooks.exportSave()}</textarea>`, [
      {
        label: 'Copy',
        primary: true,
        keepOpen: true,
        onClick: (root) => {
          const ta = root.querySelector('textarea')!;
          ta.select();
          void navigator.clipboard?.writeText(ta.value).catch(() => document.execCommand('copy'));
        },
      },
      { label: 'Close' },
    ]);
  }

  private showImport(): void {
    this.modal('Import save', '<p>Paste an exported save. This replaces your current progress.</p><textarea class="save-text" placeholder="Paste save text here"></textarea><p class="warn" data-error hidden>That does not look like a GFX Simulator save.</p>', [
      { label: 'Cancel' },
      {
        label: 'Import',
        primary: true,
        keepOpen: true,
        onClick: (root) => {
          if (this.hooks.importSave(root.querySelector('textarea')!.value)) this.closeModal();
          else root.querySelector<HTMLElement>('[data-error]')!.hidden = false;
        },
      },
    ]);
  }

  // ------------------------------------------------------------------- modals

  modal(title: string, bodyHtml: string, actions: ModalAction[], sticky = false): HTMLElement {
    const root = $('modal-root');
    root.hidden = false;
    if (sticky) root.dataset.sticky = '1';
    else delete root.dataset.sticky;
    root.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="${title}">
      <h2>${title}</h2><div class="modal-body">${bodyHtml}</div>
      <div class="modal-actions">${actions
        .map((a, i) => `<button class="btn ${a.primary ? 'btn-primary' : ''} ${a.danger ? 'btn-danger' : ''}" data-i="${i}">${a.label}</button>`)
        .join('')}</div></div>`;
    const box = root.firstElementChild as HTMLElement;
    box.querySelectorAll<HTMLElement>('.modal-actions [data-i]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = actions[Number(btn.dataset.i)];
        if (!action.keepOpen) this.closeModal();
        action.onClick?.(box);
        this.invalidate();
      });
    });
    box.querySelector<HTMLElement>('.btn-primary')?.focus();
    return box;
  }

  closeModal(): void {
    const root = $('modal-root');
    root.hidden = true;
    root.innerHTML = '';
    delete root.dataset.sticky;
  }

  // ----------------------------------------------------------- toasts & feed

  toast(title: string, text: string, kind: 'trophy' | 'info' = 'info'): void {
    const el = document.createElement('div');
    el.className = `toast toast-${kind}`;
    el.innerHTML = `<b>${kind === 'trophy' ? '🏆 ' : ''}${title}</b><span>${text}</span>`;
    const host = $('toasts');
    // Keep the stack short so a burst of trophies never buries the scene.
    while (host.children.length >= 3) host.firstElementChild!.remove();
    host.appendChild(el);
    window.setTimeout(() => el.classList.add('out'), 4600);
    window.setTimeout(() => el.remove(), 5200);
  }

  post(p: Post): void {
    const el = document.createElement('div');
    el.className = `post post-${p.kind}`;
    const user = document.createElement('b');
    user.textContent = p.user;
    const text = document.createElement('span');
    text.textContent = p.text;
    el.append(user, text);
    this.feed.prepend(el);
    while (this.feed.children.length > 40) this.feed.lastElementChild!.remove();
  }

  floater(x: number, y: number, text: string, big = false): void {
    const host = $('floaters');
    if (host.children.length > 40) host.firstElementChild!.remove();
    const el = document.createElement('span');
    el.className = `floater${big ? ' floater-big' : ''}`;
    el.textContent = text;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    host.appendChild(el);
    window.setTimeout(() => el.remove(), 900);
  }

  // -------------------------------------------------------------------- tick

  /** Refresh everything that changes continuously. Called a few times a second. */
  tick(): void {
    const s = this.game.state;
    const pps = pixelsPerSecond(s);
    const fps = simulatedFps(s);
    $('pixels').textContent = fmt(s.pixels);
    $('pps').textContent = fmt(pps);
    $('click-value').textContent = fmt(clickValue(s));
    $('tf-chip').hidden = s.teraflopsTotal === 0;
    $('tf').textContent = fmt(s.teraflops);

    const fpsEl = $('fps');
    fpsEl.textContent = fmtFps(fps);
    fpsEl.className = `fps ${fps >= 50 ? 'fps-good' : fps >= 20 ? 'fps-ok' : 'fps-bad'}`;
    $('res').textContent = this.hooks.resolutionLabel();
    $('rank').textContent = rankName(s);
    $('fidelity').textContent = `Fidelity ${fmt(fidelityScore(s))} · ${upgradeCount(s)}/${TOTAL_GRAPHICS_UPGRADES}`;
    $('fidelity-bar').style.width = `${(completion(s) * 100).toFixed(1)}%`;
    $('rt-badge').hidden = s.tracks.lighting < 5;
    $('hint').hidden = s.stats.clicks >= 3;
    const badge = $('challenge-badge');
    badge.hidden = !s.challenge;
    if (s.challenge) {
      const ch = CHALLENGES.find((c) => c.id === s.challenge)!;
      const left = ch.timeLimit ? ` · ${fmtTime(ch.timeLimit - s.challengeTime)} left` : '';
      badge.textContent = `${ch.name}: ${upgradeCount(s)}/${ch.goal}${left}`;
    }
    $('btn-mute').classList.toggle('off', !s.settings.sfx && !s.settings.music && !s.settings.fan);

    this.renderReview();
    if (this.dirty) {
      this.dirty = false;
      this.renderTab();
    }
    this.refreshAffordability();
    this.refreshTabDots();
  }

  private renderReview(): void {
    const r = review(this.game.state);
    const html = `
      <div class="score"><small>Graphics</small><b>${r.graphics}</b></div>
      <div class="score score-na"><small>Gameplay</small><b>${r.gameplay}</b><button class="link" data-action="gameplay">request</button></div>
      <div class="score score-na"><small>Story</small><b>${r.story}</b></div>
      <div class="score"><small>Performance</small><b class="small">${r.performance}</b></div>
      <div class="score score-total"><small>Overall</small><b>${r.overall}</b></div>
      <q>${r.quote}</q>`;
    if (html !== this.lastReview) {
      this.lastReview = html;
      $('review').innerHTML = html;
    }
  }

  private refreshAffordability(): void {
    const s = this.game.state;
    this.body.querySelectorAll<HTMLElement>('[data-cost]').forEach((el) => {
      el.classList.toggle('cant', s.pixels + 1e-9 < Number(el.dataset.cost));
    });
    this.body.querySelectorAll<HTMLElement>('[data-tf-cost]').forEach((el) => {
      el.classList.toggle('cant', s.teraflops < Number(el.dataset.tfCost));
    });
    if (this.tab === 'studio') {
      for (const g of GENERATORS) {
        const btn = this.body.querySelector<HTMLElement>(`[data-action="generator"][data-id="${g.id}"]`);
        if (!btn || generatorLocked(s, g.id)) continue;
        const amount = s.settings.buyAmount;
        const count = amount < 0 ? Math.max(1, maxAffordable(s, g)) : amount;
        const cost = generatorCost(s, g, count);
        btn.dataset.cost = String(cost);
        btn.innerHTML = `<small>Hire ×${count}</small>${fmt(cost)} px`;
        btn.classList.toggle('cant', s.pixels + 1e-9 < cost);
      }
    }
    if (this.tab === 'nextgen') {
      const gain = teraflopGain(s);
      const btn = this.body.querySelector<HTMLElement>('[data-action="prestige"]');
      if (btn) {
        btn.classList.toggle('cant', gain < 1);
        btn.innerHTML = gain >= 1
          ? `Launch Generation ${s.generation + 1}<small>+${fmt(gain)} Teraflops</small>`
          : `Launch Generation ${s.generation + 1}<small>needs ${fmt(1e8)} px earned this generation (${fmt(s.runEarned)})</small>`;
      }
    }
    if (this.tab === 'options') {
      const el = this.body.querySelector<HTMLElement>('[data-stat="time"]');
      if (el) el.textContent = fmtTime(s.stats.playTime);
    }
  }

  private refreshTabDots(): void {
    const s = this.game.state;
    const can = (cost: number | null): boolean => cost !== null && s.pixels >= cost;
    const hw = HARDWARE[s.hardware + 1];
    const dots: Record<TabId, boolean> = {
      graphics:
        TRACKS.some((tr) => !trackLocked(s, tr.id) && can(nextTrackCost(s, tr.id))) ||
        FX.some((fx) => !s.fxOwned[fx.id] && can(fxCost(s, fx.id))) ||
        (!!hw && s.challenge !== 'console' && can(hw.cost)),
      studio: false,
      nextgen: teraflopGain(s) >= Math.max(1, s.teraflopsTotal * 0.25) || PERKS.some((p) => !s.perks[p.id] && s.teraflops >= p.cost),
      trophies: false,
      options: false,
    };
    this.tabs.querySelectorAll<HTMLElement>('[data-tab]').forEach((el) => {
      const id = el.dataset.tab as TabId;
      el.classList.toggle('active', id === this.tab);
      el.setAttribute('aria-selected', String(id === this.tab));
      el.classList.toggle('has-dot', dots[id] && id !== this.tab);
    });
  }

  // --------------------------------------------------------------- rendering

  private renderTab(): void {
    const scroll = this.body.scrollTop;
    const html = {
      graphics: () => this.graphicsTab(),
      studio: () => this.studioTab(),
      nextgen: () => this.nextGenTab(),
      trophies: () => this.trophiesTab(),
      options: () => this.optionsTab(),
    }[this.tab]();
    this.body.innerHTML = html;
    this.body.scrollTop = scroll;
  }

  private graphicsTab(): string {
    const s = this.game.state;
    const hw = HARDWARE[s.hardware];
    const nextHw = HARDWARE[s.hardware + 1];
    const hwLocked = s.challenge === 'console';
    const hardware = `
      <div class="row row-hw">
        <div class="row-icon">▣</div>
        <div class="row-main">
          <div class="row-title">GPU: ${hw.name}</div>
          <div class="row-now">${hw.desc}</div>
          ${nextHw ? `<div class="row-next"><b>${nextHw.name}</b> — ${fmt(nextHw.power / hw.power)}× FPS, ${fmt(nextHw.click / hw.click)}× click power</div>` : '<div class="row-next">There is no faster GPU. The sun has been consumed.</div>'}
        </div>
        ${nextHw ? (hwLocked ? '<span class="tag">LOCKED</span>' : `<button class="buy" data-action="hardware" data-cost="${nextHw.cost}">${fmt(nextHw.cost)} px</button>`) : '<span class="tag tag-max">MAX</span>'}
      </div>`;

    const tracks = TRACKS.map((tr) => {
      const level = s.tracks[tr.id];
      const max = tr.tiers.length - 1;
      const next = tr.tiers[level + 1];
      const cost = nextTrackCost(s, tr.id);
      const pips = tr.tiers.slice(1).map((_, i) => `<i class="${i < level ? 'on' : ''}"></i>`).join('');
      const action = !next
        ? '<span class="tag tag-max">MAX</span>'
        : trackLocked(s, tr.id)
          ? '<span class="tag">LOCKED</span>'
          : `<button class="buy" data-action="track" data-id="${tr.id}" data-cost="${cost}">${fmt(cost!)} px</button>`;
      return `
        <div class="row ${level >= max ? 'row-max' : ''}">
          <div class="row-icon">${tr.icon}</div>
          <div class="row-main">
            <div class="row-title">${tr.name}<span class="pips">${pips}</span></div>
            <div class="row-now">${tr.tiers[level].name} — ${tr.tiers[level].desc}</div>
            ${next ? `<div class="row-next"><b>${next.name}</b> — ${next.desc}</div>` : ''}
          </div>
          ${action}
        </div>`;
    }).join('');

    const effects = FX.map((fx) => {
      const owned = s.fxOwned[fx.id];
      const cost = fxCost(s, fx.id);
      const action = owned
        ? `<button class="switch ${s.fxOn[fx.id] ? 'on' : ''}" data-action="fxToggle" data-id="${fx.id}" role="switch" aria-checked="${s.fxOn[fx.id]}" aria-label="${fx.name}"><i></i></button>`
        : `<button class="buy" data-action="fx" data-id="${fx.id}" data-cost="${cost}">${fmt(cost)} px</button>`;
      return `
        <div class="row ${owned && !s.fxOn[fx.id] ? 'row-off' : ''}">
          <div class="row-main">
            <div class="row-title">${fx.name}</div>
            <div class="row-now">${fx.desc}</div>
          </div>
          ${action}
        </div>`;
    }).join('');

    const pct = Math.round((FIDELITY_INCOME_MULT - 1) * 100);
    const drop = Math.round((1 - 1 / FIDELITY_LOAD_MULT) * 100);
    return `
      <p class="note">Every graphics upgrade gives <b>+${pct}% pixels</b> and costs <b>${drop}% of your FPS</b>. Low FPS cuts production by up to half, so buy a better GPU. Or don't. It is cinematic.</p>
      <h3>Hardware</h3>${hardware}
      <h3>Settings</h3>${tracks}
      <h3>Post-processing <small>only counts while switched on</small></h3>${effects}`;
  }

  private studioTab(): string {
    const s = this.game.state;
    const amounts: [number, string][] = [[1, '×1'], [10, '×10'], [-1, 'Max']];
    const picker = amounts
      .map(([n, label]) => `<button class="seg ${s.settings.buyAmount === n ? 'on' : ''}" data-action="amount" data-id="${n}">${label}</button>`)
      .join('');
    const rows = GENERATORS.map((g) => {
      const owned = s.generators[g.id];
      const locked = generatorLocked(s, g.id);
      const total = generatorRate(s, g);
      const nextMilestone = GENERATOR_MILESTONES.find((m) => owned < m);
      // Preview the rate of one unit even when none are owned yet.
      let each = total / Math.max(1, owned);
      if (owned === 0) {
        s.generators[g.id] = 1;
        each = generatorRate(s, g);
        s.generators[g.id] = 0;
      }
      return `
        <div class="row ${locked ? 'row-off' : ''}">
          <div class="row-count">${owned}</div>
          <div class="row-main">
            <div class="row-title">${g.name}</div>
            <div class="row-now">${g.desc}</div>
            <div class="row-next">${fmt(each)} px/s each${owned ? ` · <b>${fmt(total)} px/s</b> total` : ''}${nextMilestone ? ` · ×2 at ${nextMilestone}` : ''}</div>
          </div>
          ${locked ? '<span class="tag">LOCKED</span>' : `<button class="buy" data-action="generator" data-id="${g.id}" data-cost="0"></button>`}
        </div>`;
    }).join('');
    return `
      <p class="note">Staff render pixels while you admire the puddles. They keep working (at reduced pay) when the tab is closed.</p>
      <div class="segmented">${picker}</div>
      ${rows}`;
  }

  private nextGenTab(): string {
    const s = this.game.state;
    const perks = PERKS.map((p) => {
      const owned = s.perks[p.id];
      return `
        <div class="row ${owned ? 'row-max' : ''}">
          <div class="row-main">
            <div class="row-title">${p.name}</div>
            <div class="row-now">${p.desc}</div>
          </div>
          ${owned ? '<span class="tag tag-max">OWNED</span>' : `<button class="buy buy-tf" data-action="perk" data-id="${p.id}" data-tf-cost="${p.cost}">${p.cost} TF</button>`}
        </div>`;
    }).join('');

    const unlocked = this.game.canStartChallenge();
    const challenges = CHALLENGES.map((ch) => {
      const done = s.challengesDone[ch.id];
      const active = s.challenge === ch.id;
      let action = `<button class="buy ${s.challenge ? 'cant' : ''}" data-action="challenge" data-id="${ch.id}">Start</button>`;
      if (done) action = '<span class="tag tag-max">DONE</span>';
      else if (active) action = '<button class="buy buy-danger" data-action="abandon">Abandon</button>';
      else if (!unlocked) action = '<span class="tag">GEN 2</span>';
      return `
        <div class="row ${done ? 'row-max' : ''} ${active ? 'row-active' : ''}">
          <div class="row-main">
            <div class="row-title">${ch.name}</div>
            <div class="row-now">${ch.rule} Reach ${ch.goal} graphics upgrades${ch.timeLimit ? ` in ${fmtTime(ch.timeLimit)}` : ''}.</div>
            <div class="row-next"><b>Reward:</b> ${ch.reward}</div>
          </div>
          ${action}
        </div>`;
    }).join('');

    return `
      <div class="card card-gen">
        <div class="gen-number">GEN ${s.generation}</div>
        <p>Scrap this console generation and start again with <b>Teraflops</b>: each one you have ever earned gives +${Math.round(TERAFLOP_BONUS * 100)}% pixels.</p>
        <p class="tf-line"><b class="tf-text">${fmt(s.teraflops)} TF</b> to spend · ${fmt(s.teraflopsTotal)} earned in total (+${fmt(s.teraflopsTotal * TERAFLOP_BONUS * 100)}% pixels)</p>
        <button class="btn btn-primary btn-wide" data-action="prestige"></button>
      </div>
      <h3>Perks <small>permanent, bought with Teraflops</small></h3>${perks}
      <h3>Challenges <small>${unlocked ? 'restart the generation under a handicap' : 'unlock at Generation 2'}</small></h3>${challenges}`;
  }

  private trophiesTab(): string {
    const s = this.game.state;
    const have = achievementCount(s);
    const each = s.perks.collector ? 5 : 2;
    const cards = ACHIEVEMENTS.map((a) => {
      const got = !!s.achievements[a.id];
      const hidden = a.secret && !got;
      return `<div class="trophy ${got ? 'got' : ''}"><b>${hidden ? '???' : a.name}</b><span>${hidden ? 'Secret trophy.' : a.desc}</span></div>`;
    }).join('');
    return `
      <p class="note"><b>${have} / ${ACHIEVEMENTS.length}</b> trophies. Each gives +${each}% pixels (currently +${have * each}%).</p>
      <div class="trophies">${cards}</div>`;
  }

  private optionsTab(): string {
    const s = this.game.state;
    const toggle = (id: string, label: string, hint: string, on: boolean): string => `
      <div class="row">
        <div class="row-main"><div class="row-title">${label}</div><div class="row-now">${hint}</div></div>
        <button class="switch ${on ? 'on' : ''}" data-action="toggle" data-id="${id}" role="switch" aria-checked="${on}" aria-label="${label}"><i></i></button>
      </div>`;
    const st = s.stats;
    return `
      <h3>Sound</h3>
      ${toggle('sfx', 'Sound effects', 'Bleeps and bloops.', s.settings.sfx)}
      ${toggle('music', 'Music', 'A loop you will stop noticing.', s.settings.music)}
      ${toggle('fan', 'GPU fan', 'Gets louder as the frame rate drops. Immersive.', s.settings.fan)}
      <div class="row"><div class="row-main"><div class="row-title">Volume</div></div>
        <input type="range" min="0" max="100" value="${Math.round(s.settings.volume * 100)}" data-input="volume" aria-label="Volume" /></div>
      <h3>Display</h3>
      ${toggle('authenticFps', 'Authentic frame rate', 'Really render the scene at the simulated FPS. Turn off if the slideshow hurts.', s.settings.authenticFps)}
      ${toggle('autoRotate', 'Auto-rotate camera', 'Drag the scene to look around; scroll to zoom.', s.settings.autoRotate)}
      <h3>Statistics</h3>
      <dl class="stats">
        <dt>Time played</dt><dd data-stat="time">${fmtTime(st.playTime)}</dd>
        <dt>Pixels rendered (all time)</dt><dd>${fmt(s.totalEarned)}</dd>
        <dt>Scene clicks</dt><dd>${fmt(st.clicks)}</dd>
        <dt>Console generation</dt><dd>${s.generation}</dd>
        <dt>Dead pixels caught</dt><dd>${st.deadPixels}</dd>
        <dt>Screenshots taken</dt><dd>${st.photos}</dd>
        <dt>Gameplay requests denied</dt><dd>${st.gameplayRequests}</dd>
        <dt>Gameplay</dt><dd>0</dd>
      </dl>
      <h3>Save</h3>
      <p class="note">The game saves to this browser automatically.</p>
      <div class="btn-row">
        <button class="btn" data-action="export">Export</button>
        <button class="btn" data-action="import">Import</button>
        <button class="btn btn-danger" data-action="reset">Hard reset</button>
      </div>
      <p class="note credits">GFX Simulator is satire. No gameplay was harmed, or included, in the making of this product.</p>`;
  }
}
