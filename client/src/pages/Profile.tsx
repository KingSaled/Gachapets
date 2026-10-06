import { useMemo, useState, type CSSProperties } from 'react';
import { useLocation, useParams } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import type { CardDTO, CosmeticDef } from '@gachapets/shared';
import { COSMETICS, FINISH_INFO, allBadges, cosmeticById } from '@gachapets/shared';
import { api } from '../lib/api.ts';
import { keys, queryClient, setCoins, setMe, useCatalog, useCollection, useMe } from '../lib/queries.ts';
import { resetSocket } from '../lib/socket.ts';
import { toast, toastError } from '../lib/store.ts';
import { sfx } from '../lib/sfx.ts';
import { coins, dateShort } from '../lib/format.ts';
import { useViewportWidth } from '../lib/useViewport.ts';
import { Card } from '../components/card/Card.tsx';
import { CardDetailSheet } from '../components/CardDetail.tsx';
import { Avatar, Button, Empty, Medal, Meter, Panel, Price, Sheet, Spinner, Tabs } from '../components/ui.tsx';
import { PixelIcon } from '../components/PixelIcon.tsx';
import './profile.css';

export function ProfilePage() {
  const { username } = useParams<{ username: string }>();
  const { data: me } = useMe();
  const { data, isLoading, error } = useQuery({ queryKey: keys.profile(username), queryFn: () => api.profile(username) });
  const catalog = useCatalog();
  const [, navigate] = useLocation();
  const vw = useViewportWidth();
  const [editing, setEditing] = useState(false);
  const [picking, setPicking] = useState<number | null>(null);
  const [detail, setDetail] = useState<CardDTO | null>(null);
  const badgeDefs = useMemo(() => allBadges(catalog.raw.sets), [catalog]);

  if (isLoading) return <div className="page"><Spinner label="Loading collector" /></div>;
  if (error || !data) return <div className="page"><Empty icon="face" title="No collector by that name" /></div>;

  const own = me?.id === data.user.id;
  const theme = cosmeticById(data.user.theme)?.colors;
  const themeVars = theme
    ? ({ '--accent': theme.accent, '--accent-2': theme.accent2, '--p-bg': theme.bg, '--p-panel': theme.panel, '--p-ink': theme.ink } as CSSProperties)
    : undefined;
  const earned = new Map(data.badges.map((b) => [b.id, b.earnedAt]));
  const liveSetIds = new Set(data.setProgress.map((s) => s.setId));
  const wall = badgeDefs.filter((b) => earned.has(b.id) || (!b.id.startsWith('set_') && !b.id.startsWith('type_')) || [...liveSetIds].some((id) => b.id.startsWith(`set_${id}_`)));
  const rarest = data.rarestPull;
  const rarestSp = rarest ? catalog.species.get(rarest.speciesId) : undefined;
  const pedestalW = vw < 700 ? Math.floor((vw - 60) / 2) : 190;

  const logout = async () => {
    await api.logout();
    sfx.back();
    queryClient.setQueryData(keys.me, null);
    queryClient.clear();
    resetSocket();
    navigate('/');
  };

  return (
    <div className="page profile" style={themeVars}>
      <section className="profile-banner" data-banner={data.user.banner}>
        <BannerArt kind={data.user.banner} />
        <div className="profile-id">
          <Avatar speciesId={data.user.avatarSpecies} finish={data.user.avatarFinish} size={vw < 600 ? 76 : 104} className="profile-avatar" />
          <div className="profile-names">
            {data.user.title && <span className="title-tag">{data.user.title}</span>}
            <h1>{data.user.username}</h1>
            <span className="ui-label">Collector since {dateShort(data.user.createdAt)}</span>
            {data.user.bio && <p className="bio">{data.user.bio}</p>}
          </div>
          {own && (
            <div className="profile-actions">
              <Button variant="gold" size="sm" icon="edit" onClick={() => setEditing(true)}>Customize</Button>
              <Button variant="ghost" size="sm" icon="logout" onClick={logout}>Log out</Button>
            </div>
          )}
        </div>
      </section>

      <div className="profile-stats">
        <Tile label="Net worth" big><Price value={data.stats.netWorth} size={26} /></Tile>
        <Tile label="Portfolio"><Price value={data.stats.portfolioValue} size={20} /></Tile>
        <Tile label="Packs opened"><span className="num">{data.stats.packsOpened.toLocaleString()}</span></Tile>
        <Tile label="Species"><span className="num">{data.stats.speciesOwned.toLocaleString()}</span></Tile>
        <Tile label="Lines complete"><span className="num">{data.stats.linesCompleted}</span></Tile>
        <Tile label="First discoveries"><span className="num">{data.stats.discoveries}</span></Tile>
        <Tile label="Market sales"><span className="num">{data.stats.salesCount}</span></Tile>
      </div>

      <section className="showcase">
        <div className="showcase-head">
          <h2>Showcase</h2>
          {own && <span className="muted small">Pin cards from your binder — or tap an empty pedestal.</span>}
        </div>
        <div className="pedestals">
          {data.showcase.map((card, slot) => {
            const sp = card ? catalog.species.get(card.speciesId) : undefined;
            return (
              <div key={slot} className={clsx('pedestal', slot === 2 && 'pedestal--center', card && `has-${card.finish}`)}>
                <div className="spotlight" />
                {card && sp ? (
                  <div className="pedestal-card" onClick={() => { sfx.click(); setDetail(card); }}>
                    <Card species={sp} finish={card.finish} mint={card.mint} width={slot === 2 && vw >= 700 ? pedestalW + 30 : pedestalW} interactive />
                  </div>
                ) : (
                  <button
                    type="button"
                    className="pedestal-empty"
                    style={{ width: slot === 2 && vw >= 700 ? pedestalW + 30 : pedestalW, height: (slot === 2 && vw >= 700 ? pedestalW + 30 : pedestalW) / 0.716 }}
                    onClick={() => own && (sfx.click(), setPicking(slot))}
                    disabled={!own}
                  >
                    <PixelIcon name={own ? 'pin' : 'lock'} size={28} />
                    <span className="ui-label">{own ? 'Pin a card' : 'Empty'}</span>
                  </button>
                )}
                <div className="pedestal-base" />
              </div>
            );
          })}
        </div>
      </section>

      <div className="profile-cols">
        <Panel title="Rarest pull">
          {rarest && rarestSp ? (
            <div className="rarest">
              <Card species={rarestSp} finish={rarest.finish} mint={rarest.mint} width={170} interactive />
              <div>
                <h3>{rarest.finish === 'misprint' ? rarestSp.misprintName : rarestSp.name}</h3>
                <span className="finish-tag" data-f={rarest.finish}>{FINISH_INFO[rarest.finish].label}</span>
                <p className="muted small">The best card {data.user.username} has ever ripped from a pack.</p>
              </div>
            </div>
          ) : (
            <p className="muted">No packs opened yet.</p>
          )}
        </Panel>
        <Panel title="Set progress">
          <div className="set-progress">
            {data.setProgress.map((p) => {
              const set = catalog.sets.get(p.setId)!;
              return (
                <div key={p.setId} className="sp-row">
                  <span className="sp-name">{set.name}</span>
                  <Meter value={p.owned} max={p.total} label={<><span>{p.owned}/{p.total}</span><span>{Math.round((p.owned / p.total) * 100)}%</span></>} />
                </div>
              );
            })}
          </div>
        </Panel>
      </div>

      <Panel title={`Badges · ${data.badges.length}`} className="badge-wall-panel">
        <div className="badge-wall">
          {wall.map((b) => (
            <div key={b.id} className={clsx('wall-item', !earned.has(b.id) && 'is-locked')}>
              <Medal def={b} earned={earned.has(b.id)} size={52} />
              <span className="wall-name">{earned.has(b.id) || !b.secret ? b.name : '???'}</span>
            </div>
          ))}
        </div>
      </Panel>

      {own && <CustomizeSheet open={editing} onClose={() => setEditing(false)} current={{ title: data.user.title, bio: data.user.bio, theme: data.user.theme, banner: data.user.banner }} />}
      {own && <ShowcasePicker slot={picking} current={data.showcase} onClose={() => setPicking(null)} />}
      <CardDetailSheet card={detail} onClose={() => setDetail(null)} />
    </div>
  );
}

