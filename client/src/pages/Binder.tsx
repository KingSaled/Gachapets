import { useEffect, useMemo, useState, type CSSProperties, type MouseEvent } from 'react';
import { useLocation, useParams } from 'wouter';
import { AnimatePresence, motion } from 'motion/react';
import clsx from 'clsx';
import type { CardDTO, Element, Finish, Species } from '@gachapets/shared';
import { ELEMENTS, FINISHES, FINISH_INFO, RARITY_INFO, quickSellValue, setBadges, spriteUrl } from '@gachapets/shared';
import { api } from '../lib/api.ts';
import { invalidateAfterTrade, setCoins, useCatalog, useCollection, useMe, useSets } from '../lib/queries.ts';
import { toast, toastError } from '../lib/store.ts';
import { sfx } from '../lib/sfx.ts';
import { fx } from '../lib/fx.ts';
import { coins } from '../lib/format.ts';
import { useViewportWidth } from '../lib/useViewport.ts';
import { Card } from '../components/card/Card.tsx';
import { CardDetailSheet } from '../components/CardDetail.tsx';
import { Button, Empty, FinishTag, Medal, Meter, Panel, Price, Sheet, Spinner, Tabs } from '../components/ui.tsx';
import { PixelIcon } from '../components/PixelIcon.tsx';
import './binder.css';

type View = 'binder' | 'inventory';
type Filter = 'all' | 'owned' | 'missing' | 'dupes';

/** The copy that represents a species in its pocket: rarest finish, then lowest mint. */
function bestCopy(cards: CardDTO[]): CardDTO {
  return [...cards].sort((a, b) => FINISH_INFO[b.finish].rank - FINISH_INFO[a.finish].rank || a.mint - b.mint)[0];
}

