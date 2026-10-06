import fs from 'node:fs';
import path from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import websocket from '@fastify/websocket';
import { ZodError } from 'zod';
import { loadConfig, type Config } from './config.ts';
import { openDb, type DB } from './db/index.ts';
import { loadCatalog } from './catalog-load.ts';
import { Bus, type Ctx, GameError, cryptoRng } from './context.ts';
import { registerRoutes } from './routes.ts';
import { registerSprites } from './sprites.ts';
import { registerSocket } from './ws.ts';

export interface BuildOptions {
  config?: Partial<Config>;
  db?: DB;
  rng?: () => number;
  logger?: boolean;
}

export async function buildApp(opts: BuildOptions = {}): Promise<{ app: FastifyInstance; ctx: Ctx }> {
  const config = loadConfig(opts.config);
  const ctx: Ctx = {
    db: opts.db ?? openDb(config.dbPath),
    catalog: loadCatalog(config.catalogPath),
    config,
    bus: new Bus(),
    rng: opts.rng ?? cryptoRng,
    pending: null,
  };
  ctx.bus.setMaxListeners(0);

  const app = Fastify({
    logger: opts.logger ?? false,
    trustProxy: true,
    bodyLimit: 64 * 1024,
  });

  await app.register(cookie);
  await app.register(rateLimit, { global: true, max: 600, timeWindow: '1 minute' });
  await app.register(websocket);

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof GameError) return reply.status(err.status).send({ error: err.code, message: err.message });
    if (err instanceof ZodError) {
      return reply.status(400).send({ error: 'bad_request', message: err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') });
    }
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    if (status >= 500) req.log.error(err);
    return reply.status(status).send({ error: status === 429 ? 'rate_limited' : 'error', message: status >= 500 ? 'Something broke on our side.' : (err as Error).message });
  });

  registerSprites(app, ctx);
  registerRoutes(app, ctx);
  registerSocket(app, ctx);

  // Production: serve the built client with SPA fallback.
  if (fs.existsSync(path.join(config.clientDist, 'index.html'))) {
    await app.register(fastifyStatic, { root: config.clientDist, wildcard: false, index: ['index.html'] });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api') || req.url.startsWith('/sprites')) return reply.status(404).send({ error: 'not_found' });
      return reply.sendFile('index.html');
    });
  }

  return { app, ctx };
}
