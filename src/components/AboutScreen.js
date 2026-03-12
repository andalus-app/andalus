import React, { useEffect } from 'react';
import { useTheme } from '../context/ThemeContext';
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

  useEffect(() => {
    if (!onBack) return;
    const handler = () => onBack();
    window.addEventListener('edgeSwipeBack', handler);
    return () => window.removeEventListener('edgeSwipeBack', handler);
  }, [onBack]);

  return (
    <div style={{ background: T.bg, minHeight: '100%', fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '16px 16px 12px',
        paddingTop: 'max(16px, env(safe-area-inset-top))',
        borderBottom: `1px solid ${T.border}`,
        position: 'sticky', top: 0, background: T.bg, zIndex: 10,
      }}>
        <button onClick={onBack} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          padding: '4px 8px 4px 0', color: T.accent, fontSize: 22,
          lineHeight: 1, fontWeight: 300, WebkitTapHighlightColor: 'transparent',
        }}>‹</button>
        <div style={{ fontSize: 19, fontWeight: 800, color: T.text, letterSpacing: '-.3px' }}>Om oss</div>
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
