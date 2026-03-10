import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { useTheme } from '../context/ThemeContext';
import { useCountdown } from '../hooks/useCountdown';
import { fetchPrayerTimes, fetchTomorrowPrayerTimes, calcMidnight } from '../services/prayerApi';
import IslamNuLogo from '../icons/islamnu-logga-white.svg';
import {
  PRAYER_NAMES, PRAYER_SWEDISH, fmt24, fmtCountdown,
  getTodayDateStr, timeToSec, swedishDate, formatHijri,
} from '../utils/prayerUtils';
import LocationModal from './LocationModal';
import { reverseGeocode } from '../services/prayerApi';
import SvgIcon from './SvgIcon';

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

  // Midnight window: from midSec until Fajr next day
  // e.g. Midnight=22:49, Fajr=04:05 → active if nowSec>=22:49 OR nowSec<04:05
  const inMidnightWindow = midSec > fajrSec
    ? (nowSec >= midSec || nowSec < fajrSec)
    : (nowSec >= midSec && nowSec < fajrSec);

  if (inMidnightWindow) {
    // During midnight window: Midnight is active, ALL others are future (new day approaching)
    // They should look bright/upcoming, not dimmed
    order.forEach(n => {
      if (n === 'Midnight') status[n] = 'active';
      else status[n] = 'future'; // NOT passed — new day is coming
    });
    return status;
  }

  // Between Fajr and Midnight: normal daytime logic
  // Before Fajr (e.g. 03:00): activeIdx=-1, everything is future
  const countable = ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
  let activeIdx = -1;
  for (let i = 0; i < countable.length; i++) {
    if (secs[countable[i]] <= nowSec) activeIdx = i;
  }

  order.forEach(n => {
    if (n === 'Midnight') { status[n] = 'future'; return; }
    const idx = countable.indexOf(n);
    if (activeIdx === -1)         status[n] = 'future';
    else if (idx < activeIdx)     status[n] = 'passed';
    else if (idx === activeIdx)   status[n] = 'active';
    else                          status[n] = 'future';
  });

  return status;
}