function usePerPage() {
  const calc = () => (window.innerWidth >= 1100 ? 18 : 9);
  const [n, setN] = useState(calc);
  useEffect(() => {
    const on = () => setN(calc());
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return n;
}

export function BinderPage() {
  const [view, setView] = useState<View>('binder');
  return (
    <div className="page binder-page">
      <div className="page-title">
        <div>
          <span className="kicker">Your collection</span>
          <h1>Binder</h1>
        </div>
        <Tabs
          tabs={[{ id: 'binder', label: 'Set binder' }, { id: 'inventory', label: 'All cards' }]}
          value={view}
          onChange={setView}
        />
      </div>
      {view === 'binder' ? <SetBinder /> : <Inventory />}
    </div>
  );
}

// ── Set binder ──────────────────────────────────────────────────────────
function SetBinder() {
  const catalog = useCatalog();
  const params = useParams<{ setId?: string }>();
  const [, navigate] = useLocation();
  const { data: me } = useMe();
  const { data: sets } = useSets();
  const { data: col, isLoading } = useCollection();
  const [filter, setFilter] = useState<Filter>('all');
  const [element, setElement] = useState<Element | ''>('');
  const [page, setPage] = useState(0);
  const [dir, setDir] = useState(1);
  const [species, setSpecies] = useState<Species | null>(null);
  const perPage = usePerPage();

  const bySpecies = useMemo(() => {
    const m = new Map<string, CardDTO[]>();
    for (const c of col?.cards ?? []) (m.get(c.speciesId) ?? m.set(c.speciesId, []).get(c.speciesId)!).push(c);
    return m;
  }, [col]);

  const liveIds = new Set(sets?.filter((s) => s.live).map((s) => s.id) ?? []);
  const visibleSets = catalog.raw.sets.filter((s) => liveIds.has(s.id) || (catalog.bySet.get(s.id) ?? []).some((sp) => bySpecies.has(sp.id)));
  const setId = params.setId && catalog.sets.has(params.setId) ? params.setId : visibleSets[0]?.id ?? catalog.raw.sets[0].id;
  const set = catalog.sets.get(setId)!;
  const all = catalog.bySet.get(setId) ?? [];

  useEffect(() => setPage(0), [setId, filter, element, perPage]);

  const list = all.filter((sp) => {
    const owned = bySpecies.get(sp.id);
    if (element && !sp.types.includes(element)) return false;
    if (filter === 'owned') return !!owned;
    if (filter === 'missing') return !owned;
    if (filter === 'dupes') return (owned?.length ?? 0) > 1;
    return true;
  });
  const pages = Math.max(1, Math.ceil(list.length / perPage));
  const slice = list.slice(page * perPage, (page + 1) * perPage);

  const owned = all.filter((s) => bySpecies.has(s.id));
  const byRarity = (['common', 'uncommon', 'rare', 'star'] as const).map((r) => ({
    r, have: owned.filter((s) => s.rarity === r).length, total: all.filter((s) => s.rarity === r).length,
  }));
  const shinyDex = all.filter((s) => bySpecies.get(s.id)?.some((c) => c.finish !== 'base')).length;
  const myBadges = new Set(me?.badges ?? []);

  const turn = (d: number) => {
    const next = Math.min(pages - 1, Math.max(0, page + d));
    if (next === page) return;
    setDir(d);
    setPage(next);
    sfx.pageTurn();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === 'ArrowRight') turn(1);
      if (e.key === 'ArrowLeft') turn(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (isLoading) return <Spinner label="Opening binder" />;

  return (
    <div className="set-binder">
      <div className="dividers" role="tablist" aria-label="Sets">
        {visibleSets.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={s.id === setId}
            className={clsx('divider', s.id === setId && 'is-active')}
            style={{ '--hA': s.hueA, '--hB': s.hueB } as CSSProperties}
            onPointerEnter={() => sfx.hover()}
            onClick={() => {
              sfx.pageTurn();
              navigate(`/binder/${s.id}`);
            }}
          >
            <span className="divider-code">{s.code}</span>
            <span className="divider-name">{s.name}</span>
          </button>
        ))}
      </div>

      <Panel className="set-head">
        <div className="set-head-main">
          <div>
            <span className="ui-label">Series {set.index} · {set.code}</span>
            <h2>{set.name}</h2>
          </div>
          <Meter value={owned.length} max={all.length} label={<><span>{owned.length} / {all.length} species</span><span>{Math.round((owned.length / Math.max(1, all.length)) * 100)}%</span></>} />
          <div className="rarity-counts">
            {byRarity.map(({ r, have, total }) => (
              <span key={r} className={clsx('rc', `rc--${r}`, have === total && total > 0 && 'is-done')} title={RARITY_INFO[r].label}>
                {RARITY_INFO[r].glyph} <span className="num">{have}/{total}</span>
              </span>
            ))}
            <span className="rc rc--shiny" title="Shiny-or-better dex">
              ✧ <span className="num">{shinyDex}/{all.length}</span>
            </span>
          </div>
        </div>
        <div className="set-medals">
          {setBadges(set).map((b) => <Medal key={b.id} def={b} earned={myBadges.has(b.id)} size={48} />)}
        </div>
      </Panel>

      <div className="binder-tools">
        <Tabs
          tabs={[
            { id: 'all', label: 'All' },
            { id: 'owned', label: 'Owned' },
            { id: 'missing', label: 'Missing' },
            { id: 'dupes', label: 'Dupes' },
          ]}
          value={filter}
          onChange={setFilter}
        />
        <select className="select el-select" value={element} onChange={(e) => setElement(e.target.value as Element | '')} aria-label="Element">
          <option value="">Every element</option>
          {ELEMENTS.map((el) => <option key={el} value={el}>{el[0].toUpperCase() + el.slice(1)}</option>)}
        </select>
      </div>

      {slice.length === 0 ? (
        <Empty title={filter === 'missing' ? 'Set complete!' : 'Nothing here yet'}>
          {filter === 'missing' ? <p>You own every card in {set.name}. Legend.</p> : <p>Rip some {set.name} packs to start filling these pockets.</p>}
        </Empty>
      ) : (
        <div className="binder-book">
          <button type="button" className="page-arrow" onClick={() => turn(-1)} disabled={page === 0} aria-label="Previous page">
            <PixelIcon name="left" size={28} />
          </button>
          <AnimatePresence mode="popLayout" custom={dir} initial={false}>
            <motion.div
              key={`${setId}-${filter}-${element}-${page}`}
              className={clsx('spread', perPage === 18 && 'spread--double')}
              custom={dir}
              initial={{ rotateY: dir > 0 ? 70 : -70, opacity: 0, x: dir > 0 ? 60 : -60 }}
              animate={{ rotateY: 0, opacity: 1, x: 0 }}
              exit={{ rotateY: dir > 0 ? -60 : 60, opacity: 0, x: dir > 0 ? -60 : 60 }}
              transition={{ duration: 0.32, ease: [0.4, 0, 0.2, 1] }}
            >
              {[0, 1].slice(0, perPage === 18 ? 2 : 1).map((half) => (
                <div key={half} className="binder-sheet">
                  {Array.from({ length: 9 }, (_, i) => {
                    const sp = slice[half * 9 + i];
                    if (!sp) return <div key={i} className="pocket pocket--blank" />;
                    const copies = bySpecies.get(sp.id);
                    return <Pocket key={sp.id} sp={sp} copies={copies} onOpen={() => setSpecies(sp)} />;
                  })}
                </div>
              ))}
            </motion.div>
          </AnimatePresence>
          <button type="button" className="page-arrow" onClick={() => turn(1)} disabled={page >= pages - 1} aria-label="Next page">
            <PixelIcon name="right" size={28} />
          </button>
        </div>
      )}
      <div className="page-count ui-label">
        Page {page + 1} / {pages} · ← → to turn
      </div>

      <SpeciesSheet species={species} copies={species ? bySpecies.get(species.id) ?? [] : []} onClose={() => setSpecies(null)} />
    </div>
  );
}

function Pocket({ sp, copies, onOpen }: { sp: Species; copies?: CardDTO[]; onOpen: () => void }) {
  const set = useCatalog().sets.get(sp.set)!;
  const vw = useViewportWidth();
  const width = vw < 640 ? Math.floor((vw - 32 - 16 - 12) / 3) : 148;
  if (!copies?.length) {
    return (
      <button type="button" className="pocket pocket--missing" onClick={() => { sfx.click(); onOpen(); }} onPointerEnter={() => sfx.hover()}>
        <span className="ghost-card" data-el={sp.types[0]}>
          <img className="px ghost-sprite" src={spriteUrl(sp, 'front')} alt="" loading="lazy" draggable={false} />
          <span className="ghost-no num">{set.code} {String(sp.no).padStart(3, '0')}</span>
          <span className="ghost-name">???</span>
          <span className="ghost-rarity">{RARITY_INFO[sp.rarity].glyph}</span>
        </span>
      </button>
    );
  }
  const best = bestCopy(copies);
  const finishes = new Set(copies.map((c) => c.finish));
  return (
    <button type="button" className="pocket pocket--owned" onClick={() => { sfx.click(); onOpen(); }} onPointerEnter={() => sfx.hover()}>
      <Card species={sp} finish={best.finish} mint={best.mint} width={width} live={best.finish === 'living'} />
      {copies.length > 1 && <span className="pocket-count num">×{copies.length}</span>}
      <span className="pocket-pips">
        {FINISHES.filter((f) => finishes.has(f)).map((f) => <i key={f} data-f={f} title={FINISH_INFO[f].label} />)}
      </span>
    </button>
  );
}

function SpeciesSheet({ species, copies, onClose }: { species: Species | null; copies: CardDTO[]; onClose: () => void }) {
  const [, navigate] = useLocation();
  const [detail, setDetail] = useState<CardDTO | null>(null);
  const sorted = [...copies].sort((a, b) => FINISH_INFO[b.finish].rank - FINISH_INFO[a.finish].rank || a.mint - b.mint);

  // A single copy goes straight to the card detail.
  useEffect(() => {
    if (species && copies.length === 1) setDetail(copies[0]);
  }, [species, copies]);

  if (detail) {
    return <CardDetailSheet card={detail} onClose={() => { setDetail(null); if (copies.length <= 1) onClose(); }} />;
  }
  return (
    <Sheet open={!!species} onClose={onClose} wide label="Species">
      {species && (
        <div className="species-sheet">
          {copies.length === 0 ? (
            <div className="species-missing">
              <Card species={species} finish="base" width={220} faceDown />
              <div>
                <span className="ui-label">Not in your binder yet</span>
                <h2>{RARITY_INFO[species.rarity].glyph} No. {String(species.no).padStart(3, '0')} — ???</h2>
                <p className="muted">Pull it from a pack, or check whether another collector is selling one.</p>
                <div className="detail-row">
                  <Button variant="mint" icon="market" onClick={() => { onClose(); navigate(`/market?speciesId=${species.id}`); }}>Find on market</Button>
                </div>
              </div>
            </div>
          ) : (
            <>
              <h2 className="sheet-title">{species.name} <span className="muted">×{copies.length}</span></h2>
              <div className="copies">
                {sorted.map((c) => (
                  <button key={c.id} type="button" className="copy" onClick={() => { sfx.click(); setDetail(c); }}>
                    <Card species={species} finish={c.finish} mint={c.mint} width={140} live={false} />
                    <FinishTag finish={c.finish} />
                    <span className="num">{FINISH_INFO[c.finish].printRun ? `№ ${c.mint}/${FINISH_INFO[c.finish].printRun}` : `Mint #${c.mint}`}</span>
                    {c.listingId && <span className="ui-label listed-chip">Listed</span>}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </Sheet>
  );
}

// ── Inventory (every physical card, with bulk tools) ───────────────────
type Sort = 'newest' | 'value' | 'rarity' | 'name';

function Inventory() {
  const catalog = useCatalog();
  const { data: col, isLoading } = useCollection();
  const [sort, setSort] = useState<Sort>('newest');
  const [finish, setFinish] = useState<Finish | ''>('');
  const [setFilter, setSetFilter] = useState('');
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [detail, setDetail] = useState<CardDTO | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [shown, setShown] = useState(60);

  const values = col?.values ?? {};
  const valueOf = (c: CardDTO) => values[`${c.speciesId}|${c.finish}`] ?? 0;
  const cards = useMemo(() => {
    let list = col?.cards ?? [];
    if (finish) list = list.filter((c) => c.finish === finish);
    if (setFilter) list = list.filter((c) => catalog.species.get(c.speciesId)?.set === setFilter);
    const sp = (c: CardDTO) => catalog.species.get(c.speciesId)!;
    const sorted = [...list];
    if (sort === 'newest') sorted.sort((a, b) => b.id - a.id);
    if (sort === 'value') sorted.sort((a, b) => valueOf(b) - valueOf(a));
    if (sort === 'rarity') sorted.sort((a, b) => FINISH_INFO[b.finish].rank - FINISH_INFO[a.finish].rank || RARITY_INFO[sp(b).rarity].rank - RARITY_INFO[sp(a).rarity].rank);
    if (sort === 'name') sorted.sort((a, b) => sp(a).name.localeCompare(sp(b).name));
    return sorted;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [col, finish, setFilter, sort, catalog]);

  const total = (col?.cards ?? []).reduce((s, c) => s + valueOf(c), 0);
  const selCards = cards.filter((c) => selected.has(c.id));
  const selValue = selCards.reduce((s, c) => s + quickSellValue(catalog.species.get(c.speciesId)!.rarity, c.finish), 0);
  const selSerial = selCards.some((c) => FINISH_INFO[c.finish].printRun !== null);

  const toggle = (id: number) => {
    sfx.click();
    setConfirm(false);
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  /** Keep the best copy of every species; select the plain extras. */
  const selectDupes = () => {
    const groups = new Map<string, CardDTO[]>();
    for (const c of col?.cards ?? []) (groups.get(c.speciesId) ?? groups.set(c.speciesId, []).get(c.speciesId)!).push(c);
    const pick = new Set<number>();
    for (const list of groups.values()) {
      if (list.length < 2) continue;
      const keep = bestCopy(list);
      for (const c of list) if (c.id !== keep.id && !c.listingId && (c.finish === 'base' || c.finish === 'shiny')) pick.add(c.id);
    }
    setSelecting(true);
    setSelected(pick);
    sfx.tab();
    toast({ kind: 'info', title: `${pick.size} duplicates selected`, body: 'Your best copy of each species is kept. Holo and up are never auto-selected.' });
  };

  const sell = async (e: MouseEvent) => {
    if (!selCards.length || busy) return;
    if (!confirm) {
      setConfirm(true);
      sfx.error();
      return;
    }
    setBusy(true);
    try {
      const sellable = selCards.filter((c) => !c.listingId);
      const res = await api.quickSell(sellable.map((c) => c.id), selSerial);
      sfx.coins(Math.min(6, sellable.length));
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const w = document.querySelector('[data-wallet]')?.getBoundingClientRect();
      if (w) fx.coins({ x: r.left + r.width / 2, y: r.top }, { x: w.left + 10, y: w.top + 10 }, Math.min(20, sellable.length * 2));
      setCoins(res.coins);
      toast({ kind: 'coin', title: `+${coins(res.earned)} coins`, body: `${res.sold} cards shredded by the house.` });
      setSelected(new Set());
      setConfirm(false);
      invalidateAfterTrade();
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  };

  if (isLoading) return <Spinner label="Counting cards" />;
  if (!col?.cards.length) {
    return (
      <Empty title="An empty binder">
        <p>Every collection starts with a single rip.</p>
      </Empty>
    );
  }

  return (
    <div className="inventory">
      <div className="inv-bar">
        <div className="inv-stats">
          <span><span className="ui-label">Cards</span> <span className="num">{col.cards.length.toLocaleString()}</span></span>
          <span><span className="ui-label">Portfolio</span> <Price value={total} size={16} /></span>
        </div>
        <select className="select" value={setFilter} onChange={(e) => setSetFilter(e.target.value)} aria-label="Set">
          <option value="">All sets</option>
          {catalog.raw.sets.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select className="select" value={finish} onChange={(e) => setFinish(e.target.value as Finish | '')} aria-label="Finish">
          <option value="">Any finish</option>
          {FINISHES.map((f) => <option key={f} value={f}>{FINISH_INFO[f].label}</option>)}
        </select>
        <select className="select" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort">
          <option value="newest">Newest</option>
          <option value="value">Most valuable</option>
          <option value="rarity">Rarest</option>
          <option value="name">Name</option>
        </select>
        <Button variant={selecting ? 'mint' : 'ghost'} size="sm" icon="check" onClick={() => { setSelecting((v) => !v); setSelected(new Set()); setConfirm(false); }}>
          {selecting ? 'Done' : 'Select'}
        </Button>
        <Button variant="ghost" size="sm" onClick={selectDupes}>Select dupes</Button>
      </div>

      <div className="inv-grid">
        {cards.slice(0, shown).map((c) => {
          const sp = catalog.species.get(c.speciesId)!;
          const sel = selected.has(c.id);
          return (
            <div key={c.id} className={clsx('inv-item', sel && 'is-selected')}>
              <button type="button" className="inv-card" onClick={() => (selecting ? toggle(c.id) : (sfx.click(), setDetail(c)))} onPointerEnter={() => sfx.hover()}>
                <Card species={sp} finish={c.finish} mint={c.mint} width={132} live={c.finish === 'living'} />
                {sel && <span className="haul-check"><PixelIcon name="check" size={18} /></span>}
                {c.listingId && <span className="listed-chip ui-label">Listed</span>}
              </button>
              <div className="inv-meta">
                <span className="inv-name">{c.finish === 'misprint' ? sp.misprintName : sp.name}</span>
                <Price value={valueOf(c)} size={13} />
              </div>
            </div>
          );
        })}
      </div>
      {shown < cards.length && (
        <div className="inv-more">
          <Button variant="ghost" onClick={() => setShown((n) => n + 60)}>Show more ({cards.length - shown} left)</Button>
        </div>
      )}

      {selecting && (
        <div className="summary-bar">
          <div className="summary-bar-left">
            <span className="num big">{selCards.length}</span>
            <span className="muted small">selected · house pays {coins(selValue)}</span>
          </div>
          <div className="summary-bar-right">
            <Button variant="ghost" size="sm" onClick={() => { setSelected(new Set()); setConfirm(false); }}>Clear</Button>
            <Button variant={confirm || selSerial ? 'danger' : 'gold'} icon="coin" onClick={sell} disabled={!selCards.length || busy}>
              {confirm ? `Confirm: shred ${selCards.length} for ${coins(selValue)}` : `Quick-sell ${selCards.length}`}
            </Button>
          </div>
        </div>
      )}

      <CardDetailSheet card={detail} onClose={() => setDetail(null)} />
    </div>
  );
}
