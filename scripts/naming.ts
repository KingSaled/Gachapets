/**
 * Procedural creature naming.
 *
 * The sprite pack ships without names, so every evolution line gets a
 * deterministic, pronounceable name family built from its element(s) and the
 * creature noun in its theme ("Flame-dusted moths…" → Cinderlet → Cindermoth
 * → Blazmothra). Stages share a root the way real evolution lines do.
 */
import type { Element } from '../shared/src/types.ts';
import { type Rng, pick, seededRng } from '../shared/src/rng.ts';

const TYPE_ROOTS: Record<Element, string[]> = {
  fire: ['cinder', 'ember', 'pyro', 'blaze', 'scorch', 'flare', 'kindle', 'magma', 'char', 'ignis', 'sear'],
  water: ['aqua', 'tide', 'brine', 'ripple', 'marin', 'hydro', 'surf', 'wave'],
  grass: ['leaf', 'bloom', 'sprig', 'moss', 'thorn', 'fern', 'verdi', 'bramble'],
  electric: ['volt', 'zap', 'spark', 'static', 'amp', 'jolt', 'thunder', 'ohm', 'fizz'],
  ice: ['frost', 'glaci', 'rime', 'cryo', 'sleet', 'chill', 'snow'],
  fighting: ['brawl', 'jab', 'dojo', 'fist', 'grit', 'kick', 'rumble', 'bash'],
  poison: ['tox', 'venom', 'miasm', 'sludge', 'blight', 'nox'],
  ground: ['terra', 'dune', 'burrow', 'clay', 'quake', 'mud', 'loam'],
  flying: ['gust', 'aero', 'zephyr', 'sky', 'plume', 'soar', 'breeze', 'wing'],
  psychic: ['psy', 'mind', 'astra', 'menta', 'oracle', 'dream', 'aura'],
  bug: ['skitter', 'chitin', 'buzz', 'mandi', 'larva', 'weevil', 'hive'],
  rock: ['petra', 'crag', 'boulder', 'flint', 'shale', 'gem', 'pebble'],
  ghost: ['spectra', 'wisp', 'phanto', 'haunt', 'boo', 'shroud', 'gloom', 'wraith'],
  dragon: ['drako', 'wyrm', 'scale', 'draco', 'fang', 'rex', 'serpa'],
  dark: ['umbra', 'nocti', 'shade', 'murk', 'dusk', 'nyx', 'sable'],
  steel: ['ferro', 'chrome', 'rivet', 'alloy', 'bolt', 'cog'],
  fairy: ['glim', 'pixie', 'twinkle', 'fae', 'luma', 'charm', 'sugar', 'lumi'],
  normal: ['pip', 'bun', 'tuff', 'snug', 'fuzz', 'patch', 'puff'],
};

