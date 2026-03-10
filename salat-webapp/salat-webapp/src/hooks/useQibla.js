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

export function useQibla(location) {
  const [qiblaDir,     setQiblaDir]     = useState(null);
  const [heading,      setHeading]      = useState(0);
  const [needleAngle,  setNeedleAngle]  = useState(0);
  const [alignDelta,   setAlignDelta]   = useState(0);
  const [isAligned,    setIsAligned]    = useState(false);
  const [compassAvail, setCompassAvail] = useState(false);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState(null);

  const smoothedRef  = useRef(0);
  const prevNeedle   = useRef(0);
  const wasAligned   = useRef(false);
  const qiblaDirRef  = useRef(null);

  // Fetch Qibla from AlAdhan
  const fetchDir = useCallback(async (lat, lng) => {
    setLoading(true);
    setError(null);
    try {
      const dir = await fetchQiblaDirection(lat, lng);
      setQiblaDir(dir);
      qiblaDirRef.current = dir;
    } catch (e) {
      setError(e.message);
      const fallback = calcQiblaFallback(lat, lng);
      setQiblaDir(fallback);
      qiblaDirRef.current = fallback;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (location) fetchDir(location.latitude, location.longitude);
  }, [location, fetchDir]);

  // DeviceOrientationEvent for compass heading (web)
  useEffect(() => {
    const handleOrientation = (e) => {
      let h = 0;
      if (e.webkitCompassHeading != null) {
        // iOS Safari: webkitCompassHeading is already 0=North
        h = e.webkitCompassHeading;
      } else if (e.alpha != null) {
        // Android/Chrome: alpha is degrees from North, clockwise from user's perspective
        h = (360 - e.alpha) % 360;
      } else return;

      smoothedRef.current = circularSmooth(smoothedRef.current, h, 0.15);
      const smoothed = Math.round(smoothedRef.current * 10) / 10;
      setHeading(smoothed);

      if (qiblaDirRef.current !== null) {
        const target = (qiblaDirRef.current - smoothed + 360) % 360;
        let diff = target - prevNeedle.current;
        if (diff > 180)  diff -= 360;
        if (diff < -180) diff += 360;
        prevNeedle.current = prevNeedle.current + diff;
        setNeedleAngle(prevNeedle.current);

        const delta = angleDelta(smoothed, qiblaDirRef.current);
        setAlignDelta(delta);
        const aligned = delta <= ALIGN_TOL;
        setIsAligned(aligned);
        if (aligned && !wasAligned.current && navigator.vibrate) {
          navigator.vibrate([60, 30, 60]);
        }
        wasAligned.current = aligned;
      }
    };

    const requestPermission = async () => {
      // iOS 13+ requires permission
      if (typeof DeviceOrientationEvent?.requestPermission === 'function') {
        try {
          const perm = await DeviceOrientationEvent.requestPermission();
          if (perm === 'granted') {
            window.addEventListener('deviceorientationabsolute', handleOrientation, true);
            window.addEventListener('deviceorientation', handleOrientation, true);
            setCompassAvail(true);
          }
        } catch { setCompassAvail(false); }
      } else if ('DeviceOrientationEvent' in window) {
        window.addEventListener('deviceorientationabsolute', handleOrientation, true);
        window.addEventListener('deviceorientation', handleOrientation, true);
        setCompassAvail(true);
      } else {
        setCompassAvail(false);
      }
    };

    requestPermission();

    return () => {
      window.removeEventListener('deviceorientationabsolute', handleOrientation, true);
      window.removeEventListener('deviceorientation', handleOrientation, true);
    };
  }, []);

  // When no compass — animate needle for demo
  useEffect(() => {
    if (compassAvail || !qiblaDirRef.current) return;
    const target = (qiblaDirRef.current + 360) % 360;
    let diff = target - prevNeedle.current;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;
    prevNeedle.current = prevNeedle.current + diff;
    setNeedleAngle(prevNeedle.current);
  }, [qiblaDir, compassAvail]);

  return { qiblaDir, heading, needleAngle, alignDelta, isAligned, compassAvail, loading, error };
}
