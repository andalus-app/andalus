/**
 * useScrollHide — returnerar { visible, onScroll, show }
 *
 * Beteende:
 *   • Scroll ned  > threshold px → dölj header
 *   • Scroll upp  > UP_HYSTERESIS px konsekvent → visa header
 *   • Scroll < threshold från toppen → alltid visa
 *   • iOS rubber-band bounce ignoreras (scrollTop < 0 eller > max)
 *   • Kräver konsekvent rörelse (hysteresis) för att byta tillstånd
 *     → förhindrar att botten-studsar triggar "scroll upp"
 */
import { useState, useRef, useCallback } from 'react';

export function useScrollHide({ threshold = 40 } = {}) {
  const [visible, setVisible] = useState(true);

  const lastY       = useRef(0);
  const lastDir     = useRef('up');
  const ticking     = useRef(false);
  const accumulated = useRef(0); // konsekvent rörelse i samma riktning

  const UP_HYSTERESIS   = 10;  // px uppåt innan header visas
  const DOWN_HYSTERESIS = 12;  // px nedåt innan header döljs

  const onScroll = useCallback((e) => {
    const el = e.currentTarget || e.target;
    if (!el || ticking.current) return;
    ticking.current = true;

    requestAnimationFrame(() => {
      const y    = el.scrollTop;
      const maxY = el.scrollHeight - el.clientHeight;
      const delta = y - lastY.current;

      // ── iOS rubber-band guard ──────────────────────────────────────
      // Ignorera events när scrollTop är utanför sitt giltiga intervall.
      // Vid botten-bounce går scrollTop tillfälligt förbi maxY och studsar
      // tillbaka, vilket genererar ett falskt "scroll upp"-event.
      const isBouncing = y < 0 || (maxY > 0 && y > maxY + 1);
      if (isBouncing) {
        ticking.current = false;
        return;
      }

      // ── Alltid visa nära toppen ────────────────────────────────────
      if (y < threshold) {
        accumulated.current = 0;
        lastDir.current = 'up';
        lastY.current = y;
        setVisible(true);
        ticking.current = false;
        return;
      }

      if (Math.abs(delta) > 1) {
        const dir = delta > 0 ? 'down' : 'up';

        if (dir !== lastDir.current) {
          // Riktningsbyte — nollställ ackumulerad rörelse
          accumulated.current = 0;
          lastDir.current = dir;
        }

        accumulated.current += Math.abs(delta);

        if (dir === 'down' && accumulated.current >= DOWN_HYSTERESIS) {
          setVisible(false);
        } else if (dir === 'up' && accumulated.current >= UP_HYSTERESIS) {
          setVisible(true);
        }

        lastY.current = y;
      }

      ticking.current = false;
    });
  }, [threshold]); // eslint-disable-line

  const show = useCallback(() => {
    setVisible(true);
    lastY.current       = 0;
    lastDir.current     = 'up';
    accumulated.current = 0;
  }, []);

  return { visible, onScroll, show };
}
