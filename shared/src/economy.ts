import type { Finish, Rarity } from './types.ts';
import { FINISHES } from './types.ts';

/**
 * ─── ECONOMY TUNING ─────────────────────────────────────────────────────────
 * Everything that decides how rare a card feels and what it is worth lives
 * here so balance changes are a one-file diff (and `npm run odds` prints the
 * resulting per-pack odds and expected values).
 */

export const STARTING_COINS = 1000;
export const PACK_PRICE = 100;
export const CARDS_PER_PACK = 7;

/** Market seller fee, taken from the sale price. Acts as a coin sink. */
export const MARKET_FEE_RATE = 0.05;
export const MIN_LISTING_PRICE = 1;
export const MAX_LISTING_PRICE = 10_000_000;
export const MAX_ACTIVE_LISTINGS = 60;

/** Daily bonus: base + per-streak-day bump, streak capped. */
export const DAILY_BASE = 120;
export const DAILY_STREAK_STEP = 20;
export const DAILY_STREAK_CAP = 6;
export const DAILY_COOLDOWN_MS = 20 * 60 * 60 * 1000; // 20h, so a daily habit never drifts
export const DAILY_STREAK_WINDOW_MS = 48 * 60 * 60 * 1000;

/** Coins for completing an evolution line (all stages) for the first time. */
export const LINE_COMPLETE_REWARD = 25;

export const SHOWCASE_SLOTS = 5;

export interface FinishInfo {
  id: Finish;
  rank: number;
  label: string;
  short: string;
  /** Multiplier applied to the rarity's base value. */
  valueMult: number;
  /** Global print run per species for serialized finishes. */
  printRun: number | null;
  /** Broadcast to the live feed when pulled. */
  broadcast: boolean;
  blurb: string;
}

export const FINISH_INFO: Record<Finish, FinishInfo> = {
  base: {
    id: 'base', rank: 0, label: 'Standard', short: 'STD', valueMult: 1, printRun: null, broadcast: false,
    blurb: 'The everyday print. Every species starts its story here.',
  },
  shiny: {
    id: 'shiny', rank: 1, label: 'Shiny', short: 'SHN', valueMult: 3, printRun: null, broadcast: false,
    blurb: 'Alternate-palette print with a pearlescent frame.',
  },
  holo: {
    id: 'holo', rank: 2, label: 'Holofoil', short: 'HOLO', valueMult: 6, printRun: null, broadcast: false,
    blurb: 'Prismatic rainbow foil across the art window.',
  },
  parallax: {
    id: 'parallax', rank: 3, label: 'Parallax', short: 'PRLX', valueMult: 15, printRun: null, broadcast: true,
    blurb: 'Layered lenticular print — the scene has real depth when tilted.',
  },
  pop3d: {
    id: 'pop3d', rank: 4, label: '3D Pop', short: '3D', valueMult: 50, printRun: 50, broadcast: true,
    blurb: 'Voxel-pressed creature that breaks out of the frame. Serialized, 50 per species.',
  },
  living: {
    id: 'living', rank: 5, label: 'Living Foil', short: 'LIVE', valueMult: 150, printRun: 10, broadcast: true,
    blurb: 'Animated edition. The creature breathes inside the card. Serialized, 10 per species.',
  },
  misprint: {
    id: 'misprint', rank: 6, label: 'Factory Misprint', short: 'ERR', valueMult: 600, printRun: 1, broadcast: true,
    blurb: 'A press error printed the creature from behind. Exactly one exists per species.',
  },
};

export interface RarityInfo {
  id: Rarity;
  rank: number;
  label: string;
  glyph: string;
  baseValue: number;
}

export const RARITY_INFO: Record<Rarity, RarityInfo> = {
  common: { id: 'common', rank: 0, label: 'Common', glyph: '●', baseValue: 1 },
  uncommon: { id: 'uncommon', rank: 1, label: 'Uncommon', glyph: '◆', baseValue: 2 },
  rare: { id: 'rare', rank: 2, label: 'Rare', glyph: '★', baseValue: 6 },
  star: { id: 'star', rank: 3, label: 'Star Rare', glyph: '✦', baseValue: 14 },
};

/** Slot layout of every pack, in physical order. */
export type SlotKind = 'common' | 'uncommon' | 'rare';
export const PACK_SLOTS: SlotKind[] = ['common', 'common', 'common', 'common', 'uncommon', 'uncommon', 'rare'];

/**
 * Finish odds per slot. `base` is whatever probability is left over.
 * Per pack this works out to roughly: Shiny 1 in 2.7, Holo 1 in 3.2,
 * Parallax 1 in 12, 3D 1 in 50, Living 1 in 204, Misprint 1 in ~1,060.
 * House buyback EV is ~43% of the pack price: the market, not the house, is
 * where hits realise their real value.
 */
export const SLOT_FINISH_ODDS: Record<SlotKind, Partial<Record<Finish, number>>> = {
  common: { shiny: 0.04, holo: 0.016, parallax: 0.0032, pop3d: 0.0006, living: 0.00015, misprint: 0.00003 },
  uncommon: { shiny: 0.07, holo: 0.03, parallax: 0.0055, pop3d: 0.0012, living: 0.00025, misprint: 0.00006 },
  rare: { shiny: 0.14, holo: 0.22, parallax: 0.06, pop3d: 0.0155, living: 0.0038, misprint: 0.0007 },
};

/** Within the rare slot, a Star Rare species is this much less likely than a regular rare. */
export const STAR_WEIGHT = 0.35;

export function slotOdds(kind: SlotKind): [Finish, number][] {
  const table = SLOT_FINISH_ODDS[kind];
  let rest = 1;
  const out: [Finish, number][] = [];
  for (const f of FINISHES) {
    if (f === 'base') continue;
    const p = table[f] ?? 0;
    rest -= p;
    out.push([f, p]);
  }
  out.unshift(['base', rest]);
  return out;
}

/** House buyback price — the guaranteed floor value of any card. */
export function quickSellValue(rarity: Rarity, finish: Finish): number {
  return RARITY_INFO[rarity].baseValue * FINISH_INFO[finish].valueMult;
}

/** "Book value": the anchor a print's market value starts from before any trades. */
export const REFERENCE_MULT = 2.5;
export function referenceValue(rarity: Rarity, finish: Finish): number {
  return Math.round(quickSellValue(rarity, finish) * REFERENCE_MULT);
}

export function marketFee(price: number): number {
  return Math.max(1, Math.floor(price * MARKET_FEE_RATE));
}

export function dailyAmount(streak: number): number {
  return DAILY_BASE + DAILY_STREAK_STEP * Math.min(streak, DAILY_STREAK_CAP);
}

export function finishRank(f: Finish): number {
  return FINISH_INFO[f].rank;
}

export function isSerialized(f: Finish): boolean {
  return FINISH_INFO[f].printRun !== null;
}

/** Sort score used for the card trick and "rarest pull" — higher is rarer. */
export function pullScore(rarity: Rarity, finish: Finish): number {
  return FINISH_INFO[finish].rank * 10 + RARITY_INFO[rarity].rank;
}
