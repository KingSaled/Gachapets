import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { useLocation } from 'wouter';
import { AnimatePresence, motion, useAnimate, useReducedMotion } from 'motion/react';
import clsx from 'clsx';
import type { Finish, PackResult, PulledCard, Species } from '@gachapets/shared';
import { FINISH_INFO, RARITY_INFO } from '@gachapets/shared';
import { useCatalog } from '../lib/queries.ts';
import { useAudio, useOpening } from '../lib/store.ts';
import { buzz, sfx } from '../lib/sfx.ts';
import { FINISH_COLORS, fx } from '../lib/fx.ts';
import { serial } from '../lib/format.ts';
import { Card } from '../components/card/Card.tsx';
import { Pack } from '../components/Pack.tsx';
import { StageBackdrop, TONES, type StageTone } from '../components/StageBackdrop.tsx';
import { IconButton } from '../components/ui.tsx';
import { PackSummary } from './PackSummary.tsx';
import './opening.css';

type Phase = 'rip' | 'emerge' | 'trick' | 'reveal' | 'summary';
type TopState = 'down' | 'charging' | 'up';

/** How hard a reveal hits, 0 (brisk common) → 6 (factory misprint). */
export function revealLevel(card: PulledCard, sp: Species): number {
  const rank = FINISH_INFO[card.finish].rank;
  if (rank >= 2) return Math.min(6, rank + (sp.rarity === 'star' && rank < 5 ? 1 : 0));
  if (sp.rarity === 'star') return 2;
  if (rank === 1 || sp.rarity === 'rare') return 1;
  return 0;
}

const CHARGE_MS = [0, 0, 0, 900, 1400, 2000, 1500];
const BANNER: Record<number, string> = { 2: 'HOLOFOIL', 3: 'PARALLAX', 4: '3D POP', 5: 'LIVING FOIL', 6: 'FACTORY MISPRINT' };

function bannerFor(card: PulledCard, sp: Species, level: number): { title: string; sub?: string; finish: Finish } | null {
  if (level < 2) return null;
  // The serial number gets its own stamp, so the banner names the creature.
  const name = (card.finish === 'misprint' ? sp.misprintName : sp.name).toUpperCase();
  const sub = sp.rarity === 'star' ? `✦ STAR RARE · ${name}` : name;
  if (card.finish === 'base' || card.finish === 'shiny') return { title: card.finish === 'shiny' ? 'SHINY STAR' : 'STAR RARE', sub: sp.name.toUpperCase(), finish: card.finish === 'shiny' ? 'shiny' : 'pop3d' };
  return { title: BANNER[FINISH_INFO[card.finish].rank] ?? 'HIT', sub, finish: card.finish };
}

