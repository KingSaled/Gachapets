/**
 * The Gachapets game server, running inside the browser tab.
 *
 * The demo artifact can't reach a backend, so this module boots the real
 * server services (packs, market, badges, NPC collectors…) on an in-memory
 * SQLite (sql.js, pure asm.js) and answers the same /api routes the client
 * normally fetches. The world is saved to IndexedDB in this browser.
 */
import initSqlJs from 'sql.js/dist/sql-asm.js';
import type { Finish } from '@gachapets/shared';
import { FINISHES, FINISH_INFO, setSpriteResolver } from '@gachapets/shared';
import { MIGRATIONS } from '../../../server/src/db/migrations.ts';
import { indexCatalog } from '../../../server/src/catalog.ts';
import { Bus, type Ctx, GameError } from '../../../server/src/context.ts';
import type { Config } from '../../../server/src/config.ts';
import type { DB } from '../../../server/src/db/index.ts';
import {
  claimDaily, createUserRow, getUser, getUserByName, meDTO, saveSettings, USERNAME_RE,
} from '../../../server/src/services/users.ts';
import { openPack } from '../../../server/src/services/packs.ts';
import { collectionOf, getCard, quickSell, toCardDTO } from '../../../server/src/services/cards.ts';
import {
  browseListings, buyListing, cancelListing, createListing, marketOverview, myListings, printStats, speciesPrints,
} from '../../../server/src/services/market.ts';
import {
  availableTitles, buyCosmetic, cosmeticsFor, getProfile, leaderboard, setShowcase, updateProfile, type LeaderboardKind,
} from '../../../server/src/services/profile.ts';
import { recentFeed } from '../../../server/src/services/feed.ts';
import { packsOpenedForSet, recomputeAll } from '../../../server/src/services/prints.ts';
import { botTick, ensureBots } from '../../../server/src/services/bots.ts';
import { BrowserDb } from './sqlite.ts';
import catalogJson from './generated/catalog.json?raw';
import sprites from './generated/sprites.json';

const SAVE_KEY = 'gachapets-demo-v1';
const UID_KEY = 'gp.demo.uid';
const BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';

setSpriteResolver((p) => (sprites as Record<string, string>)[p] ?? BLANK);

function rng(): number {
  const a = new Uint32Array(2);
  crypto.getRandomValues(a);
  return (a[0] * 2 ** 21 + (a[1] >>> 11)) / 2 ** 53;
}

// ── persistence (IndexedDB, best-effort) ─────────────────────────────────
function idb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open('gachapets-demo', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('worlds');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}
async function loadSave(): Promise<Uint8Array | null> {
  const db = await idb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const r = db.transaction('worlds').objectStore('worlds').get(SAVE_KEY);
      r.onsuccess = () => resolve(r.result instanceof Uint8Array ? r.result : null);
      r.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}
async function writeSave(bytes: Uint8Array | null) {
  const db = await idb();
  if (!db) return;
  try {
    const store = db.transaction('worlds', 'readwrite').objectStore('worlds');
    if (bytes) store.put(bytes, SAVE_KEY);
    else store.delete(SAVE_KEY);
  } catch {
    /* storage blocked: the world lives for this tab only */
  }
}
function getUid(): number | null {
  try {
    const v = localStorage.getItem(UID_KEY);
    return v ? Number(v) : null;
  } catch {
    return memoryUid;
  }
}
let memoryUid: number | null = null;
function setUid(id: number | null) {
  memoryUid = id;
  try {
    if (id === null) localStorage.removeItem(UID_KEY);
    else localStorage.setItem(UID_KEY, String(id));
  } catch {
    /* ignore */
  }
}

// ── boot ─────────────────────────────────────────────────────────────────
export const bus = new Bus();
let ctx: Ctx | null = null;
let booting: Promise<Ctx> | null = null;
let botIds: number[] = [];

function migrate(db: BrowserDb) {
  db.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)');
  const row = db.prepare('SELECT version FROM schema_version').get() as { version: number } | undefined;
  if (!row) db.prepare('INSERT INTO schema_version (version) VALUES (0)').run();
  for (let i = row?.version ?? 0; i < MIGRATIONS.length; i++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[i]);
      db.prepare('UPDATE schema_version SET version = ?').run(i + 1);
    })();
  }
}

