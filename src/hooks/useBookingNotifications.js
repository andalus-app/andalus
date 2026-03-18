/**
 * useBookingNotifications.js
 *
 * Batterioptimerad strategi:
 *
 * REALTIME (Supabase WebSocket) — primär källa:
 *   • En enda persistent WebSocket-kanal för hela sessionen
 *   • Varje DB-händelse debouncias i 600ms (dvs. 260 bulk-inserts → 1 anrop)
 *   • Ingen polling medan Realtime är uppkopplad
 *
 * POLLING — fallback om Realtime tappar anslutning:
 *   • Förgrundsläge: var 5:e minut (ej 30s)
 *   • Bakgrundsläge (Page Visibility API): pausas helt
 *   • Återupptas direkt när appen kommer till förgrunden
 *
 * ADMIN NOTIS:
 *   • Pending/edit_pending → nya bokningar att godkänna (orange)
 *   • Cancelled av besökare (approved-bokning) → avbokningar att känna till (orange)
 *   • Badge försvinner direkt när admin godkänner/avböjer (via Realtime)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../services/supabaseClient';

const STORAGE_DEVICE        = 'islamnu_device_id';

// Ensure device_id exists — create it here if BookingScreen hasn't run yet
function getOrCreateDeviceId() {
  let id = localStorage.getItem(STORAGE_DEVICE);
  if (!id) {
    id = Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
    localStorage.setItem(STORAGE_DEVICE, id);
  }
  return id;
}
const STORAGE_ADMIN         = 'islamnu_admin_mode';
const STORAGE_VISITOR_SEEN  = 'islamnu_bookings_visitor_seen';
const STORAGE_ADMIN_SEEN    = 'islamnu_bookings_admin_seen';
const STORAGE_HAS_BOOKING   = 'islamnu_has_booking';
const STORAGE_ADMIN_DEVICE  = 'islamnu_is_admin_device';
const POLL_FOREGROUND_MS    = 5 * 60 * 1000;
const DEBOUNCE_MS           = 600;

export function useBookingNotifications() {
  const [visitorUnread,     setVisitorUnread]     = useState(0);
  const [adminUnread,       setAdminUnread]       = useState(0);
  const [adminPendingCount, setAdminPendingCount] = useState(0);
  const [bellNotifs,        setBellNotifs]        = useState([]);
  const [active,            setActive]            = useState(false);
  // Track admin state as React state so badge re-renders immediately on login/logout
  const [isAdminState,      setIsAdminState]      = useState(() => localStorage.getItem(STORAGE_ADMIN) === 'true');

  const deviceId     = useRef(getOrCreateDeviceId()).current;
  const isAdminRef   = useRef(localStorage.getItem(STORAGE_ADMIN) === 'true');
  const debounceRef  = useRef(null);
  const pollRef      = useRef(null);
  const hiddenRef    = useRef(false);
  const channelRef   = useRef(null);

  // Keep ref in sync
  isAdminRef.current = isAdminState;

  // ── Kärna: ett enda optimerat DB-anrop per roll ──────────────────────────
  const calculate = useCallback(async () => {
    const isAdmin = isAdminRef.current;

    try {
      // 1. Besökar-notiser — använd user_id om inloggad, annars device_id
      const userId = localStorage.getItem('islamnu_user_id');
      if (userId || deviceId) {
        const seenAt = parseInt(localStorage.getItem(STORAGE_VISITOR_SEEN) || '0', 10);
        let query = supabase
          .from('bookings')
          .select('id, status, resolved_at, date, time_slot, admin_comment')
          .in('status', ['approved', 'rejected', 'cancelled', 'edited'])
          .gt('resolved_at', seenAt > 0 ? seenAt : -1);
        // Prioritera user_id om inloggad
        if (userId) query = query.eq('user_id', userId);
        else query = query.eq('device_id', deviceId);

        const { data } = await query;
        if (data) {
          setVisitorUnread(data.length);
          setBellNotifs(data.map(b => ({
            id: b.id, type: 'booking', status: b.status,
            date: b.date, time_slot: b.time_slot, admin_comment: b.admin_comment,
          })));
        }
      }

      // 2. Admin inloggad — ett kombinerat anrop
      if (isAdmin) {
        const adminSeenAt = parseInt(localStorage.getItem(STORAGE_ADMIN_SEEN) || '0', 10);
        const { data } = await supabase
          .from('bookings')
          .select('id, status, created_at, resolved_at, admin_comment')
          .or(
            `status.in.(pending,edit_pending),` +
            `and(status.eq.cancelled,resolved_at.gt.${adminSeenAt},admin_comment.ilike.%Avbok%)`
          );
        if (data) {
          setAdminUnread(data.length);
          // Also update pending count even when logged in, so badge is always fresh
          setAdminPendingCount(data.filter(b => ['pending','edit_pending'].includes(b.status)).length);
        }
        return;
      }

      // 3. Admin-device ej inloggad — kolla pending count
      const cachedIsAdminDevice = localStorage.getItem(STORAGE_ADMIN_DEVICE);
      if (cachedIsAdminDevice === 'true') {
        const { count } = await supabase
          .from('bookings')
          .select('id', { count: 'exact', head: true })
          .in('status', ['pending', 'edit_pending']);
        setAdminPendingCount(count ?? 0);
      } else if (cachedIsAdminDevice !== 'false') {
        const { data: adminDevice } = await supabase
          .from('admin_devices')
          .select('device_id, dismissed_at')
          .eq('device_id', deviceId)
          .maybeSingle();
        if (adminDevice && !adminDevice.dismissed_at) {
          localStorage.setItem(STORAGE_ADMIN_DEVICE, 'true');
          const { count } = await supabase
            .from('bookings')
            .select('id', { count: 'exact', head: true })
            .in('status', ['pending', 'edit_pending']);
          setAdminPendingCount(count ?? 0);
        } else {
          localStorage.setItem(STORAGE_ADMIN_DEVICE, adminDevice ? 'dismissed' : 'false');
          setAdminPendingCount(0);
        }
      }
    } catch {
      // Nätverksfel — ignorera tyst
    }
  }, [deviceId]); // eslint-disable-line

  // ── Debounced trigger ────────────────────────────────────────────────────
  const triggerDebounced = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (!hiddenRef.current) calculate();
    }, DEBOUNCE_MS);
  }, [calculate]);

  // Immediate trigger (for after admin actions like approve/reject)
  const triggerImmediate = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    calculate();
  }, [calculate]);

  // ── Page Visibility ──────────────────────────────────────────────────────
  useEffect(() => {
    const onVisibilityChange = () => {
      hiddenRef.current = document.hidden;
      if (!document.hidden) {
        calculate();
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = setInterval(calculate, POLL_FOREGROUND_MS);
      } else {
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [calculate]);

  // ── Eager calculate at mount ─────────────────────────────────────────────
  // Run immediately for any entity that might have notifications.
  // For visitors: checks if their bookings have been resolved since last seen.
  // For admin devices: checks pending count.
  // This avoids waiting for the async active-state chain to resolve.
  useEffect(() => {
    if (!deviceId) return;
    const cachedIsAdminDevice = localStorage.getItem(STORAGE_ADMIN_DEVICE);
    const cachedHasBooking = localStorage.getItem(STORAGE_HAS_BOOKING);
    const isAdmin = isAdminRef.current;
    // Run if we know this device has something to check
    if (isAdmin || cachedIsAdminDevice === 'true' || cachedHasBooking === 'true') {
      calculate();
    }
    // Also always try for visitor if deviceId exists (handles new sessions)
    else if (deviceId) {
      // Light check: just run calculate, it handles the empty-data case gracefully
      calculate();
    }
  }, []); // eslint-disable-line

  // ── Aktiveringslogik ─────────────────────────────────────────────────────
  // Always activate Realtime if deviceId exists so visitors get live updates
  // when their bookings are approved. calculate() is smart — returns early
  // if there's nothing relevant for this device.
  useEffect(() => {
    if (!deviceId) return;
    setActive(true); // always subscribe to Realtime for any device with a deviceId

    // Cache admin-device status for faster pending-count queries
    const cachedIsAdminDevice = localStorage.getItem(STORAGE_ADMIN_DEVICE);
    if (cachedIsAdminDevice === null) {
      // Unknown — check once and cache
      supabase
        .from('admin_devices')
        .select('device_id, dismissed_at')
        .eq('device_id', deviceId)
        .maybeSingle()
        .then(({ data: adminDevice }) => {
          const isAdminDev = !!(adminDevice && !adminDevice.dismissed_at);
          localStorage.setItem(STORAGE_ADMIN_DEVICE, isAdminDev ? 'true' : (adminDevice ? 'dismissed' : 'false'));
        }).catch(() => {});
    }
  }, [deviceId]); // eslint-disable-line

  // ── Realtime + fallback-polling ───────────────────────────────────────────
  useEffect(() => {
    if (!active) return;

    calculate();

    if (!document.hidden) {
      pollRef.current = setInterval(calculate, POLL_FOREGROUND_MS);
    }

    const channel = supabase
      .channel('booking-notif-v4')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, triggerDebounced)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'admin_devices' }, triggerDebounced)
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [active, calculate, triggerDebounced]);

  // ── Re-calculate when admin state changes (login/logout) ──────────────
  useEffect(() => {
    if (isAdminState) {
      setActive(true);
      // Small delay to ensure isAdminRef is updated before calculate reads it
      setTimeout(() => calculate(), 0);
    } else {
      calculate();
    }
  }, [isAdminState]); // eslint-disable-line

  // ── Publika hjälpfunktioner ───────────────────────────────────────────────
  const activateForDevice = useCallback(() => {
    localStorage.setItem(STORAGE_HAS_BOOKING, 'true');
    setActive(true);
  }, []);

  const registerAdminDevice = useCallback(async () => {
    if (!deviceId) return;
    const { error } = await supabase
      .from('admin_devices')
      .upsert({ device_id: deviceId, created_at: Date.now(), dismissed_at: null },
               { onConflict: 'device_id' });
    if (error) console.error('[AdminDevice] upsert error:', error);
    localStorage.setItem(STORAGE_ADMIN_DEVICE, 'true');
    localStorage.setItem(STORAGE_ADMIN, 'true');
    isAdminRef.current = true;
    setIsAdminState(true); // triggers re-render + calculate
    setActive(true);
  }, [deviceId]); // eslint-disable-line

  const dismissAdminDevice = useCallback(async () => {
    if (!deviceId) return;
    const { error } = await supabase
      .from('admin_devices')
      .update({ dismissed_at: Date.now() })
      .eq('device_id', deviceId);
    if (error) console.error('[AdminDevice] dismiss error:', error);
    localStorage.setItem(STORAGE_ADMIN_DEVICE, 'dismissed');
    localStorage.setItem(STORAGE_ADMIN, 'false');
    isAdminRef.current = false;
    setIsAdminState(false);
    setAdminPendingCount(0);
    setAdminUnread(0);
  }, [deviceId]);

  const markVisitorSeen = useCallback(() => {
    // Mark all current notifs as seen — clears badge AND panel
    localStorage.setItem(STORAGE_VISITOR_SEEN, Date.now().toString());
    setVisitorUnread(0);
    setBellNotifs([]);
  }, []);

  // Mark only the badge as read (notifs stay in panel until explicitly cleared)
  const markVisitorBadgeSeen = useCallback(() => {
    setVisitorUnread(0);
    // Don't update STORAGE_VISITOR_SEEN or clear bellNotifs
    // Panel will still show the notifs until user clears or clicks them
  }, []);

  const markAdminSeen = useCallback(() => {
    // Only mark admin "seen" timestamp — does NOT clear pending count.
    // adminPendingCount is cleared only when pending bookings are resolved in DB (via Realtime).
    localStorage.setItem(STORAGE_ADMIN_SEEN, Date.now().toString());
    setAdminUnread(0);
    // Do NOT clear adminPendingCount here — it reflects real pending bookings
  }, []);

  const totalUnread =
    (deviceId ? visitorUnread : 0) +
    (isAdminState ? adminUnread : adminPendingCount);

  // adminPendingNotif: object used by NewHomeScreen bell panel
  const adminPendingNotif = adminPendingCount > 0 ? { count: adminPendingCount } : null;

  return {
    visitorUnread,
    adminUnread,
    adminPendingCount,
    adminPendingNotif,
    totalUnread,
    bellNotifs,
    isAdminState,
    activateForDevice,
    registerAdminDevice,
    dismissAdminDevice,
    markVisitorSeen,
    markVisitorBadgeSeen,
    markAdminSeen,
    refresh: calculate, // expose for immediate post-action refresh
  };
}
