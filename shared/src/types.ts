/** Core domain types shared by server and client. */

export const ELEMENTS = [
  'normal', 'fire', 'water', 'grass', 'electric', 'ice', 'fighting', 'poison', 'ground',
  'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy',
] as const;
export type Element = (typeof ELEMENTS)[number];

/** Species rarity is fixed by the card's printing (evolution stage + set role). */
export const RARITIES = ['common', 'uncommon', 'rare', 'star'] as const;
export type Rarity = (typeof RARITIES)[number];

/**
 * Finish is rolled when a card is pulled. Ordered from most to least common.
 * `living` is the "Animated Edition / Living Foil"; `misprint` is the
 * factory-error tier that prints the creature's back sprite.
 */
export const FINISHES = ['base', 'shiny', 'holo', 'parallax', 'pop3d', 'living', 'misprint'] as const;
export type Finish = (typeof FINISHES)[number];

export type Stage = 0 | 1 | 2;

export interface Species {
  /** `${family}-${stage}`, stable forever (DB references it). */
  id: string;
  family: string;
  stage: Stage;
  /** Sprite folder name for this stage: base | stage_1 | stage_2. */
  dir: string;
  name: string;
  /** The name as printed on a Factory Misprint (a deterministic typo). */
  misprintName: string;
  types: Element[];
  rarity: Rarity;
  set: string;
  /** Collector number within its set, 1-based. */
  no: number;
  hp: number;
  flavor: string;
  /** Number of stages in this species' evolution line. */
  lineSize: number;
}

export interface CardSet {
  id: string;
  code: string;
  name: string;
  /** 1-based release order. */
  index: number;
  tagline: string;
  /** Pack art hues (degrees) for the foil wrapper. */
  hueA: number;
  hueB: number;
  size: number;
  /** Star species shown on the pack wrapper. */
  mascots: string[];
  families: string[];
}

export interface Catalog {
  version: string;
  sets: CardSet[];
  species: Species[];
}

/** A physical card instance owned by someone. */
export interface CardDTO {
  id: number;
  speciesId: string;
  finish: Finish;
  /** Mint number within this species+finish printing (1 = first ever pulled). */
  mint: number;
  /** Print run cap for serialized finishes, else null. */
  printRun: number | null;
  mintedAt: number;
  ownerId: number;
  listingId: number | null;
}

export interface PublicUser {
  id: number;
  username: string;
  title: string | null;
  avatarSpecies: string | null;
  avatarFinish: Finish | null;
  theme: string;
}

export interface MeDTO extends PublicUser {
  coins: number;
  packsOpened: number;
  createdAt: number;
  dailyAvailable: boolean;
  dailyStreak: number;
  nextDailyAt: number;
  banner: string;
  bio: string;
  ownedCosmetics: string[];
  badges: string[];
  settings: { sfx: boolean; volume: number };
}

export interface PulledCard extends CardDTO {
  /** First copy of this species in the player's collection. */
  isNewForPlayer: boolean;
  /** First copy of this species pulled by anyone on the server. */
  isFirstDiscovery: boolean;
  quickSellValue: number;
  marketValue: number;
}

export interface PackResult {
  packId: number;
  setId: string;
  /** Cards in physical pack order (before the card trick). */
  cards: PulledCard[];
  /** Reveal order after the card trick: indices into `cards`. */
  revealOrder: number[];
  coins: number;
  newBadges: string[];
  completedLines: string[];
  rewardCoins: number;
}

export interface PrintKey {
  speciesId: string;
  finish: Finish;
}

export interface ListingDTO {
  id: number;
  price: number;
  createdAt: number;
  seller: PublicUser;
  card: CardDTO;
  marketValue: number;
}

export interface SaleDTO {
  id: number;
  speciesId: string;
  finish: Finish;
  price: number;
  at: number;
  mint: number;
  seller: string;
  buyer: string;
}

export interface PricePoint {
  at: number;
  value: number;
}

export interface PrintStats {
  speciesId: string;
  finish: Finish;
  marketValue: number;
  quickSellValue: number;
  referenceValue: number;
  change24h: number;
  change7d: number;
  minted: number;
  burned: number;
  circulating: number;
  printRun: number | null;
  activeListings: number;
  lowestAsk: number | null;
  sales7d: number;
  lastSale: SaleDTO | null;
  history: PricePoint[];
  recentSales: SaleDTO[];
  firstDiscoverer: { username: string; at: number } | null;
}

export type FeedEventType = 'pull' | 'discovery' | 'sale' | 'listing' | 'badge' | 'sellout';

export interface FeedEvent {
  id: number;
  type: FeedEventType;
  at: number;
  username: string;
  speciesId?: string;
  finish?: Finish;
  mint?: number;
  printRun?: number | null;
  price?: number;
  badge?: string;
  setId?: string;
}

export interface ProfileDTO {
  user: PublicUser & { banner: string; bio: string; createdAt: number };
  stats: {
    coins: number;
    portfolioValue: number;
    netWorth: number;
    packsOpened: number;
    cardsOwned: number;
    speciesOwned: number;
    linesCompleted: number;
    discoveries: number;
    salesCount: number;
  };
  rarestPull: CardDTO | null;
  showcase: (CardDTO | null)[];
  badges: { id: string; earnedAt: number }[];
  setProgress: { setId: string; owned: number; total: number }[];
}

export interface LeaderboardRow {
  rank: number;
  user: PublicUser;
  value: number;
}