async function boot(): Promise<Ctx> {
  const SQL = await initSqlJs();
  const saved = await loadSave();
  let raw;
  try {
    raw = saved ? new SQL.Database(saved) : new SQL.Database();
  } catch {
    raw = new SQL.Database();
  }
  const db = new BrowserDb(raw);
  db.pragma('foreign_keys = ON');
  migrate(db);

  const config: Config = {
    port: 0, host: '', isProd: false, dbPath: ':memory:', spritesDir: '', catalogPath: '', clientDist: '',
    liveSets: ['gen', 'neo'], simulateBots: true, botTickMs: 7000, devLuck: null,
  };
  const c: Ctx = { db: db as unknown as DB, catalog: indexCatalog(catalogJson), config, bus, rng, pending: null };
  botIds = ensureBots(c, 10);

  // A fresh world gets a short history so the market, feed and leaderboards aren't empty.
  if (!saved) {
    for (let i = 0; i < 260; i++) botTick(c, botIds, rng);
    recomputeAll(c);
  }
  const uid = getUid();
  if (uid !== null && !getUser(c, uid)) setUid(null);

  window.setInterval(() => {
    try {
      botTick(c, botIds, rng);
    } catch (err) {
      console.warn('npc tick failed', err);
    }
  }, config.botTickMs);
  window.setInterval(() => recomputeAll(c), 5 * 60 * 1000);
  window.setInterval(() => void persist(), 4000);
  window.addEventListener('pagehide', () => void persist());
  await persist(true);
  ctx = c;
  return c;
}

async function persist(force = false) {
  const db = ctx?.db as unknown as BrowserDb | undefined;
  if (!db || (!db.dirty && !force)) return;
  await writeSave(db.export());
}

export function ready(): Promise<Ctx> {
  if (ctx) return Promise.resolve(ctx);
  booting ??= boot();
  return booting;
}

export function currentUserId() {
  return getUid();
}

export function onlineCount() {
  return botIds.length + (getUid() ? 1 : 0);
}

export async function resetWorld() {
  await writeSave(null);
  setUid(null);
  location.reload();
}

// ── router ───────────────────────────────────────────────────────────────
export class LocalApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

type Handler = (c: Ctx, m: RegExpMatchArray, body: any, query: URLSearchParams) => unknown;
const routes: [string, RegExp, Handler][] = [];
const route = (method: string, pattern: string, h: Handler) => {
  routes.push([method, new RegExp(`^${pattern.replace(/:(\w+)/g, '([^/]+)')}$`), h]);
};

function uid(): number {
  const id = getUid();
  if (id === null) throw new GameError(401, 'unauthorized', 'Sign in first.');
  return id;
}

