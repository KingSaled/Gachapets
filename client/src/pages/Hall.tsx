import { useState } from 'react';
import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import type { FeedEvent } from '@gachapets/shared';
import { spriteUrl } from '@gachapets/shared';
import { api } from '../lib/api.ts';
import { keys, useCatalog, useMe } from '../lib/queries.ts';
import { useLive } from '../lib/store.ts';
import { describe } from '../lib/feedText.ts';
import { ago, coins } from '../lib/format.ts';
import { Avatar, Empty, Panel, Price, Spinner, Tabs } from '../components/ui.tsx';
import './hall.css';

type Board = 'networth' | 'packs' | 'species' | 'discoveries';
const BOARDS: { id: Board; label: string; unit: string }[] = [
  { id: 'networth', label: 'Net worth', unit: 'coins' },
  { id: 'species', label: 'Collection', unit: 'species' },
  { id: 'packs', label: 'Packs ripped', unit: 'packs' },
  { id: 'discoveries', label: 'Discoverers', unit: 'firsts' },
];

export function HallPage() {
  const [board, setBoard] = useState<Board>('networth');
  return (
    <div className="page hall">
      <div className="page-title">
        <div>
          <span className="kicker">Hall of fame</span>
          <h1>The Hall</h1>
        </div>
        <p className="sub">Who's winning, what's being pulled, and every Factory Misprint ever found.</p>
      </div>
      <div className="hall-cols">
        <Panel title="Leaderboards" className="boards">
          <Tabs tabs={BOARDS.map((b) => ({ id: b.id, label: b.label }))} value={board} onChange={setBoard} />
          <Leaderboard kind={board} />
        </Panel>
        <div className="hall-side">
          <MisprintRegistry />
          <LiveFeed />
        </div>
      </div>
    </div>
  );
}

function Leaderboard({ kind }: { kind: Board }) {
  const { data: me } = useMe();
  const { data, isLoading } = useQuery({ queryKey: keys.leaderboard(kind), queryFn: () => api.leaderboard(kind), refetchInterval: 60_000 });
  const unit = BOARDS.find((b) => b.id === kind)!.unit;
  if (isLoading) return <Spinner />;
  if (!data?.length) return <Empty icon="trophy" title="No ranks yet" />;
  return (
    <ol className="lb">
      {data.map((r) => (
        <li key={r.user.id} className={clsx('lb-row', r.rank <= 3 && `lb-row--${r.rank}`, me?.id === r.user.id && 'is-me')}>
          <span className="lb-rank num">{r.rank}</span>
          <Avatar speciesId={r.user.avatarSpecies} finish={r.user.avatarFinish} size={38} />
          <Link href={`/u/${r.user.username}`} className="lb-name">
            <b>{r.user.username}</b>
            {r.user.title && <span className="ui-label">{r.user.title}</span>}
          </Link>
          <span className="lb-value">
            {kind === 'networth' ? <Price value={r.value} size={18} /> : <span className="num">{r.value.toLocaleString()} <small className="muted">{unit}</small></span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

function MisprintRegistry() {
  const catalog = useCatalog();
  const feed = useLive((s) => s.feed);
  const { data } = useQuery({ queryKey: [...keys.feed, 100], queryFn: () => api.feed(100), refetchInterval: 60_000 });
  const all = new Map<number, FeedEvent>();
  for (const e of [...(data ?? []), ...feed]) if (e.type === 'pull' && e.finish === 'misprint') all.set(e.id, e);
  const list = [...all.values()].sort((a, b) => b.id - a.id);
  return (
    <Panel title={<><span className="err-glyph">⚠</span> Misprint registry</>} className="registry">
      {!list.length ? (
        <p className="muted small">No Factory Misprint has been pulled yet. Each species has exactly one. Odds: about 1 in 1,060 packs.</p>
      ) : (
        <div className="registry-list">
          {list.map((e) => {
            const sp = catalog.species.get(e.speciesId ?? '');
            if (!sp) return null;
            return (
              <Link key={e.id} href={`/market/${sp.id}/misprint`} className="registry-item">
                <img className="px" src={spriteUrl(sp, 'back')} alt="" width={48} height={48} />
                <div>
                  <b>{sp.misprintName}</b>
                  <span className="muted small">found by {e.username} · {ago(e.at)}</span>
                </div>
                <span className="num one-of-one">1/1</span>
              </Link>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

function LiveFeed() {
  const catalog = useCatalog();
  const feed = useLive((s) => s.feed);
  const connected = useLive((s) => s.connected);
  return (
    <Panel title={<>Live feed <span className={clsx('live-dot', connected && 'is-on')} /></>} className="feed-panel">
      {!feed.length ? (
        <p className="muted small">Big pulls, rare discoveries and notable sales show up here the moment they happen.</p>
      ) : (
        <ul className="feed">
          {feed.slice(0, 30).map((e) => {
            const line = describe(e, catalog);
            const sp = e.speciesId ? catalog.species.get(e.speciesId) : undefined;
            return (
              <li key={e.id} className="feed-item" data-f={line.finish}>
                {sp ? (
                  <img className="px" src={spriteUrl(sp, e.finish === 'misprint' ? 'back' : e.finish === 'shiny' ? 'frontShiny' : 'front')} alt="" width={40} height={40} />
                ) : (
                  <span className="feed-badge">★</span>
                )}
                <div className="feed-text">
                  <span><Link href={`/u/${e.username}`}>{line.who}</Link> {line.verb} <em>{line.what}</em></span>
                  <span className="muted small">{line.extra ? `${line.extra} · ` : ''}{ago(e.at)}</span>
                </div>
                {e.price ? <span className="num feed-price">{coins(e.price)}◎</span> : null}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
