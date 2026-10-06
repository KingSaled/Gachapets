import type { FeedEvent } from '@gachapets/shared';
import { invalidateAfterTrade, queryClient, keys, setCoins } from './queries.ts';
import { toast, useLive } from './store.ts';
import { sfx } from './sfx.ts';
import { coins as fmtCoins } from './format.ts';
import { DEMO } from './api.ts';

type ServerMessage =
  | { type: 'hello'; online: number }
  | { type: 'online'; count: number }
  | { type: 'feed'; event: FeedEvent }
  | { type: 'coins'; coins: number; delta: number; reason: string }
  | { type: 'sold'; listingId: number; speciesId: string; price: number; net: number; buyer: string; badges: string[] };

let ws: WebSocket | null = null;
let retry = 0;
let speciesName: (id: string) => string = (id) => id;

export function setSpeciesNamer(fn: (id: string) => string) {
  speciesName = fn;
}

let demoAttached = false;

/** Demo build: listen to the in-page game server's event bus instead of a websocket. */
async function attachDemo() {
  if (demoAttached) return;
  demoAttached = true;
  const local = await import('../demo/localServer.ts');
  await local.ready();
  useLive.getState().setConnected(true);
  const tickOnline = () => useLive.getState().setOnline(local.onlineCount());
  tickOnline();
  window.setInterval(tickOnline, 5000);
  local.bus.on('feed', (event) => dispatch({ type: 'feed', event }));
  local.bus.on('user', ({ userId, message }) => {
    if (userId === local.currentUserId()) dispatch(message as ServerMessage);
  });
}

export function connectSocket() {
  if (DEMO) {
    void attachDemo();
    return;
  }
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/ws`);
  ws.onopen = () => {
    retry = 0;
    useLive.getState().setConnected(true);
  };
  ws.onclose = () => {
    useLive.getState().setConnected(false);
    ws = null;
    const delay = Math.min(15_000, 800 * 2 ** retry++);
    window.setTimeout(connectSocket, delay);
  };
  ws.onmessage = (ev) => {
    let msg: ServerMessage;
    try {
      msg = JSON.parse(ev.data);
    } catch {
      return;
    }
    dispatch(msg);
  };
}

function dispatch(msg: ServerMessage) {
  switch (msg.type) {
    case 'hello':
      useLive.getState().setOnline(msg.online);
      break;
    case 'online':
      useLive.getState().setOnline(msg.count);
      break;
    case 'feed':
      useLive.getState().addFeed(msg.event);
      if (msg.event.type === 'sale' || msg.event.type === 'listing') void queryClient.invalidateQueries({ queryKey: ['market'] });
      break;
    case 'coins':
      setCoins(msg.coins);
      break;
    case 'sold':
      sfx.register();
      toast({ kind: 'sale', title: 'Sold!', body: `${speciesName(msg.speciesId)} went to ${msg.buyer} for ${fmtCoins(msg.price)} — you netted ${fmtCoins(msg.net)}.` }, 6000);
      invalidateAfterTrade();
      void queryClient.invalidateQueries({ queryKey: keys.me });
      break;
  }
}

/** Reconnect so the server re-reads our session cookie (after login/logout). */
export function resetSocket() {
  if (DEMO) return;
  if (ws) {
    ws.onclose = null;
    ws.close();
    ws = null;
  }
  connectSocket();
}
