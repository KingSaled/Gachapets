import { buildApp } from './app.ts';
import { startBots } from './services/bots.ts';
import { recomputeAll } from './services/prints.ts';

const { app, ctx } = await buildApp({ logger: true });

// Scarcity drifts as more packs are opened, so re-price everything periodically.
const repricer = setInterval(() => {
  const changed = recomputeAll(ctx);
  if (changed) app.log.info(`repriced ${changed} prints`);
}, 10 * 60 * 1000);
repricer.unref();

const stopBots = ctx.config.simulateBots ? startBots(ctx, (m) => app.log.info(m)) : () => {};

const shutdown = async () => {
  stopBots();
  clearInterval(repricer);
  await app.close();
  ctx.db.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

if (ctx.config.devLuck) app.log.warn(`DEV_LUCK=${ctx.config.devLuck}: pack odds are rigged for previewing reveals`);

await app.listen({ port: ctx.config.port, host: ctx.config.host });
app.log.info(`Gachapets server on :${ctx.config.port} — live sets: ${ctx.config.liveSets.join(', ')}`);
