import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { useTheme } from '../context/ThemeContext';
import { useCountdown } from '../hooks/useCountdown';
import { useIsPWA } from '../hooks/useIsPWA';
import { fetchPrayerTimes, fetchTomorrowPrayerTimes, calcMidnight } from '../services/prayerApi';

import {
  PRAYER_NAMES, PRAYER_SWEDISH, fmt24, fmtCountdown,
  getTodayDateStr, timeToSec, swedishDate, formatHijri,
} from '../utils/prayerUtils';
import LocationModal from './LocationModal';
import { reverseGeocode } from '../services/prayerApi';
import SvgIcon from './SvgIcon';

/* ── Andalus logotyp — inline SVG, färg följer tema ── */
function AndalusLogo({ size = 48, color = '#24645d' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 297.8647687 300" xmlns="http://www.w3.org/2000/svg">
      <defs><style>{`.al-fill { fill: ${color}; }`}</style></defs>
      <path className="al-fill" d="M229.8983337,232.4419815c-23.3515973-3.4663809-44.5192984.690603-63.4835746,14.1136076-4.1402025,2.9304127-7.5731318,6.8600668-12.6031989,11.50312,1.2087873-6.6497041,4.9039832-9.6434929,8.0594981-12.5828532,16.6636522-15.5221022,36.8377552-21.4412172,59.2001354-20.2233709,5.0363045.2742586,6.2443493-1.2224873,6.4749835-5.9114297.6485379-13.1849821-1.8041591-26.2285468-1.4120216-39.3846439.0348253-1.1676504-.0326719-2.8026951-.7493011-3.4530894-4.6967392-4.2630192-2.8881248-9.0038284-1.6808225-14.0000727,3.849645-15.930984-.3694156-30.4604348-10.1129292-42.8694028-15.795544-20.1165559-36.2824066-34.5198856-59.4625504-45.1581647-3.94625-1.8111019-7.8916089-1.8435882-11.7438157.0306671-24.179608,11.7641614-45.9181399,26.8398647-61.8456711,48.8430021-9.183821,12.6870321-10.5376272,27.3678506-6.5710687,42.4192727.8799517,3.3389975,1.2909127,6.2469854-1.004959,9.1638466-.8292731,1.0535214-1.6135481,2.5546112-1.5681415,3.8209828.4865891,13.5685432-2.5578041,26.9652989-1.7513271,40.573197.3163609,5.3370348,2.3572059,6.1291065,7.227329,5.8551078,25.5700588-1.4384562,47.4196381,6.6087528,64.3219439,26.4371645,1.1310801,1.3269632,2.7193817,2.5248352,2.1893167,5.5824456-38.4011816-37.349071-79.0540906-30.2310816-120.478243-7.2756687,33.40865-9.897183,66.5982867-13.1018543,98.9083429,4.3126583,7.9176722,4.2674002,15.0504011,9.6484679,20.2918334,17.6165217-42.6931229-31.907783-88.183706-27.5604479-135.1094409-11.1907318,9.3535295-10.5808433,4.9608249-22.8986083,5.1624256-34.2563011.5683803-32.0232857.1322842-64.0636499.1841138-96.0971271.0500475-30.9299825,12.2514558-55.9516911,37.61557-73.766435,27.0783512-19.0187418,56.1911244-34.6925642,85.4917613-49.9847748,8.3014932-4.3326327,16.492273-4.7589272,24.989872-.3523,30.7791162,15.9612612,61.4718744,32.1288198,89.4498177,52.7476324,22.9265651,16.8961241,33.8553273,40.4259134,34.1244253,68.6610182.3437979,36.0853725-.0389093,72.1773166.1979622,108.2644341.055468,8.4540859-3.3367699,18.0762678,6.70688,24.776502-47.6048657-17.927462-93.148058-19.2972329-136.3367176,12.2321497,4.0634977-12.1885252,31.3417417-25.7651622,54.1177189-29.3116265,21.287622-3.3147906,41.7467135.1198466,62.3805255,4.7521329-12.3222945-8.6278041-25.9948311-13.4941774-41.1806722-15.8874709Z"/>
      <path className="al-fill" d="M202.9953714,280.3336547c-15.7446797,3.6087637-30.5327401,8.3959076-44.4568505,15.6493742-6.3690967,3.317835-12.8247369,3.2756585-19.2411708.1406378-30.5720578-14.9370518-62.8805918-21.9839426-96.8771881-21.3017304-9.3015143.1866384-18.6220376-.2255849-27.8904716,1.2003595-3.0489598.4691022-6.2913152.6753066-10.2812639-.8255233,7.7859077-6.9863735,16.5695718-9.9241374,25.5778926-11.5995022,38.6925558-7.195808,76.1850121-3.6110285,111.7953792,13.96573,5.0021475,2.469033,8.9982222,2.4734882,14.1537421.0373128,27.175476-12.8412957,55.7306729-18.7830954,85.9661726-17.0737221,14.5050026.8201027,28.5771762,2.694952,42.0227913,8.2670391,3.4928526,1.447441,7.0805281,2.9060201,10.3688098,7.670108-31.1506852-2.2134122-61.1370614-3.5036566-91.1378429,3.8699164Z"/>
      <path className="al-fill" d="M139.713843,178.4258055c-11.0575565-5.2621864-16.4931641-14.0691664-16.2162323-25.4301635.2829093-11.6045515,7.1263802-19.4153159,17.7786562-23.8601656,1.6566527-.6912528,3.2516743-1.7640246,5.8266312-.0805475-10.7726795,8.6426921-13.8290648,19.1206559-6.5349068,31.2443385,3.2698295,5.4349393,8.2636234,8.7957304,14.8055101,9.442412,6.0947267.6025373,11.8417201-.6599731,18.0082508-5.0452151-4.3064581,13.2168001-18.606964,18.4807315-33.6679092,13.7293411Z"/>
    </svg>
  );
}

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
            background: isActive ? (T.isDark ? T.accent : '#24645d') : T.card,
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
              fontSize:17, fontWeight:500,
              fontFamily:"'Inter',system-ui,sans-serif",
              fontVariantNumeric:'tabular-nums',
              fontFeatureSettings:'"tnum" 1',
              letterSpacing:'0.01em',
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

