import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { useLocation } from 'wouter';
import { motion } from 'motion/react';
import clsx from 'clsx';
import type { CardDTO, PackResult } from '@gachapets/shared';
import { FINISH_INFO, PACK_PRICE, allBadges } from '@gachapets/shared';
import { api } from '../lib/api.ts';
import { invalidateAfterTrade, keys, queryClient, setCoins, useCatalog, useCollection, useMe } from '../lib/queries.ts';
import { toast, toastError, useOpening } from '../lib/store.ts';
import { sfx } from '../lib/sfx.ts';
import { fx } from '../lib/fx.ts';
import { coins } from '../lib/format.ts';
import { Card } from '../components/card/Card.tsx';
import { Button, FinishTag, Medal, Price } from '../components/ui.tsx';
import { CardDetailSheet } from '../components/CardDetail.tsx';
import { PixelIcon } from '../components/PixelIcon.tsx';
import './summary.css';

export function PackSummary({ result }: { result: PackResult }) {
  const catalog = useCatalog();
  const { data: me } = useMe();
  const { data: collection } = useCollection();
  const [, navigate] = useLocation();
  const setResult = useOpening((s) => s.setResult);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [sold, setSold] = useState<Set<number>>(new Set());
  const [listed, setListed] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [inspect, setInspect] = useState<CardDTO | null>(null);
  const announced = useRef(false);
  const set = catalog.sets.get(result.setId)!;
  const badgeDefs = useMemo(() => new Map(allBadges(catalog.raw.sets).map((b) => [b.id, b])), [catalog]);

  // Rewards are shown inline below; just give them their jingle once.
  useEffect(() => {
    if (announced.current) return;
    announced.current = true;
    if (result.newBadges.length) window.setTimeout(() => sfx.badge(), 400);
    else if (result.completedLines.length) window.setTimeout(() => sfx.success(), 400);
    void queryClient.invalidateQueries({ queryKey: keys.me });
  }, [result]);

  // How many copies of each species the player now holds (to spot duplicates).
  const owned = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of collection?.cards ?? []) m.set(c.speciesId, (m.get(c.speciesId) ?? 0) + 1);
    return m;
  }, [collection]);

  const cards = result.cards.map((c, i) => ({ ...c, idx: i, sp: catalog.species.get(c.speciesId)! }));
  const order = result.revealOrder.map((i) => cards[i]);
  const live = order.filter((c) => !sold.has(c.id));
  const sellable = live.filter((c) => !listed.has(c.id));
  const totalMarket = live.reduce((s, c) => s + c.marketValue, 0);
  const selectedCards = sellable.filter((c) => selected.has(c.id));
  const selectedValue = selectedCards.reduce((s, c) => s + c.quickSellValue, 0);
  const anySerialSelected = selectedCards.some((c) => FINISH_INFO[c.finish].printRun !== null);
  const newCount = cards.filter((c) => c.isNewForPlayer).length;

  const toggle = (id: number) => {
    sfx.click();
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const selectBulk = () => {
    sfx.tab();
    // Duplicates of species you already hold, in the plainest finish — never anything serialized.
    const bulk = sellable.filter((c) => c.finish === 'base' && c.sp.rarity !== 'star' && (owned.get(c.speciesId) ?? 0) > 1);
    setSelected(new Set(bulk.map((c) => c.id)));
    if (!bulk.length) toast({ kind: 'info', title: 'No bulk here', body: 'Every card in this pack is new to your binder or worth keeping.' });
  };

  const quickSell = async (e: MouseEvent) => {
    if (!selectedCards.length || busy) return;
    setBusy(true);
    try {
      const res = await api.quickSell(selectedCards.map((c) => c.id), anySerialSelected);
      sfx.coins(Math.min(6, selectedCards.length));
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const w = document.querySelector('[data-wallet]')?.getBoundingClientRect() ?? { left: innerWidth - 120, top: 20 };
      fx.coins({ x: r.left + r.width / 2, y: r.top }, { x: w.left + 10, y: w.top + 10 }, selectedCards.length * 2);
      setCoins(res.coins);
      setSold((s) => new Set([...s, ...selectedCards.map((c) => c.id)]));
      setSelected(new Set());
      toast({ kind: 'coin', title: `+${res.earned} coins`, body: `${res.sold} card${res.sold === 1 ? '' : 's'} sold to the house.` });
      invalidateAfterTrade();
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  };

  const again = async () => {
    if (busy) return;
    setBusy(true);
    sfx.register();
    try {
      const next = await api.openPack(result.setId);
      setCoins(next.coins);
      invalidateAfterTrade();
      void queryClient.invalidateQueries({ queryKey: keys.sets });
      setResult(next);
    } catch (err) {
      toastError(err);
      setBusy(false);
    }
  };

  return (
    <div className="summary">
      <header className="summary-head">
        <div>
          <span className="ui-label kicker">{set.name} · pack #{result.packId}</span>
          <h1>Your haul</h1>
        </div>
        <div className="summary-totals">
          <div>
            <span className="ui-label">Market value</span>
            <Price value={totalMarket} size={22} />
          </div>
          <div>
            <span className="ui-label">New species</span>
            <span className="num big">{newCount}</span>
          </div>
          <div>
            <span className="ui-label">Wallet</span>
            <Price value={me?.coins ?? 0} size={22} />
          </div>
        </div>
      </header>

      {(result.newBadges.length > 0 || result.completedLines.length > 0) && (
        <div className="summary-rewards">
          {result.newBadges.map((id) => {
            const def = badgeDefs.get(id);
            return def ? (
              <div key={id} className="reward">
                <Medal def={def} earned size={44} />
                <div>
                  <b>{def.name}</b>
                  <div className="muted small">{def.reward ? `+${def.reward} coins` : def.desc}</div>
                </div>
              </div>
            ) : null;
          })}
          {result.completedLines.map((f) => {
            const line = catalog.lines.get(f) ?? [];
            return (
              <div key={f} className="reward reward--line">
                <span className="line-sprites">
                  {line.map((s) => <img key={s.id} className="px" src={`/sprites/${s.family}/${s.dir}/icon_nobg.png`} alt="" width={32} height={32} />)}
                </span>
                <div>
                  <b>Line complete</b>
                  <div className="muted small">{line.at(-1)?.name} family · +25 coins</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="summary-grid">
        {order.map((c, i) => {
          const isSold = sold.has(c.id);
          const isSel = selected.has(c.id);
          return (
            <motion.div
              key={c.id}
              className={clsx('haul', isSel && 'is-selected', isSold && 'is-sold')}
              initial={{ y: 30, opacity: 0, rotate: -3 }}
              animate={{ y: 0, opacity: isSold ? 0.35 : 1, rotate: 0 }}
              transition={{ delay: i * 0.06, type: 'spring', stiffness: 300, damping: 22 }}
            >
              <div className="haul-card" onClick={() => !isSold && !listed.has(c.id) && toggle(c.id)}>
                <Card species={c.sp} finish={c.finish} mint={c.mint} width={176} interactive={!isSold} />
                {isSel && (
                  <span className="haul-check">
                    <PixelIcon name="check" size={20} />
                  </span>
                )}
                {isSold && <span className="haul-sold">SOLD</span>}
                {!isSold && listed.has(c.id) && <span className="haul-sold haul-sold--listed">LISTED</span>}
                <div className="card-flags">
                  {c.isFirstDiscovery && <span className="flag flag--first">FIRST</span>}
                  {c.isNewForPlayer && <span className="flag flag--new">NEW</span>}
                </div>
              </div>
              <div className="haul-meta">
                <div className="haul-name">{c.finish === 'misprint' ? c.sp.misprintName : c.sp.name}</div>
                <div className="haul-row">
                  <FinishTag finish={c.finish} />
                  <button type="button" className="haul-inspect ui-label" onClick={() => { sfx.click(); setInspect(c); }}>
                    Inspect
                  </button>
                </div>
                <div className="haul-row haul-values">
                  <span title="Market value">
                    <span className="ui-label">MKT</span> <span className="num">{coins(c.marketValue)}</span>
                  </span>
                  <span title="House buyback">
                    <span className="ui-label">HOUSE</span> <span className="num">{coins(c.quickSellValue)}</span>
                  </span>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      <div className="summary-bar">
        <div className="summary-bar-left">
          <Button variant="ghost" size="sm" onClick={selectBulk}>Select bulk</Button>
          {selected.size > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Clear</Button>
          )}
          <span className="muted small">Tap cards to pick them for quick-sell. Everything else stays in your binder.</span>
        </div>
        <div className="summary-bar-right">
          <Button variant={anySerialSelected ? 'danger' : 'gold'} onClick={quickSell} disabled={!selectedCards.length || busy} icon="coin">
            {selectedCards.length ? `Quick-sell ${selectedCards.length} · +${coins(selectedValue)}` : 'Quick-sell'}
          </Button>
          <Button variant="mint" icon="binder" onClick={() => navigate('/binder')}>To binder</Button>
          <Button variant="primary" icon="capsule" onClick={again} disabled={busy || (me?.coins ?? 0) < PACK_PRICE} silent>
            Rip another · {PACK_PRICE}
          </Button>
        </div>
      </div>

      <CardDetailSheet
        card={inspect}
        onClose={() => setInspect(null)}
        onChanged={(kind) => {
          if (!inspect) return;
          const id = inspect.id;
          if (kind === 'shredded') setSold((s) => new Set([...s, id]));
          if (kind === 'listed') setListed((s) => new Set([...s, id]));
          if (kind === 'unlisted') setListed((s) => new Set([...s].filter((x) => x !== id)));
        }}
      />
    </div>
  );
}
