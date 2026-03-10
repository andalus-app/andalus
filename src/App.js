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
      position: 'relative',
    }}>
      {/* Scrollable content — extra bottom padding so content clears the floating bar */}
      <div key={tab} style={{
        flex: 1, overflowY: 'auto', overflowX: 'hidden',
        WebkitOverflowScrolling: 'touch',
        paddingBottom: 90,
      }}>
        {screens[tab]}
      </div>

      {/* ── FLOATING TAB BAR ── */}
      <div style={{
        position: 'absolute',
        bottom: `calc(env(safe-area-inset-bottom, 0px) + 8px)`,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'calc(100% - 32px)',
        maxWidth: 420,
        display: 'flex',
        background: T.isDark
          ? 'rgba(18,18,18,0.75)'
          : 'rgba(245,248,247,0.75)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        borderRadius: 28,
        border: `1px solid ${T.border}`,
        boxShadow: T.isDark
          ? '0 4px 24px rgba(0,0,0,0.4)'
          : '0 4px 24px rgba(0,0,0,0.08)',
        padding: '6px 4px',
        zIndex: 200,
      }}>
        {TABS.map(t => {
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', gap: 3,
              padding: '7px 4px',
              background: active
                ? T.isDark ? 'rgba(255,255,255,0.07)' : 'rgba(36,100,93,0.08)'
                : 'none',
              borderRadius: 22,
              border: 'none', cursor: 'pointer',
              fontFamily: "'Inter', system-ui, sans-serif",
              WebkitTapHighlightColor: 'transparent',
              transition: 'background .2s',
            }}>
              <SvgIcon
                name={t.iconName}
                size={22}
                color={active ? T.accent : T.textMuted}
                style={{ opacity: active ? 1 : 0.45, transition: 'all .2s' }}
              />
              <span style={{
                fontSize: 9, fontWeight: active ? 700 : 500,
                letterSpacing: '.3px',
                color: active ? T.accent : T.textMuted,
                opacity: active ? 1 : 0.6,
                whiteSpace: 'nowrap',
                transition: 'all .2s',
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
