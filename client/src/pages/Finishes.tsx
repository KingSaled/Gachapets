import { useState } from 'react';
import { FINISHES, FINISH_INFO } from '@gachapets/shared';
import { useCatalog } from '../lib/queries.ts';
import { sfx } from '../lib/sfx.ts';
import { Card } from '../components/card/Card.tsx';
import { Button } from '../components/ui.tsx';
import './finishes.css';

/** Every finish tier side by side on one creature — the "what am I chasing" page. */
export function FinishesPage() {
  const catalog = useCatalog();
  const pool = catalog.raw.species.filter((s) => s.rarity === 'star' || s.rarity === 'rare');
  const [idx, setIdx] = useState(() => Math.floor(Math.random() * pool.length));
  const sp = pool[idx % pool.length];

  return (
    <div className="page finishes">
      <div className="page-title">
        <div>
          <span className="kicker">Finish gallery</span>
          <h1>Seven ways to pull {sp.name}</h1>
        </div>
        <p className="sub">Every card rolls a finish when it's pulled. The top three are serialized — once a species' run is gone, it's gone forever. Hover to tilt.</p>
        <Button variant="ghost" size="sm" icon="sparkle" onClick={() => { sfx.flip(); setIdx(Math.floor(Math.random() * pool.length)); }}>
          Another creature
        </Button>
      </div>
      <div className="finish-grid">
        {FINISHES.map((f, i) => (
          <figure key={f} className="finish-cell">
            <Card species={sp} finish={f} mint={FINISH_INFO[f].printRun ? Math.min(FINISH_INFO[f].printRun!, 1 + i) : 1200 - i * 150} width={230} interactive />
            <figcaption>
              <span className="finish-tag" data-f={f}>{FINISH_INFO[f].label}</span>
              <span className="muted small">{FINISH_INFO[f].blurb}</span>
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
