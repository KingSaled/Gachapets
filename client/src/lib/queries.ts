import { QueryClient, useQuery } from '@tanstack/react-query';
import type { CardSet, Catalog, MeDTO, Species } from '@gachapets/shared';
import { api, ApiError } from './api.ts';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
      refetchOnWindowFocus: false,
      staleTime: 15_000,
    },
  },
});

export interface CatalogIndex {
  raw: Catalog;
  species: Map<string, Species>;
  sets: Map<string, CardSet>;
  bySet: Map<string, Species[]>;
  lines: Map<string, Species[]>;
}

function indexCatalog(raw: Catalog): CatalogIndex {
  const species = new Map(raw.species.map((s) => [s.id, s]));
  const sets = new Map(raw.sets.map((s) => [s.id, s]));
  const bySet = new Map<string, Species[]>();
  const lines = new Map<string, Species[]>();
  for (const s of raw.species) {
    (bySet.get(s.set) ?? bySet.set(s.set, []).get(s.set)!).push(s);
    (lines.get(s.family) ?? lines.set(s.family, []).get(s.family)!).push(s);
  }
  for (const list of bySet.values()) list.sort((a, b) => a.no - b.no);
  for (const list of lines.values()) list.sort((a, b) => a.stage - b.stage);
  return { raw, species, sets, bySet, lines };
}

export const keys = {
  me: ['me'] as const,
  catalog: ['catalog'] as const,
  sets: ['sets'] as const,
  collection: ['collection'] as const,
  overview: ['market', 'overview'] as const,
  listings: (p: object) => ['market', 'listings', p] as const,
  mine: ['market', 'mine'] as const,
  print: (id: string, f: string) => ['print', id, f] as const,
  species: (id: string) => ['species', id] as const,
  profile: (u: string) => ['profile', u.toLowerCase()] as const,
  feed: ['feed'] as const,
  leaderboard: (k: string) => ['leaderboard', k] as const,
  cosmetics: ['cosmetics'] as const,
  titles: ['titles'] as const,
};

export function useCatalogQuery() {
  return useQuery({
    queryKey: keys.catalog,
    queryFn: async () => indexCatalog(await api.catalog()),
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

/** The catalog is loaded before the app renders, so this is always defined inside <App>. */
export function useCatalog(): CatalogIndex {
  const { data } = useCatalogQuery();
  if (!data) throw new Error('catalog not loaded');
  return data;
}

export function useMe() {
  return useQuery({
    queryKey: keys.me,
    queryFn: async () => {
      try {
        return await api.me();
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    staleTime: 30_000,
  });
}

export function setMe(updater: (me: MeDTO) => MeDTO) {
  queryClient.setQueryData<MeDTO | null>(keys.me, (prev) => (prev ? updater(prev) : prev));
}

export function setCoins(coins: number) {
  setMe((me) => ({ ...me, coins }));
}

export function useCollection(enabled = true) {
  return useQuery({ queryKey: keys.collection, queryFn: api.collection, enabled, staleTime: 10_000 });
}

export function useSets() {
  return useQuery({ queryKey: keys.sets, queryFn: api.sets, staleTime: 20_000 });
}

export function invalidateAfterTrade() {
  void queryClient.invalidateQueries({ queryKey: keys.collection });
  void queryClient.invalidateQueries({ queryKey: ['market'] });
  void queryClient.invalidateQueries({ queryKey: ['print'] });
  void queryClient.invalidateQueries({ queryKey: ['profile'] });
}
