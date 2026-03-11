import React, { useState } from 'react';
import { useTheme } from '../context/ThemeContext';
import SettingsScreen from './SettingsScreen';
import AboutScreen from './AboutScreen';
import EbooksScreen from './EbooksScreen';
import AboutIcon from '../icons/about-svgrepo-com.svg';

const MENU_ITEMS = [
  {
    id: 'settings',
    label: 'Inställningar',
    sublabel: 'Beräkningsmetod, notiser',
    emoji: null,
    svgIcon: (accent) => (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
      </svg>
    ),
    accentColor: null, // use T.accent
  },
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
    id: 'about',
    label: 'Om oss',
    sublabel: 'Vilka är islam.nu?',
    imgSrc: AboutIcon,
    accentColor: '#3A86C8',
  },
];

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
      {/* Icon container */}
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

export default function MoreScreen({ onTabBarHide, onTabBarShow }) {
  const { theme: T } = useTheme();
  const [view, setView] = useState('menu');

  if (view === 'settings') return <SettingsScreen onBack={() => setView('menu')} />;
  if (view === 'ebooks')   return <EbooksScreen onReaderOpen={() => {}} onReaderClose={() => {}} resetToLibrary={false} onTabBarHide={onTabBarHide} onTabBarShow={onTabBarShow} />;
  if (view === 'about')    return <AboutScreen    onBack={() => setView('menu')} />;

  return (
    <div style={{ background: T.bg, minHeight: '100%', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ padding: '20px 16px 12px', paddingTop: 'max(20px, env(safe-area-inset-top))' }}>
        <div style={{ fontSize: 26, fontWeight: 800, color: T.text, letterSpacing: '-.4px', marginBottom: 20 }}>
          Visa mer
        </div>

        {/* Grid layout — 3 items */}
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
