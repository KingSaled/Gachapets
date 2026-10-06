# Gachapets economy & scarcity design

The brief: rare cards must feel rare and stay rare. Hundreds of ultra-rares must not hit the market in week one and tank values. And even penny cards should matter.

All tuning lives in [`shared/src/economy.ts`](../shared/src/economy.ts). Run `npm run odds` after changing it to print the resulting per-pack odds and expected quick-sell value.

## Cards = species × finish

**Species** (4,306 of them across 30 sets of 144) have a fixed **rarity** that comes from their evolution stage:

| Rarity | Comes from | Base value |
| --- | --- | --- |
| ● Common | first stage | 1 |
| ◆ Uncommon | middle stage | 2 |
| ★ Rare | final stage | 6 |
| ✦ Star Rare | 8 hand-picked final stages per set (they appear on the pack art) | 14 |

**Finish** is rolled when a card is pulled:

| Finish | Value × | Print run | Look |
| --- | --- | --- | --- |
| Standard | 1 | open | plain print |
| Shiny | 3 | open | alternate palette sprite, pearl frame |
| Holofoil | 6 | open | prismatic art window |
| Parallax | 15 | open | lenticular depth layers |
| 3D Pop | 50 | **50 per species** | voxel creature breaking the frame |
| Living Foil | 150 | **10 per species** | animated creature, palette cycling |
| Factory Misprint | 600 | **1 per species** | back sprite, wrong inks, typo'd name |

## Pack odds

Every pack has 7 cards in fixed slots: 4 Commons, 2 Uncommons and 1 Rare (in the Rare slot a Star Rare is 0.35× as likely as a regular Rare). Each card rolls its finish independently from its slot's table. The Rare slot rolls much hotter than the Common slots.

| Per pack, at least one… | Chance |
| --- | --- |
| Shiny | 1 in 2.7 |
| Holofoil | 1 in 3.2 |
| Parallax | 1 in 12 |
| 3D Pop | 1 in 50 |
| Living Foil | 1 in 204 |
| Factory Misprint | 1 in ~1,060 |
| Star Rare species | 1 in 15 |

The odds are public in-game (Shop → Pull rates). There is no pity timer and nothing is rigged per player.

## Why ultra-rares can't flood the market

1. **Hard print runs.** 3D Pop, Living Foil and Misprint printings are serialized and capped forever. Every card carries its number (`03/10`, `1/1`). When a species' run is exhausted, that roll lands on another species in the same slot pool that still has run left. When the whole pool is dry, it steps down a tier. Scarcity is enforced in the minting transaction, not just displayed.
2. **Per-set ceilings.** A 144-card set can only ever contain 7,200 3D Pops, 1,440 Living Foils and 144 Misprints. The Shop shows how many of each are left in each live set.
3. **Low base rates.** At about 1 in 200 packs, 5,000 packs opened in week one produce roughly 25 Living Foils spread across 288 species in two live sets. Each one is individually scarce.
4. **Staggered set releases.** Only `LIVE_SETS` are on sale. The other 28 sets are future content, each bringing fresh, uncapped runs, so the chase never ends and early sets age into vintage.
5. **The house as a shredder.** Quick-selling to the house *burns* the card. Bulk leaves circulation, and the market value model notices.

## Coin sources and sinks

| Sources | Sinks |
| --- | --- |
| 1,000 starter coins | Packs (100 each) |
| Daily capsule: 120 coins + 20 per streak day (max 240) | 5% market seller fee |
| House buyback (quick-sell) | Profile themes and animated banners (600–6,000) |
| Badge rewards (20 – 8,000) | |
| Evolution-line completion (25 per line) | |
| Selling to other players | |

The house pays about **43%** of the pack price back on average if you dump everything. The real value of hits is realised on the player market, at a multiple of the house floor.

## Why penny cards matter

- **Evolution lines:** owning every stage of a family pays 25 coins and counts toward the Line Weaver → Genealogist → Archivist badges. A line is never complete without its Common first stage.
- **Set completion:** five medals per set (all Commons / Uncommons / Rares / Full set / Shiny dex), with titles and big coin rewards.
- **Type specialists:** owning 25 species of an element unlocks that element's title.
- **First discovery:** the first player ever to pull a species is credited on it forever. Every common counts.
- **Circulation:** commons that get shredded become scarcer, and their market value rises.

## Market value model

Each printing (species × finish) has a market value, recomputed on every mint, burn, listing change and sale, plus a sweep every 10 minutes. It blends:

```
reference  = house value × 2.5                       (book value)
scarcity   = ((expected + 1) / (circulating + 1))^0.35, clamped 0.6–2.5
             expected = copies the published odds predict after N packs of that set
demand     = 1 + 0.15 · ln(1 + sales in 7d)
pressure   = 1 / (1 + 0.04 · active listings), min 0.7
model      = reference × scarcity × demand × pressure
value      = blend(model, EMA of sale prices)      weight grows with sale count (≤ 0.8)
           → pulled 30% toward the lowest ask if it's cheaper
           → never below the house buyback
```

Sale prices enter the EMA clamped to 0.25×–4× of the current value, which blunts wash trading. Price history is stored only when the value moves, which makes the charts event-sourced.

## Anti-abuse

- New accounts (under 3 days old or under 10 packs opened) can't buy a listing priced above max(60, 3 × market value). This blocks alt accounts from funnelling starter coins to a main account through junk listings, and it also protects newcomers from overpaying.
- Registration is rate-limited to 5 per IP per hour in production.
- Every coin movement is written to an append-only `ledger` table. The test suite asserts that balance equals the ledger sum after thousands of simulated trades.

## Tuning ideas for later

- Gate set releases on community milestones (for example, "Series 3 unlocks when 20,000 Genesis packs are opened worldwide").
- Seasonal "first edition" stamps on the first N mints of each species.
- Buy orders (bids) so demand shows up in the value model before a listing exists.
