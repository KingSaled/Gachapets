import { useEffect, useRef } from 'react';
import type { Element } from '@gachapets/shared';

/**
 * "Living Foil" sprite: the creature is redrawn every frame on a canvas with
 *   • an element-specific idle motion (bob, sway, flicker, stomp…),
 *   • per-row wave distortion (heat haze, ghostly ripple, water shimmer),
 *   • palette cycling — pixels drift between the normal and shiny palettes.
 * The sprite pack's anim sheets have identical frames, so motion is
 * procedural, the same way the original handheld engines animated them.
 * One shared RAF loop drives every visible living sprite.
 */

const PAD = 10;
const SIZE = 64 + PAD * 2;

interface Motion {
  dx: number;
  dy: number;
  sx: number;
  sy: number;
  wave: number;
  waveFreq: number;
  alpha: number;
  palette: number;
}

function motionFor(el: Element, t: number): Motion {
  const m: Motion = { dx: 0, dy: 0, sx: 1, sy: 1, wave: 0, waveFreq: 0.35, alpha: 1, palette: 0.5 - 0.5 * Math.cos(t * 0.8) };
  const s = Math.sin;
  switch (el) {
    case 'fire':
      m.sy = 1 + 0.035 * s(t * 9) + 0.015 * s(t * 23);
      m.sx = 1 - 0.02 * s(t * 9);
      m.wave = 0.8;
      m.waveFreq = 0.5;
      break;
    case 'water':
      m.dy = s(t * 1.8) * 2.5;
      m.wave = 1;
      m.waveFreq = 0.22;
      break;
    case 'grass':
    case 'bug': {
      const hop = Math.max(0, s(t * 3.2));
      m.dy = el === 'bug' ? -(hop ** 3) * 6 : 0;
      m.sy = 1 + 0.03 * s(t * 2);
      m.wave = el === 'grass' ? 0.9 : 0;
      m.waveFreq = 0.08;
      break;
    }
    case 'electric': {
      const burst = (t % 1.6) < 0.18;
      m.dx = burst ? (Math.random() - 0.5) * 3 : 0;
      m.dy = burst ? (Math.random() - 0.5) * 2 : s(t * 2) * 1;
      m.palette = burst ? 1 : m.palette * 0.6;
      break;
    }
    case 'ice':
    case 'rock':
    case 'steel':
      m.sy = 1 + 0.02 * s(t * 1.4);
      m.sx = 1 - 0.01 * s(t * 1.4);
      m.dy = el === 'steel' ? Math.round(s(t * 2) * 1.5) : 0;
      break;
    case 'fighting': {
      const p = (t * 1.2) % 1;
      const punch = p < 0.12 ? s((p / 0.12) * Math.PI) : 0;
      m.sx = 1 + punch * 0.07;
      m.sy = 1 - punch * 0.05;
      m.dx = punch * 2;
      break;
    }
    case 'ground': {
      const p = (t * 0.9) % 1;
      const air = p < 0.35 ? s((p / 0.35) * Math.PI) : 0;
      m.dy = -air * 5;
      const land = p > 0.35 && p < 0.45 ? 1 - (p - 0.35) / 0.1 : 0;
      m.sy = 1 - land * 0.08;
      m.sx = 1 + land * 0.06;
      break;
    }
    case 'flying':
    case 'fairy':
    case 'psychic':
    case 'dragon':
      m.dy = s(t * 2.4) * 3;
      m.sy = 1 + 0.015 * s(t * 4.8);
      m.palette = el === 'psychic' ? 0.5 - 0.5 * Math.cos(t * 2) : m.palette;
      break;
    case 'ghost':
    case 'poison':
      m.dy = s(t * 1.5) * 3;
      m.wave = 1.2;
      m.waveFreq = 0.3;
      m.alpha = el === 'ghost' ? 0.78 + 0.22 * s(t * 2.2) : 1;
      break;
    case 'dark':
      m.dx = s(t * 0.9) * 1.5;
      m.palette = 0.5 - 0.5 * Math.cos(t * 0.6);
      break;
    default:
      m.sy = 1 + 0.025 * s(t * 2.2);
      m.dy = Math.max(0, s(t * 1.1 + 1)) ** 8 * -4;
  }
  m.palette = m.palette ** 2.2;
  return m;
}

