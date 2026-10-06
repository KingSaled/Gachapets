import type { FeedEvent } from '@gachapets/shared';
import { FINISH_INFO, allBadges } from '@gachapets/shared';
import type { CatalogIndex } from './queries.ts';
import { coins, serial } from './format.ts';

export interface FeedLine {
  who: string;
  verb: string;
  what: string;
  extra?: string;
  finish?: FeedEvent['finish'];
}

let badgeNames: Map<string, string> | null = null;

export function describe(e: FeedEvent, catalog: CatalogIndex): FeedLine {
  const sp = e.speciesId ? catalog.species.get(e.speciesId) : undefined;
  const name = sp ? (e.finish === 'misprint' ? sp.misprintName : sp.name) : '???';
  const fin = e.finish ? FINISH_INFO[e.finish].label : '';
  const ser = e.finish && e.mint ? serial(e.finish, e.mint) : '';
  switch (e.type) {
    case 'pull':
      return { who: e.username, verb: 'pulled', what: `${fin} ${name}`, extra: e.printRun ? ser : undefined, finish: e.finish };
    case 'discovery':
      return { who: e.username, verb: 'discovered', what: name, extra: 'FIRST EVER', finish: e.finish };
    case 'sale':
      return { who: e.username, verb: 'bought', what: `${e.finish && e.finish !== 'base' ? `${fin} ` : ''}${name}`, extra: e.price ? `${coins(e.price)}◎` : undefined, finish: e.finish };
    case 'listing':
      return { who: e.username, verb: 'listed', what: `${fin} ${name} ${ser}`, extra: e.price ? `${coins(e.price)}◎` : undefined, finish: e.finish };
    case 'sellout':
      return { who: e.username, verb: 'minted the LAST', what: `${fin} ${name}`, extra: `${e.printRun}/${e.printRun} SOLD OUT`, finish: e.finish };
    case 'badge': {
      if (!badgeNames) badgeNames = new Map(allBadges(catalog.raw.sets).map((b) => [b.id, b.name]));
      return { who: e.username, verb: 'earned', what: badgeNames.get(e.badge ?? '') ?? 'a badge' };
    }
  }
}
