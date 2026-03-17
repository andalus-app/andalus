import React, { useEffect, useRef } from 'react';
import { useTheme } from '../context/ThemeContext';
import { useScrollHide } from '../hooks/useScrollHide';
import IslamNuLogoTeal from '../icons/islamnu-logga-light.svg';

const SECTIONS = [
  {
    title: 'Om oss',
    body: 'Islam.nu har varit verksamma snart två årtionden med att sprida kunskap inom islam baserat på klassiskt sunnitisk troslära och de fyra erkända rättskolorna. Islam.nu drivs av sakkunniga experter med högskoleutbildning inom islamisk teologi och rättslära. En mycket stor del i vårt arbete är hemsidan www.islam.nu och dess tillhörande sociala medier.',
  },
  {
    title: 'Vårt arbete',
    body: 'Vi arbetar främst med att informera om och lära ut islam på olika plattformar till muslimer och icke-muslimer över hela Sverige. Vi arbetar med sociala insatser och arbetar mot utanförskap, kriminalitet och all form av extremism.\n\nVi arbetar främst i Stockholmsområdet men reser även regelbundet till många andra städer för att undervisa, ge råd och stötta olika lokala moskéer. Även lokalpoliser, fältassistenter, kommuner, fritidsgårdar, gymnasier och högskolor har bjudit in oss att föreläsa eller ta del av vår expertis och erfarenhet i dessa frågor.',
  },
  {
    title: 'Helt fristående och oberoende',
    body: 'Vi har valt att arbeta helt ideellt av många anledningar. Vi tar inte stöd från varken den svenska staten eller någon annan stat och har aldrig gjort det. Inte för att det är fel i sig, utan för att vi värnar om vår integritet, självständighet och absoluta oberoende. Vill någon inom ramen för dessa premisser stödja oss är de mer än varmt välkomna. Vi är helt politiskt obundna och kommer alltid vara det.',
  },
];

