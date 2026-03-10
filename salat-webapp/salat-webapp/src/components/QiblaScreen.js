import React from 'react';
import { useApp } from '../context/AppContext';
import { useTheme } from '../context/ThemeContext';
import { useQibla } from '../hooks/useQibla';
import CompassSVG from './CompassSVG';
import SvgIcon from './SvgIcon';

export default function QiblaScreen() {
  const { theme: T } = useTheme();
  const { location } = useApp();
  const {
    qiblaDir, heading, alignDelta, isAligned,
    compassAvail, loading, error, needsPermission, requestPermission,
  } = useQibla(location);

  const compassSize = Math.min(window.innerWidth - 32, 320);

  // Direction hint: which way to rotate
  const getHint = () => {
    if (!compassAvail || qiblaDir == null) return null;
    if (isAligned) return null;
    // Delta signed: positive = rotate right, negative = rotate left
    let diff = qiblaDir - ((heading % 360 + 360) % 360);
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;
    if (diff > 0) return 'Rotera åt höger för att rikta dig mot Qibla.';
    return 'Rotera åt vänster för att rikta dig mot Qibla.';
  };

  const hint = getHint();

  return (
    <div style={{ padding:'16px 16px 24px', background:T.bg, minHeight:'100%', display:'flex', flexDirection:'column', alignItems:'center', fontFamily:"'Inter',system-ui,sans-serif" }}>

      {/* No location */}
      {!location && (
        <div style={{ flex:1, textAlign:'center', paddingTop:60 }}>
          <div style={{ fontSize:48, marginBottom:14 }}>📍</div>
          <div style={{ fontSize:18, fontWeight:700, color:T.text, marginBottom:10 }}>Plats krävs</div>
          <div style={{ fontSize:13, color:T.textMuted, lineHeight:1.6, maxWidth:260, margin:'0 auto' }}>
            Ange din plats på Hem-sidan för att hitta Qibla-riktningen.
          </div>
        </div>
      )}

      {location && (
        <>
          {/* Permission prompt */}
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

          {/* Compass */}
          <div style={{ width:compassSize, height:compassSize, flexShrink:0 }}>
            <CompassSVG
              heading={heading}
              qiblaDir={qiblaDir}
              isAligned={isAligned}
              alignDelta={alignDelta}
              theme={T}
              size={compassSize}
            />
          </div>

          {/* Big heading + direction text — like reference image */}
          <div style={{ textAlign:'center', marginTop:24, marginBottom:4 }}>
            <div style={{ fontSize:52, fontWeight:800, color:'#fff', lineHeight:1, letterSpacing:'-1px' }}>
              {Math.round(((heading % 360) + 360) % 360)}°{' '}
              {(() => {
                const h = Math.round(((heading % 360) + 360) % 360);
                return ['N','NÖ','Ö','SÖ','S','SV','V','NV'][Math.round(h/45)%8];
              })()}
            </div>
            <div style={{ fontSize:13, color:'rgba(255,255,255,0.45)', marginTop:6 }}>
              Qiblas riktning är{' '}
              <strong style={{ color:'rgba(255,255,255,0.75)' }}>
                {qiblaDir != null ? `${Math.round(qiblaDir)} °` : '—'}
              </strong>
            </div>
          </div>

          {/* Aligned or rotation hint */}
          <div style={{ minHeight:32, textAlign:'center', marginTop:6 }}>
            {isAligned ? (
              <div style={{ fontSize:17, fontWeight:700, color:'#4CAF82' }}>
                Du är vänd mot rätt håll.
              </div>
            ) : hint ? (
              <div style={{ fontSize:15, fontWeight:500, color:'rgba(255,255,255,0.75)' }}>
                {hint}
              </div>
            ) : null}
          </div>

          {/* Location with moon icon */}
          <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:16, opacity:.55 }}>
            <SvgIcon name="moon" size={13} color={T.textMuted} />
            <span style={{ fontSize:12, color:T.textMuted }}>
              {location.city}{location.country ? `, ${location.country}` : ''}
            </span>
          </div>

          {/* Live indicator */}
          <div style={{ display:'flex', alignItems:'center', gap:5, marginTop:8 }}>
            <div style={{ width:6, height:6, borderRadius:3, background: compassAvail ? '#4CAF82' : T.textMuted }}/>
            <span style={{ fontSize:11, color:T.textMuted }}>
              {compassAvail ? 'Live-kompass aktiv' : 'Kompass ej tillgänglig'}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