function Tile({ label, children, big }: { label: string; children: React.ReactNode; big?: boolean }) {
  return (
    <div className={clsx('tile', big && 'tile--big')}>
      <span className="ui-label">{label}</span>
      <div className="tile-value">{children}</div>
    </div>
  );
}

/** Animated profile banner backgrounds — all CSS, keyed by cosmetic id. */
export function BannerArt({ kind }: { kind: string }) {
  const n = kind === 'banner_bubbles' ? 10 : kind === 'banner_embers' ? 16 : 0;
  return (
    <div className={clsx('banner-art', kind.replace('banner_', 'ba--'))} aria-hidden>
      {kind === 'banner_grid' && (
        <>
          <div className="ba-sun" />
          <div className="ba-grid" />
        </>
      )}
      {kind === 'banner_aurora' && (
        <>
          <i className="ba-ribbon" />
          <i className="ba-ribbon" />
          <i className="ba-ribbon" />
        </>
      )}
      {Array.from({ length: n }, (_, i) => (
        <i key={i} className="ba-p" style={{ left: `${(i * 37) % 100}%`, animationDelay: `${-(i * 0.73) % 6}s`, animationDuration: `${5 + (i % 4)}s` }} />
      ))}
    </div>
  );
}

// ── Customization ───────────────────────────────────────────────────────
function CustomizeSheet({ open, onClose, current }: { open: boolean; onClose: () => void; current: { title: string | null; bio: string; theme: string; banner: string } }) {
  const [tab, setTab] = useState<'look' | 'title' | 'bio'>('look');
  const { data: me } = useMe();
  const { data: titles } = useQuery({ queryKey: keys.titles, queryFn: api.titles, enabled: open });
  const { data: cosmetics } = useQuery({ queryKey: keys.cosmetics, queryFn: api.cosmetics, enabled: open });
  const [bio, setBio] = useState(current.bio);
  const [busy, setBusy] = useState(false);

  const save = async (patch: Record<string, unknown>, msg: string) => {
    setBusy(true);
    try {
      await api.updateProfile(patch);
      sfx.success();
      toast({ kind: 'success', title: msg });
      void queryClient.invalidateQueries({ queryKey: ['profile'] });
      void queryClient.invalidateQueries({ queryKey: keys.me });
      if (patch.theme) setMe((m) => ({ ...m, theme: patch.theme as string }));
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  };

  const buy = async (c: CosmeticDef) => {
    setBusy(true);
    try {
      const res = await api.buyCosmetic(c.id);
      sfx.register();
      setCoins(res.coins);
      toast({ kind: 'coin', title: `Unlocked ${c.name}`, body: `-${coins(c.price)} coins` });
      void queryClient.invalidateQueries({ queryKey: keys.cosmetics });
      await save({ [c.kind]: c.id }, `${c.name} equipped`);
    } catch (err) {
      toastError(err);
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} wide label="Customize profile">
      <h2 className="sheet-title">Customize</h2>
      <Tabs tabs={[{ id: 'look', label: 'Theme & banner' }, { id: 'title', label: 'Title' }, { id: 'bio', label: 'Bio' }]} value={tab} onChange={setTab} />
      <div className="customize">
        {tab === 'look' && (
          <>
            {(['theme', 'banner'] as const).map((kind) => (
              <div key={kind}>
                <h3 className="cz-head">{kind === 'theme' ? 'Themes' : 'Animated banners'}</h3>
                <div className="cosmetic-grid">
                  {(cosmetics ?? COSMETICS.map((c) => ({ ...c, owned: false }))).filter((c) => c.kind === kind).map((c) => {
                    const equipped = (kind === 'theme' ? current.theme : current.banner) === c.id;
                    return (
                      <div key={c.id} className={clsx('cosmetic', equipped && 'is-equipped')}>
                        {kind === 'theme' ? (
                          <div className="swatch" style={{ background: c.colors?.bg }}>
                            <i style={{ background: c.colors?.panel }} />
                            <i style={{ background: c.colors?.accent }} />
                            <i style={{ background: c.colors?.accent2 }} />
                          </div>
                        ) : (
                          <div className="banner-preview"><BannerArt kind={c.id} /></div>
                        )}
                        <b>{c.name}</b>
                        <span className="muted small">{c.desc}</span>
                        {equipped ? (
                          <span className="ui-label equipped">Equipped</span>
                        ) : c.owned ? (
                          <Button size="sm" variant="mint" disabled={busy} onClick={() => save({ [kind]: c.id }, `${c.name} equipped`)}>Equip</Button>
                        ) : c.unlockBadge ? (
                          <span className="ui-label"><PixelIcon name="lock" size={14} /> Earned</span>
                        ) : (
                          <Button size="sm" variant="gold" disabled={busy || (me?.coins ?? 0) < c.price} onClick={() => buy(c)} silent>
                            Buy · {coins(c.price)}
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </>
        )}
        {tab === 'title' && (
          <div className="title-list">
            <button type="button" className={clsx('title-opt', !current.title && 'is-on')} onClick={() => save({ title: null }, 'Title cleared')}>No title</button>
            {(titles ?? []).map((t) => (
              <button key={t} type="button" className={clsx('title-opt', current.title === t && 'is-on')} onClick={() => save({ title: t }, `Title: ${t}`)} disabled={busy}>
                {t}
              </button>
            ))}
            <p className="muted small">Earn more titles from badges: open packs, finish evolution lines, complete sets, discover species.</p>
          </div>
        )}
        {tab === 'bio' && (
          <div className="bio-edit">
            <textarea className="input" rows={3} maxLength={160} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Chasing the Living Foil Cindermoth since day one." />
            <div className="detail-row">
              <span className="muted small">{bio.length}/160</span>
              <Button variant="mint" size="sm" disabled={busy} onClick={() => save({ bio }, 'Bio saved')}>Save</Button>
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
}

function ShowcasePicker({ slot, current, onClose }: { slot: number | null; current: (CardDTO | null)[]; onClose: () => void }) {
  const catalog = useCatalog();
  const { data: col } = useCollection(slot !== null);
  const [busy, setBusy] = useState(false);
  const pinned = new Set(current.filter(Boolean).map((c) => c!.id));
  const values = col?.values ?? {};
  const cards = [...(col?.cards ?? [])]
    .filter((c) => !pinned.has(c.id))
    .sort((a, b) => (values[`${b.speciesId}|${b.finish}`] ?? 0) - (values[`${a.speciesId}|${a.finish}`] ?? 0))
    .slice(0, 60);

  const pick = async (cardId: number) => {
    if (slot === null) return;
    setBusy(true);
    try {
      const slots = current.map((c) => c?.id ?? null);
      slots[slot] = cardId;
      await api.setShowcase(slots);
      sfx.stamp();
      void queryClient.invalidateQueries({ queryKey: ['profile'] });
      onClose();
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={slot !== null} onClose={onClose} wide label="Pick a showcase card">
      <h2 className="sheet-title">Pedestal {slot !== null ? slot + 1 : ''}</h2>
      <p className="muted small">Your most valuable cards first.</p>
      {!cards.length ? (
        <Empty title="Nothing to pin yet" />
      ) : (
        <div className="picker-grid">
          {cards.map((c) => {
            const sp = catalog.species.get(c.speciesId)!;
            return (
              <button key={c.id} type="button" className="copy" disabled={busy} onClick={() => pick(c.id)} onPointerEnter={() => sfx.hover()}>
                <Card species={sp} finish={c.finish} mint={c.mint} width={130} live={false} />
              </button>
            );
          })}
        </div>
      )}
    </Sheet>
  );
}
