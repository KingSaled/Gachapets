import type { FeedEvent } from '@gachapets/shared';
import { invalidateAfterTrade, queryClient, keys, setCoins } from './queries.ts';
import { toast, useLive } from './store.ts';
import { sfx } from './sfx.ts';
import { coins as fmtCoins } from './format.ts';

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

export function connectSocket() {
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
  };
}

/** Reconnect so the server re-reads our session cookie (after login/logout). */
export function resetSocket() {
  if (ws) {
    ws.onclose = null;
    ws.close();
    ws = null;
  }
  connectSocket();
}
