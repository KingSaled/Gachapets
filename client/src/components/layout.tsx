import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { AnimatePresence, motion } from 'motion/react';
import clsx from 'clsx';
import { fx } from '../lib/fx.ts';
import { sfx } from '../lib/sfx.ts';
import { useAudio, useLive, useToasts } from '../lib/store.ts';
import { useCatalog, useMe } from '../lib/queries.ts';
import { describe } from '../lib/feedText.ts';
import { ago } from '../lib/format.ts';
import { PixelIcon, type IconName } from './PixelIcon.tsx';
import { Avatar, CoinCounter, IconButton } from './ui.tsx';
import { DailyCapsule } from './DailyCapsule.tsx';
import './layout.css';

/** Chunky low-res starfield + drifting capsules behind everything. */
export function Backdrop() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    const SCALE = 3;
    let w = 0;
    let h = 0;
    const stars: { x: number; y: number; z: number; tw: number }[] = [];
    const caps: { x: number; y: number; v: number; hue: string; r: number }[] = [];
    const mouse = { x: 0, y: 0 };
    const resize = () => {
      w = Math.ceil(window.innerWidth / SCALE);
      h = Math.ceil(window.innerHeight / SCALE);
      canvas.width = w;
      canvas.height = h;
      stars.length = 0;
      for (let i = 0; i < (w * h) / 260; i++) stars.push({ x: Math.random() * w, y: Math.random() * h, z: Math.random(), tw: Math.random() * 6 });
      caps.length = 0;
      for (let i = 0; i < 6; i++) caps.push({ x: Math.random() * w, y: Math.random() * h, v: 0.04 + Math.random() * 0.06, hue: ['#ff4f8b', '#3cf2c4', '#ffd23f', '#8a6bff'][i % 4], r: 3 + Math.floor(Math.random() * 3) });
    };
    resize();
    const onMove = (e: PointerEvent) => {
      mouse.x = e.clientX / window.innerWidth - 0.5;
      mouse.y = e.clientY / window.innerHeight - 0.5;
    };
    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', onMove);
    let raf = 0;
    let last = 0;
    const draw = (t: number) => {
      raf = requestAnimationFrame(draw);
      if (t - last < 50 || document.hidden) return;
      last = t;
      ctx.clearRect(0, 0, w, h);
      for (const s of stars) {
        const px = Math.round(s.x - mouse.x * s.z * 8);
        const py = Math.round(s.y - mouse.y * s.z * 6);
        const b = 0.35 + 0.65 * Math.abs(Math.sin(t / 900 + s.tw)) * s.z;
        ctx.fillStyle = `rgba(${s.z > 0.8 ? '255,214,240' : '190,180,255'},${b.toFixed(2)})`;
        ctx.fillRect(px, py, 1, 1);
      }
      for (const c of caps) {
        c.y -= c.v;
        if (c.y < -10) {
          c.y = h + 10;
          c.x = Math.random() * w;
        }
        const px = Math.round(c.x - mouse.x * 12);
        const py = Math.round(c.y - mouse.y * 8);
        ctx.globalAlpha = 0.16;
        ctx.fillStyle = c.hue;
        ctx.fillRect(px - c.r, py - c.r, c.r * 2, c.r);
        ctx.fillStyle = '#f4efff';
        ctx.fillRect(px - c.r, py, c.r * 2, c.r);
        ctx.globalAlpha = 1;
      }
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onMove);
    };
  }, []);
  return (
    <div className="backdrop" aria-hidden>
      <canvas ref={ref} className="px" />
    </div>
  );
}

export function FxLayer() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    fx.attach(ref.current!);
    return () => fx.detach();
  }, []);
  return <canvas ref={ref} className="fx-layer" aria-hidden />;
}

