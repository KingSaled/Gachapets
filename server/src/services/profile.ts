import type { CardDTO, Finish, LeaderboardRow, ProfileDTO } from '@gachapets/shared';
import { COSMETICS, DEFAULT_TITLES, FINISHES, SHOWCASE_SLOTS, cosmeticById } from '@gachapets/shared';
import { now } from '../clock.ts';
import { type Ctx, GameError, tx } from '../context.ts';
import { adjustCoins } from './wallet.ts';
import { badgeDefs, earnedBadges } from './badges.ts';
import { type CardRow, getCard, toCardDTO } from './cards.ts';
import { getUser, getUserByName, ownedCosmeticIds, toPublicUser } from './users.ts';

export function portfolioValue(ctx: Ctx, userId: number): number {
  return (ctx.db
    .prepare('SELECT COALESCE(SUM(p.market_value), 0) v FROM cards c JOIN prints p ON p.species_id = c.species_id AND p.finish = c.finish WHERE c.owner_id = ?')
    .get(userId) as { v: number }).v;
}

export function getProfile(ctx: Ctx, username: string): ProfileDTO {
  const u = getUserByName(ctx, username);
  if (!u) throw new GameError(404, 'user_not_found', 'No collector by that name.');
  const portfolio = portfolioValue(ctx, u.id);
  const counts = ctx.db
    .prepare('SELECT COUNT(*) cards, COUNT(DISTINCT species_id) species FROM cards WHERE owner_id = ?')
    .get(u.id) as { cards: number; species: number };
  const lines = (ctx.db.prepare('SELECT COUNT(*) n FROM user_lines WHERE user_id = ?').get(u.id) as { n: number }).n;
  const discoveries = (ctx.db.prepare('SELECT COUNT(*) n FROM discoveries WHERE user_id = ?').get(u.id) as { n: number }).n;
  const sales = (ctx.db.prepare('SELECT COUNT(*) n FROM sales WHERE seller_id = ?').get(u.id) as { n: number }).n;

  const showcaseRows = ctx.db.prepare('SELECT slot, card_id FROM showcase WHERE user_id = ?').all(u.id) as { slot: number; card_id: number }[];
  const showcase: (CardDTO | null)[] = Array.from({ length: SHOWCASE_SLOTS }, () => null);
  for (const r of showcaseRows) {
    const card = getCard(ctx, r.card_id);
    if (card && card.owner_id === u.id && r.slot < SHOWCASE_SLOTS) showcase[r.slot] = toCardDTO(card);
  }

  const rarest = u.rarest_card_id ? getCard(ctx, u.rarest_card_id) : undefined;

  const perSet = ctx.db
    .prepare('SELECT species_id FROM cards WHERE owner_id = ? GROUP BY species_id')
    .all(u.id) as { species_id: string }[];
  const setCounts = new Map<string, number>();
  for (const r of perSet) {
    const s = ctx.catalog.species.get(r.species_id);
    if (s) setCounts.set(s.set, (setCounts.get(s.set) ?? 0) + 1);
  }

  return {
    user: { ...toPublicUser(u), banner: u.banner, bio: u.bio, createdAt: u.created_at },
    stats: {
      coins: u.coins,
      portfolioValue: portfolio,
      netWorth: u.coins + portfolio,
      packsOpened: u.packs_opened,
      cardsOwned: counts.cards,
      speciesOwned: counts.species,
      linesCompleted: lines,
      discoveries,
      salesCount: sales,
    },
    rarestPull: rarest ? toCardDTO(rarest) : null,
    showcase,
    badges: earnedBadges(ctx, u.id),
    setProgress: ctx.catalog.raw.sets
      .filter((s) => setCounts.has(s.id) || ctx.config.liveSets.includes(s.id))
      .map((s) => ({ setId: s.id, owned: setCounts.get(s.id) ?? 0, total: s.size })),
  };
}

export interface ProfileUpdate {
  title?: string | null;
  theme?: string;
  banner?: string;
  bio?: string;
  avatar?: { speciesId: string; finish: Finish } | null;
}

export function availableTitles(ctx: Ctx, userId: number): string[] {
  const defs = badgeDefs(ctx);
  const fromBadges = earnedBadges(ctx, userId).map((b) => defs.get(b.id)?.title).filter((t): t is string => !!t);
  return [...DEFAULT_TITLES, ...fromBadges];
}

