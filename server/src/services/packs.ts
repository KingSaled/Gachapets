/**
 * Pack generation and opening.
 *
 * Opening is one SQLite transaction: charge → roll → mint (respecting global
 * print runs) → discoveries → evolution lines → badges → feed. Either all of
 * it happens or none of it does.
 */
import type { Finish, PackResult, PulledCard, Rarity, Species } from '@gachapets/shared';
import {
  FINISHES, FINISH_INFO, PACK_PRICE, PACK_SLOTS, STAR_WEIGHT,
  type SlotKind, pullScore, quickSellValue, slotOdds,
} from '@gachapets/shared';
import { now } from '../clock.ts';
import { type Ctx, GameError, afterCommit, tx } from '../context.ts';
import { adjustCoins } from './wallet.ts';
import { bumpPacksOpened, hasRunLeft, recomputeValue, reserveMint } from './prints.ts';
import { evaluateBadges } from './badges.ts';
import { pushFeed } from './feed.ts';
import { checkLines } from './lines.ts';

export interface Roll {
  species: Species;
  finish: Finish;
  slot: SlotKind;
}

function rollFinish(rng: () => number, kind: SlotKind): Finish {
  let r = rng();
  for (const [finish, p] of slotOdds(kind)) {
    r -= p;
    if (r < 0) return finish;
  }
  return 'base';
}

function weightOf(s: Species) {
  return s.rarity === 'star' ? STAR_WEIGHT : 1;
}

function pickWeighted(rng: () => number, candidates: Species[]): Species | null {
  if (!candidates.length) return null;
  const total = candidates.reduce((sum, s) => sum + weightOf(s), 0);
  let r = rng() * total;
  for (const s of candidates) {
    r -= weightOf(s);
    if (r < 0) return s;
  }
  return candidates[candidates.length - 1];
}

function poolFor(ctx: Ctx, setId: string, kind: SlotKind): Species[] {
  const pool = ctx.catalog.pools.get(setId)!;
  const byKind: Record<SlotKind, Rarity[]> = { common: ['common'], uncommon: ['uncommon'], rare: ['rare', 'star'] };
  const list = byKind[kind].flatMap((r) => pool[r]);
  return list.length ? list : pool.common;
}

/**
 * Roll a full pack. No species repeats within a pack. If a serialized print
 * run for the rolled species is exhausted, another species in the same slot
 * pool with run left is chosen; if every run in the pool is gone the finish
 * steps down a tier. Scarcity is enforced, never faked.
 */
export function rollPack(ctx: Ctx, setId: string, rng: () => number = ctx.rng): Roll[] {
  const used = new Set<string>();
  const out: Roll[] = [];
  const luck = ctx.config.devLuck;
  const finishRng = luck ? () => 1 - rng() * (1 - luck) : rng;
  for (const kind of PACK_SLOTS) {
    const pool = poolFor(ctx, setId, kind).filter((s) => !used.has(s.id));
    let finish = rollFinish(finishRng, kind);
    let species = pickWeighted(rng, pool)!;
    while (!hasRunLeft(ctx, species.id, finish)) {
      const alt = pickWeighted(rng, pool.filter((s) => hasRunLeft(ctx, s.id, finish)));
      if (alt) {
        species = alt;
        break;
      }
      finish = FINISHES[FINISH_INFO[finish].rank - 1];
    }
    used.add(species.id);
    out.push({ species, finish, slot: kind });
  }
  return out;
}

/** The classic card trick: hits get tucked to the back so they're revealed last. */
export function trickOrder(cards: { rarity: Rarity; finish: Finish }[]): number[] {
  return cards
    .map((c, i) => ({ i, score: pullScore(c.rarity, c.finish) }))
    .sort((a, b) => a.score - b.score || a.i - b.i)
    .map((x) => x.i);
}

