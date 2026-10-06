import { memo, type CSSProperties, type MouseEventHandler, type ReactNode } from 'react';
import clsx from 'clsx';
import type { Finish, Species } from '@gachapets/shared';
import { FINISH_INFO, RARITY_INFO, artViewForFinish, spriteUrl } from '@gachapets/shared';
import { sceneLayers } from '../../lib/scenes.ts';
import { serial } from '../../lib/format.ts';
import { movesFor } from '../../lib/moves.ts';
import { useCatalog } from '../../lib/queries.ts';
import { LivingSprite } from './LivingSprite.tsx';
import { useTilt } from './useTilt.ts';
import { PixelIcon } from '../PixelIcon.tsx';
import './card.css';

export interface CardProps {
  species: Species;
  finish: Finish;
  mint?: number;
  /** Card width in px; everything inside scales with it. */
  width?: number;
  /** Pointer tilt + glare. */
  interactive?: boolean;
  faceDown?: boolean;
  /** Rarity "tell" glow on the back of a face-down card. */
  tell?: Finish | null;
  /** Animate Living Foil sprites (off for tiny thumbnails). */
  live?: boolean;
  className?: string;
  style?: CSSProperties;
  onClick?: MouseEventHandler<HTMLDivElement>;
  children?: ReactNode;
}

const VOXEL_LAYERS = 9;

function evolvesFrom(species: Species, lines: Map<string, Species[]>): string {
  if (species.stage === 0 || species.lineSize === 1) return species.lineSize === 1 ? 'BASIC · SOLO' : 'BASIC';
  const line = lines.get(species.family) ?? [];
  const idx = line.findIndex((s) => s.id === species.id);
  const prev = idx > 0 ? line[idx - 1] : undefined;
  return `STAGE ${idx} · EVOLVES FROM ${prev?.name.toUpperCase() ?? '???'}`;
}

export const Card = memo(function Card({
  species, finish, mint, width = 240, interactive = false, faceDown = false, tell = null, live = true,
  className, style, onClick, children,
}: CardProps) {
  const catalog = useCatalog();
  const tiltRef = useTilt<HTMLDivElement>(interactive && !faceDown);
  const set = catalog.sets.get(species.set);
  const scene = sceneLayers(species.types[0], species.family);
  const misprint = finish === 'misprint';
  const name = misprint ? species.misprintName : species.name;

  // Integer sprite scaling keeps pixel art crisp: art window is 0.7× card width tall.
  const artPx = width * 0.66;
  const spritePx = Math.max(1, Math.round((artPx * 1.04) / 64)) * 64;
  const art = spriteUrl(species, artViewForFinish(finish));
  const info = FINISH_INFO[finish];
  const rarity = RARITY_INFO[species.rarity];

  const sprite = (() => {
    if (finish === 'living' && live) {
      return <LivingSprite front={spriteUrl(species, 'front')} shiny={spriteUrl(species, 'frontShiny')} element={species.types[0]} size={spritePx} className="art-sprite-img" />;
    }
    return <img className="px art-sprite-img" src={art} alt="" draggable={false} width={spritePx} height={spritePx} loading="lazy" decoding="async" />;
  })();

  return (
    <div
      ref={tiltRef}
      className={clsx('card', className, interactive && 'is-interactive', faceDown && 'is-down')}
      data-finish={finish}
      data-rarity={species.rarity}
      data-el={species.types[0]}
      style={{ '--cw': `${width}px`, ...style } as CSSProperties}
      onClick={onClick}
    >
      <div className="card-tilt">
        <div className="card-flip">
          {/* ── FRONT ─────────────────────────────────────────────── */}
          <div className="card-face card-front" aria-hidden={faceDown}>
            <div className="card-body">
              <header className="card-head">
                <span className="card-name">{name}</span>
                <span className="card-hp">
                  <small>HP</small>
                  {species.hp}
                </span>
                <span className="card-gems">
                  {species.types.map((t) => (
                    <i key={t} className="gem" data-el={t} title={t} />
                  ))}
                </span>
              </header>

              <div className="card-art">
                {finish === 'parallax' ? (
                  <>
                    <div className="art-layer layer-sky" style={{ backgroundImage: scene.sky }} />
                    <div className="art-layer layer-far" style={{ backgroundImage: scene.far }} />
                    <div className="art-layer layer-mid" style={{ backgroundImage: scene.mid }} />
                    <div className="art-layer layer-near" style={{ backgroundImage: scene.near }} />
                    <div className="art-lenticular" />
                  </>
                ) : (
                  <div className="art-layer" style={{ backgroundImage: `${scene.near}, ${scene.mid}, ${scene.far}, ${scene.sky}` }} />
                )}
                {(finish === 'holo' || finish === 'living' || finish === 'misprint') && <div className="art-foil" />}
                {finish !== 'pop3d' && <div className="art-sprite">{sprite}</div>}
                {finish === 'shiny' && (
                  <div className="art-twinkles">
                    <i />
                    <i />
                    <i />
                  </div>
                )}
              </div>

              <div className="card-strip">{evolvesFrom(species, catalog.lines)}</div>
              <div className="card-moves">
                {movesFor(species).map((m) => (
                  <div key={m.name} className="move">
                    <span className="move-cost">
                      {m.cost.map((el, i) => (
                        <i key={i} className="energy" data-el={el} />
                      ))}
                    </span>
                    <span className="move-name">{m.name}</span>
                    <span className="move-dmg">{m.damage}</span>
                  </div>
                ))}
              </div>
              <p className="card-flavor">{species.flavor}</p>

              <footer className="card-foot">
                <span className="card-setno">
                  {set?.code} {String(species.no).padStart(3, '0')}/{set?.size}
                </span>
                <span className="card-rarity" title={rarity.label}>
                  {rarity.glyph}
                </span>
                {finish !== 'base' && <span className="finish-chip">{info.short}</span>}
                {mint !== undefined && <span className={clsx('card-serial', info.printRun !== null && 'is-serial')}>{serial(finish, mint)}</span>}
              </footer>
              {misprint && <span className="qc-stamp">QC FAIL</span>}
            </div>

            {finish === 'pop3d' && (
              <div className="voxel" style={{ '--sp': `${spritePx}px` } as CSSProperties}>
                {Array.from({ length: VOXEL_LAYERS }, (_, i) => (
                  <img
                    key={i}
                    className="px voxel-layer"
                    src={art}
                    alt=""
                    draggable={false}
                    style={{ '--i': i } as CSSProperties}
                  />
                ))}
              </div>
            )}

            <div className="card-sheen" />
            <div className="card-glare" />
          </div>

          {/* ── BACK ──────────────────────────────────────────────── */}
          <div className="card-face card-back" data-tell={tell ?? undefined}>
            <div className="back-pattern" />
            <div className="back-emblem">
              <PixelIcon name="capsule" size={Math.round(width * 0.28)} />
              <span className="back-word">GACHAPETS</span>
            </div>
            <div className="back-tell" />
          </div>
        </div>
      </div>
      {children}
    </div>
  );
});
