import { useMemo, useState, type FormEvent } from 'react';
import { motion } from 'motion/react';
import type { Finish } from '@gachapets/shared';
import { seededRng } from '@gachapets/shared';
import { api } from '../lib/api.ts';
import { keys, queryClient, useCatalog } from '../lib/queries.ts';
import { resetSocket } from '../lib/socket.ts';
import { sfx } from '../lib/sfx.ts';
import { toastError } from '../lib/store.ts';
import { Card } from '../components/card/Card.tsx';
import { Button, Tabs } from '../components/ui.tsx';
import './auth.css';

const TITLE = 'GACHAPETS';

export function AuthScreen() {
  const catalog = useCatalog();
  const [mode, setMode] = useState<'register' | 'login'>('register');
  const [started, setStarted] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  // A daily-rotating trio of showpiece cards for the title screen.
  const showcase = useMemo(() => {
    const rng = seededRng(`title:${new Date().toDateString()}`);
    const stars = catalog.raw.species.filter((s) => s.rarity === 'star');
    const finishes: Finish[] = ['holo', 'living', 'pop3d'];
    return finishes.map((finish) => ({ species: stars[Math.floor(rng() * stars.length)], finish }));
  }, [catalog]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const me = mode === 'register' ? await api.register(username.trim(), password) : await api.login(username.trim(), password);
      sfx.success();
      queryClient.setQueryData(keys.me, me);
      resetSocket();
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  };

  const start = () => {
    sfx.unlock();
    sfx.fanfare(1);
    setStarted(true);
  };

  return (
    <div className="auth">
      <div className="auth-fan" aria-hidden>
        {showcase.map((c, i) => (
          <motion.div
            key={i}
            className="auth-fan-card"
            initial={{ y: 120, opacity: 0, rotate: 0 }}
            animate={{ y: 0, opacity: 1, rotate: (i - 1) * 12 }}
            transition={{ delay: 0.2 + i * 0.12, type: 'spring', stiffness: 160, damping: 16 }}
            style={{ zIndex: i === 1 ? 2 : 1 }}
          >
            <Card species={c.species} finish={c.finish} mint={i + 1} width={i === 1 ? 250 : 210} interactive />
          </motion.div>
        ))}
      </div>

      <div className="auth-main">
        <h1 className="title" aria-label="Gachapets">
          {TITLE.split('').map((ch, i) => (
            <span key={i} className="title-letter" style={{ animationDelay: `${i * 0.09}s` }} data-pink={i >= 5 || undefined}>
              {ch}
            </span>
          ))}
        </h1>
        <p className="tagline">Rip packs. Chase 1-of-1 misprints. Trade pixel pets on a living market.</p>

        {!started ? (
          <button type="button" className="press-start" onClick={start} onPointerEnter={() => sfx.hover()} autoFocus>
            ▶ PRESS START
          </button>
        ) : (
          <motion.form
            className="auth-panel"
            onSubmit={submit}
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 380, damping: 26 }}
          >
            <Tabs
              tabs={[{ id: 'register', label: 'New collector' }, { id: 'login', label: 'Continue' }]}
              value={mode}
              onChange={setMode}
            />
            <div className="auth-fields">
              <label className="field">
                <span className="ui-label">Collector name</span>
                <input
                  className="input"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  maxLength={16}
                  placeholder="pixel_kai"
                  autoFocus
                  required
                />
              </label>
              <label className="field">
                <span className="ui-label">Password</span>
                <input
                  className="input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                  minLength={mode === 'register' ? 8 : 1}
                  required
                />
              </label>
              <Button type="submit" variant={mode === 'register' ? 'primary' : 'mint'} size="lg" disabled={busy} silent>
                {mode === 'register' ? 'Claim 1,000 coins & start' : 'Insert coin'}
              </Button>
              {mode === 'register' && <p className="auth-note">New collectors start with 1,000 coins — enough for 10 packs. No real money, ever.</p>}
            </div>
          </motion.form>
        )}
      </div>
      <footer className="auth-foot ui-label">v0.1 · Sound on for the full experience</footer>
    </div>
  );
}
