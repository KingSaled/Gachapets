import type { CardSet, Element } from './types.ts';
import { ELEMENTS } from './types.ts';

export type BadgeTier = 'bronze' | 'silver' | 'gold' | 'prism';

export interface BadgeDef {
  id: string;
  name: string;
  desc: string;
  /** Pixel glyph shown on the badge medallion. */
  icon: string;
  tier: BadgeTier;
  reward: number;
  /** Title tag unlocked for the profile, if any. */
  title?: string;
  /** Hidden until earned. */
  secret?: boolean;
}

const STATIC: BadgeDef[] = [
  // Packs
  { id: 'packs_1', name: 'First Rip', desc: 'Open your first pack.', icon: '✂', tier: 'bronze', reward: 0, title: 'Rookie Ripper' },
  { id: 'packs_10', name: 'Pack Rat', desc: 'Open 10 packs.', icon: '▤', tier: 'bronze', reward: 60 },
  { id: 'packs_50', name: 'Foil Fiend', desc: 'Open 50 packs.', icon: '▦', tier: 'silver', reward: 200, title: 'Foil Fiend' },
  { id: 'packs_100', name: 'Wrapper Hoarder', desc: 'Open 100 packs.', icon: '▩', tier: 'silver', reward: 400 },
  { id: 'packs_500', name: 'Rip Machine', desc: 'Open 500 packs.', icon: '⚙', tier: 'gold', reward: 1500, title: 'Rip Machine' },
  { id: 'packs_1000', name: 'Thousand Tears', desc: 'Open 1,000 packs.', icon: '♛', tier: 'prism', reward: 4000, title: 'Legendary Ripper' },

  // Pull firsts
  { id: 'pull_shiny', name: 'Something Shiny', desc: 'Pull a Shiny card.', icon: '✧', tier: 'bronze', reward: 20 },
  { id: 'pull_holo', name: 'Prism Break', desc: 'Pull a Holofoil card.', icon: '◈', tier: 'bronze', reward: 40 },
  { id: 'pull_parallax', name: 'Depth Perception', desc: 'Pull a Parallax card.', icon: '◫', tier: 'silver', reward: 100, title: 'Deep Diver' },
  { id: 'pull_pop3d', name: 'Pop Culture', desc: 'Pull a 3D Pop card.', icon: '▣', tier: 'gold', reward: 250, title: 'Voxel Visionary' },
  { id: 'pull_living', name: "It's Alive!", desc: 'Pull a Living Foil card.', icon: '❤', tier: 'gold', reward: 600, title: 'Life Giver' },
  { id: 'pull_misprint', name: 'Quality Control', desc: 'Pull a Factory Misprint. There is only one of each.', icon: '⚠', tier: 'prism', reward: 2000, title: 'Misprint Hunter', secret: true },
  { id: 'pull_star', name: 'Wish Upon', desc: 'Pull a Star Rare species.', icon: '✦', tier: 'silver', reward: 50 },

  // Evolution lines
  { id: 'lines_1', name: 'Full Evolution', desc: 'Complete an evolution line.', icon: '⇶', tier: 'bronze', reward: 30 },
  { id: 'lines_10', name: 'Line Weaver', desc: 'Complete 10 evolution lines.', icon: '⇶', tier: 'silver', reward: 150, title: 'Line Weaver' },
  { id: 'lines_50', name: 'Family Tree', desc: 'Complete 50 evolution lines.', icon: '♣', tier: 'gold', reward: 700, title: 'Genealogist' },
  { id: 'lines_200', name: 'Living Archive', desc: 'Complete 200 evolution lines.', icon: '❦', tier: 'prism', reward: 3000, title: 'Archivist' },

  // Discovery
  { id: 'disc_1', name: 'Trailblazer', desc: 'Be the first player ever to pull a species.', icon: '⚑', tier: 'bronze', reward: 25 },
  { id: 'disc_25', name: 'Pioneer', desc: 'First to discover 25 species.', icon: '⚑', tier: 'silver', reward: 250, title: 'Pioneer' },
  { id: 'disc_100', name: 'Cartographer', desc: 'First to discover 100 species.', icon: '⌖', tier: 'gold', reward: 1000, title: 'Cartographer' },

  // Collection breadth
  { id: 'species_50', name: 'Field Notes', desc: 'Own 50 different species.', icon: '✎', tier: 'bronze', reward: 80 },
  { id: 'species_250', name: 'Naturalist', desc: 'Own 250 different species.', icon: '✿', tier: 'silver', reward: 400, title: 'Naturalist' },
  { id: 'species_1000', name: 'Menagerie', desc: 'Own 1,000 different species.', icon: '❀', tier: 'gold', reward: 2500, title: 'Menagerie Keeper' },

  // Trading
  { id: 'trade_first_sale', name: 'Open for Business', desc: 'Sell a card on the market.', icon: '¢', tier: 'bronze', reward: 20 },
  { id: 'trade_first_buy', name: 'Window Shopper', desc: 'Buy a card on the market.', icon: '⊕', tier: 'bronze', reward: 20 },
  { id: 'trade_10_sales', name: 'Merchant', desc: 'Sell 10 cards on the market.', icon: '⚖', tier: 'silver', reward: 150, title: 'Merchant' },
  { id: 'trade_100_sales', name: 'Market Maker', desc: 'Sell 100 cards on the market.', icon: '♜', tier: 'gold', reward: 1000, title: 'Market Maker' },
  { id: 'trade_whale', name: 'Whale Deal', desc: 'Complete a single sale worth 5,000+ coins.', icon: '◉', tier: 'gold', reward: 0, title: 'Whale', secret: true },
];

