/**
 * useKeyboardTabBar — hides the tab bar when the soft keyboard opens,
 * restores it when the keyboard closes.
 *
 * Uses visualViewport API (supported in all modern mobile browsers/PWA).
 * Falls back gracefully on desktop.
 *
 * Usage in App.js:
 *   useKeyboardTabBar({ onHide: onTabBarHide, onShow: onTabBarShow });
 */
import { useEffect, useRef } from 'react';

export function useKeyboardTabBar({ onHide, onShow }) {
  const initialHeight = useRef(
    typeof window !== 'undefined'
      ? (window.visualViewport?.height ?? window.innerHeight)
      : 0
  );
  const isHidden = useRef(false);
  const timerRef = useRef(null);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return; // desktop fallback — no-op

    // Capture initial height after first paint (avoids PWA chrome height issues)
    const captureInitial = () => {
      initialHeight.current = vv.height;
    };
    setTimeout(captureInitial, 500);

    const onResize = () => {
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        // Keyboard is open when viewport shrinks by more than 120px
        const shrunk = initialHeight.current - vv.height > 120;
        if (shrunk && !isHidden.current) {
          isHidden.current = true;
          onHide?.();
        } else if (!shrunk && isHidden.current) {
          isHidden.current = false;
          onShow?.();
        }
      }, 50);
    };

    vv.addEventListener('resize', onResize);
    return () => {
      vv.removeEventListener('resize', onResize);
      clearTimeout(timerRef.current);
      // Ensure tab bar is restored when hook unmounts
      if (isHidden.current) {
        isHidden.current = false;
        onShow?.();
      }
    };
  }, [onHide, onShow]);
}
