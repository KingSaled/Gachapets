import type { CardSet, Catalog, Rarity, Species } from '@gachapets/shared';

export interface CatalogIndex {
  raw: Catalog;
  json: string;
  etag: string;
  species: Map<string, Species>;
  sets: Map<string, CardSet>;
  /** setId → rarity → species ids */
  pools: Map<string, Record<Rarity, Species[]>>;
  /** family → species ids ordered by stage */
  lines: Map<string, Species[]>;
}

export function indexCatalog(json: string): CatalogIndex {
  const raw = JSON.parse(json) as Catalog;
  const species = new Map(raw.species.map((s) => [s.id, s]));
  const sets = new Map(raw.sets.map((s) => [s.id, s]));
  const pools = new Map<string, Record<Rarity, Species[]>>();
  const lines = new Map<string, Species[]>();
  for (const s of raw.species) {
    let pool = pools.get(s.set);
    if (!pool) pools.set(s.set, (pool = { common: [], uncommon: [], rare: [], star: [] }));
    pool[s.rarity].push(s);
    const line = lines.get(s.family) ?? [];
    line.push(s);
    lines.set(s.family, line);
  }
  for (const line of lines.values()) line.sort((a, b) => a.stage - b.stage);
  return { raw, json, etag: `"${raw.version}"`, species, sets, pools, lines };
}
