import { now } from '../db/index.ts';
import { type Ctx, GameError, afterCommit } from '../context.ts';

/**
 * Apply a coin delta atomically and record it in the ledger. Negative deltas
 * fail (and change nothing) if the balance would go below zero.
 * Must be called inside the caller's transaction when part of a larger action.
 */
export function adjustCoins(ctx: Ctx, userId: number, delta: number, reason: string, ref?: string | number): number {
  if (!Number.isInteger(delta)) throw new Error(`non-integer coin delta ${delta}`);
  const row = ctx.db
    .prepare('UPDATE users SET coins = coins + ? WHERE id = ? AND coins + ? >= 0 RETURNING coins')
    .get(delta, userId, delta) as { coins: number } | undefined;
  if (!row) throw new GameError(402, 'insufficient_coins', 'Not enough coins.');
  ctx.db
    .prepare('INSERT INTO ledger (user_id, delta, balance, reason, ref, at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(userId, delta, row.coins, reason, ref == null ? null : String(ref), now());
  const coins = row.coins;
  afterCommit(ctx, () => ctx.bus.emit('user', { userId, message: { type: 'coins', coins, delta, reason } }));
  return row.coins;
}

export function getCoins(ctx: Ctx, userId: number): number {
  const row = ctx.db.prepare('SELECT coins FROM users WHERE id = ?').get(userId) as { coins: number } | undefined;
  return row?.coins ?? 0;
}
