import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { useTheme } from '../context/ThemeContext';
import { useCountdown } from '../hooks/useCountdown';
import { fetchPrayerTimes, fetchTomorrowPrayerTimes, calcMidnight } from '../services/prayerApi';
import IslamNuLogoWhite from '../icons/islamnu-logga-white.svg';
import IslamNuLogoTeal  from '../icons/islamnu-logga-light.svg';
import {
  PRAYER_NAMES, PRAYER_SWEDISH, fmt24, fmtCountdown,
  getTodayDateStr, timeToSec, swedishDate, formatHijri,
} from '../utils/prayerUtils';
import LocationModal from './LocationModal';
import { reverseGeocode } from '../services/prayerApi';
import { useBanner } from '../hooks/useBanner';
import SvgIcon from './SvgIcon';

// ── Helpers ────────────────────────────────────────────────────────────────

function enrichWithMidnight(timings, nextFajr) {
  if (!timings) return timings;
  return { ...timings, Midnight: calcMidnight(timings.Maghrib, nextFajr || timings.Fajr) };
}

function getPrayerStatus(times, nowSec) {
  if (!times) return {};
  const order = ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha', 'Midnight'];
  const secs = {};
  order.forEach(n => { secs[n] = timeToSec(times[n]); });

  const midSec  = secs['Midnight'];
  const fajrSec = secs['Fajr'];
  const status  = {};

  const inMidnightWindow = midSec > fajrSec
    ? (nowSec >= midSec || nowSec < fajrSec)
    : (nowSec >= midSec && nowSec < fajrSec);

  if (inMidnightWindow) {
    order.forEach(n => { status[n] = n === 'Midnight' ? 'active' : 'future'; });
    return status;
  }

  const countable = ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
  let activeIdx = -1;
  for (let i = 0; i < countable.length; i++) {
    if (secs[countable[i]] <= nowSec) activeIdx = i;
  }
  order.forEach(n => {
    if (n === 'Midnight') { status[n] = 'future'; return; }
    const idx = countable.indexOf(n);
    if (activeIdx === -1)       status[n] = 'future';
    else if (idx < activeIdx)   status[n] = 'passed';
    else if (idx === activeIdx) status[n] = 'active';
    else                        status[n] = 'future';
  });
  return status;
}

const PRAYER_ICONS = { Sunrise: 'sunrise', Maghrib: 'sunset' };

