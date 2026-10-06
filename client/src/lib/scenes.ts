/**
 * Procedural pixel-art backdrops for card art windows.
 *
 * Each element has a palette + landscape recipe; a per-family seed varies the
 * terrain so no two cards share the exact same scene. Scenes are drawn on a
 * 48×36 pixel grid and emitted as crisp SVG data URLs, split into depth
 * layers (sky → far → mid → near) so Parallax cards can move them separately.
 */
import type { Element } from '@gachapets/shared';
import { seededRng, type Rng } from '@gachapets/shared';

export const SCENE_W = 48;
export const SCENE_H = 36;
const GROUND = 29;

type Feature = 'peaks' | 'hills' | 'waves' | 'dunes' | 'spires' | 'city' | 'clouds' | 'trees' | 'graves' | 'crystals' | 'pillars' | 'reeds' | 'volcano' | 'mushrooms';
type SkyObj = 'sun' | 'moon' | 'stars' | 'bolts' | 'rings' | 'aurora' | 'none';
type Motes = 'embers' | 'snow' | 'motes' | 'bubbles' | 'sparkles' | 'spores' | 'rain' | 'stars' | 'none';

interface Recipe {
  sky: [string, string, string, string];
  far: string;
  mid: string;
  near: string;
  detail: string;
  glow: string;
  farF: Feature;
  midF: Feature;
  obj: SkyObj;
  motes: Motes;
}

const R: Record<Element, Recipe> = {
  fire: { sky: ['#2a0a12', '#6e1520', '#c93a1c', '#ff8a2a'], far: '#4a1012', mid: '#2e0a0c', near: '#1a0507', detail: '#ffb03a', glow: '#ffdf6a', farF: 'peaks', midF: 'volcano', obj: 'sun', motes: 'embers' },
  water: { sky: ['#061a3a', '#0d3a7a', '#1f6fd1', '#6fc3ff'], far: '#174f9a', mid: '#0b2f6b', near: '#06204a', detail: '#bfe9ff', glow: '#e8f8ff', farF: 'clouds', midF: 'waves', obj: 'sun', motes: 'bubbles' },
  grass: { sky: ['#0d2a3a', '#1e6b6b', '#5fb58a', '#c8f0a0'], far: '#2a6a46', mid: '#164a2c', near: '#0a2a17', detail: '#9cff7a', glow: '#f4ffc0', farF: 'hills', midF: 'trees', obj: 'sun', motes: 'spores' },
  electric: { sky: ['#120a26', '#2a1650', '#4a2a7a', '#7a4aa8'], far: '#22134a', mid: '#170c36', near: '#0c0620', detail: '#ffe066', glow: '#fff6b0', farF: 'city', midF: 'spires', obj: 'bolts', motes: 'sparkles' },
  ice: { sky: ['#0a1a33', '#1d4a7a', '#5aa0d6', '#c8f0ff'], far: '#3a74a8', mid: '#5aa0cc', near: '#dff6ff', detail: '#ffffff', glow: '#ffffff', farF: 'peaks', midF: 'crystals', obj: 'moon', motes: 'snow' },
  fighting: { sky: ['#2a0c08', '#7a2a12', '#d4602a', '#ffc070'], far: '#6a2410', mid: '#3a1208', near: '#1e0a05', detail: '#ffd0a0', glow: '#fff0c0', farF: 'hills', midF: 'pillars', obj: 'sun', motes: 'none' },
  poison: { sky: ['#12061e', '#2e0f45', '#5a1f7a', '#8a3aa8'], far: '#2a0c40', mid: '#1e0830', near: '#12041c', detail: '#c6ff4d', glow: '#eaffa0', farF: 'mushrooms', midF: 'reeds', obj: 'moon', motes: 'bubbles' },
  ground: { sky: ['#2a1a0a', '#7a4a1a', '#d49a4a', '#ffd89a'], far: '#9a6a30', mid: '#6a4218', near: '#3a240c', detail: '#ffe0a0', glow: '#fff4d0', farF: 'dunes', midF: 'dunes', obj: 'sun', motes: 'none' },
  flying: { sky: ['#1a3a7a', '#3a7ad1', '#7ab8ff', '#d8ecff'], far: '#e8f2ff', mid: '#ffffff', near: '#cfe2ff', detail: '#ffffff', glow: '#fffbe0', farF: 'clouds', midF: 'clouds', obj: 'sun', motes: 'none' },
  psychic: { sky: ['#1e0820', '#4a1450', '#a02a7a', '#ff7ab8'], far: '#5a1a5a', mid: '#3a0f40', near: '#1a051c', detail: '#ffc0e0', glow: '#ffe0f0', farF: 'hills', midF: 'pillars', obj: 'rings', motes: 'sparkles' },
  bug: { sky: ['#0f200a', '#2a4a12', '#6a8a1a', '#c8e050'], far: '#2a4a12', mid: '#1c360a', near: '#0e1c06', detail: '#e0ff70', glow: '#f8ffc0', farF: 'trees', midF: 'reeds', obj: 'moon', motes: 'motes' },
  rock: { sky: ['#1a1410', '#3a2e22', '#7a644a', '#c8b08a'], far: '#5a4a36', mid: '#3a2e20', near: '#1e1810', detail: '#c8b08a', glow: '#f0e0c0', farF: 'peaks', midF: 'spires', obj: 'sun', motes: 'none' },
  ghost: { sky: ['#0a0614', '#1a1030', '#2e1e52', '#4a3478'], far: '#1c1236', mid: '#140c26', near: '#0a0612', detail: '#b8a0ff', glow: '#e8e0ff', farF: 'hills', midF: 'graves', obj: 'moon', motes: 'motes' },
  dragon: { sky: ['#0a0626', '#1e1260', '#3a22a8', '#7a5aff'], far: '#1e1062', mid: '#140a44', near: '#0a0420', detail: '#ffd23f', glow: '#fff0b0', farF: 'peaks', midF: 'spires', obj: 'aurora', motes: 'sparkles' },
  dark: { sky: ['#050408', '#0e0a14', '#1a1424', '#2a2036'], far: '#120e1a', mid: '#0a080e', near: '#050408', detail: '#ff4f8b', glow: '#ffe8f0', farF: 'city', midF: 'hills', obj: 'moon', motes: 'stars' },
  steel: { sky: ['#0e141c', '#22303e', '#4a6074', '#8aa0b4'], far: '#2a3a4a', mid: '#1a2430', near: '#0e141c', detail: '#c8dcef', glow: '#ffffff', farF: 'city', midF: 'pillars', obj: 'none', motes: 'rain' },
  fairy: { sky: ['#2a0e2a', '#6a2a6a', '#d46ab0', '#ffd0ec'], far: '#8a4a8a', mid: '#5a2a5a', near: '#3a183a', detail: '#ffffff', glow: '#ffffff', farF: 'hills', midF: 'mushrooms', obj: 'stars', motes: 'sparkles' },
  normal: { sky: ['#1a2a3a', '#3a6a8a', '#8ac0d8', '#f0e8c0'], far: '#5a8a6a', mid: '#3a6a40', near: '#2a4a2a', detail: '#f0f0a0', glow: '#fffbe0', farF: 'hills', midF: 'trees', obj: 'sun', motes: 'none' },
};