export function updateProfile(ctx: Ctx, userId: number, patch: ProfileUpdate) {
  return tx(ctx, () => {
    const owned = new Set(ownedCosmeticIds(ctx, userId));
    if (patch.title !== undefined) {
      if (patch.title !== null && !availableTitles(ctx, userId).includes(patch.title)) throw new GameError(403, 'title_locked', 'You have not unlocked that title.');
      ctx.db.prepare('UPDATE users SET title = ? WHERE id = ?').run(patch.title, userId);
    }
    for (const kind of ['theme', 'banner'] as const) {
      const id = patch[kind];
      if (id === undefined) continue;
      const def = cosmeticById(id);
      if (!def || def.kind !== kind) throw new GameError(400, 'bad_cosmetic');
      if (!owned.has(id)) throw new GameError(403, 'cosmetic_locked', 'Unlock that cosmetic first.');
      ctx.db.prepare(`UPDATE users SET ${kind} = ? WHERE id = ?`).run(id, userId);
    }
    if (patch.bio !== undefined) {
      const bio = patch.bio.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 160);
      ctx.db.prepare('UPDATE users SET bio = ? WHERE id = ?').run(bio, userId);
    }
    if (patch.avatar !== undefined) {
      if (patch.avatar === null) {
        ctx.db.prepare('UPDATE users SET avatar_species = NULL, avatar_finish = NULL WHERE id = ?').run(userId);
      } else {
        const { speciesId, finish } = patch.avatar;
        if (!(FINISHES as readonly string[]).includes(finish)) throw new GameError(400, 'bad_finish');
        const has = ctx.db.prepare('SELECT 1 FROM cards WHERE owner_id = ? AND species_id = ? AND finish = ? LIMIT 1').get(userId, speciesId, finish);
        if (!has) throw new GameError(403, 'avatar_not_owned', 'Your avatar must be a card in your binder.');
        ctx.db.prepare('UPDATE users SET avatar_species = ?, avatar_finish = ? WHERE id = ?').run(speciesId, finish, userId);
      }
    }
    return { ok: true };
  });
}

export function setShowcase(ctx: Ctx, userId: number, slots: (number | null)[]) {
  if (slots.length > SHOWCASE_SLOTS) throw new GameError(400, 'too_many_slots');
  const ids = slots.filter((s): s is number => s !== null);
  if (new Set(ids).size !== ids.length) throw new GameError(400, 'duplicate_card', 'A card can only sit on one pedestal.');
  return tx(ctx, () => {
    for (const id of ids) {
      const card = getCard(ctx, id) as CardRow | undefined;
      if (!card || card.owner_id !== userId) throw new GameError(403, 'card_not_owned', 'Showcase cards must be in your binder.');
    }
    ctx.db.prepare('DELETE FROM showcase WHERE user_id = ?').run(userId);
    const ins = ctx.db.prepare('INSERT INTO showcase (user_id, slot, card_id) VALUES (?, ?, ?)');
    slots.forEach((cardId, slot) => {
      if (cardId !== null) ins.run(userId, slot, cardId);
    });
    return { ok: true };
  });
}

export function buyCosmetic(ctx: Ctx, userId: number, cosmeticId: string) {
  const def = cosmeticById(cosmeticId);
  if (!def) throw new GameError(404, 'unknown_cosmetic');
  if (def.unlockBadge) throw new GameError(403, 'badge_unlock', 'This one is earned, not bought.');
  return tx(ctx, () => {
    if (ownedCosmeticIds(ctx, userId).includes(cosmeticId)) throw new GameError(409, 'already_owned');
    const coins = def.price > 0 ? adjustCoins(ctx, userId, -def.price, 'cosmetic', cosmeticId) : getUser(ctx, userId)!.coins;
    ctx.db.prepare('INSERT INTO user_cosmetics (user_id, cosmetic_id, acquired_at) VALUES (?, ?, ?)').run(userId, cosmeticId, now());
    return { coins, owned: ownedCosmeticIds(ctx, userId) };
  });
}

export function cosmeticsFor(ctx: Ctx, userId: number) {
  const owned = new Set(ownedCosmeticIds(ctx, userId));
  return COSMETICS.map((c) => ({ ...c, owned: owned.has(c.id) }));
}

// ── Leaderboards ────────────────────────────────────────────────────────────
export type LeaderboardKind = 'networth' | 'packs' | 'species' | 'discoveries';
const lbCache = new Map<string, { at: number; rows: LeaderboardRow[] }>();

export function leaderboard(ctx: Ctx, kind: LeaderboardKind, limit = 25): LeaderboardRow[] {
  const key = `${kind}:${limit}`;
  const cached = lbCache.get(key);
  if (cached && now() - cached.at < 30_000) return cached.rows;

  const sql: Record<LeaderboardKind, string> = {
    networth: `SELECT u.id, u.coins + COALESCE(pv.v, 0) value FROM users u
               LEFT JOIN (SELECT c.owner_id, SUM(p.market_value) v FROM cards c JOIN prints p ON p.species_id = c.species_id AND p.finish = c.finish
                          WHERE c.owner_id IS NOT NULL GROUP BY c.owner_id) pv ON pv.owner_id = u.id
               ORDER BY value DESC LIMIT ?`,
    packs: 'SELECT id, packs_opened value FROM users ORDER BY packs_opened DESC, id LIMIT ?',
    species: `SELECT owner_id id, COUNT(DISTINCT species_id) value FROM cards WHERE owner_id IS NOT NULL
              GROUP BY owner_id ORDER BY value DESC LIMIT ?`,
    discoveries: 'SELECT user_id id, COUNT(*) value FROM discoveries GROUP BY user_id ORDER BY value DESC LIMIT ?',
  };
  const rows = ctx.db.prepare(sql[kind]).all(limit) as { id: number; value: number }[];
  const result = rows.map((r, i) => ({ rank: i + 1, user: toPublicUser(getUser(ctx, r.id)!), value: r.value }));
  lbCache.set(key, { at: now(), rows: result });
  return result;
}
