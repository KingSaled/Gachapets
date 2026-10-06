import crypto from 'node:crypto';
import { promisify } from 'node:util';
import type { Finish, MeDTO, PublicUser } from '@gachapets/shared';
import {
  COSMETICS, DAILY_COOLDOWN_MS, DAILY_STREAK_WINDOW_MS, DEFAULT_BANNER, DEFAULT_THEME, STARTING_COINS, dailyAmount,
} from '@gachapets/shared';
import { now } from '../clock.ts';
import { type Ctx, GameError, tx } from '../context.ts';
import { adjustCoins } from './wallet.ts';
import { earnedBadges } from './badges.ts';

const scrypt = promisify(crypto.scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;
const SESSION_TTL = 30 * 24 * 60 * 60 * 1000;
export const USERNAME_RE = /^[A-Za-z0-9_]{3,16}$/;

export interface UserRow {
  id: number;
  username: string;
  pass_hash: string;
  coins: number;
  packs_opened: number;
  created_at: number;
  last_daily_at: number | null;
  daily_streak: number;
  title: string | null;
  theme: string;
  banner: string;
  bio: string;
  avatar_species: string | null;
  avatar_finish: Finish | null;
  rarest_card_id: number | null;
  rarest_score: number;
  settings: string;
  is_bot: number;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, saltB64, hashB64] = stored.split('$');
  if (algo !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

export function getUser(ctx: Ctx, id: number): UserRow | undefined {
  return ctx.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
}

export function getUserByName(ctx: Ctx, username: string): UserRow | undefined {
  return ctx.db.prepare('SELECT * FROM users WHERE username = ?').get(username) as UserRow | undefined;
}

export function toPublicUser(u: UserRow): PublicUser {
  return {
    id: u.id,
    username: u.username,
    title: u.title,
    avatarSpecies: u.avatar_species,
    avatarFinish: u.avatar_finish,
    theme: u.theme,
  };
}

export function publicUser(ctx: Ctx, id: number): PublicUser | null {
  const u = getUser(ctx, id);
  return u ? toPublicUser(u) : null;
}

export function createUserRow(ctx: Ctx, username: string, passHash: string, opts: { bot?: boolean; coins?: number } = {}): number {
  return tx(ctx, () => {
    const t = now();
    const id = Number(ctx.db
      .prepare('INSERT INTO users (username, pass_hash, coins, created_at, theme, banner, is_bot) VALUES (?, ?, 0, ?, ?, ?, ?)')
      .run(username, passHash, t, DEFAULT_THEME, DEFAULT_BANNER, opts.bot ? 1 : 0).lastInsertRowid);
    adjustCoins(ctx, id, opts.coins ?? STARTING_COINS, 'starter');
    return id;
  });
}

export async function register(ctx: Ctx, username: string, password: string): Promise<{ userId: number; token: string }> {
  if (!USERNAME_RE.test(username)) throw new GameError(400, 'bad_username', 'Usernames are 3–16 letters, numbers or underscores.');
  if (password.length < 8 || password.length > 200) throw new GameError(400, 'bad_password', 'Passwords need at least 8 characters.');
  if (getUserByName(ctx, username)) throw new GameError(409, 'username_taken', 'That username is taken.');
  const hash = await hashPassword(password);
  let userId: number;
  try {
    userId = createUserRow(ctx, username, hash);
  } catch (err) {
    if (String(err).includes('UNIQUE')) throw new GameError(409, 'username_taken', 'That username is taken.');
    throw err;
  }
  return { userId, token: createSession(ctx, userId) };
}

export async function login(ctx: Ctx, username: string, password: string): Promise<{ userId: number; token: string }> {
  const user = getUserByName(ctx, username);
  // Always run a hash so response timing doesn't reveal which usernames exist.
  const ok = await verifyPassword(password, user?.pass_hash ?? 'scrypt$AAAAAAAAAAAAAAAAAAAAAA==$' + 'A'.repeat(86) + '==');
  if (!user || !ok || user.is_bot) throw new GameError(401, 'bad_credentials', 'Wrong username or password.');
  return { userId: user.id, token: createSession(ctx, user.id) };
}

export function createSession(ctx: Ctx, userId: number): string {
  const token = crypto.randomBytes(32).toString('base64url');
  const t = now();
  ctx.db.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(token, userId, t, t + SESSION_TTL);
  return token;
}

export function userForSession(ctx: Ctx, token: string | undefined): UserRow | undefined {
  if (!token) return undefined;
  const row = ctx.db
    .prepare('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > ?')
    .get(token, now()) as UserRow | undefined;
  return row;
}

export function destroySession(ctx: Ctx, token: string) {
  ctx.db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

// ── Daily bonus ─────────────────────────────────────────────────────────────
export function dailyState(u: UserRow, t = now()) {
  const last = u.last_daily_at ?? 0;
  const available = t - last >= DAILY_COOLDOWN_MS;
  const streakAlive = last > 0 && t - last <= DAILY_STREAK_WINDOW_MS;
  const nextStreak = streakAlive ? u.daily_streak + 1 : 0;
  return { available, nextAt: last + DAILY_COOLDOWN_MS, nextStreak, amount: dailyAmount(nextStreak) };
}

export function claimDaily(ctx: Ctx, userId: number) {
  return tx(ctx, () => {
    const u = getUser(ctx, userId)!;
    const state = dailyState(u);
    if (!state.available) throw new GameError(429, 'daily_not_ready', 'Your daily capsule is still recharging.');
    ctx.db.prepare('UPDATE users SET last_daily_at = ?, daily_streak = ? WHERE id = ?').run(now(), state.nextStreak, userId);
    const coins = adjustCoins(ctx, userId, state.amount, 'daily', state.nextStreak);
    return { coins, amount: state.amount, streak: state.nextStreak };
  });
}

// ── Me ──────────────────────────────────────────────────────────────────────
export function ownedCosmeticIds(ctx: Ctx, userId: number, badges?: Set<string>): string[] {
  const bought = (ctx.db.prepare('SELECT cosmetic_id FROM user_cosmetics WHERE user_id = ?').all(userId) as { cosmetic_id: string }[]).map((r) => r.cosmetic_id);
  const earned = badges ?? new Set(earnedBadges(ctx, userId).map((b) => b.id));
  const free = COSMETICS.filter((c) => (c.price === 0 && !c.unlockBadge) || (c.unlockBadge && earned.has(c.unlockBadge))).map((c) => c.id);
  return [...new Set([...free, ...bought])];
}

export function meDTO(ctx: Ctx, u: UserRow): MeDTO {
  const daily = dailyState(u);
  const badges = earnedBadges(ctx, u.id).map((b) => b.id);
  let settings = { sfx: true, volume: 0.7 };
  try {
    settings = { ...settings, ...JSON.parse(u.settings) };
  } catch { /* keep defaults */ }
  return {
    ...toPublicUser(u),
    coins: u.coins,
    packsOpened: u.packs_opened,
    createdAt: u.created_at,
    dailyAvailable: daily.available,
    dailyStreak: u.daily_streak,
    nextDailyAt: daily.nextAt,
    banner: u.banner,
    bio: u.bio,
    ownedCosmetics: ownedCosmeticIds(ctx, u.id, new Set(badges)),
    badges,
    settings,
  };
}

export function saveSettings(ctx: Ctx, userId: number, settings: { sfx?: boolean; volume?: number }) {
  const u = getUser(ctx, userId)!;
  let current: Record<string, unknown> = {};
  try { current = JSON.parse(u.settings); } catch { /* reset */ }
  const next = { ...current };
  if (typeof settings.sfx === 'boolean') next.sfx = settings.sfx;
  if (typeof settings.volume === 'number') next.volume = Math.min(1, Math.max(0, settings.volume));
  ctx.db.prepare('UPDATE users SET settings = ? WHERE id = ?').run(JSON.stringify(next), userId);
  return next;
}
