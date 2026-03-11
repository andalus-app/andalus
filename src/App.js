import React, { useState, useEffect, useRef } from 'react';
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
// Dhikr tab icon — inline SVG as data URI (rosary beads)
const DhikrDailyIcon = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'><circle cx='12' cy='2.5' r='1.2'/><circle cx='16.2' cy='3.9' r='1.2'/><circle cx='19.5' cy='7.2' r='1.2'/><circle cx='21' cy='11.5' r='1.2'/><circle cx='19.5' cy='15.8' r='1.2'/><circle cx='16.2' cy='19.1' r='1.2'/><circle cx='12' cy='21' r='1.2'/><circle cx='7.8' cy='19.1' r='1.2'/><circle cx='4.5' cy='15.8' r='1.2'/><circle cx='3' cy='11.5' r='1.2'/><circle cx='4.5' cy='7.2' r='1.2'/><circle cx='7.8' cy='3.9' r='1.2'/><line x1='12' y1='3.8' x2='12' y2='6.2' stroke-width='1.2'/><circle cx='12' cy='8.5' r='2.4'/></svg>`;
import { useYoutubeLive } from './hooks/useYoutubeLive';

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

/* ── GPS permission dialog ────────────────────────────────────── */
function LocationPrompt({ onAllow, onDeny, T }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      padding: '0 16px 32px',
      animation: 'promptIn .3s cubic-bezier(0.25,0.46,0.45,0.94)',
    }}>
      <style>{`@keyframes promptIn{from{opacity:0;transform:translateY(40px)}to{opacity:1;transform:translateY(0)}}`}</style>
      <div style={{
        width: '100%', maxWidth: 460,
        background: T.card, borderRadius: 24,
        padding: '28px 24px 24px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
        border: `1px solid ${T.border}`,
      }}>
        <div style={{ fontSize: 40, textAlign: 'center', marginBottom: 16 }}>📍</div>
        <h2 style={{
          fontSize: 19, fontWeight: 800, color: T.text, textAlign: 'center',
          margin: '0 0 10px', fontFamily: "'Inter', system-ui, sans-serif",
        }}>Dela din plats</h2>
        <p style={{
          fontSize: 14, color: T.textSecondary, textAlign: 'center',
          lineHeight: 1.65, margin: '0 0 24px',
          fontFamily: 'system-ui, sans-serif',
        }}>
          Appen behöver din plats för att visa korrekta bönetider för din stad.
          Din plats sparas bara lokalt på din enhet.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            onClick={onAllow}
            style={{
              padding: '15px', borderRadius: 14, background: T.accent,
              color: '#fff', border: 'none', cursor: 'pointer',
              fontSize: 15, fontWeight: 700,
              fontFamily: 'system-ui, sans-serif',
              WebkitTapHighlightColor: 'transparent',
            }}
          >Tillåt platsdelning</button>
          <button
            onClick={onDeny}
            style={{
              padding: '13px', borderRadius: 14, background: 'none',
              color: T.textMuted, border: `1px solid ${T.border}`,
              cursor: 'pointer', fontSize: 14, fontWeight: 600,
              fontFamily: 'system-ui, sans-serif',
              WebkitTapHighlightColor: 'transparent',
            }}
          >Inte nu — välj stad manuellt</button>
        </div>
      </div>
    </div>
  );
}

