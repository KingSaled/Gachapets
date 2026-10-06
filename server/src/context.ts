import { EventEmitter } from 'node:events';
import crypto from 'node:crypto';
import type { FeedEvent } from '@gachapets/shared';
import type { DB } from './db/index.ts';
import type { CatalogIndex } from './catalog.ts';
import type { Config } from './config.ts';

export interface UserMessage {
  userId: number;
  message: Record<string, unknown>;
}

export interface BusEvents {
  feed: [FeedEvent];
  user: [UserMessage];
}

export class Bus extends EventEmitter<BusEvents> {}

export interface Ctx {
  db: DB;
  catalog: CatalogIndex;
  config: Config;
  bus: Bus;
  /** Uniform [0,1). Cryptographically seeded in production; injectable for tests. */
  rng: () => number;
  /** Side effects queued until the outermost transaction commits. */
  pending: (() => void)[] | null;
}

/**
 * Run `fn` in a SQLite transaction. Side effects registered with
 * `afterCommit` (websocket pushes, feed broadcasts) fire only if it commits.
 */
export function tx<T>(ctx: Ctx, fn: () => T): T {
  const outer = ctx.pending === null;
  if (outer) ctx.pending = [];
  try {
    const result = ctx.db.transaction(fn)();
    if (outer) {
      const effects = ctx.pending ?? [];
      ctx.pending = null;
      for (const effect of effects) effect();
    }
    return result;
  } catch (err) {
    if (outer) ctx.pending = null;
    throw err;
  }
}

export function afterCommit(ctx: Ctx, effect: () => void) {
  if (ctx.pending) ctx.pending.push(effect);
  else effect();
}

export class GameError extends Error {
  constructor(public status: number, public code: string, message?: string) {
    super(message ?? code);
  }
}

/** Crypto-backed uniform float in [0, 1) with 48 bits of entropy. */
export function cryptoRng(): number {
  return crypto.randomBytes(6).readUIntBE(0, 6) / 2 ** 48;
}
