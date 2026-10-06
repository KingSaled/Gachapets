import { useEffect, useState, type MouseEvent } from 'react';
import { Link, useLocation, useSearch } from 'wouter';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import type { Finish, ListingDTO } from '@gachapets/shared';
import { ELEMENTS, FINISHES, FINISH_INFO, RARITIES, RARITY_INFO } from '@gachapets/shared';
import { api, type BrowseParams } from '../lib/api.ts';
import { invalidateAfterTrade, keys, setCoins, useCatalog, useMe } from '../lib/queries.ts';
import { toast, toastError } from '../lib/store.ts';
import { sfx } from '../lib/sfx.ts';
import { fx } from '../lib/fx.ts';
import { ago, coins, pct, serial } from '../lib/format.ts';
import { Card } from '../components/card/Card.tsx';
import { Avatar, Button, Delta, Empty, FinishTag, Panel, Price, Sheet, Spinner, Tabs } from '../components/ui.tsx';
import './market.css';

type Tab = 'browse' | 'movers' | 'mine';

export function MarketPage() {
  const [tab, setTab] = useState<Tab>('browse');
  const { data: overview } = useQuery({ queryKey: keys.overview, queryFn: api.overview, refetchInterval: 30_000 });

  return (
    <div className="page market">
      <div className="page-title">
        <div>
          <span className="kicker">The trading floor</span>
          <h1>Market</h1>
        </div>
        <Tabs tabs={[{ id: 'browse', label: 'Browse' }, { id: 'movers', label: 'Movers' }, { id: 'mine', label: 'My listings' }]} value={tab} onChange={setTab} />
      </div>

      <div className="tape">
        <div className="tape-stat"><span className="ui-label">Market cap</span><Price value={overview?.marketCap ?? 0} size={18} /></div>
        <div className="tape-stat"><span className="ui-label">24h volume</span><Price value={overview?.volume24h ?? 0} size={18} /></div>
        <div className="tape-stat"><span className="ui-label">24h sales</span><span className="num led">{overview?.sales24h ?? 0}</span></div>
        <div className="tape-stat"><span className="ui-label">Listings</span><span className="num led">{overview?.activeListings ?? 0}</span></div>
      </div>

      {tab === 'browse' && <Browse grails={overview?.grails ?? []} />}
      {tab === 'movers' && <Movers />}
      {tab === 'mine' && <MyListings />}
    </div>
  );
}

// ── Browse ──────────────────────────────────────────────────────────────
function Browse({ grails }: { grails: ListingDTO[] }) {
  const catalog = useCatalog();
  const search = useSearch();
  const initial = new URLSearchParams(search);
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [filters, setFilters] = useState<BrowseParams>({ sort: 'newest', speciesId: initial.get('speciesId') ?? undefined });
  const [page, setPage] = useState(1);
  const [buying, setBuying] = useState<ListingDTO | null>(null);

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(q), 250);
    return () => window.clearTimeout(id);
  }, [q]);
  useEffect(() => setPage(1), [debounced, filters]);

  const params = { ...filters, q: debounced || undefined, page, pageSize: 24 };
  const { data, isLoading, isFetching } = useQuery({ queryKey: keys.listings(params), queryFn: () => api.listings(params), placeholderData: keepPreviousData });
  const setF = (patch: Partial<BrowseParams>) => {
    sfx.tab();
    setFilters((f) => ({ ...f, ...patch }));
  };
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const focused = filters.speciesId ? catalog.species.get(filters.speciesId) : undefined;
  const noFilters = !debounced && !filters.set && !filters.type && !filters.rarity && !filters.finish && !filters.speciesId;

  return (
    <>
      {noFilters && grails.length > 0 && (
        <Panel className="grails" title={<><span className="grail-glyph">✦</span> Grails on the floor</>}>
          <div className="grail-row">
            {grails.map((l) => <ListingTile key={l.id} listing={l} onBuy={setBuying} compact />)}
          </div>
        </Panel>
      )}

      <div className="filters">
        <input className="input search" placeholder="Search creatures…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
        <select className="select" value={filters.set ?? ''} onChange={(e) => setF({ set: e.target.value || undefined })} aria-label="Set">
          <option value="">All sets</option>
          {catalog.raw.sets.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select className="select" value={filters.type ?? ''} onChange={(e) => setF({ type: e.target.value || undefined })} aria-label="Element">
          <option value="">Any element</option>
          {ELEMENTS.map((el) => <option key={el} value={el}>{el[0].toUpperCase() + el.slice(1)}</option>)}
        </select>
        <select className="select" value={filters.rarity ?? ''} onChange={(e) => setF({ rarity: e.target.value || undefined })} aria-label="Rarity">
          <option value="">Any rarity</option>
          {RARITIES.map((r) => <option key={r} value={r}>{RARITY_INFO[r].label}</option>)}
        </select>
        <select className="select" value={filters.finish ?? ''} onChange={(e) => setF({ finish: e.target.value || undefined })} aria-label="Finish">
          <option value="">Any finish</option>
          {FINISHES.map((f) => <option key={f} value={f}>{FINISH_INFO[f].label}</option>)}
        </select>
        <select className="select" value={filters.sort} onChange={(e) => setF({ sort: e.target.value })} aria-label="Sort">
          <option value="newest">Newest</option>
          <option value="deal">Best deals</option>
          <option value="price_asc">Price ↑</option>
          <option value="price_desc">Price ↓</option>
          <option value="rarity">Rarest</option>
        </select>
      </div>
      {focused && (
        <div className="focus-chip">
          Showing listings for <b>{focused.name}</b>
          <button type="button" className="ui-label" onClick={() => setF({ speciesId: undefined })}>clear ✕</button>
        </div>
      )}

      {isLoading ? (
        <Spinner label="Reading the tape" />
      ) : !data?.listings.length ? (
        <Empty icon="market" title="No listings match">
          <p>Nobody is selling that right now. List your own from the binder and set the price.</p>
        </Empty>
      ) : (
        <div className={clsx('listing-grid', isFetching && 'is-fetching')}>
          {data.listings.map((l) => <ListingTile key={l.id} listing={l} onBuy={setBuying} />)}
        </div>
      )}

      {pages > 1 && (
        <div className="pager">
          <Button variant="ghost" size="sm" icon="left" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</Button>
          <span className="num">{page} / {pages}</span>
          <Button variant="ghost" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      )}

      <BuySheet listing={buying} onClose={() => setBuying(null)} />
    </>
  );
}

