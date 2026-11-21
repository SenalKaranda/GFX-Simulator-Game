// All sound is synthesised with WebAudio: no audio assets to load.

type Wave = OscillatorType;

export interface AudioFlags {
  sfx: boolean;
  music: boolean;
  fan: boolean;
  volume: number;
}

const CHORDS = [
  [220.0, 261.63, 329.63], // Am
  [174.61, 220.0, 261.63], // F
  [130.81, 164.81, 196.0], // C
  [196.0, 246.94, 293.66], // G
];
const STEP = 60 / 92 / 2;

export class Sound {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private fanGain!: GainNode;
  private fanFilter!: BiquadFilterNode;
  private flags: AudioFlags = { sfx: true, music: true, fan: true, volume: 0.6 };
  private fanLoad = 0;
  private nextStep = 0;
  private step = 0;
  private lastClick = 0;

  /** Must be called from a user gesture; browsers block audio otherwise. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    try {
      this.ctx = new Ctor();
    } catch {
      return;
    }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    this.sfxBus = ctx.createGain();
    this.sfxBus.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.connect(this.master);

    // GPU fan: looping noise through a band-pass that opens up as the load rises.
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    this.fanFilter = ctx.createBiquadFilter();
    this.fanFilter.type = 'bandpass';
    this.fanFilter.Q.value = 0.7;
    this.fanGain = ctx.createGain();
    this.fanGain.gain.value = 0;
    noise.connect(this.fanFilter).connect(this.fanGain).connect(this.master);
    noise.start();

    this.nextStep = ctx.currentTime + 0.1;
    window.setInterval(() => this.schedule(), 120);
    this.apply();
  }

  configure(flags: AudioFlags): void {
    this.flags = { ...flags };
    this.apply();
  }

  /** 0 = idle, 1 = the GPU is trying to leave the case. */
  setFanLoad(load: number): void {
    this.fanLoad = Math.min(1, Math.max(0, load));
    this.apply();
  }

  private apply(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.flags.volume, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(this.flags.sfx ? 1 : 0, t, 0.05);
    this.musicBus.gain.setTargetAtTime(this.flags.music ? 0.5 : 0, t, 0.2);
    this.fanGain.gain.setTargetAtTime(this.flags.fan ? 0.015 + 0.2 * this.fanLoad ** 1.5 : 0, t, 0.6);
    this.fanFilter.frequency.setTargetAtTime(260 + 2600 * this.fanLoad, t, 0.6);
  }

  private tone(freq: number, start: number, length: number, wave: Wave, gain: number, bus: GainNode, slideTo?: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(freq, start);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, start + length);
    env.gain.setValueAtTime(0.0001, start);
    env.gain.exponentialRampToValueAtTime(gain, start + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, start + length);
    osc.connect(env).connect(bus);
    osc.start(start);
    osc.stop(start + length + 0.05);
  }

  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    if (this.nextStep < ctx.currentTime - 0.5) this.nextStep = ctx.currentTime + 0.05;
    while (this.nextStep < ctx.currentTime + 0.3) {
      if (this.flags.music) {
        const chord = CHORDS[Math.floor(this.step / 16) % CHORDS.length];
        const i = this.step % 16;
        if (i === 0) {
          this.tone(chord[0] / 2, this.nextStep, STEP * 15, 'triangle', 0.16, this.musicBus);
          for (const f of chord) this.tone(f, this.nextStep, STEP * 15, 'sine', 0.035, this.musicBus);
        }
        const pattern = [0, 1, 2, 1, 2, 1, 0, 2];
        if (i % 2 === 0 || i === 13) {
          const note = chord[pattern[(i >> 1) % 8]] * (i >= 8 ? 2 : 1) * 2;
          this.tone(note, this.nextStep, STEP * 1.6, 'triangle', 0.05, this.musicBus);
        }
      }
      this.step++;
      this.nextStep += STEP;
    }
  }

  private get ready(): boolean {
    return !!this.ctx && this.ctx.state === 'running' && this.flags.sfx;
  }

  click(): void {
    if (!this.ready) return;
    const now = this.ctx!.currentTime;
    if (now - this.lastClick < 0.03) return;
    this.lastClick = now;
    this.tone(520 + Math.random() * 160, now, 0.06, 'square', 0.05, this.sfxBus);
  }

  buy(): void {
    if (!this.ready) return;
    const now = this.ctx!.currentTime;
    this.tone(440, now, 0.09, 'triangle', 0.14, this.sfxBus);
    this.tone(660, now + 0.07, 0.14, 'triangle', 0.14, this.sfxBus);
  }

  upgrade(): void {
    if (!this.ready) return;
    const now = this.ctx!.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, now + i * 0.06, 0.2, 'triangle', 0.13, this.sfxBus));
  }

  deny(): void {
    if (!this.ready) return;
    this.tone(160, this.ctx!.currentTime, 0.16, 'sawtooth', 0.07, this.sfxBus, 90);
  }

  achievement(): void {
    if (!this.ready) return;
    const now = this.ctx!.currentTime;
    [659.25, 783.99, 987.77, 1318.5].forEach((f, i) => this.tone(f, now + i * 0.09, 0.32, 'square', 0.06, this.sfxBus));
  }

  prestige(): void {
    if (!this.ready) return;
    const now = this.ctx!.currentTime;
    this.tone(110, now, 1.4, 'sawtooth', 0.12, this.sfxBus, 880);
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => this.tone(f, now + 0.9 + i * 0.08, 0.6, 'triangle', 0.12, this.sfxBus));
  }

  jump(): void {
    if (!this.ready) return;
    this.tone(260, this.ctx!.currentTime, 0.22, 'square', 0.07, this.sfxBus, 720);
  }

  shutter(): void {
    if (!this.ready) return;
    const now = this.ctx!.currentTime;
    this.tone(1800, now, 0.03, 'square', 0.08, this.sfxBus, 300);
    this.tone(900, now + 0.07, 0.04, 'square', 0.07, this.sfxBus, 200);
  }
}
