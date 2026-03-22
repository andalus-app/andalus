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

// ── Cache version — bump to invalidate ALL cached thumbnails ──────────────────
const COVER_CACHE_VERSION = 2;
const DB_NAME    = 'pdfcovers';
const DB_STORE   = 'covers';
const DB_VERSION = 1;

// ── In-memory cache (instant re-renders within a session) ────────────────────
const MEM_CACHE = {};

function getCacheKey(bookId, pdfPath) {
  const fileName = pdfPath.split('/').pop();
  return `pdfcover_v${COVER_CACHE_VERSION}_${bookId}_${fileName}`;
}

// ── IndexedDB helpers ─────────────────────────────────────────────────────────
let _db = null;

function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      e.target.result.createObjectStore(DB_STORE);
    };
    req.onsuccess = e => { _db = e.target.result; resolve(_db); };
    req.onerror   = () => reject(req.error);
  });
}

async function idbGet(key) {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx  = db.transaction(DB_STORE, 'readonly');
      const req = tx.objectStore(DB_STORE).get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror   = () => resolve(null);
    });
  } catch { return null; }
}

async function idbSet(key, value) {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror    = () => resolve();
    });
  } catch { /* ignore */ }
}

// ── Skeleton shimmer — matches Tailwind animate-pulse style ──────────────────
function CoverSkeleton({ width, height, borderRadius, isDark }) {
  const base  = isDark ? '#2C2C2E' : '#E8E8EA';
  const shine = isDark ? '#3A3A3C' : '#F0F0F2';
  return (
    <>
      <style>{`@keyframes shimmer{0%{background-position:-400px 0}100%{background-position:400px 0}}`}</style>
      <div
        style={{
          width,
          height,
          borderRadius: borderRadius ?? 8,
          flexShrink: 0,
          background: `linear-gradient(90deg, ${base} 25%, ${shine} 50%, ${base} 75%)`,
          backgroundSize: '800px 100%',
          animation: 'shimmer 1.6s ease-in-out infinite',
        }}
      />
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function PdfCover({ pdfPath, bookId, width, height, fallback, style, isDark }) {
  const cacheKey = getCacheKey(bookId, pdfPath);

  // Synchronous memory-cache check — no loading flash on revisit
  const [status,  setStatus]  = useState(() => MEM_CACHE[cacheKey] ? 'done' : 'loading');
  const [dataUrl, setDataUrl] = useState(() => MEM_CACHE[cacheKey] || null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (MEM_CACHE[cacheKey]) return; // already warm

    let cancelled = false;

    async function load() {
      // 1. IndexedDB — persistent across sessions, no 5 MB quota issue
      const stored = await idbGet(cacheKey);
      if (stored) {
        MEM_CACHE[cacheKey] = stored;
        if (!cancelled && mountedRef.current) {
          setDataUrl(stored);
          setStatus('done');
        }
        return;
      }

      // 2. Render first page from PDF
      try {
        const lib  = await loadPdfJs();
        const pdf  = await lib.getDocument(pdfPath).promise;
        const page = await pdf.getPage(1);

        const viewport0 = page.getViewport({ scale: 1 });
        const scale     = Math.max(width / viewport0.width, height / viewport0.height)
                          * Math.min(window.devicePixelRatio, 2); // cap 2× for perf
        const vp        = page.getViewport({ scale });

        const canvas = document.createElement('canvas');
        canvas.width  = vp.width;
        canvas.height = vp.height;

        await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;

        if (cancelled) return;

        const url = canvas.toDataURL('image/jpeg', 0.82);
        MEM_CACHE[cacheKey] = url;
        idbSet(cacheKey, url); // fire-and-forget persist

        if (mountedRef.current) {
          setDataUrl(url);
          setStatus('done');
        }
      } catch {
        if (!cancelled && mountedRef.current) setStatus('error');
      }
    }

    load();
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

  if (status === 'loading') {
    return <CoverSkeleton width={width} height={height} borderRadius={style?.borderRadius ?? 8} isDark={isDark} />;
  }

  // error — show CSS fallback
  return <div style={containerStyle}>{fallback}</div>;
}