type Grid = (string | null)[][];

function grid(): Grid {
  return Array.from({ length: SCENE_H }, () => Array<string | null>(SCENE_W).fill(null));
}

function put(g: Grid, x: number, y: number, c: string) {
  x = Math.round(x);
  y = Math.round(y);
  if (x >= 0 && x < SCENE_W && y >= 0 && y < SCENE_H) g[y][x] = c;
}

function fillCol(g: Grid, x: number, top: number, bottom: number, c: string) {
  for (let y = Math.max(0, Math.round(top)); y <= Math.min(SCENE_H - 1, bottom); y++) put(g, x, y, c);
}

function disc(g: Grid, cx: number, cy: number, r: number, c: string) {
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * 0.6) put(g, cx + x, cy + y, c);
}

function ring(g: Grid, cx: number, cy: number, r: number, c: string) {
  for (let a = 0; a < Math.PI * 2; a += 0.5 / r) put(g, cx + Math.cos(a) * r, cy + Math.sin(a) * r, c);
}

/** Smooth 1-D value noise in [0,1]. */
function noise1(rng: Rng, period: number): (x: number) => number {
  const pts = Array.from({ length: Math.ceil(SCENE_W / period) + 2 }, () => rng());
  return (x) => {
    const i = Math.floor(x / period);
    const t = x / period - i;
    const s = t * t * (3 - 2 * t);
    return pts[i] * (1 - s) + pts[i + 1] * s;
  };
}

