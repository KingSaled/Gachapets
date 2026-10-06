/**
 * Prints per-pack odds and expected quick-sell value so economy tuning in
 * shared/src/economy.ts can be sanity-checked.   npm run odds
 */
import {
  FINISHES, FINISH_INFO, PACK_PRICE, PACK_SLOTS, RARITY_INFO, STAR_WEIGHT, quickSellValue, slotOdds,
} from '../shared/src/index.ts';

const STARS_PER_SET = 8;
const RARES_PER_SET = 48;
const pStar = (STARS_PER_SET * STAR_WEIGHT) / (RARES_PER_SET - STARS_PER_SET + STARS_PER_SET * STAR_WEIGHT);

const perPackAtLeastOne: Record<string, number> = {};
let ev = 0;
for (const f of FINISHES) {
  let pNone = 1;
  for (const slot of PACK_SLOTS) {
    const p = slotOdds(slot).find(([x]) => x === f)![1];
    pNone *= 1 - p;
    if (slot === 'rare') {
      ev += p * ((1 - pStar) * quickSellValue('rare', f) + pStar * quickSellValue('star', f));
    } else {
      ev += p * quickSellValue(slot, f);
    }
  }
  perPackAtLeastOne[f] = 1 - pNone;
}

console.log('Per-pack chance of at least one:');
for (const f of FINISHES) {
  const p = perPackAtLeastOne[f];
  console.log(`  ${FINISH_INFO[f].label.padEnd(17)} ${(p * 100).toFixed(3).padStart(8)}%   ~1 in ${(1 / p).toFixed(1)}`);
}
console.log(`Star Rare in rare slot: ${(pStar * 100).toFixed(1)}% (~1 in ${(1 / pStar).toFixed(1)} packs)`);
console.log(`Expected quick-sell value per pack: ${ev.toFixed(1)} coins (pack price ${PACK_PRICE}, ${(ev / PACK_PRICE * 100).toFixed(0)}% return)`);
console.log('\nQuick-sell table:');
console.log('  ' + 'finish'.padEnd(17) + Object.values(RARITY_INFO).map((r) => r.label.padStart(10)).join(''));
for (const f of FINISHES) {
  console.log('  ' + FINISH_INFO[f].label.padEnd(17) + Object.values(RARITY_INFO).map((r) => String(quickSellValue(r.id, f)).padStart(10)).join(''));
}