// ── PrayerTable — defined OUTSIDE HomeScreen so React never remounts it ──
function PrayerTable({ times, isTomorrow, prayerStatus, T }) {
  if (!times) return null;
  return (
    <div style={{ borderRadius:13, overflow:'hidden', border:`1px solid ${T.border}` }}>
      {PRAYER_NAMES.map((name, idx) => {
        const st       = isTomorrow ? 'future' : (prayerStatus[name] || 'future');
        const isPassed = st === 'passed';
        const isActive = st === 'active';
        const isLast   = idx === PRAYER_NAMES.length - 1;
        const iconName = PRAYER_ICONS[name];
        const rowColor = isActive ? (T.isDark ? '#000' : '#fff') : T.text;
        return (
          <div key={name} style={{
            display:'flex', alignItems:'center', justifyContent:'space-between',
            padding:'12px 16px',
            borderBottom: isLast ? 'none' : `1px solid ${T.border}`,
            background: isActive ? T.accent : T.card,
            opacity: isPassed ? 0.28 : 1,
            transition:'opacity .4s, background .4s',
          }}>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <div style={{ fontSize:15, fontWeight:600, color:rowColor, fontFamily:"'Inter',system-ui,sans-serif", letterSpacing:'-0.1px' }}>
                {PRAYER_SWEDISH[name]}
              </div>
              {iconName && (
                <SvgIcon name={iconName} size={16} color={isActive ? rowColor : T.accent} style={{ opacity: isActive ? 0.85 : 0.7 }} />
              )}
            </div>
            <div style={{
              fontSize:17, fontWeight:400,
              fontFamily:"'DS-Digital','Segment7','Courier New',monospace",
              letterSpacing:'1px',
              color: isActive ? rowColor : T.textSecondary,
            }}>
              {fmt24(times[name])}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── HomeScreen ─────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const { theme: T } = useTheme();
  const { prayerTimes, tomorrowTimes, hijriDate, location, settings, isLoading, error, dispatch } = useApp();
  const { nextPrayer, secondsUntil } = useCountdown(prayerTimes);

  const [showModal,        setShowModal]        = useState(false);
  const [detectedLocation, setDetectedLocation] = useState(null);
  const [detecting,        setDetecting]        = useState(false);
  const [slideIndex,       setSlideIndex]       = useState(0);
  const [showBellPanel,    setShowBellPanel]    = useState(false);
  const touchStartX = useRef(null);

  // Single clock tick — used only for date string + prayer status
  // useCountdown already ticks for the countdown — we piggyback on a minute-level clock
  // to avoid re-rendering the whole tree every second.
  // Prayer status only changes at prayer time boundaries (minutes), not every second.
  const [nowMin, setNowMin] = useState(() => {
    const n = new Date(); return n.getHours() * 60 + n.getMinutes();
  });
  const nowSecRef = useRef(0);
  useEffect(() => {
    const tick = () => {
      const n = new Date();
      const sec = n.getHours() * 3600 + n.getMinutes() * 60 + n.getSeconds();
      nowSecRef.current = sec;
      const min = n.getHours() * 60 + n.getMinutes();
      setNowMin(min); // only re-renders when minute changes
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const { banners, allBanners, unreadCount, read, dismiss: dismissBanner, markRead, markAllRead } = useBanner();

  // ── Load prayers ──────────────────────────────────────────────────────────
  // Use a ref to track what we last fetched — avoid re-fetching same coords
  const lastFetchRef = useRef(null);

  const loadPrayers = useCallback(async (loc, method, school) => {
    if (!loc) return;
    const key = `${loc.latitude.toFixed(4)},${loc.longitude.toFixed(4)},${method},${school}`;
    if (lastFetchRef.current === key) return; // already fetched this exact combo
    lastFetchRef.current = key;

    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR',   payload: null });
    try {
      const [todayRes, tomorrowTimings] = await Promise.all([
        fetchPrayerTimes(loc.latitude, loc.longitude, getTodayDateStr(), method, school),
        fetchTomorrowPrayerTimes(loc.latitude, loc.longitude, method, school),
      ]);
      const todayTimings = enrichWithMidnight(todayRes.timings, tomorrowTimings.Fajr);
      const tomTimings   = enrichWithMidnight(tomorrowTimings, null);
      dispatch({ type: 'SET_PRAYER_TIMES',   payload: todayTimings });
      dispatch({ type: 'SET_TOMORROW_TIMES', payload: tomTimings });
      dispatch({ type: 'SET_HIJRI',          payload: todayRes.hijri });
    } catch (e) {
      lastFetchRef.current = null; // allow retry on error
      dispatch({ type: 'SET_ERROR', payload: e.message });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [dispatch]);

  useEffect(() => {
    if (location) loadPrayers(location, settings.calculationMethod, settings.school);
  }, [location, settings.calculationMethod, settings.school, loadPrayers]);

  // ── GPS — only on first load if no saved location ──────────────────────
  const silentDetect = useCallback(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;
          const geo = await reverseGeocode(latitude, longitude);
          dispatch({ type: 'SET_LOCATION', payload: { latitude, longitude, ...geo } });
        } catch { /* silent */ }
      },
      () => {},
      { enableHighAccuracy: false, maximumAge: 300000, timeout: 10000 }
    );
  }, [dispatch]);

  useEffect(() => {
    if (!location) silentDetect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── GPS watch — only updates location when moved >500m, no geocoding spam ──
  const lastCoordsRef = useRef(null);
  useEffect(() => {
    if (!navigator.geolocation || !settings.autoLocation) return;
    const watchId = navigator.geolocation.watchPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        const prev = lastCoordsRef.current;
        // ~500m threshold in degrees
        if (prev && Math.abs(latitude - prev.lat) < 0.005 && Math.abs(longitude - prev.lng) < 0.005) return;
        lastCoordsRef.current = { lat: latitude, lng: longitude };
        try {
          const geo = await reverseGeocode(latitude, longitude);
          dispatch({ type: 'SET_LOCATION', payload: { latitude, longitude, ...geo } });
        } catch { /* silent */ }
      },
      () => {},
      { enableHighAccuracy: false, maximumAge: 120000, timeout: 15000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.autoLocation]);

  // ── Manual location tap ───────────────────────────────────────────────────
  const detectLocation = () => {
    if (!navigator.geolocation) { setDetectedLocation(null); setShowModal(true); return; }
    setDetecting(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;
          const geo = await reverseGeocode(latitude, longitude);
          setDetectedLocation({ latitude, longitude, ...geo });
          setShowModal(true);
        } catch { setDetectedLocation(null); setShowModal(true); }
        finally { setDetecting(false); }
      },
      () => { setDetectedLocation(null); setShowModal(true); setDetecting(false); }
    );
  };

  const handleLocationConfirm = (loc) => {
    dispatch({ type: 'SET_LOCATION', payload: loc });
    setShowModal(false);
  };

  // ── Derived values — memoised so they don't recompute every second ────────
  const now        = useMemo(() => new Date(), [nowMin]); // only updates on minute change
  const dateStr    = useMemo(() => swedishDate(now), [nowMin]); // eslint-disable-line react-hooks/exhaustive-deps
  const hijriStr   = useMemo(() => formatHijri(hijriDate), [hijriDate]);
  const tomDateStr = useMemo(() => { const t = new Date(now); t.setDate(t.getDate()+1); return swedishDate(t); }, [nowMin]); // eslint-disable-line react-hooks/exhaustive-deps

  // Prayer status — recalculate at minute boundaries only
  const prayerStatus = useMemo(() => {
    const n = new Date();
    const sec = n.getHours() * 3600 + n.getMinutes() * 60 + n.getSeconds();
    return getPrayerStatus(prayerTimes, sec);
  }, [prayerTimes, nowMin]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Swipe ─────────────────────────────────────────────────────────────────
  const onTouchStart = (e) => { touchStartX.current = e.touches[0].clientX; };
  const onTouchEnd   = (e) => {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (dx < -50 && slideIndex === 0) setSlideIndex(1);
    if (dx > 50  && slideIndex === 1) setSlideIndex(0);
    touchStartX.current = null;
  };

  const isShowingTomorrow = slideIndex === 1;
  const activeTimes       = isShowingTomorrow ? tomorrowTimes : prayerTimes;

  return (
    <div style={{ padding:'12px 14px 12px', background:T.bg, minHeight:'100%', boxSizing:'border-box' }}
      onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}
      onMouseDown={() => setShowBellPanel(false)}
    >
      {showModal && (
        <LocationModal detected={detectedLocation} onConfirm={handleLocationConfirm}
          onClose={() => setShowModal(false)} theme={T} />
      )}

      {/* ── HEADER ── */}
      <div style={{ marginBottom:16, textAlign:'center', position:'relative' }}>

        <img
          src={T.isDark ? IslamNuLogoWhite : IslamNuLogoTeal}
          alt=""
          style={{
            position:'absolute', top:0, left:8,
            width:88, height:88,
            opacity: T.isDark ? 0.18 : 1,
            filter: T.isDark ? 'sepia(1) saturate(3) hue-rotate(5deg) brightness(1.1)' : 'none',
            pointerEvents:'none', userSelect:'none',
          }}
        />

        {/* Bell icon */}
        {allBanners.length > 0 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowBellPanel(v => !v);
              allBanners.forEach(b => markRead(b.id));
            }}
            style={{
              position:'absolute', top:4, right:4,
              background:'none', border:'none', cursor:'pointer',
              padding:6, WebkitTapHighlightColor:'transparent',
            }}
          >
            <div style={{ position:'relative', display:'inline-flex' }}>
              <SvgIcon
                name="bell"
                size={22}
                color={unreadCount > 0 ? T.accent : T.textMuted}
                style={{ opacity: unreadCount > 0 ? 1 : 0.5 }}
              />
              {unreadCount > 0 && (
                <div style={{
                  position:'absolute', top:-3, right:-3,
                  width:16, height:16, borderRadius:8,
                  background:'#FF3B30', border:`2px solid ${T.bg}`,
                  display:'flex', alignItems:'center', justifyContent:'center',
                }}>
                  <span style={{ fontSize:9, fontWeight:800, color:'#fff', fontFamily:"'Inter',system-ui,sans-serif", lineHeight:1 }}>
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                </div>
              )}
            </div>
          </button>
        )}

        {/* Notification panel */}
        {showBellPanel && (
          <div
            onMouseDown={e => e.stopPropagation()}
            style={{
              position:'absolute', top:36, right:0, left:0,
              background:T.card, border:`1px solid ${T.border}`,
              borderRadius:16, zIndex:500,
              boxShadow:`0 8px 32px rgba(0,0,0,${T.isDark?'0.5':'0.12'})`,
              overflow:'hidden', animation:'fadeUp .2s ease both',
            }}
          >
            <div style={{
              display:'flex', alignItems:'center', justifyContent:'space-between',
              padding:'12px 14px 10px', borderBottom:`1px solid ${T.border}`,
            }}>
              <span style={{ fontSize:13, fontWeight:700, color:T.text, fontFamily:"'Inter',system-ui,sans-serif" }}>Meddelanden</span>
              <button onClick={() => { markAllRead(); setShowBellPanel(false); }} style={{
                background:'none', border:'none', cursor:'pointer',
                fontSize:11, fontWeight:700, color:T.accent, fontFamily:"'Inter',system-ui,sans-serif", padding:'2px 0',
              }}>Markera alla lästa</button>
            </div>
            {allBanners.length === 0 ? (
              <div style={{ padding:'16px 14px', fontSize:13, color:T.textMuted, textAlign:'center', fontFamily:"'Inter',system-ui,sans-serif" }}>
                Inga meddelanden
              </div>
            ) : allBanners.map(b => {
              const isRead = read.includes(b.id);
              return (
                <div key={b.id} style={{
                  padding:'11px 14px', borderBottom:`1px solid ${T.border}`,
                  background: isRead ? 'transparent' : T.isDark ? 'rgba(201,168,76,0.06)' : 'rgba(36,100,93,0.05)',
                  display:'flex', alignItems:'flex-start', gap:10, textAlign:'left',
                }}>
                  <div style={{ width:7, height:7, borderRadius:4, flexShrink:0, marginTop:5, background: isRead ? 'transparent' : T.accent }}/>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, color:T.textSecondary, lineHeight:1.5, fontFamily:"'Inter',system-ui,sans-serif" }}>{b.message}</div>
                    {b.linkText && b.linkUrl && (
                      <a href={b.linkUrl} target="_blank" rel="noopener noreferrer" style={{
                        display:'inline-block', marginTop:5, fontSize:12, fontWeight:700,
                        color:T.accent, textDecoration:'underline', textUnderlineOffset:2,
                        fontFamily:"'Inter',system-ui,sans-serif",
                      }}>{b.linkText} →</a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ fontSize:14, fontWeight:600, color:T.textMuted, textTransform:'capitalize', fontFamily:"'Inter',system-ui,sans-serif", marginBottom:2 }}>
          {dateStr}
        </div>
        {hijriStr && (
          <div style={{ fontSize:13, color:T.accent, fontWeight:600, marginBottom:10, fontFamily:"'Inter',system-ui,sans-serif" }}>{hijriStr}</div>
        )}
        <div style={{ height:6 }}/>
        <button onClick={detectLocation} style={{
          display:'flex', flexDirection:'column', alignItems:'center',
          background:'none', border:'none', padding:0, cursor:'pointer', width:'100%', gap:1,
        }}>
          {location && (
            <div style={{ fontSize:11, color:T.textMuted, fontWeight:400, fontFamily:"'Inter',system-ui,sans-serif" }}>
              Du följer bönetiderna i
            </div>
          )}
          {detecting ? (
            <span style={{ fontSize:17, fontWeight:700, color:T.text, lineHeight:1.3, fontFamily:"'Inter',system-ui,sans-serif" }}>
              Hämtar plats…
            </span>
          ) : location ? (() => {
            const parts = location.city.split(',').map(s => s.trim());
            const suburb = parts.length > 1 ? parts[0] : null;
            const city   = parts.length > 1 ? parts.slice(1).join(', ') : parts[0];
            return (
              <>
                {suburb && (
                  <div style={{ fontSize:11, fontWeight:500, color:T.textMuted, fontFamily:"'Inter',system-ui,sans-serif", maxWidth:'90%', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {suburb}
                  </div>
                )}
                <span style={{ fontSize:19, fontWeight:800, color:T.text, lineHeight:1.2, fontFamily:"'Inter',system-ui,sans-serif", letterSpacing:'-0.3px', maxWidth:'90%', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {city}
                </span>
              </>
            );
          })() : (
            <span style={{ fontSize:17, fontWeight:700, color:T.text, fontFamily:"'Inter',system-ui,sans-serif" }}>
              Välj plats
            </span>
          )}
          {location?.country && (
            <div style={{ fontSize:11, color:T.textMuted, fontFamily:"'Inter',system-ui,sans-serif", marginTop:1 }}>
              {location.country}
            </div>
          )}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div style={{ padding:'9px 12px', borderRadius:10, border:'1px solid rgba(255,80,80,0.3)', background:'rgba(255,80,80,0.08)', marginBottom:8, fontSize:12, color:'#FF6B6B' }}>
          ⚠️ {error}
          <button onClick={() => { lastFetchRef.current = null; loadPrayers(location, settings.calculationMethod, settings.school); }}
            style={{ marginLeft:6, color:T.accent, background:'none', border:'none', fontWeight:700, cursor:'pointer', fontSize:12 }}>
            Försök igen
          </button>
        </div>
      )}

      {/* No location */}
      {!location && !isLoading && (
        <div style={{ textAlign:'center', paddingTop:40 }}>
          <div style={{ fontSize:48, marginBottom:10 }}>🕌</div>
          <div style={{ fontSize:18, fontWeight:700, color:T.text, marginBottom:8 }}>Ange din plats</div>
          <div style={{ fontSize:13, color:T.textMuted, lineHeight:1.6, maxWidth:260, margin:'0 auto 20px' }}>
            Vi behöver din plats för att visa korrekta bönetider.
          </div>
          <button onClick={detectLocation} style={{ padding:'12px 26px', borderRadius:13, background:T.accent, color:T.isDark?'#000':'#fff', fontSize:14, fontWeight:700, border:'none', cursor:'pointer' }}>
            Hitta min plats
          </button>
        </div>
      )}

      {/* Loading skeleton */}
      {isLoading && !prayerTimes && (
        <div>{[1,2,3,4,5,6,7].map(i => (
          <div key={i} style={{ height:46, borderRadius:11, marginBottom:3, background:T.card, border:`1px solid ${T.border}`, overflow:'hidden' }}>
            <div style={{ height:'100%', width:'100%', background:`linear-gradient(90deg, transparent 25%, ${T.border} 50%, transparent 75%)`, backgroundSize:'200% 100%', animation:'shimmer 1.5s infinite' }}/>
          </div>
        ))}</div>
      )}

      {/* Countdown */}
      {prayerTimes && nextPrayer && (
        <div style={{ background:T.bgSecondary, border:`1px solid ${T.border}`, borderRadius:14, padding:'12px 14px 14px', textAlign:'center', marginBottom:14, position:'relative', overflow:'hidden', flexShrink:0 }}>
          <div style={{ position:'absolute', bottom:0, left:0, right:0, height:2, background:T.accent, opacity:.5 }}/>
          <div style={{ fontSize:9, fontWeight:700, letterSpacing:'1.8px', textTransform:'uppercase', color:T.textMuted, marginBottom:4, fontFamily:"'Inter',system-ui,sans-serif" }}>
            Tid kvar till {PRAYER_SWEDISH[nextPrayer]}
          </div>
          <div style={{ fontSize:34, fontWeight:400, color:T.text, letterSpacing:'3px', lineHeight:1.1, fontFamily:"'DS-Digital','Segment7','Courier New',monospace" }}>
            {fmtCountdown(secondsUntil)}
          </div>
          <div style={{ fontSize:11, color:T.textMuted, marginTop:5, fontFamily:"'Inter',system-ui,sans-serif" }}>
            {PRAYER_SWEDISH[nextPrayer]} kl. {fmt24(prayerTimes[nextPrayer])}
          </div>
        </div>
      )}

      {/* Prayer table */}
      {prayerTimes && (
        <>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
            <div style={{ fontSize:10, fontWeight:700, letterSpacing:'1.4px', textTransform:'uppercase', color:T.textMuted }}>
              {isShowingTomorrow ? `Imorgon · ${tomDateStr}` : 'Dagens böner'}
            </div>
            <div style={{ display:'flex', gap:4, alignItems:'center' }}>
              {[0,1].map(i => (
                <div key={i} onClick={() => setSlideIndex(i)} style={{
                  width: slideIndex===i ? 14 : 6, height:6, borderRadius:3,
                  background: slideIndex===i ? T.accent : T.border,
                  transition:'all .3s', cursor:'pointer',
                }}/>
              ))}
            </div>
          </div>
          <div style={{ height:16, marginBottom:3, display:'flex', alignItems:'center', justifyContent:'flex-end' }}>
            <div style={{ fontSize:10, color:T.textMuted, opacity: slideIndex===0 ? 1 : 0, transition:'opacity .2s' }}>
              ← Swipe för imorgon
            </div>
          </div>
          <PrayerTable times={activeTimes} isTomorrow={isShowingTomorrow} prayerStatus={prayerStatus} T={T} />
        </>
      )}

      {/* Admin banners */}
      {banners.map(banner => (
        <div key={banner.id} style={{
          marginTop:14, background:T.card,
          border:`1px solid ${T.accent}`, borderLeft:`4px solid ${T.accent}`,
          borderRadius:14, padding:'13px 14px',
          display:'flex', alignItems:'flex-start', gap:10,
          animation:'fadeUp .35s ease both', boxShadow:`0 4px 20px ${T.accentGlow}`,
        }}>
          <img
            src={T.isDark ? IslamNuLogoWhite : IslamNuLogoTeal}
            alt=""
            style={{
              width:22, height:22, flexShrink:0, marginTop:1, objectFit:'contain',
              opacity: T.isDark ? 0.55 : 1,
              filter: T.isDark ? 'sepia(1) saturate(4) hue-rotate(5deg) brightness(0.95)' : 'none',
            }}
          />
          <div style={{ flex:1, fontSize:13, lineHeight:1.55, color:T.textSecondary, fontFamily:"'Inter',system-ui,sans-serif" }}>
            {banner.message}
            {banner.linkText && banner.linkUrl && (
              <a href={banner.linkUrl} target="_blank" rel="noopener noreferrer" style={{
                display:'block', marginTop:8, color:T.accent, fontWeight:700, fontSize:13,
                textDecoration:'underline', textUnderlineOffset:3, fontFamily:"'Inter',system-ui,sans-serif",
              }}>
                {banner.linkText} →
              </a>
            )}
          </div>
          <button onClick={() => dismissBanner(banner.id)} style={{
            background:'none', border:'none', cursor:'pointer', color:T.textMuted,
            fontSize:18, lineHeight:1, padding:'0 2px', flexShrink:0, marginTop:-1,
          }} aria-label="Stäng">×</button>
        </div>
      ))}
    </div>
  );
}
