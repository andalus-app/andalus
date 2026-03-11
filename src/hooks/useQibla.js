import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchQiblaDirection } from '../services/prayerApi';

const ALIGN_TOL = 5;
const PERM_KEY  = 'compassPermission';

function angleDelta(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

function calcQiblaFallback(lat, lng) {
  const toR = d => d * Math.PI / 180;
  const toD = r => r * 180 / Math.PI;
  const ML = 21.4225, MG = 39.8262;
  const dLng = toR(MG - lng);
  const lat1 = toR(lat), lat2 = toR(ML);
  const x = Math.sin(dLng) * Math.cos(lat2);
  const y = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toD(Math.atan2(x, y)) + 360) % 360;
}

function circularSmooth(prev, next, alpha) {
  let diff = next - prev;
  if (diff > 180)  diff -= 360;
  if (diff < -180) diff += 360;
  return (prev + alpha * diff + 360) % 360;
}

export function useQibla(location) {
  const [qiblaDir,     setQiblaDir]     = useState(null);
  const [heading,      setHeading]      = useState(0);
  const [alignDelta,   setAlignDelta]   = useState(0);
  const [isAligned,    setIsAligned]    = useState(false);
  const [compassAvail, setCompassAvail] = useState(false);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState(null);
  const [permState,    setPermState]    = useState(
    () => localStorage.getItem(PERM_KEY) || null
  );

  const smoothedRef  = useRef(0);
  const wasAligned   = useRef(false);
  const qiblaDirRef  = useRef(null);
  // Single stable handler — created once, never recreated
  const handlerRef   = useRef(null);
  const attachedRef  = useRef(false);

  // ── One stable orientation handler, stored in a ref ──────────────────────
  // Created once on first render, reads all values via refs so it never
  // needs to be recreated or re-registered.
  if (!handlerRef.current) {
    handlerRef.current = (e) => {
      let h = 0;
      if (e.webkitCompassHeading != null) {
        h = e.webkitCompassHeading;
      } else if (e.alpha != null) {
        h = (360 - e.alpha) % 360;
      } else return;

      smoothedRef.current = circularSmooth(smoothedRef.current, h, 0.15);
      const smoothed = Math.round(smoothedRef.current * 10) / 10;
      setHeading(smoothed);

      if (qiblaDirRef.current !== null) {
        const delta = angleDelta(smoothed, qiblaDirRef.current);
        setAlignDelta(delta);
        const aligned = delta <= ALIGN_TOL;
        setIsAligned(aligned);
        if (aligned && !wasAligned.current && navigator.vibrate) navigator.vibrate([60, 30, 60]);
        wasAligned.current = aligned;
      }
    };
  }

  // ── Attach/detach — always use the same handler ref ───────────────────────
  const attach = useCallback(() => {
    if (attachedRef.current) return; // guard against double-attach
    attachedRef.current = true;
    window.addEventListener('deviceorientationabsolute', handlerRef.current, true);
    window.addEventListener('deviceorientation',         handlerRef.current, true);
    setCompassAvail(true);
  }, []);

  const detach = useCallback(() => {
    if (!attachedRef.current) return;
    attachedRef.current = false;
    window.removeEventListener('deviceorientationabsolute', handlerRef.current, true);
    window.removeEventListener('deviceorientation',         handlerRef.current, true);
    setCompassAvail(false);
  }, []);

  // ── Fetch Qibla direction once per location ───────────────────────────────
  const latRef = useRef(null);
  const lngRef = useRef(null);
  useEffect(() => {
    if (!location) return;
    // Skip if coords haven't meaningfully changed (avoids re-fetch on object identity change)
    const lat = parseFloat(location.latitude.toFixed(4));
    const lng = parseFloat(location.longitude.toFixed(4));
    if (lat === latRef.current && lng === lngRef.current) return;
    latRef.current = lat;
    lngRef.current = lng;

    let cancelled = false;
    setLoading(true); setError(null);
    fetchQiblaDirection(lat, lng)
      .then(dir => {
        if (!cancelled) { setQiblaDir(dir); qiblaDirRef.current = dir; }
      })
      .catch(() => {
        if (!cancelled) {
          const fallback = calcQiblaFallback(lat, lng);
          setQiblaDir(fallback);
          qiblaDirRef.current = fallback;
          setError('offline');
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [location]);

  // ── Attach listeners on mount, detach on unmount ──────────────────────────
  useEffect(() => {
    if (!('DeviceOrientationEvent' in window)) return;

    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      // iOS: only attach if already granted
      if (localStorage.getItem(PERM_KEY) === 'granted') attach();
    } else {
      // Android / desktop
      attach();
    }

    return () => detach();
  }, [attach, detach]);

  // ── iOS permission request ─────────────────────────────────────────────────
  const requestPermission = useCallback(async () => {
    try {
      const result = await DeviceOrientationEvent.requestPermission();
      localStorage.setItem(PERM_KEY, result);
      setPermState(result);
      if (result === 'granted') attach(); // reuse same handler, no duplicate
    } catch {
      localStorage.setItem(PERM_KEY, 'denied');
      setPermState('denied');
    }
  }, [attach]);

  const needsPermission = typeof DeviceOrientationEvent?.requestPermission === 'function'
    && permState !== 'granted';

  return {
    qiblaDir, heading, alignDelta, isAligned,
    compassAvail, loading, error, needsPermission, requestPermission, permState,
  };
}
