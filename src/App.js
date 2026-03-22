import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { AppProvider, useApp } from './context/AppContext';
import NewHomeScreen  from './components/NewHomeScreen';
import PrayerScreen   from './components/HomeScreen';
import MonthlyScreen  from './components/MonthlyScreen';
import QiblaScreen    from './components/QiblaScreen';
import EbooksScreen   from './components/EbooksScreen';
import SvgIcon        from './components/SvgIcon';
import KabaIcon       from './icons/kaba.svg';
import PrayerTimesIcon from './icons/prayer-times.svg';
import { reverseGeocode } from './services/prayerApi';
import DhikrScreen       from './components/DhikrScreen';
import MoreScreen        from './components/MoreScreen';
import BookingScreen     from './components/BookingScreen';
import MoreAppIcon       from './icons/more-app-svgrepo-com.svg';
import { useYoutubeLive } from './hooks/useYoutubeLive';
import { useBookingNotifications } from './hooks/useBookingNotifications';
import { useIsPWA } from './hooks/useIsPWA';
import { useScrollHide } from './hooks/useScrollHide';
import { useKeyboardTabBar } from './hooks/useKeyboardTabBar';

import DhikrMenuIcon     from './icons/dhikr-tab.svg';

/* ── Kalender+klocka-ikon för Boka lokal — används i tab-bar, grid och notiser ── */
function CalendarClockIcon({ size = 22, color = 'currentColor', style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 688.3 740.6" fill={color} xmlns="http://www.w3.org/2000/svg" style={style}>
      <path d="M92.7,498.7h66.5v55h-66.5v-55ZM383.9,296.9h-66.5v55h66.5v-55ZM496.3,296.9h-66.5v55h66.5v-55ZM205,452.8h66.5v-55h-66.5v55ZM92.7,452.8h66.5v-55h-66.5v55ZM205,351.9h66.5v-55h-66.5v55ZM383.9,397.8h-66.5v55h66.5v-55ZM205,553.7h66.5v-55h-66.5v55Z"/>
      <path d="M568.3,425.8V163.3c0-38.3-31.2-69.5-69.5-69.5h-38.2v-23.7c0-22.8-18.5-41.3-41.3-41.3s-41.3,18.5-41.3,41.3v23.7h-166.9v-23.7c0-22.8-18.5-41.3-41.3-41.3s-41.3,18.5-41.3,41.3v23.7h-38.2c-38.3,0-69.5,31.2-69.5,69.5v393.1c0,38.3,31.2,69.5,69.5,69.5h276.2c21.9,60,79.5,102.9,147,102.9s156.4-70.2,156.4-156.4-42.3-124.3-101.6-146.5ZM404,70.1c0-8.4,6.8-15.2,15.2-15.2s15.2,6.8,15.2,15.2v79.1c0,8.4-6.8,15.2-15.2,15.2s-15.2-6.8-15.2-15.2v-79.1ZM154.6,70.1c0-8.4,6.8-15.2,15.2-15.2s15.2,6.8,15.2,15.2v79.1c0,8.4-6.8,15.2-15.2,15.2s-15.2-6.8-15.2-15.2v-79.1ZM90.2,119.8h38.2v29.3c0,22.8,18.5,41.3,41.3,41.3s41.3-18.5,41.3-41.3v-29.3h166.9v29.3c0,22.8,18.5,41.3,41.3,41.3s41.3-18.5,41.3-41.3v-29.3h38.2c24,0,43.5,19.5,43.5,43.5v61.6H46.8v-61.6c0-24,19.5-43.5,43.5-43.5ZM90.2,599.8c-24,0-43.5-19.5-43.5-43.5V251h495.4v167.6c-9.3-1.7-18.9-2.7-28.7-2.7-86.3,0-156.4,70.2-156.4,156.4s.8,18.6,2.4,27.5H90.2ZM513.5,702.7c-71.9,0-130.4-58.5-130.4-130.4s58.5-130.4,130.4-130.4,130.4,58.5,130.4,130.4-58.5,130.4-130.4,130.4Z"/>
      <path d="M526.5,567v-85c0-7.2-5.8-13-13-13s-13,5.8-13,13v90.4c0,3.6,1.5,6.9,3.8,9.2l45.2,45.2c2.5,2.5,5.9,3.8,9.2,3.8s6.7-1.3,9.2-3.8c5.1-5.1,5.1-13.3,0-18.4l-41.3-41.3Z"/>
    </svg>
  );
}


function svgColorFilter(isDark) {
  return isDark
    ? 'invert(48%) sepia(60%) saturate(400%) hue-rotate(120deg) brightness(90%)'
    : 'invert(30%) sepia(60%) saturate(500%) hue-rotate(130deg) brightness(80%)';
}

const TABS = [
  { id: 'home',     type: 'icon',   iconName: 'home',   label: 'Hem'        },
  { id: 'booking',  type: 'custom', icon: 'booking',    label: 'Boka lokal' },
  { id: 'prayer',   type: 'custom', icon: 'prayer',     label: 'Bönetider'  },
  { id: 'qibla',    type: 'custom', icon: 'kaba',       label: 'Qibla'      },
  { id: 'ebooks',   type: 'custom', icon: 'ebooks',     label: 'E-böcker'   },
  { id: 'more',     type: 'custom', icon: 'more',       label: 'Visa mer'   },
];

