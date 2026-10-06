import {
  type ButtonHTMLAttributes, type CSSProperties, type ReactNode, useEffect, useId, useMemo, useRef, useState,
} from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import clsx from 'clsx';
import type { BadgeDef, Finish, PricePoint } from '@gachapets/shared';
import { FINISH_INFO, spriteUrl } from '@gachapets/shared';
import { sfx } from '../lib/sfx.ts';
import { coins as fmtCoins } from '../lib/format.ts';
import { useCatalog } from '../lib/queries.ts';
import { PixelIcon, type IconName } from './PixelIcon.tsx';
import './ui.css';

// ── Button ──────────────────────────────────────────────────────────────
type Variant = 'primary' | 'mint' | 'gold' | 'ghost' | 'danger' | 'ink';

export function Button({
  variant = 'primary', size = 'md', icon, children, className, onClick, silent, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg'; icon?: IconName; silent?: boolean }) {
  return (
    <button
      type="button"
      className={clsx('btn', `btn--${variant}`, `btn--${size}`, className)}
      onPointerEnter={() => !rest.disabled && sfx.hover()}
      onClick={(e) => {
        if (!silent) sfx.click();
        onClick?.(e);
      }}
      {...rest}
    >
      {icon && <PixelIcon name={icon} size={size === 'lg' ? 24 : size === 'sm' ? 14 : 18} />}
      {children && <span>{children}</span>}
    </button>
  );
}

export function IconButton({ icon, label, onClick, active, className }: { icon: IconName; label: string; onClick?: () => void; active?: boolean; className?: string }) {
  return (
    <button
      type="button"
      className={clsx('icon-btn', active && 'is-active', className)}
      aria-label={label}
      title={label}
      onPointerEnter={() => sfx.hover()}
      onClick={() => {
        sfx.click();
        onClick?.();
      }}
    >
      <PixelIcon name={icon} size={20} />
    </button>
  );
}

// ── Panel ───────────────────────────────────────────────────────────────
export function Panel({ children, className, title, actions, tone }: { children: ReactNode; className?: string; title?: ReactNode; actions?: ReactNode; tone?: 'raised' | 'sunken' }) {
  return (
    <section className={clsx('panel', tone && `panel--${tone}`, className)}>
      {(title || actions) && (
        <header className="panel-head">
          {title && <h3 className="panel-title">{title}</h3>}
          {actions && <div className="panel-actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

// ── Tabs ────────────────────────────────────────────────────────────────
export function Tabs<T extends string>({ tabs, value, onChange, className }: { tabs: { id: T; label: ReactNode }[]; value: T; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={clsx('tabs', className)} role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={t.id === value}
          className={clsx('tab', t.id === value && 'is-active')}
          onPointerEnter={() => sfx.hover()}
          onClick={() => {
            if (t.id !== value) sfx.tab();
            onChange(t.id);
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ── Sheet (modal) ───────────────────────────────────────────────────────
export function Sheet({ open, onClose, children, wide, label }: { open: boolean; onClose: () => void; children: ReactNode; wide?: boolean; label: string }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        sfx.back();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="sheet-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => { sfx.back(); onClose(); }}>
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={label}
            className={clsx('sheet', wide && 'sheet--wide')}
            initial={{ y: 60, scale: 0.96, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 40, scale: 0.97, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            onClick={(e) => e.stopPropagation()}
          >
            <IconButton icon="close" label="Close" className="sheet-close" onClick={onClose} />
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

// ── Coins ───────────────────────────────────────────────────────────────
export function Coin({ size = 18, spin = false }: { size?: number; spin?: boolean }) {
  return (
    <span className={clsx('coin', spin && 'coin--spin')} style={{ width: size, height: size }} aria-hidden>
      <PixelIcon name="coin" size={size} />
    </span>
  );
}

export function Price({ value, className, size = 16 }: { value: number; className?: string; size?: number }) {
  return (
    <span className={clsx('price', className)}>
      <Coin size={size} />
      <span className="num">{fmtCoins(value)}</span>
    </span>
  );
}

/** Wallet readout that rolls toward new values and floats a +/- delta. */
export function CoinCounter({ value }: { value: number }) {
  const [shown, setShown] = useState(value);
  const [delta, setDelta] = useState<{ n: number; key: number } | null>(null);
  const prev = useRef(value);

  useEffect(() => {
    const from = prev.current;
    const to = value;
    prev.current = value;
    if (from === to) return;
    setDelta({ n: to - from, key: Date.now() });
    const start = performance.now();
    const dur = Math.min(900, 250 + Math.abs(to - from) * 2);
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / dur);
      const eased = 1 - (1 - k) ** 3;
      setShown(Math.round(from + (to - from) * eased));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return (
    <span className="coin-counter" data-wallet>
      <Coin size={20} spin />
      <span className="num">{shown.toLocaleString('en-US')}</span>
      <AnimatePresence>
        {delta && (
          <motion.span
            key={delta.key}
            className={clsx('coin-delta', delta.n < 0 && 'is-neg')}
            initial={{ y: 0, opacity: 1 }}
            animate={{ y: -26, opacity: 0 }}
            transition={{ duration: 1.2, ease: 'easeOut' }}
            onAnimationComplete={() => setDelta(null)}
          >
            {delta.n > 0 ? '+' : ''}
            {delta.n.toLocaleString('en-US')}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

// ── Misc ────────────────────────────────────────────────────────────────
export function FinishTag({ finish, className }: { finish: Finish; className?: string }) {
  return (
    <span className={clsx('finish-tag', className)} data-f={finish}>
      {FINISH_INFO[finish].label}
    </span>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="spinner" role="status">
      <span className="spinner-capsule" />
      <span className="ui-label">{label}…</span>
    </div>
  );
}

export function Empty({ icon = 'capsule', title, children }: { icon?: IconName; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <PixelIcon name={icon} size={48} />
      <h3>{title}</h3>
      {children && <div className="empty-body">{children}</div>}
    </div>
  );
}

export function Medal({ def, earned, size = 56 }: { def: BadgeDef; earned: boolean; size?: number }) {
  return (
    <div className={clsx('medal', `medal--${def.tier}`, !earned && 'is-locked')} style={{ '--m': `${size}px` } as CSSProperties} title={`${def.name} — ${def.desc}${def.reward ? ` (+${def.reward} coins)` : ''}`}>
      <span className="medal-face">{earned || !def.secret ? def.icon : '?'}</span>
    </div>
  );
}

export function Avatar({ speciesId, finish, size = 40, className }: { speciesId: string | null; finish?: Finish | null; size?: number; className?: string }) {
  const catalog = useCatalog();
  const sp = speciesId ? catalog.species.get(speciesId) : undefined;
  return (
    <span className={clsx('avatar', className)} data-f={finish ?? 'base'} style={{ width: size, height: size }}>
      {sp ? (
        <img className="px" src={spriteUrl(sp, finish === 'shiny' ? 'frontShiny' : finish === 'misprint' ? 'back' : 'front')} alt="" draggable={false} />
      ) : (
        <PixelIcon name="face" size={Math.round(size * 0.6)} />
      )}
    </span>
  );
}

export function Meter({ value, max, label }: { value: number; max: number; label?: ReactNode }) {
  const pct = max ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="meter" aria-label={typeof label === 'string' ? label : undefined}>
      <div className="meter-track">
        <div className="meter-fill" style={{ width: `${pct}%` }} />
        {Array.from({ length: 10 }, (_, i) => <i key={i} className="meter-tick" style={{ left: `${(i + 1) * 10}%` }} />)}
      </div>
      {label && <div className="meter-label">{label}</div>}
    </div>
  );
}

// ── Price chart: stepped line, pixel grid, hover readout ────────────────
export function PriceChart({ points, height = 160, color = 'var(--accent-2)' }: { points: PricePoint[]; height?: number; color?: string }) {
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  const W = 600;
  const H = height;
  const data = useMemo(() => {
    const pts = points.length ? [...points] : [];
    if (pts.length === 1) pts.push({ at: Date.now(), value: pts[0].value });
    else if (pts.length) pts.push({ at: Date.now(), value: pts[pts.length - 1].value });
    return pts;
  }, [points]);

  if (data.length < 2) return <div className="chart-empty ui-label">No price history yet</div>;

  const t0 = data[0].at;
  const t1 = data[data.length - 1].at;
  const vals = data.map((p) => p.value);
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  if (lo === hi) {
    lo = Math.max(0, lo * 0.8);
    hi = hi * 1.2 + 1;
  }
  const pad = 10;
  const x = (t: number) => pad + ((t - t0) / Math.max(1, t1 - t0)) * (W - pad * 2);
  const y = (v: number) => H - pad - ((v - lo) / (hi - lo)) * (H - pad * 2);
  const snap = (n: number) => Math.round(n / 3) * 3;

  let d = `M${snap(x(data[0].at))},${snap(y(data[0].value))}`;
  for (let i = 1; i < data.length; i++) d += ` H${snap(x(data[i].at))} V${snap(y(data[i].value))}`;
  const area = `${d} V${H} H${snap(x(data[0].at))} Z`;
  const hp = hover !== null ? data[hover] : null;

  return (
    <div className="chart">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        shapeRendering="crispEdges"
        onPointerMove={(e) => {
          const r = (e.currentTarget as SVGElement).getBoundingClientRect();
          const tx = t0 + (((e.clientX - r.left) / r.width) * W - pad) / (W - pad * 2) * (t1 - t0);
          let best = 0;
          for (let i = 0; i < data.length; i++) if (data[i].at <= tx) best = i;
          setHover(best);
        }}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <pattern id={`dots${id}`} width="12" height="12" patternUnits="userSpaceOnUse">
            <rect width="2" height="2" fill="rgb(255 255 255 / 0.08)" />
          </pattern>
        </defs>
        <rect width={W} height={H} fill={`url(#dots${id})`} />
        <path d={area} fill={color} opacity="0.12" />
        <path d={d} fill="none" stroke={color} strokeWidth="3" vectorEffect="non-scaling-stroke" />
        {hp && <rect x={snap(x(hp.at)) - 1} y={0} width="2" height={H} fill="rgb(255 255 255 / 0.3)" />}
        {hp && <rect x={snap(x(hp.at)) - 4} y={snap(y(hp.value)) - 4} width="8" height="8" fill={color} />}
      </svg>
      <div className="chart-readout">
        {hp ? (
          <>
            <Price value={hp.value} />
            <span className="ui-label">{new Date(hp.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
          </>
        ) : (
          <>
            <span className="ui-label">Low</span> <span className="num">{fmtCoins(Math.min(...vals))}</span>
            <span className="ui-label">High</span> <span className="num">{fmtCoins(Math.max(...vals))}</span>
          </>
        )}
      </div>
    </div>
  );
}

export function Delta({ value }: { value: number }) {
  if (!value) return <span className="delta is-flat num">±0%</span>;
  return (
    <span className={clsx('delta num', value > 0 ? 'is-up' : 'is-down')}>
      <PixelIcon name={value > 0 ? 'up' : 'down'} size={12} />
      {Math.abs(value).toFixed(Math.abs(value) >= 10 ? 0 : 1)}%
    </span>
  );
}
