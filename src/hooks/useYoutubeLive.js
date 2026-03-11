import { useState, useEffect, useRef, useCallback } from 'react';

const API_KEY    = 'AIzaSyDVv92GTerpsazWZc8qO5i0y23dwJoOj6Q';
const CHANNEL_ID = 'UCQhN1h0T-02TYWf-mD3-2hQ';
const POLL_MS    = 60_000; // 60 seconds

async function fetchLiveOrUpcoming() {
  // Search for live AND upcoming broadcasts on the channel
  const base = 'https://www.googleapis.com/youtube/v3/search';
  const params = new URLSearchParams({
    part: 'snippet',
    channelId: CHANNEL_ID,
    eventType: 'live',
    type: 'video',
    maxResults: 1,
    key: API_KEY,
  });
  const liveRes  = await fetch(`${base}?${params}`);
  const liveJson = await liveRes.json();

  if (liveJson.items?.length > 0) {
    const item = liveJson.items[0];
    return {
      status: 'live',
      videoId: item.id.videoId,
      title: item.snippet.title,
      thumbnail:
        item.snippet.thumbnails?.maxres?.url ||
        item.snippet.thumbnails?.high?.url   ||
        item.snippet.thumbnails?.medium?.url,
      publishedAt: item.snippet.publishedAt,
    };
  }

  // Check upcoming
  const upParams = new URLSearchParams({
    part: 'snippet',
    channelId: CHANNEL_ID,
    eventType: 'upcoming',
    type: 'video',
    maxResults: 1,
    order: 'date',
    key: API_KEY,
  });
  const upRes  = await fetch(`${base}?${upParams}`);
  const upJson = await upRes.json();

  if (upJson.items?.length > 0) {
    const item = upJson.items[0];
    // Fetch scheduledStartTime via videos endpoint
    const vParams = new URLSearchParams({
      part: 'liveStreamingDetails,snippet',
      id: item.id.videoId,
      key: API_KEY,
    });
    const vRes  = await fetch(`https://www.googleapis.com/youtube/v3/videos?${vParams}`);
    const vJson = await vRes.json();
    const scheduledStart = vJson.items?.[0]?.liveStreamingDetails?.scheduledStartTime || null;

    return {
      status: 'upcoming',
      videoId: item.id.videoId,
      title: item.snippet.title,
      thumbnail:
        item.snippet.thumbnails?.maxres?.url ||
        item.snippet.thumbnails?.high?.url   ||
        item.snippet.thumbnails?.medium?.url,
      scheduledStart,
    };
  }

  return null;
}

export function useYoutubeLive() {
  const [stream, setStream]   = useState(null);   // null | { status, videoId, title, thumbnail, scheduledStart? }
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef(null);

  const poll = useCallback(async () => {
    try {
      setLoading(true);
      const result = await fetchLiveOrUpcoming();
      setStream(result);
    } catch (e) {
      console.warn('YouTube poll error', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // First poll after 5 second delay
    const initial = setTimeout(() => {
      poll();
      // Then every 60s
      intervalRef.current = setInterval(poll, POLL_MS);
    }, 5_000);
    return () => {
      clearTimeout(initial);
      clearInterval(intervalRef.current);
    };
  }, [poll]);

  return { stream, loading, isLive: stream?.status === 'live' };
}