const SCROLL_NUDGE_THRESHOLD = 5; // nudge-animation visas bara om fler än 5 ikoner
const VISIBLE_TABS = 5; // number of tabs that fit without scrolling

const GPS_PROMPT_KEY = 'gps-prompt-shown'; // set to 'done' once user responded

/* ── Haversine distance (km) between two coordinates ─────────── */
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const SILENT_UPDATE_THRESHOLD_KM = 30;


function Shell() {
  const { theme: T } = useTheme();
  const { location, dispatch } = useApp();
  const isPWA = useIsPWA();
  const [tab, setTab] = useState(() => {
    try { return sessionStorage.getItem('activeTab') || 'home'; } catch { return 'home'; }
  });
  const [showMonthly, setShowMonthly] = useState(false);
  const [tabBarVisible, setTabBarVisible] = useState(true);
  const [tabBarHiddenByChild, setTabBarHiddenByChild] = useState(false);
  const [scrollLocked, setScrollLocked] = useState(false);
  const [ebooksReset, setEbooksReset] = useState(0);
  const [moreResetKey, setMoreResetKey] = useState(0);
  const scrollContainerRef = useRef(null);
  const tabScrollRef = useRef(null);
  const nudgeDoneKey = 'tab-nudge-done';
  const [nudging, setNudging] = useState(false);
  const { visible: tabBarScrollVisible, onScroll: onShellScroll, show: showTabBar } = useScrollHide({ threshold: 40 });

  // Hide tab bar completely when soft keyboard opens (affects all text inputs app-wide)
  // Primary: visualViewport resize (iOS Safari, Chrome)
  useKeyboardTabBar({
    onHide: () => { setTabBarVisible(false); },
    onShow: () => { if (!tabBarHiddenByChild) setTabBarVisible(true); },
  });
  // Fallback: focusin/focusout on document (Android WebView, older browsers)
  useEffect(() => {
    const onFocusIn = (e) => {
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') {
        setTabBarVisible(false);
      }
    };
    const onFocusOut = () => {
      // Small delay so visualViewport has time to resize first
      setTimeout(() => {
        if (!tabBarHiddenByChild) setTabBarVisible(true);
      }, 150);
    };
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    return () => {
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
    };
  }, [tabBarHiddenByChild]); // eslint-disable-line
  const { isLive, isUpcoming, stream } = useYoutubeLive();
  const { totalUnread, visitorUnread, adminUnread, adminPendingCount, cancelledUnread, cancelledBookingIds, pendingBookingIds, markVisitorSeen, markAdminSeen, activateForDevice, registerAdminDevice, dismissAdminDevice, adminPendingNotif, refresh: refreshNotifications } = useBookingNotifications();

  // Effective tab bar visibility: hidden by child (BookingScreen etc) OR hidden by scroll
  // Tab 'prayer' (Bönetider) undantas från auto-hide — tab-baren är alltid synlig där.
  const effectiveTabBarVisible = !tabBarHiddenByChild && (tabBarVisible && (tab === 'prayer' || tabBarScrollVisible));

  // Reset scroll to top and show tab bar again when tab or monthly view changes
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (el) {
      el.scrollTop = 0;
      requestAnimationFrame(() => { if (el) el.scrollTop = 0; });
    }
    if (!tabBarHiddenByChild) showTabBar();
  }, [tab, showMonthly]); // eslint-disable-line

  // Listen for scroll-to-top and scroll-restore requests from child components
  useEffect(() => {
    const toTopHandler = () => scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    const restoreHandler = (e) => {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = e.detail?.top || 0;
      }
    };
    window.addEventListener('scrollToTop', toTopHandler);
    window.addEventListener('restoreScroll', restoreHandler);
    return () => {
      window.removeEventListener('scrollToTop', toTopHandler);
      window.removeEventListener('restoreScroll', restoreHandler);
    };
  }, []);

  // Silent background location update on every app open AND when app comes to foreground.
  // Always fetch GPS every time the app opens or comes to foreground.
  // No distance threshold. No localStorage gate blocking the call.
  // Uses Permissions API: if already granted -> runs silently (no OS prompt).
  // If 'prompt' -> OS shows dialog. If 'denied' -> silently skipped.
  const locationRef = useRef(location);
  useEffect(() => { locationRef.current = location; }, [location]);

  useEffect(() => {
    if (!navigator.geolocation) return;
    let timer = null;

    const doFetch = () => {
      // Respect manual-mode setting
      try {
        const stored = JSON.parse(localStorage.getItem('bonetiderState') || '{}');
        if (stored.settings?.autoLocation === false) return;
      } catch {}

      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          try {
            const { latitude, longitude } = pos.coords;
            const geo = await reverseGeocode(latitude, longitude);
            dispatch({ type: 'SET_LOCATION', payload: { latitude, longitude, ...geo } });
            localStorage.setItem(GPS_PROMPT_KEY, 'done');
          } catch { /* reverse geocode failed silently */ }
        },
        () => { /* Permission denied or timeout — silent */ },
        { enableHighAccuracy: false, maximumAge: 0, timeout: 12000 }
      );
    };

    const checkLocation = async () => {
      if (timer) clearTimeout(timer);
      // Use Permissions API when available to decide timing
      if (navigator.permissions) {
        try {
          const perm = await navigator.permissions.query({ name: 'geolocation' });
          if (perm.state === 'denied') {
            // Signal to HomeScreen that GPS is blocked
            window.dispatchEvent(new CustomEvent('gps-denied'));
            return;
          }
          // 'granted' = silent, 'prompt' = OS dialog will appear
          timer = setTimeout(doFetch, perm.state === 'granted' ? 1500 : 500);
          return;
        } catch { /* Permissions API not supported */ }
      }
      // Fallback: just call directly
      timer = setTimeout(doFetch, 1500);
    };

    // Run on every app open
    checkLocation();

    // Run every time app comes to foreground (PWA background/foreground cycle)
    const onVisibility = () => { if (!document.hidden) checkLocation(); };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []); // eslint-disable-line

  // Nudge-animation — en gång per session, max var 7:e dag
  // Aktiveras bara om det finns fler än 5 ikoner
  useEffect(() => {
    if (TABS.length <= SCROLL_NUDGE_THRESHOLD) return;
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    try {
      const last = parseInt(localStorage.getItem(nudgeDoneKey) || '0', 10);
      if (Date.now() - last < SEVEN_DAYS_MS) return;
    } catch {}
    const t = setTimeout(() => {
      setNudging(true);
      const el = tabScrollRef.current;
      if (el) {
        // Temporarily widen the 6th button to peek, then hide it again
        el.scrollTo({ left: 48, behavior: 'smooth' });
        setTimeout(() => el.scrollTo({ left: 0, behavior: 'smooth' }), 700);
      }
      setTimeout(() => setNudging(false), 1200);
      try { localStorage.setItem(nudgeDoneKey, Date.now().toString()); } catch {}
    }, 1800);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line

  const handleTabPress = (id) => {
    // Alltid visa tab-bar vid tab-tryck
    showTabBar();
    setTabBarVisible(true);
    // Rensa highlight/filter vid direkt tab-klick — ska gå till kalender, inte Mina bokningar
    if (id === 'booking') {
      setHighlightBookingId(null);
      setHighlightFilter(null);
      setAdminHighlightId(null);
      setAdminHighlightFilter(null);
      setAdminInitialFilter(null);
      setBookingStartView(null);
      setBookingRefreshKey(k => k + 1); // trigger re-fetch in BookingScreen
    }
    if (id === 'ebooks') {
      if (tab === 'ebooks') {
        setEbooksReset(n => n + 1);
      } else {
        setTab('ebooks');
        setEbooksReset(n => n + 1);
      }
      setShowMonthly(false);
      try { sessionStorage.setItem('activeTab', 'ebooks'); } catch {}
      return;
    }
    if (id === 'more') {
      setMoreInitialView(null); // always go to menu on regular tab click
      setMoreResetKey(n => n + 1);
    }
    setTab(id);
    setShowMonthly(false);
    try { sessionStorage.setItem('activeTab', id); } catch {}
  };

  const [moreInitialView, setMoreInitialView] = useState(null);
  const [bookingRefreshKey, setBookingRefreshKey] = useState(0);
  // Track active tab index for sliding highlight
  const activeTabIndex = TABS.findIndex(t => t.id === tab);
  const visibleTabIndex = Math.min(activeTabIndex, VISIBLE_TABS - 1);
  const [tabPillWidth, setTabPillWidth] = useState(0);
  const [tabPillLeft, setTabPillLeft] = useState(0);
  const tabRefs = useRef([]);

  // Measure actual tab button positions for pill
  useEffect(() => {
    const updatePill = () => {
      const btn = tabRefs.current[visibleTabIndex];
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const parentRect = btn.parentElement?.getBoundingClientRect();
      if (!parentRect) return;
      const relLeft = rect.left - parentRect.left;
      setTabPillLeft(relLeft + 4);
      setTabPillWidth(rect.width - 8);
    };
    updatePill();
    window.addEventListener('resize', updatePill);
    return () => window.removeEventListener('resize', updatePill);
  }, [visibleTabIndex, tab]);
  const [adminInitialFilter, setAdminInitialFilter] = useState(null);

  const [highlightBookingId, setHighlightBookingId] = useState(null);
  const [highlightFilter, setHighlightFilter] = useState(null);
  const [adminHighlightId, setAdminHighlightId] = useState(null);
  const [adminHighlightFilter, setAdminHighlightFilter] = useState(null);
  const handleGoToMyBookings = (bookingId, status) => {
    setHighlightBookingId(bookingId || null);
    // Mappa status → filter
    if (status === 'approved') setHighlightFilter('approved');
    else if (status === 'rejected' || status === 'cancelled') setHighlightFilter('cancelled');
    else if (status === 'pending' || status === 'edit_pending') setHighlightFilter('pending');
    else setHighlightFilter(null);
    setTab('booking');
    try { sessionStorage.setItem('activeTab', 'booking'); } catch {}
  };

  const handleGoToAdminLogin = () => {
    setAdminInitialFilter(null);
    setBookingStartView('admin');
    setTab('booking');
    try { sessionStorage.setItem('activeTab', 'booking'); } catch {}
  };

  const [bookingStartView, setBookingStartView] = useState(null); // 'admin' | null
  const handleGoToCancelledBookings = (highlightId = null) => {
    // Toggle allt till null först — garanterar att useEffect triggas i AdminPanel
    setAdminHighlightFilter(null);
    setAdminHighlightId(null);
    setAdminInitialFilter(null);
    setBookingStartView(null);
    setTimeout(() => {
      setAdminInitialFilter('cancelled');
      setAdminHighlightFilter('cancelled');
      setAdminHighlightId(highlightId || cancelledBookingIds[0] || null);
      setBookingStartView('admin');
    }, 0);
    setTab('booking');
    try { sessionStorage.setItem('activeTab', 'booking'); } catch {}
  };

  const handleGoToPendingBookings = () => {
    setAdminHighlightFilter(null);
    setAdminHighlightId(null);
    setAdminInitialFilter(null);
    setBookingStartView(null);
    setTimeout(() => {
      setAdminInitialFilter('pending');
      setAdminHighlightFilter('pending');
      setAdminHighlightId(pendingBookingIds[0] || null);
      setBookingStartView('admin');
    }, 0);
    setTab('booking');
    try { sessionStorage.setItem('activeTab', 'booking'); } catch {}
  };

  const renderScreen = () => {
    if (tab === 'prayer' && showMonthly) return <MonthlyScreen onBack={() => setShowMonthly(false)} />;
    switch (tab) {
      case 'home':     return <NewHomeScreen stream={stream} onGoToAdminLogin={handleGoToAdminLogin} onGoToMyBookings={handleGoToMyBookings} onGoToCancelledBookings={handleGoToCancelledBookings} onGoToPendingBookings={handleGoToPendingBookings} />;
      case 'prayer':   return <PrayerScreen onMonthlyPress={() => setShowMonthly(true)} />;
      case 'qibla':    return <QiblaScreen />;
      case 'booking':  return <BookingScreen refreshKey={bookingRefreshKey} highlightBookingId={highlightBookingId} highlightFilter={highlightFilter} adminHighlightId={adminHighlightId} adminHighlightFilter={adminHighlightFilter} adminInitialFilter={adminInitialFilter} startAtAdmin={bookingStartView==='admin'} cancelledBookingIds={cancelledBookingIds} pendingBookingIds={pendingBookingIds} visitorUnread={visitorUnread} onTabBarHide={() => { setTabBarHiddenByChild(true); setTabBarVisible(false); setScrollLocked(true); }} onTabBarShow={() => { setTabBarHiddenByChild(false); setTabBarVisible(true); setScrollLocked(false); }} activateForDevice={activateForDevice} registerAdminDevice={registerAdminDevice} dismissAdminDevice={dismissAdminDevice} onRefreshNotifications={refreshNotifications} markVisitorSeen={markVisitorSeen} onMarkAdminSeen={markAdminSeen} />;
      case 'ebooks':   return <EbooksScreen key={ebooksReset} onTabBarHide={() => { setTabBarHiddenByChild(true); setTabBarVisible(false); setScrollLocked(true); }} onTabBarShow={() => { setTabBarHiddenByChild(false); setTabBarVisible(true); setScrollLocked(false); }} onReaderOpen={() => {}} onReaderClose={() => {}} resetToLibrary={false} />;
      case 'more':     return <MoreScreen key={moreResetKey} onTabBarHide={() => { setTabBarHiddenByChild(true); setTabBarVisible(false); setScrollLocked(true); }} onTabBarShow={() => { setTabBarHiddenByChild(false); setTabBarVisible(true); setScrollLocked(false); }} initialView={moreInitialView} markVisitorSeen={markVisitorSeen} markAdminSeen={markAdminSeen} activateForDevice={activateForDevice} registerAdminDevice={registerAdminDevice} dismissAdminDevice={dismissAdminDevice} bookingBadge={totalUnread} visitorBadge={visitorUnread} adminBadge={adminPendingCount} onRefreshNotifications={refreshNotifications} />;
      default:         return <NewHomeScreen />;
    }
  };

  // Tap top ~44px of screen → scroll to top (iOS status bar tap convention)
  const handleTopTap = useCallback((e) => {
    const STATUS_BAR_HEIGHT = 44;
    if (e.clientY <= STATUS_BAR_HEIGHT) {
      scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, []);
  const swipeRef = useRef(null);
  const handleTouchStart = useCallback((e) => {
    const t = e.touches[0];
    if (t.clientX < 28) swipeRef.current = { x: t.clientX, y: t.clientY };
    else swipeRef.current = null;
  }, []);
  const handleTouchEnd = useCallback((e) => {
    if (!swipeRef.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - swipeRef.current.x;
    const dy = Math.abs(t.clientY - swipeRef.current.y);
    if (dx > 60 && dy < 80) {
      // Trigger back — dispatch a custom event that child components can listen to
      window.dispatchEvent(new CustomEvent('edgeSwipeBack'));
    }
    swipeRef.current = null;
  }, []);

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onClick={handleTopTap}
      style={{
      height: '100dvh', width: '100vw',
      background: T.bg,
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden', maxWidth: 500, margin: '0 auto',
      position: 'relative',
      touchAction: 'pan-y',
    }}>

      <div ref={scrollContainerRef}
        onScroll={(!tabBarHiddenByChild && tab !== 'prayer') ? onShellScroll : undefined}
        style={{
          flex: 1, overflowY: scrollLocked ? 'hidden' : 'auto', overflowX: 'hidden',
          WebkitOverflowScrolling: 'touch',
          overscrollBehavior: 'none', // prevents PWA scroll freeze on iOS
          paddingTop: 0,
          paddingBottom: effectiveTabBarVisible
            ? isPWA ? 'calc(env(safe-area-inset-bottom, 0px) + 82px)' : '90px'
            : 0,
        }}>
        {renderScreen()}
      </div>

      {/* ── FLOATING TAB BAR — scrollbar med peek-effekt ── */}
      <div style={{
        position: isPWA ? 'fixed' : 'absolute',
        bottom: isPWA ? `calc(env(safe-area-inset-bottom, 0px) + 8px)` : '12px',
        left: isPWA ? '50%' : '50%',
        transform: effectiveTabBarVisible
          ? 'translateX(-50%) translateY(0)'
          : 'translateX(-50%) translateY(calc(100% + 24px))',
        width: isPWA ? 'min(calc(100vw - 32px), 460px)' : 'calc(100% - 32px)',
        maxWidth: 460,
        background: T.isDark ? 'rgba(18,18,18,0.82)' : 'rgba(245,248,247,0.82)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        borderRadius: 28,
        border: `1px solid ${T.border}`,
        boxShadow: T.isDark ? '0 4px 24px rgba(0,0,0,0.4)' : '0 4px 24px rgba(0,0,0,0.08)',
        padding: '6px 0',
        zIndex: 200,
        transition: 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
        overflow: 'visible',
      }}>
        <style>{`
          @keyframes liveDot{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(.65)}}
          @keyframes liveRing{0%{box-shadow:0 0 0 0 rgba(255,0,0,0.7)}70%{box-shadow:0 0 0 5px rgba(255,0,0,0)}100%{box-shadow:0 0 0 0 rgba(255,0,0,0)}}
          @keyframes cityFadeIn{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}
          .tab-scroll::-webkit-scrollbar { display: none; }
        `}</style>

        {/* Tab scroll container */}
        <div
          ref={tabScrollRef}
          className="tab-scroll"
          style={{
            display: 'flex',
            overflowX: 'auto',
            overflowY: 'hidden',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            WebkitOverflowScrolling: 'touch',
            padding: '0',
            gap: 0,
            position: 'relative',
          }}
        >
          {/* Sliding highlight pill — measured from actual button positions */}
          {tabPillWidth > 0 && <div aria-hidden style={{
            position: 'absolute',
            top: 6, bottom: 6,
            width: tabPillWidth,
            left: tabPillLeft,
            borderRadius: 22,
            background: T.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(36,100,93,0.09)',
            transition: 'left 0.42s cubic-bezier(0.4, 0, 0.2, 1), width 0.42s cubic-bezier(0.4,0,0.2,1)',
            pointerEvents: 'none',
            zIndex: 0,
          }}/>}
          {TABS.map(t => {
            const active = tab === t.id;
            const idx = TABS.indexOf(t);
            return (
              <button
                key={t.id}
                ref={el => { if (idx < VISIBLE_TABS) tabRefs.current[idx] = el; }}
                onClick={() => handleTabPress(t.id)}
                style={{
                  flex: idx < VISIBLE_TABS ? '1 1 0' : '0 0 56px',
                  minWidth: idx < VISIBLE_TABS ? 0 : 56,
                  maxWidth: idx < VISIBLE_TABS ? undefined : 56,
                  overflow: 'hidden',
                  opacity: 1,
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', gap: 3, padding: '7px 4px',
                  background: 'none',
                  borderRadius: 22,
                  border: 'none', cursor: 'pointer',
                  fontFamily: "'Inter',system-ui,sans-serif",
                  WebkitTapHighlightColor: 'transparent',
                  position: 'relative', zIndex: 1,
                }}
              >
                {t.type === 'custom' ? (
                  <div style={{ position: 'relative', display: 'inline-flex' }}>
                    {t.icon === 'booking' ? (
                      <CalendarClockIcon
                        size={22}
                        color={active ? T.accent : T.isDark ? T.accent : T.text}
                        style={{ opacity: active ? 1 : T.isDark ? 0.75 : 1, transition: 'all .2s' }}
                      />
                    ) : t.icon === 'ebooks' ? (
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
                        stroke={active ? T.accent : T.isDark ? T.accent : T.text}
                        strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"
                        style={{ opacity: active ? 1 : T.isDark ? 0.75 : 1, transition: 'all .2s' }}>
                        <path d="M2 6s2-2 5-2 5 2 5 2v14s-2-1-5-1-5 1-5 1V6z"/>
                        <path d="M12 6s2-2 5-2 5 2 5 2v14s-2-1-5-1-5 1-5 1V6z"/>
                      </svg>
                    ) : (
                      <img
                        src={t.icon === 'kaba' ? KabaIcon : t.icon === 'more' ? MoreAppIcon : PrayerTimesIcon}
                        alt={t.label}
                        style={{
                          width: 24, height: 24, objectFit: 'contain',
                          filter: active
                            ? svgColorFilter(T.isDark)
                            : T.isDark
                              ? 'invert(48%) sepia(60%) saturate(400%) hue-rotate(120deg) brightness(90%)'
                              : 'none',
                          transition: 'filter .2s',
                        }}
                      />
                    )}
                    {/* Booking badge */}
                    {t.id === 'booking' && (visitorUnread > 0 || adminPendingCount > 0 || cancelledUnread > 0) && (
                      <div style={{ position: 'absolute', top: -3, right: -4, display: 'flex', gap: 2 }}>
                        {adminPendingCount > 0 ? (
                          <div style={{
                            minWidth: 14, height: 14, borderRadius: 7,
                            background: '#f59e0b', color: '#fff',
                            fontSize: 8, fontWeight: 800, fontFamily: 'system-ui',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            padding: '0 3px', boxSizing: 'border-box',
                            border: `1.5px solid ${T.isDark ? 'rgba(18,18,18,0.9)' : 'rgba(245,248,247,0.9)'}`,
                          }}>{adminPendingCount > 9 ? '9+' : adminPendingCount}</div>
                        ) : null}
                        {visitorUnread > 0 ? (
                          <div style={{
                            minWidth: 14, height: 14, borderRadius: 7,
                            background: '#ef4444', color: '#fff',
                            fontSize: 8, fontWeight: 800, fontFamily: 'system-ui',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            padding: '0 3px', boxSizing: 'border-box',
                            border: `1.5px solid ${T.isDark ? 'rgba(18,18,18,0.9)' : 'rgba(245,248,247,0.9)'}`,
                          }}>{visitorUnread > 9 ? '9+' : visitorUnread}</div>
                        ) : null}
                        {cancelledUnread > 0 ? (
                          <div
                            onClick={e => { e.stopPropagation(); if (navigator.vibrate) navigator.vibrate([60,40,60,40,120]); handleGoToCancelledBookings(); }}
                            style={{
                            minWidth: 14, height: 14, borderRadius: 7,
                            background: '#3b82f6', color: '#fff',
                            fontSize: 8, fontWeight: 800, fontFamily: 'system-ui',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            padding: '0 3px', boxSizing: 'border-box',
                            border: `1.5px solid ${T.isDark ? 'rgba(18,18,18,0.9)' : 'rgba(245,248,247,0.9)'}`,
                            cursor: 'pointer',
                          }}>{cancelledUnread > 9 ? '9+' : cancelledUnread}</div>
                        ) : null}
                      </div>
                    )}
                    {/* More badge borttagen — bokning finns nu i tab-bar */}
                  </div>
                ) : (
                  <div style={{ position: 'relative', display: 'inline-flex' }}>
                    <SvgIcon
                      name={t.iconName}
                      size={22}
                      color={active ? T.accent : T.isDark ? T.accent : T.text}
                      style={{ opacity: active ? 1 : T.isDark ? 0.75 : 1, transition: 'all .2s' }}
                    />
                    {t.id === 'home' && isLive && (
                      <div style={{
                        position: 'absolute', top: -3, right: -4,
                        width: 11, height: 11, borderRadius: '50%',
                        background: '#FF0000',
                        border: `2px solid ${T.isDark ? 'rgba(18,18,18,0.95)' : 'rgba(245,248,247,0.95)'}`,
                        animation: 'liveDot 1s ease-in-out infinite, liveRing 1.5s ease-out infinite',
                      }} />
                    )}
                    {t.id === 'home' && isUpcoming && !isLive && (
                      <div style={{
                        position: 'absolute', top: -3, right: -4,
                        width: 9, height: 9, borderRadius: '50%',
                        background: '#f59e0b',
                        border: `2px solid ${T.isDark ? 'rgba(18,18,18,0.95)' : 'rgba(245,248,247,0.95)'}`,
                      }} />
                    )}
                  </div>
                )}
                {TABS.indexOf(t) < VISIBLE_TABS && <span style={{
                  fontSize: 9, fontWeight: active ? 600 : 500,
                  letterSpacing: '.3px',
                  color: t.id === 'home' && isLive
                    ? '#FF0000'
                    : t.id === 'home' && isUpcoming
                      ? '#f59e0b'
                      : active ? T.accent : T.isDark ? T.accent : T.text,
                  opacity: active ? 1 : T.isDark ? 0.7 : 1,
                  whiteSpace: 'nowrap',
                  fontFamily: "'Inter',system-ui,sans-serif",
                  transition: 'all .2s',
                }}>{t.id === 'home' && isLive ? 'LIVE' : t.id === 'home' && isUpcoming ? 'Snart' : t.label}</span>}
              </button>
            );
          })}
        </div>

        {/* Peek-fade — only during nudge animation to hint at more content */}
        {nudging && TABS.length > SCROLL_NUDGE_THRESHOLD && (
          <div style={{
            position: 'absolute', top: 0, right: 0, bottom: 0, width: 24,
            background: T.isDark
              ? 'linear-gradient(to right, transparent, rgba(18,18,18,0.6))'
              : 'linear-gradient(to right, transparent, rgba(245,248,247,0.6))',
            borderRadius: '0 28px 28px 0',
            pointerEvents: 'none',
          }} />
        )}
      </div>

    </div>
  );
}


// ── SplashScreen — Particle burst ────────────────────────────────────────────
// Visas bara vid cold start (första gången sidan laddas per session).
// Om appen redan är öppen i PWA-läge (sessionStorage har flaggan) — hoppa över.

const ANDALUS_LOGO_PATH = (
  <React.Fragment>
    <path fill="#2D8B78" d="M229.9,232.4c-23.4-3.5-44.5.7-63.5,14.1-4.1,2.9-7.6,6.9-12.6,11.5 1.2-6.6,4.9-9.6,8.1-12.6 16.7-15.5,36.8-21.4,59.2-20.2 5,.3,6.2-1.2,6.5-5.9.6-13.2-1.8-26.2-1.4-39.4 0-1.2,0-2.8-.7-3.5-4.7-4.3-2.9-9-1.7-14 3.8-15.9-.4-30.5-10.1-42.9-15.8-20.1-36.3-34.5-59.5-45.2-3.9-1.8-7.9-1.8-11.7,0-24.2,11.8-46,26.8-61.8,48.8-9.2,12.7-10.5,27.4-6.6,42.4.9,3.3,1.3,6.2-1,9.2-.8,1.1-1.6,2.6-1.6,3.8.5,13.6-2.6,27-1.8,40.6.3,5.3,2.4,6.1,7.2,5.9 25.6-1.4,47.4,6.6,64.3,26.4 1.1,1.3,2.7,2.5,2.2,5.6-38.4-37.3-79.1-30.2-120.5-7.3 33.4-9.9,66.6-13.1,99-4.3 7.9,4.3,15,9.6,20.3,17.6-42.7-31.9-88.2-27.6-135.1-11.2 9.4-10.6,5-22.9,5.2-34.3.6-32,.1-64.1.2-96.1 0-31,12.3-56,37.6-73.8 27.1-19,56.2-34.7,85.5-49.9 8.3-4.3,16.5-4.8,25-.4 30.8,16,61.5,32.1,89.4,52.7 22.9,16.9,33.9,40.4,34.1,68.7.3,36.1,0,72.2.2,108.3.1,8.5-3.3,18.1,6.7,24.8-47.6-17.9-93.1-19.3-136.3,12.2 4.1-12.2,31.3-25.8,54.1-29.3 21.3-3.3,41.7.1,62.4,4.8-12.3-8.6-26-13.5-41.2-15.9z"/>
    <path fill="#2D8B78" d="M203,280.3c-15.7,3.6-30.5,8.4-44.5,15.6-6.4,3.3-12.8,3.3-19.2.1-30.6-14.9-62.9-22-96.9-21.3-9.3.2-18.6-.2-27.9,1.2-3,.5-6.3.7-10.3-.8 7.8-7,16.6-9.9,25.6-11.6 38.7-7.2,76.2-3.6,111.8,14 5,2.5,9,2.5,14.2,0 27.2-12.8,55.7-18.8,85.9-17.1 14.5.8,28.6,2.7,42,8.3 3.5,1.4,7.1,2.9,10.4,7.7-31.2-2.2-61.1-3.5-91.1,3.9z"/>
    <path fill="#2D8B78" d="M139.7,178.4c-11.1-5.3-16.5-14.1-16.2-25.4.3-11.6,7.1-19.4,17.8-23.9 1.7-.7,3.3-1.8,5.8-.1-10.8,8.6-13.8,19.1-6.5,31.2 3.3,5.4,8.3,8.8,14.8,9.4 6.1.6,11.8-.7,18.1-5-4.3,13.2-18.6,18.5-33.7,13.7z"/>
  </React.Fragment>
);

const PARTICLES = [
  { angle: 0,   dist: 52 },
  { angle: 45,  dist: 48 },
  { angle: 90,  dist: 52 },
  { angle: 135, dist: 48 },
  { angle: 180, dist: 52 },
  { angle: 225, dist: 48 },
  { angle: 270, dist: 52 },
  { angle: 315, dist: 48 },
];

function SplashScreen({ onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 1100);
    return () => clearTimeout(t);
  }, [onDone]);

  // Läs tema från localStorage (samma nyckel som ThemeContext)
  const isDark = (() => {
    try {
      const saved = localStorage.getItem('theme');
      if (saved === 'dark') return true;
      if (saved === 'light') return false;
    } catch {}
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true;
  })();

  const splashBg   = isDark ? '#060e0d' : '#F5F8F7';
  const logoColor  = isDark ? '#2D8B78' : '#24645d';
  const textColor  = isDark ? 'rgba(45,139,120,0.8)' : 'rgba(36,100,93,0.75)';

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: splashBg,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      animation: 'splashOut 0.35s 0.85s cubic-bezier(0.76,0,0.24,1) both',
    }}>
      <style>{`
        @keyframes splashLogoIn {
          from { transform: scale(0) rotate(-20deg); opacity: 0; }
          to   { transform: scale(1) rotate(0deg);   opacity: 1; }
        }
        @keyframes splashParticle {
          0%   { opacity: 0.9; transform: translate(0,0) scale(1.2); }
          100% { opacity: 0;   transform: var(--pt) scale(0); }
        }
        @keyframes splashName {
          from { opacity: 0; letter-spacing: 12px; }
          to   { opacity: 1; letter-spacing: 7px; }
        }
        @keyframes splashOut {
          from { opacity: 1; transform: scale(1); }
          to   { opacity: 0; transform: scale(1.04); }
        }
      `}</style>

      {/* Particle burst */}
      <div style={{ position: 'relative', width: 40, height: 40 }}>
        {PARTICLES.map((p, i) => {
          const rad = (p.angle * Math.PI) / 180;
          const tx = Math.round(Math.cos(rad) * p.dist);
          const ty = Math.round(Math.sin(rad) * p.dist);
          return (
            <div key={i} style={{
              position: 'absolute',
              top: '50%', left: '50%',
              width: 5, height: 5,
              marginTop: -2.5, marginLeft: -2.5,
              borderRadius: '50%',
              background: '#2D8B78',
              '--pt': `translate(${tx}px,${ty}px)`,
              animation: `splashParticle 0.65s ${0.05 + i * 0.02}s cubic-bezier(0.2,0,1,1) both`,
            }} />
          );
        })}

        {/* Logo */}
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          animation: 'splashLogoIn 0.5s 0.1s cubic-bezier(0.34,1.56,0.64,1) both',
        }}>
          <svg viewBox="0 0 297.86 300" width="40" height="40" xmlns="http://www.w3.org/2000/svg">
            <path fill={logoColor} d="M229.9,232.4c-23.4-3.5-44.5.7-63.5,14.1-4.1,2.9-7.6,6.9-12.6,11.5 1.2-6.6,4.9-9.6,8.1-12.6 16.7-15.5,36.8-21.4,59.2-20.2 5,.3,6.2-1.2,6.5-5.9.6-13.2-1.8-26.2-1.4-39.4 0-1.2,0-2.8-.7-3.5-4.7-4.3-2.9-9-1.7-14 3.8-15.9-.4-30.5-10.1-42.9-15.8-20.1-36.3-34.5-59.5-45.2-3.9-1.8-7.9-1.8-11.7,0-24.2,11.8-46,26.8-61.8,48.8-9.2,12.7-10.5,27.4-6.6,42.4.9,3.3,1.3,6.2-1,9.2-.8,1.1-1.6,2.6-1.6,3.8.5,13.6-2.6,27-1.8,40.6.3,5.3,2.4,6.1,7.2,5.9 25.6-1.4,47.4,6.6,64.3,26.4 1.1,1.3,2.7,2.5,2.2,5.6-38.4-37.3-79.1-30.2-120.5-7.3 33.4-9.9,66.6-13.1,99-4.3 7.9,4.3,15,9.6,20.3,17.6-42.7-31.9-88.2-27.6-135.1-11.2 9.4-10.6,5-22.9,5.2-34.3.6-32,.1-64.1.2-96.1 0-31,12.3-56,37.6-73.8 27.1-19,56.2-34.7,85.5-49.9 8.3-4.3,16.5-4.8,25-.4 30.8,16,61.5,32.1,89.4,52.7 22.9,16.9,33.9,40.4,34.1,68.7.3,36.1,0,72.2.2,108.3.1,8.5-3.3,18.1,6.7,24.8-47.6-17.9-93.1-19.3-136.3,12.2 4.1-12.2,31.3-25.8,54.1-29.3 21.3-3.3,41.7.1,62.4,4.8-12.3-8.6-26-13.5-41.2-15.9z"/>
            <path fill={logoColor} d="M203,280.3c-15.7,3.6-30.5,8.4-44.5,15.6-6.4,3.3-12.8,3.3-19.2.1-30.6-14.9-62.9-22-96.9-21.3-9.3.2-18.6-.2-27.9,1.2-3,.5-6.3.7-10.3-.8 7.8-7,16.6-9.9,25.6-11.6 38.7-7.2,76.2-3.6,111.8,14 5,2.5,9,2.5,14.2,0 27.2-12.8,55.7-18.8,85.9-17.1 14.5.8,28.6,2.7,42,8.3 3.5,1.4,7.1,2.9,10.4,7.7-31.2-2.2-61.1-3.5-91.1,3.9z"/>
            <path fill={logoColor} d="M139.7,178.4c-11.1-5.3-16.5-14.1-16.2-25.4.3-11.6,7.1-19.4,17.8-23.9 1.7-.7,3.3-1.8,5.8-.1-10.8,8.6-13.8,19.1-6.5,31.2 3.3,5.4,8.3,8.8,14.8,9.4 6.1.6,11.8-.7,18.1-5-4.3,13.2-18.6,18.5-33.7,13.7z"/>
          </svg>
        </div>
      </div>

      {/* App name */}
      <div style={{
        marginTop: 20,
        fontSize: 13,
        fontFamily: "'Inter',system-ui,sans-serif",
        fontWeight: 500,
        letterSpacing: 3,
        color: textColor,
        textTransform: 'uppercase',
        animation: 'splashName 0.5s 0.45s cubic-bezier(0.16,1,0.3,1) both',
      }}>
        Andalus Kunskapscenter
      </div>
    </div>
  );
}

export default function App() {
  // Cold start detection — visa splash bara om sidan stängts ned och öppnats igen
  const [showSplash, setShowSplash] = React.useState(() => {
    try {
      if (sessionStorage.getItem('andalus_session_started')) return false;
      sessionStorage.setItem('andalus_session_started', '1');
      return true;
    } catch { return false; }
  });

  return (
    <ThemeProvider>
      <AppProvider>
        {showSplash && <SplashScreen onDone={() => setShowSplash(false)} />}
        <Shell />
      </AppProvider>
    </ThemeProvider>
  );
}
