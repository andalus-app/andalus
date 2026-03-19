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
  const { isLive, isUpcoming, stream } = useYoutubeLive();
  const { totalUnread, visitorUnread, adminUnread, adminPendingCount, cancelledUnread, markVisitorSeen, markAdminSeen, activateForDevice, registerAdminDevice, dismissAdminDevice, adminPendingNotif, refresh: refreshNotifications } = useBookingNotifications();

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
  // Runs after 10 s if user has already granted GPS permission.
  // Only updates if new position is >30 km from cached location.
  const locationRef = useRef(location);
  useEffect(() => { locationRef.current = location; }, [location]);

  useEffect(() => {
    const alreadyGranted = localStorage.getItem(GPS_PROMPT_KEY) === 'done';
    if (!alreadyGranted || !navigator.geolocation) return;

    let timer = null;

    const checkLocation = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        navigator.geolocation.getCurrentPosition(
          async (pos) => {
            try {
              const { latitude, longitude } = pos.coords;
              const current = locationRef.current;
              const dist = current
                ? haversineKm(current.latitude, current.longitude, latitude, longitude)
                : Infinity;

              if (dist >= SILENT_UPDATE_THRESHOLD_KM) {
                const geo = await reverseGeocode(latitude, longitude);
                dispatch({ type: 'SET_LOCATION', payload: { latitude, longitude, ...geo } });
              }
            } catch {
              // Fail silently — never show any error to user
            }
          },
          () => { /* Denied or timed out — fail silently */ },
          { enableHighAccuracy: false, maximumAge: 0, timeout: 10000 }
        );
      }, 10000);
    };

    // Kör vid appstart
    checkLocation();

    // Kör varje gång appen kommer till förgrunden (iOS PWA-fix)
    const onVisibilityChange = () => {
      if (!document.hidden) checkLocation();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
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
        el.scrollTo({ left: 55, behavior: 'smooth' });
        setTimeout(() => el.scrollTo({ left: 0, behavior: 'smooth' }), 650);
      }
      setTimeout(() => setNudging(false), 1300);
      try { localStorage.setItem(nudgeDoneKey, Date.now().toString()); } catch {}
    }, 1800);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line

  const handleTabPress = (id) => {
    // Alltid visa tab-bar vid tab-tryck
    showTabBar();
    setTabBarVisible(true);
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
  const [adminInitialFilter, setAdminInitialFilter] = useState(null);

  const [highlightBookingId, setHighlightBookingId] = useState(null);
  const handleGoToMyBookings = (bookingId) => {
    setHighlightBookingId(bookingId || null);
    setTab('booking');
    try { sessionStorage.setItem('activeTab', 'booking'); } catch {}
  };

  const handleGoToAdminLogin = () => {
    setAdminInitialFilter(null);
    setTab('booking');
    try { sessionStorage.setItem('activeTab', 'booking'); } catch {}
  };

  const handleGoToCancelledBookings = () => {
    setAdminInitialFilter('cancelled');
    setTab('booking');
    try { sessionStorage.setItem('activeTab', 'booking'); } catch {}
  };

  const renderScreen = () => {
    if (tab === 'prayer' && showMonthly) return <MonthlyScreen onBack={() => setShowMonthly(false)} />;
    switch (tab) {
      case 'home':     return <NewHomeScreen stream={stream} onGoToAdminLogin={handleGoToAdminLogin} onGoToMyBookings={handleGoToMyBookings} onGoToCancelledBookings={handleGoToCancelledBookings} />;
      case 'prayer':   return <PrayerScreen onMonthlyPress={() => setShowMonthly(true)} />;
      case 'qibla':    return <QiblaScreen />;
      case 'booking':  return <BookingScreen highlightBookingId={highlightBookingId} adminInitialFilter={adminInitialFilter} onTabBarHide={() => { setTabBarHiddenByChild(true); setTabBarVisible(false); setScrollLocked(true); }} onTabBarShow={() => { setTabBarHiddenByChild(false); setTabBarVisible(true); setScrollLocked(false); }} activateForDevice={activateForDevice} registerAdminDevice={registerAdminDevice} dismissAdminDevice={dismissAdminDevice} onRefreshNotifications={refreshNotifications} markVisitorSeen={markVisitorSeen} onMarkAdminSeen={markAdminSeen} />;
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
    }}>

      <div ref={scrollContainerRef}
        onScroll={(!tabBarHiddenByChild && tab !== 'prayer') ? onShellScroll : undefined}
        style={{
          flex: 1, overflowY: scrollLocked ? 'hidden' : 'auto', overflowX: 'hidden',
          WebkitOverflowScrolling: 'touch',
          // Ingen paddingTop här — varje skärms header hanterar safe-area-inset-top själv
          // Det förhindrar att bakgrunden syns ovanför sticky headers i PWA
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
        overflow: 'hidden',
      }}>
        <style>{`
          @keyframes liveDot{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(.65)}}
          @keyframes liveRing{0%{box-shadow:0 0 0 0 rgba(255,0,0,0.7)}70%{box-shadow:0 0 0 5px rgba(255,0,0,0)}100%{box-shadow:0 0 0 0 rgba(255,0,0,0)}}
          .tab-scroll::-webkit-scrollbar { display: none; }
        `}</style>

        {/* Scrollbar-container */}
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
            padding: '0 4px',
            gap: 0,
          }}
        >
          {TABS.map(t => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => handleTabPress(t.id)}
                style={{
                  flexShrink: 0,
                  minWidth: 72,
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', gap: 3, padding: '7px 4px',
                  background: active
                    ? T.isDark ? 'rgba(255,255,255,0.07)' : 'rgba(36,100,93,0.08)'
                    : 'none',
                  borderRadius: 22,
                  border: 'none', cursor: 'pointer',
                  fontFamily: "'Inter',system-ui,sans-serif",
                  WebkitTapHighlightColor: 'transparent',
                  transition: 'background .2s',
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
                          <div style={{
                            minWidth: 14, height: 14, borderRadius: 7,
                            background: '#3b82f6', color: '#fff',
                            fontSize: 8, fontWeight: 800, fontFamily: 'system-ui',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            padding: '0 3px', boxSizing: 'border-box',
                            border: `1.5px solid ${T.isDark ? 'rgba(18,18,18,0.9)' : 'rgba(245,248,247,0.9)'}`,
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
                <span style={{
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
                }}>{t.id === 'home' && isLive ? 'LIVE' : t.id === 'home' && isUpcoming ? 'Snart' : t.label}</span>
              </button>
            );
          })}
        </div>

        {/* Peek-fade i höger kant — visas bara när fler än 5 ikoner finns */}
        {TABS.length > SCROLL_NUDGE_THRESHOLD && (
          <div style={{
            position: 'absolute', top: 0, right: 0, bottom: 0, width: 32,
            background: T.isDark
              ? 'linear-gradient(to right, transparent, rgba(18,18,18,0.75))'
              : 'linear-gradient(to right, transparent, rgba(245,248,247,0.75))',
            borderRadius: '0 28px 28px 0',
            pointerEvents: 'none',
          }} />
        )}
      </div>

    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppProvider>
        <Shell />
      </AppProvider>
    </ThemeProvider>
  );
}
