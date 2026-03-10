import React, { createContext, useContext, useReducer, useEffect } from 'react';

const AppContext = createContext(null);

const initialState = {
  prayerTimes:   null,
  tomorrowTimes: null,
  hijriDate:     null,
  location:      null,
  monthlyTimes:  null,
  settings: {
    calculationMethod: 3,
    school: 0,
    notificationsEnabled: true,
    autoLocation: true,
  },
  isLoading: false,
  error:     null,
};

function reducer(state, action) {
  switch (action.type) {
    case 'SET_PRAYER_TIMES':   return { ...state, prayerTimes: action.payload };
    case 'SET_TOMORROW_TIMES': return { ...state, tomorrowTimes: action.payload };
    case 'SET_HIJRI':          return { ...state, hijriDate: action.payload };
    case 'SET_MONTHLY_TIMES':  return { ...state, monthlyTimes: action.payload };
    case 'SET_LOCATION':       return { ...state, location: action.payload };
    case 'SET_SETTINGS':       return { ...state, settings: { ...state.settings, ...action.payload } };
    case 'SET_LOADING':        return { ...state, isLoading: action.payload };
    case 'SET_ERROR':          return { ...state, error: action.payload };
    default: return state;
  }
}

const STORAGE_VERSION = 4; // bump = wipes old cached state

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState, (init) => {
    try {
      const raw = JSON.parse(localStorage.getItem('bonetiderState') || '{}');
      if (!raw.version || raw.version < STORAGE_VERSION) {
        // Wipe all cached state — force fresh API fetch with correct settings
        localStorage.removeItem('bonetiderState');
        return init;
      }
      return {
        ...init,
        location: raw.location || null,
        settings: { ...init.settings, ...(raw.settings || {}) },
      };
    } catch { return init; }
  });

  useEffect(() => {
    localStorage.setItem('bonetiderState', JSON.stringify({
      version:  STORAGE_VERSION,
      location: state.location,
      settings: state.settings,
    }));
  }, [state.location, state.settings]);

  return (
    <AppContext.Provider value={{ ...state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);
