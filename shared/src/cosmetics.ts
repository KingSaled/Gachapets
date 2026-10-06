/** Profile cosmetics. Prices are a deliberate coin sink. */

export type CosmeticKind = 'theme' | 'banner';

export interface CosmeticDef {
  id: string;
  kind: CosmeticKind;
  name: string;
  desc: string;
  price: number;
  /** If set, unlocked for free by earning this badge instead of buying. */
  unlockBadge?: string;
  /** Theme tokens (hex). */
  colors?: { bg: string; panel: string; accent: string; accent2: string; ink: string };
}

export const COSMETICS: CosmeticDef[] = [
  // ── Themes ────────────────────────────────────────────
  {
    id: 'theme_arcade', kind: 'theme', name: 'Midnight Arcade', desc: 'The house style. Neon on ink.', price: 0,
    colors: { bg: '#0d0b1a', panel: '#1a1631', accent: '#ff4f8b', accent2: '#3cf2c4', ink: '#f4efff' },
  },
  {
    id: 'theme_sunset', kind: 'theme', name: 'Sunset Cartridge', desc: 'Warm dusk gradients, 16-bit summer.', price: 600,
    colors: { bg: '#1e0d1f', panel: '#33152e', accent: '#ff8a3d', accent2: '#ffd23f', ink: '#fff1e2' },
  },
  {
    id: 'theme_mint', kind: 'theme', name: 'Mint Terminal', desc: 'Phosphor green, humming CRT.', price: 600,
    colors: { bg: '#04130d', panel: '#0b241a', accent: '#4dff9a', accent2: '#b6ff4d', ink: '#d8ffe9' },
  },
  {
    id: 'theme_vapor', kind: 'theme', name: 'Vapor Mall', desc: 'Pastel food court at 3am.', price: 1200,
    colors: { bg: '#170f2b', panel: '#2a1c4a', accent: '#ff7ce5', accent2: '#7cf6ff', ink: '#fdf0ff' },
  },
  {
    id: 'theme_abyss', kind: 'theme', name: 'Abyssal Glow', desc: 'Bioluminescent deep-sea blues.', price: 1200,
    colors: { bg: '#02101c', panel: '#082338', accent: '#29c9ff', accent2: '#7d5cff', ink: '#e2f6ff' },
  },
  {
    id: 'theme_sakura', kind: 'theme', name: 'Sakura Static', desc: 'Petals drifting through signal noise.', price: 1500,
    colors: { bg: '#1c0e16', panel: '#341a28', accent: '#ff9ec7', accent2: '#ffe0f0', ink: '#fff0f7' },
  },
  {
    id: 'theme_gold', kind: 'theme', name: 'Gilded Vault', desc: 'For collectors who have made it.', price: 6000,
    colors: { bg: '#120d02', panel: '#2a1f06', accent: '#ffd23f', accent2: '#fff3b0', ink: '#fff8de' },
  },
  {
    id: 'theme_glitch', kind: 'theme', name: 'Glitch Core', desc: 'Unlocked by pulling a Factory Misprint.', price: 0,
    unlockBadge: 'pull_misprint',
    colors: { bg: '#0a0a0a', panel: '#161616', accent: '#ff2a2a', accent2: '#2affd5', ink: '#f2f2f2' },
  },

  // ── Animated banners ─────────────────────────────────
  { id: 'banner_stars', kind: 'banner', name: 'Starfield', desc: 'Drifting pixel stars.', price: 0 },
  { id: 'banner_grid', kind: 'banner', name: 'Horizon Grid', desc: 'An endless synth highway.', price: 800 },
  { id: 'banner_rain', kind: 'banner', name: 'Pixel Rain', desc: 'Neon drizzle on glass.', price: 800 },
  { id: 'banner_bubbles', kind: 'banner', name: 'Capsule Fizz', desc: 'Gacha capsules floating upward.', price: 900 },
  { id: 'banner_embers', kind: 'banner', name: 'Ember Drift', desc: 'Sparks rising from a forge.', price: 1000 },
  { id: 'banner_aurora', kind: 'banner', name: 'Aurora Ribbon', desc: 'Slow polar light.', price: 2200 },
  {
    id: 'banner_living', kind: 'banner', name: 'Living Prism', desc: 'Unlocked by pulling a Living Foil.', price: 0,
    unlockBadge: 'pull_living',
  },
];

export const DEFAULT_THEME = 'theme_arcade';
export const DEFAULT_BANNER = 'banner_stars';

export function cosmeticById(id: string): CosmeticDef | undefined {
  return COSMETICS.find((c) => c.id === id);
}