function drawFeature(g: Grid, f: Feature, rng: Rng, color: string, accent: string, depth: 'far' | 'mid') {
  const base = depth === 'far' ? GROUND - 6 : GROUND;
  const amp = depth === 'far' ? 10 : 7;
  switch (f) {
    case 'peaks': {
      const peaks = Array.from({ length: 3 + Math.floor(rng() * 3) }, () => ({ x: rng() * SCENE_W, h: amp * (0.6 + rng() * 0.8) }));
      for (let x = 0; x < SCENE_W; x++) {
        const h = Math.max(1, ...peaks.map((p) => p.h - Math.abs(x - p.x) * (0.9 + (depth === 'far' ? 0.1 : 0.4))));
        fillCol(g, x, base - h, SCENE_H - 1, color);
        if (depth === 'far' && h > amp * 0.75) put(g, x, base - h, accent); // snowcaps / highlights
      }
      break;
    }
    case 'hills':
    case 'dunes': {
      const n = noise1(rng, f === 'dunes' ? 9 : 12);
      for (let x = 0; x < SCENE_W; x++) {
        const h = n(x) * amp * (f === 'dunes' ? 0.7 : 1) + 2;
        fillCol(g, x, base - h, SCENE_H - 1, color);
        if (f === 'dunes' && x % 7 === Math.floor(rng() * 3)) put(g, x, base - h + 2, accent);
      }
      break;
    }
    case 'volcano': {
      const cx = 14 + rng() * 20;
      for (let x = 0; x < SCENE_W; x++) {
        const d = Math.abs(x - cx);
        const h = Math.max(2, 14 - d * 0.8);
        const crater = d < 2.5 ? 1.5 : 0;
        fillCol(g, x, base - h + crater, SCENE_H - 1, color);
      }
      for (let i = 0; i < 6; i++) put(g, cx - 2 + rng() * 4, base - 13 + rng() * 2, accent);
      for (let y = 0; y < 6; y++) put(g, cx + (rng() - 0.5) * (y + 1), base - 12 + y * 1.6, accent); // lava trickle
      break;
    }
    case 'waves': {
      for (let x = 0; x < SCENE_W; x++) fillCol(g, x, base - 6, SCENE_H - 1, color);
      for (let row = 0; row < 4; row++) {
        const y = base - 6 + row * 2 + 1;
        const off = Math.floor(rng() * 6);
        for (let x = 0; x < SCENE_W; x++) if ((x + off + row * 3) % 6 < 3) put(g, x, y - ((x + off) % 6 === 1 ? 1 : 0), accent);
      }
      break;
    }
    case 'clouds': {
      const count = depth === 'far' ? 4 : 3;
      for (let i = 0; i < count; i++) {
        const cx = rng() * SCENE_W;
        const cy = depth === 'far' ? 8 + rng() * 10 : base - 2 + rng() * 3;
        const w = 4 + Math.floor(rng() * 4);
        for (let k = 0; k < 4; k++) disc(g, cx + (k - 1.5) * w * 0.6, cy - (k % 2) * 1.5, Math.max(2, Math.round(w * 0.45)), color);
      }
      if (depth === 'mid') for (let x = 0; x < SCENE_W; x++) fillCol(g, x, base + 1, SCENE_H - 1, color);
      break;
    }
    case 'spires': {
      for (let i = 0; i < 7; i++) {
        const x = Math.floor(rng() * SCENE_W);
        const h = 5 + rng() * (amp + 6);
        const w = 1 + Math.floor(rng() * 2);
        for (let dx = 0; dx < w; dx++) fillCol(g, x + dx, base - h, SCENE_H - 1, color);
        put(g, x, base - h - 1, color);
        if (rng() < 0.5) put(g, x, base - h + 2, accent);
      }
      for (let x = 0; x < SCENE_W; x++) fillCol(g, x, base - 1, SCENE_H - 1, color);
      break;
    }
    case 'city': {
      let x = 0;
      while (x < SCENE_W) {
        const w = 3 + Math.floor(rng() * 4);
        const h = 4 + Math.floor(rng() * (amp + 4));
        for (let dx = 0; dx < w; dx++) fillCol(g, x + dx, base - h, SCENE_H - 1, color);
        for (let wy = base - h + 2; wy < base - 1; wy += 2) for (let wx = x + 1; wx < x + w - 1; wx += 2) if (rng() < 0.35) put(g, wx, wy, accent);
        x += w + (rng() < 0.3 ? 1 : 0);
      }
      break;
    }
    case 'trees': {
      for (let x = 0; x < SCENE_W; x++) fillCol(g, x, base - 1, SCENE_H - 1, color);
      for (let i = 0; i < 9; i++) {
        const tx = Math.floor(rng() * SCENE_W);
        const h = 5 + Math.floor(rng() * 6);
        for (let y = 0; y < h; y++) {
          const half = Math.floor((y / h) * 3);
          for (let dx = -half; dx <= half; dx++) put(g, tx + dx, base - h + y, color);
        }
        put(g, tx, base - h - 1, color);
      }
      break;
    }
    case 'graves': {
      for (let x = 0; x < SCENE_W; x++) fillCol(g, x, base - 1, SCENE_H - 1, color);
      for (let i = 0; i < 5; i++) {
        const gx = 2 + Math.floor(rng() * (SCENE_W - 6));
        const cross = rng() < 0.35;
        if (cross) {
          fillCol(g, gx + 1, base - 6, base, color);
          put(g, gx, base - 4, color);
          put(g, gx + 2, base - 4, color);
        } else {
          for (let dx = 0; dx < 3; dx++) fillCol(g, gx + dx, base - 4, base, color);
          put(g, gx + 1, base - 5, color);
        }
      }
      break;
    }
    case 'crystals': {
      for (let x = 0; x < SCENE_W; x++) fillCol(g, x, base, SCENE_H - 1, color);
      for (let i = 0; i < 6; i++) {
        const cx = Math.floor(rng() * SCENE_W);
        const h = 4 + Math.floor(rng() * 7);
        for (let y = 0; y < h; y++) {
          const half = y < 2 ? 0 : 1;
          for (let dx = -half; dx <= half; dx++) put(g, cx + dx, base - h + y, dx === -half && half ? accent : color);
        }
      }
      break;
    }
    case 'pillars': {
      for (let x = 0; x < SCENE_W; x++) fillCol(g, x, base - 1, SCENE_H - 1, color);
      const gap = 9 + Math.floor(rng() * 5);
      for (let x = 2 + Math.floor(rng() * 4); x < SCENE_W; x += gap) {
        const h = 8 + Math.floor(rng() * 6);
        fillCol(g, x, base - h, base, color);
        fillCol(g, x + 1, base - h, base, color);
        for (let dx = -1; dx <= 2; dx++) put(g, x + dx, base - h, color);
        if (rng() < 0.5) for (let dx = 0; dx < gap; dx++) put(g, x + dx, base - h + 1, color); // lintel
      }
      break;
    }
    case 'reeds': {
      for (let x = 0; x < SCENE_W; x++) fillCol(g, x, base, SCENE_H - 1, color);
      for (let x = 0; x < SCENE_W; x++) {
        if (rng() < 0.45) {
          const h = 3 + Math.floor(rng() * 7);
          fillCol(g, x, base - h, base, color);
          if (rng() < 0.3) put(g, x, base - h - 1, accent);
        }
      }
      break;
    }
    case 'mushrooms': {
      for (let x = 0; x < SCENE_W; x++) fillCol(g, x, base - 1, SCENE_H - 1, color);
      for (let i = 0; i < 5; i++) {
        const mx = Math.floor(rng() * SCENE_W);
        const h = 4 + Math.floor(rng() * 8);
        const r = 2 + Math.floor(rng() * 3);
        fillCol(g, mx, base - h, base, color);
        for (let dx = -r; dx <= r; dx++) put(g, mx + dx, base - h, color);
        for (let dx = -r + 1; dx <= r - 1; dx++) put(g, mx + dx, base - h - 1, color);
        put(g, mx - 1, base - h - 1, accent);
      }
      break;
    }
  }
}