export function ListingTile({ listing, onBuy, compact }: { listing: ListingDTO; onBuy: (l: ListingDTO) => void; compact?: boolean }) {
  const catalog = useCatalog();
  const { data: me } = useMe();
  const [, navigate] = useLocation();
  const sp = catalog.species.get(listing.card.speciesId)!;
  const diff = listing.marketValue ? ((listing.price - listing.marketValue) / listing.marketValue) * 100 : 0;
  const mine = me?.id === listing.seller.id;
  return (
    <div className={clsx('listing', compact && 'listing--compact')}>
      <button type="button" className="listing-card" onClick={() => { sfx.click(); navigate(`/market/${sp.id}/${listing.card.finish}`); }} onPointerEnter={() => sfx.hover()}>
        <Card species={sp} finish={listing.card.finish} mint={listing.card.mint} width={compact ? 150 : 168} live={listing.card.finish === 'living'} />
      </button>
      <div className="listing-meta">
        <div className="listing-name">{listing.card.finish === 'misprint' ? sp.misprintName : sp.name}</div>
        <div className="listing-row">
          <FinishTag finish={listing.card.finish} />
          {FINISH_INFO[listing.card.finish].printRun && <span className="num serial-mini">№{serial(listing.card.finish, listing.card.mint)}</span>}
        </div>
        <div className="listing-row">
          <Price value={listing.price} size={18} />
          <span className={clsx('deal num', diff <= -10 && 'is-deal', diff >= 25 && 'is-pricey')} title="Price vs market value">
            {Math.abs(diff) < 1 ? 'at mkt' : `${pct(diff)} mkt`}
          </span>
        </div>
        <div className="listing-row">
          <Link href={`/u/${listing.seller.username}`} className="seller">
            <Avatar speciesId={listing.seller.avatarSpecies} finish={listing.seller.avatarFinish} size={22} />
            <span>{listing.seller.username}</span>
          </Link>
          {!mine && <Button variant="mint" size="sm" onClick={() => onBuy(listing)}>Buy</Button>}
          {mine && <span className="ui-label">yours</span>}
        </div>
      </div>
    </div>
  );
}

