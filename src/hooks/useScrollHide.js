/**
 * useScrollHide — returnerar { visible, onScroll }
 *
 * visible: boolean — true = header synlig, false = dold (translateY(-110%))
 * ref:     sätt på scroll-containern med ref={ref}
 *
 * Beteende:
 *   • Scroll ned  > threshold px → dölj (visible = false)
 *   • Scroll upp  (minsta rörelse) → visa (visible = true)
 *   • Scroll < threshold från toppen → alltid visa
 *
 * Används: <Header style={{ transform: visible ? 'translateY(0)' : 'translateY(-110%)', transition: ... }} />
 */
import { useState, useRef, useCallback } from 'react';

export function useScrollHide({ threshold = 40 } = {}) {
  const [visible, setVisible] = useState(true);
  const lastY   = useRef(0);
  const lastDir = useRef('up');
  const ticking = useRef(false);

  const onScroll = useCallback((e) => {
    const el = e.currentTarget || e.target;
    if (!el || ticking.current) return;
    ticking.current = true;
    requestAnimationFrame(() => {
      const y = el.scrollTop;
      const delta = y - lastY.current;
      if (Math.abs(delta) > 3) {
        const dir = delta > 0 ? 'down' : 'up';
        if (dir !== lastDir.current) {
          lastDir.current = dir;
          setVisible(dir === 'up' || y < threshold);
        } else if (dir === 'down' && y > threshold) {
          setVisible(false);
        }
        lastY.current = y;
      }
      ticking.current = false;
    });
  }, [threshold]);

  // Expose a reset so tab-changes can force visible=true
  const show = useCallback(() => {
    setVisible(true);
    lastY.current   = 0;
    lastDir.current = 'up';
  }, []);

  return { visible, onScroll, show };
}