route('POST', '/api/auth/register', (c, _m, b) => {
  const username = String(b?.username ?? '').trim();
  if (!USERNAME_RE.test(username)) throw new GameError(400, 'bad_username', 'Usernames are 3–16 letters, numbers or underscores.');
  if (getUserByName(c, username)) throw new GameError(409, 'username_taken', 'That username is taken.');
  const id = createUserRow(c, username, 'demo-local');
  setUid(id);
  return meDTO(c, getUser(c, id)!);
});
route('POST', '/api/auth/login', (c, _m, b) => {
  const u = getUserByName(c, String(b?.username ?? '').trim());
  if (!u || u.is_bot) throw new GameError(401, 'bad_credentials', 'No collector with that name in this browser’s demo world.');
  setUid(u.id);
  return meDTO(c, u);
});
route('POST', '/api/auth/logout', () => {
  setUid(null);
  return { ok: true };
});
route('GET', '/api/me', (c) => meDTO(c, getUser(c, uid())!));
route('POST', '/api/me/daily', (c) => claimDaily(c, uid()));
route('PUT', '/api/me/settings', (c, _m, b) => saveSettings(c, uid(), b ?? {}));
route('GET', '/api/catalog', (c) => c.catalog.raw);
route('GET', '/api/sets', (c) => {
  const serialized = FINISHES.filter((f) => FINISH_INFO[f].printRun !== null);
  return c.catalog.raw.sets.map((set) => {
    const live = c.config.liveSets.includes(set.id);
    const remaining: Partial<Record<Finish, { left: number; total: number }>> = {};
    if (live) {
      const ids = JSON.stringify(c.catalog.raw.species.filter((s) => s.set === set.id).map((s) => s.id));
      for (const f of serialized) {
        const total = set.size * FINISH_INFO[f].printRun!;
        const minted = (c.db.prepare('SELECT COALESCE(SUM(minted), 0) n FROM prints WHERE finish = ? AND species_id IN (SELECT value FROM json_each(?))').get(f, ids) as { n: number }).n;
        remaining[f] = { left: total - minted, total };
      }
    }
    return { id: set.id, live, packsOpened: packsOpenedForSet(c, set.id), remaining };
  });
});
route('POST', '/api/packs/open', (c, _m, b) => openPack(c, uid(), String(b?.setId)));
route('GET', '/api/collection', (c) => {
  const id = uid();
  const prints = c.db
    .prepare(`SELECT p.species_id, p.finish, p.market_value FROM prints p
              WHERE EXISTS (SELECT 1 FROM cards c WHERE c.owner_id = ? AND c.species_id = p.species_id AND c.finish = p.finish)`)
    .all(id) as { species_id: string; finish: string; market_value: number }[];
  const values: Record<string, number> = {};
  for (const p of prints) values[`${p.species_id}|${p.finish}`] = p.market_value;
  return { cards: collectionOf(c, id), values };
});
route('POST', '/api/cards/quicksell', (c, _m, b) => quickSell(c, uid(), (b?.cardIds ?? []).map(Number), !!b?.confirmSerialized));
route('GET', '/api/cards/:id', (c, m) => {
  const card = getCard(c, Number(m[1]));
  if (!card) throw new GameError(404, 'card_not_found');
  return { card: toCardDTO(card), owner: card.owner_id ? getUser(c, card.owner_id)?.username : null, burned: card.burned_at !== null };
});
route('GET', '/api/prints/:sid/:finish', (c, m) => printStats(c, decodeURIComponent(m[1]), m[2] as Finish));
route('GET', '/api/species/:sid', (c, m) => speciesPrints(c, decodeURIComponent(m[1])));
route('GET', '/api/market/listings', (c, _m, _b, q) => {
  const num = (k: string) => (q.get(k) ? Number(q.get(k)) : undefined);
  const seller = q.get('seller');
  return browseListings(c, {
    q: q.get('q') ?? undefined, set: q.get('set') ?? undefined, type: q.get('type') ?? undefined, rarity: q.get('rarity') ?? undefined,
    finish: q.get('finish') ?? undefined, speciesId: q.get('speciesId') ?? undefined, sort: (q.get('sort') as never) ?? undefined,
    page: num('page'), pageSize: num('pageSize'), minPrice: num('minPrice'), maxPrice: num('maxPrice'),
    sellerId: seller ? getUserByName(c, seller)?.id ?? -1 : undefined,
  });
});
route('GET', '/api/market/overview', (c) => marketOverview(c));
route('GET', '/api/market/mine', (c) => myListings(c, uid()));
route('POST', '/api/market/listings', (c, _m, b) => createListing(c, uid(), Number(b?.cardId), Number(b?.price)));
route('DELETE', '/api/market/listings/:id', (c, m) => cancelListing(c, uid(), Number(m[1])));
route('POST', '/api/market/listings/:id/buy', (c, m) => buyListing(c, uid(), Number(m[1])));
route('GET', '/api/profiles/:u', (c, m) => getProfile(c, decodeURIComponent(m[1])));
route('PUT', '/api/profile', (c, _m, b) => updateProfile(c, uid(), b ?? {}));
route('PUT', '/api/profile/showcase', (c, _m, b) => setShowcase(c, uid(), b?.slots ?? []));
route('GET', '/api/profile/titles', (c) => availableTitles(c, uid()));
route('GET', '/api/cosmetics', (c) => cosmeticsFor(c, uid()));
route('POST', '/api/cosmetics/:id/buy', (c, m) => buyCosmetic(c, uid(), decodeURIComponent(m[1])));
route('GET', '/api/feed', (c, _m, _b, q) => recentFeed(c, Math.min(100, Number(q.get('limit') ?? 40))));
route('GET', '/api/leaderboard/:kind', (c, m) => leaderboard(c, m[1] as LeaderboardKind));

export async function handle(method: string, url: string, body: unknown): Promise<unknown> {
  const c = await ready();
  const [pathname, search = ''] = url.split('?');
  for (const [m, re, h] of routes) {
    if (m !== method) continue;
    const match = pathname.match(re);
    if (!match) continue;
    try {
      // structuredClone keeps the UI from mutating server-side objects
      return structuredClone(h(c, match, body, new URLSearchParams(search)));
    } catch (err) {
      if (err instanceof GameError) throw new LocalApiError(err.status, err.code, err.message);
      console.error(err);
      throw new LocalApiError(500, 'error', 'Something broke in the demo world.');
    }
  }
  throw new LocalApiError(404, 'not_found', `No demo route for ${method} ${pathname}`);
}
