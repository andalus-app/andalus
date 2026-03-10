import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { useTheme } from '../context/ThemeContext';
import { fetchMonthlyTimes } from '../services/prayerApi';
import { fmt24, swedishMonthYear } from '../utils/prayerUtils';

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
      const data = await fetchMonthlyTimes(location.latitude, location.longitude, month, year, settings.calculationMethod);
      setDays(data);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [location, month, year, settings.calculationMethod]);

  useEffect(() => { load(); }, [load]);

  const prevMonth = () => { if (month===1) { setMonth(12); setYear(y=>y-1); } else setMonth(m=>m-1); };
  const nextMonth = () => { if (month===12) { setMonth(1); setYear(y=>y+1); } else setMonth(m=>m+1); };
  const isToday   = d => d === today.getDate() && month === today.getMonth()+1 && year === today.getFullYear();

  const navBtn = (label, onClick) => (
    <button onClick={onClick} style={{
      width:38, height:38, borderRadius:19, border:`1px solid ${T.border}`,
      background:'none', color:T.accent, fontSize:22, cursor:'pointer',
      display:'flex', alignItems:'center', justifyContent:'center', lineHeight:1,
      WebkitTapHighlightColor:'transparent',
    }}>{label}</button>
  );

  const PRAYERS_SV = { Fajr:'Fajr', Dhuhr:'Dhuhr', Asr:'Asr', Maghrib:'Maghrib', Isha:'Isha' };

  return (
    <div style={{ background:T.bg, minHeight:'100%' }}>
      {/* Header */}
      <div style={{ padding:'20px 16px 14px', borderBottom:`1px solid ${T.border}`, animation:'fadeUp .4s ease both' }}>
        <div style={{ fontSize:24, fontWeight:800, color:T.text, letterSpacing:'-0.4px', marginBottom:14 }}>
          Månadsöversikt
        </div>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          {navBtn('‹', prevMonth)}
          <span style={{ fontSize:16, fontWeight:700, color:T.text }}>{swedishMonthYear(month, year)}</span>
          {navBtn('›', nextMonth)}
        </div>
      </div>

      {/* No location */}
      {!location && (
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'60px 32px', gap:12 }}>
          <div style={{ fontSize:44, marginBottom:6 }}>📅</div>
          <div style={{ fontSize:18, fontWeight:700, color:T.text }}>Ingen plats vald</div>
          <div style={{ fontSize:14, color:T.textMuted, textAlign:'center', lineHeight:1.6 }}>
            Ange din plats på Hem-sidan för att se månadsöversikten.
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ display:'flex', justifyContent:'center', padding:60 }}>
          <div style={{ width:32, height:32, borderRadius:16, border:`3px solid ${T.border}`, borderTopColor:T.accent, animation:'spin .8s linear infinite' }}/>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ margin:'20px 16px', padding:'14px', borderRadius:12, border:'1px solid rgba(255,80,80,0.3)', background:'rgba(255,80,80,0.08)', color:'#FF6B6B', fontSize:14 }}>
          ⚠️ {error}
          <button onClick={load} style={{ marginLeft:10, color:T.accent, background:'none', border:'none', fontWeight:700, cursor:'pointer' }}>Försök igen</button>
        </div>
      )}

      {/* List */}
      {!loading && !error && days.length > 0 && (
        <div style={{ padding:'10px 14px 30px' }}>
          {days.map((d, i) => {
            const ht = isToday(d.gregorianDay);
            return (
              <div key={d.gregorianDay} style={{
                display:'flex', alignItems:'center', gap:10,
                padding:'10px 12px', borderRadius:13, border:'1px solid',
                marginBottom:7,
                background:ht ? T.accent : T.card,
                borderColor:ht ? T.accent : T.border,
                animation:`fadeUp .3s ${i*.012}s ease both`,
              }}>
                {/* Day number */}
                <div style={{ width:32, textAlign:'center', flexShrink:0 }}>
                  <div style={{ fontSize:18, fontWeight:800, color:ht?(T.isDark?'#0A0F2C':'#fff'):T.text, lineHeight:1 }}>
                    {d.gregorianDay}
                  </div>
                  {ht && (
                    <div style={{ fontSize:8, fontWeight:700, color:T.isDark?'rgba(10,15,44,.6)':'rgba(255,255,255,.6)', textTransform:'uppercase', letterSpacing:.5, marginTop:2 }}>
                      Idag
                    </div>
                  )}
                </div>

                {/* Prayer times */}
                <div style={{ flex:1, display:'flex', justifyContent:'space-between' }}>
                  {Object.entries(PRAYERS_SV).map(([key, sv]) => (
                    <div key={key} style={{ textAlign:'center' }}>
                      <div style={{ fontSize:8, fontWeight:700, textTransform:'uppercase', letterSpacing:.7, color:ht?(T.isDark?'rgba(10,15,44,.55)':'rgba(255,255,255,.55)'):T.textMuted, marginBottom:3 }}>
                        {sv.slice(0,3)}
                      </div>
                      <div style={{ fontSize:10, fontWeight:600, fontFamily:"'DM Mono','Courier New',monospace", color:ht?(T.isDark?'#0A0F2C':'#fff'):T.text }}>
                        {fmt24(d.timings[key])}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
