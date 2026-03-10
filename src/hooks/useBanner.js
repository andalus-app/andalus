import { useState, useEffect, useCallback } from 'react';

const SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTGcOPYCS6v4m4cGWDhbJs_PZRWysSbseKBq7mF6bqbnlmEpEMB7yQDrV9hm2rTXDZnkUDeDinIT04A/pub?gid=0&single=true&output=csv';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function makeId(msg, i) {
  return `banner-${btoa(encodeURIComponent(msg + i)).slice(0, 16)}`;
}

function parseCSVRow(row) {
  const result = [];
  let cur = '', inQuote = false;
  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (ch === '"') {
      if (inQuote && row[i + 1] === '"') { cur += '"'; i++; }
      else inQuote = !inQuote;
    } else if (ch === ',' && !inQuote) {
      result.push(cur.trim()); cur = '';
    } else { cur += ch; }
  }
  result.push(cur.trim());
  return result;
}

function getStorage(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}
function setStorage(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

const DISMISSED_KEY = 'banners-dismissed'; // Set of ids dismissed today
const READ_KEY      = 'banners-read';      // Set of ids user has seen

export function useBanner() {
  // allBanners = every active banner regardless of dismissed state
  const [allBanners, setAllBanners] = useState([]);
  // dismissed ids (per day)
  const [dismissed,  setDismissed]  = useState(() => {
    const d = getStorage(DISMISSED_KEY, {});
    // Clean up old days
    const today = todayStr();
    return Object.fromEntries(Object.entries(d).filter(([,v]) => v === today));
  });
  // read ids (persistent — never reset)
  const [read, setRead] = useState(() => getStorage(READ_KEY, []));

  useEffect(() => {
    const today = todayStr();
    fetch(SHEET_URL)
      .then(r => r.text())
      .then(csv => {
        const rows = csv.trim().split('\n').slice(1);
        const active = [];
        rows.forEach((row, i) => {
          if (!row.trim()) return;
          const [message, start, end, activeFlag, linkText, linkUrl] = parseCSVRow(row);
          if (!message) return;
          if (activeFlag?.toUpperCase() !== 'TRUE') return;
          if (today < start || today > end) return;
          active.push({
            id: makeId(message, i),
            message,
            linkText: linkText || null,
            linkUrl:  linkUrl  || null,
          });
        });
        setAllBanners(active);
      })
      .catch(() => {});
  }, []);

  // Banners visible in the home feed (not dismissed today)
  const banners = allBanners.filter(b => !dismissed[b.id]);

  // Unread count = active banners not yet in read list
  const unreadCount = allBanners.filter(b => !read.includes(b.id)).length;

  const dismiss = useCallback((id) => {
    setDismissed(prev => {
      const next = { ...prev, [id]: todayStr() };
      setStorage(DISMISSED_KEY, next);
      return next;
    });
  }, []);

  const markRead = useCallback((id) => {
    setRead(prev => {
      if (prev.includes(id)) return prev;
      const next = [...prev, id];
      setStorage(READ_KEY, next);
      return next;
    });
  }, []);

  const markAllRead = useCallback(() => {
    setRead(prev => {
      const ids = allBanners.map(b => b.id);
      const next = [...new Set([...prev, ...ids])];
      setStorage(READ_KEY, next);
      return next;
    });
    // Also dismiss all from feed
    setDismissed(prev => {
      const today = todayStr();
      const next = { ...prev };
      allBanners.forEach(b => { next[b.id] = today; });
      setStorage(DISMISSED_KEY, next);
      return next;
    });
  }, [allBanners]);

  return {
    banners,        // shown in feed
    allBanners,     // shown in bell panel
    unreadCount,
    read,
    dismiss,
    markRead,
    markAllRead,
  };
}
