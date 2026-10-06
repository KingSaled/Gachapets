import { openDb } from '../src/db/index.ts';
import { loadCatalog } from '../src/catalog.ts';
import { loadConfig } from '../src/config.ts';
import { Bus, type Ctx } from '../src/context.ts';
import { mulberry32 } from '@gachapets/shared';
import { createUserRow } from '../src/services/users.ts';

const catalog = loadCatalog(loadConfig().catalogPath);

export function makeCtx(opts: { seed?: number; rng?: () => number; liveSets?: string[] } = {}): Ctx {
  const config = loadConfig({ dbPath: ':memory:', simulateBots: false, liveSets: opts.liveSets ?? ['gen', 'neo'] });
  return {
    db: openDb(':memory:'),
    catalog,
    config,
    bus: new Bus(),
    rng: opts.rng ?? mulberry32(opts.seed ?? 42),
    pending: null,
  };
}

let n = 0;
export function makeUser(ctx: Ctx, coins = 100_000): number {
  n += 1;
  return createUserRow(ctx, `tester${n}`, 'scrypt$x$y', { coins });
}

/** Make an account old and experienced enough to skip the new-account trade guard. */
export function season(ctx: Ctx, userId: number) {
  ctx.db.prepare('UPDATE users SET created_at = 0, packs_opened = 100 WHERE id = ?').run(userId);
}
