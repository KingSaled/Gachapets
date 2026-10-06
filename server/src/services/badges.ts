import type { BadgeDef, Finish, Species } from '@gachapets/shared';
import { ELEMENTS, TYPE_BADGE_THRESHOLD, allBadges } from '@gachapets/shared';
import { now } from '../clock.ts';
import type { Ctx } from '../context.ts';
import { adjustCoins } from './wallet.ts';
import { ownedSpeciesIds } from './cards.ts';
import { pushFeed } from './feed.ts';

const defsCache = new WeakMap<object, Map<string, BadgeDef>>();

export function badgeDefs(ctx: Ctx): Map<string, BadgeDef> {
  let map = defsCache.get(ctx.catalog);
  if (!map) {
    map = new Map(allBadges(ctx.catalog.raw.sets).map((b) => [b.id, b]));
    defsCache.set(ctx.catalog, map);
  }
  return map;
}

export function earnedBadges(ctx: Ctx, userId: number): { id: string; earnedAt: number }[] {
  return (ctx.db.prepare('SELECT badge_id id, earned_at earnedAt FROM user_badges WHERE user_id = ? ORDER BY earned_at').all(userId)) as {
    id: string; earnedAt: number;
  }[];
}

export interface BadgeTrigger {
  packs?: boolean;
  pulled?: { species: Species; finish: Finish }[];
  collection?: boolean;
  /** Sets whose completion may have changed. */
  sets?: string[];
  sold?: { price: number };
  bought?: boolean;
}

/** Check every badge the trigger could affect; award (and pay out) the new ones. Run inside a transaction. */
export function evaluateBadges(ctx: Ctx, userId: number, trigger: BadgeTrigger): string[] {
  const defs = badgeDefs(ctx);
  const have = new Set(earnedBadges(ctx, userId).map((b) => b.id));
  const earned: string[] = [];
  const award = (id: string) => {
    if (have.has(id) || !defs.has(id)) return;
    have.add(id);
    earned.push(id);
  };

  if (trigger.packs) {
    const { packs_opened: n } = ctx.db.prepare('SELECT packs_opened FROM users WHERE id = ?').get(userId) as { packs_opened: number };
    for (const k of [1, 10, 50, 100, 500, 1000]) if (n >= k) award(`packs_${k}`);
  }

  if (trigger.pulled) {
    for (const { species, finish } of trigger.pulled) {
      if (finish !== 'base') award(`pull_${finish}`);
      if (species.rarity === 'star') award('pull_star');
    }
  }

  if (trigger.collection) {
    const lines = (ctx.db.prepare('SELECT COUNT(*) n FROM user_lines WHERE user_id = ?').get(userId) as { n: number }).n;
    for (const k of [1, 10, 50, 200]) if (lines >= k) award(`lines_${k}`);
    const disc = (ctx.db.prepare('SELECT COUNT(*) n FROM discoveries WHERE user_id = ?').get(userId) as { n: number }).n;
    for (const k of [1, 25, 100]) if (disc >= k) award(`disc_${k}`);

    const owned = ownedSpeciesIds(ctx, userId);
    for (const k of [50, 250, 1000]) if (owned.size >= k) award(`species_${k}`);
    const typeCounts = new Map<string, number>();
    for (const id of owned) {
      const s = ctx.catalog.species.get(id);
      if (!s) continue;
      for (const t of s.types) typeCounts.set(t, (typeCounts.get(t) ?? 0) + 1);
    }
    for (const el of ELEMENTS) if ((typeCounts.get(el) ?? 0) >= TYPE_BADGE_THRESHOLD) award(`type_${el}`);

    if (trigger.sets?.length) {
      const nonBase = ownedSpeciesIds(ctx, userId, { nonBase: true });
      for (const setId of trigger.sets) {
        const pool = ctx.catalog.pools.get(setId);
        if (!pool) continue;
        const all = [...pool.common, ...pool.uncommon, ...pool.rare, ...pool.star];
        if (pool.common.every((s) => owned.has(s.id))) award(`set_${setId}_common`);
        if (pool.uncommon.length && pool.uncommon.every((s) => owned.has(s.id))) award(`set_${setId}_uncommon`);
        if ([...pool.rare, ...pool.star].every((s) => owned.has(s.id))) award(`set_${setId}_rare`);
        if (all.every((s) => owned.has(s.id))) award(`set_${setId}_full`);
        if (all.every((s) => nonBase.has(s.id))) award(`set_${setId}_shiny`);
      }
    }
  }

  if (trigger.sold) {
    const sales = (ctx.db.prepare('SELECT COUNT(*) n FROM sales WHERE seller_id = ?').get(userId) as { n: number }).n;
    if (sales >= 1) award('trade_first_sale');
    if (sales >= 10) award('trade_10_sales');
    if (sales >= 100) award('trade_100_sales');
    if (trigger.sold.price >= 5000) award('trade_whale');
  }
  if (trigger.bought) award('trade_first_buy');

  const t = now();
  for (const id of earned) {
    const def = defs.get(id)!;
    ctx.db.prepare('INSERT INTO user_badges (user_id, badge_id, earned_at) VALUES (?, ?, ?)').run(userId, id, t);
    // First title a player ever unlocks is equipped for them; later ones they choose.
    if (def.title) ctx.db.prepare('UPDATE users SET title = ? WHERE id = ? AND title IS NULL').run(def.title, userId);
    if (def.reward > 0) adjustCoins(ctx, userId, def.reward, 'badge', id);
    if (def.tier === 'gold' || def.tier === 'prism') pushFeed(ctx, 'badge', userId, { badge: id });
  }
  return earned;
}
