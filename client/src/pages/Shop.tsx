import { useState, type CSSProperties } from 'react';
import { useLocation } from 'wouter';
import { motion } from 'motion/react';
import type { CardSet, Finish } from '@gachapets/shared';
import { FINISHES, FINISH_INFO, PACK_PRICE, PACK_SLOTS, STAR_WEIGHT, slotOdds } from '@gachapets/shared';
import { api } from '../lib/api.ts';
import { keys, queryClient, setCoins, useCatalog, useMe, useSets } from '../lib/queries.ts';
import { toastError, useOpening } from '../lib/store.ts';
import { sfx } from '../lib/sfx.ts';
import { coins } from '../lib/format.ts';
import { Pack } from '../components/Pack.tsx';
import { Button, FinishTag, Panel, Price, Sheet } from '../components/ui.tsx';
import './shop.css';

/** Per-pack chance of at least one card of each finish, from the shared odds tables. */
function packOdds(): { finish: Finish; p: number }[] {
  return FINISHES.filter((f) => f !== 'base').map((finish) => {
    let none = 1;
    for (const slot of PACK_SLOTS) none *= 1 - slotOdds(slot).find(([f]) => f === finish)![1];
    return { finish, p: 1 - none };
  });
}

function OddsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const rows = packOdds();
  const pStar = (8 * STAR_WEIGHT) / (40 + 8 * STAR_WEIGHT);
  return (
    <Sheet open={open} onClose={onClose} label="Pull rates">
      <h2 className="sheet-title">Pull rates</h2>
      <p className="muted">Every pack: 4 Commons, 2 Uncommons, 1 Rare slot. Each card rolls its finish independently. Rates are fixed and public — no hidden pity, no rigging.</p>
      <table className="odds">
        <thead>
          <tr>
            <th>Finish</th>
            <th>Per pack</th>
            <th>Print run</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.finish}>
              <td><FinishTag finish={r.finish} /></td>
              <td className="num">1 in {r.p > 0.2 ? (1 / r.p).toFixed(1) : Math.round(1 / r.p).toLocaleString()}</td>
              <td className="num">{FINISH_INFO[r.finish].printRun ? `${FINISH_INFO[r.finish].printRun} per species` : '∞'}</td>
            </tr>
          ))}
          <tr>
            <td><span className="finish-tag" style={{ '--tag': '#ffe27a' } as CSSProperties}>✦ Star Rare species</span></td>
            <td className="num">1 in {(1 / pStar).toFixed(1)}</td>
            <td className="num">8 per set</td>
          </tr>
        </tbody>
      </table>
      <p className="muted small"><a href="/finishes">See every finish side by side →</a></p>
      <p className="muted small">Serialized finishes are capped forever. When a species' run sells out, that roll lands on another species that still has run left — and when a whole set runs dry, it steps down a tier. Scarcity is real, not cosmetic.</p>
    </Sheet>
  );
}

function SetStock({ setId }: { setId: string }) {
  const { data } = useSets();
  const s = data?.find((x) => x.id === setId);
  if (!s) return null;
  const serial: Finish[] = ['pop3d', 'living', 'misprint'];
  return (
    <div className="stock">
      <div className="stock-row">
        <span className="ui-label">Packs opened worldwide</span>
        <span className="num">{s.packsOpened.toLocaleString()}</span>
      </div>
      {serial.map((f) => {
        const r = s.remaining[f];
        if (!r) return null;
        const pct = (r.left / r.total) * 100;
        return (
          <div key={f} className="stock-row">
            <span className="finish-tag" data-f={f}>{f === 'misprint' ? 'Misprint' : FINISH_INFO[f].label}</span>
            <span className="stock-bar"><i style={{ width: `${pct}%` }} data-f={f} /></span>
            <span className="num stock-count">{r.left.toLocaleString()}<small>/{r.total.toLocaleString()}</small></span>
          </div>
        );
      })}
    </div>
  );
}

function SetCard({ set, live }: { set: CardSet; live: boolean }) {
  const { data: me } = useMe();
  const [, navigate] = useLocation();
  const [busy, setBusy] = useState(false);
  const setResult = useOpening((s) => s.setResult);
  const canAfford = (me?.coins ?? 0) >= PACK_PRICE;

  const buy = async () => {
    if (busy) return;
    setBusy(true);
    sfx.register();
    try {
      const result = await api.openPack(set.id);
      setResult(result);
      setCoins(result.coins);
      void queryClient.invalidateQueries({ queryKey: keys.collection });
      void queryClient.invalidateQueries({ queryKey: keys.sets });
      navigate('/open');
    } catch (err) {
      toastError(err);
      setBusy(false);
    }
  };

  return (
    <motion.article className="set-card" initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 220, damping: 22 }}>
      <div className="set-card-pack">
        <Pack set={set} width={250} locked={!live} />
      </div>
      <div className="set-card-info">
        <span className="kicker ui-label">Series {set.index} · {set.code} · {set.size} cards</span>
        <h2>{set.name}</h2>
        <p className="muted">{set.tagline}</p>
        {live ? (
          <>
            <SetStock setId={set.id} />
            <div className="set-card-buy">
              <Button variant="primary" size="lg" onClick={buy} disabled={busy || !canAfford} silent>
                {busy ? 'Ripping…' : 'Buy & rip'}
              </Button>
              <Price value={PACK_PRICE} size={20} />
            </div>
            {!canAfford && <p className="muted small">Not enough coins — quick-sell some bulk in your binder, sell on the market, or claim your daily capsule.</p>}
          </>
        ) : (
          <p className="muted small">This series hasn't hit shelves yet. Collectors who finish earlier sets will be ready.</p>
        )}
      </div>
    </motion.article>
  );
}

export function ShopPage() {
  const catalog = useCatalog();
  const { data: sets } = useSets();
  const { data: me } = useMe();
  const [odds, setOdds] = useState(false);
  const liveIds = new Set(sets?.filter((s) => s.live).map((s) => s.id) ?? []);
  const live = catalog.raw.sets.filter((s) => liveIds.has(s.id));
  const upcoming = catalog.raw.sets.filter((s) => !liveIds.has(s.id)).slice(0, 6);

  return (
    <div className="page shop">
      <div className="page-title">
        <div>
          <span className="kicker">The capsule counter</span>
          <h1>Rip a pack</h1>
        </div>
        <p className="sub">
          {me && me.packsOpened === 0
            ? 'Your first pack is waiting. Hits get tucked to the back — flip slow.'
            : `${coins(me?.coins ?? 0)} coins in your pocket. Hits get tucked to the back — flip slow.`}
        </p>
        <Button variant="ghost" size="sm" icon="sparkle" onClick={() => setOdds(true)}>
          Pull rates
        </Button>
      </div>

      <div className="set-shelf">
        {live.map((s) => (
          <SetCard key={s.id} set={s} live />
        ))}
      </div>

      <Panel className="coming" title="On the horizon">
        <div className="coming-row">
          {upcoming.map((s) => (
            <div key={s.id} className="coming-item">
              <Pack set={s} width={120} locked interactive={false} />
              <span className="ui-label">{s.code}</span>
            </div>
          ))}
        </div>
        <p className="muted small">{catalog.raw.sets.length} series and {catalog.raw.species.length.toLocaleString()} species in the vault. New series release over time — every one with its own serialized print runs.</p>
      </Panel>

      <OddsSheet open={odds} onClose={() => setOdds(false)} />
    </div>
  );
}
