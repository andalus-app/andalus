import React, { useEffect, useRef, useState } from 'react';

// pdf.js loaded from CDN — no npm install needed
const PDFJS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const WORKER_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

let pdfjsLib = null;
let loadPromise = null;

function loadPdfJs() {
  if (pdfjsLib) return Promise.resolve(pdfjsLib);
  if (loadPromise) return loadPromise;
  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = PDFJS_CDN;
    script.onload = () => {
      pdfjsLib = window['pdfjs-dist/build/pdf'];
      pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER_URL;
      resolve(pdfjsLib);
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
  return loadPromise;
}

// ── Cache version — bump this number to invalidate ALL cached thumbnails ──
// e.g. when a PDF file is replaced or cover quality needs refresh
const COVER_CACHE_VERSION = 2;

// ── Cache: in-memory (session) + localStorage (persistent) ────────────────
// Cache key includes pdfPath so if the file changes (new upload), cache busts
const MEM_CACHE = {};

function getCacheKey(bookId, pdfPath) {
  // Simple hash: bookId + last segment of path (filename) + version
  const fileName = pdfPath.split('/').pop();
  return `pdfcover_v${COVER_CACHE_VERSION}_${bookId}_${fileName}`;
}

function loadFromStorage(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function saveToStorage(key, dataUrl) {
  try { localStorage.setItem(key, dataUrl); } catch {
    // localStorage full — clear old covers and try again
    try {
      Object.keys(localStorage)
        .filter(k => k.startsWith('pdfcover_'))
        .forEach(k => localStorage.removeItem(k));
      localStorage.setItem(key, dataUrl);
    } catch { /* ignore */ }
  }
}

export default function PdfCover({ pdfPath, bookId, width, height, fallback, style }) {
  const cacheKey = getCacheKey(bookId, pdfPath);

  // Check memory cache first, then localStorage
  const initialUrl = MEM_CACHE[cacheKey] || loadFromStorage(cacheKey);

  const [status, setStatus] = useState(initialUrl ? 'done' : 'loading');
  const [dataUrl, setDataUrl] = useState(initialUrl || null);

  useEffect(() => {
    if (MEM_CACHE[cacheKey]) return; // already in memory

    const stored = loadFromStorage(cacheKey);
    if (stored) {
      MEM_CACHE[cacheKey] = stored;
      setDataUrl(stored);
      setStatus('done');
      return;
    }

    let cancelled = false;

    async function render() {
      try {
        const lib = await loadPdfJs();
        const pdf = await lib.getDocument(pdfPath).promise;
        const page = await pdf.getPage(1);

        const viewport = page.getViewport({ scale: 1 });
        const scale = Math.max(width / viewport.width, height / viewport.height) * window.devicePixelRatio;
        const scaledViewport = page.getViewport({ scale });

        const canvas = document.createElement('canvas');
        canvas.width = scaledViewport.width;
        canvas.height = scaledViewport.height;
        const ctx = canvas.getContext('2d');

        await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise;

        if (!cancelled) {
          const url = canvas.toDataURL('image/jpeg', 0.82);
          MEM_CACHE[cacheKey] = url;
          saveToStorage(cacheKey, url);
          setDataUrl(url);
          setStatus('done');
        }
      } catch (err) {
        if (!cancelled) setStatus('error');
      }
    }

    render();
    return () => { cancelled = true; };
  }, [cacheKey, pdfPath, bookId, width, height]);

  const containerStyle = {
    width,
    height,
    borderRadius: style?.borderRadius ?? 8,
    overflow: 'hidden',
    flexShrink: 0,
    position: 'relative',
    ...style,
  };

  if (status === 'done' && dataUrl) {
    return (
      <div style={containerStyle}>
        <img
          src={dataUrl}
          alt=""
          style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center', display: 'block' }}
        />
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      {fallback}
      {status === 'loading' && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.25)',
        }}>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          <div style={{
            width: 18, height: 18, borderRadius: '50%',
            border: '2px solid rgba(255,255,255,0.2)',
            borderTopColor: 'rgba(255,255,255,0.8)',
            animation: 'spin .7s linear infinite',
          }} />
        </div>
      )}
    </div>
  );
}
