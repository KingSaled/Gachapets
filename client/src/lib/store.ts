import { create } from 'zustand';
import type { FeedEvent, PackResult } from '@gachapets/shared';
import { sfx } from './sfx.ts';

// ── Toasts ────────────────────────────────────────────────────────────────
export type ToastKind = 'info' | 'coin' | 'error' | 'badge' | 'sale' | 'success';
export interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  body?: string;
  icon?: string;
}

interface ToastState {
  toasts: Toast[];
  push: (t: Omit<Toast, 'id'>, ms?: number) => void;
  dismiss: (id: number) => void;
}

let toastId = 0;
export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],
  push: (t, ms = 4200) => {
    const id = ++toastId;
    set({ toasts: [...get().toasts.slice(-4), { ...t, id }] });
    window.setTimeout(() => get().dismiss(id), ms);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

export function toast(t: Omit<Toast, 'id'>, ms?: number) {
  useToasts.getState().push(t, ms);
}

export function toastError(err: unknown) {
  sfx.error();
  toast({ kind: 'error', title: 'Hold up', body: err instanceof Error ? err.message : String(err) });
}

// ── Live world state from the socket ─────────────────────────────────────
interface LiveState {
  feed: FeedEvent[];
  online: number;
  connected: boolean;
  addFeed: (e: FeedEvent | FeedEvent[]) => void;
  setOnline: (n: number) => void;
  setConnected: (c: boolean) => void;
}

export const useLive = create<LiveState>((set, get) => ({
  feed: [],
  online: 0,
  connected: false,
  addFeed: (e) => {
    const incoming = Array.isArray(e) ? e : [e];
    const seen = new Set(get().feed.map((f) => f.id));
    const merged = [...incoming.filter((x) => !seen.has(x.id)), ...get().feed].sort((a, b) => b.id - a.id).slice(0, 60);
    set({ feed: merged });
  },
  setOnline: (online) => set({ online }),
  setConnected: (connected) => set({ connected }),
}));

// ── Pack opening hand-off (shop → opening stage) ─────────────────────────
interface OpeningState {
  result: PackResult | null;
  setResult: (r: PackResult | null) => void;
}
export const useOpening = create<OpeningState>((set) => ({
  result: null,
  setResult: (result) => set({ result }),
}));

// ── Audio prefs (persisted locally; mirrored to the server for signed-in players) ──
interface AudioState {
  sfx: boolean;
  volume: number;
  setSfx: (on: boolean) => void;
  setVolume: (v: number) => void;
}

function loadAudio(): { sfx: boolean; volume: number } {
  try {
    const raw = localStorage.getItem('gp.audio');
    if (raw) return { sfx: true, volume: 0.7, ...JSON.parse(raw) };
  } catch {
    /* storage unavailable */
  }
  return { sfx: true, volume: 0.7 };
}

export const useAudio = create<AudioState>((set, get) => {
  const initial = loadAudio();
  sfx.setEnabled(initial.sfx);
  sfx.setVolume(initial.volume);
  const persist = () => {
    try {
      localStorage.setItem('gp.audio', JSON.stringify({ sfx: get().sfx, volume: get().volume }));
    } catch {
      /* ignore */
    }
  };
  return {
    ...initial,
    setSfx: (on) => {
      sfx.setEnabled(on);
      set({ sfx: on });
      persist();
    },
    setVolume: (v) => {
      sfx.setVolume(v);
      set({ volume: v });
      persist();
    },
  };
});

// ── "Find on market" hand-off (binder → market) ─────────────────────────
interface MarketFocus {
  speciesId: string | null;
  setSpeciesId: (id: string | null) => void;
}
export const useMarketFocus = create<MarketFocus>((set) => ({
  speciesId: null,
  setSpeciesId: (speciesId) => set({ speciesId }),
}));
