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

  const smoothedRef = useRef(0);
  const wasAligned  = useRef(false);
  const qiblaDirRef = useRef(null);

  // ── Fetch Qibla direction once per location ──
  useEffect(() => {
    if (!location) return;
    let cancelled = false;
    setLoading(true); setError(null);
    fetchQiblaDirection(location.latitude, location.longitude)
      .then(dir => {
        if (!cancelled) { setQiblaDir(dir); qiblaDirRef.current = dir; }
      })
      .catch(() => {
        if (!cancelled) {
          const fallback = calcQiblaFallback(location.latitude, location.longitude);
          setQiblaDir(fallback);
          qiblaDirRef.current = fallback;
          setError('offline');
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [location]);

  // ── Attach orientation listeners — runs every mount, cleans up on unmount ──
  // This is the key fix: useEffect with NO deps so it runs fresh every time
  // QiblaScreen mounts (i.e. every tab switch to Qibla).
  useEffect(() => {
    if (!('DeviceOrientationEvent' in window)) return;

    const handleOrientation = (e) => {
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

    // iOS — needs explicit permission
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      if (localStorage.getItem(PERM_KEY) === 'granted') {
        window.addEventListener('deviceorientationabsolute', handleOrientation, true);
        window.addEventListener('deviceorientation',         handleOrientation, true);
        setCompassAvail(true);
      }
      // else: wait for permission button — requestPermission will call attachListener
    } else {
      // Android / desktop
      window.addEventListener('deviceorientationabsolute', handleOrientation, true);
      window.addEventListener('deviceorientation',         handleOrientation, true);
      setCompassAvail(true);
    }

    return () => {
      window.removeEventListener('deviceorientationabsolute', handleOrientation, true);
      window.removeEventListener('deviceorientation',         handleOrientation, true);
      setCompassAvail(false);
    };
  }); // ← intentionally NO dependency array = runs on every mount/unmount

  // ── Permission request (iOS only) ──
  const requestPermission = useCallback(async () => {
    try {
      const result = await DeviceOrientationEvent.requestPermission();
      localStorage.setItem(PERM_KEY, result);
      setPermState(result);
      if (result === 'granted') {
        // Force re-mount of the effect by toggling a flag would be complex —
        // easiest: just reload the page once permission is granted
        window.location.reload();
      }
    } catch {
      localStorage.setItem(PERM_KEY, 'denied');
      setPermState('denied');
    }
  }, []);

  const needsPermission = typeof DeviceOrientationEvent?.requestPermission === 'function'
    && permState !== 'granted';

  return {
    qiblaDir, heading, alignDelta, isAligned,
    compassAvail, loading, error, needsPermission, requestPermission, permState,
  };
}
