import React, { useState, useEffect, useRef} from 'react';
import { useApp } from '../context/AppContext';
import { useTheme } from '../context/ThemeContext';
import { useScrollHide } from '../hooks/useScrollHide';
import { CALC_METHODS } from '../utils/prayerUtils';
import { searchCity, reverseGeocode } from '../services/prayerApi';
import SvgIcon from './SvgIcon';

const SCHOOLS = { 0: "Standard (Shafi'i)", 1: 'Hanafi' };

// ── Standalone modal — defined OUTSIDE component so React never remounts it ──
function ModalSheet({ title, onClose, children, T, topContent }) {
  // Lock body scroll when open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  return (
    <div
      style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.65)', zIndex:9999,
        display:'flex', alignItems:'flex-end', justifyContent:'center' }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
      onTouchStart={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background:T.bgSecondary, borderRadius:'22px 22px 0 0', width:'100%', maxWidth:500,
        /* Fixed height — never jumps */
        height:'72dvh', display:'flex', flexDirection:'column',
        animation:'fadeUp .25s ease both',
      }}
        onMouseDown={e => e.stopPropagation()}
        onTouchStart={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div style={{ flexShrink:0, padding:'14px 18px 0' }}>
          <div style={{ width:36, height:4, borderRadius:2, background:T.border, margin:'0 auto 14px' }}/>
          <div style={{ fontSize:19, fontWeight:700, color:T.text, marginBottom:12,
            fontFamily:"'Inter',system-ui,sans-serif" }}>{title}</div>
          {/* Sticky top content (search input etc) */}
          {topContent && (
            <div style={{ marginBottom:8 }}>{topContent}</div>
          )}
        </div>
        {/* Scrollable content */}
        <div style={{ flex:1, overflowY:'auto', WebkitOverflowScrolling:'touch', padding:'0 18px' }}>
          {children}
        </div>
        {/* Avbryt */}
        <div style={{ flexShrink:0, padding:'10px 18px max(20px,env(safe-area-inset-bottom))' }}>
          <button onClick={onClose} style={{
            width:'100%', padding:'14px', borderRadius:12, border:`1px solid ${T.border}`,
            background:'none', color:T.textMuted, fontSize:15, fontWeight:600, cursor:'pointer',
            fontFamily:"'Inter',system-ui,sans-serif",
            WebkitTapHighlightColor:'transparent',
          }}>Avbryt</button>
        </div>
      </div>
    </div>
  );
}

