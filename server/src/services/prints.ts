/**
 * Printings (species × finish): mint counters, print-run caps and the market
 * value model.
 *
 * Market value = blend of
 *   • book value (rarity × finish reference),
 *   • circulation scarcity (copies alive vs. copies the pull rates predict),
 *   • demand (recent sales) and listing pressure (supply on the market),
 *   • the EMA of actual sale prices, weighted up as trade volume grows,
 *   • a pull toward the lowest ask,
 * floored at the house buyback so a card is never "worth" less than the
 * guaranteed quick-sell price.
 */
import type { Finish, PricePoint, Rarity, Species } from '@gachapets/shared';
import {
  FINISH_INFO, PACK_SLOTS, STAR_WEIGHT, quickSellValue, referenceValue, slotOdds,
} from '@gachapets/shared';
import { now, type DB } from '../db/index.ts';
import type { Ctx } from '../context.ts';

export interface PrintRow {
  species_id: string;
  finish: Finish;
  minted: number;
  burned: number;
  market_value: number;
  ema_price: number | null;
  sales_count: number;
  last_sale_price: number | null;
  last_sale_at: number | null;
  updated_at: number;
}

const DAY = 24 * 60 * 60 * 1000;

// ── Packs-opened counters per set (cached per DB) ─────────────────────────
const packCounts = new WeakMap<DB, Map<string, number>>();

export function packsOpenedForSet(ctx: Ctx, setId: string): number {
  let map = packCounts.get(ctx.db);
  if (!map) {
    map = new Map();
    const rows = ctx.db.prepare('SELECT set_id, COUNT(*) n FROM packs GROUP BY set_id').all() as { set_id: string; n: number }[];
    for (const r of rows) map.set(r.set_id, r.n);
    packCounts.set(ctx.db, map);
  }
  return map.get(setId) ?? 0;
}

export function bumpPacksOpened(ctx: Ctx, setId: string) {
  packsOpenedForSet(ctx, setId);
  const map = packCounts.get(ctx.db)!;
  map.set(setId, (map.get(setId) ?? 0) + 1);
}

// ── Print rows ─────────────────────────────────────────────────────────────
export function getPrint(ctx: Ctx, speciesId: string, finish: Finish): PrintRow | undefined {
  return ctx.db.prepare('SELECT * FROM prints WHERE species_id = ? AND finish = ?').get(speciesId, finish) as PrintRow | undefined;
}

export function mintedCount(ctx: Ctx, speciesId: string, finish: Finish): number {
  return getPrint(ctx, speciesId, finish)?.minted ?? 0;
}

export function hasRunLeft(ctx: Ctx, speciesId: string, finish: Finish): boolean {
  const cap = FINISH_INFO[finish].printRun;
  return cap === null || mintedCount(ctx, speciesId, finish) < cap;
}

/** Reserve the next mint number for a printing. Caller must be inside a transaction. */
export function reserveMint(ctx: Ctx, species: Species, finish: Finish): number {
  const t = now();
  const existing = getPrint(ctx, species.id, finish);
  if (!existing) {
    const value = referenceValue(species.rarity, finish);
    ctx.db
      .prepare('INSERT INTO prints (species_id, finish, minted, burned, market_value, updated_at) VALUES (?, ?, 1, 0, ?, ?)')
      .run(species.id, finish, value, t);
    ctx.db.prepare('INSERT INTO price_history (species_id, finish, at, value) VALUES (?, ?, ?, ?)').run(species.id, finish, t, value);
    return 1;
  }
  const cap = FINISH_INFO[finish].printRun;
  if (cap !== null && existing.minted >= cap) throw new Error(`print run exhausted for ${species.id}/${finish}`);
  const row = ctx.db
    .prepare('UPDATE prints SET minted = minted + 1, updated_at = ? WHERE species_id = ? AND finish = ? RETURNING minted')
    .get(t, species.id, finish) as { minted: number };
  return row.minted;
}

export function recordBurn(ctx: Ctx, speciesId: string, finish: Finish) {
  ctx.db.prepare('UPDATE prints SET burned = burned + 1, updated_at = ? WHERE species_id = ? AND finish = ?').run(now(), speciesId, finish);
}

// ── Value model ────────────────────────────────────────────────────────────
function slotWeight(ctx: Ctx, species: Species): number {
  const pool = ctx.catalog.pools.get(species.set)!;
  if (species.rarity === 'common') return 1 / pool.common.length;
  if (species.rarity === 'uncommon') return 1 / pool.uncommon.length;
  const total = pool.rare.length + pool.star.length * STAR_WEIGHT;
  return (species.rarity === 'star' ? STAR_WEIGHT : 1) / total;
}

function slotKindFor(rarity: Rarity) {
  return rarity === 'star' ? 'rare' : rarity;
}

/** How many copies of this printing the published odds predict by now. */
export function expectedMinted(ctx: Ctx, species: Species, finish: Finish): number {
  const kind = slotKindFor(species.rarity);
  const slots = PACK_SLOTS.filter((s) => s === kind).length;
  const pFinish = slotOdds(kind).find(([f]) => f === finish)![1];
  return packsOpenedForSet(ctx, species.set) * slots * slotWeight(ctx, species) * pFinish;
}

export interface ValueInputs {
  rarity: Rarity;
  finish: Finish;
  expected: number;
  circulating: number;
  sales7d: number;
  salesCount: number;
  emaPrice: number | null;
  lastSaleAt: number | null;
  activeListings: number;
  lowestAsk: number | null;
  at: number;
}