/** Creature nouns found in themes → [head fragment, tail fragment]. */
const CREATURES: Record<string, [string, string]> = {
  moth: ['moth', 'moth'], beetle: ['beet', 'tle'], dragon: ['drag', 'gon'], serpent: ['serp', 'pent'],
  phoenix: ['phoen', 'nix'], quetzal: ['quetz', 'zal'], fox: ['fox', 'fox'], fennec: ['fenn', 'nec'],
  wolf: ['wolf', 'wolf'], cat: ['cat', 'cat'], owl: ['owl', 'owl'], bird: ['bird', 'bird'],
  bear: ['bear', 'bear'], crab: ['crab', 'crab'], shark: ['shark', 'shark'], fish: ['fish', 'fin'],
  mantis: ['mant', 'tis'], scorpion: ['scorp', 'pion'], lizard: ['liz', 'zard'], gecko: ['geck', 'ko'],
  chameleon: ['chame', 'leon'], jellyfish: ['jelly', 'jel'], badger: ['badg', 'dger'], peacock: ['peac', 'cock'],
  aardvark: ['aard', 'vark'], mammoth: ['mamm', 'moth'], dragonfly: ['dragon', 'fly'], drake: ['drake', 'drake'],
  wyvern: ['wyv', 'vern'], leviathan: ['levi', 'than'], turtle: ['turt', 'tle'], tortoise: ['tort', 'toise'],
  snake: ['snake', 'snek'], cobra: ['cobr', 'bra'], viper: ['vipe', 'per'], eel: ['eel', 'eel'],
  octopus: ['octo', 'pus'], squid: ['squid', 'quid'], whale: ['whal', 'whale'], dolphin: ['dolph', 'phin'],
  seal: ['seal', 'seal'], otter: ['ott', 'otter'], beaver: ['beav', 'ver'], rabbit: ['rabb', 'bit'],
  bunny: ['bun', 'bun'], hare: ['hare', 'hare'], mouse: ['mous', 'mouse'], rat: ['rat', 'rat'],
  squirrel: ['squirr', 'rel'], hedgehog: ['hedge', 'hog'], porcupine: ['porcu', 'pine'], pangolin: ['pango', 'lin'],
  armadillo: ['armad', 'dillo'], sloth: ['sloth', 'sloth'], monkey: ['monk', 'key'], ape: ['ape', 'ape'],
  gorilla: ['gori', 'rilla'], mandrill: ['mandr', 'drill'], lemur: ['lem', 'mur'], panda: ['pand', 'da'],
  tiger: ['tig', 'ger'], lion: ['lion', 'leon'], panther: ['panth', 'ther'], jaguar: ['jag', 'guar'],
  lynx: ['lynx', 'lynx'], leopard: ['leop', 'pard'], hyena: ['hyen', 'ena'], jackal: ['jack', 'kal'],
  deer: ['deer', 'deer'], stag: ['stag', 'stag'], elk: ['elk', 'elk'], moose: ['moos', 'moose'],
  ram: ['ram', 'ram'], goat: ['goat', 'goat'], bull: ['bull', 'bull'], ox: ['ox', 'ox'], boar: ['boar', 'boar'],
  horse: ['hors', 'horse'], unicorn: ['unic', 'corn'], pegasus: ['peg', 'gasus'], llama: ['llam', 'ama'],
  camel: ['cam', 'mel'], rhino: ['rhin', 'no'], hippo: ['hipp', 'po'], elephant: ['eleph', 'phant'],
  tapir: ['tap', 'pir'], kangaroo: ['kang', 'roo'], koala: ['koal', 'ala'], wombat: ['womb', 'bat'],
  bat: ['bat', 'bat'], raven: ['rav', 'ven'], crow: ['crow', 'crow'], hawk: ['hawk', 'hawk'], eagle: ['eagl', 'gle'],
  falcon: ['falc', 'con'], raptor: ['rapt', 'tor'], heron: ['her', 'ron'], ibis: ['ibis', 'bis'], crane: ['cran', 'crane'],
  swan: ['swan', 'swan'], goose: ['goos', 'goose'], duck: ['duck', 'duck'], penguin: ['peng', 'guin'],
  parrot: ['parr', 'rot'], toucan: ['touc', 'can'], hummingbird: ['humm', 'bird'], woodpecker: ['wood', 'peck'],
  kiwi: ['kiwi', 'wi'], flamingo: ['flam', 'mingo'], pelican: ['peli', 'can'], griffin: ['griff', 'fin'],
  frog: ['frog', 'frog'], toad: ['toad', 'toad'], newt: ['newt', 'newt'], salamander: ['sala', 'mander'],
  axolotl: ['axo', 'lotl'], spider: ['spid', 'der'], ant: ['ant', 'ant'], bee: ['bee', 'bee'], wasp: ['wasp', 'wasp'],
  hornet: ['horn', 'net'], firefly: ['fire', 'fly'], butterfly: ['butter', 'fly'], caterpillar: ['cater', 'pillar'],
  larva: ['larv', 'va'], snail: ['snail', 'nail'], slug: ['slug', 'slug'], worm: ['worm', 'worm'], flatworm: ['flat', 'worm'],
  scarab: ['scar', 'rab'], cicada: ['cica', 'cada'], cricket: ['crick', 'ket'], locust: ['locu', 'cust'],
  weevil: ['weev', 'vil'], flea: ['flea', 'flea'], tick: ['tick', 'tick'], tardigrade: ['tardi', 'grade'],
  coral: ['cor', 'ral'], urchin: ['urch', 'chin'], starfish: ['star', 'fish'], seahorse: ['seah', 'horse'],
  lobster: ['lob', 'ster'], shrimp: ['shrim', 'mp'], crustacean: ['crust', 'cean'], kraken: ['krak', 'ken'],
  hydra: ['hydr', 'dra'], basilisk: ['basil', 'lisk'], chimera: ['chim', 'mera'], minotaur: ['mino', 'taur'],
  golem: ['gole', 'lem'], gargoyle: ['garg', 'goyle'], sphinx: ['sphin', 'phinx'], kirin: ['kir', 'rin'],
  dino: ['dino', 'don'], dinosaur: ['dino', 'saur'], ichthyosaur: ['ichthy', 'saur'], raccoon: ['racc', 'coon'],
  skunk: ['skunk', 'skunk'], weasel: ['weas', 'sel'], ferret: ['ferr', 'ret'], mole: ['mole', 'mole'],
  binturong: ['bint', 'rong'], wolverine: ['wolv', 'rine'], lantern: ['lant', 'tern'], lotus: ['lot', 'tus'],
  mushroom: ['mush', 'room'], orchid: ['orch', 'chid'], blossom: ['bloss', 'som'], cactus: ['cact', 'tus'],
  mask: ['mask', 'mask'], knight: ['knigh', 'night'], samurai: ['samu', 'rai'], ninja: ['ninj', 'nja'],
  monk: ['monk', 'monk'], titan: ['tit', 'tan'], wraith: ['wraith', 'raith'], specter: ['spect', 'ter'],
  phantom: ['phant', 'tom'], wisp: ['wisp', 'wisp'], sprite: ['sprit', 'rite'], faerie: ['fae', 'rie'],
  fairy: ['fair', 'ry'], imp: ['imp', 'imp'], djinn: ['djin', 'jinn'], yeti: ['yet', 'ti'], kitsune: ['kits', 'sune'],
  manta: ['mant', 'ta'], ray: ['ray', 'ray'], piranha: ['piran', 'ranha'], anglerfish: ['angl', 'gler'],
  puffer: ['puff', 'fer'], nautilus: ['naut', 'lus'], ammonite: ['ammo', 'nite'], trilobite: ['trilo', 'bite'],
  egg: ['egg', 'egg'], seed: ['seed', 'seed'], sapling: ['sap', 'ling'], vine: ['vine', 'vine'], tree: ['tree', 'tree'],
  cloud: ['cloud', 'cloud'], comet: ['com', 'met'], meteor: ['mete', 'teor'], star: ['star', 'star'], moon: ['moon', 'moon'],
};