function Shell() {
  const { theme: T } = useTheme();
  const { location, dispatch } = useApp();
  const [tab, setTab]               = useState('home');
  const [showMonthly, setShowMonthly] = useState(false);
  const [tabBarVisible, setTabBarVisible] = useState(true);
  const [ebooksReset, setEbooksReset] = useState(0); // bump to reset ebooks to library
  const [moreResetKey, setMoreResetKey]   = useState(0); // bump to reset MoreScreen to menu
  const [showGpsPrompt, setShowGpsPrompt] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const { isLive, stream } = useYoutubeLive();

  // Show GPS prompt only if: never shown before AND no cached location
  useEffect(() => {
    const alreadyShown = localStorage.getItem(GPS_PROMPT_KEY);
    if (!alreadyShown && !location) {
      // Small delay so app renders first
      const t = setTimeout(() => setShowGpsPrompt(true), 600);
      return () => clearTimeout(t);
    }
  }, []); // eslint-disable-line

  const handleAllowGps = () => {
    setShowGpsPrompt(false);
    localStorage.setItem(GPS_PROMPT_KEY, 'done');
    setGpsLoading(true);
    if (!navigator.geolocation) { setGpsLoading(false); return; }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;
          const geo = await reverseGeocode(latitude, longitude);
          dispatch({ type: 'SET_LOCATION', payload: { latitude, longitude, ...geo } });
        } catch {}
        setGpsLoading(false);
      },
      () => setGpsLoading(false),
      { enableHighAccuracy: false, maximumAge: 60000, timeout: 10000 }
    );
  };

  const handleDenyGps = () => {
    setShowGpsPrompt(false);
    localStorage.setItem(GPS_PROMPT_KEY, 'done');
  };

  const handleTabPress = (id) => {
    if (id === 'ebooks') {
      if (tab === 'ebooks') {
        // Already on ebooks — reset to library
        setEbooksReset(n => n + 1);
      } else {
        setTab('ebooks');
        setEbooksReset(n => n + 1); // always reset when switching to ebooks
      }
      setShowMonthly(false);
      return;
    }
    if (id === 'more') {
      setMoreResetKey(n => n + 1);
    }
    setTab(id);
    setShowMonthly(false);
  };

  const renderScreen = () => {
    if (tab === 'prayer' && showMonthly) return <MonthlyScreen onBack={() => setShowMonthly(false)} />;
    switch (tab) {
      case 'home':     return <NewHomeScreen stream={stream} />;
      case 'prayer':   return <PrayerScreen onMonthlyPress={() => setShowMonthly(true)} />;
      case 'qibla':    return <QiblaScreen />;
      case 'dhikr':   return <DhikrScreen />;
      case 'more':     return <MoreScreen key={moreResetKey} onTabBarHide={() => setTabBarVisible(false)} onTabBarShow={() => setTabBarVisible(true)} />;
      default:         return <NewHomeScreen />;
    }
  };

  // ── Edge swipe back ─────────────────────────────────
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
      style={{
      height: '100dvh', width: '100vw',
      background: T.bg,
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden', maxWidth: 500, margin: '0 auto',
      position: 'relative',
    }}>
      {/* GPS location prompt */}
      {showGpsPrompt && (
        <LocationPrompt onAllow={handleAllowGps} onDeny={handleDenyGps} T={T} />
      )}

      {/* GPS loading indicator */}
      {gpsLoading && (
        <div style={{
          position: 'fixed', top: 'max(12px, env(safe-area-inset-top))', left: '50%',
          transform: 'translateX(-50%)', zIndex: 999,
          background: T.card, border: `1px solid ${T.border}`,
          borderRadius: 20, padding: '8px 16px', fontSize: 12,
          color: T.textSecondary, fontFamily: 'system-ui',
          boxShadow: '0 4px 16px rgba(0,0,0,.15)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <div style={{ width: 12, height: 12, borderRadius: '50%', border: `2px solid ${T.border}`, borderTopColor: T.accent, animation: 'spin .7s linear infinite' }} />
          Hämtar din plats…
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      )}

      <div key={tab + (showMonthly ? '-monthly' : '')} style={{
        flex: 1, overflowY: 'auto', overflowX: 'hidden',
        WebkitOverflowScrolling: 'touch',
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
        <style>{`@keyframes liveDot{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(.7)}}`}</style>
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
                fontFamily: "'Inter', system-ui, sans-serif",
                WebkitTapHighlightColor: 'transparent',
                transition: 'background .2s',
              }}
            >
              {t.type === 'custom' ? (
                <img
                  src={t.icon === 'kaba' ? KabaIcon : t.icon === 'dhikr' ? DhikrDailyIcon : t.icon === 'more' ? MoreAppIcon : PrayerTimesIcon}
                  alt={t.label}
                  style={{
                    width: 24, height: 24, objectFit: 'contain',
                    filter: active ? svgColorFilter(T.isDark) : T.isDark ? 'invert(60%) opacity(0.45)' : 'invert(0%) opacity(0.35)',
                    transition: 'filter .2s',
                  }}
                />
              ) : (
                <div style={{ position: 'relative', display: 'inline-flex' }}>
                  <SvgIcon
                    name={t.iconName}
                    size={22}
                    color={active ? T.accent : T.textMuted}
                    style={{ opacity: active ? 1 : 0.45, transition: 'all .2s' }}
                  />
                  {t.id === 'home' && isLive && (
                    <div style={{
                      position: 'absolute', top: -2, right: -3,
                      width: 8, height: 8, borderRadius: '50%',
                      background: '#FF0000',
                      border: `1.5px solid ${T.isDark ? 'rgba(18,18,18,0.9)' : 'rgba(245,248,247,0.9)'}`,
                      animation: 'liveDot 1.4s ease-in-out infinite',
                    }} />
                  )}
                </div>
              )}
              <span style={{
                fontSize: 9, fontWeight: active ? 700 : 500,
                letterSpacing: '.3px',
                color: active ? T.accent : T.textMuted,
                opacity: active ? 1 : 0.6,
                whiteSpace: 'nowrap',
                transition: 'all .2s',
              }}>{t.label}</span>
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
