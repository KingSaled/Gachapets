# Gachapets architecture

```
┌────────────── client (Vite + React 19) ───────────────┐      ┌──────────── server (Fastify 5) ─────────────┐
│ wouter routes · TanStack Query · zustand · motion     │ HTTP │ routes.ts ─► services/* ─► SQLite (WAL)     │
│ Card renderer (CSS foil, voxel 3D, canvas Living)     │◄────►│ ws.ts: feed + per-user pushes                │
│ WebGL stage · pixel particles · Web Audio SFX         │  WS  │ sprites.ts: allow-listed PNGs from assets/   │
└───────────────────────────────────────────────────────┘      │ bots.ts: optional NPC collectors             │
                                                               └──────────────────────────────────────────────┘
                         shared/ — types, economy tables, badges, cosmetics (imported by both sides)
```

## Principles

- **The server is the only authority.** Clients never write cards, coins or odds. Pack rolls use a crypto RNG on the server, and the client just animates the result it's given. (This is why Supabase would be used as a managed Postgres, not as a client-writable database. Row-level security can't enforce pack odds or print runs.)
- **Every economic action is a single transaction.** Opening a pack charges coins, rolls, mints (checking print runs), records discoveries, completes evolution lines, awards badges and writes feed events in one atomic SQLite transaction. Side effects such as websocket pushes are queued with `afterCommit` and fire only if it commits (`server/src/context.ts`).
- **Append-only history.** Burned cards keep their rows (with `owner_id` NULL), so mint numbers and provenance survive. Coins move only through `adjustCoins`, which writes the ledger.

## Catalog

`npm run catalog` scans the sprite library and writes `server/data/catalog.json`:

- It validates each stage folder (four stage folders with missing sprites are skipped) and parses element types from `evolution_summary.json`.
- It names every evolution line procedurally (`scripts/naming.ts`). The names are built from element roots and the creature noun in the theme text, scored for pronounceability, globally unique, and screened against a blocklist. Themes that already name their creatures (for example "Lumight, Sparaglide, Zephyrix") keep those names.
- It does a seeded shuffle into 30 sets of 48 families (144 cards), sorted so each family's evolution line sits together. Each set gets 8 Star Rares, and the first three are the pack mascots.
- It also generates a misprint typo name for every species.

Species ids (`fire_31-2`) are stable. Once real players hold cards, treat `catalog.json` as frozen and append new sets rather than regenerating.

### About the sprites

Each stage folder has `front`, `back`, `*_shiny` and `*_nobg` variants, an icon, a footprint and 16-colour `.pal` files. The two frames in every `anim_front.png` and `icon.png` are byte-identical across the whole library. So **Living Foil animation is procedural** (`client/src/components/card/LivingSprite.tsx`), the same way handheld engines animated these sprites:

- element-specific idle motion: a bob, a stomp, flicker, a sway
- per-row wave distortion
- palette cycling between the normal and shiny palettes, which works because both PNGs share pixel indices

## Server

| Path | Role |
| --- | --- |
| `db/migrations.ts` | append-only schema migrations |
| `services/packs.ts` | slot rolls, print-run fallback, card-trick order, `openPack` |
| `services/prints.ts` | mint counters, expected supply, market value model, price history |
| `services/market.ts` | list, cancel and buy (with the new-account guard), browse, overview, print stats |
| `services/badges.ts` / `lines.ts` | badge evaluation, evolution-line rewards |
| `services/users.ts` | scrypt passwords, sessions (httpOnly cookie), daily bonus |
| `services/profile.ts` | profiles, showcase, cosmetics, leaderboards |
| `services/bots.ts` | NPC collectors (same rules as players) |
| `ws.ts` | realtime: feed broadcast, online count, per-user coin and sale pushes |

### Data model (SQLite)

- `users`: wallet, profile cosmetics, daily streak, rarest pull
- `sessions`: login sessions
- `cards`: every physical card ever minted, with `(species_id, finish, mint)` unique
- `prints`: one row per printing, with minted and burned counts, market value and trade EMA
- `price_history`: value changes over time
- `listings`: player listings (a partial unique index allows one active listing per card)
- `sales`: completed trades
- `ledger`: every coin movement
- `packs`: every pack opened
- `discoveries`: first player to pull each species
- `user_lines`, `user_badges`, `user_cosmetics`, `showcase`: per-player progress and profile choices
- `feed`: live-feed events

### Tests

`npm test` runs three suites:

- **Odds and caps:** odds tables, slot pools, card-trick order, and print-run caps under an RNG rigged to roll Misprint on every slot.
- **Economy:** quick-sell burns, atomic market transfers with fees, the new-account guard, and market value floors and scarcity.
- **Simulation and HTTP:** 1,500 ticks of bot trading, followed by invariant checks (ledger equals balances, print counters equal the cards table, no orphaned listings). The HTTP tests cover auth, packs, the catalog ETag and sprite path safety.

## Client

| Path | Role |
| --- | --- |
| `components/card/` | the card: em-based layout scaled by `--cw`, pointer tilt (`useTilt` writes CSS vars without re-rendering), per-finish layers in `card.css`, voxel 3D, Living canvas |
| `lib/scenes.ts` | procedural 48×36 pixel-art backdrops per element, split into sky/far/mid/near layers for Parallax |
| `lib/sfx.ts` | the synthesized SFX engine: square/triangle voices, filtered noise, reverb, fanfares by tier |
| `lib/fx.ts` | pixel particle engine (bursts, confetti rain, coins flying to the wallet) |
| `components/StageBackdrop.tsx` | low-res WebGL nebula with Bayer dithering, glitch mode for misprints |
| `pages/Opening.tsx` | rip → emerge → trick → reveal state machine, plus `PackSummary.tsx` |

Accessibility: `prefers-reduced-motion` dampens flashes, shakes and particles. Reveals are announced through an `aria-live` region, and every control is keyboard-reachable (Space/Enter/→ flip cards; ← → turn binder pages).

## Moving to Supabase / Postgres

The SQL is portable. The steps when hosting is chosen:

1. Point a Postgres driver (for example `postgres` or `pg`) at the Supabase connection string, and make the service functions `async`, keeping the `tx()` boundary.
2. Translate the dialect bits:
   - `INSERT OR IGNORE` becomes `INSERT … ON CONFLICT DO NOTHING`
   - `json_each(?)` becomes `= ANY($1)`
   - `RETURNING`, partial unique indexes and CTEs work as-is
3. Run the migrations as Supabase migrations. Keep RLS **deny-all** for the anon role, and give only the game server's service key write access.
4. Optionally swap custom auth for Supabase Auth: the server verifies the Supabase JWT in place of the `gp_session` cookie, and `users.id` maps to `auth.users.id`.
5. Optionally fan the websocket feed out through Supabase Realtime broadcast channels when running more than one server instance.

Sprites (about 300 MB) can move to Supabase Storage or any CDN by changing `SPRITES_DIR`/`spriteUrl()`.