export default function HomeScreen() {
  const { theme: T } = useTheme();
  const { prayerTimes, tomorrowTimes, hijriDate, location, settings, isLoading, error, dispatch } = useApp();
  const { nextPrayer, secondsUntil } = useCountdown(prayerTimes);

  const [showModal,        setShowModal]        = useState(false);
  const [detectedLocation, setDetectedLocation] = useState(null);
  const [detecting,        setDetecting]        = useState(false);
  const [now,              setNow]              = useState(new Date());
  const [slideIndex,       setSlideIndex]       = useState(0);
  const touchStartX = useRef(null);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const loadPrayers = useCallback(async (loc, method, school = 0) => {
    if (!loc) return;
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
      dispatch({ type: 'SET_ERROR', payload: e.message });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [dispatch]);

  useEffect(() => {
    if (location) loadPrayers(location, settings.calculationMethod, settings.school);
  }, [location, settings.calculationMethod, settings.school, loadPrayers]);

  // Silent GPS update — just saves location, no dialog
  const silentDetect = useCallback(async () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;
          const geo = await reverseGeocode(latitude, longitude);
          dispatch({ type: 'SET_LOCATION', payload: { latitude, longitude, ...geo } });
        } catch { /* silent */ }
      },
      () => { /* silent fail */ },
      { enableHighAccuracy: false, maximumAge: 60000, timeout: 10000 }
    );
  }, [dispatch]);

  // On first load: silently detect if no location saved yet
  useEffect(() => {
    if (!location) silentDetect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Continuous GPS watch — silent updates every ~500m move
  const lastCoordsRef = useRef(null);
  useEffect(() => {
    if (!navigator.geolocation || !settings.autoLocation) return;
    const watchId = navigator.geolocation.watchPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        const prev = lastCoordsRef.current;
        if (prev) {
          const dlat = Math.abs(latitude  - prev.latitude);
          const dlng = Math.abs(longitude - prev.longitude);
          if (dlat < 0.005 && dlng < 0.005) return;
        }
        lastCoordsRef.current = { latitude, longitude };
        try {
          const geo = await reverseGeocode(latitude, longitude);
          dispatch({ type: 'SET_LOCATION', payload: { latitude, longitude, ...geo } });
        } catch { /* silent */ }
      },
      () => { /* silent */ },
      { enableHighAccuracy: false, maximumAge: 60000, timeout: 10000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.autoLocation]);

  // Manual tap on city name — opens search modal
  const detectLocation = async () => {
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

  const nowSec     = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  const dateStr    = swedishDate(now);
  const hijriStr   = formatHijri(hijriDate);
  const tomorrow   = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
  const tomDateStr = swedishDate(tomorrow);

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
  const prayerStatus      = getPrayerStatus(prayerTimes, nowSec);

  const PRAYER_ICONS = {
    Sunrise: 'sunrise',
    Maghrib: 'sunset',
  };

  const PrayerTable = ({ times, isTomorrow }) => {
    if (!times) return null;
    return (
      <div style={{ borderRadius:13, overflow:'hidden', border:`1px solid ${T.border}` }}>
        {PRAYER_NAMES.map((name, idx) => {
          const st       = isTomorrow ? 'future' : (prayerStatus[name] || 'future');
          const isPassed = st === 'passed';
          const isActive = st === 'active';
          const isLast   = idx === PRAYER_NAMES.length - 1;
          const iconName = PRAYER_ICONS[name];
          const rowColor = isActive ? (T.isDark?'#000':'#fff') : T.text;
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
  };

  return (
    <div style={{ padding:'12px 14px 12px', background:T.bg, minHeight:'100%', boxSizing:'border-box' }}
      onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>

      {showModal && (
        <LocationModal detected={detectedLocation} onConfirm={handleLocationConfirm}
          onClose={() => setShowModal(false)} theme={T} />
      )}

      {/* Header */}
      <div style={{ marginBottom:16, textAlign:'center', position:'relative' }}>

        {/* Logo — top-left, theme-aware color */}
        <img
          src={IslamNuLogo}
          alt=""
          style={{
            position:'absolute', top:0, left:8,
            width:88, height:88,
            opacity: T.isDark ? 0.18 : 0.22,
            filter: T.isDark
              ? 'sepia(1) saturate(3) hue-rotate(5deg) brightness(1.1)'
              : 'sepia(1) saturate(6) hue-rotate(118deg) brightness(0.55)',
            pointerEvents:'none',
            userSelect:'none',
          }}
        />

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
            // Split "Förort, Stad" into two parts
            const parts = location.city.split(',').map(s => s.trim());
            const suburb = parts.length > 1 ? parts[0] : null;
            const city   = parts.length > 1 ? parts.slice(1).join(', ') : parts[0];
            return (
              <>
                {suburb && (
                  <div style={{
                    fontSize:11, fontWeight:500, color:T.textMuted,
                    fontFamily:"'Inter',system-ui,sans-serif",
                    maxWidth:'90%', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
                  }}>
                    {suburb}
                  </div>
                )}
                <span style={{
                  fontSize:19, fontWeight:800, color:T.text, lineHeight:1.2,
                  fontFamily:"'Inter',system-ui,sans-serif", letterSpacing:'-0.3px',
                  maxWidth:'90%', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
                }}>
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
        <div style={{
          padding:'9px 12px', borderRadius:10, border:'1px solid rgba(255,80,80,0.3)',
          background:'rgba(255,80,80,0.08)', marginBottom:8, fontSize:12, color:'#FF6B6B',
        }}>
          ⚠️ {error}
          <button onClick={() => loadPrayers(location, settings.calculationMethod, settings.school)}
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
          <button onClick={detectLocation} style={{
            padding:'12px 26px', borderRadius:13, background:T.accent,
            color:T.isDark?'#000':'#fff', fontSize:14, fontWeight:700, border:'none', cursor:'pointer',
          }}>Hitta min plats</button>
        </div>
      )}

      {/* Loading */}
      {isLoading && !prayerTimes && (
        <div>{[1,2,3,4,5,6,7].map(i => (
          <div key={i} style={{ height:46, borderRadius:11, marginBottom:3, background:T.card, border:`1px solid ${T.border}`, overflow:'hidden' }}>
            <div style={{ height:'100%', width:'100%', background:`linear-gradient(90deg, transparent 25%, ${T.border} 50%, transparent 75%)`, backgroundSize:'200% 100%', animation:'shimmer 1.5s infinite' }}/>
          </div>
        ))}</div>
      )}

      {/* Countdown */}
      {prayerTimes && nextPrayer && (
        <div style={{
          background:T.bgSecondary, border:`1px solid ${T.border}`, borderRadius:14,
          padding:'12px 14px 14px', textAlign:'center', marginBottom:14,
          position:'relative', overflow:'hidden', flexShrink:0,
        }}>
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

      {/* Table header + dots */}
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
          {/* Swipe hint — always takes up space even when hidden, so table never jumps */}
          <div style={{ height:16, marginBottom:3, display:'flex', alignItems:'center', justifyContent:'flex-end' }}>
            <div style={{ fontSize:10, color:T.textMuted, opacity: slideIndex===0 ? 1 : 0, transition:'opacity .2s' }}>
              ← Swipe för imorgon
            </div>
          </div>
          {/* Rows — no gap between them, just tight stack */}
          <PrayerTable times={activeTimes} isTomorrow={isShowingTomorrow} />
        </>
      )}
    </div>
  );
}
