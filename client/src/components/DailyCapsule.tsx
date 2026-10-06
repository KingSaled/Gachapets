import { useState, type MouseEvent } from 'react';
import clsx from 'clsx';
import { DAILY_STREAK_CAP } from '@gachapets/shared';
import { api } from '../lib/api.ts';
import { keys, queryClient, setMe, useMe } from '../lib/queries.ts';
import { fx } from '../lib/fx.ts';
import { buzz, sfx } from '../lib/sfx.ts';
import { toast, toastError } from '../lib/store.ts';
import { duration } from '../lib/format.ts';
import { PixelIcon } from './PixelIcon.tsx';
import { useNow } from './layout.tsx';

/** The daily free-coins capsule in the HUD. Glows and wobbles when ready. */
export function DailyCapsule() {
  const { data: me } = useMe();
  const [busy, setBusy] = useState(false);
  const now = useNow(1000);
  if (!me) return null;
  const ready = me.dailyAvailable || now >= me.nextDailyAt;

  const claim = async (e: MouseEvent<HTMLButtonElement>) => {
    if (!ready || busy) {
      sfx.error();
      toast({ kind: 'info', title: 'Capsule recharging', body: `Next daily capsule in ${duration(me.nextDailyAt - now)}.` });
      return;
    }
    setBusy(true);
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    try {
      const res = await api.claimDaily();
      sfx.crinkle();
      sfx.coins(6);
      buzz([20, 40, 20]);
      const wallet = document.querySelector('[data-wallet]')?.getBoundingClientRect();
      fx.burst({ x: r.left + r.width / 2, y: r.top + r.height / 2, colors: ['#ff4f8b', '#f4efff', '#ffd23f'], count: 30, speed: 5 });
      if (wallet) fx.coins({ x: r.left + r.width / 2, y: r.top + r.height / 2 }, { x: wallet.left + 12, y: wallet.top + 10 }, 12);
      setMe((m) => ({ ...m, coins: res.coins, dailyAvailable: false, dailyStreak: res.streak, nextDailyAt: Date.now() + 20 * 3600 * 1000 }));
      toast({ kind: 'coin', title: `Daily capsule: +${res.amount} coins`, body: res.streak > 0 ? `Streak ×${Math.min(res.streak, DAILY_STREAK_CAP)} — come back tomorrow to keep it going.` : 'Come back tomorrow to start a streak.' });
      void queryClient.invalidateQueries({ queryKey: keys.me });
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      className={clsx('daily', ready && 'is-ready')}
      onClick={claim}
      onPointerEnter={() => sfx.hover()}
      title={ready ? 'Claim your daily capsule!' : `Next capsule in ${duration(me.nextDailyAt - now)}`}
      aria-label={ready ? 'Claim daily coins' : 'Daily capsule recharging'}
    >
      <PixelIcon name="gift" size={26} />
      {!ready && <span className="daily-timer num">{duration(me.nextDailyAt - now)}</span>}
    </button>
  );
}
