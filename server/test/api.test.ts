import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.ts';
import { openDb } from '../src/db/index.ts';

let app: FastifyInstance;
let cookie = '';

beforeAll(async () => {
  ({ app } = await buildApp({ db: openDb(':memory:'), config: { simulateBots: false, liveSets: ['gen'] } }));
});
afterAll(async () => {
  await app.close();
});

describe('http api', () => {
  it('registers, sets a session cookie and returns the player', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { username: 'pixel_kai', password: 'hunter2hunter2' } });
    expect(res.statusCode).toBe(200);
    cookie = String(res.headers['set-cookie']).split(';')[0];
    expect(cookie).toMatch(/^gp_session=/);
    expect(res.json().coins).toBe(1000);
  });

  it('rejects duplicate usernames and bad passwords', async () => {
    const dup = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { username: 'PIXEL_KAI', password: 'whatever123' } });
    expect(dup.statusCode).toBe(409);
    const bad = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'pixel_kai', password: 'nope-nope' } });
    expect(bad.statusCode).toBe(401);
  });

  it('requires auth for player routes', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/packs/open', payload: { setId: 'gen' } });
    expect(res.statusCode).toBe(401);
  });

  it('opens a pack and shows it in the collection', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/packs/open', headers: { cookie }, payload: { setId: 'gen' } });
    expect(res.statusCode).toBe(200);
    const pack = res.json();
    expect(pack.cards).toHaveLength(7);
    const col = await app.inject({ method: 'GET', url: '/api/collection', headers: { cookie } });
    expect(col.json().cards).toHaveLength(7);
    const profile = await app.inject({ method: 'GET', url: '/api/profiles/pixel_kai' });
    expect(profile.json().stats.packsOpened).toBe(1);
  });

  it('serves the catalog with an ETag and only allowlisted sprites', async () => {
    const cat = await app.inject({ method: 'GET', url: '/api/catalog' });
    expect(cat.statusCode).toBe(200);
    const again = await app.inject({ method: 'GET', url: '/api/catalog', headers: { 'if-none-match': String(cat.headers.etag) } });
    expect(again.statusCode).toBe(304);

    const sp = cat.json().species[0];
    const ok = await app.inject({ method: 'GET', url: `/sprites/${sp.family}/${sp.dir}/front_nobg.png` });
    expect(ok.statusCode).toBe(200);
    expect(ok.headers['content-type']).toBe('image/png');
    const nope = await app.inject({ method: 'GET', url: `/sprites/${sp.family}/${sp.dir}/pokemon_data.json` });
    expect(nope.statusCode).toBe(404);
    const traversal = await app.inject({ method: 'GET', url: '/sprites/..%2F..%2Fserver/base/front_nobg.png' });
    expect(traversal.statusCode).toBe(404);
  });
});
