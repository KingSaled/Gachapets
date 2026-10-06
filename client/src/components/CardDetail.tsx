import { useEffect, useState, type MouseEvent } from 'react';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import type { CardDTO } from '@gachapets/shared';
import { FINISH_INFO, MAX_LISTING_PRICE, RARITY_INFO, SHOWCASE_SLOTS, marketFee } from '@gachapets/shared';
import { api } from '../lib/api.ts';
import { invalidateAfterTrade, keys, queryClient, setCoins, setMe, useCatalog, useMe } from '../lib/queries.ts';
import { toast, toastError } from '../lib/store.ts';
import { sfx } from '../lib/sfx.ts';
import { fx } from '../lib/fx.ts';
import { ago, coins, serial } from '../lib/format.ts';
import { Card } from './card/Card.tsx';
import { Button, Delta, FinishTag, Price, PriceChart, Sheet } from './ui.tsx';
import './carddetail.css';

export type CardChange = 'listed' | 'unlisted' | 'shredded';

interface Props {
  card: CardDTO | null;
  onClose: () => void;
  /** Called after a market action or shred on this card. */
  onChanged?: (kind: CardChange) => void;
}

export function CardDetailSheet({ card, onClose, onChanged }: Props) {
  return (
    <Sheet open={!!card} onClose={onClose} wide label="Card details">
      {card && <CardDetail key={card.id} card={card} onClose={onClose} onChanged={onChanged} />}
    </Sheet>
  );
}