export function BuySheet({ listing, onClose }: { listing: ListingDTO | null; onClose: () => void }) {
  const catalog = useCatalog();
  const { data: me } = useMe();
  const [busy, setBusy] = useState(false);
  const sp = listing ? catalog.species.get(listing.card.speciesId) : undefined;
  const after = (me?.coins ?? 0) - (listing?.price ?? 0);

  const buy = async (e: MouseEvent) => {
    if (!listing || busy) return;
    setBusy(true);
    try {
      const res = await api.buy(listing.id);
      sfx.register();
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      fx.burst({ x: r.left + r.width / 2, y: r.top, colors: ['#ffd23f', '#3cf2c4', '#ffffff'], count: 40, speed: 6 });
      setCoins(res.coins);
      toast({ kind: 'success', title: 'Bought!', body: `${sp?.name} is now in your binder.${res.completedLines.length ? ' Evolution line complete!' : ''}` });
      invalidateAfterTrade();
      onClose();
    } catch (err) {
      toastError(err);
      invalidateAfterTrade();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={!!listing} onClose={onClose} label="Confirm purchase">
      {listing && sp && (
        <div className="buy">
          <Card species={sp} finish={listing.card.finish} mint={listing.card.mint} width={220} interactive />
          <div className="buy-info">
            <span className="ui-label">Buying from {listing.seller.username}</span>
            <h2>{listing.card.finish === 'misprint' ? sp.misprintName : sp.name}</h2>
            <FinishTag finish={listing.card.finish} />
            <div className="buy-lines">
              <div><span className="ui-label">Price</span><Price value={listing.price} size={22} /></div>
              <div><span className="ui-label">Market value</span><Price value={listing.marketValue} size={18} /></div>
              <div><span className="ui-label">Wallet after</span><Price value={Math.max(0, after)} size={18} /></div>
            </div>
            {after < 0 && <p className="muted small">You're {coins(-after)} coins short.</p>}
            <Button variant="mint" size="lg" onClick={buy} disabled={busy || after < 0} silent>
              {busy ? 'Buying…' : `Buy for ${coins(listing.price)}`}
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

// ── Movers ──────────────────────────────────────────────────────────────
function Movers() {
  const catalog = useCatalog();
  const [, navigate] = useLocation();
  const { data, isLoading } = useQuery({ queryKey: keys.overview, queryFn: api.overview });
  if (isLoading || !data) return <Spinner label="Crunching numbers" />;

  const Row = ({ speciesId, finish, value, right }: { speciesId: string; finish: Finish; value: number; right: React.ReactNode }) => {
    const sp = catalog.species.get(speciesId)!;
    return (
      <button type="button" className="mover" onClick={() => { sfx.click(); navigate(`/market/${speciesId}/${finish}`); }}>
        <img className="px mover-icon" src={`/sprites/${sp.family}/${sp.dir}/${finish === 'misprint' ? 'back_nobg.png' : finish === 'shiny' ? 'front_shiny_nobg.png' : 'front_nobg.png'}`} alt="" width={48} height={48} />
        <span className="mover-name">{finish === 'misprint' ? sp.misprintName : sp.name}</span>
        <FinishTag finish={finish} />
        <Price value={value} size={16} />
        {right}
      </button>
    );
  };

  return (
    <div className="movers">
      <Panel title="▲ Gainers (24h)">
        {data.gainers.length ? data.gainers.map((m) => <Row key={`${m.speciesId}${m.finish}`} speciesId={m.speciesId} finish={m.finish} value={m.marketValue} right={<Delta value={m.change24h} />} />) : <p className="muted">Quiet day.</p>}
      </Panel>
      <Panel title="▼ Losers (24h)">
        {data.losers.length ? data.losers.map((m) => <Row key={`${m.speciesId}${m.finish}`} speciesId={m.speciesId} finish={m.finish} value={m.marketValue} right={<Delta value={m.change24h} />} />) : <p className="muted">Nothing slipping.</p>}
      </Panel>
      <Panel title="🔥 Most traded (7d)">
        {data.hot.length ? data.hot.map((m) => <Row key={`${m.speciesId}${m.finish}`} speciesId={m.speciesId} finish={m.finish} value={m.marketValue} right={<span className="num">{m.sales} sales</span>} />) : <p className="muted">No trades yet.</p>}
      </Panel>
      <Panel title="Recent sales">
        <table className="sales">
          <tbody>
            {data.recentSales.map((s) => {
              const sp = catalog.species.get(s.speciesId)!;
              return (
                <tr key={s.id} onClick={() => navigate(`/market/${s.speciesId}/${s.finish}`)}>
                  <td>{s.finish === 'misprint' ? sp.misprintName : sp.name}</td>
                  <td><FinishTag finish={s.finish} /></td>
                  <td className="num">{coins(s.price)}◎</td>
                  <td className="muted small">{s.buyer}</td>
                  <td className="muted small">{ago(s.at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}

// ── My listings ─────────────────────────────────────────────────────────
function MyListings() {
  const catalog = useCatalog();
  const { data, isLoading } = useQuery({ queryKey: keys.mine, queryFn: api.myListings });
  const [busy, setBusy] = useState<number | null>(null);
  if (isLoading) return <Spinner />;
  if (!data?.length) {
    return (
      <Empty icon="tag" title="Nothing listed">
        <p>Open a card in your binder and choose “List” to set your price. Sellers pay a 5% fee when a card sells.</p>
      </Empty>
    );
  }
  const cancel = async (id: number) => {
    setBusy(id);
    try {
      await api.cancelListing(id);
      sfx.back();
      invalidateAfterTrade();
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="my-listings">
      {data.map((l) => {
        const sp = catalog.species.get(l.card.speciesId)!;
        const diff = l.marketValue ? ((l.price - l.marketValue) / l.marketValue) * 100 : 0;
        return (
          <div key={l.id} className="my-listing">
            <Card species={sp} finish={l.card.finish} mint={l.card.mint} width={110} live={false} />
            <div className="my-listing-info">
              <b>{sp.name}</b>
              <FinishTag finish={l.card.finish} />
              <span className="muted small">Listed {ago(l.createdAt)}</span>
            </div>
            <div className="my-listing-price">
              <Price value={l.price} size={20} />
              <span className="muted small">Market {coins(l.marketValue)} ({pct(diff)})</span>
            </div>
            <Button variant="ghost" size="sm" onClick={() => cancel(l.id)} disabled={busy === l.id}>Cancel</Button>
          </div>
        );
      })}
    </div>
  );
}