function Ticker() {
  const catalog = useCatalog();
  const feed = useLive((s) => s.feed);
  const items = feed.slice(0, 14);
  if (!items.length) return <div className="ticker ticker--empty ui-label">Waiting for the first big pull…</div>;
  const row = items.map((e) => {
    const line = describe(e, catalog);
    return (
      <span key={e.id} className="ticker-item" data-f={line.finish}>
        <b>{line.who}</b> {line.verb} <em>{line.what}</em>
        {line.extra && <span className="ticker-extra">{line.extra}</span>}
        <span className="ticker-ago">{ago(e.at)}</span>
      </span>
    );
  });
  return (
    <div className="ticker" aria-label="Live feed">
      <span className="ticker-live">LIVE</span>
      <div className="ticker-track">
        <div className="ticker-run" style={{ animationDuration: `${Math.max(30, items.length * 6)}s` }}>
          {row}
          {row}
        </div>
      </div>
    </div>
  );
}

export function Hud() {
  const { data: me } = useMe();
  const { sfx: on, setSfx } = useAudio();
  const online = useLive((s) => s.online);
  return (
    <header className="hud">
      <Link href="/" className="logo" aria-label="Gachapets home" onClick={() => sfx.click()}>
        <span className="logo-capsule" aria-hidden>
          <PixelIcon name="capsule" size={30} />
        </span>
        <span className="logo-word">
          GACHA<span>PETS</span>
        </span>
      </Link>
      <Ticker />
      <div className="hud-right">
        <span className="online" title="Collectors online">
          <i />
          <span className="num">{online}</span>
        </span>
        {me && <DailyCapsule />}
        {me && <CoinCounter value={me.coins} />}
        <IconButton icon={on ? 'soundOn' : 'soundOff'} label={on ? 'Mute sounds' : 'Unmute sounds'} onClick={() => { setSfx(!on); sfx.toggle(!on); }} />
        {me && (
          <Link href={`/u/${me.username}`} className="hud-avatar" aria-label="Your profile" onClick={() => sfx.click()}>
            <Avatar speciesId={me.avatarSpecies} finish={me.avatarFinish} size={40} />
          </Link>
        )}
      </div>
    </header>
  );
}

const NAV: { href: string; icon: IconName; label: string; match: (p: string) => boolean }[] = [
  { href: '/', icon: 'capsule', label: 'Packs', match: (p) => p === '/' || p.startsWith('/open') },
  { href: '/binder', icon: 'binder', label: 'Binder', match: (p) => p.startsWith('/binder') },
  { href: '/market', icon: 'market', label: 'Market', match: (p) => p.startsWith('/market') },
  { href: '/hall', icon: 'trophy', label: 'Hall', match: (p) => p.startsWith('/hall') },
];

export function Dock() {
  const [loc] = useLocation();
  const { data: me } = useMe();
  const items = [...NAV, { href: me ? `/u/${me.username}` : '/', icon: 'face' as IconName, label: 'Me', match: (p: string) => !!me && p.toLowerCase() === `/u/${me.username.toLowerCase()}` }];
  return (
    <nav className="dock" aria-label="Main">
      {items.map((n) => {
        const active = n.match(loc);
        return (
          <Link
            key={n.label}
            href={n.href}
            className={clsx('dock-item', active && 'is-active')}
            onPointerEnter={() => sfx.hover()}
            onClick={() => !active && sfx.tab()}
          >
            <span className="dock-icon">
              <PixelIcon name={n.icon} size={28} />
            </span>
            <span className="dock-label">{n.label}</span>
            {active && <motion.span layoutId="dock-pip" className="dock-pip" transition={{ type: 'spring', stiffness: 500, damping: 30 }} />}
          </Link>
        );
      })}
    </nav>
  );
}

export function Toasts() {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);
  return (
    <div className="toasts" aria-live="polite">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            className={clsx('toast', `toast--${t.kind}`)}
            initial={{ x: -40, opacity: 0, scale: 0.9 }}
            animate={{ x: 0, opacity: 1, scale: 1 }}
            exit={{ x: -30, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 500, damping: 34 }}
            onClick={() => dismiss(t.id)}
          >
            <span className="toast-icon">{t.icon ?? (t.kind === 'error' ? '!' : t.kind === 'coin' || t.kind === 'sale' ? '◎' : t.kind === 'badge' ? '★' : '✓')}</span>
            <div>
              <div className="toast-title">{t.title}</div>
              {t.body && <div className="toast-body">{t.body}</div>}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}
