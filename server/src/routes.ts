import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { FINISHES, FINISH_INFO, type Finish } from '@gachapets/shared';
import { type Ctx, GameError } from './context.ts';
import {
  claimDaily, destroySession, getUser, login, meDTO, register, saveSettings, type UserRow, userForSession,
} from './services/users.ts';
import { openPack } from './services/packs.ts';
import { collectionOf, getCard, quickSell, toCardDTO } from './services/cards.ts';
import {
  browseListings, buyListing, cancelListing, createListing, marketOverview, myListings, printStats, speciesPrints,
} from './services/market.ts';
import {
  availableTitles, buyCosmetic, cosmeticsFor, getProfile, leaderboard, setShowcase, updateProfile, type LeaderboardKind,
} from './services/profile.ts';
import { recentFeed } from './services/feed.ts';
import { packsOpenedForSet } from './services/prints.ts';

export const SESSION_COOKIE = 'gp_session';

declare module 'fastify' {
  interface FastifyRequest {
    user?: UserRow;
  }
}

const finishSchema = z.enum(FINISHES);
const idParam = z.object({ id: z.coerce.number().int().positive() });

export function registerRoutes(app: FastifyInstance, ctx: Ctx) {
  const setSession = (reply: FastifyReply, token: string) =>
    reply.setCookie(SESSION_COOKIE, token, {
      path: '/', httpOnly: true, sameSite: 'lax', secure: ctx.config.isProd, maxAge: 30 * 24 * 60 * 60,
    });

  app.addHook('preHandler', async (req) => {
    req.user = userForSession(ctx, req.cookies[SESSION_COOKIE]);
  });

  const auth = async (req: FastifyRequest) => {
    if (!req.user) throw new GameError(401, 'unauthorized', 'Sign in first.');
  };
  const uid = (req: FastifyRequest) => req.user!.id;
  const authLimit = { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } };

  // ── Auth ────────────────────────────────────────────────────────────────
  const credentials = z.object({ username: z.string().trim().min(1).max(32), password: z.string().min(1).max(200) });

  // Registration is limited per IP per hour in production to slow alt-account farming.
  const registerLimit = { config: { rateLimit: { max: ctx.config.isProd ? 5 : 500, timeWindow: '1 hour' } } };
  app.post('/api/auth/register', registerLimit, async (req, reply) => {
    const body = credentials.parse(req.body);
    const { userId, token } = await register(ctx, body.username, body.password);
    setSession(reply, token);
    return meDTO(ctx, getUser(ctx, userId)!);
  });

  app.post('/api/auth/login', authLimit, async (req, reply) => {
    const body = credentials.parse(req.body);
    const { userId, token } = await login(ctx, body.username, body.password);
    setSession(reply, token);
    return meDTO(ctx, getUser(ctx, userId)!);
  });

  app.post('/api/auth/logout', async (req, reply) => {
    const token = req.cookies[SESSION_COOKIE];
    if (token) destroySession(ctx, token);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  // ── Me ──────────────────────────────────────────────────────────────────
  app.get('/api/me', { preHandler: auth }, async (req) => meDTO(ctx, getUser(ctx, uid(req))!));
  app.post('/api/me/daily', { preHandler: auth }, async (req) => claimDaily(ctx, uid(req)));
  app.put('/api/me/settings', { preHandler: auth }, async (req) => {
    const body = z.object({ sfx: z.boolean().optional(), volume: z.number().min(0).max(1).optional() }).parse(req.body);
    return saveSettings(ctx, uid(req), body);
  });

  // ── Catalog & sets ──────────────────────────────────────────────────────
  app.get('/api/catalog', async (req, reply) => {
    reply.header('ETag', ctx.catalog.etag).header('Cache-Control', 'public, max-age=300');
    if (req.headers['if-none-match'] === ctx.catalog.etag) return reply.status(304).send();
    return reply.type('application/json').send(ctx.catalog.json);
  });

  app.get('/api/sets', async () => {
    const serialized = FINISHES.filter((f) => FINISH_INFO[f].printRun !== null);
    return ctx.catalog.raw.sets.map((set) => {
      const live = ctx.config.liveSets.includes(set.id);
      const remaining: Partial<Record<Finish, { left: number; total: number }>> = {};
      if (live) {
        for (const f of serialized) {
          const total = set.size * FINISH_INFO[f].printRun!;
          const minted = (ctx.db
            .prepare(`SELECT COALESCE(SUM(minted), 0) n FROM prints WHERE finish = ? AND species_id IN (SELECT value FROM json_each(?))`)
            .get(f, JSON.stringify(ctx.catalog.raw.species.filter((s) => s.set === set.id).map((s) => s.id))) as { n: number }).n;
          remaining[f] = { left: total - minted, total };
        }
      }
      return { id: set.id, live, packsOpened: packsOpenedForSet(ctx, set.id), remaining };
    });
  });

  // ── Packs ───────────────────────────────────────────────────────────────
  app.post('/api/packs/open', { preHandler: auth, config: { rateLimit: { max: 40, timeWindow: '1 minute' } } }, async (req) => {
    const { setId } = z.object({ setId: z.string().min(1).max(16) }).parse(req.body);
    return openPack(ctx, uid(req), setId);
  });

  // ── Collection ──────────────────────────────────────────────────────────
  app.get('/api/collection', { preHandler: auth }, async (req) => {
    const cards = collectionOf(ctx, uid(req));
    const prints = ctx.db
      .prepare(`SELECT p.species_id, p.finish, p.market_value FROM prints p
                WHERE EXISTS (SELECT 1 FROM cards c WHERE c.owner_id = ? AND c.species_id = p.species_id AND c.finish = p.finish)`)
      .all(uid(req)) as { species_id: string; finish: string; market_value: number }[];
    const values: Record<string, number> = {};
    for (const p of prints) values[`${p.species_id}|${p.finish}`] = p.market_value;
    return { cards, values };
  });

  app.post('/api/cards/quicksell', { preHandler: auth }, async (req) => {
    const body = z.object({ cardIds: z.array(z.number().int().positive()).min(1).max(500), confirmSerialized: z.boolean().optional() }).parse(req.body);
    return quickSell(ctx, uid(req), body.cardIds, body.confirmSerialized ?? false);
  });

  app.get('/api/cards/:id', async (req) => {
    const { id } = idParam.parse(req.params);
    const card = getCard(ctx, id);
    if (!card) throw new GameError(404, 'card_not_found');
    const owner = card.owner_id ? getUser(ctx, card.owner_id) : undefined;
    const minter = getUser(ctx, card.minted_by);
    const history = ctx.db
      .prepare('SELECT s.price, s.at, us.username seller, ub.username buyer FROM sales s JOIN users us ON us.id = s.seller_id JOIN users ub ON ub.id = s.buyer_id WHERE s.card_id = ? ORDER BY s.id DESC')
      .all(id);
    return {
      card: toCardDTO(card),
      owner: owner?.username ?? null,
      burned: card.burned_at !== null,
      mintedBy: minter?.username ?? null,
      history,
    };
  });

  // ── Prints & species ────────────────────────────────────────────────────
  app.get('/api/prints/:speciesId/:finish', async (req) => {
    const p = z.object({ speciesId: z.string().max(40), finish: finishSchema }).parse(req.params);
    return printStats(ctx, p.speciesId, p.finish);
  });
  app.get('/api/species/:speciesId', async (req) => {
    const p = z.object({ speciesId: z.string().max(40) }).parse(req.params);
    return speciesPrints(ctx, p.speciesId);
  });

  // ── Market ──────────────────────────────────────────────────────────────
  const browseSchema = z.object({
    q: z.string().max(40).optional(),
    set: z.string().max(16).optional(),
    type: z.string().max(16).optional(),
    rarity: z.string().max(16).optional(),
    finish: z.string().max(16).optional(),
    speciesId: z.string().max(40).optional(),
    seller: z.string().max(32).optional(),
    minPrice: z.coerce.number().int().min(0).optional(),
    maxPrice: z.coerce.number().int().min(0).optional(),
    sort: z.enum(['price_asc', 'price_desc', 'newest', 'deal', 'rarity']).optional(),
    page: z.coerce.number().int().min(1).max(10_000).optional(),
    pageSize: z.coerce.number().int().min(1).max(60).optional(),
  });
  app.get('/api/market/listings', async (req) => {
    const q = browseSchema.parse(req.query);
    const sellerId = q.seller ? (ctx.db.prepare('SELECT id FROM users WHERE username = ?').get(q.seller) as { id: number } | undefined)?.id ?? -1 : undefined;
    return browseListings(ctx, { ...q, sellerId });
  });
  app.get('/api/market/overview', async () => marketOverview(ctx));
  app.get('/api/market/mine', { preHandler: auth }, async (req) => myListings(ctx, uid(req)));
  app.post('/api/market/listings', { preHandler: auth }, async (req) => {
    const body = z.object({ cardId: z.number().int().positive(), price: z.number().int() }).parse(req.body);
    return createListing(ctx, uid(req), body.cardId, body.price);
  });
  app.delete('/api/market/listings/:id', { preHandler: auth }, async (req) => {
    const { id } = idParam.parse(req.params);
    return cancelListing(ctx, uid(req), id);
  });
  app.post('/api/market/listings/:id/buy', { preHandler: auth }, async (req) => {
    const { id } = idParam.parse(req.params);
    return buyListing(ctx, uid(req), id);
  });

  // ── Profiles & cosmetics ────────────────────────────────────────────────
  app.get('/api/profiles/:username', async (req) => {
    const { username } = z.object({ username: z.string().max(32) }).parse(req.params);
    return getProfile(ctx, username);
  });
  app.put('/api/profile', { preHandler: auth }, async (req) => {
    const body = z.object({
      title: z.string().max(40).nullable().optional(),
      theme: z.string().max(40).optional(),
      banner: z.string().max(40).optional(),
      bio: z.string().max(400).optional(),
      avatar: z.object({ speciesId: z.string().max(40), finish: finishSchema }).nullable().optional(),
    }).parse(req.body);
    return updateProfile(ctx, uid(req), body);
  });
  app.put('/api/profile/showcase', { preHandler: auth }, async (req) => {
    const { slots } = z.object({ slots: z.array(z.number().int().positive().nullable()).max(8) }).parse(req.body);
    return setShowcase(ctx, uid(req), slots);
  });
  app.get('/api/profile/titles', { preHandler: auth }, async (req) => availableTitles(ctx, uid(req)));
  app.get('/api/cosmetics', { preHandler: auth }, async (req) => cosmeticsFor(ctx, uid(req)));
  app.post('/api/cosmetics/:id/buy', { preHandler: auth }, async (req) => {
    const { id } = z.object({ id: z.string().max(40) }).parse(req.params);
    return buyCosmetic(ctx, uid(req), id);
  });

  // ── Social ──────────────────────────────────────────────────────────────
  app.get('/api/feed', async (req) => {
    const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(100).optional() }).parse(req.query);
    return recentFeed(ctx, limit ?? 40);
  });
  app.get('/api/leaderboard/:kind', async (req) => {
    const { kind } = z.object({ kind: z.enum(['networth', 'packs', 'species', 'discoveries']) }).parse(req.params);
    return leaderboard(ctx, kind as LeaderboardKind);
  });

  app.get('/api/health', async () => ({ ok: true, catalog: ctx.catalog.raw.version }));
}
