import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<React.StrictMode><App /></React.StrictMode>);

// ── Register service worker for offline asset caching ──────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // Use the base URL from the page (handles GitHub Pages subdirectory)
    const base = document.querySelector('base')?.href || window.location.origin + '/';
    const swUrl = base.replace(/\/$/, '') + '/sw.js';

    navigator.serviceWorker
      .register(swUrl, { scope: base })
      .then(reg => {
        // When a new SW is waiting, activate it immediately
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              newWorker.postMessage('SKIP_WAITING');
            }
          });
        });
      })
      .catch(err => {
        // Fail silently — service worker is optional
        console.warn('SW registration failed:', err);
      });
  });
}
