/**
 * Builds server/data/catalog.json from the sprite library.
 *
 *   npm run catalog
 *
 * Deterministic: the same sprite folder always produces the same catalog.
 * Adding or removing sprite folders changes the shuffle, so once real players
 * hold cards treat the committed catalog.json as frozen and append new sets
 * instead of regenerating (species ids are stable, but names/sets are not).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ELEMENTS, type CardSet, type Catalog, type Element, type Rarity, type Species, type Stage } from '../shared/src/types.ts';
import { seededRng, shuffle, randInt } from '../shared/src/rng.ts';
import { SPRITE_FILES, stageDir } from '../shared/src/sprites.ts';
import { misprintOf, nameLine } from './naming.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SPRITES = path.join(ROOT, 'assets', 'fakemon_itch_front_and_back');
const OUT = path.join(ROOT, 'server', 'data', 'catalog.json');

const FAMILIES_PER_SET = 48;
const STARS_PER_SET = 8;
const CATALOG_SEED = 'gachapets-v1';

const SET_META: { code: string; name: string; tagline: string; hueA: number; hueB: number }[] = [
  { code: 'GEN', name: 'Genesis Clutch', tagline: 'Where every collection hatches.', hueA: 330, hueB: 190 },
  { code: 'NEO', name: 'Neon Hatchery', tagline: 'Fresh from the incubator glow.', hueA: 280, hueB: 160 },
  { code: 'STB', name: 'Static Bloom', tagline: 'Flowers that crackle when touched.', hueA: 55, hueB: 300 },
  { code: 'ASH', name: 'Ashen Skies', tagline: 'Embers drift over a scorched horizon.', hueA: 15, hueB: 40 },
  { code: 'MML', name: 'Moonlit Molt', tagline: 'Shed your skin under silver light.', hueA: 230, hueB: 260 },
  { code: 'CRL', name: 'Coral Arcade', tagline: 'High scores beneath the reef.', hueA: 350, hueB: 175 },
  { code: 'THN', name: 'Thunder Nest', tagline: 'Born in the eye of the storm.', hueA: 50, hueB: 220 },
  { code: 'VLG', name: 'Velvet Gloom', tagline: 'Soft shadows, sharp teeth.', hueA: 285, hueB: 330 },
  { code: 'PRB', name: 'Prism Burrow', tagline: 'Light bends deep underground.', hueA: 30, hueB: 200 },
  { code: 'GLF', name: 'Ghostlight Fair', tagline: 'Rides that never quite stop.', hueA: 260, hueB: 120 },
  { code: 'IRC', name: 'Iron Canopy', tagline: 'A forest forged in steel.', hueA: 140, hueB: 210 },
  { code: 'DRF', name: 'Dreamforge', tagline: 'Hammered from sleeping thoughts.', hueA: 300, hueB: 25 },
  { code: 'FRQ', name: 'Feral Frequencies', tagline: 'Wild signals on every channel.', hueA: 100, hueB: 320 },
  { code: 'SOL', name: 'Solar Shed', tagline: 'Basking in the long noon.', hueA: 45, hueB: 15 },
  { code: 'WYR', name: 'Wyrmwood Wilds', tagline: 'Old roots, older scales.', hueA: 120, hueB: 35 },
  { code: 'PXT', name: 'Pixel Tempest', tagline: 'A storm rendered one block at a time.', hueA: 200, hueB: 275 },
  { code: 'HLH', name: 'Hollow Harvest', tagline: 'Gather what the moon left behind.', hueA: 25, hueB: 270 },
  { code: 'CRY', name: 'Crystal Cartridge', tagline: 'Blow on it. Try again.', hueA: 185, hueB: 300 },
  { code: 'MNM', name: 'Midnight Menagerie', tagline: 'Doors open after dark.', hueA: 245, hueB: 345 },
  { code: 'GLG', name: 'Glitch Garden', tagline: 'Something sprouted in the source code.', hueA: 130, hueB: 330 },
  { code: 'SBS', name: 'Stormbound Saga', tagline: 'Chapters written in lightning.', hueA: 215, hueB: 55 },
  { code: 'LNT', name: 'Lantern Tide', tagline: 'Lights bobbing on black water.', hueA: 35, hueB: 205 },
  { code: 'CNC', name: 'Cinder Carnival', tagline: 'Hot rides. Hotter prizes.', hueA: 5, hueB: 300 },
  { code: 'STS', name: 'Starlit Static', tagline: 'Constellations with a buzz.', hueA: 240, hueB: 60 },
  { code: 'MYM', name: 'Mythic Molt', tagline: 'Legends grow new skins.', hueA: 160, hueB: 45 },
  { code: 'ECH', name: 'Echo Hive', tagline: 'Every voice comes back louder.', hueA: 50, hueB: 280 },
  { code: 'GGL', name: 'Gilded Gale', tagline: 'Golden winds, heavy pockets.', hueA: 48, hueB: 180 },
  { code: 'FBF', name: 'Fable Frontier', tagline: "Maps end here. Stories don't.", hueA: 20, hueB: 150 },
  { code: 'PHP', name: 'Phantom Parade', tagline: 'March of the not-quite-there.', hueA: 270, hueB: 190 },
  { code: 'AUR', name: 'Aurora Arcadia', tagline: 'The final screen glows forever.', hueA: 165, hueB: 290 },
];

interface FamilyRaw {
  family: string;
  types: Element[];
  theme: string;
  stages: Stage[];
}

function parseTypes(raw: string, family: string): Element[] {
  const fromSummary = raw.toLowerCase().split(/\s*(?:and|,|\/|&)\s*/).map((s) => s.trim()).filter(Boolean);
  const fromFolder = family.replace(/_\d+$/, '').split('_');
  const pickValid = (list: string[]) => list.filter((t): t is Element => (ELEMENTS as readonly string[]).includes(t));
  const types = pickValid(fromSummary).length ? pickValid(fromSummary) : pickValid(fromFolder);
  return [...new Set(types)].slice(0, 2);
}