const GENERIC: Record<string, [string, string]> = {
  spirit: ['spiri', 'rit'], guardian: ['guard', 'guard'], warrior: ['war', 'war'], creature: ['crit', 'critter'],
  beast: ['beast', 'beast'], dancer: ['danc', 'cer'], brawler: ['brawl', 'ler'], weaver: ['weav', 'ver'],
  trickster: ['trick', 'ster'], deity: ['dei', 'ty'], sentinel: ['senti', 'nel'], protector: ['prot', 'tector'],
  hunter: ['hunt', 'ter'], predator: ['preda', 'tor'], dweller: ['dwell', 'ler'], artist: ['art', 'art'],
  performer: ['perf', 'mer'], insect: ['bug', 'bug'], avian: ['avi', 'an'], glider: ['glid', 'der'],
  fighter: ['fight', 'ter'], titan: ['tit', 'tan'],
};


/** Nouns that describe a vibe more than an animal — used only if no animal is named. */
const SPIRIT_WORDS = new Set([
  'lantern', 'lotus', 'mushroom', 'orchid', 'blossom', 'cactus', 'mask', 'knight', 'samurai', 'ninja', 'monk',
  'titan', 'wraith', 'specter', 'phantom', 'wisp', 'sprite', 'faerie', 'fairy', 'imp', 'djinn', 'egg', 'seed',
  'sapling', 'vine', 'tree', 'cloud', 'comet', 'meteor', 'star', 'moon', 'golem', 'gargoyle', 'larva',
]);

