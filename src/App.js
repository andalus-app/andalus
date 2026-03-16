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
import MoreAppIcon       from './icons/more-app-svgrepo-com.svg';
import { useYoutubeLive } from './hooks/useYoutubeLive';
import { useBookingNotifications } from './hooks/useBookingNotifications';

import DhikrMenuIcon     from './icons/dhikr-tab.svg';

function svgColorFilter(isDark) {
  return isDark
    ? 'invert(48%) sepia(60%) saturate(400%) hue-rotate(120deg) brightness(90%)'
    : 'invert(30%) sepia(60%) saturate(500%) hue-rotate(130deg) brightness(80%)';
}

const TABS = [
  { id: 'home',     type: 'icon',   iconName: 'home',   label: 'Hem'        },
  { id: 'prayer',   type: 'custom', icon: 'prayer',     label: 'Bönetider'  },
  { id: 'qibla',    type: 'custom', icon: 'kaba',       label: 'Qibla'      },
  { id: 'dhikr',    type: 'custom', icon: 'dhikr',      label: 'Dhikr'      },
  { id: 'more',     type: 'custom', icon: 'more',       label: 'Visa mer'   },
];

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
  const [tab, setTab] = useState(() => {
    // Restore tab from sessionStorage — prevents iOS PWA from jumping to home on wake
    try { return sessionStorage.getItem('activeTab') || 'home'; } catch { return 'home'; }
  });
  const [showMonthly, setShowMonthly] = useState(false);
  const [tabBarVisible, setTabBarVisible] = useState(true);
  const [ebooksReset, setEbooksReset] = useState(0);
  const [moreResetKey, setMoreResetKey]   = useState(0);
  const scrollContainerRef = useRef(null);
  const { isLive, stream } = useYoutubeLive();
  const isUpcoming = stream?.status === 'upcoming';
  const { totalUnread, visitorUnread, adminUnread, adminPendingCount, markVisitorSeen, markAdminSeen, activateForDevice, registerAdminDevice, dismissAdminDevice, adminPendingNotif } = useBookingNotifications();

  // Reset scroll to top when tab or monthly view changes
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [tab, showMonthly]);

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

  // Silent background location update on every app open.
  // Runs after 10 s if user has already granted GPS permission.
  // Only updates if new position is >30 km from cached location.
  useEffect(() => {
    const alreadyGranted = localStorage.getItem(GPS_PROMPT_KEY) === 'done';
    if (!alreadyGranted || !navigator.geolocation) return;

    const t = setTimeout(async () => {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          try {
            const { latitude, longitude } = pos.coords;
            const dist = location
              ? haversineKm(location.latitude, location.longitude, latitude, longitude)
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

    return () => clearTimeout(t);
  }, []); // eslint-disable-line


  const handleTabPress = (id) => {
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

  const handleGoToAdminLogin = () => {
    const alreadyAdmin = localStorage.getItem('islamnu_admin_mode') === 'true';
    // If already logged in → go directly to booking (BookingScreen will show admin panel)
    // If not logged in → go to admin login screen
    setMoreInitialView(alreadyAdmin ? 'booking' : 'booking-admin-login');
    setMoreResetKey(n => n + 1);
    setTab('more');
    try { sessionStorage.setItem('activeTab', 'more'); } catch {}
  };

  const renderScreen = () => {
    if (tab === 'prayer' && showMonthly) return <MonthlyScreen onBack={() => setShowMonthly(false)} />;
    switch (tab) {
      case 'home':     return <NewHomeScreen stream={stream} onGoToAdminLogin={handleGoToAdminLogin} />;
      case 'prayer':   return <PrayerScreen onMonthlyPress={() => setShowMonthly(true)} />;
      case 'qibla':    return <QiblaScreen />;
      case 'dhikr':    return <DhikrScreen />;
      case 'more':     return <MoreScreen key={moreResetKey} onTabBarHide={() => setTabBarVisible(false)} onTabBarShow={() => setTabBarVisible(true)} initialView={moreInitialView} markVisitorSeen={markVisitorSeen} markAdminSeen={markAdminSeen} activateForDevice={activateForDevice} registerAdminDevice={registerAdminDevice} dismissAdminDevice={dismissAdminDevice} bookingBadge={totalUnread} visitorBadge={visitorUnread} adminBadge={adminUnread || adminPendingCount} />;
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

      <div ref={scrollContainerRef} style={{
        flex: 1, overflowY: 'auto', overflowX: 'hidden',
        WebkitOverflowScrolling: 'touch',
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: tabBarVisible ? 90 : 0,
      }}>
        {renderScreen()}
      </div>

      {/* ── FLOATING TAB BAR ── */}
      <div style={{
        position: 'absolute',
        bottom: `calc(env(safe-area-inset-bottom, 0px) + 8px)`,
        left: '50%',
        transform: tabBarVisible
          ? 'translateX(-50%) translateY(0)'
          : 'translateX(-50%) translateY(calc(100% + 24px))',
        width: 'calc(100% - 32px)',
        maxWidth: 460,
        display: 'flex',
        background: T.isDark ? 'rgba(18,18,18,0.82)' : 'rgba(245,248,247,0.82)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        borderRadius: 28,
        border: `1px solid ${T.border}`,
        boxShadow: T.isDark ? '0 4px 24px rgba(0,0,0,0.4)' : '0 4px 24px rgba(0,0,0,0.08)',
        padding: '6px 4px',
        zIndex: 200,
        transition: 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
      }}>
        <style>{`
          @keyframes liveDot{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(.65)}}
          @keyframes liveRing{0%{box-shadow:0 0 0 0 rgba(255,0,0,0.7)}70%{box-shadow:0 0 0 5px rgba(255,0,0,0)}100%{box-shadow:0 0 0 0 rgba(255,0,0,0)}}
        `}</style>
        {TABS.map(t => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => handleTabPress(t.id)}
              style={{
                flex: 1, display: 'flex', flexDirection: 'column',
                alignItems: 'center', gap: 3, padding: '7px 2px',
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
                  <img
                    src={t.icon === 'kaba' ? KabaIcon : t.icon === 'dhikr' ? DhikrMenuIcon : t.icon === 'more' ? MoreAppIcon : PrayerTimesIcon}
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
                  {t.id === 'more' && (visitorUnread > 0 || adminUnread > 0 || adminPendingCount > 0) && (
                    <div style={{ position: 'absolute', top: -3, right: -4, display: 'flex', gap: 2 }}>
                      {adminUnread > 0 || adminPendingCount > 0 ? (
                        <div style={{
                          minWidth: 14, height: 14, borderRadius: 7,
                          background: '#f59e0b', color: '#fff',
                          fontSize: 8, fontWeight: 800, fontFamily: 'system-ui',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          padding: '0 3px', boxSizing: 'border-box',
                          border: `1.5px solid ${T.isDark ? 'rgba(18,18,18,0.9)' : 'rgba(245,248,247,0.9)'}`,
                        }}>{(adminUnread || adminPendingCount) > 9 ? '9+' : (adminUnread || adminPendingCount)}</div>
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
                    </div>
                  )}
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
