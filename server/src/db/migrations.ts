/**
 * Append-only schema migrations. Never edit a shipped entry — add a new one.
 */
export const MIGRATIONS: string[] = [
  /* 1: initial schema */ `
  CREATE TABLE users (
    id            INTEGER PRIMARY KEY,
    username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
    pass_hash     TEXT NOT NULL,
    coins         INTEGER NOT NULL DEFAULT 0 CHECK (coins >= 0),
    packs_opened  INTEGER NOT NULL DEFAULT 0,
    created_at    INTEGER NOT NULL,
    last_daily_at INTEGER,
    daily_streak  INTEGER NOT NULL DEFAULT 0,
    title         TEXT,
    theme         TEXT NOT NULL DEFAULT 'theme_arcade',
    banner        TEXT NOT NULL DEFAULT 'banner_stars',
    bio           TEXT NOT NULL DEFAULT '',
    avatar_species TEXT,
    avatar_finish  TEXT,
    rarest_card_id INTEGER,
    rarest_score   INTEGER NOT NULL DEFAULT -1,
    settings      TEXT NOT NULL DEFAULT '{}',
    is_bot        INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE sessions (
    token      TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX sessions_user ON sessions(user_id);

  -- Every physical card ever minted. Burned (quick-sold) cards keep their row
  -- with owner_id NULL so mint numbers and provenance stay intact.
  CREATE TABLE cards (
    id          INTEGER PRIMARY KEY,
    species_id  TEXT NOT NULL,
    finish      TEXT NOT NULL,
    mint        INTEGER NOT NULL,
    owner_id    INTEGER REFERENCES users(id),
    minted_by   INTEGER NOT NULL REFERENCES users(id),
    minted_at   INTEGER NOT NULL,
    acquired_at INTEGER NOT NULL,
    pack_id     INTEGER,
    burned_at   INTEGER,
    UNIQUE (species_id, finish, mint)
  );
  CREATE INDEX cards_owner ON cards(owner_id, species_id);
  CREATE INDEX cards_print ON cards(species_id, finish);

  -- One row per printing (species × finish) that has ever been minted.
  CREATE TABLE prints (
    species_id      TEXT NOT NULL,
    finish          TEXT NOT NULL,
    minted          INTEGER NOT NULL DEFAULT 0,
    burned          INTEGER NOT NULL DEFAULT 0,
    market_value    INTEGER NOT NULL,
    ema_price       REAL,
    sales_count     INTEGER NOT NULL DEFAULT 0,
    last_sale_price INTEGER,
    last_sale_at    INTEGER,
    updated_at      INTEGER NOT NULL,
    PRIMARY KEY (species_id, finish)
  );

  CREATE TABLE price_history (
    species_id TEXT NOT NULL,
    finish     TEXT NOT NULL,
    at         INTEGER NOT NULL,
    value      INTEGER NOT NULL
  );
  CREATE INDEX price_history_print ON price_history(species_id, finish, at);

  CREATE TABLE packs (
    id        INTEGER PRIMARY KEY,
    user_id   INTEGER NOT NULL REFERENCES users(id),
    set_id    TEXT NOT NULL,
    price     INTEGER NOT NULL,
    opened_at INTEGER NOT NULL
  );
  CREATE INDEX packs_set ON packs(set_id);

  CREATE TABLE listings (
    id         INTEGER PRIMARY KEY,
    card_id    INTEGER NOT NULL REFERENCES cards(id),
    seller_id  INTEGER NOT NULL REFERENCES users(id),
    species_id TEXT NOT NULL,
    finish     TEXT NOT NULL,
    price      INTEGER NOT NULL CHECK (price > 0),
    status     TEXT NOT NULL DEFAULT 'active',
    created_at INTEGER NOT NULL,
    buyer_id   INTEGER REFERENCES users(id),
    closed_at  INTEGER
  );
  CREATE UNIQUE INDEX listings_one_active_per_card ON listings(card_id) WHERE status = 'active';
  CREATE INDEX listings_active ON listings(status, species_id, finish, price);
  CREATE INDEX listings_seller ON listings(seller_id, status);

  CREATE TABLE sales (
    id         INTEGER PRIMARY KEY,
    listing_id INTEGER NOT NULL REFERENCES listings(id),
    card_id    INTEGER NOT NULL REFERENCES cards(id),
    species_id TEXT NOT NULL,
    finish     TEXT NOT NULL,
    mint       INTEGER NOT NULL,
    price      INTEGER NOT NULL,
    fee        INTEGER NOT NULL,
    seller_id  INTEGER NOT NULL REFERENCES users(id),
    buyer_id   INTEGER NOT NULL REFERENCES users(id),
    at         INTEGER NOT NULL
  );
  CREATE INDEX sales_print ON sales(species_id, finish, at);
  CREATE INDEX sales_at ON sales(at);
  CREATE INDEX sales_seller ON sales(seller_id);

  -- Append-only coin ledger: every balance change is explained.
  CREATE TABLE ledger (
    id      INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    delta   INTEGER NOT NULL,
    balance INTEGER NOT NULL,
    reason  TEXT NOT NULL,
    ref     TEXT,
    at      INTEGER NOT NULL
  );
  CREATE INDEX ledger_user ON ledger(user_id, at);

  -- First player ever to pull each species.
  CREATE TABLE discoveries (
    species_id TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id),
    card_id    INTEGER NOT NULL REFERENCES cards(id),
    at         INTEGER NOT NULL
  );
  CREATE INDEX discoveries_user ON discoveries(user_id);

  CREATE TABLE user_lines (
    user_id      INTEGER NOT NULL REFERENCES users(id),
    family       TEXT NOT NULL,
    completed_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, family)
  );

  CREATE TABLE user_badges (
    user_id   INTEGER NOT NULL REFERENCES users(id),
    badge_id  TEXT NOT NULL,
    earned_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, badge_id)
  );

  CREATE TABLE user_cosmetics (
    user_id     INTEGER NOT NULL REFERENCES users(id),
    cosmetic_id TEXT NOT NULL,
    acquired_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, cosmetic_id)
  );

  CREATE TABLE showcase (
    user_id INTEGER NOT NULL REFERENCES users(id),
    slot    INTEGER NOT NULL,
    card_id INTEGER NOT NULL REFERENCES cards(id),
    PRIMARY KEY (user_id, slot)
  );

  CREATE TABLE feed (
    id      INTEGER PRIMARY KEY,
    type    TEXT NOT NULL,
    at      INTEGER NOT NULL,
    user_id INTEGER REFERENCES users(id),
    payload TEXT NOT NULL
  );
  CREATE INDEX feed_at ON feed(at);
  `,
];