const CUTE: [string, number][] = [
  ['let', 3], ['ling', 3], ['kin', 3], ['bit', 2], ['pup', 2], ['kit', 2], ['ette', 1], ['nub', 1], ['bean', 1],
  ['pip', 2], ['nib', 1], ['o', 1], ['y', 1], ['ee', 1], ['mew', 1], ['tot', 1],
];
const GRAND: [string, number][] = [
  ['zar', 3], ['rex', 2], ['lord', 1], ['gon', 2], ['dra', 2], ['ion', 2], ['mor', 2], ['thar', 2], ['tron', 1],
  ['rion', 1], ['vex', 2], ['dax', 1], ['crest', 1], ['fang', 1], ['ara', 2], ['or', 2], ['ix', 1], ['eon', 1],
];

const VOWELS = new Set(['a', 'e', 'i', 'o', 'u', 'y']);
const OK_PAIRS = new Set([
  'rm', 'rn', 'rk', 'rg', 'rd', 'rt', 'rb', 'rl', 'rp', 'rs', 'rv', 'rz', 'nd', 'nt', 'ng', 'nk', 'nc', 'ns', 'nz',
  'mb', 'mp', 'ms', 'lt', 'lk', 'ld', 'lm', 'lb', 'lf', 'lp', 'lv', 'ls', 'st', 'sk', 'sp', 'sh', 'sl', 'sn', 'sm',
  'sw', 'ch', 'th', 'ck', 'ss', 'll', 'ff', 'zz', 'tt', 'pp', 'mm', 'nn', 'gr', 'br', 'tr', 'dr', 'cr', 'fr', 'pr',
  'fl', 'bl', 'cl', 'gl', 'pl', 'wr', 'ph', 'xl', 'xm', 'xr', 'wl', 'wn', 'wk', 'ts', 'ks', 'gn', 'ct', 'pt', 'ft',
  'dg', 'kl', 'kr', 'sc', 'zm', 'zl', 'zr', 'rr', 'gg', 'dd', 'bb', 'tz', 'lz', 'wb', 'wm', 'ws', 'xt',
]);
const OK_TRIPLES = new Set(['str', 'spr', 'thr', 'chr', 'ght', 'tch', 'nch', 'rst', 'rch', 'nth', 'mbl', 'ngl',
  'ndr', 'ntr', 'mpl', 'rth', 'sch', 'scr', 'spl', 'shr', 'lth', 'rsh', 'lch', 'rkl', 'ckl', 'ngr', 'nst', 'rtz', 'ltz']);

const BLOCKED = ['fuk', 'fuc', 'shit', 'cum', 'nig', 'fag', 'sex', 'rape', 'cock', 'dick', 'tit', 'cunt', 'porn',
  'anal', 'anus', 'piss', 'slut', 'whor', 'bitch', 'nazi', 'kkk', 'jew', 'poo', 'butt', 'boob', 'damn', 'hell', 'kill',
  'gay', 'homo', 'semen', 'pube', 'turd', 'crap'];

function weightedPick(rng: Rng, items: [string, number][]): string {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [v, w] of items) {
    r -= w;
    if (r < 0) return v;
  }
  return items[0][0];
}

function linkVowel(rng: Rng): string {
  return pick(rng, ['a', 'o', 'i', 'a', 'o', 'e']);
}

/** Join two morphemes, smoothing the seam (drop doubled vowels, link harsh clusters). */
export function join(rng: Rng, a: string, b: string): string {
  if (!a) return b;
  if (!b) return a;
  const last = a[a.length - 1];
  const first = b[0];
  if (VOWELS.has(last) && VOWELS.has(first)) {
    if (last === first) return a + b.slice(1);
    return a.length > 3 ? a.slice(0, -1) + b : a + b.slice(1);
  }
  if (!VOWELS.has(last) && !VOWELS.has(first)) {
    if (last === first) return a + b.slice(1);
    const prev = a[a.length - 2] ?? 'a';
    const next = b[1] ?? 'a';
    if (OK_PAIRS.has(last + first) && VOWELS.has(prev) && VOWELS.has(next)) return a + b;
    if (OK_TRIPLES.has(prev + last + first) || OK_TRIPLES.has(last + first + next)) return a + b;
    return a + linkVowel(rng) + b;
  }
  return a + b;
}

