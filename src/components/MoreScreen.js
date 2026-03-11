import React, { useState } from 'react';
import { useTheme } from '../context/ThemeContext';
import SettingsScreen from './SettingsScreen';
import AboutScreen from './AboutScreen';
import AboutIcon from '../icons/about-svgrepo-com.svg';

function MenuRow({ icon, label, sublabel, onPress, T, accent }) {
  return (
    <button
      onClick={onPress}
      style={{
        display: 'flex', alignItems: 'center', gap: 14,
        width: '100%', background: T.card,
        border: `1px solid ${T.border}`, borderRadius: 14,
        padding: '14px 16px', cursor: 'pointer', textAlign: 'left',
        WebkitTapHighlightColor: 'transparent',
        marginBottom: 10,
      }}
    >
      <div style={{
        width: 42, height: 42, borderRadius: 12, flexShrink: 0,
        background: accent ? `${accent}18` : T.bgSecondary,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {icon}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: T.text, fontFamily: 'system-ui' }}>{label}</div>
        {sublabel && <div style={{ fontSize: 12, color: T.textMuted, marginTop: 2, fontFamily: 'system-ui' }}>{sublabel}</div>}
      </div>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={T.textMuted} strokeWidth="2" strokeLinecap="round">
        <path d="M9 18l6-6-6-6"/>
      </svg>
    </button>
  );
}

export default function MoreScreen() {
  const { theme: T } = useTheme();
  const [view, setView] = useState('menu'); // 'menu' | 'settings' | 'about'

  if (view === 'settings') return <SettingsScreen onBack={() => setView('menu')} />;
  if (view === 'about')    return <AboutScreen    onBack={() => setView('menu')} />;

  return (
    <div style={{ background: T.bg, minHeight: '100%', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{
        padding: '20px 16px 12px',
        paddingTop: 'max(20px, env(safe-area-inset-top))',
      }}>
        <div style={{ fontSize: 26, fontWeight: 800, color: T.text, letterSpacing: '-.4px', marginBottom: 24 }}>
          Visa mer
        </div>

        {/* Settings */}
        <MenuRow
          T={T}
          accent={T.accent}
          label="Inställningar"
          sublabel="Beräkningsmetod, skola, notiser"
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          }
          onPress={() => setView('settings')}
        />

        {/* Om oss */}
        <MenuRow
          T={T}
          accent="#5B9BD5"
          label="Om oss"
          sublabel="Vilka är islam.nu?"
          icon={
            <img
              src={AboutIcon}
              alt=""
              style={{
                width: 22, height: 22, objectFit: 'contain',
                filter: T.isDark
                  ? 'invert(1) opacity(0.8)'
                  : 'invert(35%) sepia(50%) saturate(400%) hue-rotate(180deg) brightness(90%)',
              }}
            />
          }
          onPress={() => setView('about')}
        />
      </div>
    </div>
  );
}
