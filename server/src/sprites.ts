import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { SPRITE_ALLOWLIST } from '@gachapets/shared';
import type { Ctx } from './context.ts';

const FAMILY_RE = /^[a-z]+(?:_[a-z]+)*_\d+$/;
const DIRS = new Set(['base', 'stage_1', 'stage_2']);

/**
 * Serves sprite PNGs from the asset library. Only an allowlist of files is
 * exposed and paths are validated, so nothing else in the repo is reachable.
 */
export function registerSprites(app: FastifyInstance, ctx: Ctx) {
  app.get<{ Params: { family: string; dir: string; file: string } }>(
    '/sprites/:family/:dir/:file',
    { config: { rateLimit: false } },
    async (req, reply) => {
      const { family, dir, file } = req.params;
      if (!FAMILY_RE.test(family) || !DIRS.has(dir) || !SPRITE_ALLOWLIST.has(file)) return reply.status(404).send();
      const full = path.join(ctx.config.spritesDir, family, dir, file);
      let stat: fs.Stats;
      try {
        stat = await fs.promises.stat(full);
      } catch {
        return reply.status(404).send();
      }
      const etag = `"${stat.size}-${stat.mtimeMs | 0}"`;
      reply.header('Cache-Control', 'public, max-age=31536000, immutable');
      reply.header('ETag', etag);
      if (req.headers['if-none-match'] === etag) return reply.status(304).send();
      reply.type('image/png');
      return reply.send(fs.createReadStream(full));
    },
  );
}
