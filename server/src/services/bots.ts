/**
 * Ambient NPC collectors.
 *
 * A small cast of bots opens packs, lists duplicates and snipes bargains so
 * a fresh server has a living market and feed. They play by exactly the same
 * rules as people — same odds, same print runs, same fees — so they cannot
 * inflate scarce tiers; they just compete for them. Disable with
 * SIMULATE_BOTS=0 (the default in production).
 */
import crypto from 'node:crypto';
import { FINISH_INFO, PACK_PRICE, quickSellValue } from '@gachapets/shared';
import type { Ctx } from '../context.ts';
import { GameError } from '../context.ts';
import { createUserRow, getUser } from './users.ts';
import { openPack } from './packs.ts';
import { quickSell } from './cards.ts';
import { buyListing, createListing } from './market.ts';
import { marketValueOf } from './prints.ts';
import { adjustCoins } from './wallet.ts';

const BOT_NAMES = [
  'PixelPip', 'FoilFox', 'MintCondition', 'CapsuleKid', 'HoloHarper', 'SleeveQueen', 'BinderBoss', 'RipItRiley',
  'GradeTen', 'PennyHoarder', 'ShinyHunterJo', 'CardboardCrush',
];

export function ensureBots(ctx: Ctx, count = 8): number[] {
  const ids: number[] = [];
  for (const name of BOT_NAMES.slice(0, count)) {
    const row = ctx.db.prepare('SELECT id FROM users WHERE username = ?').get(name) as { id: number } | undefined;
    if (row) {
      ids.push(row.id);
      continue;
    }
    // Bots can't log in: their hash is random garbage.
    const id = createUserRow(ctx, name, `bot$${crypto.randomBytes(16).toString('hex')}`, { bot: true, coins: 3000 });
    ctx.db.prepare("UPDATE users SET bio = 'NPC collector. Beep boop, nice pulls.' WHERE id = ?").run(id);
    ids.push(id);
  }
  return ids;
}

export function botTick(ctx: Ctx, botIds: number[], rng = Math.random) {
  if (!botIds.length) return;
  const botId = botIds[Math.floor(rng() * botIds.length)];
  const bot = getUser(ctx, botId);
  if (!bot) return;
  const roll = rng();
  try {
    if (bot.coins < PACK_PRICE * 2) {
      // stipend, like a daily claim
      adjustCoins(ctx, botId, 150, 'bot_stipend');
    }
    if (roll < 0.45 && bot.coins >= PACK_PRICE) {
      const live = ctx.config.liveSets;
      openPack(ctx, botId, live[Math.floor(rng() * live.length)]);
    } else if (roll < 0.75) {
      listSomething(ctx, botId, rng);
    } else if (roll < 0.9) {
      snipeBargain(ctx, botId, rng);
    } else {
      dumpBulk(ctx, botId);
    }
  } catch (err) {
    if (!(err instanceof GameError)) throw err;
  }
}

function listSomething(ctx: Ctx, botId: number, rng: () => number) {
  const cards = ctx.db
    .prepare(`SELECT c.id, c.species_id, c.finish FROM cards c
              WHERE c.owner_id = ? AND NOT EXISTS (SELECT 1 FROM listings l WHERE l.card_id = c.id AND l.status = 'active')
              ORDER BY RANDOM() LIMIT 1`)
    .all(botId) as { id: number; species_id: string; finish: keyof typeof FINISH_INFO }[];
  const card = cards[0];
  if (!card) return;
  const value = marketValueOf(ctx, card.species_id, card.finish);
  const markup = 0.85 + rng() * 0.6;
  createListing(ctx, botId, card.id, Math.max(1, Math.round(value * markup)));
}

function snipeBargain(ctx: Ctx, botId: number, rng: () => number) {
  const bot = getUser(ctx, botId)!;
  const deals = ctx.db
    .prepare(`SELECT l.id, l.price FROM listings l JOIN prints p ON p.species_id = l.species_id AND p.finish = l.finish
              WHERE l.status = 'active' AND l.seller_id != ? AND l.price <= p.market_value * ? AND l.price <= ?
              ORDER BY RANDOM() LIMIT 1`)
    .all(botId, 0.95 + rng() * 0.2, Math.floor(bot.coins * 0.4)) as { id: number }[];
  if (deals[0]) buyListing(ctx, botId, deals[0].id);
}

function dumpBulk(ctx: Ctx, botId: number) {
  const bulk = ctx.db
    .prepare(`SELECT c.id, c.species_id, c.finish FROM cards c
              WHERE c.owner_id = ? AND c.finish = 'base'
                AND NOT EXISTS (SELECT 1 FROM listings l WHERE l.card_id = c.id AND l.status = 'active')
                AND (SELECT COUNT(*) FROM cards c2 WHERE c2.owner_id = c.owner_id AND c2.species_id = c.species_id) > 1
              LIMIT 12`)
    .all(botId) as { id: number; species_id: string; finish: 'base' }[];
  const cheap = bulk.filter((c) => quickSellValue(ctx.catalog.species.get(c.species_id)!.rarity, c.finish) <= 2);
  if (cheap.length) quickSell(ctx, botId, cheap.map((c) => c.id));
}

export function startBots(ctx: Ctx, log: (msg: string) => void): () => void {
  const ids = ensureBots(ctx);
  log(`NPC collectors active: ${ids.length} bots, tick ${ctx.config.botTickMs}ms`);
  const timer = setInterval(() => botTick(ctx, ids), ctx.config.botTickMs);
  timer.unref();
  return () => clearInterval(timer);
}
