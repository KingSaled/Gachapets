/**
 * Procedural chiptune SFX — every sound in Gachapets is synthesized live with
 * the Web Audio API (no audio files): square/triangle voices for UI blips,
 * filtered noise for foil rips and card slides, a small reverb for the big
 * reveal fanfares.
 */

type Wave = OscillatorType;

interface ToneOpts {
  f: number;
  f2?: number;
  dur: number;
  type?: Wave;
  vol?: number;
  at?: number;
  attack?: number;
  wet?: number;
  vibrato?: { rate: number; depth: number };
}

interface NoiseOpts {
  dur: number;
  vol?: number;
  at?: number;
  filter?: BiquadFilterType;
  f?: number;
  f2?: number;
  q?: number;
  attack?: number;
  wet?: number;
}

const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);
// Major pentatonic degrees, handy for sparkles that never clash.
const PENTA = [0, 2, 4, 7, 9];

class SfxEngine {
  private ctx: AudioContext | null = null;
  private out!: GainNode;
  private wetBus!: GainNode;
  private noiseBuf!: AudioBuffer;
  private last = new Map<string, number>();
  enabled = true;
  volume = 0.7;

  /** Must be called from a user gesture at least once (browsers block autoplay). */
  unlock() {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      const ctx = new Ctor();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      comp.connect(ctx.destination);
      this.out = ctx.createGain();
      this.out.gain.value = this.volume;
      this.out.connect(comp);

      const reverb = ctx.createConvolver();
      const len = Math.floor(ctx.sampleRate * 1.6);
      const ir = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const data = ir.getChannelData(ch);
        for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
      }
      reverb.buffer = ir;
      this.wetBus = ctx.createGain();
      this.wetBus.gain.value = 0.35;
      this.wetBus.connect(reverb);
      reverb.connect(this.out);