export default function HomeScreen({ onMonthlyPress }) {
  const { theme: T } = useTheme();
  const isPWA = useIsPWA();
  const { prayerTimes, tomorrowTimes, hijriDate, location, settings, isLoading, error, dispatch } = useApp();
  const { nextPrayer, secondsUntil } = useCountdown(prayerTimes);

  const [showModal,        setShowModal]        = useState(false);
  const [detectedLocation, setDetectedLocation] = useState(null);
  const [detecting,        setDetecting]        = useState(false);
  const [gpsDenied,        setGpsDenied]        = useState(false);

  // Listen for GPS denied signal from App.js Shell
  useEffect(() => {
    const handler = () => setGpsDenied(true);
    window.addEventListener('gps-denied', handler);
    return () => window.removeEventListener('gps-denied', handler);
  }, []);
  const [slideIndex,       setSlideIndex]       = useState(0);
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

  // ── Load prayers ──────────────────────────────────────────────────────────
  // Use a ref to track what we last fetched — avoid re-fetching same coords
  const lastFetchRef = useRef(null);

  // Cache key: location + method + school + date (expires daily)
  const PRAYER_CACHE_KEY = 'prayer_times_cache';

  const getCachedPrayers = (loc, method, school) => {
    try {
      const raw = JSON.parse(localStorage.getItem(PRAYER_CACHE_KEY) || 'null');
      if (!raw) return null;
      const key = `${loc.latitude.toFixed(4)},${loc.longitude.toFixed(4)},${method},${school}`;
      if (raw.key !== key) return null;
      // Accept cache if it's from today
      if (raw.date !== getTodayDateStr()) return null;
      return raw;
    } catch { return null; }
  };

  const setCachedPrayers = (loc, method, school, todayTimings, tomTimings, hijri) => {
    try {
      const key = `${loc.latitude.toFixed(4)},${loc.longitude.toFixed(4)},${method},${school}`;
      localStorage.setItem(PRAYER_CACHE_KEY, JSON.stringify({
        key, date: getTodayDateStr(),
        todayTimings, tomTimings, hijri,
      }));
    } catch {}
  };

  const loadPrayers = useCallback(async (loc, method, school) => {
    if (!loc) return;
    const key = `${loc.latitude.toFixed(4)},${loc.longitude.toFixed(4)},${method},${school}`;
    if (lastFetchRef.current === key) return;
    lastFetchRef.current = key;

    // Show cached data immediately if available — no loading flash
    const cached = getCachedPrayers(loc, method, school);
    if (cached) {
      dispatch({ type: 'SET_PRAYER_TIMES',   payload: cached.todayTimings });
      dispatch({ type: 'SET_TOMORROW_TIMES', payload: cached.tomTimings });
      dispatch({ type: 'SET_HIJRI',          payload: cached.hijri });
      dispatch({ type: 'SET_ERROR',          payload: null });
      // Still try to refresh in background silently
    }

    dispatch({ type: 'SET_LOADING', payload: false }); // never block UI — always show existing data
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
      setCachedPrayers(loc, method, school, todayTimings, tomTimings, todayRes.hijri);
    } catch (e) {
      lastFetchRef.current = null; // allow retry later
      if (!cached) {
        // No cache available — show a soft offline indicator (not an error)
        dispatch({ type: 'SET_ERROR', payload: 'offline' });
      }
      // If we have cached data, just keep showing it silently — no error shown
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [dispatch]); // eslint-disable-line

  useEffect(() => {
    if (location) {
      lastFetchRef.current = null; // clear cache so new location always triggers fresh fetch
      loadPrayers(location, settings.calculationMethod, settings.school);
    }
  }, [location, settings.calculationMethod, settings.school, loadPrayers]);

  // ── Manual location tap ───────────────────────────────────────────────────
  // HomeScreen intentionally does NOT run its own GPS fetch on mount.
  // App.js Shell handles the always-on GPS update on every app open.
  // This keeps a single source of truth and avoids duplicate OS permission prompts.

  const detectLocation = () => {
    if (!navigator.geolocation) { setDetectedLocation(null); setShowModal(true); return; }
    setDetecting(true);
    setGpsDenied(false);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;
          const geo = await reverseGeocode(latitude, longitude);
          // Dispatch directly — no confirmation modal needed
          dispatch({ type: 'SET_LOCATION', payload: { latitude, longitude, ...geo } });
        } catch { setDetectedLocation(null); setShowModal(true); }
        finally { setDetecting(false); }
      },
      () => { setDetectedLocation(null); setShowModal(true); setDetecting(false); setGpsDenied(true); }
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
    <div style={{
      padding:'12px 14px 12px',
      // PWA: extra top-padding för notch hanteras av Shell, men header-logon
      // behöver lite extra luft så att den inte kolliderar med status-baren.
      paddingTop: isPWA ? 'max(12px, calc(env(safe-area-inset-top, 0px) + 4px))' : '12px',
      background:T.bg, minHeight:'100%', boxSizing:'border-box',
    }}
      onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}
    >
      {showModal && (
        <LocationModal detected={detectedLocation} onConfirm={handleLocationConfirm}
          onClose={() => setShowModal(false)} theme={T} />
      )}

      {/* ── HEADER ── */}
      <div style={{ marginBottom:16, textAlign:'center', position:'relative' }}>

        <div style={{ position:'absolute', top:0, left:8, pointerEvents:'none', userSelect:'none' }}>
          <AndalusLogo size={80} color={T.isDark ? T.accent : '#24645d'} />
        </div>

        {/* Monthly calendar icon — top right */}
        {onMonthlyPress && (
          <button
            onClick={(e) => { e.stopPropagation(); onMonthlyPress(); }}
            style={{
              position:'absolute', top:4, right: 4,
              background:'none', border:'none', cursor:'pointer',
              padding:6, WebkitTapHighlightColor:'transparent',
              opacity: 1,
            }}
          >
            <SvgIcon name="calendar" size={28} color={T.textMuted} />
          </button>
        )}


        <div style={{ fontSize:14, fontWeight:400, color:T.textMuted, textTransform:'capitalize', fontFamily:"'Inter',system-ui,sans-serif", fontVariantNumeric:'tabular-nums', fontFeatureSettings:'"tnum" 1', marginBottom:2 }}>
          {dateStr}
        </div>
        {hijriStr && (
          <div style={{ fontSize:13, color:T.isDark ? T.accent : '#24645d', fontWeight:400, marginBottom:10, fontFamily:"'Inter',system-ui,sans-serif", fontVariantNumeric:'tabular-nums', fontFeatureSettings:'"tnum" 1' }}>{hijriStr}</div>
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
            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, padding:'4px 0' }}>
              <div style={{
                width:16, height:16, borderRadius:'50%',
                border:`2px solid ${T.border}`,
                borderTopColor:T.accent,
                animation:'spin .7s linear infinite',
                flexShrink:0,
              }}/>
              <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            </div>
          ) : location ? (() => {
            const parts = location.city.split(',').map(s => s.trim());
            const suburb = parts.length > 1 ? parts[0] : null;
            const city   = parts.length > 1 ? parts.slice(1).join(', ') : parts[0];
            return (
              <>
                {suburb && (
                  <div style={{ fontSize:11, fontWeight:400, color:T.textMuted, fontFamily:"'Inter',system-ui,sans-serif", maxWidth:'90%', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {suburb}
                  </div>
                )}
                <span key={city} style={{ fontSize:19, fontWeight:600, color:T.text, lineHeight:1.2, fontFamily:"'Inter',system-ui,sans-serif", letterSpacing:'-0.3px', maxWidth:'90%', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', animation:'cityFadeIn 0.6s ease' }}>
                  {city}
                </span>
              </>
            );
          })() : (
            <span style={{ fontSize:17, fontWeight:600, color:T.text, fontFamily:"'Inter',system-ui,sans-serif" }}>
              Välj plats
            </span>
          )}
          {gpsDenied && location && (
            <div style={{ fontSize:11, color:T.textMuted, marginTop:4, display:'flex', alignItems:'center', gap:4 }}>
              <span>Platstjänster avstängda —</span>
              <button onClick={() => setShowModal(true)} style={{ background:'none', border:'none', color:T.accent,
                fontSize:11, fontWeight:600, cursor:'pointer', padding:0, WebkitTapHighlightColor:'transparent' }}>
                ändra manuellt
              </button>
            </div>
          )}
          {location?.country && (
            <div style={{ fontSize:11, color:T.textMuted, fontFamily:"'Inter',system-ui,sans-serif", fontWeight:400, marginTop:1 }}>
              {location.country}
            </div>
          )}
        </button>
      </div>

      {/* Error */}
      {error === 'offline' && (
        <div style={{
          display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'9px 14px', borderRadius:12,
          background: T.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
          border: `1px solid ${T.border}`,
          marginBottom:8,
        }}>
          <div style={{ display:'flex', alignItems:'center', gap:7 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke={T.textMuted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/>
              <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><circle cx="12" cy="20" r="1" fill={T.textMuted}/>
            </svg>
            <span style={{ fontSize:12, color:T.textMuted, fontFamily:"'Inter',system-ui,sans-serif" }}>
              Offline — visar senast hämtade tider
            </span>
          </div>
          <button onClick={() => { lastFetchRef.current = null; loadPrayers(location, settings.calculationMethod, settings.school); }}
            style={{ color:T.accent, background:'none', border:'none', fontWeight:600, cursor:'pointer', fontSize:12,
              fontFamily:"'Inter',system-ui,sans-serif", padding:'2px 0', WebkitTapHighlightColor:'transparent' }}>
            Uppdatera
          </button>
        </div>
      )}

      {/* No location — auto-detecting or GPS denied */}
      {!location && !isLoading && (
        <div style={{ textAlign:'center', paddingTop:40 }}>
          <div style={{ marginBottom:10, display:'flex', justifyContent:'center' }}>
            <SvgIcon
              name="mapPoint"
              size={56}
              color={T.isDark ? '#C9A84C' : '#4a9e8e'}
            />
          </div>
          {detecting ? (
            <>
              <div style={{ fontSize:16, fontWeight:700, color:T.text, marginBottom:8 }}>Hämtar din plats…</div>
              <div style={{ display:'flex', justifyContent:'center', marginTop:12 }}>
                <div style={{ width:22, height:22, borderRadius:'50%', border:`3px solid ${T.border}`, borderTopColor:T.accent, animation:'spin .7s linear infinite' }} />
                <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
              </div>
            </>
          ) : gpsDenied ? (
            <>
              <div style={{ fontSize:18, fontWeight:700, color:T.text, marginBottom:8 }}>Platstjänster är avstängda</div>
              <div style={{ fontSize:13, color:T.textMuted, lineHeight:1.6, maxWidth:280, margin:'0 auto 6px' }}>
                Appen har inte tillåtelse att hämta din plats. Aktivera platstjänster för den här webbplatsen i telefonens inställningar.
              </div>
              <div style={{ fontSize:12, color:T.textMuted, lineHeight:1.5, maxWidth:280, margin:'0 auto 20px',
                background: T.card, borderRadius:10, padding:'10px 14px', border:`1px solid ${T.border}` }}>
                <strong style={{ color:T.text }}>iPhone:</strong> Inställningar → Sekretess → Platstjänster → Safari → Tillåt
              </div>
              <button onClick={detectLocation} style={{ padding:'11px 22px', borderRadius:13, background:'none',
                color:T.accent, fontSize:14, fontWeight:600, border:`1.5px solid ${T.accent}`, cursor:'pointer', marginBottom:10 }}>
                Försök igen
              </button>
              <div style={{ fontSize:13, color:T.textMuted, marginBottom:8 }}>eller</div>
              <button onClick={() => setShowModal(true)} style={{ padding:'12px 26px', borderRadius:13, background:T.accent,
                color:'#fff', fontSize:14, fontWeight:700, border:'none', cursor:'pointer' }}>
                Ange plats manuellt
              </button>
            </>
          ) : (
            <>
              <div style={{ fontSize:18, fontWeight:700, color:T.text, marginBottom:8 }}>Ange din plats</div>
              <div style={{ fontSize:13, color:T.textMuted, lineHeight:1.6, maxWidth:260, margin:'0 auto 20px' }}>
                Vi behöver din plats för att visa korrekta bönetider.
              </div>
              <button onClick={detectLocation} style={{ padding:'12px 26px', borderRadius:13, background:T.accent, color:'#fff', fontSize:14, fontWeight:700, border:'none', cursor:'pointer' }}>
                Hitta min plats
              </button>
            </>
          )}
        </div>
      )}

      {/* Loading: spinner only on true first load (no prayerTimes yet, no cache) */}
      {isLoading && !prayerTimes && (
        <div style={{ display:'flex', justifyContent:'center', padding:'40px 0' }}>
          <div style={{ width:24, height:24, borderRadius:'50%',
            border:`2.5px solid ${T.border}`, borderTopColor:T.accent,
            animation:'spin .7s linear infinite' }}/>
        </div>
      )}

      {/* Countdown */}
      {prayerTimes && nextPrayer && (
        <div style={{ background:T.bgSecondary, border:`1px solid ${T.border}`, borderRadius:14, padding:'12px 14px 14px', textAlign:'center', marginBottom:14, position:'relative', overflow:'hidden', flexShrink:0 }}>
          <div style={{ position:'absolute', bottom:0, left:0, right:0, height:2, background:T.accent, opacity:.5 }}/>
          <div style={{ fontSize:9, fontWeight:600, letterSpacing:'1.8px', textTransform:'uppercase', color:T.textMuted, marginBottom:4, fontFamily:"'Inter',system-ui,sans-serif" }}>
            Tid kvar till {PRAYER_SWEDISH[nextPrayer]}
          </div>
          <div style={{
            fontSize:34, fontWeight:700, color:T.text, lineHeight:1.1,
            fontFamily:"'D-DIN','Inter',system-ui,sans-serif",
            fontVariantNumeric:'tabular-nums',
            fontFeatureSettings:'"tnum" 1',
            letterSpacing:'0.02em',
            minWidth:'6ch',
            display:'inline-block',
            textAlign:'center',
          }}>
            {fmtCountdown(secondsUntil)}
          </div>
          <div style={{ fontSize:11, color:T.textMuted, marginTop:5, fontFamily:"'Inter',system-ui,sans-serif", fontWeight:400, fontVariantNumeric:'tabular-nums', fontFeatureSettings:'"tnum" 1' }}>
            {PRAYER_SWEDISH[nextPrayer]} kl. {fmt24(prayerTimes[nextPrayer])}
          </div>
        </div>
      )}

      {/* Prayer table */}
      {prayerTimes && (
        <>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
            <div style={{ fontSize:10, fontWeight:600, letterSpacing:'1.4px', textTransform:'uppercase', color:T.textMuted, fontFamily:"'Inter',system-ui,sans-serif" }}>
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
            <div style={{ fontSize:10, color:T.textMuted, fontFamily:"'Inter',system-ui,sans-serif", fontWeight:400, opacity: slideIndex===0 ? 1 : 0, transition:'opacity .2s' }}>
              ← Swipe för imorgon
            </div>
          </div>
          <PrayerTable times={activeTimes} isTomorrow={isShowingTomorrow} prayerStatus={prayerStatus} T={T} />
        </>
      )}


    </div>
  );
}
