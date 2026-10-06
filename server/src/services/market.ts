import type { CardDTO, Finish, ListingDTO, PrintStats, PublicUser, SaleDTO } from '@gachapets/shared';
import {
  ELEMENTS, FINISHES, FINISH_INFO, MAX_ACTIVE_LISTINGS, MAX_LISTING_PRICE, MIN_LISTING_PRICE, NEW_ACCOUNT_DAYS,
  NEW_ACCOUNT_FLOOR, NEW_ACCOUNT_MAX_MULT, NEW_ACCOUNT_PACKS, RARITIES, marketFee, quickSellValue, referenceValue,
} from '@gachapets/shared';
import { now } from '../clock.ts';
import { type Ctx, GameError, afterCommit, tx } from '../context.ts';
import { adjustCoins } from './wallet.ts';
import { getCard, toCardDTO } from './cards.ts';
import {
  getPrint, marketValueOf, pctChange, priceHistory, recomputeValue, recordSaleForPrint, valueAt,
} from './prints.ts';
import { evaluateBadges } from './badges.ts';
import { pushFeed } from './feed.ts';
import { checkLines } from './lines.ts';
import { publicUser } from './users.ts';

const DAY = 24 * 60 * 60 * 1000;

// ── Listing lifecycle ───────────────────────────────────────────────────────
export function createListing(ctx: Ctx, userId: number, cardId: number, price: number): ListingDTO {
  if (!Number.isInteger(price) || price < MIN_LISTING_PRICE || price > MAX_LISTING_PRICE) {
    throw new GameError(400, 'bad_price', `Price must be a whole number between ${MIN_LISTING_PRICE} and ${MAX_LISTING_PRICE.toLocaleString()}.`);
  }
  return tx(ctx, () => {
    const card = getCard(ctx, cardId);
    if (!card || card.owner_id !== userId) throw new GameError(404, 'card_not_found', 'That card is not in your binder.');
    if (card.listing_id) throw new GameError(409, 'already_listed', 'That card is already listed.');
    const active = (ctx.db.prepare("SELECT COUNT(*) n FROM listings WHERE seller_id = ? AND status = 'active'").get(userId) as { n: number }).n;
    if (active >= MAX_ACTIVE_LISTINGS) throw new GameError(409, 'too_many_listings', `You can have at most ${MAX_ACTIVE_LISTINGS} active listings.`);
    const t = now();
    const id = Number(ctx.db
      .prepare('INSERT INTO listings (card_id, seller_id, species_id, finish, price, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(cardId, userId, card.species_id, card.finish, price, t).lastInsertRowid);
    recomputeValue(ctx, card.species_id, card.finish);
    if (FINISH_INFO[card.finish].printRun !== null) {
      pushFeed(ctx, 'listing', userId, { speciesId: card.species_id, finish: card.finish, mint: card.mint, printRun: FINISH_INFO[card.finish].printRun, price });
    }
    return getListing(ctx, id)!;
  });
}

export function cancelListing(ctx: Ctx, userId: number, listingId: number) {
  return tx(ctx, () => {
    const l = ctx.db.prepare('SELECT * FROM listings WHERE id = ?').get(listingId) as ListingRow | undefined;
    if (!l || l.seller_id !== userId) throw new GameError(404, 'listing_not_found');
    if (l.status !== 'active') throw new GameError(409, 'listing_closed', 'That listing is no longer active.');
    ctx.db.prepare("UPDATE listings SET status = 'cancelled', closed_at = ? WHERE id = ?").run(now(), listingId);
    recomputeValue(ctx, l.species_id, l.finish);
    return { ok: true };
  });
}

export function buyListing(ctx: Ctx, buyerId: number, listingId: number) {
  return tx(ctx, () => {
    const l = ctx.db.prepare('SELECT * FROM listings WHERE id = ?').get(listingId) as ListingRow | undefined;
    if (!l) throw new GameError(404, 'listing_not_found');
    if (l.status !== 'active') throw new GameError(409, 'listing_closed', 'Someone beat you to it — that listing is gone.');
    if (l.seller_id === buyerId) throw new GameError(400, 'own_listing', "You can't buy your own listing.");
    const card = getCard(ctx, l.card_id)!;
    const t = now();
    const buyer = ctx.db.prepare('SELECT created_at, packs_opened, is_bot FROM users WHERE id = ?').get(buyerId) as { created_at: number; packs_opened: number; is_bot: number };
    const isNew = !buyer.is_bot && (t - buyer.created_at < NEW_ACCOUNT_DAYS * DAY || buyer.packs_opened < NEW_ACCOUNT_PACKS);
    const cap = Math.max(NEW_ACCOUNT_FLOOR, marketValueOf(ctx, l.species_id, l.finish) * NEW_ACCOUNT_MAX_MULT);
    if (isNew && l.price > cap) {
      throw new GameError(403, 'new_account_limit', `New collectors can't pay more than ${Math.floor(cap).toLocaleString()} coins for this card (${NEW_ACCOUNT_MAX_MULT}× its market value) until they've opened ${NEW_ACCOUNT_PACKS} packs and played ${NEW_ACCOUNT_DAYS} days.`);
    }
    const fee = marketFee(l.price);

    const coins = adjustCoins(ctx, buyerId, -l.price, 'market_buy', listingId);
    adjustCoins(ctx, l.seller_id, l.price - fee, 'market_sale', listingId);
    ctx.db.prepare('UPDATE cards SET owner_id = ?, acquired_at = ? WHERE id = ?').run(buyerId, t, l.card_id);
    ctx.db.prepare('DELETE FROM showcase WHERE card_id = ?').run(l.card_id);
    ctx.db.prepare("UPDATE listings SET status = 'sold', buyer_id = ?, closed_at = ? WHERE id = ?").run(buyerId, t, listingId);
    const saleId = Number(ctx.db
      .prepare('INSERT INTO sales (listing_id, card_id, species_id, finish, mint, price, fee, seller_id, buyer_id, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(listingId, l.card_id, l.species_id, l.finish, card.mint, l.price, fee, l.seller_id, buyerId, t).lastInsertRowid);

    recordSaleForPrint(ctx, l.species_id, l.finish, l.price);
    recomputeValue(ctx, l.species_id, l.finish);

    const species = ctx.catalog.species.get(l.species_id)!;
    const lines = checkLines(ctx, buyerId, [species.family]);
    const buyerBadges = evaluateBadges(ctx, buyerId, { bought: true, collection: true, sets: [species.set] });
    const sellerBadges = evaluateBadges(ctx, l.seller_id, { sold: { price: l.price }, collection: true, sets: [species.set] });

    if (l.price >= 250 || FINISH_INFO[l.finish].printRun !== null) {
      pushFeed(ctx, 'sale', buyerId, { speciesId: l.species_id, finish: l.finish, mint: card.mint, printRun: FINISH_INFO[l.finish].printRun, price: l.price });
    }
    const sellerId = l.seller_id;
    const buyerName = (ctx.db.prepare('SELECT username FROM users WHERE id = ?').get(buyerId) as { username: string }).username;
    afterCommit(ctx, () => ctx.bus.emit('user', {
      userId: sellerId,
      message: { type: 'sold', listingId, saleId, speciesId: l.species_id, finish: l.finish, price: l.price, net: l.price - fee, buyer: buyerName, badges: sellerBadges },
    }));

    return { coins, card: toCardDTO({ ...card, owner_id: buyerId, listing_id: null }), newBadges: buyerBadges, completedLines: lines.completed, rewardCoins: lines.reward };
  });
}

// ── Queries ─────────────────────────────────────────────────────────────────
interface ListingRow {
  id: number;
  card_id: number;
  seller_id: number;
  species_id: string;
  finish: Finish;
  price: number;
  status: string;
  created_at: number;
}

const LISTING_SELECT = `
  SELECT l.id, l.price, l.created_at, l.seller_id, l.species_id, l.finish,
         c.id AS card_id, c.mint, c.minted_at, c.owner_id,
         COALESCE(p.market_value, 0) AS market_value
  FROM listings l
  JOIN cards c ON c.id = l.card_id
  LEFT JOIN prints p ON p.species_id = l.species_id AND p.finish = l.finish`;

interface ListingJoinRow {
  id: number;
  price: number;
  created_at: number;
  seller_id: number;
  species_id: string;
  finish: Finish;
  card_id: number;
  mint: number;
  minted_at: number;
  owner_id: number;
  market_value: number;
}

function mapListing(ctx: Ctx, r: ListingJoinRow, users: Map<number, PublicUser>): ListingDTO {
  const card: CardDTO = {
    id: r.card_id, speciesId: r.species_id, finish: r.finish, mint: r.mint, printRun: FINISH_INFO[r.finish].printRun,
    mintedAt: r.minted_at, ownerId: r.owner_id, listingId: r.id,
  };
  let seller = users.get(r.seller_id);
  if (!seller) {
    seller = publicUser(ctx, r.seller_id)!;
    users.set(r.seller_id, seller);
  }
  return { id: r.id, price: r.price, createdAt: r.created_at, seller, card, marketValue: r.market_value };
}

export function getListing(ctx: Ctx, id: number): ListingDTO | null {
  const r = ctx.db.prepare(`${LISTING_SELECT} WHERE l.id = ?`).get(id) as ListingJoinRow | undefined;
  return r ? mapListing(ctx, r, new Map()) : null;
}

export interface BrowseQuery {
  q?: string;
  set?: string;
  type?: string;
  rarity?: string;
  finish?: string;
  minPrice?: number;
  maxPrice?: number;
  speciesId?: string;
  sellerId?: number;
  sort?: 'price_asc' | 'price_desc' | 'newest' | 'deal' | 'rarity';
  page?: number;
  pageSize?: number;
}

export function browseListings(ctx: Ctx, query: BrowseQuery) {
  const where: string[] = ["l.status = 'active'"];
  const params: unknown[] = [];

  // Catalog-side filters resolve to a species id list.
  const q = query.q?.trim().toLowerCase();
  if (q || query.set || query.type || query.rarity || query.speciesId) {
    let species = ctx.catalog.raw.species;
    if (query.speciesId) species = species.filter((s) => s.id === query.speciesId);
    if (query.set) species = species.filter((s) => s.set === query.set);
    if (query.type && (ELEMENTS as readonly string[]).includes(query.type)) species = species.filter((s) => s.types.includes(query.type as never));
    if (query.rarity && (RARITIES as readonly string[]).includes(query.rarity)) species = species.filter((s) => s.rarity === query.rarity);
    if (q) species = species.filter((s) => s.name.toLowerCase().includes(q) || s.misprintName.toLowerCase().includes(q));
    if (!species.length) return { listings: [], total: 0, page: 1, pageSize: query.pageSize ?? 24 };
    where.push(`l.species_id IN (${species.map(() => '?').join(',')})`);
    params.push(...species.map((s) => s.id));
  }
  if (query.finish && (FINISHES as readonly string[]).includes(query.finish)) {
    where.push('l.finish = ?');
    params.push(query.finish);
  }
  if (query.minPrice) { where.push('l.price >= ?'); params.push(query.minPrice); }
  if (query.maxPrice) { where.push('l.price <= ?'); params.push(query.maxPrice); }
  if (query.sellerId) { where.push('l.seller_id = ?'); params.push(query.sellerId); }

  const order = {
    price_asc: 'l.price ASC, l.id ASC',
    price_desc: 'l.price DESC, l.id DESC',
    newest: 'l.id DESC',
    deal: 'CAST(l.price AS REAL) / MAX(1, COALESCE(p.market_value, l.price)) ASC, l.id DESC',
    rarity: `CASE l.finish ${FINISHES.map((f, i) => `WHEN '${f}' THEN ${i}`).join(' ')} END DESC, l.price DESC`,
  }[query.sort ?? 'newest'];

  const pageSize = Math.min(60, Math.max(1, query.pageSize ?? 24));
  const page = Math.max(1, query.page ?? 1);
  const whereSql = where.join(' AND ');
  const total = (ctx.db.prepare(`SELECT COUNT(*) n FROM listings l WHERE ${whereSql}`).get(...params) as { n: number }).n;
  const rows = ctx.db
    .prepare(`${LISTING_SELECT} WHERE ${whereSql} ORDER BY ${order} LIMIT ? OFFSET ?`)
    .all(...params, pageSize, (page - 1) * pageSize) as ListingJoinRow[];
  const users = new Map<number, PublicUser>();
  return { listings: rows.map((r) => mapListing(ctx, r, users)), total, page, pageSize };
}

interface SaleRow {
  id: number; species_id: string; finish: Finish; price: number; at: number; mint: number; seller: string; buyer: string;
}

function mapSale(r: SaleRow): SaleDTO {
  return { id: r.id, speciesId: r.species_id, finish: r.finish, price: r.price, at: r.at, mint: r.mint, seller: r.seller, buyer: r.buyer };
}

const SALE_SELECT = `
  SELECT s.id, s.species_id, s.finish, s.price, s.at, s.mint, us.username seller, ub.username buyer
  FROM sales s JOIN users us ON us.id = s.seller_id JOIN users ub ON ub.id = s.buyer_id`;

export function recentSales(ctx: Ctx, limit = 20, speciesId?: string, finish?: Finish): SaleDTO[] {
  const rows = speciesId && finish
    ? ctx.db.prepare(`${SALE_SELECT} WHERE s.species_id = ? AND s.finish = ? ORDER BY s.id DESC LIMIT ?`).all(speciesId, finish, limit)
    : ctx.db.prepare(`${SALE_SELECT} ORDER BY s.id DESC LIMIT ?`).all(limit);
  return (rows as SaleRow[]).map(mapSale);
}

export function printStats(ctx: Ctx, speciesId: string, finish: Finish): PrintStats {
  const species = ctx.catalog.species.get(speciesId);
  if (!species) throw new GameError(404, 'unknown_species');
  const t = now();
  const print = getPrint(ctx, speciesId, finish);
  const value = marketValueOf(ctx, speciesId, finish);
  const asks = ctx.db
    .prepare("SELECT COUNT(*) n, MIN(price) lo FROM listings WHERE species_id = ? AND finish = ? AND status = 'active'")
    .get(speciesId, finish) as { n: number; lo: number | null };
  const sales7d = (ctx.db.prepare('SELECT COUNT(*) n FROM sales WHERE species_id = ? AND finish = ? AND at > ?').get(speciesId, finish, t - 7 * DAY) as { n: number }).n;
  const sales = recentSales(ctx, 12, speciesId, finish);
  const disc = ctx.db
    .prepare('SELECT u.username, d.at FROM discoveries d JOIN users u ON u.id = d.user_id WHERE d.species_id = ?')
    .get(speciesId) as { username: string; at: number } | undefined;
  return {
    speciesId,
    finish,
    marketValue: value,
    quickSellValue: quickSellValue(species.rarity, finish),
    referenceValue: referenceValue(species.rarity, finish),
    change24h: print ? pctChange(valueAt(ctx, speciesId, finish, t - DAY), value) : 0,
    change7d: print ? pctChange(valueAt(ctx, speciesId, finish, t - 7 * DAY), value) : 0,
    minted: print?.minted ?? 0,
    burned: print?.burned ?? 0,
    circulating: print ? print.minted - print.burned : 0,
    printRun: FINISH_INFO[finish].printRun,
    activeListings: asks.n,
    lowestAsk: asks.lo,
    sales7d,
    lastSale: sales[0] ?? null,
    history: priceHistory(ctx, speciesId, finish),
    recentSales: sales,
    firstDiscoverer: disc ?? null,
  };
}

/** Every finish of a species at a glance (for the species page and binder). */
export function speciesPrints(ctx: Ctx, speciesId: string) {
  const species = ctx.catalog.species.get(speciesId);
  if (!species) throw new GameError(404, 'unknown_species');
  return FINISHES.map((finish) => {
    const print = getPrint(ctx, speciesId, finish);
    return {
      finish,
      minted: print?.minted ?? 0,
      circulating: print ? print.minted - print.burned : 0,
      printRun: FINISH_INFO[finish].printRun,
      marketValue: marketValueOf(ctx, speciesId, finish),
    };
  });
}

export function marketOverview(ctx: Ctx) {
  const t = now();
  const vol = ctx.db.prepare('SELECT COUNT(*) n, COALESCE(SUM(price), 0) v FROM sales WHERE at > ?').get(t - DAY) as { n: number; v: number };
  const active = (ctx.db.prepare("SELECT COUNT(*) n FROM listings WHERE status = 'active'").get() as { n: number }).n;
  const cap = (ctx.db.prepare('SELECT COALESCE(SUM(market_value * (minted - burned)), 0) v FROM prints').get() as { v: number }).v;

  const candidates = ctx.db
    .prepare('SELECT species_id, finish, market_value FROM prints WHERE updated_at > ? AND minted > 0 ORDER BY updated_at DESC LIMIT 400')
    .all(t - DAY) as { species_id: string; finish: Finish; market_value: number }[];
  const movers = candidates
    .map((p) => ({ speciesId: p.species_id, finish: p.finish, marketValue: p.market_value, change24h: pctChange(valueAt(ctx, p.species_id, p.finish, t - DAY), p.market_value) }))
    .filter((m) => m.change24h !== 0);
  const gainers = movers.filter((m) => m.change24h > 0).sort((a, b) => b.change24h - a.change24h).slice(0, 6);
  const losers = movers.filter((m) => m.change24h < 0).sort((a, b) => a.change24h - b.change24h).slice(0, 6);

  const hot = ctx.db
    .prepare(`SELECT s.species_id speciesId, s.finish, COUNT(*) sales, MAX(p.market_value) marketValue
              FROM sales s JOIN prints p ON p.species_id = s.species_id AND p.finish = s.finish
              WHERE s.at > ? GROUP BY s.species_id, s.finish ORDER BY sales DESC, marketValue DESC LIMIT 8`)
    .all(t - 7 * DAY) as { speciesId: string; finish: Finish; sales: number; marketValue: number }[];

  const grails = ctx.db
    .prepare(`${LISTING_SELECT} WHERE l.status = 'active' AND l.finish IN ('pop3d', 'living', 'misprint') ORDER BY market_value DESC LIMIT 8`)
    .all() as ListingJoinRow[];
  const users = new Map<number, PublicUser>();

  return {
    volume24h: vol.v,
    sales24h: vol.n,
    activeListings: active,
    marketCap: cap,
    gainers,
    losers,
    hot,
    grails: grails.map((r) => mapListing(ctx, r, users)),
    recentSales: recentSales(ctx, 16),
  };
}

export function myListings(ctx: Ctx, userId: number) {
  const rows = ctx.db.prepare(`${LISTING_SELECT} WHERE l.seller_id = ? AND l.status = 'active' ORDER BY l.id DESC`).all(userId) as ListingJoinRow[];
  return rows.map((r) => mapListing(ctx, r, new Map()));
}

