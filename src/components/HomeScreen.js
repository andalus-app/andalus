import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { useTheme } from '../context/ThemeContext';
import { useCountdown } from '../hooks/useCountdown';
import { fetchPrayerTimes, fetchTomorrowPrayerTimes, calcMidnight } from '../services/prayerApi';
import {
  PRAYER_NAMES, PRAYER_SWEDISH, fmt24, fmtCountdown,
  getTodayDateStr, timeToSec, swedishDate, formatHijri,
} from '../utils/prayerUtils';
import LocationModal from './LocationModal';
import { reverseGeocode } from '../services/prayerApi';

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
  const countable = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
  let activeIdx = -1;
  for (let i = 0; i < countable.length; i++) {
    if (secs[countable[i]] <= nowSec) activeIdx = i;
  }

  order.forEach(n => {
    if (n === 'Sunrise') {
      // Shuruq: never active, just passed or future
      status[n] = secs[n] <= nowSec ? 'passed' : 'future';
      return;
    }
    if (n === 'Midnight') { status[n] = 'future'; return; }
    const idx = countable.indexOf(n);
    if (activeIdx === -1)         status[n] = 'future';   // before Fajr: all future
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

  const loadPrayers = useCallback(async (loc, method) => {
    if (!loc) return;
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR',   payload: null });
    try {
      const [todayRes, tomorrowTimings] = await Promise.all([
        fetchPrayerTimes(loc.latitude, loc.longitude, getTodayDateStr(), method),
        fetchTomorrowPrayerTimes(loc.latitude, loc.longitude, method),
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
    if (location) loadPrayers(location, settings.calculationMethod);
  }, [location, settings.calculationMethod, loadPrayers]);

  useEffect(() => {
    if (!location) detectLocation();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const PrayerTable = ({ times, isTomorrow }) => {
    if (!times) return null;
    return (
      <>
        {PRAYER_NAMES.map((name) => {
          const st       = isTomorrow ? 'future' : (prayerStatus[name] || 'future');
          const isPassed = st === 'passed';
          const isActive = st === 'active';
          return (
            <div key={name} style={{
              display:'flex', alignItems:'center', justifyContent:'space-between',
              padding:'8px 13px', borderRadius:11, marginBottom:4,
              border:'1px solid',
              background: isActive ? T.accent : T.card,
              borderColor: isActive ? T.accent : T.border,
              opacity: isPassed ? 0.3 : 1,
              transition:'opacity .4s, background .4s',
              minHeight: 40,
            }}>
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                <div style={{ fontSize:14, fontWeight:700, color: isActive ? (T.isDark?'#0A0F2C':'#fff') : T.text }}>
                  {PRAYER_SWEDISH[name]}
                </div>
                {isActive && (
                  <div style={{
                    fontSize:8, fontWeight:700, textTransform:'uppercase', letterSpacing:.8,
                    color: T.isDark ? 'rgba(10,15,44,.5)' : 'rgba(255,255,255,.5)',
                    background: T.isDark ? 'rgba(10,15,44,.12)' : 'rgba(255,255,255,.15)',
                    padding:'2px 5px', borderRadius:4,
                  }}>Pågår nu</div>
                )}
              </div>
              <div style={{
                fontSize:15, fontWeight:700, fontFamily:"'DM Mono','Courier New',monospace",
                color: isActive ? (T.isDark?'#0A0F2C':'#fff') : T.textSecondary,
              }}>
                {fmt24(times[name])}
              </div>
            </div>
          );
        })}
      </>
    );
  };

  return (
    <div style={{ padding:'12px 14px 14px', background:T.bg, minHeight:'100%' }}
      onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>

      {showModal && (
        <LocationModal detected={detectedLocation} onConfirm={handleLocationConfirm}
          onClose={() => setShowModal(false)} theme={T} />
      )}

      {/* Header */}
      <div style={{ marginBottom:10 }}>
        <div style={{ fontSize:11, fontWeight:600, color:T.textMuted, textTransform:'capitalize', marginBottom:0 }}>
          {dateStr}
        </div>
        {hijriStr && (
          <div style={{ fontSize:11, color:T.accent, fontWeight:600, marginBottom:4 }}>{hijriStr}</div>
        )}
        <button onClick={detectLocation} style={{
          display:'flex', alignItems:'center', gap:4,
          background:'none', border:'none', padding:0, cursor:'pointer',
        }}>
          <span style={{ fontSize:20, fontWeight:800, color:T.text }}>{location ? location.city : 'Välj plats'}</span>
          <span style={{ fontSize:13 }}>{detecting ? '⏳' : '📍'}</span>
        </button>
        {location?.country && (
          <div style={{ fontSize:11, color:T.textMuted, marginTop:0 }}>{location.country}</div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div style={{
          padding:'9px 12px', borderRadius:10, border:'1px solid rgba(255,80,80,0.3)',
          background:'rgba(255,80,80,0.08)', marginBottom:10, fontSize:12, color:'#FF6B6B',
        }}>
          ⚠️ {error}
          <button onClick={() => loadPrayers(location, settings.calculationMethod)}
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
            color:T.isDark?'#0A0F2C':'#fff', fontSize:14, fontWeight:700, border:'none', cursor:'pointer',
          }}>Hitta min plats</button>
        </div>
      )}

      {/* Loading */}
      {isLoading && !prayerTimes && (
        <div>{[1,2,3,4,5,6,7].map(i => (
          <div key={i} style={{ height:42, borderRadius:11, marginBottom:4, background:T.card, border:`1px solid ${T.border}`, overflow:'hidden' }}>
            <div style={{ height:'100%', width:'100%', background:`linear-gradient(90deg, transparent 25%, ${T.border} 50%, transparent 75%)`, backgroundSize:'200% 100%', animation:'shimmer 1.5s infinite' }}/>
          </div>
        ))}</div>
      )}

      {/* Countdown */}
      {prayerTimes && nextPrayer && (
        <div style={{
          background:T.bgSecondary, border:`1px solid ${T.border}`, borderRadius:15,
          padding:'11px 14px 10px', textAlign:'center', marginBottom:10,
          position:'relative', overflow:'hidden',
        }}>
          <div style={{ position:'absolute', bottom:0, left:0, right:0, height:2, background:T.accent, opacity:.6 }}/>
          <div style={{ fontSize:9, fontWeight:700, letterSpacing:'1.5px', textTransform:'uppercase', color:T.textMuted, marginBottom:3 }}>
            Tid kvar till {PRAYER_SWEDISH[nextPrayer]}
          </div>
          <div style={{ fontSize:38, fontWeight:800, color:T.text, letterSpacing:'2px', lineHeight:1, fontFamily:"'DM Mono','Courier New',monospace" }}>
            {fmtCountdown(secondsUntil)}
          </div>
          <div style={{ fontSize:11, color:T.textMuted, marginTop:4 }}>
            {PRAYER_SWEDISH[nextPrayer]} kl. {fmt24(prayerTimes[nextPrayer])}
          </div>
        </div>
      )}

      {/* Slide header + dots */}
      {prayerTimes && (
        <>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:5 }}>
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
          {slideIndex === 0 && (
            <div style={{ fontSize:10, color:T.textMuted, textAlign:'right', marginBottom:4, marginTop:-3 }}>
              ← Swipe för imorgon
            </div>
          )}
          <PrayerTable times={activeTimes} isTomorrow={isShowingTomorrow} />
        </>
      )}
    </div>
  );
}
