import type { CardDTO, Finish } from '@gachapets/shared';
import { FINISH_INFO, quickSellValue } from '@gachapets/shared';
import { now } from '../clock.ts';
import { type Ctx, GameError, tx } from '../context.ts';
import { adjustCoins } from './wallet.ts';
import { recomputeValue, recordBurn } from './prints.ts';

export interface CardRow {
  id: number;
  species_id: string;
  finish: Finish;
  mint: number;
  owner_id: number | null;
  minted_by: number;
  minted_at: number;
  acquired_at: number;
  pack_id: number | null;
  burned_at: number | null;
  listing_id?: number | null;
}

export function toCardDTO(row: CardRow): CardDTO {
  return {
    id: row.id,
    speciesId: row.species_id,
    finish: row.finish,
    mint: row.mint,
    printRun: FINISH_INFO[row.finish].printRun,
    mintedAt: row.minted_at,
    ownerId: row.owner_id ?? 0,
    listingId: row.listing_id ?? null,
  };
}

const CARD_SELECT = `
  SELECT c.*, l.id AS listing_id
  FROM cards c
  LEFT JOIN listings l ON l.card_id = c.id AND l.status = 'active'`;

export function getCard(ctx: Ctx, cardId: number): CardRow | undefined {
  return ctx.db.prepare(`${CARD_SELECT} WHERE c.id = ?`).get(cardId) as CardRow | undefined;
}

export function collectionOf(ctx: Ctx, userId: number): CardDTO[] {
  const rows = ctx.db.prepare(`${CARD_SELECT} WHERE c.owner_id = ? ORDER BY c.id`).all(userId) as CardRow[];
  return rows.map(toCardDTO);
}

export function ownedSpeciesIds(ctx: Ctx, userId: number, opts: { nonBase?: boolean } = {}): Set<string> {
  const sql = opts.nonBase
    ? "SELECT DISTINCT species_id FROM cards WHERE owner_id = ? AND finish != 'base'"
    : 'SELECT DISTINCT species_id FROM cards WHERE owner_id = ?';
  const rows = ctx.db.prepare(sql).all(userId) as { species_id: string }[];
  return new Set(rows.map((r) => r.species_id));
}

export interface QuickSellResult {
  sold: number;
  earned: number;
  coins: number;
}

/**
 * Sell cards to the house at their guaranteed base value. The cards are
 * burned (removed from circulation), which nudges the remaining copies'
 * market value up — the house is the economy's shredder.
 */
export function quickSell(ctx: Ctx, userId: number, cardIds: number[], confirmSerialized = false): QuickSellResult {
  const unique = [...new Set(cardIds)];
  if (!unique.length) throw new GameError(400, 'no_cards');
  if (unique.length > 500) throw new GameError(400, 'too_many', 'Sell at most 500 cards at a time.');

  return tx(ctx, () => {
    const t = now();
    let earned = 0;
    const touched = new Set<string>();
    for (const id of unique) {
      const card = getCard(ctx, id);
      if (!card || card.owner_id !== userId) throw new GameError(404, 'card_not_found', `Card #${id} is not in your binder.`);
      if (card.listing_id) throw new GameError(409, 'card_listed', 'Cancel the market listing before quick-selling.');
      if (FINISH_INFO[card.finish].printRun !== null && !confirmSerialized) {
        throw new GameError(409, 'confirm_serialized', 'This includes serialized cards. Confirm to shred them forever.');
      }
      const species = ctx.catalog.species.get(card.species_id)!;
      earned += quickSellValue(species.rarity, card.finish);
      ctx.db.prepare('UPDATE cards SET owner_id = NULL, burned_at = ? WHERE id = ?').run(t, id);
      ctx.db.prepare('DELETE FROM showcase WHERE card_id = ?').run(id);
      recordBurn(ctx, card.species_id, card.finish);
      touched.add(`${card.species_id}|${card.finish}`);
    }
    const coins = adjustCoins(ctx, userId, earned, 'quicksell', unique.length);
    for (const key of touched) {
      const [speciesId, finish] = key.split('|') as [string, Finish];
      recomputeValue(ctx, speciesId, finish);
    }
    return { sold: unique.length, earned, coins };
  });
}
