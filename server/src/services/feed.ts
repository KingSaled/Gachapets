import type { FeedEvent, FeedEventType } from '@gachapets/shared';
import { now } from '../clock.ts';
import { type Ctx, afterCommit } from '../context.ts';

type Payload = Omit<FeedEvent, 'id' | 'type' | 'at' | 'username'>;

export function pushFeed(ctx: Ctx, type: FeedEventType, userId: number, payload: Payload): FeedEvent {
  const at = now();
  const info = ctx.db
    .prepare('INSERT INTO feed (type, at, user_id, payload) VALUES (?, ?, ?, ?)')
    .run(type, at, userId, JSON.stringify(payload));
  const user = ctx.db.prepare('SELECT username FROM users WHERE id = ?').get(userId) as { username: string };
  const event: FeedEvent = { id: Number(info.lastInsertRowid), type, at, username: user.username, ...payload };
  afterCommit(ctx, () => ctx.bus.emit('feed', event));
  return event;
}

export function recentFeed(ctx: Ctx, limit = 40, types?: FeedEventType[]): FeedEvent[] {
  const where = types?.length ? `WHERE f.type IN (${types.map(() => '?').join(',')})` : '';
  const rows = ctx.db
    .prepare(`SELECT f.id, f.type, f.at, f.payload, u.username FROM feed f JOIN users u ON u.id = f.user_id ${where} ORDER BY f.id DESC LIMIT ?`)
    .all(...(types ?? []), limit) as { id: number; type: FeedEventType; at: number; payload: string; username: string }[];
  return rows.map((r) => ({ id: r.id, type: r.type, at: r.at, username: r.username, ...JSON.parse(r.payload) }));
}
