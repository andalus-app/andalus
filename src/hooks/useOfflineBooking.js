/**
 * useOfflineBooking — hanterar offline-kö för bokningar
 *
 * Användning:
 *   const { submitBooking, offlineStatus } = useOfflineBooking({ supabase, onSuccess });
 *
 *   submitBooking(bookingObject)   — skicka (direkt eller kö)
 *   offlineStatus                  — null | 'queued' | 'syncing' | 'sent'
 */

import { useState, useEffect, useRef, useCallback } from 'react';

const QUEUE_KEY = 'andalus_booking_queue';

// ── Helpers ─────────────────────────────────────────────────────────────────

function loadQueue() {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); }
  catch { return []; }
}

function saveQueue(q) {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); }
  catch {}
}

function isOnline() {
  return navigator.onLine;
}

// ── Hook ────────────────────────────────────────────────────────────────────

export function useOfflineBooking({ supabase, onSuccess, onError }) {
  const [offlineStatus, setOfflineStatus] = useState(null);
  // null       = no pending offline booking
  // 'queued'   = saved locally, waiting for connection
  // 'syncing'  = attempting to send
  // 'sent'     = successfully synced

  const syncingRef = useRef(false);

  // ── Sync queued bookings ────────────────────────────────────────────────
  const syncQueue = useCallback(async () => {
    if (syncingRef.current || !isOnline()) return;
    const queue = loadQueue();
    if (queue.length === 0) return;

    syncingRef.current = true;
    setOfflineStatus('syncing');

    const remaining = [];

    for (const item of queue) {
      try {
        const { error } = await supabase.from('bookings').insert([item.booking]);
        if (error) {
          // Keep in queue for retry
          remaining.push(item);
        } else {
          // Handle skip_dates exceptions if any
          if (item.skipDates && item.skipDates.length > 0) {
            const excs = item.skipDates.map(date => ({
              id: crypto.randomUUID?.() || Math.random().toString(36).slice(2),
              booking_id: item.booking.id,
              exception_date: date,
              type: 'skip',
              created_at: Date.now(),
            }));
            await supabase.from('booking_exceptions').insert(excs);
          }
          onSuccess?.(item.booking, item.skipDates || []);
        }
      } catch {
        remaining.push(item);
      }
    }

    saveQueue(remaining);
    syncingRef.current = false;

    if (remaining.length === 0) {
      setOfflineStatus('sent');
      // Auto-dismiss after 2.5s
      setTimeout(() => setOfflineStatus(null), 2500);
    } else {
      setOfflineStatus('queued');
    }
  }, [supabase, onSuccess]);

  // ── Listen for connection restore ───────────────────────────────────────
  useEffect(() => {
    const onOnline = () => syncQueue();
    window.addEventListener('online', onOnline);

    // Also check on mount in case we came back online while app was closed
    if (isOnline() && loadQueue().length > 0) {
      syncQueue();
    }

    return () => window.removeEventListener('online', onOnline);
  }, [syncQueue]);

  // ── Submit ──────────────────────────────────────────────────────────────
  const submitBooking = useCallback(async (booking, skipDates = []) => {
    if (isOnline()) {
      // Try direct submit
      try {
        const { error } = await supabase.from('bookings').insert([booking]);
        if (error) throw error;

        if (skipDates.length > 0) {
          const excs = skipDates.map(date => ({
            id: crypto.randomUUID?.() || Math.random().toString(36).slice(2),
            booking_id: booking.id,
            exception_date: date,
            type: 'skip',
            created_at: Date.now(),
          }));
          await supabase.from('booking_exceptions').insert(excs);
        }

        onSuccess?.(booking, skipDates);
        return { queued: false };
      } catch (err) {
        // If insert failed (not a network error), surface the error
        if (isOnline()) {
          onError?.(err);
          return { queued: false, error: err };
        }
        // Fell offline mid-request — queue it
      }
    }

    // ── Offline path: save to local queue ──
    const queue = loadQueue();
    // Avoid duplicate (same booking id)
    if (!queue.find(item => item.booking.id === booking.id)) {
      queue.push({ booking, skipDates, queuedAt: Date.now() });
      saveQueue(queue);
    }
    setOfflineStatus('queued');
    return { queued: true };
  }, [supabase, onSuccess, onError]);

  return { submitBooking, offlineStatus };
}