function drawSky(g: Grid, r: Recipe, rng: Rng) {
  const bands = r.sky;
  const bandH = SCENE_H / bands.length;
  for (let y = 0; y < SCENE_H; y++) {
    const b = Math.min(bands.length - 1, Math.floor(y / bandH));
    const t = y / bandH - b;
    for (let x = 0; x < SCENE_W; x++) {
      // ordered dither across the last third of each band
      const next = bands[Math.min(bands.length - 1, b + 1)];
      const dither = t > 0.66 && (x + y) % 2 === 0 ? next : t > 0.83 && (x + y) % 2 === 1 ? next : bands[b];
      g[y][x] = dither;
    }
  }
  switch (r.obj) {
    case 'sun': {
      const cx = 8 + rng() * 32;
      const cy = 9 + rng() * 6;
      disc(g, cx, cy, 6, r.sky[3]);
      disc(g, cx, cy, 4, r.glow);
      break;
    }
    case 'moon': {
      const cx = 8 + rng() * 32;
      const cy = 7 + rng() * 4;
      disc(g, cx, cy, 4, r.glow);
      disc(g, cx + 2, cy - 1, 3, r.sky[0]);
      break;
    }
    case 'rings': {
      const cx = 24;
      const cy = 14;
      for (const rr of [4, 7, 10, 13]) ring(g, cx, cy, rr, rr % 2 ? r.detail : r.sky[3]);
      break;
    }
    case 'bolts': {
      for (let b = 0; b < 2; b++) {
        let x = 6 + rng() * 36;
        for (let y = 0; y < 16; y++) {
          put(g, x, y, r.detail);
          if (y % 3 === 2) x += rng() < 0.5 ? -2 : 2;
        }
      }
      break;
    }
    case 'aurora': {
      const n = noise1(rng, 10);
      for (let x = 0; x < SCENE_W; x++) {
        const y = 4 + n(x) * 8;
        for (let k = 0; k < 4; k++) if ((x + k) % 2 === 0) put(g, x, y + k, k < 2 ? r.detail : r.sky[3]);
      }
      break;
    }
    case 'stars':
      break;
    case 'none':
      break;
  }
  const starCount = r.obj === 'stars' || r.obj === 'moon' || r.obj === 'aurora' || r.motes === 'stars' ? 22 : 6;
  for (let i = 0; i < starCount; i++) {
    const x = Math.floor(rng() * SCENE_W);
    const y = Math.floor(rng() * SCENE_H * 0.5);
    if (g[y][x] === r.sky[0] || g[y][x] === r.sky[1]) put(g, x, y, i % 5 === 0 ? r.glow : r.detail);
  }
}

