import { useEffect, useRef } from 'react';

/**
 * Pointer-driven tilt. Writes CSS custom properties straight onto the element
 * (no React re-renders) and eases toward the target every frame:
 *   --px / --py  pointer position 0..1      --rx / --ry  rotation in degrees
 *   --hover      0..1 hover intensity        --dist       distance from center 0..1
 */
export function useTilt<T extends HTMLElement>(enabled: boolean, strength = 16) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    const target = { x: 0.5, y: 0.5, h: 0 };
    const cur = { x: 0.5, y: 0.5, h: 0 };
    let raf = 0;

    const apply = () => {
      const dx = cur.x - 0.5;
      const dy = cur.y - 0.5;
      el.style.setProperty('--px', cur.x.toFixed(4));
      el.style.setProperty('--py', cur.y.toFixed(4));
      el.style.setProperty('--rx', (dx * strength * 2).toFixed(3));
      el.style.setProperty('--ry', (-dy * strength * 2).toFixed(3));
      el.style.setProperty('--hover', cur.h.toFixed(3));
      el.style.setProperty('--dist', Math.min(1, Math.hypot(dx, dy) * 2).toFixed(3));
    };

    const loop = () => {
      cur.x += (target.x - cur.x) * 0.16;
      cur.y += (target.y - cur.y) * 0.16;
      cur.h += (target.h - cur.h) * 0.12;
      apply();
      const settled = Math.abs(target.x - cur.x) < 0.001 && Math.abs(target.y - cur.y) < 0.001 && Math.abs(target.h - cur.h) < 0.002;
      raf = settled ? 0 : requestAnimationFrame(loop);
    };
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(loop);
    };

    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      target.x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      target.y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
      target.h = 1;
      kick();
    };
    const onLeave = () => {
      target.x = 0.5;
      target.y = 0.5;
      target.h = 0;
      kick();
    };

    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerleave', onLeave);
    el.addEventListener('pointercancel', onLeave);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
      el.removeEventListener('pointercancel', onLeave);
    };
  }, [enabled, strength]);

  return ref;
}
