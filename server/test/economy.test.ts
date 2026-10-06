import { describe, expect, it } from 'vitest';
import {
  FINISH_INFO, PACK_PRICE, PACK_SLOTS, STARTING_COINS, marketFee, pullScore, quickSellValue, slotOdds,
} from '@gachapets/shared';
import { makeCtx, makeUser, season } from './helpers.ts';
import { openPack, rollPack, trickOrder } from '../src/services/packs.ts';
import { quickSell } from '../src/services/cards.ts';
import { buyListing, cancelListing, createListing } from '../src/services/market.ts';
import { computeMarketValue, getPrint } from '../src/services/prints.ts';
import { claimDaily, createUserRow } from '../src/services/users.ts';
import { earnedBadges } from '../src/services/badges.ts';
import { getCoins } from '../src/services/wallet.ts';

const coinsOf = getCoins;

describe('odds tables', () => {
  it('every slot sums to exactly 1', () => {
    for (const kind of ['common', 'uncommon', 'rare'] as const) {
      const total = slotOdds(kind).reduce((s, [, p]) => s + p, 0);
      expect(total).toBeCloseTo(1, 10);
      expect(slotOdds(kind)[0][1]).toBeGreaterThan(0.5);
    }
  });
});

describe('pack rolls', () => {
  it('fills every slot from the right pool with no repeated species', () => {
    const ctx = makeCtx();
    for (let i = 0; i < 200; i++) {
      const rolls = rollPack(ctx, 'gen');
      expect(rolls).toHaveLength(PACK_SLOTS.length);
      expect(new Set(rolls.map((r) => r.species.id)).size).toBe(rolls.length);
      rolls.forEach((r, idx) => {
        const kind = PACK_SLOTS[idx];
        const expected = kind === 'rare' ? ['rare', 'star'] : [kind];
        expect(expected).toContain(r.species.rarity);
        expect(r.species.set).toBe('gen');
      });
    }
  });

  it('card trick puts the rarest card last', () => {
    const order = trickOrder([
      { rarity: 'rare', finish: 'holo' },
      { rarity: 'common', finish: 'base' },
      { rarity: 'uncommon', finish: 'base' },
      { rarity: 'common', finish: 'living' },
    ]);
    expect(order[order.length - 1]).toBe(3);
    expect(order[0]).toBe(1);
    expect(pullScore('common', 'living')).toBeGreaterThan(pullScore('star', 'holo'));
  });
});

describe('opening packs', () => {
  it('charges, mints sequential mint numbers and records a discovery', () => {
    const ctx = makeCtx();
    const user = makeUser(ctx, 1000);
    const res = openPack(ctx, user, 'gen');
    expect(res.cards).toHaveLength(7);
    expect(coinsOf(ctx, user)).toBe(res.coins);
    expect(res.coins).toBeLessThanOrEqual(1000 - PACK_PRICE + 500); // badge rewards may add a little
    expect(res.cards.every((c) => c.isFirstDiscovery)).toBe(true);
    expect(res.revealOrder.slice().sort()).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(earnedBadges(ctx, user).map((b) => b.id)).toContain('packs_1');

    const other = makeUser(ctx, 100_000);
    for (let i = 0; i < 30; i++) openPack(ctx, other, 'gen');
    const mints = ctx.db.prepare('SELECT species_id, finish, GROUP_CONCAT(mint) m FROM cards GROUP BY species_id, finish').all() as { m: string }[];
    for (const row of mints) {
      const nums = row.m.split(',').map(Number).sort((a, b) => a - b);
      expect(nums).toEqual(nums.map((_, i) => i + 1));
    }
  });

  it('refuses when broke and changes nothing', () => {
    const ctx = makeCtx();
    const user = makeUser(ctx, PACK_PRICE - 1);
    expect(() => openPack(ctx, user, 'gen')).toThrow(/coins/i);
    expect(coinsOf(ctx, user)).toBe(PACK_PRICE - 1);
    expect((ctx.db.prepare('SELECT COUNT(*) n FROM cards').get() as { n: number }).n).toBe(0);
  });

  it('rejects unreleased sets', () => {
    const ctx = makeCtx();
    const user = makeUser(ctx);
    expect(() => openPack(ctx, user, 'aur')).toThrow(/released/);
  });

  it('never exceeds a print run, even when every roll is a Misprint', () => {
    // rng ≈ 1 → the last odds bucket (misprint) every time and the last species in the pool
    const ctx = makeCtx({ rng: () => 0.999999 });
    const user = makeUser(ctx, 10_000_000);
    for (let i = 0; i < 40; i++) openPack(ctx, user, 'gen');
    const over = ctx.db
      .prepare('SELECT species_id, finish, COUNT(*) n FROM cards GROUP BY species_id, finish')
      .all() as { species_id: string; finish: keyof typeof FINISH_INFO; n: number }[];
    for (const row of over) {
      const cap = FINISH_INFO[row.finish].printRun;
      if (cap !== null) expect(row.n).toBeLessThanOrEqual(cap);
    }
    const misprints = over.filter((r) => r.finish === 'misprint').length;
    expect(misprints).toBeGreaterThan(40); // many 1-of-1s minted…
    // …and once the common pool's misprints ran out, those slots stepped down a tier.
    expect(over.some((r) => r.finish === 'living')).toBe(true);
  });
});

