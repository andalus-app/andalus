import { useState, useEffect, useRef, useCallback } from 'react';

const API_KEY = process.env.REACT_APP_YOUTUBE_API_KEY;
const CHANNEL_ID = 'UCQhN1h0T-02TYWf-mD3-2hQ';
const CACHE_KEY  = 'yt_stream_cache';

/**
 * Adaptiv poll-strategi — minimerar API-anrop och batteriförbrukning:
 *
 *  LIVE just nu      →  poll var 60s  (bekräfta att sändningen pågår)
 *  Sändning < 30 min →  poll var 3 min (snart live)
 *  Sändning < 6 h    →  poll var 15 min
 *  Sändning > 6 h    →  poll var 60 min (det händer inte snart)
 *  Ingen sändning    →  poll var 3 h  (kollar om något schemaläggs)
 *
 *  Bakgrunden        →  polling pausad helt
 *  Förgrunden igen   →  om ≥ ett poll-intervall har gått sedan senaste → poll direkt
 *
 *  YouTube Data API v3 — search kostar 100 units/anrop, daglig kvot 10 000 units.
 *  Med denna strategi: ~5-20 anrop/dag per enhet istället för 8 000+.
 */

function getPollInterval(stream) {
  if (!stream) return 3 * 60 * 60 * 1000;            // ingen känd sändning → 3 h
  if (stream.status === 'live') return 60 * 1000;      // live → 60s
  if (stream.status === 'upcoming' && stream.scheduledStart) {
    const msUntil = new Date(stream.scheduledStart) - Date.now();
    if (msUntil < 0)            return 60 * 1000;      // borde vara live nu → 60s
    if (msUntil < 30 * 60_000)  return 3 * 60_000;    // < 30 min → 3 min
    if (msUntil < 6 * 3600_000) return 15 * 60_000;   // < 6 h → 15 min
    return 60 * 60_000;                                 // > 6 h → 60 min
  }
  return 3 * 60 * 60 * 1000;                           // fallback → 3 h
}

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return { data: null, ts: 0 };
    return JSON.parse(raw);
  } catch { return { data: null, ts: 0 }; }
}

function writeCache(data) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ data, ts: Date.now() }));
  } catch {}
}

async function fetchLiveOrUpcoming() {
  const base = 'https://www.googleapis.com/youtube/v3/search';

  // 1 API-anrop: kolla live
  const liveJson = await fetch(`${base}?${new URLSearchParams({
    part: 'snippet', channelId: CHANNEL_ID, eventType: 'live',
    type: 'video', maxResults: 1, key: API_KEY,
  })}`).then(r => r.json());

  if (liveJson.items?.length > 0) {
    const item = liveJson.items[0];
    return {
      status: 'live',
      videoId: item.id.videoId,
      title: item.snippet.title,
      thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.medium?.url,
      publishedAt: item.snippet.publishedAt,
    };
  }

  // 1 API-anrop: kolla upcoming
  const upJson = await fetch(`${base}?${new URLSearchParams({
    part: 'snippet', channelId: CHANNEL_ID, eventType: 'upcoming',
    type: 'video', maxResults: 1, order: 'date', key: API_KEY,
  })}`).then(r => r.json());

  if (upJson.items?.length > 0) {
    const item = upJson.items[0];
    // 1 extra anrop bara för upcoming (för scheduledStartTime)
    const vJson = await fetch(`https://www.googleapis.com/youtube/v3/videos?${new URLSearchParams({
      part: 'liveStreamingDetails', id: item.id.videoId, key: API_KEY,
    })}`).then(r => r.json());
    const scheduledStart = vJson.items?.[0]?.liveStreamingDetails?.scheduledStartTime || null;
    return {
      status: 'upcoming',
      videoId: item.id.videoId,
      title: item.snippet.title,
      thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.medium?.url,
      scheduledStart,
    };
  }

  return null;
}

export function useYoutubeLive() {
  const cached = readCache();
  const [stream, setStream] = useState(cached.data);   // instant från cache
  const [loading, setLoading] = useState(false);
  const timerRef    = useRef(null);
  const lastPollRef = useRef(cached.ts || 0);
  const streamRef   = useRef(cached.data);

  // Keep streamRef in sync
  streamRef.current = stream;

  const poll = useCallback(async () => {
    try {
      setLoading(true);
      const result = await fetchLiveOrUpcoming();
      setStream(result);
      streamRef.current = result;
      writeCache(result);
      lastPollRef.current = Date.now();
    } catch (e) {
      console.warn('YouTube poll error', e);
    } finally {
      setLoading(false);
    }
  }, []);

  const scheduleNext = useCallback(() => {
    clearTimeout(timerRef.current);
    const interval = getPollInterval(streamRef.current);
    timerRef.current = setTimeout(() => {
      if (!document.hidden) {
        poll().then(scheduleNext);
      }
      // If hidden, scheduleNext will be called on visibilitychange instead
    }, interval);
  }, [poll]);

  useEffect(() => {
    const cacheAge = Date.now() - lastPollRef.current;
    const initialInterval = getPollInterval(stream);

    // Only do an immediate fetch if cache is older than the adaptive interval
    if (cacheAge >= initialInterval) {
      poll().then(scheduleNext);
    } else {
      // Cache is fresh — schedule next poll at remaining interval
      clearTimeout(timerRef.current);
      const remaining = initialInterval - cacheAge;
      timerRef.current = setTimeout(() => {
        if (!document.hidden) poll().then(scheduleNext);
      }, remaining);
    }

    // Pause polling in background, resume in foreground
    const onVisibility = () => {
      if (!document.hidden) {
        // Back in foreground — poll if overdue
        const age = Date.now() - lastPollRef.current;
        const interval = getPollInterval(streamRef.current);
        if (age >= interval) {
          poll().then(scheduleNext);
        }
      } else {
        // Going to background — pause the timer
        clearTimeout(timerRef.current);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      clearTimeout(timerRef.current);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []); // eslint-disable-line

  return {
    stream,
    loading,
    isLive:     stream?.status === 'live',
    isUpcoming: stream?.status === 'upcoming',
  };
}
