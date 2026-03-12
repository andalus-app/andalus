import React, { useState, useEffect } from 'react';
import { useTheme } from '../context/ThemeContext';
import SettingsScreen from './SettingsScreen';
import AboutScreen from './AboutScreen';
import EbooksScreen from './EbooksScreen';
import AboutIcon from '../icons/about-svgrepo-com.svg';
import CharityIcon from '../icons/charity-svgrepo-com.svg';
import SwishLogo from '../icons/swish-logo.svg';
import BankgirotLogo from '../icons/bankgirot-logo.svg';

const MENU_ITEMS = [
  {
    id: 'ebooks',
    label: 'E-böcker',
    sublabel: 'Islamisk litteratur',
    svgIcon: (accent) => (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 6s2-2 5-2 5 2 5 2v14s-2-1-5-1-5 1-5 1V6z"/>
        <path d="M12 6s2-2 5-2 5 2 5 2v14s-2-1-5-1-5 1-5 1V6z"/>
      </svg>
    ),
    accentColor: '#3A86C8',
  },
  {
    id: 'support',
    label: 'Stöd oss',
    sublabel: 'Bidra till islam.nu',
    imgSrc: CharityIcon,
    accentColor: '#C47B2B',
  },
  {
    id: 'about',
    label: 'Om oss',
    sublabel: 'Vilka är islam.nu?',
    imgSrc: AboutIcon,
    accentColor: '#3A86C8',
  },
];

// Settings gear icon
function SettingsGearIcon({ color }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  );
}

function GridCard({ item, onPress, T }) {
  const accent = item.accentColor || T.accent;
  return (
    <button
      onClick={onPress}
      style={{
        background: T.card,
        border: `1px solid ${T.border}`,
        borderRadius: 18,
        padding: '18px 14px 14px',
        cursor: 'pointer',
        textAlign: 'center',
        WebkitTapHighlightColor: 'transparent',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
        transition: 'transform .12s',
        WebkitUserSelect: 'none',
      }}
    >
      <div style={{
        width: 56, height: 56, borderRadius: 16,
        background: `${accent}18`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 2,
      }}>
        {item.svgIcon ? (
          item.svgIcon(accent)
        ) : (
          <img
            src={item.imgSrc}
            alt={item.label}
            style={{
              width: 30,
              height: 30,
              objectFit: 'contain',
              filter: T.isDark
                ? 'invert(1) opacity(0.85)'
                : item.id === 'support'
                  ? 'invert(50%) sepia(60%) saturate(500%) hue-rotate(10deg) brightness(85%)'
                  : 'invert(28%) sepia(60%) saturate(400%) hue-rotate(140deg) brightness(80%)',
            }}
          />
        )}
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, color: T.text, fontFamily: 'system-ui', lineHeight: 1.2 }}>
        {item.label}
      </div>
      {item.sublabel && (
        <div style={{ fontSize: 10.5, color: T.textMuted, fontFamily: 'system-ui', lineHeight: 1.3 }}>
          {item.sublabel}
        </div>
      )}
    </button>
  );
}

