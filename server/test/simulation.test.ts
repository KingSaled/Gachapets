import { describe, expect, it } from 'vitest';
import { mulberry32 } from '@gachapets/shared';
import { makeCtx } from './helpers.ts';
import { botTick, ensureBots } from '../src/services/bots.ts';
import { recomputeAll } from '../src/services/prints.ts';
import { cryptoRng } from '../src/context.ts';

describe('economy simulation', () => {
  it('keeps ledger, ownership and print counters consistent under heavy bot trading', () => {
    const ctx = makeCtx({ seed: 7 });
    const bots = ensureBots(ctx, 8);
    const rng = mulberry32(99);
    for (let i = 0; i < 1500; i++) botTick(ctx, bots, rng);
    recomputeAll(ctx);

    // Every balance is fully explained by the ledger.
    const mismatched = ctx.db.prepare(`
      SELECT u.id FROM users u LEFT JOIN (SELECT user_id, SUM(delta) s FROM ledger GROUP BY user_id) l ON l.user_id = u.id
      WHERE u.coins != COALESCE(l.s, 0)`).all();
    expect(mismatched).toEqual([]);

    // Print counters match the cards table.
    const drift = ctx.db.prepare(`
      SELECT p.species_id FROM prints p
      LEFT JOIN (SELECT species_id, finish, COUNT(*) n, SUM(owner_id IS NULL) b FROM cards GROUP BY species_id, finish) c
        ON c.species_id = p.species_id AND c.finish = p.finish
      WHERE p.minted != c.n OR p.burned != c.b`).all();
    expect(drift).toEqual([]);

    // Listed cards are always owned by their seller.
    const orphans = ctx.db.prepare(`
      SELECT l.id FROM listings l JOIN cards c ON c.id = l.card_id WHERE l.status = 'active' AND c.owner_id != l.seller_id`).all();
    expect(orphans).toEqual([]);

    const trades = (ctx.db.prepare('SELECT COUNT(*) n FROM sales').get() as { n: number }).n;
    expect(trades).toBeGreaterThan(0);
  });

  it('crypto rng stays in [0, 1)', () => {
    for (let i = 0; i < 2000; i++) {
      const x = cryptoRng();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});