function cleanTheme(theme: string): string {
  let t = theme.trim().replace(/^["'“”]+|["'“”]+$/g, '').replace(/\s+/g, ' ').trim();
  if (!/[.!?]$/.test(t)) t += '.';
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function flavorFor(theme: string): string {
  const max = 150;
  if (theme.length <= max) return theme;
  const cut = theme.slice(0, max);
  const sentence = cut.lastIndexOf('. ');
  if (sentence > 80) return cut.slice(0, sentence + 1);
  return cut.slice(0, cut.lastIndexOf(' ')).replace(/[,;:]$/, '') + '…';
}

function stageComplete(dir: string): boolean {
  return [SPRITE_FILES.front, SPRITE_FILES.frontShiny, SPRITE_FILES.back, SPRITE_FILES.icon]
    .every((f) => fs.existsSync(path.join(dir, f)));
}

function scan(): FamilyRaw[] {
  const out: FamilyRaw[] = [];
  const skipped: string[] = [];
  for (const family of fs.readdirSync(SPRITES).sort()) {
    const fdir = path.join(SPRITES, family);
    if (!fs.statSync(fdir).isDirectory()) continue;
    const summaryPath = path.join(fdir, 'evolution_summary.json');
    if (!fs.existsSync(summaryPath)) { skipped.push(`${family} (no summary)`); continue; }
    const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
    const types = parseTypes(String(summary.pokemon_types ?? ''), family);
    if (!types.length) { skipped.push(`${family} (no types)`); continue; }
    const stages: Stage[] = [];
    for (const s of [0, 1, 2] as Stage[]) {
      if (stageComplete(path.join(fdir, stageDir(s)))) stages.push(s);
      else if (fs.existsSync(path.join(fdir, stageDir(s)))) skipped.push(`${family}/${stageDir(s)} (incomplete sprites)`);
    }
    if (!stages.length) { skipped.push(`${family} (no stages)`); continue; }
    out.push({ family, types, theme: cleanTheme(String(summary.evolution_theme ?? '')), stages });
  }
  if (skipped.length) console.log(`Skipped ${skipped.length}:\n  ${skipped.join('\n  ')}`);
  return out;
}

function build(): Catalog {
  const families = scan();
  const order = shuffle(seededRng(`${CATALOG_SEED}:order`), families);
  const takenNames = new Set<string>();
  const sets: CardSet[] = [];
  const species: Species[] = [];

  const setCount = Math.ceil(order.length / FAMILIES_PER_SET);
  for (let si = 0; si < setCount; si++) {
    const meta = SET_META[si] ?? {
      code: `S${String(si + 1).padStart(2, '0')}`, name: `Series ${si + 1}`, tagline: 'More to discover.', hueA: (si * 47) % 360, hueB: (si * 47 + 150) % 360,
    };
    const setId = meta.code.toLowerCase();
    const members = order.slice(si * FAMILIES_PER_SET, (si + 1) * FAMILIES_PER_SET);
    // Collector order: by primary element, then family — evolution lines stay adjacent.
    members.sort((a, b) => ELEMENTS.indexOf(a.types[0]) - ELEMENTS.indexOf(b.types[0]) || a.family.localeCompare(b.family, 'en', { numeric: true }));

    const finals = members.map((f) => `${f.family}-${f.stages[f.stages.length - 1]}`);
    const starIds = new Set(shuffle(seededRng(`${CATALOG_SEED}:stars:${setId}`), finals).slice(0, STARS_PER_SET));

    let no = 0;
    const setSpecies: Species[] = [];
    for (const fam of members) {
      const names = nameLine({ family: fam.family, types: fam.types, theme: fam.theme, stages: fam.stages.length }, takenNames);
      fam.stages.forEach((stage, i) => {
        const id = `${fam.family}-${stage}`;
        const isFinal = i === fam.stages.length - 1;
        const rarity: Rarity = isFinal ? (starIds.has(id) ? 'star' : 'rare') : i === 0 ? 'common' : 'uncommon';
        const hpRng = seededRng(`hp:${id}`);
        const hpBase = [[30, 60], [70, 110], [120, 180]][Math.min(i + (fam.stages.length === 2 && isFinal ? 1 : 0), 2)];
        const hp = randInt(hpRng, hpBase[0] / 10, hpBase[1] / 10) * 10 + (rarity === 'star' ? 20 : 0);
        const sp: Species = {
          id,
          family: fam.family,
          stage,
          dir: stageDir(stage),
          name: names[i],
          misprintName: misprintOf(names[i], id),
          types: fam.types,
          rarity,
          set: setId,
          no: ++no,
          hp,
          flavor: flavorFor(fam.theme),
          lineSize: fam.stages.length,
        };
        setSpecies.push(sp);
      });
    }
    species.push(...setSpecies);
    const stars = setSpecies.filter((s) => s.rarity === 'star');
    sets.push({
      id: setId,
      code: meta.code,
      name: meta.name,
      index: si + 1,
      tagline: meta.tagline,
      hueA: meta.hueA,
      hueB: meta.hueB,
      size: setSpecies.length,
      mascots: stars.slice(0, 3).map((s) => s.id),
      families: members.map((m) => m.family),
    });
  }

  return { version: `${CATALOG_SEED}+${species.length}`, sets, species };
}

const catalog = build();
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(catalog));

const byRarity = catalog.species.reduce<Record<string, number>>((acc, s) => ((acc[s.rarity] = (acc[s.rarity] ?? 0) + 1), acc), {});
console.log(`Catalog ${catalog.version}: ${catalog.sets.length} sets, ${catalog.species.length} species`, byRarity);
console.log('Sample names:', catalog.species.slice(0, 24).map((s) => s.name).join(', '));
console.log(`Wrote ${path.relative(ROOT, OUT)} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`);