function CardDetail({ card, onClose, onChanged }: { card: CardDTO; onClose: () => void; onChanged?: (kind: CardChange) => void }) {
  const catalog = useCatalog();
  const { data: me } = useMe();
  const [, navigate] = useLocation();
  const sp = catalog.species.get(card.speciesId)!;
  const set = catalog.sets.get(sp.set)!;
  const mine = me?.id === card.ownerId;
  const info = FINISH_INFO[card.finish];
  const { data: stats } = useQuery({ queryKey: keys.print(card.speciesId, card.finish), queryFn: () => api.print(card.speciesId, card.finish) });
  const [price, setPrice] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmShred, setConfirmShred] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);

  useEffect(() => {
    if (stats && !price) setPrice(String(stats.marketValue));
  }, [stats, price]);

  const priceNum = Math.floor(Number(price) || 0);
  const fee = priceNum > 0 ? marketFee(priceNum) : 0;

  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  };

  const list = () => run(async () => {
    await api.list(card.id, priceNum);
    sfx.register();
    toast({ kind: 'success', title: 'Listed!', body: `${sp.name} is on the market for ${coins(priceNum)} coins.` });
    invalidateAfterTrade();
    onChanged?.('listed');
    onClose();
  });

  const unlist = () => run(async () => {
    if (!card.listingId) return;
    await api.cancelListing(card.listingId);
    sfx.back();
    toast({ kind: 'info', title: 'Listing cancelled', body: `${sp.name} is back in your binder.` });
    invalidateAfterTrade();
    onChanged?.('unlisted');
    onClose();
  });

  const shred = (e: MouseEvent) => run(async () => {
    if (!confirmShred) {
      setConfirmShred(true);
      sfx.error();
      return;
    }
    const res = await api.quickSell([card.id], info.printRun !== null);
    sfx.coins(4);
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const w = document.querySelector('[data-wallet]')?.getBoundingClientRect();
    if (w) fx.coins({ x: r.left + r.width / 2, y: r.top }, { x: w.left + 10, y: w.top + 10 }, 8);
    setCoins(res.coins);
    toast({ kind: 'coin', title: `+${res.earned} coins`, body: `${sp.name} went through the house shredder.` });
    invalidateAfterTrade();
    onChanged?.('shredded');
    onClose();
  });

  const makeAvatar = () => run(async () => {
    await api.updateProfile({ avatar: { speciesId: card.speciesId, finish: card.finish } });
    setMe((m) => ({ ...m, avatarSpecies: card.speciesId, avatarFinish: card.finish }));
    sfx.success();
    toast({ kind: 'success', title: 'New avatar', body: `${sp.name} is now your profile pet.` });
    void queryClient.invalidateQueries({ queryKey: ['profile'] });
  });

  const pin = (slot: number) => run(async () => {
    const profile = await api.profile(me!.username);
    const slots = profile.showcase.map((c) => c?.id ?? null);
    while (slots.length < SHOWCASE_SLOTS) slots.push(null);
    for (let i = 0; i < slots.length; i++) if (slots[i] === card.id) slots[i] = null;
    slots[slot] = card.id;
    await api.setShowcase(slots);
    sfx.stamp();
    toast({ kind: 'success', title: 'Pinned to showcase', body: `Pedestal ${slot + 1} now holds ${sp.name}.` });
    setPinOpen(false);
    void queryClient.invalidateQueries({ queryKey: ['profile'] });
  });

  return (
    <div className="detail">
      <div className="detail-card">
        <Card species={sp} finish={card.finish} mint={card.mint} width={Math.min(300, window.innerWidth - 80)} interactive />
      </div>
      <div className="detail-info">
        <div className="detail-kicker ui-label">
          {set.code} {String(sp.no).padStart(3, '0')}/{set.size} · {RARITY_INFO[sp.rarity].glyph} {RARITY_INFO[sp.rarity].label} · {sp.types.join(' / ')}
        </div>
        <h2 className="detail-name">{card.finish === 'misprint' ? sp.misprintName : sp.name}</h2>
        <div className="detail-tags">
          <FinishTag finish={card.finish} />
          <span className="detail-serial num">{info.printRun ? `№ ${serial(card.finish, card.mint)}` : `Mint #${card.mint}`}</span>
        </div>
        <p className="muted small">{info.blurb}</p>

        <div className="detail-stats">
          <div>
            <span className="ui-label">Market value</span>
            <div className="detail-value">
              <Price value={stats?.marketValue ?? 0} size={22} />
              {stats && <Delta value={stats.change24h} />}
            </div>
          </div>
          <div>
            <span className="ui-label">House buyback</span>
            <Price value={stats?.quickSellValue ?? 0} size={18} />
          </div>
          <div>
            <span className="ui-label">In circulation</span>
            <span className="num big">{stats ? stats.circulating.toLocaleString() : '—'}</span>
            {stats?.printRun && <span className="muted small"> / {stats.printRun} ever</span>}
          </div>
          <div>
            <span className="ui-label">Shredded</span>
            <span className="num big">{stats?.burned.toLocaleString() ?? '—'}</span>
          </div>
        </div>

        {stats && stats.history.length > 0 && <PriceChart points={stats.history} height={110} />}
        {stats?.firstDiscoverer && (
          <p className="muted small">
            ⚑ First discovered by <b className="link" onClick={() => { onClose(); navigate(`/u/${stats.firstDiscoverer!.username}`); }}>{stats.firstDiscoverer.username}</b> {ago(stats.firstDiscoverer.at)}
          </p>
        )}

        {mine ? (
          <div className="detail-actions">
            {card.listingId ? (
              <div className="detail-row">
                <span className="muted">Listed on the market.</span>
                <Button variant="ghost" size="sm" onClick={unlist} disabled={busy}>Cancel listing</Button>
              </div>
            ) : (
              <div className="detail-sell">
                <label className="field">
                  <span className="ui-label">List on market for</span>
                  <input
                    className="input num big"
                    inputMode="numeric"
                    value={price}
                    onChange={(e) => setPrice(e.target.value.replace(/[^0-9]/g, '').slice(0, String(MAX_LISTING_PRICE).length))}
                  />
                </label>
                <div className="detail-fee muted small">
                  5% fee {coins(fee)} · you receive <b className="gold">{coins(Math.max(0, priceNum - fee))}</b>
                </div>
                <Button variant="mint" onClick={list} disabled={busy || priceNum < 1} icon="tag">List</Button>
              </div>
            )}
            <div className="detail-row wrap">
              <Button variant="ghost" size="sm" icon="face" onClick={makeAvatar} disabled={busy}>Make avatar</Button>
              <Button variant="ghost" size="sm" icon="pin" onClick={() => setPinOpen((v) => !v)} disabled={busy}>Showcase</Button>
              {!card.listingId && (
                <Button variant={confirmShred ? 'danger' : 'ink'} size="sm" icon="coin" onClick={shred} disabled={busy}>
                  {confirmShred ? (info.printRun ? `Shred serialized forever? +${stats?.quickSellValue ?? 0}` : `Confirm +${stats?.quickSellValue ?? 0}`) : 'Quick-sell'}
                </Button>
              )}
            </div>
            {pinOpen && (
              <div className="detail-row">
                <span className="ui-label">Pedestal</span>
                {Array.from({ length: SHOWCASE_SLOTS }, (_, i) => (
                  <Button key={i} variant="gold" size="sm" onClick={() => pin(i)} disabled={busy}>{i + 1}</Button>
                ))}
              </div>
            )}
          </div>
        ) : null}
        <div className="detail-row">
          <Button variant="ghost" size="sm" icon="market" onClick={() => { onClose(); navigate(`/market/${card.speciesId}/${card.finish}`); }}>
            Market page
          </Button>
        </div>
      </div>
    </div>
  );
}
