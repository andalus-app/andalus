import React from 'react';
import { useApp } from '../context/AppContext';
import { useTheme } from '../context/ThemeContext';
import { useQibla } from '../hooks/useQibla';
import CompassSVG from './CompassSVG';

export default function QiblaScreen() {
  const { theme: T } = useTheme();
  const { location } = useApp();
  const {
    qiblaDir, heading, needleAngle, alignDelta, isAligned,
    compassAvail, loading, error, needsPermission, requestPermission,
  } = useQibla(location);

  const compassSize = Math.min(window.innerWidth - 60, 300);

  return (
    <div style={{ padding:'16px 16px 24px', background:T.bg, minHeight:'100%', display:'flex', flexDirection:'column', alignItems:'center' }}>

      {/* Header */}
      <div style={{ width:'100%', marginBottom:16 }}>
        <div style={{ fontSize:22, fontWeight:800, color:T.text, letterSpacing:'-0.3px' }}>Qibla-kompass</div>
        <div style={{ fontSize:12, color:T.textMuted, marginTop:2 }}>Riktning mot Kaba</div>
      </div>

      {/* No location */}
      {!location && (
        <div style={{ flex:1, textAlign:'center', paddingTop:40 }}>
          <div style={{ fontSize:48, marginBottom:14 }}>📍</div>
          <div style={{ fontSize:18, fontWeight:700, color:T.text, marginBottom:10 }}>Plats krävs</div>
          <div style={{ fontSize:13, color:T.textMuted, lineHeight:1.6, maxWidth:260, margin:'0 auto' }}>
            Ange din plats på Hem-sidan för att hitta Qibla-riktningen.
          </div>
        </div>
      )}

      {location && (
        <>
          {needsPermission && (
            <div style={{
              width:'100%', marginBottom:16,
              background:T.card, border:`1px solid ${T.border}`,
              borderRadius:14, padding:'16px',
            }}>
              <div style={{ fontSize:15, fontWeight:700, color:T.text, marginBottom:6 }}>🧭 Kompass-åtkomst</div>
              <div style={{ fontSize:13, color:T.textMuted, lineHeight:1.5, marginBottom:12 }}>
                För att live-kompassen ska fungera behöver appen åtkomst till enhetens rörelsesensorer. Vi frågar bara en gång.
              </div>
              <button onClick={requestPermission} style={{
                width:'100%', padding:'12px', borderRadius:11,
                background:T.accent, color:T.isDark?'#000':'#fff',
                fontSize:14, fontWeight:700, border:'none', cursor:'pointer',
              }}>Tillåt kompass</button>
            </div>
          )}

          {loading && (
            <div style={{ marginBottom:12, display:'flex', alignItems:'center', gap:10, color:T.textMuted }}>
              <div style={{ width:16, height:16, borderRadius:8, border:`2px solid ${T.border}`, borderTopColor:T.accent, animation:'spin .8s linear infinite' }}/>
              <span style={{ fontSize:13 }}>Hämtar Qibla-riktning…</span>
            </div>
          )}

          {/* Compass — heading drives ring rotation, qiblaDir places Kaaba */}
          <div style={{ marginBottom:14 }}>
            <CompassSVG
              heading={heading}
              qiblaDir={qiblaDir}
              isAligned={isAligned}
              theme={T}
              size={compassSize}
            />
          </div>

          {/* Info cards */}
          <div style={{ display:'flex', gap:8, width:'100%', marginBottom:10 }}>
            {[
              { label:'QIBLA',     val: qiblaDir   != null ? `${qiblaDir.toFixed(1)}°`    : '—', sub:'från norr',     col:T.accent },
              { label:'RIKTNING',  val: compassAvail ? `${heading.toFixed(1)}°`              : '—', sub:'din kurs',      col:T.text   },
              { label:'AVVIKELSE', val: compassAvail && qiblaDir != null ? `${alignDelta.toFixed(0)}°` : '—',
                sub: isAligned ? 'riktad!' : 'rotera',
                col: isAligned ? '#4CAF82' : alignDelta < 20 ? T.accent : T.text },
            ].map(({ label, val, sub, col }) => (
              <div key={label} style={{
                flex:1, background:T.card, border:`1px solid ${T.border}`,
                borderRadius:12, padding:'10px 6px', textAlign:'center',
              }}>
                <div style={{ fontSize:8, fontWeight:700, letterSpacing:'1px', color:T.textMuted, marginBottom:3 }}>{label}</div>
                <div style={{ fontSize:16, fontWeight:800, color:col, fontFamily:"'DM Mono','Courier New',monospace" }}>{val}</div>
                <div style={{ fontSize:10, color:T.textMuted, marginTop:2 }}>{sub}</div>
              </div>
            ))}
          </div>

          {/* Status bar */}
          <div style={{
            width:'100%', background:T.card, border:`1px solid ${T.border}`,
            borderRadius:10, padding:'8px 12px', display:'flex', alignItems:'center', gap:8,
          }}>
            <div style={{ width:7, height:7, borderRadius:4, background: compassAvail ? '#4CAF82' : T.textMuted, flexShrink:0 }}/>
            <span style={{ fontSize:11, color:T.textMuted }}>
              {compassAvail
                ? 'Live-kompass aktiv'
                : needsPermission
                  ? 'Väntar på kompass-tillstånd'
                  : 'Kompass ej tillgänglig · Visar beräknad riktning'}
            </span>
          </div>

          {error && (
            <div style={{
              width:'100%', marginTop:8, borderRadius:10, padding:'10px 12px',
              border:'1px solid rgba(240,160,0,.35)', background:'rgba(240,160,0,.08)',
              fontSize:12, color:'#F0A500', textAlign:'center',
            }}>
              ⚠️ Använder offlineberäkning (API ej tillgänglig)
            </div>
          )}

          <div style={{ display:'flex', alignItems:'center', gap:4, marginTop:10, fontSize:11, color:T.textMuted }}>
            <span>📍</span>
            <span>{location.city}{location.country ? `, ${location.country}` : ''}</span>
          </div>
        </>
      )}
    </div>
  );
}