function tidy(name: string): string {
  const out = name.replace(/[^a-z]/g, '').replace(/(.)\1\1+/g, '$1$1');
  return out.charAt(0).toUpperCase() + out.slice(1);
}

function isBlocked(name: string): boolean {
  const n = name.toLowerCase();
  return BLOCKED.some((b) => n.includes(b));
}

/** Higher is better. Rewards pronounceable, well-sized names. */
export function scoreName(name: string, ideal: [number, number]): number {
  const n = name.toLowerCase();
  let score = 10;
  if (n.length < ideal[0]) score -= (ideal[0] - n.length) * 1.5;
  if (n.length > ideal[1]) score -= (n.length - ideal[1]) * 2;
  // consonant / vowel runs
  const consRuns = n.match(/[^aeiouy]+/g) ?? [];
  for (const run of consRuns) {
    if (run.length === 3 && !OK_TRIPLES.has(run)) score -= 3;
    if (run.length >= 4) score -= 6;
  }
  const vowRuns = n.match(/[aeiouy]+/g) ?? [];
  for (const run of vowRuns) {
    if (run.length >= 3) score -= 4;
    if (/(ii|uu|yy|iy|yi|uo|aa|ae|ao|ea)/.test(run)) score -= 1.5;
  }
  if (/q(?!u)/.test(n)) score -= 4;
  if (/[jvqc]$/.test(n)) score -= 2;
  if (/[^aeiouyscpt]h/.test(n.slice(1))) score -= 1.5;
  if (/(.)\1/.test(n.slice(-2))) score -= 1;
  if (/[^aeiouy]{2}$/.test(n) && !/(ng|nk|nt|nd|rk|rn|rm|st|sk|sh|ch|th|ck|ld|lt|rd|rt|ss|ll|x)$/.test(n)) score -= 3;
  return score;
}

/** Find the dominant creature noun in a theme sentence. */
export function findNoun(theme: string, rng: Rng): [string, string] {
  const words = theme.toLowerCase().replace(/[^a-z\s-]/g, ' ').split(/[\s-]+/).filter(Boolean);
  const singular = (w: string) =>
    w.endsWith('ies') ? w.slice(0, -3) + 'y'
      : w.endsWith('xes') || w.endsWith('shes') || w.endsWith('ches') ? w.slice(0, -2)
        : w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us') && !w.endsWith('is') ? w.slice(0, -1) : w;
  const lookup = (w: string) => (CREATURES[singular(w)] ? singular(w) : CREATURES[w] ? w : null);
  // Animals first, then spirit-ish nouns, then generic roles.
  for (const w of words) {
    const key = lookup(w);
    if (key && !SPIRIT_WORDS.has(key)) return CREATURES[key];
  }
  for (const w of words) {
    const key = lookup(w);
    if (key) return CREATURES[key];
  }
  for (const w of words) {
    const s = singular(w);
    if (GENERIC[s]) return GENERIC[s];
  }
  return pick(rng, Object.values(GENERIC));
}

/** Pull explicit names out of themes like "Lumight (small…), Sparaglide (…) and Zephyrix (…)". */
export function explicitNames(theme: string, count: number): string[] | null {
  const re = /(?:\d\.\s*)?([A-Z][a-z]+(?:\s[A-Z][a-z]+){0,1})\s*\(/g;
  const found: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(theme))) found.push(m[1]);
  if (found.length !== count) return null;
  if (found.some((n) => n.length > 13 || n.length < 4)) return null;
  return found;
}

export interface NameRequest {
  family: string;
  types: Element[];
  theme: string;
  stages: number;
}

const IDEAL: [number, number][] = [[5, 8], [6, 9], [7, 10]];

/** Trim long roots to their first syllable + one consonant: skitter → skit, spectra → spec. */
function shortRoot(root: string): string {
  if (root.length <= 6) return root;
  const m = root.match(/^[^aeiouy]*[aeiouy]+[^aeiouy]?/);
  return m && m[0].length >= 3 ? m[0] : root.slice(0, 4);
}

