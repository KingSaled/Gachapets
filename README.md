# Gachapets

A multiplayer pixel-pet **trading card game and market simulator**. Rip foil packs, watch the card trick tuck your hits to the back, chase serialized Living Foils and 1-of-1 Factory Misprints, complete evolution lines and sets, and trade on a player-driven market.

All currency is virtual **Coins**. There are no real-money purchases.

> **Version 0.1.0 (Dev).** The whole game loop is playable: packs, binder, market, profiles, leaderboards and a live feed.

---

## Quick start

```bash
nvm use            # Node 22+
npm install
npm run dev        # API on :8787, client on :5173
```

Open http://localhost:5173, press start, and claim your 1,000 starter coins.

In dev, a dozen **NPC collectors** open packs, list cards and buy bargains so the market and feed aren't empty. They follow exactly the same odds, print runs and fees as players. To fill a fresh world instantly, run:

```bash
TICKS=2000 npm run seed:demo
```

### Previewing the big reveals

The top tiers are rare by design, so when you're working on reveal effects you can rig the finish rolls in dev:

```bash
DEV_LUCK=0.998 npm run dev   # nearly every card rolls 3D Pop / Living Foil / Misprint
```

`DEV_LUCK` is ignored when `NODE_ENV=production`. You can also see every finish side by side at `/finishes`.

### Production

```bash
npm run build      # builds client/dist
npm start          # one Node process serves the client, the API, the websocket and the sprites
```

| Env var | Default | Purpose |
| --- | --- | --- |
| `PORT` | `8787` | HTTP port |
| `DB_PATH` | `server/var/gachapets.db` | SQLite file |
| `LIVE_SETS` | `gen,neo` | Sets whose packs are for sale; the rest show as "coming soon" |
| `SIMULATE_BOTS` | `1` in dev, `0` in prod | Turns the NPC collectors on or off |
| `BOT_TICK_MS` | `25000` | How often an NPC acts |
| `DEV_LUCK` | – | Dev-only: rigs finish odds so you can preview reveals |

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | API (tsx watch) + Vite client |
| `npm test` | Server test suite (odds, print-run caps, ledger and market invariants, HTTP API) |
| `npm run typecheck` | Typechecks shared, server and client |
| `npm run catalog` | Rebuilds `server/data/catalog.json` from the sprite library |
| `npm run odds` | Prints per-pack odds and the expected quick-sell value per pack |
| `npm run seed:demo` | Simulates NPC activity into the configured DB |

## What's in the box

- **Packs:** you drag across the foil wrapper to tear it open. Seven face-down cards slide out, and the card trick tucks the three best to the back. Reveals escalate by tier: commons flip briskly, while hits get rarity "tells", charge-ups, flashes, screen shake, particle bursts, chiptune fanfares, banners and serial stamps. Factory Misprints glitch the whole stage.
- **Seven finishes**, each with its own look:
  - **Standard**
  - **Shiny** (alternate palette, pearl frame)
  - **Holofoil** (prismatic art window)
  - **Parallax** (separated depth layers)
  - **3D Pop** (voxel-extruded creature breaking the frame, 50 per species)
  - **Living Foil** (animated creature with palette cycling, 10 per species)
  - **Factory Misprint** (back sprite, wrong inks, off-register art, typo'd name, exactly 1 per species)
- **Binder:** set dividers, 9-pocket pages with page-turns, and silhouettes for species you haven't found. There's also a full inventory view with bulk duplicate selling, and per-set progress, rarity counts and completion medals.
- **Market:** player listings with search and filters, deal-vs-market indicators, grails, top movers and recent sales. Each printing gets a page with a price chart, circulation, burn count and print run left.
- **Profiles:** five showcase pedestals, net worth, rarest pull and a badge wall. Titles unlock from badges, and you can buy themes and animated banners with coins. Your avatar is any card in your binder.
- **Hall:** leaderboards, the live feed, and a registry of every Factory Misprint ever pulled.
- **Realtime:** a websocket ticker of big pulls, sales and first discoveries, live coin updates, and an alert when your listing sells.

## Repo layout

```
assets/fakemon_itch_front_and_back/   sprite library (1,437 families × up to 3 stages)
scripts/        catalog generator, procedural naming, odds report
shared/         domain types, economy tuning, badges, cosmetics (used by server + client)
server/         Fastify + SQLite game server, services, migrations, tests
client/         Vite + React app
docs/           ECONOMY.md, ARCHITECTURE.md
```

Read [docs/ECONOMY.md](docs/ECONOMY.md) for the scarcity and value design, and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the technical design, including the planned move to Supabase/Postgres.

## Art credits

The creature sprites come from the **Fakemon front & back sprite pack (itch.io)** in `assets/fakemon_itch_front_and_back`. **Before any public launch, add the author's credit here and confirm the pack's license allows this use.** All other art (card frames, scenes, packs, icons, cursors, UI) and all sound effects are generated procedurally in code.
