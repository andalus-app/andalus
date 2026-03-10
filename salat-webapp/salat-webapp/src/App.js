import React, { useState } from 'react';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { AppProvider } from './context/AppContext';
import HomeScreen     from './components/HomeScreen';
import MonthlyScreen  from './components/MonthlyScreen';
import QiblaScreen    from './components/QiblaScreen';
import SettingsScreen from './components/SettingsScreen';
import SvgIcon        from './components/SvgIcon';

const TABS = [
  { id:'home',     iconName:'home',     label:'Hem'           },
  { id:'monthly',  iconName:'calendar', label:'Månadsvy'      },
  { id:'qibla',    iconName:'compass',  label:'Qibla'         },
  { id:'settings', iconName:'settings', label:'Inställningar' },
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
      height: '100dvh', width: '100vw',
      background: T.bg,
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden', maxWidth: 500, margin: '0 auto',
    }}>
      <div key={tab} style={{ flex:1, overflowY:'auto', overflowX:'hidden', WebkitOverflowScrolling:'touch' }}>
        {screens[tab]}
      </div>

      <div style={{
        display: 'flex', borderTop: `1px solid ${T.border}`,
        background: T.bg,
        paddingBottom: 'env(safe-area-inset-bottom, 12px)',
        paddingTop: 8, flexShrink: 0, position: 'relative', zIndex: 100,
      }}>
        {TABS.map(t => {
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', gap: 3, padding: '6px 4px',
              background: 'none', border: 'none', cursor: 'pointer',
              fontFamily: "'Inter', 'DM Sans', system-ui, sans-serif",
              WebkitTapHighlightColor: 'transparent',
            }}>
              <SvgIcon
                name={t.iconName}
                size={22}
                color={active ? T.accent : T.textMuted}
                style={{ opacity: active ? 1 : 0.5, transition: 'all .2s' }}
              />
              <span style={{
                fontSize: 9, fontWeight: 600, letterSpacing: '.3px',
                color: active ? T.accent : T.textMuted,
                whiteSpace: 'nowrap',
              }}>
                {t.label}
              </span>
            </button>
          );
        })}
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
