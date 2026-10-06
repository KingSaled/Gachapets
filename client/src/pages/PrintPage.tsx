import { useState } from 'react';
import { Link, useLocation, useParams } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import type { Finish, ListingDTO } from '@gachapets/shared';
import { FINISHES, FINISH_INFO, RARITY_INFO } from '@gachapets/shared';
import { api } from '../lib/api.ts';
import { keys, useCatalog, useCollection } from '../lib/queries.ts';
import { sfx } from '../lib/sfx.ts';
import { ago, coins } from '../lib/format.ts';
import { useViewportWidth } from '../lib/useViewport.ts';
import { Card } from '../components/card/Card.tsx';
import { Avatar, Button, Delta, Empty, FinishTag, Panel, Price, PriceChart, Spinner } from '../components/ui.tsx';
import { BuySheet } from './Market.tsx';
import './print.css';

export function PrintPage() {
  const { speciesId, finish } = useParams<{ speciesId: string; finish: Finish }>();
  const catalog = useCatalog();
  const [, navigate] = useLocation();
  const vw = useViewportWidth();
  const sp = catalog.species.get(speciesId);
  const valid = (FINISHES as readonly string[]).includes(finish);
  const { data: stats, isLoading } = useQuery({ queryKey: keys.print(speciesId, finish), queryFn: () => api.print(speciesId, finish), enabled: !!sp && valid });
  const { data: prints } = useQuery({ queryKey: keys.species(speciesId), queryFn: () => api.species(speciesId), enabled: !!sp });
  const { data: listings } = useQuery({
    queryKey: keys.listings({ speciesId, finish, sort: 'price_asc' }),
    queryFn: () => api.listings({ speciesId, finish, sort: 'price_asc', pageSize: 30 }),
    enabled: !!sp && valid,
  });
  const { data: col } = useCollection();
  const [buying, setBuying] = useState<ListingDTO | null>(null);

  if (!sp || !valid) return <div className="page"><Empty title="No such card" /></div>;
  const set = catalog.sets.get(sp.set)!;
  const mineCount = col?.cards.filter((c) => c.speciesId === sp.id && c.finish === finish).length ?? 0;
  const run = FINISH_INFO[finish].printRun;

  return (
    <div className="page print-page">
      <Link href="/market" className="back-link ui-label" onClick={() => sfx.back()}>◂ Market</Link>
      <div className="print-layout">
        <div className="print-card">
          <Card species={sp} finish={finish} width={Math.min(320, vw - 48)} interactive />
          {mineCount > 0 && (
            <Link href={`/binder/${sp.set}`} className="owned-note">You own {mineCount} of these →</Link>
          )}
        </div>

        <div className="print-info">
          <span className="ui-label kicker">{set.name} · No. {String(sp.no).padStart(3, '0')} · {RARITY_INFO[sp.rarity].glyph} {RARITY_INFO[sp.rarity].label}</span>
          <h1 className="print-name">{finish === 'misprint' ? sp.misprintName : sp.name}</h1>

          <div className="finish-switch" role="tablist" aria-label="Finish">
            {FINISHES.map((f) => {
              const p = prints?.find((x) => x.finish === f);
              return (
                <button
                  key={f}
                  type="button"
                  role="tab"
                  aria-selected={f === finish}
                  className={clsx('fs', f === finish && 'is-active', !p?.minted && 'is-unminted')}
                  data-f={f}
                  onClick={() => { sfx.tab(); navigate(`/market/${sp.id}/${f}`); }}
                >
                  <span className="fs-name">{FINISH_INFO[f].short}</span>
                  <span className="fs-val num">{p ? coins(p.marketValue) : '—'}</span>
                  <span className="fs-minted">{p?.minted ? `${p.minted.toLocaleString()} minted` : 'unminted'}</span>
                </button>
              );
            })}
          </div>

          {isLoading || !stats ? (
            <Spinner />
          ) : (
            <>
              <div className="print-headline">
                <div>
                  <span className="ui-label">Market value</span>
                  <div className="headline-value">
                    <Price value={stats.marketValue} size={30} />
                    <Delta value={stats.change24h} />
                    <span className="muted small">7d</span>
                    <Delta value={stats.change7d} />
                  </div>
                </div>
                <FinishTag finish={finish} />
              </div>
              <PriceChart points={stats.history} height={170} color={finish === 'misprint' ? 'var(--f-misprint)' : finish === 'pop3d' ? 'var(--f-pop3d)' : 'var(--accent-2)'} />
              <div className="print-stats">
                <Stat label="Minted" value={stats.minted.toLocaleString()} />
                <Stat label="In circulation" value={stats.circulating.toLocaleString()} />
                <Stat label="Shredded" value={stats.burned.toLocaleString()} />
                <Stat label={run ? 'Run left' : 'Print run'} value={run ? `${Math.max(0, run - stats.minted)} / ${run}` : 'Open'} />
                <Stat label="Lowest ask" value={stats.lowestAsk ? `${coins(stats.lowestAsk)}◎` : '—'} />
                <Stat label="Sales (7d)" value={String(stats.sales7d)} />
                <Stat label="Book value" value={`${coins(stats.referenceValue)}◎`} />
                <Stat label="House buyback" value={`${coins(stats.quickSellValue)}◎`} />
              </div>
              {stats.firstDiscoverer && (
                <p className="muted">
                  ⚑ Species first discovered by <Link href={`/u/${stats.firstDiscoverer.username}`}>{stats.firstDiscoverer.username}</Link> {ago(stats.firstDiscoverer.at)}.
                </p>
              )}
            </>
          )}
        </div>
      </div>

      <div className="print-lower">
        <Panel title={`For sale (${listings?.total ?? 0})`}>
          {!listings?.listings.length ? (
            <p className="muted">No one is selling this print right now.</p>
          ) : (
            <div className="ask-list">
              {listings.listings.map((l) => (
                <div key={l.id} className="ask">
                  <Price value={l.price} size={20} />
                  <span className="num muted">{l.card.printRun ? `№${l.card.mint}/${l.card.printRun}` : `#${l.card.mint}`}</span>
                  <Link href={`/u/${l.seller.username}`} className="seller">
                    <Avatar speciesId={l.seller.avatarSpecies} finish={l.seller.avatarFinish} size={22} />
                    <span>{l.seller.username}</span>
                  </Link>
                  <Button variant="mint" size="sm" onClick={() => setBuying(l)}>Buy</Button>
                </div>
              ))}
            </div>
          )}
        </Panel>
        <Panel title="Sale history">
          {!stats?.recentSales.length ? (
            <p className="muted">Never traded. Be the price-setter.</p>
          ) : (
            <table className="sales">
              <tbody>
                {stats.recentSales.map((s) => (
                  <tr key={s.id}>
                    <td className="num">{coins(s.price)}◎</td>
                    <td className="muted small">#{s.mint}</td>
                    <td className="small">{s.seller} → {s.buyer}</td>
                    <td className="muted small">{ago(s.at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>
      <BuySheet listing={buying} onClose={() => setBuying(null)} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <span className="ui-label">{label}</span>
      <span className="num">{value}</span>
    </div>
  );
}
