import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import type { Ctx } from './context.ts';
import { userForSession } from './services/users.ts';
import { SESSION_COOKIE } from './routes.ts';

/**
 * Realtime channel: global feed (big pulls, sales, discoveries), online
 * count, and per-user pushes (coin changes, "your listing sold").
 */
export function registerSocket(app: FastifyInstance, ctx: Ctx) {
  const sockets = new Set<WebSocket>();
  const byUser = new Map<number, Set<WebSocket>>();

  const send = (ws: WebSocket, msg: unknown) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
  };
  const broadcast = (msg: unknown) => {
    const data = JSON.stringify(msg);
    for (const ws of sockets) if (ws.readyState === ws.OPEN) ws.send(data);
  };
  const onlineCount = () => byUser.size;

  ctx.bus.on('feed', (event) => broadcast({ type: 'feed', event }));
  ctx.bus.on('user', ({ userId, message }) => {
    for (const ws of byUser.get(userId) ?? []) send(ws, message);
  });

  let lastOnline = -1;
  const onlineTimer = setInterval(() => {
    const n = onlineCount();
    if (n !== lastOnline) {
      lastOnline = n;
      broadcast({ type: 'online', count: n });
    }
  }, 5000);
  onlineTimer.unref();
  app.addHook('onClose', async () => clearInterval(onlineTimer));

  app.get('/ws', { websocket: true }, (socket, req) => {
    const user = userForSession(ctx, req.cookies[SESSION_COOKIE]);
    sockets.add(socket);
    if (user) {
      const set = byUser.get(user.id) ?? new Set();
      set.add(socket);
      byUser.set(user.id, set);
    }
    send(socket, { type: 'hello', online: onlineCount() });

    const ping = setInterval(() => socket.ping(), 25_000);
    socket.on('close', () => {
      clearInterval(ping);
      sockets.delete(socket);
      if (user) {
        const set = byUser.get(user.id);
        set?.delete(socket);
        if (set && !set.size) byUser.delete(user.id);
      }
    });
    socket.on('message', () => { /* client → server messages are not used yet */ });
  });

  app.get('/api/online', async () => ({ count: onlineCount() }));
}