function candidateLine(rng: Rng, req: NameRequest): string[] {
  const t1 = req.types[0];
  const t2 = req.types[1] ?? req.types[0];
  const root1 = pick(rng, TYPE_ROOTS[t1]);
  let root2 = pick(rng, TYPE_ROOTS[t2]);
  if (root2 === root1) root2 = pick(rng, TYPE_ROOTS[t2]);
  const [nh, nt] = findNoun(req.theme, rng);
  const cute = weightedPick(rng, CUTE);
  const grand = weightedPick(rng, GRAND);
  const maybeGrand = (s: string) => (s.length <= 6 ? join(rng, s, grand) : s);

  switch (Math.floor(rng() * 5)) {
    case 0: // Cinderlet → Cindermoth → Blazemoth(ra)
      return [join(rng, shortRoot(root1), cute), join(rng, root1, nt), maybeGrand(join(rng, root2, nt))];
    case 1: // Mothkin → Mothember → Pyromoth(zar)
      return [join(rng, nh, cute), join(rng, nh, shortRoot(root1)), maybeGrand(join(rng, shortRoot(root2), nh))];
    case 2: // Embelet → Embermoth → Emberzar  (shared prefix, like a real evolution line)
      return [join(rng, shortRoot(root1), cute), join(rng, root1, nt), join(rng, root1, grand)];
    case 3: // Mothling → Cindermoth → Mothblaze
      return [join(rng, nh, cute), join(rng, shortRoot(root1), nt), join(rng, nh, root2)];
    default: // Pyrokin → Pyromoth → Scorchmoth
      return [join(rng, shortRoot(root1), cute), join(rng, shortRoot(root1), nt), maybeGrand(join(rng, shortRoot(root2), nt))];
  }
}

/**
 * Generate one name per stage for an evolution line. Candidates are scored
 * for pronounceability and the best unique line wins. `taken` is the global
 * set of lowercase names already used; results are added to it.
 */
export function nameLine(req: NameRequest, taken: Set<string>): string[] {
  const explicit = explicitNames(req.theme, req.stages);
  if (explicit && explicit.every((n) => !taken.has(n.toLowerCase()))) {
    explicit.forEach((n) => taken.add(n.toLowerCase()));
    return explicit;
  }

  const pickStages = (line: string[]) => (req.stages === 3 ? line : req.stages === 2 ? [line[0], line[2]] : [line[2]]);
  const ideals = req.stages === 3 ? IDEAL : req.stages === 2 ? [IDEAL[0], IDEAL[2]] : [IDEAL[2]];
  let best: { names: string[]; score: number } | null = null;

  for (let attempt = 0; attempt < 48; attempt++) {
    const rng = seededRng(`name:${req.family}:${attempt}`);
    const names = pickStages(candidateLine(rng, req)).map(tidy);
    if (new Set(names.map((n) => n.toLowerCase())).size !== names.length) continue;
    if (names.some((n) => n.length < 4 || n.length > 12 || isBlocked(n) || taken.has(n.toLowerCase()))) continue;
    const score = names.reduce((s, n, i) => s + scoreName(n, ideals[i]), 0);
    if (!best || score > best.score) best = { names, score };
  }
  if (best) {
    best.names.forEach((n) => taken.add(n.toLowerCase()));
    return best.names;
  }
  // Last resort: numbered fallback that is always unique.
  const base = tidy(TYPE_ROOTS[req.types[0]][0] + req.family.replace(/\D/g, ''));
  return Array.from({ length: req.stages }, (_, i) => {
    const n = `${base}${['', 'ix', 'or'][i]}`;
    taken.add(n.toLowerCase());
    return n;
  });
}

/** A deterministic typo for the Factory Misprint version of a name. */
export function misprintOf(name: string, seed: string): string {
  const rng = seededRng(`misprint:${seed}`);
  const chars = name.split('');
  const mode = Math.floor(rng() * 3);
  if (chars.length < 4) return name + name[name.length - 1];
  const i = 1 + Math.floor(rng() * (chars.length - 2));
  if (mode === 0) {
    const j = Math.min(chars.length - 1, i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  } else if (mode === 1) {
    chars.splice(i, 0, chars[i]);
  } else {
    chars.splice(i, 1);
  }
  let out = chars.join('');
  out = out.charAt(0).toUpperCase() + out.slice(1).toLowerCase();
  return out === name ? name + 'e' : out;
}
