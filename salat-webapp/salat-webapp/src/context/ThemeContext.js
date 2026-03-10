import React, { createContext, useContext, useEffect, useState } from 'react';
import { dark, light } from '../theme/colors';

const ThemeContext = createContext({ theme: dark, isDark: true, setMode: () => {} });

export function ThemeProvider({ children }) {
  const [mode, setModeState] = useState(() => {
    return localStorage.getItem('salatTheme') || 'dark';
  });

  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = mode === 'system' ? systemDark : mode === 'dark';
  const theme  = isDark ? dark : light;

  const setMode = (m) => {
    setModeState(m);
    localStorage.setItem('salatTheme', m);
  };

  useEffect(() => {
    document.body.style.background = theme.bg;
  }, [theme.bg]);

  return (
    <ThemeContext.Provider value={{ theme, isDark, mode, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
