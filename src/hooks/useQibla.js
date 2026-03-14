import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchQiblaDirection } from '../services/prayerApi';

const ALIGN_TOL = 5;

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

// Compute circular variance of last N headings (0 = perfect, 1 = chaotic)
function circularVariance(samples) {
  if (samples.length < 3) return 1;
  const toR = d => d * Math.PI / 180;
  const sinMean = samples.reduce((s, h) => s + Math.sin(toR(h)), 0) / samples.length;
  const cosMean = samples.reduce((s, h) => s + Math.cos(toR(h)), 0) / samples.length;
  return 1 - Math.sqrt(sinMean ** 2 + cosMean ** 2); // 0=stable, 1=random
}

const isIOS = typeof DeviceOrientationEvent !== 'undefined' &&
              typeof DeviceOrientationEvent.requestPermission === 'function';

export function useQibla(location) {
  const [qiblaDir,     setQiblaDir]     = useState(null);
  const [heading,      setHeading]      = useState(0);
  const [alignDelta,   setAlignDelta]   = useState(0);
  const [isAligned,    setIsAligned]    = useState(false);
  const [compassAvail, setCompassAvail] = useState(false);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState(null);
  const [needsCalibration, setNeedsCalibration] = useState(false);
  const [calibrationProgress, setCalibrationProgress] = useState(0);

  // iOS always needs a fresh permission tap each session — no caching
  const [needsPermission, setNeedsPermission] = useState(isIOS);

  const smoothedRef    = useRef(0);
  const wasAligned     = useRef(false);
  const qiblaDirRef    = useRef(null);
  const handlerRef     = useRef(null);
  const attachedRef    = useRef(false);
  const headingSamples = useRef([]); // rolling window for variance check
  const calibDismissed = useRef(false); // user skipped calibration

  // Single stable handler created once
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

      // ── Calibration detection ──────────────────────────────
      if (!calibDismissed.current) {
        // iOS: use webkitCompassAccuracy (degrees of error, lower = better)
        const iosAccuracy = e.webkitCompassAccuracy;
        const iosBad = iosAccuracy != null && iosAccuracy > 20;

        // Android / generic: measure circular variance of last 12 readings
        const samples = headingSamples.current;
        samples.push(h);
        if (samples.length > 12) samples.shift();
        const variance = circularVariance(samples);
        const androidBad = samples.length >= 8 && variance > 0.35;

        const isBad = iosBad || androidBad;

        if (isBad) {
          setNeedsCalibration(true);
          // Progress: iOS maps accuracy 50→0 to 0→100%, Android maps variance 0.35→0.05
          if (iosAccuracy != null) {
            const p = Math.min(100, Math.max(0, Math.round((50 - iosAccuracy) / 50 * 100)));
            setCalibrationProgress(p);
          } else {
            const p = Math.min(100, Math.max(0, Math.round((0.35 - variance) / 0.30 * 100)));
            setCalibrationProgress(p);
          }
        } else if (samples.length >= 8) {
          // Good accuracy — auto-dismiss calibration overlay
          setNeedsCalibration(false);
          setCalibrationProgress(100);
        }
      }
      // ──────────────────────────────────────────────────────

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

  const attach = useCallback(() => {
    if (attachedRef.current) return;
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

  const dismissCalibration = useCallback(() => {
    calibDismissed.current = true;
    setNeedsCalibration(false);
  }, []);

  // Fetch Qibla direction — skip if coords unchanged
  const latRef = useRef(null);
  const lngRef = useRef(null);
  useEffect(() => {
    if (!location) return;
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

  // On mount: Android/desktop attach immediately, iOS waits for button press
  useEffect(() => {
    if (!('DeviceOrientationEvent' in window)) return;
    if (!isIOS) attach();
    return () => detach();
  }, [attach, detach]);

  // iOS permission — called from button tap (user gesture required)
  const requestPermission = useCallback(async () => {
    try {
      const result = await DeviceOrientationEvent.requestPermission();
      if (result === 'granted') {
        setNeedsPermission(false);
        attach();
      }
    } catch {
      // Permission denied or error — keep showing button
    }
  }, [attach]);

  return {
    qiblaDir, heading, alignDelta, isAligned,
    compassAvail, loading, error, needsPermission, requestPermission,
    needsCalibration, calibrationProgress, dismissCalibration,
  };
}
