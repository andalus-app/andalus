import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { useTheme } from '../context/ThemeContext';
import { useQibla } from '../hooks/useQibla';
import CompassSVG from './CompassSVG';

export default function QiblaScreen() {
  const { theme: T } = useTheme();
  const { location } = useApp();
  const { qiblaDir, heading, needleAngle, alignDelta, isAligned, compassAvail, loading, error } = useQibla(location);

  const [needsPermission, setNeedsPermission] = useState(false);
  useEffect(() => {
    if (typeof DeviceOrientationEvent?.requestPermission === 'function') {
      setNeedsPermission(true);
    }
  }, []);

  const requestCompassPermission = async () => {
    try {
      await DeviceOrientationEvent.requestPermission();
      setNeedsPermission(false);
      window.location.reload();
    } catch {
      alert('Kompasåtkomst nekades. Qibla-riktningen visas ändå utan live-kompass.');
    }
  };

  const animRef   = useRef(needleAngle);
  const [animVal, setAnimVal] = useState(needleAngle);
  useEffect(() => {
    let frame;
    const target = needleAngle;
    const animate = () => {
      let diff = target - animRef.current;
      if (diff > 180)  diff -= 360;
      if (diff < -180) diff += 360;
      if (Math.abs(diff) < 0.3) { animRef.current = target; setAnimVal(target); return; }
      animRef.current += diff * 0.12;
      setAnimVal(animRef.current);
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [needleAngle]);

  const compassSize = Math.min(window.innerWidth - 40, 300);

  return (
    <div style={{ padding:'20px 16px 28px', background:T.bg, minHeight:'100%', display:'flex', flexDirection:'column', alignItems:'center' }}>
      {/* Header */}
      <div style={{ width:'100%', marginBottom:20, animation:'fadeUp .4s ease both' }}>
        <div style={{ fontSize:24, fontWeight:800, color:T.text, letterSpacing:'-0.4px' }}>Qibla-kompass</div>
        <div style={{ fontSize:13, color:T.textMuted, marginTop:3 }}>Riktning mot Kaba</div>
      </div>

      {!location && (
        <div style={{ flex:1, textAlign:'center', paddingTop:40 }}>
          <div style={{ fontSize:48, marginBottom:14 }}>📍</div>
          <div style={{ fontSize:18, fontWeight:700, color:T.text, marginBottom:10 }}>Plats krävs</div>
          <div style={{ fontSize:14, color:T.textMuted, lineHeight:1.6, maxWidth:260, margin:'0 auto' }}>
            Ange din plats på Hem-sidan för att hitta Qibla-riktningen.
          </div>
        </div>
      )}

      {location && (
        <>
          {needsPermission && (
            <div style={{ width:'100%', marginBottom:14 }}>
              <button onClick={requestCompassPermission} style={{
                width:'100%', padding:'13px', borderRadius:13,
                background:T.accent, color:T.isDark?'#0A0F2C':'#fff',
                fontSize:15, fontWeight:700, border:'none', cursor:'pointer',
              }}>
                🧭 Aktivera live-kompass
              </button>
            </div>
          )}

          {loading && (
            <div style={{ marginBottom:14, display:'flex', alignItems:'center', gap:10, color:T.textMuted }}>
              <div style={{ width:18, height:18, borderRadius:9, border:`2px solid ${T.border}`, borderTopColor:T.accent, animation:'spin .8s linear infinite' }}/>
              <span style={{ fontSize:14 }}>Hämtar Qibla-riktning…</span>
            </div>
          )}

          {/* Compass */}
          <div style={{
            filter:`drop-shadow(0 8px 30px ${isAligned ? 'rgba(76,175,130,.5)' : T.accentGlow})`,
            marginBottom:16, transition:'filter .6s',
          }}>
            <CompassSVG animNeedle={animVal} isAligned={isAligned} theme={T} size={compassSize} />
          </div>

          {/* Aligned badge */}
          <div style={{ height:40, display:'flex', alignItems:'center', justifyContent:'center', marginBottom:14 }}>
            {isAligned ? (
              <div style={{
                display:'flex', alignItems:'center', gap:8,
                padding:'8px 20px', borderRadius:100,
                background:'rgba(76,175,130,.12)', border:'1.5px solid #4CAF82',
                animation:'pop .3s cubic-bezier(.34,1.56,.64,1) both',
              }}>
                <span style={{ fontSize:15 }}>✅</span>
                <span style={{ fontSize:14, fontWeight:700, color:'#4CAF82' }}>Du vänder dig mot Qibla</span>
              </div>
            ) : (
              <div style={{ fontSize:13, color:T.textMuted, fontStyle:'italic', textAlign:'center' }}>
                {qiblaDir !== null ? `Vänd mot ${qiblaDir.toFixed(1)}° från norr · ${alignDelta.toFixed(0)}° kvar` : 'Beräknar…'}
              </div>
            )}
          </div>

          {/* Info cards */}
          <div style={{ display:'flex', gap:10, width:'100%', marginBottom:12 }}>
            {[
              { label:'QIBLA',    val: qiblaDir     !== null ? `${qiblaDir.toFixed(1)}°`    : '—', sub:'från norr',     col:T.accent },
              { label:'RIKTNING', val: compassAvail ? `${heading.toFixed(1)}°` : '—',               sub:'enhetens kurs', col:T.text },
              { label:'AVVIKELSE',val: compassAvail && qiblaDir !== null ? `${alignDelta.toFixed(0)}°` : '—', sub:isAligned?'riktad!':'rotera', col:isAligned?'#4CAF82':alignDelta<20?T.accent:T.text },
            ].map(({ label, val, sub, col }) => (
              <div key={label} style={{
                flex:1, background:T.card, border:`1px solid ${T.border}`,
                borderRadius:14, padding:'12px 6px', textAlign:'center',
              }}>
                <div style={{ fontSize:8, fontWeight:700, letterSpacing:'1px', color:T.textMuted, marginBottom:4 }}>{label}</div>
                <div style={{ fontSize:17, fontWeight:800, color:col, fontFamily:"'DM Mono','Courier New',monospace" }}>{val}</div>
                <div style={{ fontSize:10, color:T.textMuted, marginTop:3 }}>{sub}</div>
              </div>
            ))}
          </div>

          {/* Status */}
          <div style={{
            width:'100%', background:T.card, border:`1px solid ${T.border}`,
            borderRadius:10, padding:'9px 12px', display:'flex', alignItems:'center', gap:8, marginBottom:10,
          }}>
            <div style={{ width:8, height:8, borderRadius:4, background: compassAvail ? '#4CAF82' : T.textMuted, flexShrink:0 }}/>
            <span style={{ fontSize:12, color:T.textMuted, fontWeight:500 }}>
              {compassAvail ? 'Live-kompass aktiv' : 'Kompass ej tillgänglig · Visar beräknad riktning'}
            </span>
          </div>

          {error && (
            <div style={{
              width:'100%', borderRadius:11, padding:'12px', border:'1px solid rgba(240,160,0,.35)',
              background:'rgba(240,160,0,.08)', fontSize:13, color:'#F0A500', textAlign:'center', marginBottom:10,
            }}>
              ⚠️ Använder offlineberäkning (API ej tillgänglig)
            </div>
          )}

          {!compassAvail && (
            <div style={{
              width:'100%', background:T.card, border:`1px solid ${T.border}`,
              borderRadius:11, padding:'12px', fontSize:13, color:T.textMuted, lineHeight:1.6, textAlign:'center',
            }}>
              📱 Kompass kräver en mobil enhet med rörelsesensorer.<br/>
              Pilen visar din beräknade Qibla-riktning.
            </div>
          )}

          <div style={{ display:'flex', alignItems:'center', gap:5, marginTop:10, fontSize:12, color:T.textMuted }}>
            <span>📍</span>
            <span>{location.city}{location.country ? `, ${location.country}` : ''}</span>
          </div>
        </>
      )}
    </div>
  );
}