function SupportScreen({ onBack, T }) {
  useEffect(() => {
    const handler = () => onBack();
    window.addEventListener('edgeSwipeBack', handler);
    return () => window.removeEventListener('edgeSwipeBack', handler);
  }, [onBack]);

  const divider = <div style={{ height: 1, background: T.border, margin: '0 0' }} />;

  const PaymentBlock = ({ children }) => (
    <div style={{ padding: '24px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
      {children}
    </div>
  );

  return (
    <div style={{ background: T.bg, minHeight: '100%', display: 'flex', flexDirection: 'column', fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '16px 16px 12px',
        paddingTop: 'max(16px, env(safe-area-inset-top))',
        borderBottom: `1px solid ${T.border}`,
        background: T.bg, zIndex: 10,
      }}>
        <button onClick={onBack} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: T.accent, fontSize: 20, padding: '4px 8px 4px 0',
          WebkitTapHighlightColor: 'transparent',
        }}>‹</button>
        <span style={{ fontSize: 18, fontWeight: 700, color: T.text }}>Stöd oss</span>
      </div>

      {/* Intro text */}
      <div style={{ padding: '24px 20px 8px', textAlign: 'center' }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: T.text, margin: '0 0 12px', letterSpacing: '-.3px' }}>
          Stöd oss
        </h2>
        <p style={{ fontSize: 15, color: T.textMuted, lineHeight: 1.7, margin: '0 0 10px' }}>
          Var med och sprid gott genom att bli månadsgivare eller donera en gåva.
        </p>
        <p style={{ fontSize: 14, color: T.textMuted, lineHeight: 1.7, margin: 0 }}>
          Kom ihåg att du belönas för det arbete vi kan utföra tack vare ditt bidrag! Profeten (ﷺ) sade: <em>"Den som vägleder till gott får samma belöning som den som utför handlingen"</em>. [Muslim]
        </p>
      </div>

      {/* Payment methods */}
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 32 }}>
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 18, margin: '20px 16px', overflow: 'hidden' }}>

          {/* Label */}
          <div style={{ padding: '14px 20px 0', textAlign: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: T.textMuted }}>Ge en gåva</span>
          </div>

          {/* Bitcoin */}
          <PaymentBlock>
            {/* Bitcoin logo inline SVG */}
            <svg width="120" height="32" viewBox="0 0 120 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="16" cy="16" r="16" fill="#F7931A"/>
              <path d="M22.5 13.8c.3-2-1.2-3.1-3.3-3.8l.7-2.7-1.6-.4-.6 2.6-1.3-.3.6-2.6-1.6-.4-.7 2.7-1.1-.3v0l-2.2-.5-.4 1.7s1.2.3 1.1.3c.6.2.7.6.7.9l-1.7 6.8c-.1.2-.3.5-.8.4.0.0-1.1-.3-1.1-.3l-.8 1.8 2.1.5 1.1.3-.7 2.7 1.6.4.7-2.7 1.3.3-.7 2.7 1.6.4.7-2.7c2.7.5 4.7.3 5.6-2.1.7-2-.0-3.1-1.5-3.9 1.1-.2 1.9-1 2.1-2.5zm-3.7 5.2c-.5 2-3.9.9-5 .6l.9-3.6c1.1.3 4.6.8 4.1 3zm.5-5.2c-.5 1.8-3.3.9-4.3.6l.8-3.3c.9.2 3.9.7 3.5 2.7z" fill="white"/>
              <text x="38" y="21" fontFamily="system-ui, -apple-system, sans-serif" fontSize="16" fontWeight="700" fill={T.isDark ? '#fff' : '#1a1a1a'}>bitcoin</text>
            </svg>
            <a
              href="bitcoin:bc1qe62zvm59cltlkqjekz4vz9nueh7hq3ejxcsktk"
              style={{
                fontSize: 12, color: T.accent, wordBreak: 'break-all',
                textAlign: 'center', textDecoration: 'underline',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              bc1qe62zvm59cltlkqjekz4vz9nueh7hq3ejxcsktk
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            </a>
          </PaymentBlock>

          {divider}

          {/* Swish */}
          <PaymentBlock>
            <img src={SwishLogo} alt="Swish" style={{ height: 40, objectFit: 'contain' }} />
            <a
              href="https://app.swish.nu/1/p/sw/?sw=1236433940&msg=&src=qr"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: 22, fontWeight: 800, color: T.accent,
                textDecoration: 'underline', letterSpacing: '1px',
                display: 'flex', alignItems: 'center', gap: 8,
              }}
            >
              123 643 39 40
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            </a>
          </PaymentBlock>

          {divider}

          {/* Bankgirot */}
          <PaymentBlock>
            <img src={BankgirotLogo} alt="Bankgirot" style={{ height: 36, objectFit: 'contain' }} />
            <span style={{ fontSize: 22, fontWeight: 800, color: T.text, letterSpacing: '1px' }}>
              5323-2344
            </span>
          </PaymentBlock>
        </div>

        {/* Månadsgivare CTA */}
        <div style={{ padding: '0 16px' }}>
          <button
            onClick={() => window.open('https://islam.nu/stod-oss/', '_blank')}
            style={{
              width: '100%', padding: '16px', borderRadius: 14,
              background: T.accent, color: '#fff',
              fontSize: 16, fontWeight: 700, border: 'none', cursor: 'pointer',
              WebkitTapHighlightColor: 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            Eller bli månadsgivare
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
          </button>
          <p style={{ textAlign: 'center', fontSize: 12, color: T.textMuted, marginTop: 10 }}>Öppnas i din webbläsare</p>
        </div>
      </div>
    </div>
  );
}

export default function MoreScreen({ onTabBarHide, onTabBarShow }) {
  const { theme: T } = useTheme();
  const [view, setView] = useState('menu');

  if (view === 'settings') return <SettingsScreen onBack={() => setView('menu')} />;
  if (view === 'ebooks')   return <EbooksScreen onReaderOpen={() => {}} onReaderClose={() => {}} resetToLibrary={false} onTabBarHide={onTabBarHide} onTabBarShow={onTabBarShow} onBack={() => setView('menu')} />;
  if (view === 'about')    return <AboutScreen onBack={() => setView('menu')} />;
  if (view === 'support')  return <SupportScreen onBack={() => setView('menu')} T={T} />;

  return (
    <div style={{ background: T.bg, minHeight: '100%', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ padding: '20px 16px 12px', paddingTop: 'max(20px, env(safe-area-inset-top))' }}>

        {/* Header row: title + settings icon */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ fontSize: 26, fontWeight: 800, color: T.text, letterSpacing: '-.4px' }}>
            Visa mer
          </div>
          <button
            onClick={() => setView('settings')}
            style={{
              background: T.card,
              border: `1px solid ${T.border}`,
              borderRadius: 12,
              width: 40, height: 40,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <SettingsGearIcon color={T.textMuted} />
          </button>
        </div>

        {/* Grid layout */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 10,
        }}>
          {MENU_ITEMS.map(item => (
            <GridCard
              key={item.id}
              item={item}
              onPress={() => setView(item.id)}
              T={T}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
