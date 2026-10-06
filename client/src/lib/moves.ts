/**
 * Deterministic card "moves" — flavor that makes every print read like a
 * real TCG card. Derived from species id, so they never change.
 */
import type { Element, Species } from '@gachapets/shared';
import { pick, seededRng } from '@gachapets/shared';

const FIRST: Record<Element, string[]> = {
  fire: ['Ember', 'Cinder', 'Blaze', 'Scorch', 'Flare', 'Kindle', 'Magma', 'Ash'],
  water: ['Tide', 'Ripple', 'Brine', 'Surf', 'Splash', 'Torrent', 'Bubble'],
  grass: ['Leaf', 'Vine', 'Bloom', 'Thorn', 'Moss', 'Petal', 'Root'],
  electric: ['Volt', 'Spark', 'Static', 'Thunder', 'Jolt', 'Arc', 'Zap'],
  ice: ['Frost', 'Rime', 'Glacier', 'Sleet', 'Hail', 'Chill'],
  fighting: ['Iron', 'Rising', 'Palm', 'Spinning', 'Focus', 'Brick'],
  poison: ['Toxic', 'Venom', 'Sludge', 'Blight', 'Acid'],
  ground: ['Quake', 'Mud', 'Sand', 'Dune', 'Bedrock', 'Dust'],
  flying: ['Gust', 'Aerial', 'Wind', 'Sky', 'Feather', 'Gale'],
  psychic: ['Mind', 'Astral', 'Dream', 'Psy', 'Echo', 'Prism'],
  bug: ['Swarm', 'Silk', 'Pin', 'Buzz', 'Mandible', 'Hive'],
  rock: ['Stone', 'Boulder', 'Crag', 'Shard', 'Pebble', 'Rock'],
  ghost: ['Spectral', 'Phantom', 'Haunt', 'Shadow', 'Hex', 'Wisp'],
  dragon: ['Draco', 'Wyrm', 'Scale', 'Dragon', 'Elder', 'Rage'],
  dark: ['Night', 'Shade', 'Umbral', 'Murk', 'Feint', 'Dusk'],
  steel: ['Steel', 'Iron', 'Gear', 'Bolt', 'Chrome', 'Alloy'],
  fairy: ['Moon', 'Glitter', 'Charm', 'Fae', 'Sparkle', 'Wish'],
  normal: ['Quick', 'Tackle', 'Hyper', 'Body', 'Mega', 'Snug'],
};

const SECOND = [
  'Snap', 'Rush', 'Burst', 'Bite', 'Wave', 'Swipe', 'Pounce', 'Storm', 'Slam', 'Strike', 'Dance', 'Breath', 'Fang',
  'Spiral', 'Pulse', 'Crash', 'Kick', 'Beam', 'Lash', 'Barrage', 'Drift', 'Howl', 'Nibble', 'Flurry',
];

export interface Move {
  name: string;
  cost: Element[];
  damage: string;
}

const cache = new Map<string, Move[]>();

export function movesFor(sp: Species): Move[] {
  const hit = cache.get(sp.id);
  if (hit) return hit;
  const rng = seededRng(`moves:${sp.id}`);
  const count = sp.stage === 0 && sp.lineSize > 1 ? 1 : 2;
  const used = new Set<string>();
  const moves: Move[] = [];
  for (let i = 0; i < count; i++) {
    const el = i === 1 && sp.types[1] ? sp.types[1] : sp.types[0];
    let name = '';
    for (let tries = 0; tries < 6 && (!name || used.has(name)); tries++) name = `${pick(rng, FIRST[el])} ${pick(rng, SECOND)}`;
    used.add(name);
    const tier = sp.stage + (sp.lineSize === 1 ? 2 : 0) + i;
    const costN = Math.min(4, 1 + Math.floor(tier / 1.5) + (rng() < 0.3 ? 1 : 0));
    const cost: Element[] = Array.from({ length: costN }, (_, k) => (k === costN - 1 && costN > 1 && rng() < 0.5 ? 'normal' : el));
    const dmg = 10 * (1 + tier * 2 + Math.floor(rng() * 3)) + (sp.rarity === 'star' ? 20 : 0);
    const suffix = rng() < 0.18 ? '+' : rng() < 0.1 ? '×' : '';
    moves.push({ name, cost, damage: `${dmg}${suffix}` });
  }
  cache.set(sp.id, moves);
  return moves;
}