      this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const nd = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
      this.ctx = ctx;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.out) this.out.gain.value = v;
  }

  setEnabled(on: boolean) {
    this.enabled = on;
  }

  private ready(): AudioContext | null {
    if (!this.enabled || !this.ctx || this.ctx.state !== 'running') return null;
    return this.ctx;
  }

  private throttle(key: string, ms: number): boolean {
    const t = performance.now();
    if (t - (this.last.get(key) ?? 0) < ms) return false;
    this.last.set(key, t);
    return true;
  }

  tone(o: ToneOpts) {
    const ctx = this.ready();
    if (!ctx) return;
    const t0 = ctx.currentTime + (o.at ?? 0);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = o.type ?? 'square';
    osc.frequency.setValueAtTime(o.f, t0);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2), t0 + o.dur);
    if (o.vibrato) {
      const lfo = ctx.createOscillator();
      const lg = ctx.createGain();
      lfo.frequency.value = o.vibrato.rate;
      lg.gain.value = o.vibrato.depth;
      lfo.connect(lg).connect(osc.frequency);
      lfo.start(t0);
      lfo.stop(t0 + o.dur + 0.05);
    }
    const vol = (o.vol ?? 0.1) * (osc.type === 'square' || osc.type === 'sawtooth' ? 0.6 : 1);
    const attack = o.attack ?? 0.005;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    osc.connect(g).connect(this.out);
    if (o.wet) {
      const send = ctx.createGain();
      send.gain.value = o.wet;
      g.connect(send).connect(this.wetBus);
    }
    osc.start(t0);
    osc.stop(t0 + o.dur + 0.02);
  }

  noise(o: NoiseOpts) {
    const ctx = this.ready();
    if (!ctx) return;
    const t0 = ctx.currentTime + (o.at ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = o.filter ?? 'bandpass';
    filter.frequency.setValueAtTime(o.f ?? 2000, t0);
    if (o.f2) filter.frequency.exponentialRampToValueAtTime(o.f2, t0 + o.dur);
    filter.Q.value = o.q ?? 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(o.vol ?? 0.1, t0 + (o.attack ?? 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    src.connect(filter).connect(g).connect(this.out);
    if (o.wet) {
      const send = ctx.createGain();
      send.gain.value = o.wet;
      g.connect(send).connect(this.wetBus);
    }
    src.start(t0, Math.random());
    src.stop(t0 + o.dur + 0.02);
  }

  private arp(notes: number[], step: number, opts: Partial<ToneOpts> = {}) {
    notes.forEach((n, i) => {
      if (n < 0) return;
      this.tone({ f: midi(n), dur: opts.dur ?? step * 1.6, type: opts.type ?? 'square', vol: opts.vol ?? 0.08, at: (opts.at ?? 0) + i * step, wet: opts.wet });
    });
  }

  // ── UI ──────────────────────────────────────────────────────────────────
  hover() {
    if (!this.throttle('hover', 45)) return;
    this.tone({ f: 1760, f2: 1500, dur: 0.035, type: 'square', vol: 0.025 });
  }
  click() {
    this.tone({ f: 660, f2: 990, dur: 0.06, type: 'square', vol: 0.07 });
    this.noise({ dur: 0.02, vol: 0.03, filter: 'highpass', f: 4000 });
  }
  back() {
    this.tone({ f: 520, f2: 300, dur: 0.08, type: 'square', vol: 0.06 });
  }
  toggle(on: boolean) {
    this.arp(on ? [76, 83] : [83, 76], 0.05, { vol: 0.05, dur: 0.06 });
  }
  tab() {
    this.tone({ f: 880, dur: 0.04, type: 'triangle', vol: 0.08 });
    this.tone({ f: 1320, dur: 0.05, type: 'triangle', vol: 0.06, at: 0.035 });
  }
  error() {
    this.tone({ f: 196, f2: 150, dur: 0.12, type: 'square', vol: 0.08 });
    this.tone({ f: 196, f2: 140, dur: 0.16, type: 'square', vol: 0.08, at: 0.13 });
  }
  success() {
    this.arp([72, 76, 79, 84], 0.06, { type: 'triangle', vol: 0.1, wet: 0.2 });
  }
  coin() {
    if (!this.throttle('coin', 40)) return;
    this.tone({ f: midi(83), dur: 0.07, type: 'square', vol: 0.06 });
    this.tone({ f: midi(88), dur: 0.28, type: 'square', vol: 0.06, at: 0.07 });
  }
  coins(count: number) {
    const n = Math.min(6, Math.max(1, count));
    for (let i = 0; i < n; i++) {
      this.tone({ f: midi(83 + (i % 2) * 2), dur: 0.06, type: 'square', vol: 0.045, at: i * 0.07 });
      this.tone({ f: midi(88 + (i % 2) * 2), dur: 0.18, type: 'square', vol: 0.045, at: i * 0.07 + 0.06 });
    }
  }
  register() {
    this.coin();
    this.tone({ f: midi(96), dur: 0.5, type: 'sine', vol: 0.08, at: 0.12, wet: 0.4 });
  }
  pageTurn() {
    this.noise({ dur: 0.18, vol: 0.06, filter: 'bandpass', f: 900, f2: 3200, q: 0.8 });
  }

  // ── Pack ripping ────────────────────────────────────────────────────────
  ripTick(intensity = 0.5) {
    if (!this.throttle('rip', 28)) return;
    this.noise({ dur: 0.03 + Math.random() * 0.04, vol: 0.05 + intensity * 0.07, filter: 'bandpass', f: 1800 + Math.random() * 3500, q: 2.5 });
  }
  ripFinish() {
    this.noise({ dur: 0.45, vol: 0.22, filter: 'highpass', f: 5000, f2: 600, q: 0.7 });
    this.noise({ dur: 0.25, vol: 0.15, filter: 'bandpass', f: 2600, f2: 1200, q: 3, at: 0.02 });
    this.tone({ f: 140, f2: 50, dur: 0.3, type: 'sine', vol: 0.25 });
  }
  crinkle() {
    for (let i = 0; i < 5; i++) this.noise({ dur: 0.025, vol: 0.04, filter: 'bandpass', f: 3000 + Math.random() * 4000, q: 4, at: i * 0.035 + Math.random() * 0.02 });
  }
  slide() {
    this.noise({ dur: 0.16, vol: 0.06, filter: 'lowpass', f: 2400, f2: 700 });
  }
  whoosh(at = 0) {
    this.noise({ dur: 0.28, vol: 0.09, filter: 'bandpass', f: 500, f2: 2800, q: 1.2, at });
  }
  tuck(at = 0) {
    this.noise({ dur: 0.12, vol: 0.08, filter: 'bandpass', f: 2600, f2: 900, q: 1.5, at });
    this.tone({ f: 700, f2: 1100, dur: 0.05, type: 'triangle', vol: 0.05, at: at + 0.1 });
  }
  flick() {
    this.noise({ dur: 0.05, vol: 0.08, filter: 'highpass', f: 2500 });
    this.tone({ f: 1200, f2: 800, dur: 0.04, type: 'triangle', vol: 0.05 });
  }
  flip() {
    this.noise({ dur: 0.09, vol: 0.1, filter: 'bandpass', f: 1400, f2: 3000, q: 1.2 });
  }

  // ── Reveals ─────────────────────────────────────────────────────────────
  sparkle(count = 5, at = 0) {
    for (let i = 0; i < count; i++) {
      const n = 84 + PENTA[Math.floor(Math.random() * PENTA.length)] + 12 * Math.floor(Math.random() * 2);
      this.tone({ f: midi(n), dur: 0.18, type: 'triangle', vol: 0.05, at: at + i * 0.06 + Math.random() * 0.03, wet: 0.5 });
    }
  }

  /** Rising tension before a big reveal. Returns a function that cuts it off early. */
  charge(seconds: number) {
    const ctx = this.ready();
    if (!ctx) return () => {};
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const g = ctx.createGain();
    const trem = ctx.createOscillator();
    const tremGain = ctx.createGain();
    osc.type = 'sawtooth';
    osc2.type = 'square';
    osc.frequency.setValueAtTime(110, t0);
    osc.frequency.exponentialRampToValueAtTime(880, t0 + seconds);
    osc2.frequency.setValueAtTime(111.5, t0);
    osc2.frequency.exponentialRampToValueAtTime(884, t0 + seconds);
    trem.frequency.setValueAtTime(6, t0);
    trem.frequency.linearRampToValueAtTime(22, t0 + seconds);
    tremGain.gain.value = 0.02;
    trem.connect(tremGain).connect(g.gain);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.045, t0 + seconds * 0.9);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(400, t0);
    lp.frequency.exponentialRampToValueAtTime(5000, t0 + seconds);
    osc.connect(lp);
    osc2.connect(lp);
    lp.connect(g).connect(this.out);
    [osc, osc2, trem].forEach((o) => {
      o.start(t0);
      o.stop(t0 + seconds + 0.1);
    });
    this.noise({ dur: seconds, vol: 0.05, filter: 'bandpass', f: 300, f2: 6000, q: 0.9, attack: seconds * 0.8 });
    return () => {
      const t = ctx.currentTime;
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(g.gain.value, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    };
  }

  impact(power = 1) {
    this.tone({ f: 160, f2: 38, dur: 0.45 + power * 0.15, type: 'sine', vol: 0.3 * Math.min(1, power) + 0.1 });
    this.noise({ dur: 0.3 + power * 0.2, vol: 0.12 + power * 0.06, filter: 'lowpass', f: 3000, f2: 200, wet: 0.4 });
  }

  /** Tier fanfares, 1 (shiny) → 5 (living foil). */
  fanfare(level: number) {
    if (level <= 1) {
      this.arp([76, 80, 83, 88], 0.055, { type: 'triangle', vol: 0.09, wet: 0.3 });
      this.sparkle(3, 0.2);
      return;
    }
    if (level === 2) {
      this.arp([72, 76, 79, 84, 88], 0.06, { type: 'square', vol: 0.07, wet: 0.35 });
      this.tone({ f: midi(84), dur: 0.7, type: 'triangle', vol: 0.07, at: 0.3, wet: 0.5 });
      this.tone({ f: midi(88), dur: 0.7, type: 'triangle', vol: 0.05, at: 0.3, wet: 0.5 });
      this.sparkle(5, 0.25);
      return;
    }
    if (level === 3) {
      this.arp([67, 72, 76, 79, 84, -1, 81, 84, 88], 0.075, { type: 'square', vol: 0.07, wet: 0.35 });
      this.arp([48, -1, 55, -1, 60, -1, 57, -1, 60], 0.075, { type: 'triangle', vol: 0.12 });
      this.tone({ f: midi(91), dur: 1.0, type: 'triangle', vol: 0.06, at: 0.7, wet: 0.6, vibrato: { rate: 6, depth: 8 } });
      this.sparkle(8, 0.5);
      return;
    }
    // 4 = 3D Pop, 5 = Living Foil: full victory phrase with harmony and bass.
    const lead = level >= 5
      ? [72, 76, 79, 84, -1, 79, 84, 88, -1, 86, 88, 91, 96]
      : [67, 72, 76, 79, -1, 76, 79, 84, -1, 83, 84, 88];
    const harm = lead.map((n) => (n < 0 ? -1 : n - 5));
    const bass = lead.map((n, i) => (n < 0 ? -1 : i % 2 === 0 ? 48 + (i % 4 === 0 ? 0 : 7) : -1));
    const step = 0.085;
    this.arp(lead, step, { type: 'square', vol: 0.07, wet: 0.35 });
    this.arp(harm, step, { type: 'square', vol: 0.035, wet: 0.2 });
    this.arp(bass, step, { type: 'triangle', vol: 0.14, dur: step * 2.2 });
    const end = lead.length * step;
    [0, 4, 7, 12].forEach((iv, i) => this.tone({ f: midi((level >= 5 ? 84 : 79) + iv), dur: 1.6, type: i % 2 ? 'triangle' : 'square', vol: 0.045, at: end, wet: 0.7, vibrato: { rate: 5.5, depth: 6 } }));
    this.sparkle(12, end);
  }

  glitch() {
    for (let i = 0; i < 14; i++) {
      const at = i * 0.045 + Math.random() * 0.02;
      if (Math.random() < 0.55) this.tone({ f: 80 + Math.random() * 2400, dur: 0.035, type: 'square', vol: 0.06, at });
      else this.noise({ dur: 0.04, vol: 0.1, filter: Math.random() < 0.5 ? 'highpass' : 'lowpass', f: 300 + Math.random() * 6000, at });
    }
    this.tone({ f: 60, f2: 30, dur: 0.8, type: 'sawtooth', vol: 0.12, at: 0.7 });
  }
  stamp(at = 0) {
    this.tone({ f: 220, f2: 60, dur: 0.18, type: 'sine', vol: 0.3, at });
    this.noise({ dur: 0.08, vol: 0.12, filter: 'lowpass', f: 1800, at });
  }
  discovery() {
    this.arp([79, 83, 86, 91, 95], 0.09, { type: 'triangle', vol: 0.09, wet: 0.6 });
    this.arp([79, 83, 86, 91, 95], 0.09, { type: 'triangle', vol: 0.03, at: 0.27, wet: 0.6 });
  }
  badge() {
    this.arp([67, 71, 74, 79, -1, 74, 79, 83], 0.07, { type: 'square', vol: 0.06, wet: 0.3 });
    this.tone({ f: midi(86), dur: 0.9, type: 'triangle', vol: 0.07, at: 0.56, wet: 0.6 });
  }
  newCard() {
    this.arp([84, 91], 0.07, { type: 'triangle', vol: 0.07, wet: 0.3 });
  }
}

export const sfx = new SfxEngine();

export function buzz(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* unsupported */
  }
}
