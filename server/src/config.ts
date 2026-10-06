import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const SERVER_ROOT = path.resolve(here, '..');
export const REPO_ROOT = path.resolve(SERVER_ROOT, '..');

const env = process.env;
const isProd = env.NODE_ENV === 'production';

export interface Config {
  port: number;
  host: string;
  isProd: boolean;
  dbPath: string;
  spritesDir: string;
  catalogPath: string;
  clientDist: string;
  /** Sets whose packs are on sale. Others show as "coming soon". */
  liveSets: string[];
  /** Run the ambient NPC collectors that keep the market moving. */
  simulateBots: boolean;
  botTickMs: number;
  /**
   * Dev only: finish rolls land in the top (1 - devLuck) of the odds table,
   * e.g. DEV_LUCK=0.99 so designers can preview big reveals. Ignored in production.
   */
  devLuck: number | null;
}

export function loadConfig(overrides: Partial<Config> = {}): Config {
  return {
    port: Number(env.PORT ?? 8787),
    host: env.HOST ?? '0.0.0.0',
    isProd,
    dbPath: env.DB_PATH ?? path.join(SERVER_ROOT, 'var', 'gachapets.db'),
    spritesDir: env.SPRITES_DIR ?? path.join(REPO_ROOT, 'assets', 'fakemon_itch_front_and_back'),
    catalogPath: path.join(SERVER_ROOT, 'data', 'catalog.json'),
    clientDist: path.join(REPO_ROOT, 'client', 'dist'),
    liveSets: (env.LIVE_SETS ?? 'gen,neo').split(',').map((s) => s.trim()).filter(Boolean),
    simulateBots: (env.SIMULATE_BOTS ?? (isProd ? '0' : '1')) === '1',
    botTickMs: Number(env.BOT_TICK_MS ?? 25_000),
    devLuck: !isProd && env.DEV_LUCK ? Math.min(0.99999, Math.max(0, Number(env.DEV_LUCK))) : null,
    ...overrides,
  };
}