export const TYPE_BADGE_THRESHOLD = 25;

const ELEMENT_TITLES: Record<Element, string> = {
  normal: 'Plainsfolk', fire: 'Pyromancer', water: 'Tidecaller', grass: 'Greenkeeper', electric: 'Sparkwright',
  ice: 'Frostborn', fighting: 'Dojo Master', poison: 'Toxicologist', ground: 'Earthshaker', flying: 'Skywatcher',
  psychic: 'Mindreader', bug: 'Entomologist', rock: 'Stonecutter', ghost: 'Medium', dragon: 'Dragonheart',
  dark: 'Nightstalker', steel: 'Ironclad', fairy: 'Fae Friend',
};

function typeBadges(): BadgeDef[] {
  return ELEMENTS.map((el) => ({
    id: `type_${el}`,
    name: `${el[0].toUpperCase()}${el.slice(1)} Specialist`,
    desc: `Own ${TYPE_BADGE_THRESHOLD} different ${el}-type species.`,
    icon: '◆',
    tier: 'silver' as const,
    reward: 120,
    title: ELEMENT_TITLES[el],
  }));
}

export function setBadges(set: CardSet): BadgeDef[] {
  return [
    {
      id: `set_${set.id}_common`, name: `${set.name}: Commons`, desc: `Own every Common in ${set.name}.`,
      icon: '●', tier: 'bronze', reward: 150,
    },
    {
      id: `set_${set.id}_uncommon`, name: `${set.name}: Uncommons`, desc: `Own every Uncommon in ${set.name}.`,
      icon: '◆', tier: 'silver', reward: 300,
    },
    {
      id: `set_${set.id}_rare`, name: `${set.name}: Rares`, desc: `Own every Rare and Star Rare in ${set.name}.`,
      icon: '★', tier: 'gold', reward: 1200,
    },
    {
      id: `set_${set.id}_full`, name: `${set.name} Complete`, desc: `Own every card in ${set.name}.`,
      icon: '♛', tier: 'gold', reward: 2500, title: `${set.code} Completionist`,
    },
    {
      id: `set_${set.id}_shiny`, name: `${set.name}: Shiny Dex`, desc: `Own a Shiny (or better) of every card in ${set.name}.`,
      icon: '✧', tier: 'prism', reward: 8000, title: `${set.code} Shiny Master`,
    },
  ];
}

export function allBadges(sets: CardSet[]): BadgeDef[] {
  return [...STATIC, ...typeBadges(), ...sets.flatMap(setBadges)];
}

export const DEFAULT_TITLES = ['Collector', 'Rookie', 'Trader', 'Pet Lover'];
