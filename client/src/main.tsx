import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import '@fontsource/pixelify-sans/400.css';
import '@fontsource/pixelify-sans/500.css';
import '@fontsource/pixelify-sans/700.css';
import '@fontsource/silkscreen/400.css';
import '@fontsource/vt323/400.css';
import './styles/tokens.css';
import './styles/base.css';
import { queryClient } from './lib/queries.ts';
import { sfx } from './lib/sfx.ts';
import { App } from './App.tsx';

/** A tile of scattered pixel glints used by every foil finish. */
function installSparkleTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  for (let i = 0; i < 70; i++) {
    const a = Math.random();
    ctx.fillStyle = `rgba(255,255,255,${(0.25 + a * 0.75).toFixed(2)})`;
    const x = Math.floor(Math.random() * 64);
    const y = Math.floor(Math.random() * 64);
    ctx.fillRect(x, y, 1, 1);
    if (a > 0.85) {
      ctx.fillRect(x - 1, y, 3, 1);
      ctx.fillRect(x, y - 1, 1, 3);
    }
  }
  document.documentElement.style.setProperty('--sparkle-tex', `url(${c.toDataURL()})`);
}
installSparkleTexture();

// Browsers only allow audio after a gesture: unlock on the first one.
const unlock = () => sfx.unlock();
window.addEventListener('pointerdown', unlock, { passive: true });
window.addEventListener('keydown', unlock);

document.body.classList.add('crt');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