describe('quick sell', () => {
  it('pays base value, burns the card and blocks listed cards', () => {
    const ctx = makeCtx();
    const user = makeUser(ctx, 1000);
    const { cards } = openPack(ctx, user, 'gen');
    const plain = cards.filter((c) => FINISH_INFO[c.finish].printRun === null);
    const before = coinsOf(ctx, user);
    const expected = plain.slice(0, 3).reduce((s, c) => s + c.quickSellValue, 0);
    const res = quickSell(ctx, user, plain.slice(0, 3).map((c) => c.id));
    expect(res.earned).toBe(expected);
    expect(coinsOf(ctx, user)).toBe(before + expected);
    const burned = ctx.db.prepare('SELECT owner_id, burned_at FROM cards WHERE id = ?').get(plain[0].id) as { owner_id: null; burned_at: number };
    expect(burned.owner_id).toBeNull();
    expect(getPrint(ctx, plain[0].speciesId, plain[0].finish)!.burned).toBe(1);

    createListing(ctx, user, plain[3].id, 50);
    expect(() => quickSell(ctx, user, [plain[3].id])).toThrow(/listing/);
  });
});

describe('market', () => {
  it('moves the card and coins (minus fee) atomically', () => {
    const ctx = makeCtx();
    const seller = makeUser(ctx, 1000);
    const buyer = makeUser(ctx, 1000);
    season(ctx, buyer);
    const { cards } = openPack(ctx, seller, 'gen');
    const card = cards[0];
    const sellerBefore = coinsOf(ctx, seller);
    const listing = createListing(ctx, seller, card.id, 200);

    expect(() => buyListing(ctx, seller, listing.id)).toThrow(/own/);
    const buyerBefore = coinsOf(ctx, buyer);
    buyListing(ctx, buyer, listing.id);

    const owner = (ctx.db.prepare('SELECT owner_id FROM cards WHERE id = ?').get(card.id) as { owner_id: number }).owner_id;
    expect(owner).toBe(buyer);
    // badge rewards can also land, so compare with the ledger instead of raw arithmetic
    const ledger = ctx.db.prepare("SELECT delta FROM ledger WHERE user_id = ? AND reason = 'market_sale'").get(seller) as { delta: number };
    expect(ledger.delta).toBe(200 - marketFee(200));
    expect(coinsOf(ctx, seller)).toBeGreaterThanOrEqual(sellerBefore + 200 - marketFee(200));
    const paid = ctx.db.prepare("SELECT delta FROM ledger WHERE user_id = ? AND reason = 'market_buy'").get(buyer) as { delta: number };
    expect(paid.delta).toBe(-200);
    expect(coinsOf(ctx, buyer)).toBeLessThanOrEqual(buyerBefore - 200 + 500);

    expect(() => buyListing(ctx, buyer, listing.id)).toThrow(/gone/);
    expect(() => cancelListing(ctx, seller, listing.id)).toThrow();
  });

  it('a failed purchase leaves no trace', () => {
    const ctx = makeCtx();
    const seller = makeUser(ctx, 1000);
    const poor = makeUser(ctx, 0);
    season(ctx, poor);
    const { cards } = openPack(ctx, seller, 'gen');
    const listing = createListing(ctx, seller, cards[0].id, 500);
    expect(() => buyListing(ctx, poor, listing.id)).toThrow(/coins/i);
    const l = ctx.db.prepare('SELECT status FROM listings WHERE id = ?').get(listing.id) as { status: string };
    expect(l.status).toBe('active');
    expect((ctx.db.prepare('SELECT COUNT(*) n FROM sales').get() as { n: number }).n).toBe(0);
  });
});

describe('new-account guard', () => {
  it('blocks fresh accounts from overpaying wildly, but not fair buys', () => {
    const ctx = makeCtx();
    const seller = makeUser(ctx, 1000);
    const fresh = makeUser(ctx, 10_000);
    const { cards } = openPack(ctx, seller, 'gen');
    const plain = cards.filter((c) => c.finish === 'base');
    const junk = createListing(ctx, seller, plain[0].id, 5000);
    expect(() => buyListing(ctx, fresh, junk.id)).toThrow(/New collectors/);
    const fair = createListing(ctx, seller, plain[1].id, 20);
    expect(() => buyListing(ctx, fresh, fair.id)).not.toThrow();
  });
});

describe('market value model', () => {
  const base = {
    rarity: 'rare' as const, finish: 'holo' as const, expected: 10, circulating: 10, sales7d: 0, salesCount: 0,
    emaPrice: null, lastSaleAt: null, activeListings: 0, lowestAsk: null, at: Date.now(),
  };
  it('never drops below the house buyback', () => {
    const v = computeMarketValue({ ...base, circulating: 100000, activeListings: 500, lowestAsk: 1 });
    expect(v).toBeGreaterThanOrEqual(quickSellValue('rare', 'holo'));
  });
  it('rises when copies are burned out of circulation', () => {
    const normal = computeMarketValue(base);
    const scarce = computeMarketValue({ ...base, circulating: 2 });
    expect(scarce).toBeGreaterThan(normal);
  });
  it('follows real trades once volume builds', () => {
    const traded = computeMarketValue({ ...base, salesCount: 30, sales7d: 30, emaPrice: 1000 });
    expect(traded).toBeGreaterThan(600);
  });
});

describe('daily bonus', () => {
  it('pays once per cooldown', () => {
    const ctx = makeCtx();
    const user = createUserRow(ctx, 'dailyuser', 'x');
    expect(coinsOf(ctx, user)).toBe(STARTING_COINS);
    const res = claimDaily(ctx, user);
    expect(res.amount).toBeGreaterThan(0);
    expect(() => claimDaily(ctx, user)).toThrow(/recharging/);
  });
});