function useStageSize() {
  const calc = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const card = Math.round(Math.max(170, Math.min(330, w * 0.64, (h - 250) * 0.716)));
    const pack = Math.round(Math.max(190, Math.min(300, w * 0.66, (h - 240) * 0.62)));
    return { card, pack };
  };
  const [size, setSize] = useState(calc);
  useEffect(() => {
    const on = () => setSize(calc());
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return size;
}

export function OpeningPage() {
  const result = useOpening((s) => s.result);
  const [, navigate] = useLocation();
  useEffect(() => {
    if (!result) navigate('/');
  }, [result, navigate]);
  if (!result) return null;
  return <OpeningStage key={result.packId} result={result} />;
}

function OpeningStage({ result }: { result: PackResult }) {
  const catalog = useCatalog();
  const [, navigate] = useLocation();
  const reduced = useReducedMotion();
  const { sfx: soundOn, setSfx } = useAudio();
  const set = catalog.sets.get(result.setId)!;
  const species = useMemo(() => result.cards.map((c) => catalog.species.get(c.speciesId)!), [result, catalog]);
  const levels = useMemo(() => result.cards.map((c, i) => revealLevel(c, species[i])), [result, species]);
  const size = useStageSize();

  const [phase, setPhase] = useState<Phase>('rip');
  const [rip, setRip] = useState(0);
  const [stack, setStack] = useState<number[]>(() => result.cards.map((_, i) => i));
  const [lifting, setLifting] = useState<number | null>(null);
  const [top, setTop] = useState<TopState>('down');
  const [revealed, setRevealed] = useState<number[]>([]);
  const [banner, setBanner] = useState<ReturnType<typeof bannerFor> & { key: number } | null>(null);
  const [stamp, setStamp] = useState<{ text: string; key: number } | null>(null);
  const [tone, setTone] = useState<StageTone>({ ...TONES.calm, intensity: 0.15 });
  const [dim, setDim] = useState(0);
  const [glitching, setGlitching] = useState(false);
  const [stageRef, animate] = useAnimate<HTMLDivElement>();
  const [flashRef, animateFlash] = useAnimate<HTMLDivElement>();
  const topCardRef = useRef<HTMLDivElement>(null);
  const timers = useRef<number[]>([]);
  const drag = useRef<{ x: number; moved: number } | null>(null);
  const ripDone = useRef(false);

  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  }, []);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const shake = useCallback((px: number, dur = 0.4) => {
    if (reduced || !stageRef.current) return;
    const k = [0, -px, px * 0.8, -px * 0.6, px * 0.4, -px * 0.2, 0];
    void animate(stageRef.current, { x: k, y: k.map((v) => v * 0.5) }, { duration: dur });
  }, [animate, reduced, stageRef]);

  const flash = useCallback((strength: number, dur = 0.5, color = '#fff') => {
    if (!flashRef.current) return;
    flashRef.current.style.background = color;
    void animateFlash(flashRef.current, { opacity: [0, reduced ? strength * 0.3 : strength, 0] }, { duration: reduced ? dur * 1.6 : dur, times: [0, 0.12, 1] });
  }, [animateFlash, reduced, flashRef]);

  const center = () => {
    const r = topCardRef.current?.getBoundingClientRect();
    return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height } : { x: innerWidth / 2, y: innerHeight / 2, w: 200, h: 280 };
  };

  // ── RIP ────────────────────────────────────────────────────────────────
  const finishRip = useCallback(() => {
    if (ripDone.current) return;
    ripDone.current = true;
    setRip(1);
    sfx.ripFinish();
    buzz(30);
    shake(6, 0.35);
    const hue = set.hueA;
    const r = stageRef.current?.getBoundingClientRect();
    fx.burst({
      x: (r?.left ?? 0) + (r?.width ?? innerWidth) / 2,
      y: (r?.top ?? 0) + (r?.height ?? innerHeight) / 2 - size.pack * 0.62,
      w: size.pack, h: 10,
      colors: [`hsl(${hue} 90% 70%)`, '#e8e4f5', '#ffffff', `hsl(${set.hueB} 90% 60%)`],
      count: 50, speed: 7, size: 4, gravity: 0.25,
    });
    setTone({ ...TONES.calm, intensity: 0.35 });
    later(() => {
      setPhase('emerge');
      sfx.slide();
    }, 450);
    later(() => setPhase('trick'), 1250);
  }, [later, set, shake, size.pack, stageRef]);

  const autoRip = useCallback(() => {
    if (ripDone.current) return;
    let p = rip;
    const tick = () => {
      p = Math.min(1, p + 0.07);
      setRip(p);
      sfx.ripTick(p);
      if (p >= 1) finishRip();
      else later(tick, 34);
    };
    tick();
  }, [finishRip, later, rip]);

  const onPointerDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (phase !== 'rip') return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, moved: 0 };
    sfx.crinkle();
  };
  const onPointerMove = (e: RPointerEvent<HTMLDivElement>) => {
    if (phase !== 'rip' || !drag.current || ripDone.current) return;
    const dx = Math.abs(e.clientX - drag.current.x);
    drag.current.x = e.clientX;
    drag.current.moved += dx;
    if (dx < 1) return;
    const next = Math.min(1, rip + dx / (size.pack * 1.05));
    setRip(next);
    sfx.ripTick(next);
    if (Math.random() < 0.35) fx.burst({ x: e.clientX, y: e.clientY, colors: ['#e8e4f5', '#ffffff', `hsl(${set.hueA} 90% 70%)`], count: 2, speed: 3, size: 3, life: 0.6 });
    if (next >= 1) finishRip();
  };
  const onPointerUp = () => {
    if (phase !== 'rip') return;
    const moved = drag.current?.moved ?? 0;
    drag.current = null;
    if (moved < 12) autoRip();
  };

  // ── CARD TRICK ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'trick') return;
    const hits = result.revealOrder.slice(-3);
    let t = 500;
    hits.forEach((idx) => {
      later(() => {
        setLifting(idx);
        sfx.tuck();
      }, t);
      later(() => {
        setStack((s) => [...s.filter((x) => x !== idx), idx]);
        setLifting(null);
      }, t + 330);
      t += 640;
    });
    later(() => {
      setPhase('reveal');
      setTone({ ...TONES.calm, intensity: 0.25 });
    }, t + 300);
  }, [phase, result.revealOrder, later]);

  const skipTrick = () => {
    if (phase !== 'trick') return;
    timers.current.forEach((x) => window.clearTimeout(x));
    timers.current = [];
    const hits = result.revealOrder.slice(-3);
    setStack((s) => [...s.filter((x) => !hits.includes(x)), ...hits]);
    setLifting(null);
    setPhase('reveal');
  };

  // ── REVEAL ─────────────────────────────────────────────────────────────
  const current = stack[0];
  const curLevel = current !== undefined ? levels[current] : 0;

  const impact = useCallback((idx: number) => {
    const card = result.cards[idx];
    const sp = species[idx];
    const level = levels[idx];
    const c = center();
    const colors = FINISH_COLORS[card.finish] ?? FINISH_COLORS.base;
    const toneKey = card.finish === 'base' ? (sp.rarity === 'star' ? 'pop3d' : 'calm') : card.finish;
    setTone({ ...(TONES[toneKey] ?? TONES.calm), intensity: Math.min(1, 0.25 + level * 0.15) });

    if (level === 0) {
      sfx.flip();
    } else if (level === 1) {
      sfx.flip();
      sfx.fanfare(1);
      fx.burst({ x: c.x, y: c.y, colors, count: 26, speed: 5, w: c.w * 0.6, h: c.h * 0.6 });
      buzz(15);
    } else {
      sfx.flip();
      if (level >= 6) sfx.glitch();
      if (level >= 4) sfx.impact(level >= 5 ? 1.2 : 1);
      later(() => sfx.fanfare(Math.min(5, level)), level >= 6 ? 700 : 60);
      flash(level >= 5 ? 1 : 0.55 + level * 0.08, level >= 5 ? 0.9 : 0.5, level >= 6 ? '#ff2a2a' : '#fff');
      shake(4 + level * 2.4, 0.45 + level * 0.05);
      fx.burst({ x: c.x, y: c.y, colors, count: 50 + level * 22, speed: 6 + level, size: 5, w: c.w * 0.4, h: c.h * 0.4 });
      if (level >= 3) later(() => fx.rain(colors, 40 + level * 30), 180);
      buzz(level >= 5 ? [40, 60, 40, 60, 120] : [30, 40, 30]);
      const b = bannerFor(card, sp, level);
      if (b) setBanner({ ...b, key: Date.now() });
      if (level >= 6) {
        setGlitching(true);
        later(() => setGlitching(false), 900);
      }
    }
    if (card.printRun) {
      later(() => {
        setStamp({ text: serial(card.finish, card.mint), key: Date.now() });
        sfx.stamp();
      }, 650);
    }
    if (card.isFirstDiscovery && (sp.rarity === 'rare' || sp.rarity === 'star')) later(() => sfx.discovery(), 900);
    else if (card.isNewForPlayer && level < 2) later(() => sfx.newCard(), 250);
    setDim(level >= 3 ? 0.35 : 0);
  }, [flash, later, levels, result.cards, shake, species]);

  const advance = useCallback(() => {
    if (current === undefined) return;
    setBanner(null);
    setStamp(null);
    setDim(0);
    sfx.whoosh();
    setRevealed((r) => [...r, current]);
    const rest = stack.slice(1);
    setStack(rest);
    setTop('down');
    setTone((t) => ({ ...t, intensity: 0.2 }));
    if (!rest.length) later(() => setPhase('summary'), 450);
  }, [current, later, stack]);

  const activate = useCallback(() => {
    if (phase === 'rip') return autoRip();
    if (phase === 'trick') return skipTrick();
    if (phase !== 'reveal' || current === undefined) return;
    if (top === 'charging') return;
    if (top === 'up') return advance();

    const level = curLevel;
    const charge = reduced ? Math.min(600, CHARGE_MS[level]) : CHARGE_MS[level];
    if (charge > 0) {
      setTop('charging');
      const card = result.cards[current];
      setTone({ ...(TONES[card.finish] ?? TONES.calm), intensity: 0.9, glitch: card.finish === 'misprint' ? 0.6 : 0 });
      setDim(0.55);
      sfx.charge(charge / 1000);
      buzz([10, 30, 10, 30, 10]);
      later(() => {
        setTop('up');
        impact(current);
      }, charge);
    } else {
      setTop('up');
      impact(current);
    }
  }, [phase, current, top, curLevel, reduced, result.cards, later, impact, advance, autoRip]);

  // Brisk commons: auto-advance shortly after flipping.
  useEffect(() => {
    if (phase !== 'reveal' || top !== 'up' || current === undefined || curLevel > 0) return;
    const id = window.setTimeout(() => advance(), 750);
    return () => window.clearTimeout(id);
  }, [phase, top, current, curLevel, advance]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (phase === 'summary') return;
      if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') {
        e.preventDefault();
        activate();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activate, phase]);

  const revealAll = () => {
    timers.current.forEach((x) => window.clearTimeout(x));
    timers.current = [];
    sfx.whoosh();
    setPhase('summary');
  };

  // ── Render ─────────────────────────────────────────────────────────────
  if (phase === 'summary') {
    return (
      <div className="stage stage--summary">
        <StageBackdrop tone={{ ...TONES.calm, intensity: 0.2 }} />
        <PackSummary result={result} />
      </div>
    );
  }

  const tellFor = (idx: number): Finish | null => {
    const f = result.cards[idx].finish;
    return FINISH_INFO[f].rank >= 2 ? f : null;
  };
  const hint = phase === 'rip' ? (rip > 0 ? 'Keep tearing…' : 'Drag across the top to tear it open — or tap')
    : phase === 'trick' ? 'The card trick: hits slide to the back'
      : phase === 'emerge' ? ''
        : top === 'charging' ? 'Something is happening…'
          : top === 'up' ? (curLevel > 0 ? 'Tap for the next card' : '') : `Tap to flip · ${stack.length} left`;

  return (
    <div className={clsx('stage', glitching && 'is-glitching')} onClick={activate}>
      <StageBackdrop tone={tone} />
      <div className="stage-dim" style={{ opacity: dim }} />

      <div className="stage-top" onClick={(e) => e.stopPropagation()}>
        <span className="stage-set">
          <span className="ui-label">Opening</span> {set.name}
        </span>
        <div className="stage-top-actions">
          {phase === 'reveal' && (
            <button type="button" className="stage-skip ui-label" onClick={revealAll}>
              Reveal all ▸▸
            </button>
          )}
          <IconButton icon={soundOn ? 'soundOn' : 'soundOff'} label="Toggle sound" onClick={() => setSfx(!soundOn)} />
          <IconButton icon="close" label="Leave" onClick={() => navigate('/binder')} />
        </div>
      </div>

      <div className="stage-center" ref={stageRef}>
        {(phase === 'rip' || phase === 'emerge') && (
          <div
            className="rip-zone"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onClick={(e) => e.stopPropagation()}
            style={{ width: size.pack }}
          >
            <motion.div
              className="rip-body"
              animate={phase === 'emerge' ? { y: size.pack * 0.9, opacity: 0, rotate: 2 } : { y: 0, opacity: 1 }}
              transition={{ duration: 0.7, ease: [0.5, 0, 0.3, 1] }}
            >
              <Pack set={set} width={size.pack} part="body" interactive={false} />
            </motion.div>
            <motion.div
              className="rip-strip"
              style={{ transformOrigin: '100% 50%' }}
              animate={
                rip >= 1
                  ? { x: size.pack * 0.8, y: -size.pack * 0.9, rotate: 38, opacity: 0 }
                  : { rotate: -rip * 9, y: -rip * 10, x: rip * 4 }
              }
              transition={rip >= 1 ? { duration: 0.65, ease: 'easeOut' } : { type: 'spring', stiffness: 600, damping: 30 }}
            >
              <Pack set={set} width={size.pack} part="strip" interactive={false} />
            </motion.div>
            {phase === 'rip' && (
              <div className="rip-guide" style={{ ['--p' as string]: rip }}>
                <span className="rip-guide-hand">✋</span>
              </div>
            )}
          </div>
        )}

        {(phase === 'emerge' || phase === 'trick' || phase === 'reveal') && (
          <div className="pile" style={{ width: size.card, height: size.card / 0.716 }}>
            {stack.map((idx, pos) => {
              const isTop = pos === 0 && phase === 'reveal';
              const lifted = lifting === idx;
              const sp = species[idx];
              const card = result.cards[idx];
              return (
                <motion.div
                  key={idx}
                  ref={isTop ? topCardRef : undefined}
                  className={clsx('pile-card', isTop && 'is-top', isTop && top === 'charging' && 'is-charging')}
                  data-level={isTop ? curLevel : undefined}
                  initial={phase === 'emerge' ? { y: size.card * 0.9, opacity: 0 } : false}
                  animate={
                    lifted
                      ? { x: size.card * 0.42, y: -size.card * 0.62, rotate: 9, scale: 1.04, zIndex: 300 }
                      : { x: pos * 3, y: -pos * 3, rotate: (idx % 3 - 1) * 1.2 * (pos ? 1 : 0), scale: isTop && top === 'up' ? 1.06 : 1, zIndex: 100 - pos, opacity: 1 }
                  }
                  transition={{ type: 'spring', stiffness: 320, damping: 26, delay: phase === 'emerge' ? pos * 0.04 : 0 }}
                >
                  <Card
                    species={sp}
                    finish={card.finish}
                    mint={card.mint}
                    width={size.card}
                    faceDown={!(isTop && top === 'up')}
                    tell={isTop ? tellFor(idx) : null}
                    interactive={isTop && top === 'up'}
                    live={isTop}
                  >
                    {isTop && top === 'up' && (
                      <div className="card-flags">
                        {card.isFirstDiscovery && <span className="flag flag--first">FIRST EVER</span>}
                        {card.isNewForPlayer && <span className="flag flag--new">NEW</span>}
                      </div>
                    )}
                  </Card>
                </motion.div>
              );
            })}
          </div>
        )}

        <AnimatePresence>
          {stamp && (
            <motion.div
              key={stamp.key}
              className="serial-stamp num"
              initial={{ scale: 2.4, opacity: 0, rotate: -20 }}
              animate={{ scale: 1, opacity: 1, rotate: -8 }}
              exit={{ opacity: 0 }}
              transition={{ type: 'spring', stiffness: 700, damping: 18 }}
            >
              № {stamp.text}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {banner && (
          <motion.div
            key={banner.key}
            className="hit-banner"
            data-f={banner.finish}
            initial={{ scale: 2.2, opacity: 0, y: -10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ type: 'spring', stiffness: 520, damping: 20 }}
          >
            <span className="hit-title">{banner.title}</span>
            {banner.sub && <span className="hit-sub">{banner.sub}</span>}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="stage-hint ui-label">{hint}</div>

      <div className="rail" onClick={(e) => e.stopPropagation()}>
        {result.cards.map((_, slot) => {
          const idx = revealed[slot];
          return (
            <div key={slot} className="rail-slot">
              <AnimatePresence>
                {idx !== undefined && (
                  <motion.div initial={{ y: -160, scale: 2.2, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 380, damping: 26 }}>
                    <Card species={species[idx]} finish={result.cards[idx].finish} width={54} live={false} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      <div className="flash" ref={flashRef} />
      {phase === 'reveal' && top === 'charging' && <ChargeRing level={curLevel} />}
      <span className="sr-only" aria-live="assertive">
        {phase === 'reveal' && top === 'up' && current !== undefined
          ? `${species[current].name}, ${FINISH_INFO[result.cards[current].finish].label}, ${RARITY_INFO[species[current].rarity].label}`
          : ''}
      </span>
    </div>
  );
}

function ChargeRing({ level }: { level: number }) {
  return <div className="charge-ring" data-level={level} />;
}