interface Entry {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  element: Element;
  normal: Uint8ClampedArray;
  shiny: Uint8ClampedArray;
  frame: ImageData;
  tint: HTMLCanvasElement;
  tctx: CanvasRenderingContext2D;
  lastPalette: number;
  visible: boolean;
  phase: number;
}

const entries = new Set<Entry>();
let raf = 0;
let lastDraw = 0;

function loop(now: number) {
  raf = requestAnimationFrame(loop);
  if (now - lastDraw < 1000 / 30) return; // 30fps keeps the chunky handheld feel and saves battery
  lastDraw = now;
  const t = now / 1000;
  for (const e of entries) if (e.visible) draw(e, t + e.phase);
}

function draw(e: Entry, t: number) {
  const m = motionFor(e.element, t);
  if (Math.abs(m.palette - e.lastPalette) > 0.01) {
    const d = e.frame.data;
    const a = e.normal;
    const b = e.shiny;
    const k = m.palette;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = a[i] + (b[i] - a[i]) * k;
      d[i + 1] = a[i + 1] + (b[i + 1] - a[i + 1]) * k;
      d[i + 2] = a[i + 2] + (b[i + 2] - a[i + 2]) * k;
      d[i + 3] = a[i + 3];
    }
    e.tctx.putImageData(e.frame, 0, 0);
    e.lastPalette = k;
  }
  const ctx = e.ctx;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, SIZE, SIZE);
  ctx.globalAlpha = m.alpha;
  // anchor scaling at the sprite's feet so squash/stretch looks grounded
  const fx = SIZE / 2;
  const fy = PAD + 60;
  ctx.setTransform(m.sx, 0, 0, m.sy, fx - fx * m.sx + Math.round(m.dx), fy - fy * m.sy + Math.round(m.dy));
  if (m.wave) {
    for (let y = 0; y < 64; y++) {
      const off = Math.round(Math.sin(t * 4 + y * m.waveFreq) * m.wave);
      ctx.drawImage(e.tint, 0, y, 64, 1, PAD + off, PAD + y, 64, 1);
    }
  } else {
    ctx.drawImage(e.tint, PAD, PAD);
  }
  ctx.globalAlpha = 1;
}

async function loadPixels(src: string): Promise<Uint8ClampedArray> {
  const img = new Image();
  img.decoding = 'async';
  img.src = src;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const cx = c.getContext('2d', { willReadFrequently: true })!;
  cx.drawImage(img, 0, 0, 64, 64);
  return cx.getImageData(0, 0, 64, 64).data;
}

export function LivingSprite({ front, shiny, element, size, className }: { front: string; shiny: string; element: Element; size: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let entry: Entry | null = null;
    let cancelled = false;
    let io: IntersectionObserver | null = null;

    void Promise.all([loadPixels(front), loadPixels(shiny)]).then(([normal, shinyPx]) => {
      if (cancelled) return;
      const ctx = canvas.getContext('2d')!;
      ctx.imageSmoothingEnabled = false;
      const tint = document.createElement('canvas');
      tint.width = 64;
      tint.height = 64;
      const tctx = tint.getContext('2d')!;
      entry = {
        canvas, ctx, element, normal, shiny: shinyPx, frame: new ImageData(64, 64), tint, tctx,
        lastPalette: -1, visible: true, phase: Math.random() * 10,
      };
      entries.add(entry);
      io = new IntersectionObserver(([obs]) => {
        if (entry) entry.visible = obs.isIntersecting;
      });
      io.observe(canvas);
      if (!raf) raf = requestAnimationFrame(loop);
    }).catch(() => { /* image failed: leave canvas blank */ });

    return () => {
      cancelled = true;
      io?.disconnect();
      if (entry) entries.delete(entry);
      if (!entries.size && raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    };
  }, [front, shiny, element]);

  const px = (size * SIZE) / 64;
  return (
    <canvas
      ref={ref}
      width={SIZE}
      height={SIZE}
      className={`px ${className ?? ''}`}
      style={{ width: px, height: px, margin: -(px - size) / 2 }}
    />
  );
}