export function computeMarketValue(i: ValueInputs): number {
  const floor = quickSellValue(i.rarity, i.finish);
  const reference = referenceValue(i.rarity, i.finish);
  const scarcity = Math.min(2.5, Math.max(0.6, ((i.expected + 1) / (i.circulating + 1)) ** 0.35));
  const demand = 1 + 0.15 * Math.log1p(i.sales7d);
  const pressure = Math.max(0.7, 1 / (1 + 0.04 * i.activeListings));
  const model = reference * scarcity * demand * pressure;

  let value = model;
  if (i.emaPrice !== null && i.salesCount > 0) {
    let w = Math.min(0.8, i.salesCount / (i.salesCount + 3));
    if (i.lastSaleAt !== null && i.at - i.lastSaleAt > 14 * DAY) w *= 0.5;
    value = (1 - w) * model + w * i.emaPrice;
  }
  if (i.lowestAsk !== null && i.lowestAsk < value) value = 0.7 * value + 0.3 * i.lowestAsk;
  return Math.max(floor, Math.round(value));
}

export function recomputeValue(ctx: Ctx, speciesId: string, finish: Finish): number | null {
  const print = getPrint(ctx, speciesId, finish);
  const species = ctx.catalog.species.get(speciesId);
  if (!print || !species) return null;
  const t = now();
  const sales7d = (ctx.db
    .prepare('SELECT COUNT(*) n FROM sales WHERE species_id = ? AND finish = ? AND at > ?')
    .get(speciesId, finish, t - 7 * DAY) as { n: number }).n;
  const asks = ctx.db
    .prepare("SELECT COUNT(*) n, MIN(price) lo FROM listings WHERE species_id = ? AND finish = ? AND status = 'active'")
    .get(speciesId, finish) as { n: number; lo: number | null };
  const value = computeMarketValue({
    rarity: species.rarity,
    finish,
    expected: expectedMinted(ctx, species, finish),
    circulating: print.minted - print.burned,
    sales7d,
    salesCount: print.sales_count,
    emaPrice: print.ema_price,
    lastSaleAt: print.last_sale_at,
    activeListings: asks.n,
    lowestAsk: asks.lo,
    at: t,
  });
  if (value !== print.market_value) {
    ctx.db.prepare('UPDATE prints SET market_value = ?, updated_at = ? WHERE species_id = ? AND finish = ?').run(value, t, speciesId, finish);
    const moved = Math.abs(value - print.market_value) >= Math.max(1, print.market_value * 0.005);
    if (moved) ctx.db.prepare('INSERT INTO price_history (species_id, finish, at, value) VALUES (?, ?, ?, ?)').run(speciesId, finish, t, value);
  }
  return value;
}

/** Fold a completed sale into the print's trade EMA (clamped against wash trades). */
export function recordSaleForPrint(ctx: Ctx, speciesId: string, finish: Finish, price: number) {
  const print = getPrint(ctx, speciesId, finish);
  if (!print) return;
  const anchor = print.market_value;
  const clamped = Math.min(anchor * 4, Math.max(anchor * 0.25, price));
  const ema = print.ema_price === null ? clamped : print.ema_price * 0.65 + clamped * 0.35;
  ctx.db
    .prepare('UPDATE prints SET ema_price = ?, sales_count = sales_count + 1, last_sale_price = ?, last_sale_at = ?, updated_at = ? WHERE species_id = ? AND finish = ?')
    .run(ema, price, now(), now(), speciesId, finish);
}

export function marketValueOf(ctx: Ctx, speciesId: string, finish: Finish): number {
  const print = getPrint(ctx, speciesId, finish);
  if (print) return print.market_value;
  const species = ctx.catalog.species.get(speciesId);
  return species ? referenceValue(species.rarity, finish) : 0;
}

export function priceHistory(ctx: Ctx, speciesId: string, finish: Finish, sinceMs = 30 * DAY): PricePoint[] {
  const t = now();
  const rows = ctx.db
    .prepare('SELECT at, value FROM price_history WHERE species_id = ? AND finish = ? AND at > ? ORDER BY at')
    .all(speciesId, finish, t - sinceMs) as PricePoint[];
  // Carry in the last known value from before the window so charts start flat, not empty.
  const before = ctx.db
    .prepare('SELECT at, value FROM price_history WHERE species_id = ? AND finish = ? AND at <= ? ORDER BY at DESC LIMIT 1')
    .get(speciesId, finish, t - sinceMs) as PricePoint | undefined;
  if (before) rows.unshift({ at: t - sinceMs, value: before.value });
  return rows;
}

export function valueAt(ctx: Ctx, speciesId: string, finish: Finish, at: number): number | null {
  const row = ctx.db
    .prepare('SELECT value FROM price_history WHERE species_id = ? AND finish = ? AND at <= ? ORDER BY at DESC LIMIT 1')
    .get(speciesId, finish, at) as { value: number } | undefined;
  if (row) return row.value;
  const first = ctx.db
    .prepare('SELECT value FROM price_history WHERE species_id = ? AND finish = ? ORDER BY at LIMIT 1')
    .get(speciesId, finish) as { value: number } | undefined;
  return first?.value ?? null;
}

export function pctChange(from: number | null, to: number): number {
  if (!from) return 0;
  return Math.round(((to - from) / from) * 1000) / 10;
}

/** Periodic sweep so scarcity drift (more packs opened → more expected supply) shows up in prices. */
export function recomputeAll(ctx: Ctx): number {
  const rows = ctx.db.prepare('SELECT species_id, finish FROM prints').all() as { species_id: string; finish: Finish }[];
  let changed = 0;
  ctx.db.transaction(() => {
    for (const r of rows) {
      const before = getPrint(ctx, r.species_id, r.finish)!.market_value;
      const after = recomputeValue(ctx, r.species_id, r.finish);
      if (after !== null && after !== before) changed++;
    }
  })();
  return changed;
}