export function openPack(ctx: Ctx, userId: number, setId: string): PackResult {
  if (!ctx.catalog.sets.has(setId)) throw new GameError(404, 'unknown_set');
  if (!ctx.config.liveSets.includes(setId)) throw new GameError(400, 'set_not_live', 'That set has not been released yet.');

  return tx(ctx, () => {
    const t = now();
    adjustCoins(ctx, userId, -PACK_PRICE, 'pack', setId);
    const packId = Number(
      ctx.db.prepare('INSERT INTO packs (user_id, set_id, price, opened_at) VALUES (?, ?, ?, ?)').run(userId, setId, PACK_PRICE, t).lastInsertRowid,
    );
    afterCommit(ctx, () => bumpPacksOpened(ctx, setId));

    // Physical order: the pack is shuffled as it comes off the line.
    const rolls = rollPack(ctx, setId);
    for (let i = rolls.length - 1; i > 0; i--) {
      const j = Math.floor(ctx.rng() * (i + 1));
      [rolls[i], rolls[j]] = [rolls[j], rolls[i]];
    }

    const ownedBefore = new Set(
      (ctx.db
        .prepare(`SELECT DISTINCT species_id FROM cards WHERE owner_id = ? AND species_id IN (${rolls.map(() => '?').join(',')})`)
        .all(userId, ...rolls.map((r) => r.species.id)) as { species_id: string }[]).map((r) => r.species_id),
    );

    const insertCard = ctx.db.prepare(
      'INSERT INTO cards (species_id, finish, mint, owner_id, minted_by, minted_at, acquired_at, pack_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    );
    const cards: PulledCard[] = [];
    let best: { score: number; cardId: number } | null = null;

    for (const roll of rolls) {
      const mint = reserveMint(ctx, roll.species, roll.finish);
      const cardId = Number(insertCard.run(roll.species.id, roll.finish, mint, userId, userId, t, t, packId).lastInsertRowid);
      const discovered = ctx.db
        .prepare('INSERT OR IGNORE INTO discoveries (species_id, user_id, card_id, at) VALUES (?, ?, ?, ?)')
        .run(roll.species.id, userId, cardId, t).changes > 0;

      const printRun = FINISH_INFO[roll.finish].printRun;
      if (FINISH_INFO[roll.finish].broadcast) {
        pushFeed(ctx, 'pull', userId, { speciesId: roll.species.id, finish: roll.finish, mint, printRun, setId });
        if (printRun !== null && mint === printRun) pushFeed(ctx, 'sellout', userId, { speciesId: roll.species.id, finish: roll.finish, printRun });
      }
      if (discovered && (roll.species.rarity === 'star' || roll.species.rarity === 'rare')) {
        pushFeed(ctx, 'discovery', userId, { speciesId: roll.species.id, finish: roll.finish, setId });
      }

      const score = pullScore(roll.species.rarity, roll.finish);
      if (!best || score > best.score) best = { score, cardId };

      cards.push({
        id: cardId,
        speciesId: roll.species.id,
        finish: roll.finish,
        mint,
        printRun,
        mintedAt: t,
        ownerId: userId,
        listingId: null,
        isNewForPlayer: !ownedBefore.has(roll.species.id) && !cards.some((c) => c.speciesId === roll.species.id),
        isFirstDiscovery: discovered,
        quickSellValue: quickSellValue(roll.species.rarity, roll.finish),
        marketValue: 0,
      });
    }

    ctx.db.prepare('UPDATE users SET packs_opened = packs_opened + 1 WHERE id = ?').run(userId);
    if (best) {
      ctx.db.prepare('UPDATE users SET rarest_card_id = ?, rarest_score = ? WHERE id = ? AND rarest_score < ?').run(best.cardId, best.score, userId, best.score);
    }

    // Evolution lines completed by this pack.
    const { completed: completedLines, reward: rewardCoins } = checkLines(ctx, userId, rolls.map((r) => r.species.family));

    const newBadges = evaluateBadges(ctx, userId, {
      packs: true,
      pulled: rolls.map((r) => ({ species: r.species, finish: r.finish })),
      collection: true,
      sets: [setId],
    });

    for (const key of new Set(rolls.map((r) => `${r.species.id}|${r.finish}`))) {
      const [speciesId, finish] = key.split('|') as [string, Finish];
      recomputeValue(ctx, speciesId, finish);
    }
    for (const c of cards) {
      c.marketValue = (ctx.db.prepare('SELECT market_value v FROM prints WHERE species_id = ? AND finish = ?').get(c.speciesId, c.finish) as { v: number }).v;
    }

    const coins = (ctx.db.prepare('SELECT coins FROM users WHERE id = ?').get(userId) as { coins: number }).coins;
    return {
      packId,
      setId,
      cards,
      revealOrder: trickOrder(rolls.map((r) => ({ rarity: r.species.rarity, finish: r.finish }))),
      coins,
      newBadges,
      completedLines,
      rewardCoins,
    };
  });
}
