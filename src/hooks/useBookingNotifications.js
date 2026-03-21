/**
 * useBookingNotifications.js
 * Per-notification dismiss — x-button only hides that one notif, not all.
 * Admin accounts never receive visitor notifications.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../services/supabaseClient';

const STORAGE_ADMIN           = 'islamnu_admin_mode';
const STORAGE_DEVICE          = 'islamnu_device_id';
const STORAGE_ADMIN_SEEN      = 'islamnu_bookings_admin_seen';
const STORAGE_HAS_BOOKING     = 'islamnu_has_booking';
const STORAGE_ADMIN_DEVICE    = 'islamnu_is_admin_device';
// Per-ID dismiss set — JSON array of notif IDs the user has dismissed
const STORAGE_DISMISSED_IDS   = 'islamnu_notif_dismissed_ids';
const POLL_FOREGROUND_MS      = 5 * 60 * 1000;
const DEBOUNCE_MS             = 400;

function getOrCreateDeviceId() {
  let id = localStorage.getItem(STORAGE_DEVICE);
  if (!id) {
    id = Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
    localStorage.setItem(STORAGE_DEVICE, id);
  }
  return id;
}

function getDismissedIds() {
  try {
    return new Set(JSON.parse(localStorage.getItem(STORAGE_DISMISSED_IDS) || '[]'));
  } catch { return new Set(); }
}

function saveDismissedIds(set) {
  // Keep max 500 IDs to avoid unbounded growth
  const arr = [...set].slice(-500);
  localStorage.setItem(STORAGE_DISMISSED_IDS, JSON.stringify(arr));
}

export function useBookingNotifications({ onNewCancelledNotif } = {}) {
  const [visitorUnread,       setVisitorUnread]       = useState(0);
  const [adminUnread,         setAdminUnread]         = useState(0);
  const [adminPendingCount,   setAdminPendingCount]   = useState(0);
  const [cancelledUnread,     setCancelledUnread]     = useState(0);
  const [cancelledBookingIds, setCancelledBookingIds] = useState([]);
  const [pendingBookingIds,   setPendingBookingIds]   = useState([]);
  const [bellNotifs,          setBellNotifs]          = useState([]);
  const [active,              setActive]              = useState(false);
  const [isAdminState,        setIsAdminState]        = useState(
    () => localStorage.getItem(STORAGE_ADMIN) === 'true'
  );

  const deviceId          = useRef(getOrCreateDeviceId()).current;
  const isAdminRef        = useRef(localStorage.getItem(STORAGE_ADMIN) === 'true');
  const debounceRef       = useRef(null);
  const pollRef           = useRef(null);
  const hiddenRef         = useRef(false);
  const prevBellNotifsRef = useRef([]);
  // In-memory dismissed set (synced to/from localStorage)
  const dismissedRef      = useRef(getDismissedIds());

  isAdminRef.current = isAdminState;

  const calculate = useCallback(async () => {
    const isAdmin = isAdminRef.current;
    try {
      const userId = localStorage.getItem('islamnu_user_id');
      // Admins never get visitor notifications
      if (!isAdmin && (userId || deviceId)) {
        let query = supabase
          .from('bookings')
          .select('id, status, resolved_at, start_date, time_slot, admin_comment, recurrence')
          .in('status', ['approved', 'rejected', 'edited', 'cancelled']);
        if (userId) query = query.eq('user_id', userId);
        else        query = query.eq('device_id', deviceId);
        const { data } = await query;
        if (data) {
          const userName = localStorage.getItem('islamnu_user_name') || '';
          const dismissed = dismissedRef.current;

          const filtered = data.filter(b => {
            if (!b.resolved_at) return false;
            // Skip if already individually dismissed
            if (dismissed.has(b.id)) return false;
            // Filter out self-cancellations
            if (b.admin_comment && userName) {
              const sp1 = 'Avbokad av ' + userName + ':';
              const sp2 = 'Avbokad av ' + userName + '.';
              if (b.admin_comment.startsWith(sp1) || b.admin_comment.startsWith(sp2)) return false;
            }
            if (b.status === 'cancelled' && !b.admin_comment) return false;
            return true;
          });

          // Fetch exception skips for recurring bookings
          let exceptionNotifs = [];
          const recurringIds = data
            .filter(b => b.recurrence && b.recurrence !== 'none'
              && b.status !== 'cancelled' && b.status !== 'rejected')
            .map(b => b.id);
          if (recurringIds.length > 0) {
            const { data: excData } = await supabase
              .from('booking_exceptions')
              .select('id, booking_id, exception_date, admin_comment, created_at')
              .in('booking_id', recurringIds)
              .eq('type', 'skip')
              .not('admin_comment', 'is', null);
            if (excData) {
              exceptionNotifs = excData
                .filter(e => {
                  if (!e.admin_comment) return false;
                  const excId = e.booking_id + '_exc_' + e.exception_date;
                  if (dismissed.has(excId)) return false;
                  if (userName) {
                    const sp1 = 'Avbokad av ' + userName + ':';
                    const sp2 = 'Avbokad av ' + userName + '.';
                    if (e.admin_comment.startsWith(sp1) || e.admin_comment.startsWith(sp2)) return false;
                  }
                  return true;
                })
                .map(e => {
                  const parentBooking = data.find(b => b.id === e.booking_id);
                  return {
                    id: e.booking_id + '_exc_' + e.exception_date,
                    booking_id: e.booking_id,
                    type: 'booking',
                    status: 'cancelled',
                    date: e.exception_date,
                    time_slot: parentBooking?.time_slot || '',
                    admin_comment: e.admin_comment,
                    is_exception: true,
                  };
                });
            }
          }

          const newNotifs = [
            ...filtered.map(b => ({
              id: b.id, type: 'booking', status: b.status,
              date: b.start_date, time_slot: b.time_slot,
              admin_comment: b.admin_comment,
              is_exception: false,
            })),
            ...exceptionNotifs,
          ];

          // Fire instant callback for brand-new notifs
          const prevIds = new Set(prevBellNotifsRef.current.map(n => n.id));
          const brandNew = newNotifs.filter(n => !prevIds.has(n.id));
          if (brandNew.length > 0 && onNewCancelledNotif) {
            onNewCancelledNotif(brandNew);
          }
          prevBellNotifsRef.current = newNotifs;
          setVisitorUnread(newNotifs.length);
          setBellNotifs(newNotifs);
        }
      }

      if (isAdmin) {
        const { data: pendingData } = await supabase
          .from('bookings').select('id, status').in('status', ['pending', 'edit_pending']);
        if (pendingData) {
          setAdminPendingCount(pendingData.length);
          setAdminUnread(pendingData.length);
          setPendingBookingIds(pendingData.map(b => b.id));
        }
        const adminSeenAt = parseInt(localStorage.getItem(STORAGE_ADMIN_SEEN) || '0', 10);
        const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
        const cancelSince = adminSeenAt > 0 ? adminSeenAt : thirtyDaysAgo;
        const { data: cancelData } = await supabase
          .from('bookings').select('id, status, resolved_at, admin_comment')
          .eq('status', 'cancelled').gt('resolved_at', cancelSince);
        if (cancelData) {
          // Only show admin badge for user-initiated cancellations.
          // Exclude cancellations made by the currently logged-in admin.
          const adminName = localStorage.getItem('islamnu_user_name') || '';
          const f = cancelData.filter(b => {
            if (!b.admin_comment) return false;
            if (!b.admin_comment.startsWith('Avbokad av ')) return false;
            // Exclude if this admin cancelled it themselves
            if (adminName) {
              const ownPrefix1 = 'Avbokad av ' + adminName + ':';
              const ownPrefix2 = 'Avbokad av ' + adminName + '.';
              if (b.admin_comment.startsWith(ownPrefix1) || b.admin_comment.startsWith(ownPrefix2)) return false;
            }
            return true;
          });
          setCancelledUnread(f.length);
          setCancelledBookingIds(f.map(b => b.id));
        }
        return;
      }

      const cachedIsAdminDevice = localStorage.getItem(STORAGE_ADMIN_DEVICE);
      if (cachedIsAdminDevice === 'true') {
        const { count } = await supabase.from('bookings')
          .select('id', { count: 'exact', head: true }).in('status', ['pending', 'edit_pending']);
        setAdminPendingCount(count ?? 0);
      } else if (cachedIsAdminDevice !== 'false') {
        const { data: adminDevice } = await supabase.from('admin_devices')
          .select('device_id, dismissed_at').eq('device_id', deviceId).maybeSingle();
        if (adminDevice && !adminDevice.dismissed_at) {
          localStorage.setItem(STORAGE_ADMIN_DEVICE, 'true');
          const { count } = await supabase.from('bookings')
            .select('id', { count: 'exact', head: true }).in('status', ['pending', 'edit_pending']);
          setAdminPendingCount(count ?? 0);
        } else {
          localStorage.setItem(STORAGE_ADMIN_DEVICE, adminDevice ? 'dismissed' : 'false');
          setAdminPendingCount(0);
        }
      }
    } catch {}
  }, [deviceId, onNewCancelledNotif]); // eslint-disable-line

  const triggerDebounced = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { if (!hiddenRef.current) calculate(); }, DEBOUNCE_MS);
  }, [calculate]);

  const triggerImmediate = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    calculate();
  }, [calculate]);

  useEffect(() => {
    const onVis = () => {
      hiddenRef.current = document.hidden;
      if (!document.hidden) {
        calculate();
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = setInterval(calculate, POLL_FOREGROUND_MS);
      } else {
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [calculate]);

  useEffect(() => { if (!deviceId) return; calculate(); }, []); // eslint-disable-line

  useEffect(() => {
    if (!deviceId) return;
    setActive(true);
    const cached = localStorage.getItem(STORAGE_ADMIN_DEVICE);
    if (cached === null) {
      supabase.from('admin_devices').select('device_id, dismissed_at')
        .eq('device_id', deviceId).maybeSingle()
        .then(({ data }) => {
          localStorage.setItem(STORAGE_ADMIN_DEVICE,
            (data && !data.dismissed_at) ? 'true' : (data ? 'dismissed' : 'false'));
        }).catch(() => {});
    }
  }, [deviceId]); // eslint-disable-line

  useEffect(() => {
    if (!active) return;
    calculate();
    if (!document.hidden) pollRef.current = setInterval(calculate, POLL_FOREGROUND_MS);
    const channel = supabase.channel('booking-notif-v6')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, triggerDebounced)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'admin_devices' }, triggerDebounced)
      .subscribe();
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
      supabase.removeChannel(channel);
    };
  }, [active, calculate, triggerDebounced]);

  useEffect(() => {
    if (isAdminState) { setActive(true); setTimeout(() => calculate(), 0); }
    else calculate();
  }, [isAdminState]); // eslint-disable-line

  // ── Per-notification dismiss ──────────────────────────────────────────────────
  const dismissNotif = useCallback((notifId) => {
    dismissedRef.current.add(notifId);
    saveDismissedIds(dismissedRef.current);
    // Remove from state immediately without re-fetching
    setBellNotifs(prev => {
      const updated = prev.filter(n => n.id !== notifId);
      prevBellNotifsRef.current = updated;
      setVisitorUnread(updated.length);
      return updated;
    });
  }, []);

  // ── Mark all seen (e.g. when opening bell panel or my-bookings) ───────────────
  const markVisitorSeen = useCallback(() => {
    // Add all current notif IDs to dismissed set
    const ids = prevBellNotifsRef.current.map(n => n.id);
    ids.forEach(id => dismissedRef.current.add(id));
    saveDismissedIds(dismissedRef.current);
    setVisitorUnread(0);
    setBellNotifs([]);
    prevBellNotifsRef.current = [];
  }, []);

  const markAdminSeen = useCallback(() => {
    localStorage.setItem(STORAGE_ADMIN_SEEN, Date.now().toString());
    setCancelledUnread(0);
    setCancelledBookingIds([]);
  }, []);

  const activateForDevice = useCallback(() => {
    localStorage.setItem(STORAGE_HAS_BOOKING, 'true');
    setActive(true);
  }, []);

  const registerAdminDevice = useCallback(async () => {
    if (!deviceId) return;
    await supabase.from('admin_devices').upsert(
      { device_id: deviceId, created_at: Date.now(), dismissed_at: null },
      { onConflict: 'device_id' }
    );
    localStorage.setItem(STORAGE_ADMIN_DEVICE, 'true');
    localStorage.setItem(STORAGE_ADMIN, 'true');
    isAdminRef.current = true;
    setIsAdminState(true);
    setActive(true);
  }, [deviceId]); // eslint-disable-line

  const dismissAdminDevice = useCallback(async () => {
    if (!deviceId) return;
    await supabase.from('admin_devices').update({ dismissed_at: Date.now() }).eq('device_id', deviceId);
    localStorage.setItem(STORAGE_ADMIN_DEVICE, 'dismissed');
    localStorage.setItem(STORAGE_ADMIN, 'false');
    isAdminRef.current = false;
    setIsAdminState(false);
    setAdminPendingCount(0);
    setAdminUnread(0);
  }, [deviceId]);

  const totalUnread = (deviceId ? visitorUnread : 0) + (isAdminState ? adminUnread : adminPendingCount);
  const adminPendingNotif = adminPendingCount > 0 ? { count: adminPendingCount } : null;

  return {
    visitorUnread, adminUnread, adminPendingCount, cancelledUnread,
    cancelledBookingIds, pendingBookingIds, adminPendingNotif,
    totalUnread, bellNotifs, isAdminState,
    activateForDevice, registerAdminDevice, dismissAdminDevice,
    markVisitorSeen, markAdminSeen,
    dismissNotif,
    refresh: triggerImmediate,
  };
}
