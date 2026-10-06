/**
 * Populate a local world with NPC collectors, opened packs, listings and
 * trades so the market, feed and leaderboards have something to show.
 *
 *   npm run seed:demo            (uses DB_PATH or server/var/gachapets.db)
 *   TICKS=3000 npm run seed:demo
 */
import { loadConfig } from '../config.ts';
import { openDb } from '../db/index.ts';
import { loadCatalog } from '../catalog-load.ts';
import { Bus, type Ctx, cryptoRng } from '../context.ts';
import { botTick, ensureBots } from '../services/bots.ts';
import { recomputeAll } from '../services/prints.ts';

const config = loadConfig();
const ctx: Ctx = {
  db: openDb(config.dbPath),
  catalog: loadCatalog(config.catalogPath),
  config,
  bus: new Bus(),
  rng: cryptoRng,
  pending: null,
};
const ticks = Number(process.env.TICKS ?? 1200);
const bots = ensureBots(ctx, 12);
const started = Date.now();
for (let i = 0; i < ticks; i++) botTick(ctx, bots);
const repriced = recomputeAll(ctx);
const count = (sql: string) => (ctx.db.prepare(sql).get() as { n: number }).n;
console.log(`Seeded ${config.dbPath} in ${Date.now() - started}ms`);
console.log(`  bots: ${bots.length}  packs: ${count('SELECT COUNT(*) n FROM packs')}  cards: ${count('SELECT COUNT(*) n FROM cards')}`);
console.log(`  listings: ${count("SELECT COUNT(*) n FROM listings WHERE status = 'active'")}  sales: ${count('SELECT COUNT(*) n FROM sales')}  repriced: ${repriced}`);
ctx.db.close();
