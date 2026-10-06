import type { Finish } from './types.ts';

/**
 * Sprite files exposed by the server under /sprites/<family>/<dir>/<file>.
 * Only transparent (`_nobg`) variants are used for card art.
 */
export const SPRITE_FILES = {
  front: 'front_nobg.png',
  frontShiny: 'front_shiny_nobg.png',
  back: 'back_nobg.png',
  backShiny: 'back_shiny_nobg.png',
  icon: 'icon_nobg.png',
  footprint: 'footprint.png',
} as const;

export type SpriteView = keyof typeof SPRITE_FILES;

export const SPRITE_ALLOWLIST = new Set<string>(Object.values(SPRITE_FILES));

let resolver: ((path: string) => string) | null = null;

/** Lets a host (e.g. the self-contained demo build) serve sprites from somewhere other than /sprites. */
export function setSpriteResolver(fn: ((path: string) => string) | null) {
  resolver = fn;
}

export function spriteUrl(species: { family: string; dir: string }, view: SpriteView): string {
  const path = `/sprites/${species.family}/${species.dir}/${SPRITE_FILES[view]}`;
  return resolver ? resolver(path) : path;
}

/** The sprite that is the card's main art for a given finish. */
export function artViewForFinish(finish: Finish): SpriteView {
  if (finish === 'misprint') return 'back';
  if (finish === 'shiny') return 'frontShiny';
  return 'front';
}

export function stageDir(stage: 0 | 1 | 2): string {
  return stage === 0 ? 'base' : `stage_${stage}`;
}
