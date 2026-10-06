import { type CSSProperties, memo, useMemo } from 'react';
import clsx from 'clsx';
import type { CardSet } from '@gachapets/shared';
import { CARDS_PER_PACK, spriteUrl } from '@gachapets/shared';
import { useCatalog } from '../lib/queries.ts';
import { useTilt } from './card/useTilt.ts';
import './pack.css';

const CRIMP = 2.2; // % depth of the crimped top/bottom edges
export const TEAR_TOP = 10.5; // % — the tear band, where the strip separates
export const TEAR_BOT = 13;
const TEETH = 22;

/** Jagged rip profile in [0,1], deterministic so strip and body line up. */
function jag(i: number) {
  const v = Math.sin(i * 12.9898) * 43758.5453;
  return v - Math.floor(v);
}

/**
 * Clip-paths for the whole wrapper (crimped both ends), the tear strip
 * (crimped top, jagged bottom) and the opened body (jagged top, crimped bottom).
 * Coordinates are in each part's own box.
 */
function packClip(part: 'whole' | 'strip' | 'body') {
  const pts: string[] = [];
  const step = 100 / TEETH;
  const crimpTop = (scale: number) => {
    for (let i = 0; i <= TEETH; i++) pts.push(`${(i * step).toFixed(2)}% ${((i % 2 ? CRIMP : 0) * scale).toFixed(2)}%`);
  };
  const crimpBottom = (scale: number) => {
    for (let i = TEETH; i >= 0; i--) pts.push(`${(i * step).toFixed(2)}% ${(100 - (i % 2 ? CRIMP : 0) * scale).toFixed(2)}%`);
  };
  const band = TEAR_BOT - TEAR_TOP;
  const tearAbs = (i: number) => TEAR_TOP + band * jag(i);
  const RIPS = 30;
  if (part === 'whole') {
    crimpTop(1);
    crimpBottom(1);
  } else if (part === 'strip') {
    crimpTop(100 / TEAR_BOT);
    for (let i = RIPS; i >= 0; i--) pts.push(`${((i / RIPS) * 100).toFixed(2)}% ${((tearAbs(i) / TEAR_BOT) * 100).toFixed(2)}%`);
  } else {
    const h = 100 - TEAR_TOP;
    for (let i = 0; i <= RIPS; i++) pts.push(`${((i / RIPS) * 100).toFixed(2)}% ${(((tearAbs(i) - TEAR_TOP) / h) * 100).toFixed(2)}%`);
    crimpBottom(100 / h);
  }
  return `polygon(${pts.join(',')})`;
}

interface PackProps {
  set: CardSet;
  width?: number;
  interactive?: boolean;
  locked?: boolean;
  /** Render only the tear strip or only the body (for the rip animation). */
  part?: 'whole' | 'strip' | 'body';
  className?: string;
  style?: CSSProperties;
}

export const Pack = memo(function Pack({ set, width = 260, interactive = true, locked = false, part = 'whole', className, style }: PackProps) {
  const catalog = useCatalog();
  const ref = useTilt<HTMLDivElement>(interactive && part === 'whole', 12);
  const mascots = set.mascots.map((id) => catalog.species.get(id)).filter((s) => !!s);
  const clip = useMemo(() => packClip(part), [part]);

  return (
    <div
      ref={ref}
      className={clsx('pack', `pack--${part}`, locked && 'is-locked', className)}
      style={{ '--pw': `${width}px`, '--hA': set.hueA, '--hB': set.hueB, '--tear-top': TEAR_TOP / 100, '--tear-bot': TEAR_BOT / 100, ...style } as CSSProperties}
    >
      <div className="pack-tilt">
        <div className="pack-body" style={{ clipPath: clip }}>
          <div className="pack-inner">
          <div className="pack-bg" />
          <div className="pack-crimp pack-crimp--top" />
          <div className="pack-tearline">
            <span>✂ TEAR HERE</span>
          </div>
          <div className="pack-logo">
            GACHA<b>PETS</b>
          </div>
          <div className="pack-art">
            <div className="pack-burst" />
            {mascots[1] && <img className="px pack-mascot pack-mascot--l" src={spriteUrl(mascots[1], 'front')} alt="" draggable={false} />}
            {mascots[2] && <img className="px pack-mascot pack-mascot--r" src={spriteUrl(mascots[2], 'front')} alt="" draggable={false} />}
            {mascots[0] && <img className="px pack-mascot pack-mascot--c" src={spriteUrl(mascots[0], 'frontShiny')} alt="" draggable={false} />}
          </div>
          <div className="pack-ribbon">
            <span className="pack-set">{set.name}</span>
          </div>
          <div className="pack-meta">
            <span className="pack-count">{CARDS_PER_PACK} CARDS</span>
            <span className="pack-code">SERIES {set.index} · {set.code}</span>
          </div>
          <div className="pack-barcode" />
          <div className="pack-crimp pack-crimp--bottom" />
          <div className="pack-foil" />
          <div className="pack-glare" />
          {locked && (
            <div className="pack-lock">
              <span>COMING SOON</span>
            </div>
          )}
          </div>
        </div>
      </div>
    </div>
  );
});