export default function SettingsScreen({ onBack }) {
  const { theme: T, mode, setMode } = useTheme();
  const scrollRef = useRef(null);
  // iOS scroll-restore guard — tvinga scrollTop=0 vid mount
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = 0;
      requestAnimationFrame(() => { if (el) el.scrollTop = 0; });
    }
  }, []); // eslint-disable-line

  const { location, settings, dispatch } = useApp();
  const { visible: headerVisible, onScroll } = useScrollHide({ threshold: 40 });

  const [cityModal,   setCityModal]   = useState(false);
  const [methodModal, setMethodModal] = useState(false);
  const [schoolModal, setSchoolModal] = useState(false);
  const [query,       setQuery]       = useState('');
  const [results,     setResults]     = useState([]);
  const [searching,   setSearching]   = useState(false);
  const [detecting,   setDetecting]   = useState(false);

  // Edge swipe back
  useEffect(() => {
    if (!onBack) return;
    const handler = () => onBack();
    window.addEventListener('edgeSwipeBack', handler);
    return () => window.removeEventListener('edgeSwipeBack', handler);
  }, [onBack]);

  const doSearch = async (q = query) => {
    if (!q.trim()) { setResults([]); return; }
    setSearching(true);
    try { setResults(await searchCity(q)); }
    catch { setResults([]); }
    finally { setSearching(false); }
  };

  // Instant search as user types — debounced 350ms
  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const timer = setTimeout(() => doSearch(query), 250);
    return () => clearTimeout(timer);
  }, [query]); // eslint-disable-line

  const detectLocation = () => {
    if (!navigator.geolocation) return alert('Platsåtkomst ej tillgänglig');
    setDetecting(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        try {
          const geo = await reverseGeocode(latitude, longitude);
          dispatch({ type:'SET_LOCATION', payload:{ latitude, longitude, ...geo } });
        } catch {
          dispatch({ type:'SET_LOCATION', payload:{ latitude, longitude, city:'Okänd', country:'' } });
        }
        finally { setDetecting(false); }
      },
      () => { alert('Kunde inte hitta plats.'); setDetecting(false); }
    );
  };

  const selectCity = (loc) => {
    dispatch({ type:'SET_LOCATION', payload:loc });
    setCityModal(false); setQuery(''); setResults([]);
  };

  const themeOptions = [
    { l:'Mörkt',  iconName:'moon',       v:'dark'   },
    { l:'Ljust',  iconName:'sun',        v:'light'  },
    { l:'System', iconName:'smartphone', v:'system' },
  ];

  const rowStyle = {
    display:'flex', alignItems:'center', justifyContent:'space-between',
    padding:'14px 16px', borderRadius:14, border:`1px solid ${T.border}`,
    background:T.card, marginBottom:8, cursor:'pointer',
    WebkitTapHighlightColor:'transparent',
  };

  const Row = ({ iconName, label, value, onClick, right }) => (
    <div onClick={onClick} style={{ ...rowStyle, cursor: onClick ? 'pointer' : 'default' }}>
      <div style={{ display:'flex', alignItems:'center', gap:12 }}>
        <SvgIcon name={iconName} size={24} color={T.textMuted} />
        <div>
          <div style={{ fontSize:15, fontWeight:600, color:T.text,
            fontFamily:"'Inter',system-ui,sans-serif" }}>{label}</div>
          {value && <div style={{ fontSize:12, color:T.textMuted, marginTop:2,
            fontFamily:"'Inter',system-ui,sans-serif" }}>{value}</div>}
        </div>
      </div>
      {right || (onClick && <span style={{ color:T.textMuted, fontSize:22, lineHeight:1 }}>›</span>)}
    </div>
  );

  const SectionLabel = ({ label }) => (
    <div style={{ fontSize:11, fontWeight:700, letterSpacing:'1.4px', textTransform:'uppercase',
      color:T.textMuted, marginBottom:10, marginTop:22, marginLeft:2,
      fontFamily:"'Inter',system-ui,sans-serif" }}>
      {label}
    </div>
  );

  const Toggle = ({ on, onToggle }) => (
    <div onClick={e => { e.stopPropagation(); onToggle(); }} style={{
      width:50, height:28, borderRadius:14, cursor:'pointer', transition:'background .25s',
      background: on ? T.accent : T.border, position:'relative', flexShrink:0,
    }}>
      <div style={{
        position:'absolute', top:3, left: on ? 25 : 3, width:22, height:22,
        borderRadius:11, background:'#fff', transition:'left .25s',
        boxShadow:'0 2px 5px rgba(0,0,0,.25)',
      }}/>
    </div>
  );

  return (
    <div ref={scrollRef} onScroll={onScroll} style={{ background:T.bg, minHeight:'100%', fontFamily:"'Inter',system-ui,sans-serif" }}>

      {/* Sticky header */}
      <div style={{
        position:'sticky', top:0, zIndex:20, background:T.bg,
        borderBottom:`1px solid ${T.border}`,
        display:'flex', alignItems:'center', gap:8,
        paddingTop:'max(16px,env(safe-area-inset-top))',paddingLeft:'16px',paddingRight:'16px',paddingBottom:'12px',
        maxHeight: headerVisible ? 300 : 0,
        overflow: 'hidden',
        transition: 'max-height 0.28s cubic-bezier(0.4, 0, 0.2, 1)',
      }}>
        {onBack && (
          <button onClick={onBack} style={{
            background:'none', border:'none', cursor:'pointer', padding:'4px 8px 4px 0',
            color:T.accent, fontSize:22, lineHeight:1, fontWeight:300,
            WebkitTapHighlightColor:'transparent',
          }}>‹</button>
        )}
        <button onClick={() => window.dispatchEvent(new CustomEvent('scrollToTop'))} style={{ background:'none', border:'none', cursor:'pointer', padding:0, WebkitTapHighlightColor:'transparent' }}>
          <div style={{ fontSize:22, fontWeight:800, color:T.text, letterSpacing:'-0.4px' }}>Inställningar</div>
        </button>
      </div>

      <div style={{ padding:'20px 16px 50px', animation:'fadeUp .4s ease both' }}>

      {/* PLATS */}
      <SectionLabel label="Plats" />
      <Row iconName="mapArrow" label="Automatisk plats"
        value={settings.autoLocation ? 'Uppdateras automatiskt via GPS' : 'Manuell'}
        right={<Toggle on={settings.autoLocation} onToggle={() =>
          dispatch({ type:'SET_SETTINGS', payload:{ autoLocation: !settings.autoLocation } })} />}
      />
      <Row iconName="mapPoint" label="Nuvarande stad"
        value={location ? location.city : 'Ej angiven'}
        onClick={() => setCityModal(true)} />
      {!settings.autoLocation && (
        <Row iconName="mapArrow" label="Hämta min position nu"
          value={detecting ? 'Söker…' : 'Tryck för att uppdatera med GPS'}
          onClick={!detecting ? detectLocation : undefined}
          right={detecting
            ? <div style={{ width:18, height:18, borderRadius:9, border:`2px solid ${T.border}`,
                borderTopColor:T.accent, animation:'spin .8s linear infinite' }}/>
            : undefined}
        />
      )}

      {/* BÖNETIDER */}
      <SectionLabel label="Bönetider" />
      <Row iconName="ruler" label="Beräkningsmetod"
        value={CALC_METHODS[settings.calculationMethod]}
        onClick={() => setMethodModal(true)} />
      <Row iconName="book" label="Rättsskola"
        value={settings.school === 0 ? "Standard (Shafi'i, Maliki, Hanbali)" : "Hanafi"}
        onClick={() => setSchoolModal(true)} />

      {/* AVISERINGAR */}
      <SectionLabel label="Aviseringar" />
      <Row
        iconName={settings.notificationsEnabled ? 'bell' : 'bellOff'}
        label="Böne-påminnelser"
        value="Avisering vid varje bönetid"
        right={<Toggle on={settings.notificationsEnabled} onToggle={() =>
          dispatch({ type:'SET_SETTINGS', payload:{ notificationsEnabled:!settings.notificationsEnabled } })} />}
      />

      {/* UTSEENDE */}
      <SectionLabel label="Utseende" />
      <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:14,
        padding:'14px', marginBottom:8 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
          <SvgIcon name="theme" size={18} color={T.textMuted} />
          <span style={{ fontSize:15, fontWeight:600, color:T.text }}>Tema</span>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          {themeOptions.map(({ l, iconName, v }) => {
            const active = mode === v;
            return (
              <button key={v} onClick={() => setMode(v)} style={{
                flex:1, padding:'11px 0', borderRadius:10, cursor:'pointer',
                background:active?T.accent:T.bgSecondary, border:`1px solid ${active?T.accent:T.border}`,
                display:'flex', flexDirection:'column', alignItems:'center', gap:6,
                transition:'all .2s', fontFamily:"'Inter',system-ui,sans-serif",
                WebkitTapHighlightColor:'transparent',
              }}>
                <SvgIcon name={iconName} size={18} color={active?('#fff'):T.text} />
                <span style={{ fontSize:12, fontWeight:600,
                  color:active?('#fff'):T.text }}>{l}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* OM APPEN */}
      <SectionLabel label="Om appen" />
      <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:14, padding:16 }}>
        <div style={{ fontSize:14, color:T.textMuted, lineHeight:'22px' }}>
          <strong style={{ color:T.text }}>Bönetider</strong> — Bönetider & Qibla-kompass<br/>
          <span style={{ opacity:.7 }}>Version 1.2.0</span><br/>
          <span style={{ opacity:.55, fontSize:12 }}>
            © {new Date().getFullYear()} Fatih Köker. Alla rättigheter förbehållna.
          </span>
        </div>
      </div>

      {/* ── MODALER ── */}

      {cityModal && (
        <ModalSheet T={T} title="Byt stad"
          onClose={() => { setCityModal(false); setQuery(''); setResults([]); }}
          topContent={
            <div>
              {location?.city && (
                <div style={{ fontSize:12, color:T.textMuted, marginBottom:8, fontFamily:"'Inter',system-ui,sans-serif" }}>
                  Nuvarande: <span style={{ color:T.accent, fontWeight:600 }}>{location.city}{location.country ? `, ${location.country}` : ''}</span>
                </div>
              )}
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <input value={query} onChange={e => setQuery(e.target.value)}
                  onKeyDown={e => e.key==='Enter' && doSearch()}
                  placeholder="Sök stad…" autoFocus
                  style={{ flex:1, padding:'12px 14px', borderRadius:10,
                    border:`1px solid ${T.border}`, background:T.card, color:T.text,
                    fontSize:16, fontFamily:"'Inter',system-ui,sans-serif",
                    outline:'none' }}/>
                {searching && (
                  <div style={{width:18,height:18,flexShrink:0,borderRadius:'50%',border:`2px solid ${T.border}`,borderTopColor:T.accent,animation:'spin .7s linear infinite'}}/>
                )}
              </div>
            </div>
          }
        >
          {results.length === 0 && !searching && query.trim().length > 0 && (
            <div style={{ padding:'20px 0', textAlign:'center', color:T.textMuted, fontSize:14, fontFamily:"'Inter',system-ui,sans-serif" }}>
              Inga träffar för "{query}"
            </div>
          )}
          {results.map((r, i) => (
            <div key={i} onClick={() => selectCity(r)}
              style={{ padding:'12px 4px', borderBottom:`1px solid ${T.border}`, cursor:'pointer' }}>
              <div style={{ fontSize:15, fontWeight:600, color:T.text }}>
                {r.city}{r.country ? `, ${r.country}` : ''}
              </div>
              <div style={{ fontSize:12, color:T.textMuted, marginTop:2 }}>
                {r.latitude.toFixed(3)}, {r.longitude.toFixed(3)}
              </div>
            </div>
          ))}
        </ModalSheet>
      )}

      {methodModal && (
        <ModalSheet T={T} title="Beräkningsmetod" onClose={() => setMethodModal(false)}
          topContent={
            <div style={{ fontSize:12, color:T.textMuted, fontFamily:"'Inter',system-ui,sans-serif", marginBottom:4 }}>
              Nuvarande: <span style={{ color:T.accent, fontWeight:600 }}>{CALC_METHODS[settings.calculationMethod]}</span>
            </div>
          }
        >
          {Object.entries(CALC_METHODS).map(([key, name]) => {
            const active = settings.calculationMethod === parseInt(key);
            return (
              <div key={key}
                onClick={() => {
                  dispatch({ type:'SET_SETTINGS', payload:{ calculationMethod:parseInt(key) } });
                  setMethodModal(false);
                }}
                style={{
                  padding:'13px 12px', borderBottom:`1px solid ${T.border}`, cursor:'pointer',
                  display:'flex', justifyContent:'space-between', alignItems:'center',
                  background:active?`${T.accent}18`:'none', borderRadius:active?10:0,
                }}>
                <span style={{ fontSize:14, fontWeight:600, color:T.text }}>{name}</span>
                {active && <span style={{ color:T.accent, fontSize:18, fontWeight:700 }}>✓</span>}
              </div>
            );
          })}
        </ModalSheet>
      )}

      {schoolModal && (
        <ModalSheet T={T} title="Rättsskola" onClose={() => setSchoolModal(false)}
          topContent={
            <div style={{ fontSize:12, color:T.textMuted, fontFamily:"'Inter',system-ui,sans-serif", marginBottom:4 }}>
              Nuvarande: <span style={{ color:T.accent, fontWeight:600 }}>{SCHOOLS[settings.school]}</span>
            </div>
          }
        >
          <div style={{ fontSize:13, color:T.textMuted, marginBottom:14, lineHeight:1.6 }}>
            Påverkar beräkningen av Asr-bönen. Välj enligt din madhab.
          </div>
          {[
            { v:0, label:'Standard', sub:"Shafi'i, Maliki, Hanbali" },
            { v:1, label:'Hanafi',   sub:'Asr när skuggan är dubbelt så lång' },
          ].map(({ v, label, sub }) => {
            const active = settings.school === v;
            return (
              <div key={v}
                onClick={() => {
                  dispatch({ type:'SET_SETTINGS', payload:{ school: v } });
                  setSchoolModal(false);
                }}
                style={{
                  padding:'14px 12px', borderBottom:`1px solid ${T.border}`, cursor:'pointer',
                  display:'flex', justifyContent:'space-between', alignItems:'center',
                  background:active?`${T.accent}18`:'none', borderRadius:active?10:0,
                }}>
                <div>
                  <div style={{ fontSize:15, fontWeight:600, color:T.text }}>{label}</div>
                  <div style={{ fontSize:12, color:T.textMuted, marginTop:2 }}>{sub}</div>
                </div>
                {active && <span style={{ color:T.accent, fontSize:20, fontWeight:700 }}>✓</span>}
              </div>
            );
          })}
        </ModalSheet>
      )}
    </div>
    </div>
  );
}