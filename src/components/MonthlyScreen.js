import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { useTheme } from '../context/ThemeContext';
import { useScrollHide } from '../hooks/useScrollHide';
import { fetchMonthlyTimes, calcMidnight } from '../services/prayerApi';
import { fmt24, swedishMonthYear } from '../utils/prayerUtils';
import { generatePrayerPdf } from '../utils/generatePrayerPdf';
import DownloadIcon from '../icons/download-svgrepo-com.svg';

const COLS = [
  { key:'Fajr',    label:'Fajr'         },
  { key:'Sunrise', label:'Shuruq'       },
  { key:'Dhuhr',   label:'Dhuhr'        },
  { key:'Asr',     label:'Asr'          },
  { key:'Maghrib', label:'Maghrib'      },
  { key:'Isha',    label:'Isha'         },
  { key:'Midnight',label:'Halva natten' },
];

export default function MonthlyScreen({ onBack }) {
  const { theme: T } = useTheme();
  const { location, settings } = useApp();
  const { visible: headerVisible, onScroll } = useScrollHide({ threshold: 40 });
  const scrollBodyRef = useRef(null);
  // iOS scroll-restore guard — tvinga scrollTop=0 vid mount
  useEffect(() => {
    const el = scrollBodyRef.current;
    if (el) {
      el.scrollTop = 0;
      requestAnimationFrame(() => { if (el) el.scrollTop = 0; });
    }
  }, []); // eslint-disable-line


  const today = new Date();

  // Edge swipe back
  useEffect(() => {
    const handler = () => onBack?.();
    window.addEventListener('edgeSwipeBack', handler);
    return () => window.removeEventListener('edgeSwipeBack', handler);
  }, [onBack]);

  const [month,      setMonth]   = useState(today.getMonth() + 1);
  const [year,       setYear]    = useState(today.getFullYear());
  const [days,       setDays]    = useState([]);
  const [loading,    setLoading] = useState(false);
  const [error,      setError]   = useState(null);
  const [slideDir,   setSlideDir] = useState(null); // 'left' | 'right' | null
  const navInProgress = useRef(false);

  const load = useCallback(async () => {
    if (!location) return;
    setLoading(true); setError(null);
    try {
      const data = await fetchMonthlyTimes(
        location.latitude, location.longitude, month, year, settings.calculationMethod, settings.school
      );
      // Enrich each day with Midnight calculated from Maghrib + next day's Fajr
      const enriched = data.map((d, i) => {
        const nextFajr = data[i + 1]?.timings?.Fajr || d.timings.Fajr;
        return {
          ...d,
          timings: { ...d.timings, Midnight: calcMidnight(d.timings.Maghrib, nextFajr) }
        };
      });
      setDays(enriched);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [location, month, year, settings.calculationMethod]);

  useEffect(() => { load(); }, [load]);

  const navigate = (dir) => {
    if (navInProgress.current) return;
    navInProgress.current = true;
    setSlideDir(dir === 'prev' ? 'right' : 'left');
    setTimeout(() => {
      if (dir === 'prev') {
        if (month===1){setMonth(12);setYear(y=>y-1);}else setMonth(m=>m-1);
      } else {
        if (month===12){setMonth(1);setYear(y=>y+1);}else setMonth(m=>m+1);
      }
      setSlideDir(null);
      navInProgress.current = false;
      if (scrollBodyRef.current) scrollBodyRef.current.scrollTop = 0;
    }, 0);
  };
  const prevMonth = () => navigate('prev');
  const nextMonth = () => navigate('next');
  const isToday   = d => d === today.getDate() && month === today.getMonth()+1 && year === today.getFullYear();

  const navBtn = (label, onClick) => (
    <button onClick={onClick} style={{
      width:36, height:36, borderRadius:18, border:`1px solid ${T.border}`,
      background:'none', color:T.accent, fontSize:20, cursor:'pointer',
      display:'flex', alignItems:'center', justifyContent:'center',
      WebkitTapHighlightColor:'transparent',
    }}>{label}</button>
  );

  const downloadPdf = useCallback(() => {
    generatePrayerPdf({ days, location, month, year });
  }, [days, location, month, year]);

  // Column widths — day col + 7 prayer cols
  const DAY_W  = 28;
  const COL_W  = `calc((100% - ${DAY_W}px) / 7)`;

  const cellStyle = (isHdr, isT) => ({
    width: COL_W, flexShrink:0, textAlign:'center',
    fontSize: isHdr ? 8 : 11,
    fontWeight: isHdr ? 700 : 600,
    fontFamily: isHdr ? 'inherit' : "'DM Mono','Courier New',monospace",
    color: isHdr
      ? T.textMuted
      : isT ? ('#fff') : T.text,
    textTransform: isHdr ? 'uppercase' : 'none',
    letterSpacing: isHdr ? .5 : 0,
    lineHeight: 1,
    padding: isHdr ? '0 1px' : 0,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
  });

  return (
    <div style={{ background:T.bg, height:'100%', display:'flex', flexDirection:'column' }}>
      <style>{`
        @keyframes msSlideIn { from { opacity:0; transform:translateX(var(--ms-from,20px)); } to { opacity:1; transform:translateX(0); } }
        @keyframes msSlideOutLeft { from { opacity:1; transform:translateX(0); } to { opacity:0; transform:translateX(-20px); } }
        @keyframes msSlideOutRight { from { opacity:1; transform:translateX(0); } to { opacity:0; transform:translateX(20px); } }
      `}</style>

      {/* Collapsible top — title + PDF button */}
      <div style={{
        flexShrink:0, padding:'0 14px',
        paddingTop: 'max(16px, env(safe-area-inset-top, 0px))',
        maxHeight: headerVisible ? 200 : 0,
        overflow: 'hidden',
        transition: 'max-height 0.28s cubic-bezier(0.4, 0, 0.2, 1), padding 0.28s',
        paddingBottom: headerVisible ? 10 : 0,
        background: T.bg, zIndex: 20,
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          {onBack && (
            <button onClick={onBack} style={{
              background:'none', border:'none', cursor:'pointer', padding:'4px 6px 4px 0',
              color:T.accent, fontSize:22, lineHeight:1, fontWeight:300,
              WebkitTapHighlightColor:'transparent',
            }}>‹</button>
          )}
          <button onClick={() => window.dispatchEvent(new CustomEvent('scrollToTop'))} style={{ background:'none', border:'none', cursor:'pointer', padding:0, flex:1, textAlign:'left', WebkitTapHighlightColor:'transparent' }}>
            <div style={{ fontSize:20, fontWeight:800, color:T.text, letterSpacing:'-0.3px' }}>Månadsöversikt</div>
          </button>
          {days.length > 0 && (
            <button onClick={downloadPdf} style={{
              display:'flex', alignItems:'center', gap:6,
              background:T.accent, border:'none', borderRadius:20,
              padding:'7px 14px', cursor:'pointer',
              WebkitTapHighlightColor:'transparent',
            }}>
              <img src={DownloadIcon} alt="" style={{ width:15, height:15, filter:'brightness(0) invert(1)' }}/>
              <span style={{ fontSize:12, fontWeight:700, color:'#fff', fontFamily:'system-ui', whiteSpace:'nowrap' }}>
                Ladda ned PDF
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Always-visible month nav bar */}
      <div style={{
        flexShrink:0, display:'flex', alignItems:'center',
        justifyContent:'space-between', padding:'8px 14px',
        borderBottom:`1px solid ${T.border}`,
        background: T.bg, zIndex: 19,
      }}>
        {navBtn('‹', prevMonth)}
        <div style={{ overflow:'hidden', height:28, flex:1, display:'flex', justifyContent:'center' }}>
          <div key={`${month}-${year}`} style={{
            fontSize:15, fontWeight:700, color:T.text, lineHeight:'28px',
            animation: slideDir
              ? (slideDir==='left'
                ? 'msSlideOutLeft 0.22s cubic-bezier(0.4,0,0.2,1) forwards'
                : 'msSlideOutRight 0.22s cubic-bezier(0.4,0,0.2,1) forwards')
              : 'msSlideIn 0.22s cubic-bezier(0.4,0,0.2,1)',
          }}>{swedishMonthYear(month, year)}</div>
        </div>
        {navBtn('›', nextMonth)}
      </div>

      {/* No location */}
      {!location && (
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', padding:'60px 32px', gap:12 }}>
          <div style={{ fontSize:44 }}>📅</div>
          <div style={{ fontSize:18, fontWeight:700, color:T.text }}>Ingen plats vald</div>
          <div style={{ fontSize:13, color:T.textMuted, textAlign:'center', lineHeight:1.6 }}>
            Ange din plats på Hem-sidan för att se månadsöversikten.
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ display:'flex', justifyContent:'center', padding:60 }}>
          <div style={{ width:30, height:30, borderRadius:15, border:`3px solid ${T.border}`, borderTopColor:T.accent, animation:'spin .8s linear infinite' }}/>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ margin:'16px', padding:14, borderRadius:12, border:'1px solid rgba(255,80,80,0.3)', background:'rgba(255,80,80,0.08)', color:'#FF6B6B', fontSize:13 }}>
          ⚠️ {error}
          <button onClick={load} style={{ marginLeft:8, color:T.accent, background:'none', border:'none', fontWeight:700, cursor:'pointer' }}>Försök igen</button>
        </div>
      )}

      {/* Scrollable table body */}
      {!loading && !error && days.length > 0 && (
        <div ref={scrollBodyRef} onScroll={onScroll}
          onTouchStart={e=>{
            const t=e.touches[0];
            scrollBodyRef._sw={x:t.clientX,y:t.clientY};
          }}
          onTouchEnd={e=>{
            const sw=scrollBodyRef._sw;
            if(!sw) return;
            const dx=e.changedTouches[0].clientX-sw.x;
            const dy=Math.abs(e.changedTouches[0].clientY-sw.y);
            scrollBodyRef._sw=null;
            if(Math.abs(dx)>60&&dy<80){
              if(dx<0) nextMonth(); else prevMonth();
            }
          }}
          style={{ flex:1, overflowY:'auto', WebkitOverflowScrolling:'touch' }}>
          {/* Sticky column header — inside scroll container so position:sticky works */}
          <div style={{
            position:'sticky', top:0, zIndex:10,
            display:'flex', alignItems:'center',
            padding:'6px 14px',
            background: 'rgba(36,100,93,0.85)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            borderBottom:'none',
          }}>
            <div style={{ width:DAY_W, flexShrink:0, fontSize:8, fontWeight:700, color:'rgba(255,255,255,0.8)', textTransform:'uppercase', letterSpacing:.5 }}>Dag</div>
            {COLS.map(c => (
              <div key={c.key} style={{...cellStyle(true, false), color:'#fff'}}>{c.label}</div>
            ))}
          </div>
          {days.map((d) => {
            const ht = isToday(d.gregorianDay);
            return (
              <div key={d.gregorianDay} style={{
                display:'flex', alignItems:'center',
                padding:'8px 14px',
                borderBottom:`1px solid ${T.border}`,
                background: ht ? T.accent : 'transparent',
              }}>
                {/* Day number */}
                <div style={{ width:DAY_W, flexShrink:0, textAlign:'center' }}>
                  <div style={{ fontSize:13, fontWeight:800, color:ht?('#fff'):T.text, lineHeight:1 }}>
                    {d.gregorianDay}
                  </div>
                  {ht && (
                    <div style={{ fontSize:7, fontWeight:700, color:T.isDark?'rgba(0,0,0,.5)':'rgba(255,255,255,.5)', textTransform:'uppercase', letterSpacing:.4, marginTop:1 }}>
                      Idag
                    </div>
                  )}
                </div>
                {/* Prayer times */}
                {COLS.map(c => (
                  <div key={c.key} style={cellStyle(false, ht)}>
                    {fmt24(d.timings[c.key])}
                  </div>
                ))}
              </div>
            );
          })}
          <div style={{ height:20 }}/>
        </div>
      )}
    </div>
  );
}
