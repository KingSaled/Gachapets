import type {
  CardDTO, Catalog, CosmeticDef, FeedEvent, Finish, LeaderboardRow, ListingDTO, MeDTO, PackResult, PrintStats,
  ProfileDTO, SaleDTO,
} from '@gachapets/shared';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let payload: { error?: string; message?: string } = {};
    try {
      payload = await res.json();
    } catch {
      /* non-JSON */
    }
    throw new ApiError(res.status, payload.error ?? 'error', payload.message ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

const get = <T>(url: string) => request<T>('GET', url);
const post = <T>(url: string, body: unknown = {}) => request<T>('POST', url, body);
const put = <T>(url: string, body: unknown) => request<T>('PUT', url, body);
const del = <T>(url: string) => request<T>('DELETE', url);

export interface SetStatus {
  id: string;
  live: boolean;
  packsOpened: number;
  remaining: Partial<Record<Finish, { left: number; total: number }>>;
}

export interface CollectionResponse {
  cards: CardDTO[];
  values: Record<string, number>;
}

export interface BrowseParams {
  q?: string;
  set?: string;
  type?: string;
  rarity?: string;
  finish?: string;
  speciesId?: string;
  seller?: string;
  sort?: string;
  page?: number;
  pageSize?: number;
}

export interface MarketOverview {
  volume24h: number;
  sales24h: number;
  activeListings: number;
  marketCap: number;
  gainers: { speciesId: string; finish: Finish; marketValue: number; change24h: number }[];
  losers: { speciesId: string; finish: Finish; marketValue: number; change24h: number }[];
  hot: { speciesId: string; finish: Finish; sales: number; marketValue: number }[];
  grails: ListingDTO[];
  recentSales: SaleDTO[];
}

export interface SpeciesPrint {
  finish: Finish;
  minted: number;
  circulating: number;
  printRun: number | null;
  marketValue: number;
}

export interface BuyResult {
  coins: number;
  card: CardDTO;
  newBadges: string[];
  completedLines: string[];
  rewardCoins: number;
}

export const api = {
  catalog: () => get<Catalog>('/api/catalog'),
  sets: () => get<SetStatus[]>('/api/sets'),
  me: () => get<MeDTO>('/api/me'),
  register: (username: string, password: string) => post<MeDTO>('/api/auth/register', { username, password }),
  login: (username: string, password: string) => post<MeDTO>('/api/auth/login', { username, password }),
  logout: () => post<{ ok: true }>('/api/auth/logout'),
  claimDaily: () => post<{ coins: number; amount: number; streak: number }>('/api/me/daily'),
  saveSettings: (s: { sfx?: boolean; volume?: number }) => put('/api/me/settings', s),

  openPack: (setId: string) => post<PackResult>('/api/packs/open', { setId }),
  collection: () => get<CollectionResponse>('/api/collection'),
  quickSell: (cardIds: number[], confirmSerialized = false) =>
    post<{ sold: number; earned: number; coins: number }>('/api/cards/quicksell', { cardIds, confirmSerialized }),

  print: (speciesId: string, finish: Finish) => get<PrintStats>(`/api/prints/${speciesId}/${finish}`),
  species: (speciesId: string) => get<SpeciesPrint[]>(`/api/species/${speciesId}`),

  listings: (p: BrowseParams) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== '' && v !== null) qs.set(k, String(v));
    return get<{ listings: ListingDTO[]; total: number; page: number; pageSize: number }>(`/api/market/listings?${qs}`);
  },
  overview: () => get<MarketOverview>('/api/market/overview'),
  myListings: () => get<ListingDTO[]>('/api/market/mine'),
  list: (cardId: number, price: number) => post<ListingDTO>('/api/market/listings', { cardId, price }),
  cancelListing: (id: number) => del<{ ok: true }>(`/api/market/listings/${id}`),
  buy: (id: number) => post<BuyResult>(`/api/market/listings/${id}/buy`),

  profile: (username: string) => get<ProfileDTO>(`/api/profiles/${encodeURIComponent(username)}`),
  updateProfile: (patch: Record<string, unknown>) => put<{ ok: true }>('/api/profile', patch),
  setShowcase: (slots: (number | null)[]) => put<{ ok: true }>('/api/profile/showcase', { slots }),
  titles: () => get<string[]>('/api/profile/titles'),
  cosmetics: () => get<(CosmeticDef & { owned: boolean })[]>('/api/cosmetics'),
  buyCosmetic: (id: string) => post<{ coins: number; owned: string[] }>(`/api/cosmetics/${id}/buy`),

  feed: (limit = 40) => get<FeedEvent[]>(`/api/feed?limit=${limit}`),
  leaderboard: (kind: string) => get<LeaderboardRow[]>(`/api/leaderboard/${kind}`),
};