export default function AboutScreen({ onBack }) {
  const { theme: T } = useTheme();
  const scrollRef = useRef(null);
  // iOS scroll-restore guard — tvinga scrollTop=0 vid mount
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = 0;
      requestAnimationFrame(() => { if (el) el.scrollTop = 0; });
    }
  }, []); // eslint-disable-line

  const { visible: headerVisible, onScroll } = useScrollHide({ threshold: 40 });

  useEffect(() => {
    if (!onBack) return;
    const handler = () => onBack();
    window.addEventListener('edgeSwipeBack', handler);
    return () => window.removeEventListener('edgeSwipeBack', handler);
  }, [onBack]);

  return (
    <div ref={scrollRef} onScroll={onScroll} style={{ background: T.bg, minHeight: '100%', fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '16px 16px 12px',
        paddingTop: 'max(16px, env(safe-area-inset-top))',
        borderBottom: `1px solid ${T.border}`,
        position: 'sticky', top: 0, background: T.bg, zIndex: 10,
        maxHeight: headerVisible ? 300 : 0,
        overflow: 'hidden',
        transition: 'max-height 0.28s cubic-bezier(0.4, 0, 0.2, 1)',
      }}>
        <button onClick={onBack} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          padding: '4px 8px 4px 0', color: T.accent, fontSize: 22,
          lineHeight: 1, fontWeight: 300, WebkitTapHighlightColor: 'transparent',
        }}>‹</button>
        <button onClick={() => window.dispatchEvent(new CustomEvent('scrollToTop'))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, WebkitTapHighlightColor: 'transparent' }}><div style={{ fontSize: 19, fontWeight: 800, color: T.text, letterSpacing: '-.3px' }}>Om oss</div></button>
      </div>

      {/* Logo hero */}
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: '32px 16px 24px',
        background: `linear-gradient(180deg, ${T.accent}18 0%, transparent 100%)`,
        borderBottom: `1px solid ${T.border}`,
      }}>
        <img src={IslamNuLogoTeal} alt="islam.nu" style={{ width: 90, height: 90, objectFit: 'contain' }} />
        <div style={{ fontSize: 22, fontWeight: 800, color: T.text, marginTop: 12 }}>islam.nu</div>
        <div style={{ fontSize: 13, color: T.textMuted, marginTop: 4 }}>Kunskap baserad på tradition</div>
      </div>

      {/* Sections */}
      <div style={{ padding: '24px 20px 48px', display: 'flex', flexDirection: 'column', gap: 28 }}>
        {SECTIONS.map((s, i) => (
          <div key={i}>
            <div style={{
              fontSize: 10, fontWeight: 700, color: T.accent,
              textTransform: 'uppercase', letterSpacing: 1.4,
              marginBottom: 10,
            }}>{s.title}</div>
            {s.body.split('\n\n').map((para, j) => (
              <p key={j} style={{
                fontSize: 15, lineHeight: 1.8, color: T.textSecondary,
                margin: j > 0 ? '12px 0 0' : 0,
              }}>{para}</p>
            ))}
          </div>
        ))}

        {/* Charity icon — inlined SVG so no white background in dark mode */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0' }}>
          <svg width="80" height="80" viewBox="0 0 502 502" xmlns="http://www.w3.org/2000/svg" color="#000000">
            <g>
              <path fill="#8A501F" d="M39.938,163.295l20.536,20.536l32.541,32.541c5.322,5.322,13.95,5.322,19.272,0c5.322-5.322,5.322-13.95,0-19.272l31.909,31.909c5.322,5.322,13.95,5.322,19.272,0l0,0c5.322-5.322,5.322-13.95,0-19.272l9.636,9.636c5.322,5.322,13.95,5.322,19.272,0s5.322-13.95,0-19.272l-15.639-15.639c5.322,5.322,13.95,5.322,19.272,0l0,0c5.322-5.322,5.322-13.95,0-19.272l-57.782-57.782l-0.063-0.2l24.04,3.957c12.427,1.896,18.229-5.016,18.229-12.542l0,0c0-7.526-3.896-13.164-14.533-15.797L102.213,62.69l-0.005,0.014l-6.836-1.26c-3.271-0.603-8.385-2.628-14.386-5.207c-32.207,14.956-56.825,43.488-66.503,78.25C26.652,151.086,39.938,163.295,39.938,163.295z"/>
              <g>
                <path fill="#FF2E3D" d="M492,167.421c0-67.671-54.858-122.529-122.529-122.529c-56.842,0-104.628,38.711-118.471,91.203c-13.844-52.492-61.63-91.203-118.471-91.203c-18.413,0-35.874,4.069-51.543,11.346c6.001,2.579,11.116,4.604,14.386,5.207l6.836,1.26l0.005-0.014L165.9,82.827c10.636,2.633,14.533,8.271,14.533,15.797l0,0c0,7.526-5.802,14.437-18.229,12.542l-24.04-3.957l0.063,0.2l57.782,57.782c5.322,5.322,5.322,13.95,0,19.272l0,0c-5.322,5.322-13.95,5.322-19.272,0l15.639,15.639c5.322,5.322,5.322,13.95,0,19.272s-13.95,5.322-19.272,0l-9.636-9.636c5.322,5.322,5.322,13.95,0,19.272l0,0c-5.322,5.322-13.95,5.322-19.272,0l-31.909-31.909c5.322,5.322,5.322,13.95,0,19.272s-13.95,5.322-19.272,0L60.473,183.83l-20.536-20.536c0,0-13.286-12.208-25.455-28.806C11.565,144.968,10,156.011,10,167.421c0,67.671,74.678,128.234,122.529,176.084C192.17,403.146,251,457.108,251,457.108s55.062-50.744,108.583-103.763c-28.761,10.603-55.878-16.283-55.878-16.283l-20.536-20.536l-32.541-32.541c-5.322-5.322-5.322-13.95,0-19.272s13.95-5.322,19.272,0l-31.909-31.909c-5.322-5.322-5.322-13.95,0-19.272s13.95-5.322,19.272,0l-9.636-9.636c-5.322-5.322-5.322-13.95,0-19.272l0,0c5.322-5.322,13.95-5.322,19.272,0l15.639,15.639c-5.322-5.322-5.322-13.95,0-19.272s13.95-5.322,19.272,0l57.781,57.782l0.2,0.063l-3.957-24.04c-1.896-12.427,5.016-18.229,12.542-18.229l0,0c7.526,0,13.164,3.896,15.797,14.533l20.136,63.687l-0.014,0.005l1.26,6.836c1.655,8.977,2.949,18.112,0.8,26.087C448.312,266.78,492,219.18,492,167.421z"/>
                <path fill="#EBD2B4" d="M405.555,281.628l-1.26-6.836l0.014-0.005L384.173,211.1c-2.633-10.636-8.271-14.533-15.797-14.533l0,0c-7.526,0-14.438,5.802-12.542,18.229l3.957,24.04l-0.2-0.063l-57.781-57.782c-5.322-5.322-13.95-5.322-19.272,0s-5.322,13.95,0,19.272l-15.639-15.639c-5.322-5.322-13.95-5.322-19.272,0l0,0c-5.322,5.322-5.322,13.95,0,19.272l9.636,9.636c-5.322-5.322-13.95-5.322-19.272,0s-5.322,13.95,0,19.272l31.909,31.909c-5.322-5.322-13.95-5.322-19.272,0s-5.322,13.95,0,19.272l32.541,32.541l20.536,20.536c0,0,27.117,26.886,55.878,16.283c3.306-3.275,6.607-6.559,9.888-9.84c11.251-11.251,23.986-23.206,36.884-35.79C408.505,299.74,407.21,290.605,405.555,281.628z"/>
              </g>
            </g>
          </svg>
        </div>

        {/* Website link */}
        <a
          href="https://www.islam.nu"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            padding: '14px', borderRadius: 14,
            background: T.accent, color: '#fff', textDecoration: 'none',
            fontSize: 14, fontWeight: 700,
          }}
        >
          🌐 Besök islam.nu
        </a>
      </div>
    </div>
  );
}
