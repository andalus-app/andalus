import React, { useState, useEffect } from 'react';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { AppProvider } from './context/AppContext';
import HomeScreen     from './components/HomeScreen';
import MonthlyScreen  from './components/MonthlyScreen';
import QiblaScreen    from './components/QiblaScreen';
import SettingsScreen from './components/SettingsScreen';

const TABS = [
  { id:'home',     icon:'🕌', label:'Hem'        },
  { id:'monthly',  icon:'📅', label:'Månadsvy'   },
  { id:'qibla',    icon:'🧭', label:'Qibla'      },
  { id:'settings', icon:'⚙️', label:'Inställningar' },
];

function Shell() {
  const { theme: T } = useTheme();
  const [tab, setTab] = useState('home');

  const screens = {
    home:     <HomeScreen />,
    monthly:  <MonthlyScreen />,
    qibla:    <QiblaScreen />,
    settings: <SettingsScreen />,
  };

  return (
    <div style={{
      height: '100dvh',
      width: '100vw',
      background: T.bg,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      maxWidth: 500,
      margin: '0 auto',
    }}>
      {/* Scrollable content area */}
      <div key={tab} style={{
        flex: 1,
        overflowY: 'auto',
        overflowX: 'hidden',
        WebkitOverflowScrolling: 'touch',
      }}>
        {screens[tab]}
      </div>

      {/* Sticky bottom tab bar */}
      <div style={{
        display: 'flex',
        borderTop: `1px solid ${T.border}`,
        background: T.bg,
        paddingBottom: 'env(safe-area-inset-bottom, 12px)',
        paddingTop: 8,
        flexShrink: 0,
        position: 'relative',
        zIndex: 100,
      }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 3,
            padding: '6px 4px',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontFamily: "'DM Sans', system-ui, sans-serif",
            WebkitTapHighlightColor: 'transparent',
          }}>
            <span style={{ fontSize: 22, opacity: tab === t.id ? 1 : 0.35, transition: 'opacity .2s' }}>
              {t.icon}
            </span>
            <span style={{
              fontSize: 9,
              fontWeight: 600,
              letterSpacing: '.3px',
              color: tab === t.id ? T.accent : T.textMuted,
              whiteSpace: 'nowrap',
            }}>
              {t.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppProvider>
        <Shell />
      </AppProvider>
    </ThemeProvider>
  );
}
