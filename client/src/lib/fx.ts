/**
 * Pixel particle engine for reveals. One full-screen canvas; the loop only
 * runs while particles are alive. Particles snap to a pixel grid so bursts
 * read as chunky 8-bit confetti rather than smooth vector dust.
 */

type Shape = 'square' | 'plus' | 'spark' | 'coin';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  shape: Shape;
  gravity: number;
  drag: number;
  spin: number;
}

export interface BurstOpts {
  x: number;
  y: number;
  colors: string[];
  count?: number;
  speed?: number;
  size?: number;
  gravity?: number;
  life?: number;
  shapes?: Shape[];
  /** Emit from a rectangle instead of a point. */
  w?: number;
  h?: number;
}

class FxEngine {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private parts: Particle[] = [];
  private raf = 0;
  private last = 0;
  private reduced = false;

  attach(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.resize();
    window.addEventListener('resize', this.resize);
  }

  detach() {
    window.removeEventListener('resize', this.resize);
    cancelAnimationFrame(this.raf);
    this.canvas = null;
    this.ctx = null;
    this.parts = [];
  }

  private resize = () => {
    if (!this.canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = window.innerWidth * dpr;
    this.canvas.height = window.innerHeight * dpr;
    this.ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  burst(o: BurstOpts) {
    if (!this.ctx) return;
    const count = Math.round((o.count ?? 40) * (this.reduced ? 0.25 : 1));
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (o.speed ?? 6) * (0.35 + Math.random() * 0.9);
      const life = (o.life ?? 1.1) * (0.6 + Math.random() * 0.7);
      this.parts.push({
        x: o.x + (o.w ? (Math.random() - 0.5) * o.w : 0),
        y: o.y + (o.h ? (Math.random() - 0.5) * o.h : 0),
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - (o.gravity ?? 0.18) * 6,
        life,
        max: life,
        size: Math.max(2, Math.round((o.size ?? 5) * (0.6 + Math.random() * 0.8))),
        color: o.colors[Math.floor(Math.random() * o.colors.length)],
        shape: (o.shapes ?? ['square', 'square', 'plus'])[Math.floor(Math.random() * (o.shapes?.length ?? 3))],
        gravity: o.gravity ?? 0.18,
        drag: 0.965,
        spin: Math.random() * 6,
      });
    }
    this.start();
  }

  /** Confetti rain from the top of the screen. */
  rain(colors: string[], count = 120) {
    if (!this.ctx) return;
    const n = Math.round(count * (this.reduced ? 0.2 : 1));
    for (let i = 0; i < n; i++) {
      const life = 2.2 + Math.random() * 1.8;
      this.parts.push({
        x: Math.random() * window.innerWidth,
        y: -20 - Math.random() * window.innerHeight * 0.4,
        vx: (Math.random() - 0.5) * 2,
        vy: 2 + Math.random() * 3,
        life,
        max: life,
        size: 4 + Math.round(Math.random() * 5),
        color: colors[Math.floor(Math.random() * colors.length)],
        shape: Math.random() < 0.2 ? 'plus' : 'square',
        gravity: 0.05,
        drag: 0.99,
        spin: Math.random() * 6,
      });
    }
    this.start();
  }

  /** Coins that fly from a point toward a target (e.g. the HUD wallet). */
  coins(from: { x: number; y: number }, to: { x: number; y: number }, count = 10) {
    if (!this.ctx) return;
    for (let i = 0; i < Math.min(24, count); i++) {
      const life = 0.7 + Math.random() * 0.35;
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      this.parts.push({
        x: from.x + (Math.random() - 0.5) * 40,
        y: from.y + (Math.random() - 0.5) * 30,
        vx: dx / (life * 60) + (Math.random() - 0.5) * 3,
        vy: dy / (life * 60) - 4 - Math.random() * 3,
        life,
        max: life,
        size: 8,
        color: '#ffd23f',
        shape: 'coin',
        gravity: 0.14,
        drag: 1,
        spin: Math.random() * 6,
      });
    }
    this.start();
  }

  private start() {
    if (this.raf) return;
    this.last = performance.now();
    const tick = (t: number) => {
      const dt = Math.min(0.05, (t - this.last) / 1000);
      this.last = t;
      this.step(dt);
      if (this.parts.length) this.raf = requestAnimationFrame(tick);
      else {
        this.raf = 0;
        this.ctx?.clearRect(0, 0, window.innerWidth, window.innerHeight);
      }
    };
    this.raf = requestAnimationFrame(tick);
  }

  private step(dt: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    const f = dt * 60;
    const alive: Particle[] = [];
    for (const p of this.parts) {
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vx *= p.drag ** f;
      p.vy = p.vy * p.drag ** f + p.gravity * f;
      p.x += p.vx * f;
      p.y += p.vy * f;
      p.spin += dt * 10;
      alive.push(p);
      const fade = Math.min(1, p.life / (p.max * 0.4));
      ctx.globalAlpha = fade;
      ctx.fillStyle = p.color;
      const s = p.size;
      const x = Math.round(p.x / 2) * 2;
      const y = Math.round(p.y / 2) * 2;
      if (p.shape === 'plus') {
        ctx.fillRect(x - s, y - 1, s * 2, 3);
        ctx.fillRect(x - 1, y - s, 3, s * 2);
      } else if (p.shape === 'spark') {
        ctx.fillRect(x, y, 2, s * 2);
      } else if (p.shape === 'coin') {
        const w = Math.max(2, Math.abs(Math.cos(p.spin)) * s);
        ctx.fillStyle = '#7a4e00';
        ctx.fillRect(x - w / 2 - 1, y - s / 2 - 1, w + 2, s + 2);
        ctx.fillStyle = '#ffd23f';
        ctx.fillRect(x - w / 2, y - s / 2, w, s);
      } else {
        const flick = Math.abs(Math.cos(p.spin)) * s;
        ctx.fillRect(x - flick / 2, y - s / 2, Math.max(2, flick), s);
      }
    }
    ctx.globalAlpha = 1;
    this.parts = alive;
  }
}

export const fx = new FxEngine();

export const FINISH_COLORS: Record<string, string[]> = {
  base: ['#f4efff', '#b9b3d6'],
  shiny: ['#ffffff', '#dfe9ff', '#bcd0ff', '#ffe9a8'],
  holo: ['#5ef2ff', '#ff6bd5', '#ffd23f', '#7cff9a', '#8a6bff'],
  parallax: ['#a184ff', '#5ef2ff', '#ffffff', '#ff6bd5'],
  pop3d: ['#ffd23f', '#fff3b0', '#ff9f1c', '#ffffff'],
  living: ['#ff6bd5', '#5ef2ff', '#ffd23f', '#7cff9a', '#ff4f8b', '#a184ff', '#ffffff'],
  misprint: ['#ff2a2a', '#2affd5', '#ffffff', '#111111'],
};
