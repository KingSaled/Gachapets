import { LINE_COMPLETE_REWARD } from '@gachapets/shared';
import { now } from '../db/index.ts';
import type { Ctx } from '../context.ts';
import { adjustCoins } from './wallet.ts';

/**
 * Award evolution-line completions for the given families (first time only).
 * Penny commons matter here: a line is only complete with its first stage.
 * Returns the newly completed families and the coins paid out.
 */
export function checkLines(ctx: Ctx, userId: number, families: Iterable<string>): { completed: string[]; reward: number } {
  const completed: string[] = [];
  const t = now();
  for (const family of new Set(families)) {
    const line = ctx.catalog.lines.get(family);
    if (!line || line.length < 2) continue;
    const ownedCount = (ctx.db
      .prepare(`SELECT COUNT(DISTINCT species_id) n FROM cards WHERE owner_id = ? AND species_id IN (${line.map(() => '?').join(',')})`)
      .get(userId, ...line.map((s) => s.id)) as { n: number }).n;
    if (ownedCount !== line.length) continue;
    const fresh = ctx.db.prepare('INSERT OR IGNORE INTO user_lines (user_id, family, completed_at) VALUES (?, ?, ?)').run(userId, family, t).changes > 0;
    if (fresh) completed.push(family);
  }
  const reward = completed.length * LINE_COMPLETE_REWARD;
  if (reward) adjustCoins(ctx, userId, reward, 'lines', completed.join(','));
  return { completed, reward };
}