function drawNear(g: Grid, r: Recipe, rng: Rng) {
  for (let x = 0; x < SCENE_W; x++) fillCol(g, x, GROUND + 2, SCENE_H - 1, r.near);
  for (let x = 0; x < SCENE_W; x++) {
    if (rng() < 0.25) put(g, x, GROUND + 1, r.near);
    if (rng() < 0.12) put(g, x, GROUND + 3 + Math.floor(rng() * 3), r.detail);
  }
  const counts: Record<Motes, number> = { embers: 14, snow: 22, motes: 10, bubbles: 7, sparkles: 9, spores: 12, rain: 26, stars: 0, none: 0 };
  const n = counts[r.motes] ?? 0;
  for (let i = 0; i < n; i++) {
    const x = rng() * SCENE_W;
    const y = rng() * (GROUND - 2);
    switch (r.motes) {
      case 'bubbles':
        ring(g, x, y, 1, r.detail);
        break;
      case 'sparkles':
        put(g, x, y, r.detail);
        put(g, x - 1, y, r.glow);
        put(g, x + 1, y, r.glow);
        put(g, x, y - 1, r.glow);
        put(g, x, y + 1, r.glow);
        break;
      case 'rain':
        put(g, x, y, r.detail);
        put(g, x - 1, y + 1, r.detail);
        break;
      default:
        put(g, x, y, i % 3 === 0 ? r.glow : r.detail);
    }
  }
}

function toSvg(g: Grid): string {
  const rects: string[] = [];
  for (let y = 0; y < SCENE_H; y++) {
    let x = 0;
    while (x < SCENE_W) {
      const c = g[y][x];
      if (!c) {
        x++;
        continue;
      }
      let x2 = x + 1;
      while (x2 < SCENE_W && g[y][x2] === c) x2++;
      rects.push(`<rect x="${x}" y="${y}" width="${x2 - x}" height="1" fill="${c}"/>`);
      x = x2;
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SCENE_W} ${SCENE_H}" preserveAspectRatio="xMidYMid slice" shape-rendering="crispEdges">${rects.join('')}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

export interface SceneLayers {
  sky: string;
  far: string;
  mid: string;
  near: string;
}

const cache = new Map<string, SceneLayers>();

export function sceneLayers(element: Element, seed: string): SceneLayers {
  const key = `${element}:${seed}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const r = R[element] ?? R.normal;
  const rng = seededRng(`scene:${key}`);
  const sky = grid();
  drawSky(sky, r, rng);
  const far = grid();
  drawFeature(far, r.farF, rng, r.far, r.glow, 'far');
  const mid = grid();
  drawFeature(mid, r.midF, rng, r.mid, r.detail, 'mid');
  const near = grid();
  drawNear(near, r, rng);
  const layers = { sky: toSvg(sky), far: toSvg(far), mid: toSvg(mid), near: toSvg(near) };
  cache.set(key, layers);
  return layers;
}

/** The art-window glow color for an element (used behind sprites). */
export function sceneGlow(element: Element): string {
  return (R[element] ?? R.normal).glow;
}
