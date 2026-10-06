import { lazy, Suspense, useEffect } from 'react';
import { Route, Router, Switch, useLocation } from 'wouter';
import { useHashLocation } from 'wouter/use-hash-location';
import { AnimatePresence, motion } from 'motion/react';
import { cosmeticById } from '@gachapets/shared';
import { useCatalogQuery, useMe } from './lib/queries.ts';
import { api, DEMO } from './lib/api.ts';
import { connectSocket, setSpeciesNamer } from './lib/socket.ts';
import { useLive } from './lib/store.ts';
import { Backdrop, Dock, FxLayer, Hud, Toasts } from './components/layout.tsx';
import { Spinner } from './components/ui.tsx';
import { AuthScreen } from './pages/Auth.tsx';
import { ShopPage } from './pages/Shop.tsx';
import { OpeningPage } from './pages/Opening.tsx';

// Secondary screens load on demand; the shop → rip loop stays in the main bundle.
const BinderPage = lazy(() => import('./pages/Binder.tsx').then((m) => ({ default: m.BinderPage })));
const MarketPage = lazy(() => import('./pages/Market.tsx').then((m) => ({ default: m.MarketPage })));
const PrintPage = lazy(() => import('./pages/PrintPage.tsx').then((m) => ({ default: m.PrintPage })));
const ProfilePage = lazy(() => import('./pages/Profile.tsx').then((m) => ({ default: m.ProfilePage })));
const HallPage = lazy(() => import('./pages/Hall.tsx').then((m) => ({ default: m.HallPage })));
const FinishesPage = lazy(() => import('./pages/Finishes.tsx').then((m) => ({ default: m.FinishesPage })));

function Boot({ label }: { label: string }) {
  return (
    <div className="boot">
      <Spinner label={label} />
    </div>
  );
}

/** Applies the player's chosen theme accents app-wide. */
function useThemeAccent(themeId: string | undefined) {
  useEffect(() => {
    const def = themeId ? cosmeticById(themeId) : undefined;
    const root = document.documentElement.style;
    if (def?.colors && themeId !== 'theme_arcade') {
      root.setProperty('--accent', def.colors.accent);
      root.setProperty('--accent-2', def.colors.accent2);
    } else {
      root.removeProperty('--accent');
      root.removeProperty('--accent-2');
    }
  }, [themeId]);
}

/** The demo artifact routes with #/paths (it can't own the page URL). */
export function App() {
  return DEMO ? (
    <Router hook={useHashLocation}>
      <Game />
    </Router>
  ) : (
    <Game />
  );
}

function Game() {
  const catalog = useCatalogQuery();
  const me = useMe();
  const [location] = useLocation();
  useThemeAccent(me.data?.theme);

  useEffect(() => {
    connectSocket();
    void api.feed(40).then((events) => useLive.getState().addFeed(events)).catch(() => {});
  }, []);

  useEffect(() => {
    if (catalog.data) setSpeciesNamer((id) => catalog.data.species.get(id)?.name ?? id);
  }, [catalog.data]);

  if (catalog.isError) return <Boot label="Cartridge error — refresh to retry" />;
  if (!catalog.data || me.isLoading) return <Boot label="Booting cartridge" />;

  if (!me.data) {
    return (
      <>
        <Backdrop />
        <AuthScreen />
        <FxLayer />
        <Toasts />
      </>
    );
  }

  const immersive = location.startsWith('/open');

  return (
    <>
      <Backdrop />
      {!immersive && <Hud />}
      <AnimatePresence mode="wait">
        <motion.main
          key={location.split('/')[1] || 'home'}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.18 }}
        >
          <Suspense fallback={<div className="page"><Spinner label="Loading" /></div>}>
          <Switch>
            <Route path="/" component={ShopPage} />
            <Route path="/open" component={OpeningPage} />
            <Route path="/binder" component={BinderPage} />
            <Route path="/binder/:setId" component={BinderPage} />
            <Route path="/market" component={MarketPage} />
            <Route path="/market/:speciesId/:finish" component={PrintPage} />
            <Route path="/u/:username" component={ProfilePage} />
            <Route path="/hall" component={HallPage} />
            <Route path="/finishes" component={FinishesPage} />
            <Route>
              <div className="page">
                <h1>Lost in the arcade</h1>
              </div>
            </Route>
          </Switch>
          </Suspense>
        </motion.main>
      </AnimatePresence>
      {!immersive && <Dock />}
      <FxLayer />
      <Toasts />
    </>
  );
}
