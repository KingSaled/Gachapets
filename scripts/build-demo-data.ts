/**
 * Builds the data the self-contained demo artifact embeds:
 *   client/src/demo/generated/catalog.json  — live sets' species + every set's mascots
 *   client/src/demo/generated/sprites.json  — sprite path → data: URL for those species
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Catalog } from '../shared/src/types.ts';
import { SPRITE_FILES } from '../shared/src/sprites.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SPRITES = path.join(ROOT, 'assets', 'fakemon_itch_front_and_back');
const OUT = path.join(ROOT, 'client', 'src', 'demo', 'generated');
const LIVE = (process.env.LIVE_SETS ?? 'gen,neo').split(',');

const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'server', 'data', 'catalog.json'), 'utf8')) as Catalog;
const mascots = new Set(catalog.sets.flatMap((s) => s.mascots));
const species = catalog.species.filter((s) => LIVE.includes(s.set) || mascots.has(s.id));

const sprites: Record<string, string> = {};
for (const s of species) {
  const views = LIVE.includes(s.set) ? (['front', 'frontShiny', 'back', 'icon'] as const) : (['front', 'frontShiny'] as const);
  for (const v of views) {
    const rel = `/sprites/${s.family}/${s.dir}/${SPRITE_FILES[v]}`;
    const file = path.join(SPRITES, s.family, s.dir, SPRITE_FILES[v]);
    if (fs.existsSync(file)) sprites[rel] = `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`;
  }
}

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'catalog.json'), JSON.stringify({ ...catalog, species }));
fs.writeFileSync(path.join(OUT, 'sprites.json'), JSON.stringify(sprites));
const kb = (f: string) => (fs.statSync(path.join(OUT, f)).size / 1024).toFixed(0);
console.log(`demo data: ${species.length} species, ${Object.keys(sprites).length} sprites (catalog ${kb('catalog.json')} KB, sprites ${kb('sprites.json')} KB)`);
