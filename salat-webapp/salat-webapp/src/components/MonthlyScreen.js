import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { useTheme } from '../context/ThemeContext';
import { fetchMonthlyTimes, calcMidnight } from '../services/prayerApi';
import { fmt24, swedishMonthYear } from '../utils/prayerUtils';

const COLS = [
  { key:'Fajr',    label:'Fajr'         },
  { key:'Sunrise', label:'Shuruq'       },
  { key:'Dhuhr',   label:'Dhuhr'        },
  { key:'Asr',     label:'Asr'          },
  { key:'Maghrib', label:'Maghrib'      },
  { key:'Isha',    label:'Isha'         },
  { key:'Midnight',label:'Halva natten' },
];

export default function MonthlyScreen() {
  const { theme: T } = useTheme();
  const { location, settings } = useApp();

  const today = new Date();
  const [month,   setMonth]   = useState(today.getMonth() + 1);
  const [year,    setYear]    = useState(today.getFullYear());
  const [days,    setDays]    = useState([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

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

  const prevMonth = () => { if (month===1){setMonth(12);setYear(y=>y-1);}else setMonth(m=>m-1); };
  const nextMonth = () => { if (month===12){setMonth(1);setYear(y=>y+1);}else setMonth(m=>m+1); };
  const isToday   = d => d === today.getDate() && month === today.getMonth()+1 && year === today.getFullYear();

  const navBtn = (label, onClick) => (
    <button onClick={onClick} style={{
      width:36, height:36, borderRadius:18, border:`1px solid ${T.border}`,
      background:'none', color:T.accent, fontSize:20, cursor:'pointer',
      display:'flex', alignItems:'center', justifyContent:'center',
      WebkitTapHighlightColor:'transparent',
    }}>{label}</button>
  );

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
      : isT ? (T.isDark?'#000':'#fff') : T.text,
    textTransform: isHdr ? 'uppercase' : 'none',
    letterSpacing: isHdr ? .5 : 0,
    lineHeight: 1,
    padding: isHdr ? '0 1px' : 0,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
  });

  return (
    <div style={{ background:T.bg, height:'100%', display:'flex', flexDirection:'column' }}>

      {/* Fixed top header */}
      <div style={{ flexShrink:0, padding:'16px 14px 10px', borderBottom:`1px solid ${T.border}` }}>
        <div style={{ fontSize:20, fontWeight:800, color:T.text, letterSpacing:'-0.3px', marginBottom:10 }}>
          Månadsöversikt
        </div>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          {navBtn('‹', prevMonth)}
          <span style={{ fontSize:15, fontWeight:700, color:T.text }}>{swedishMonthYear(month, year)}</span>
          {navBtn('›', nextMonth)}
        </div>
      </div>

      {/* Sticky table header */}
      {days.length > 0 && (
        <div style={{
          flexShrink:0, display:'flex', alignItems:'center',
          padding:'6px 14px',
          background:T.bgSecondary,
          borderBottom:`1px solid ${T.border}`,
          position:'sticky', top:0, zIndex:10,
        }}>
          {/* Day col */}
          <div style={{ width:DAY_W, flexShrink:0, fontSize:8, fontWeight:700, color:T.textMuted, textTransform:'uppercase', letterSpacing:.5 }}>Dag</div>
          {COLS.map(c => (
            <div key={c.key} style={cellStyle(true, false)}>{c.label}</div>
          ))}
        </div>
      )}

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
        <div style={{ flex:1, overflowY:'auto', WebkitOverflowScrolling:'touch' }}>
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
                  <div style={{ fontSize:13, fontWeight:800, color:ht?(T.isDark?'#000':'#fff'):T.text, lineHeight:1 }}>
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
