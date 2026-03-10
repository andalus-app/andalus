import { useState, useEffect } from 'react';

// ── CONFIG ─────────────────────────────────────────────────────────────────
const SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTGcOPYCS6v4m4cGWDhbJs_PZRWysSbseKBq7mF6bqbnlmEpEMB7yQDrV9hm2rTXDZnkUDeDinIT04A/pub?gid=0&single=true&output=csv';
// ──────────────────────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function dismissKey(msg) {
  // Key: dismissed-banner-YYYY-MM-DD-hash so it resets each new day
  return `dismissed-banner-${todayStr()}-${btoa(msg).slice(0, 12)}`;
}

export function useBanner() {
  const [banner, setBanner]   = useState(null);  // { message, color }
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    fetch(SHEET_URL)
      .then(r => r.text())
      .then(csv => {
        // Parse simple CSV — second row is the data row
        const rows = csv.trim().split('\n');
        if (rows.length < 2) return;

        // Strip surrounding quotes from each cell
        const cells = rows[1].split(',').map(c => c.replace(/^"|"$/g, '').trim());
        const [message, start, end, active] = cells;

        if (!message || active?.toUpperCase() !== 'TRUE') return;

        const today = todayStr();
        if (today < start || today > end) return;

        // Check if user already dismissed today
        if (localStorage.getItem(dismissKey(message))) return;

        setBanner({ message });
        setVisible(true);
      })
      .catch(() => {}); // Silently fail — no banner if offline
  }, []);

  const dismiss = () => {
    if (banner) localStorage.setItem(dismissKey(banner.message), '1');
    setVisible(false);
  };

  return { banner, visible, dismiss };
}
