import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useTheme } from '../context/ThemeContext';
import { useBooks } from '../hooks/useBooks';
import { CATEGORIES } from '../data/books';
import PdfCover from './PdfCover';

/* ─────────────────────────────────────────────────────────────
   SHARED ATOMS
───────────────────────────────────────────────────────────── */

function ProgressBar({ pct, T, h = 3 }) {
  if (!pct) return null;
  return (
    <div style={{ height: h, borderRadius: h, background: T.border, overflow: 'hidden', marginTop: 5 }}>
      <div style={{ height: '100%', width: `${pct}%`, background: T.accent, borderRadius: h, transition: 'width .4s' }} />
    </div>
  );
}

function CatChip({ categoryId, T, small }) {
  const cat = CATEGORIES.find(c => c.id === categoryId);
  const label = cat ? cat.label : categoryId;
  return (
    <span style={{
      fontSize: small ? 9 : 10, fontWeight: 600,
      color: T.accent, background: T.accentGlow,
      padding: small ? '2px 7px' : '3px 9px', borderRadius: 20,
      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      maxWidth: 140,
    }}>{label}</span>
  );
}

function CssCover({ book, w, h, T }) {
  const radius = w > 90 ? 12 : 8;
  return (
    <div style={{
      width: w, height: h, borderRadius: radius, flexShrink: 0,
      background: `linear-gradient(145deg, ${book.coverColor}ee, ${book.coverColor}88)`,
      position: 'relative', overflow: 'hidden',
      boxShadow: `0 ${w > 90 ? 12 : 5}px ${w > 90 ? 32 : 14}px rgba(0,0,0,${T.isDark ? '.5' : '.2'})`,
      border: `1px solid rgba(255,255,255,0.07)`,
    }}>
      <svg style={{ position:'absolute', inset:0, width:'100%', height:'100%', opacity:.13 }}
        viewBox="0 0 60 80" preserveAspectRatio="xMidYMid slice">
        <defs>
          <pattern id={`pat-${book.id}`} x="0" y="0" width="15" height="15" patternUnits="userSpaceOnUse">
            <polygon points="7.5,1 14,4.5 14,10.5 7.5,14 1,10.5 1,4.5" fill="none" stroke="white" strokeWidth="0.6"/>
          </pattern>
        </defs>
        <rect width="60" height="80" fill={`url(#pat-${book.id})`}/>
      </svg>
      <div style={{ position:'absolute', left:0, top:0, bottom:0, width:3, background:'rgba(255,255,255,0.12)'}}/>
      <div style={{
        position:'absolute', bottom:0, left:0, right:0,
        padding: w > 90 ? '24px 8px 8px' : '16px 5px 5px',
        background:'linear-gradient(transparent,rgba(0,0,0,.75))',
      }}>
        <div style={{
          fontSize: w > 90 ? 10 : 7.5, fontWeight:700, color:'#fff',
          lineHeight:1.25, fontFamily:"'Georgia',serif",
          display:'-webkit-box', WebkitLineClamp: w > 90 ? 3 : 2, WebkitBoxOrient:'vertical', overflow:'hidden',
        }}>{book.title}</div>
        {w > 90 && (
          <div style={{ fontSize:8, color:'rgba(255,255,255,.6)', marginTop:3, fontFamily:'system-ui' }}>{book.author}</div>
        )}
      </div>
      {!book.available && (
        <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,.42)', display:'flex', alignItems:'center', justifyContent:'center' }}>
          <span style={{ fontSize:9, color:'rgba(255,255,255,.75)', fontWeight:700, letterSpacing:1.2, textTransform:'uppercase', fontFamily:'system-ui' }}>Snart</span>
        </div>
      )}
    </div>
  );
}

function Cover({ book, w, h, T }) {
  const radius = w > 90 ? 12 : 8;
  const shadow = `0 ${w > 90 ? 12 : 5}px ${w > 90 ? 32 : 14}px rgba(0,0,0,${T.isDark ? '.5' : '.2'})`;
  return (
    <PdfCover
      pdfPath={book.pdfPath}
      bookId={book.id}
      width={w}
      height={h}
      style={{ borderRadius: radius, boxShadow: shadow, border: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 }}
      fallback={<CssCover book={book} w={w} h={h} T={T} />}
    />
  );
}

/* ─────────────────────────────────────────────────────────────
   PDF READER
   - Renders PDF pages as <canvas> via pdf.js (CDN) so we get
     proper pinch-zoom, swipe-to-turn-page, and fit-to-screen.
   - Tab bar is hidden while reader is open (handled by parent
     via onReaderOpen / onReaderClose callbacks passed from App).
───────────────────────────────────────────────────────────── */

function PdfReader({ book, onClose, onSetPage, onAddBookmark, onRemoveBookmark, onToggleFav }) {
  const { theme: T } = useTheme();
  const [page, setPage]           = useState(book.lastReadPage || 1);
  const [total, setTotal]         = useState(book.pageCount || 99);
  const [controls, setControls]   = useState(true);
  const [bmToast, setBmToast]     = useState(false);
  const [jumping, setJumping]     = useState(false);
  const [jumpVal, setJumpVal]     = useState('');
  const [bmPanel, setBmPanel]     = useState(false);
  const [status, setStatus]       = useState('loading');
  const [scale, setScale]         = useState(1);
  // Page-turn animation: 'idle' | 'left' | 'right'
  const [pageAnim, setPageAnim]     = useState('idle');
  const [pageAnimKey, setPageAnimKey] = useState(0);
  // Search
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]); // [{page, snippet}]
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchDone, setSearchDone] = useState(false);

  const canvasRef    = useRef(null);
  const pdfDocRef    = useRef(null);
  const renderingRef = useRef(false);
  const timerRef     = useRef(null);
  const searchInputRef = useRef(null);

  const pinchRef = useRef({ active: false, startDist: 0, startScale: 1 });
  const swipeRef = useRef({ startX: 0, startY: 0, active: false });

  const isBookmarked = book.bookmarks.includes(page);

  // ── Auto-hide controls ──────────────────────────────────────────────────
  const resetTimer = useCallback(() => {
    setControls(true);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setControls(false), 3500);
  }, []);

  useEffect(() => { resetTimer(); return () => clearTimeout(timerRef.current); }, [resetTimer]);
  useEffect(() => { onSetPage(book.id, page, total); }, [page]); // eslint-disable-line

  // ── Load pdf.js ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (window.pdfjsLib) { loadDocument(); return; }
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      loadDocument();
    };
    script.onerror = () => setStatus('error');
    document.head.appendChild(script);
    return () => {};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadDocument = async () => {
    try {
      setStatus('loading');
      const pdf = await window.pdfjsLib.getDocument(book.pdfPath).promise;
      pdfDocRef.current = pdf;
      setTotal(pdf.numPages);
      setStatus('ready');
    } catch (e) {
      setStatus('error');
    }
  };

  // ── Render page ─────────────────────────────────────────────────────────
  const renderPage = useCallback(async (pageNum, extraScale = 1) => {
    if (!pdfDocRef.current) return;
    // Use a token to cancel stale renders — fixes blurry-page bug
    const token = Symbol();
    renderingRef.current = token;
    try {
      const pdfPage   = await pdfDocRef.current.getPage(pageNum);
      if (renderingRef.current !== token) return; // superseded
      const canvas    = canvasRef.current;
      if (!canvas) return;
      const viewport0 = pdfPage.getViewport({ scale: 1 });
      const container = canvas.parentElement;
      const fitScale  = Math.min(
        container.clientWidth  / viewport0.width,
        container.clientHeight / viewport0.height
      );
      const viewport = pdfPage.getViewport({ scale: fitScale * extraScale });
      const dpr = window.devicePixelRatio || 1;
      canvas.width  = viewport.width  * dpr;
      canvas.height = viewport.height * dpr;
      canvas.style.width  = viewport.width  + 'px';
      canvas.style.height = viewport.height + 'px';
      const ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (renderingRef.current !== token) return; // check again before draw
      await pdfPage.render({ canvasContext: ctx, viewport }).promise;
    } catch (e) {
      console.error('Render error', e);
    }
  }, []);

  useEffect(() => {
    if (status === 'ready') renderPage(page, scale);
  }, [status, page, scale, renderPage]);

  // Re-render on orientation/resize change
  useEffect(() => {
    const handler = () => {
      if (status === 'ready') {
        setTimeout(() => renderPage(page, scale), 120); // wait for layout
      }
    };
    window.addEventListener('resize', handler);
    window.addEventListener('orientationchange', handler);
    return () => {
      window.removeEventListener('resize', handler);
      window.removeEventListener('orientationchange', handler);
    };
  }, [status, page, scale, renderPage]);

  // ── Page navigation with animation ──────────────────────────────────────
  const goTo = useCallback((p, dir = null) => {
    const clamped = Math.max(1, Math.min(p, total));
    if (clamped === page) return;
    const direction = dir || (clamped > page ? 'left' : 'right');
    // Immediately update page — new canvas slides in, old one is gone
    setPage(clamped);
    setScale(1);
    setPageAnim(direction);
    setPageAnimKey(k => k + 1);
    // Reset anim state after animation completes
    setTimeout(() => setPageAnim('idle'), 300);
    resetTimer();
  }, [total, page, resetTimer]);

  // ── Full-text search ─────────────────────────────────────────────────────
  const runSearch = useCallback(async (q) => {
    if (!pdfDocRef.current || !q.trim()) { setSearchResults([]); setSearchDone(false); return; }
    setSearchLoading(true);
    setSearchDone(false);
    setSearchResults([]);
    const query = q.trim().toLowerCase();
    const results = [];
    const numPages = pdfDocRef.current.numPages;
    for (let i = 1; i <= numPages; i++) {
      try {
        const pdfPage  = await pdfDocRef.current.getPage(i);
        const content  = await pdfPage.getTextContent();
        const text     = content.items.map(it => it.str).join(' ');
        const lower    = text.toLowerCase();
        let idx = lower.indexOf(query);
        if (idx !== -1) {
          // Build a short snippet around the match
          const start   = Math.max(0, idx - 40);
          const end     = Math.min(text.length, idx + query.length + 40);
          const snippet = (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
          results.push({ page: i, snippet });
        }
      } catch {}
    }
    setSearchResults(results);
    setSearchLoading(false);
    setSearchDone(true);
  }, []);

  // Debounce search as user types
  const searchDebounceRef = useRef(null);
  const handleSearchInput = (val) => {
    setSearchQuery(val);
    setSearchDone(false);
    clearTimeout(searchDebounceRef.current);
    if (!val.trim()) { setSearchResults([]); return; }
    searchDebounceRef.current = setTimeout(() => runSearch(val), 500);
  };

  // Focus input when search opens
  useEffect(() => {
    if (showSearch) setTimeout(() => searchInputRef.current?.focus(), 80);
    else { setSearchQuery(''); setSearchResults([]); setSearchDone(false); }
  }, [showSearch]);

  // ── Touch ────────────────────────────────────────────────────────────────
  const onTouchStart = useCallback((e) => {
    resetTimer();
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchRef.current = { active: true, startDist: Math.hypot(dx, dy), startScale: scale };
      swipeRef.current.active = false;
    } else if (e.touches.length === 1) {
      swipeRef.current = { startX: e.touches[0].clientX, startY: e.touches[0].clientY, active: true };
    }
  }, [scale, resetTimer]);

  const onTouchMove = useCallback((e) => {
    if (e.touches.length === 2 && pinchRef.current.active) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      setScale(Math.max(0.5, Math.min(4, pinchRef.current.startScale * (dist / pinchRef.current.startDist))));
    }
  }, []);

  const onTouchEnd = useCallback((e) => {
    if (pinchRef.current.active) { pinchRef.current.active = false; return; }
    if (!swipeRef.current.active) return;
    const dx = e.changedTouches[0].clientX - swipeRef.current.startX;
    const dy = e.changedTouches[0].clientY - swipeRef.current.startY;
    swipeRef.current.active = false;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5 && scale <= 1.05) {
      if (dx < 0) goTo(page + 1, 'left');
      else goTo(page - 1, 'right');
    } else { resetTimer(); }
  }, [page, goTo, scale, resetTimer]);

  // ── Bookmark ─────────────────────────────────────────────────────────────
  const handleBookmark = () => {
    if (isBookmarked) { onRemoveBookmark(book.id, page); }
    else { onAddBookmark(book.id, page); setBmToast(true); setTimeout(() => setBmToast(false), 2200); }
    resetTimer();
  };

  // Slide in from correct direction when page changes
  const canvasAnimStyle = pageAnim === 'left'
    ? { animation: 'slideInLeft 280ms cubic-bezier(0.25, 0.46, 0.45, 0.94) both' }
    : pageAnim === 'right'
    ? { animation: 'slideInRight 280ms cubic-bezier(0.25, 0.46, 0.45, 0.94) both' }
    : {};

  return (
    <div
      style={{ position:'fixed', inset:0, zIndex:1000, background:'#0a0a0a', display:'flex', flexDirection:'column', touchAction:'none' }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onClick={resetTimer}
    >
      <style>{`
        @keyframes spin        { to { transform: rotate(360deg) } }
        @keyframes fadeUp      { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:translateY(0) } }
        @keyframes searchSlide { from { opacity:0; transform:translateY(-12px) } to { opacity:1; transform:translateY(0) } }

        /* Slide out current page */
        @keyframes slideOutLeft  { from { transform:translateX(0);     opacity:1 } to { transform:translateX(-60px);  opacity:0 } }
        @keyframes slideOutRight { from { transform:translateX(0);     opacity:1 } to { transform:translateX(60px);   opacity:0 } }
        /* Slide in new page */
        @keyframes slideInLeft   { from { transform:translateX(60px);  opacity:0 } to { transform:translateX(0);     opacity:1 } }
        @keyframes slideInRight  { from { transform:translateX(-60px); opacity:0 } to { transform:translateX(0);     opacity:1 } }
      `}</style>

      {/* TOP BAR */}
      <div style={{
        position:'absolute', top:0, left:0, right:0, zIndex:20,
        padding:'12px 14px', paddingTop:'max(14px,env(safe-area-inset-top))',
        background:'linear-gradient(to bottom,rgba(0,0,0,.92),transparent)',
        display:'flex', alignItems:'center', gap:10,
        transition:'opacity .3s, transform .3s',
        opacity: controls ? 1 : 0,
        transform: controls ? 'translateY(0)' : 'translateY(-100%)',
        pointerEvents: controls ? 'auto' : 'none',
      }}>
        <button onClick={onClose} style={btnStyle}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
        </button>
        <div style={{ flex:1, fontSize:14, fontWeight:700, color:'#fff', fontFamily:"'Georgia',serif", overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
          {book.title}
        </div>
        {/* Search toggle */}
        <button onClick={(e) => { e.stopPropagation(); setShowSearch(v => !v); setBmPanel(false); resetTimer(); }} style={btnStyle}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={showSearch ? T.accent : '#fff'} strokeWidth="2.2" strokeLinecap="round">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
        </button>
        <button onClick={() => { onToggleFav(book.id); resetTimer(); }} style={btnStyle}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill={book.isFavorite ? '#e05566' : 'none'} stroke={book.isFavorite ? '#e05566' : '#fff'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
          </svg>
        </button>
        <button onClick={(e) => { e.stopPropagation(); setBmPanel(v => !v); setShowSearch(false); resetTimer(); }} style={btnStyle}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
          </svg>
        </button>
      </div>

      {/* SEARCH PANEL */}
      {showSearch && (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position:'absolute', top:0, left:0, right:0, zIndex:25,
            paddingTop:'max(56px,calc(env(safe-area-inset-top) + 52px))',
            background:'linear-gradient(to bottom,rgba(0,0,0,.97) 80%,transparent)',
            animation:'searchSlide .22s ease',
          }}
        >
          {/* Input row */}
          <div style={{ display:'flex', alignItems:'center', gap:8, padding:'0 14px 10px' }}>
            <div style={{ flex:1, display:'flex', alignItems:'center', background:'rgba(255,255,255,.12)', borderRadius:12, border:'1px solid rgba(255,255,255,.2)', padding:'9px 12px', gap:8 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.5)" strokeWidth="2.2" strokeLinecap="round" style={{ flexShrink:0 }}>
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Sök i boken…"
                value={searchQuery}
                onChange={e => handleSearchInput(e.target.value)}
                style={{ flex:1, background:'none', border:'none', outline:'none', color:'#fff', fontSize:14, fontFamily:'system-ui' }}
              />
              {searchQuery.length > 0 && (
                <button onClick={() => handleSearchInput('')} style={{ background:'none', border:'none', cursor:'pointer', color:'rgba(255,255,255,.5)', fontSize:16, lineHeight:1, padding:0 }}>×</button>
              )}
            </div>
            <button onClick={() => setShowSearch(false)} style={{ background:'none', border:'none', cursor:'pointer', color:'rgba(255,255,255,.6)', fontSize:13, fontFamily:'system-ui', padding:'4px 2px', whiteSpace:'nowrap' }}>
              Stäng
            </button>
          </div>

          {/* Results */}
          {(searchLoading || searchResults.length > 0 || (searchDone && searchResults.length === 0)) && (
            <div style={{ maxHeight:260, overflowY:'auto', borderTop:'1px solid rgba(255,255,255,.08)' }}>
              {searchLoading && (
                <div style={{ display:'flex', alignItems:'center', gap:10, padding:'14px 16px' }}>
                  <div style={{ width:16, height:16, borderRadius:'50%', border:'2px solid rgba(255,255,255,.1)', borderTopColor:T.accent, animation:'spin .7s linear infinite', flexShrink:0 }}/>
                  <span style={{ fontSize:13, color:'rgba(255,255,255,.5)', fontFamily:'system-ui' }}>Söker igenom {total} sidor…</span>
                </div>
              )}
              {!searchLoading && searchDone && searchResults.length === 0 && (
                <div style={{ padding:'14px 16px', fontSize:13, color:'rgba(255,255,255,.4)', fontFamily:'system-ui' }}>
                  Inga träffar för "{searchQuery}"
                </div>
              )}
              {!searchLoading && searchResults.map((r, i) => (
                <button
                  key={i}
                  onClick={() => { goTo(r.page); setShowSearch(false); }}
                  style={{
                    display:'block', width:'100%', textAlign:'left',
                    padding:'11px 16px', background:'none', border:'none',
                    borderBottom:'1px solid rgba(255,255,255,.06)', cursor:'pointer',
                    WebkitTapHighlightColor:'transparent',
                  }}
                >
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                    <span style={{ fontSize:11, fontWeight:700, color:T.accent, fontFamily:'system-ui', background:'rgba(45,139,120,.2)', padding:'2px 8px', borderRadius:10 }}>
                      Sida {r.page}
                    </span>
                  </div>
                  <div style={{ fontSize:12, color:'rgba(255,255,255,.55)', lineHeight:1.5, fontFamily:'system-ui', overflow:'hidden', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical' }}>
                    {r.snippet}
                  </div>
                </button>
              ))}
              {!searchLoading && searchResults.length > 0 && (
                <div style={{ padding:'8px 16px', fontSize:11, color:'rgba(255,255,255,.3)', fontFamily:'system-ui' }}>
                  {searchResults.length} träff{searchResults.length !== 1 ? 'ar' : ''}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* BOOKMARKS PANEL */}
      {bmPanel && (
        <div onClick={e => e.stopPropagation()} style={{
          position:'absolute', top:56, right:12, zIndex:30,
          background: T.isDark ? 'rgba(15,15,15,.97)' : 'rgba(255,255,255,.97)',
          border:`1px solid ${T.border}`, borderRadius:14, padding:12, minWidth:170,
          boxShadow:'0 8px 40px rgba(0,0,0,.6)',
        }}>
          <div style={{ fontSize:10, fontWeight:700, color:T.textMuted, letterSpacing:1.2, textTransform:'uppercase', marginBottom:8, fontFamily:'system-ui' }}>Bokmärken</div>
          {book.bookmarks.length === 0
            ? <div style={{ fontSize:13, color:T.textMuted, fontFamily:'system-ui' }}>Inga bokmärken ännu</div>
            : book.bookmarks.map(p => (
              <div key={p} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'5px 0' }}>
                <button onClick={() => { goTo(p); setBmPanel(false); }} style={{ background:'none', border:'none', cursor:'pointer', fontSize:13, color:T.text, fontFamily:'system-ui', padding:0 }}>Sida {p}</button>
                <button onClick={() => onRemoveBookmark(book.id, p)} style={{ background:'none', border:'none', cursor:'pointer', color:T.textMuted, fontSize:18, lineHeight:1, padding:'0 2px' }}>×</button>
              </div>
            ))
          }
        </div>
      )}

      {/* CANVAS AREA */}
      <div style={{
        flex:1, position:'relative', background:'#111',
        display:'flex', alignItems:'center', justifyContent:'center',
        overflow: scale > 1.05 ? 'auto' : 'hidden',
        WebkitOverflowScrolling: 'touch',
      }}>
        <canvas
          key={pageAnimKey}
          ref={canvasRef}
          style={{
            display: status === 'ready' ? 'block' : 'none',
            willChange: 'transform, opacity',
            imageRendering: 'crisp-edges',
            ...canvasAnimStyle,
          }}
        />

        {status === 'loading' && (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:12 }}>
            <div style={{ width:30, height:30, borderRadius:'50%', border:`3px solid rgba(255,255,255,.1)`, borderTopColor:T.accent, animation:'spin .8s linear infinite' }}/>
            <div style={{ color:'rgba(255,255,255,.4)', fontSize:12, fontFamily:'system-ui' }}>Laddar PDF…</div>
          </div>
        )}

        {status === 'error' && (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:12, padding:24 }}>
            <div style={{ fontSize:44 }}>📄</div>
            <div style={{ color:'#fff', fontSize:16, fontWeight:700, fontFamily:'system-ui', textAlign:'center' }}>Kunde inte ladda PDF:en</div>
            <div style={{ color:'rgba(255,255,255,.5)', fontSize:13, textAlign:'center', fontFamily:'system-ui' }}>Kontrollera att filen finns i public/books/</div>
            <button onClick={loadDocument} style={{ marginTop:8, padding:'10px 24px', borderRadius:12, background:T.accent, color:'#fff', border:'none', cursor:'pointer', fontSize:14, fontWeight:700, fontFamily:'system-ui' }}>
              Försök igen
            </button>
          </div>
        )}

        {/* Tap zones */}
        {status === 'ready' && scale <= 1.05 && (
          <>
            <div onClick={(e) => { e.stopPropagation(); goTo(page - 1, 'right'); }} style={{ position:'absolute', left:0, top:0, bottom:0, width:'20%', cursor:'pointer', zIndex:5 }} />
            <div onClick={(e) => { e.stopPropagation(); goTo(page + 1, 'left');  }} style={{ position:'absolute', right:0, top:0, bottom:0, width:'20%', cursor:'pointer', zIndex:5 }} />
          </>
        )}

        {/* Arrow hints */}
        {status === 'ready' && controls && scale <= 1.05 && (
          <>
            {page > 1 && (
              <div style={{ position:'absolute', left:8, top:'50%', transform:'translateY(-50%)', background:'rgba(0,0,0,.4)', borderRadius:8, padding:'10px 6px', pointerEvents:'none', opacity:.6 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg>
              </div>
            )}
            {page < total && (
              <div style={{ position:'absolute', right:8, top:'50%', transform:'translateY(-50%)', background:'rgba(0,0,0,.4)', borderRadius:8, padding:'10px 6px', pointerEvents:'none', opacity:.6 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>
              </div>
            )}
          </>
        )}

        {/* Zoom indicator */}
        {scale > 1.1 && (
          <div style={{ position:'absolute', bottom:100, left:'50%', transform:'translateX(-50%)', background:'rgba(0,0,0,.6)', borderRadius:20, padding:'4px 12px', fontSize:11, color:'rgba(255,255,255,.7)', fontFamily:'system-ui', pointerEvents:'none' }}>
            {Math.round(scale * 100)}%
          </div>
        )}
      </div>

      {/* BOTTOM CONTROLS */}
      <div style={{
        position:'absolute', bottom:0, left:0, right:0, zIndex:20,
        padding:'28px 16px 16px', paddingBottom:'max(18px,env(safe-area-inset-bottom))',
        background:'linear-gradient(transparent,rgba(0,0,0,.92))',
        transition:'opacity .3s, transform .3s',
        opacity: controls ? 1 : 0,
        transform: controls ? 'translateY(0)' : 'translateY(100%)',
        pointerEvents: controls ? 'auto' : 'none',
      }}>
        {bmToast && (
          <div style={{ position:'absolute', top:-36, left:'50%', transform:'translateX(-50%)', background:T.accent, color:'#fff', borderRadius:20, padding:'6px 18px', fontSize:12, fontWeight:700, fontFamily:'system-ui', whiteSpace:'nowrap', animation:'fadeUp .25s ease' }}>
            ✓ Bokmärke sparat — sida {page}
          </div>
        )}

        {/* Scrubber */}
        <style>{`
          input[type=range]{-webkit-appearance:none;appearance:none;height:3px;border-radius:3px;background:rgba(255,255,255,.2);outline:none;cursor:pointer}
          input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:20px;height:20px;border-radius:50%;background:#fff;cursor:pointer}
        `}</style>
        <input type="range" min={1} max={total} value={page}
          onChange={e => goTo(Number(e.target.value))}
          style={{ width:'100%', marginBottom:12 }}
        />

        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
          <button onClick={() => goTo(page - 1)} disabled={page <= 1} style={{ ...navBtnStyle, opacity: page <= 1 ? .3 : 1 }}>‹</button>

          <button onClick={() => { setJumping(v => !v); setJumpVal(String(page)); }}
            style={{ background:'none', border:'none', cursor:'pointer', color:'#fff', fontFamily:'system-ui', WebkitTapHighlightColor:'transparent', minWidth:80, textAlign:'center' }}>
            {jumping ? (
              <input
                type="number" value={jumpVal} min={1} max={total} autoFocus
                onChange={e => setJumpVal(e.target.value)}
                onKeyDown={e => { if(e.key==='Enter'){ goTo(Number(jumpVal)); setJumping(false); }}}
                onClick={e => e.stopPropagation()}
                style={{ width:64, textAlign:'center', background:'rgba(255,255,255,.15)', border:'1px solid rgba(255,255,255,.3)', borderRadius:8, color:'#fff', padding:'5px 6px', fontSize:14, fontFamily:'system-ui', outline:'none' }}
              />
            ) : (
              <>
                <div style={{ fontSize:15, fontWeight:700 }}>{page} / {total}</div>
                <div style={{ fontSize:9, opacity:.5, letterSpacing:.5, textTransform:'uppercase' }}>tryck för att hoppa</div>
              </>
            )}
          </button>

          <button onClick={handleBookmark} style={{ background:'rgba(255,255,255,.12)', border:'none', borderRadius:10, padding:'8px 14px', cursor:'pointer', WebkitTapHighlightColor:'transparent' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill={isBookmarked ? T.accent : 'none'} stroke={isBookmarked ? T.accent : '#fff'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
            </svg>
          </button>

          <button onClick={() => goTo(page + 1)} disabled={page >= total} style={{ ...navBtnStyle, opacity: page >= total ? .3 : 1 }}>›</button>
        </div>
      </div>
    </div>
  );
}

const btnStyle    = { background:'none', border:'none', cursor:'pointer', padding:7, WebkitTapHighlightColor:'transparent' };
const navBtnStyle = { background:'rgba(255,255,255,.12)', border:'none', borderRadius:10, padding:'8px 18px', color:'#fff', cursor:'pointer', fontSize:22, lineHeight:1, WebkitTapHighlightColor:'transparent' };

/* ─────────────────────────────────────────────────────────────
   BOOK DETAIL
───────────────────────────────────────────────────────────── */
function BookDetail({ book, allBooks, onBack, onRead, onToggleFav, onSelectRelated, T }) {
  const detailRef = useRef(null);
  useEffect(() => {
    if (detailRef.current) detailRef.current.scrollTop = 0;
  }, [book.id]);
  const hasProgress = book.progressPercent > 0 && book.lastReadPage > 1;
  const related = allBooks.filter(b => b.category === book.category && b.id !== book.id && b.available).slice(0, 4);
  // ~1.5 min per page for a PDF e-book (slower than prose)
  const readingMins = book.pageCount ? Math.round(book.pageCount * 1.5) : null;
  const readingLabel = readingMins
    ? readingMins >= 60
      ? `${Math.floor(readingMins / 60)} h ${readingMins % 60} min`
      : `${readingMins} min`
    : null;

  return (
    <div ref={detailRef} style={{ background:T.bg, height:'100%', overflowY:'auto', WebkitOverflowScrolling:'touch', fontFamily:"'Georgia',serif" }}>
      <div style={{ background:`linear-gradient(180deg, ${book.coverColor}dd 0%, ${book.coverColor}44 60%, ${T.bg} 100%)`, paddingBottom:28 }}>
        <div style={{ display:'flex', justifyContent:'space-between', padding:'14px 14px 0', paddingTop:'max(14px,env(safe-area-inset-top))' }}>
          <button onClick={onBack} style={{ background:'rgba(0,0,0,.3)', border:'none', borderRadius:10, padding:'8px 12px', cursor:'pointer', color:'#fff', display:'flex', alignItems:'center', gap:6, WebkitTapHighlightColor:'transparent' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
            <span style={{ fontSize:13, fontFamily:'system-ui', fontWeight:600 }}>Tillbaka</span>
          </button>
          <button onClick={() => onToggleFav(book.id)} style={{ background:'rgba(0,0,0,.3)', border:'none', borderRadius:10, padding:'8px 12px', cursor:'pointer', WebkitTapHighlightColor:'transparent' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill={book.isFavorite ? '#e05566' : 'none'} stroke={book.isFavorite ? '#e05566' : '#fff'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
            </svg>
          </button>
        </div>

        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', paddingTop:24, gap:16 }}>
          <Cover book={book} w={140} h={196} T={T} />
          <div style={{ textAlign:'center', padding:'0 20px' }}>
            <h1 style={{ fontSize:22, fontWeight:700, color:'#fff', margin:'0 0 6px', lineHeight:1.3 }}>{book.title}</h1>
            <div style={{ fontSize:15, fontWeight:600, color:'rgba(255,255,255,.95)', fontFamily:'system-ui', marginBottom:10, textShadow:'0 1px 4px rgba(0,0,0,.5)' }}>{book.author}</div>
            <div style={{ display:'flex', gap:7, justifyContent:'center', flexWrap:'wrap' }}>
              <CatChip categoryId={book.category} T={T} />
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding:'0 16px 40px' }}>
        {hasProgress && (
          <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:14, padding:'14px 16px', marginBottom:16 }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
              <span style={{ fontSize:11, fontWeight:700, color:T.textMuted, textTransform:'uppercase', letterSpacing:.6, fontFamily:'system-ui' }}>Läsframsteg</span>
              <span style={{ fontSize:11, color:T.accent, fontWeight:700, fontFamily:'system-ui' }}>{book.progressPercent}%</span>
            </div>
            <ProgressBar pct={book.progressPercent} T={T} h={5} />
            <div style={{ fontSize:12, color:T.textMuted, marginTop:6, fontFamily:'system-ui' }}>Senast på sida {book.lastReadPage}</div>
          </div>
        )}

        <div style={{ display:'flex', gap:10, marginBottom:22 }}>
          {book.available ? (
            <>
              <button onClick={() => onRead(null)} style={{ flex:1, padding:'14px', borderRadius:14, background:T.accent, color:'#fff', border:'none', cursor:'pointer', fontSize:15, fontWeight:700, fontFamily:'system-ui', WebkitTapHighlightColor:'transparent' }}>
                {hasProgress ? `Fortsätt — sida ${book.lastReadPage}` : 'Läs nu'}
              </button>
              {hasProgress && (
                <button onClick={() => onRead(1)} style={{ padding:'14px 14px', borderRadius:14, background:T.card, color:T.textSecondary, border:`1px solid ${T.border}`, cursor:'pointer', fontSize:13, fontWeight:600, fontFamily:'system-ui', WebkitTapHighlightColor:'transparent', whiteSpace:'nowrap' }}>
                  Från början
                </button>
              )}
            </>
          ) : (
            <div style={{ flex:1, padding:14, borderRadius:14, background:T.card, border:`1px solid ${T.border}`, textAlign:'center', fontSize:14, color:T.textMuted, fontFamily:'system-ui' }}>
              Kommer snart — ladda upp PDF för att aktivera
            </div>
          )}
        </div>

        {book.bookmarks.length > 0 && (
          <div style={{ marginBottom:20 }}>
            <SectionLabel label="Bokmärken" T={T} />
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              {book.bookmarks.map(p => (
                <button key={p} onClick={() => onRead(p)} style={{ padding:'6px 14px', borderRadius:20, background:T.card, border:`1px solid ${T.accent}55`, color:T.accent, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'system-ui', WebkitTapHighlightColor:'transparent' }}>
                  Sida {p}
                </button>
              ))}
            </div>
          </div>
        )}

        <div style={{ marginBottom:22 }}>
          <SectionLabel label="Om boken" T={T} />
          <p style={{ fontSize:15, lineHeight:1.75, color:T.textSecondary, margin:'0 0 14px' }}>{book.longDescription}</p>
          <div style={{ display:'flex', flexWrap:'wrap', gap:'6px 20px' }}>
            {book.pageCount && (
              <span style={{ fontSize:13, color:T.textMuted, fontFamily:'system-ui' }}>
                📄 <strong style={{ color:T.text }}>{book.pageCount}</strong> sidor
              </span>
            )}
            {readingLabel && (
              <span style={{ fontSize:13, color:T.textMuted, fontFamily:'system-ui' }}>
                ⏱ Ca <strong style={{ color:T.text }}>{readingLabel}</strong> att läsa
              </span>
            )}
            {book.publishedYear && (
              <span style={{ fontSize:13, color:T.textMuted, fontFamily:'system-ui' }}>
                📅 Utgiven <strong style={{ color:T.text }}>{book.publishedYear}</strong>
              </span>
            )}
          </div>
        </div>


        {related.length > 0 && (
          <div>
            <SectionLabel label="Fler böcker i kategorin" T={T} />
            <div style={{ display:'flex', gap:12, overflowX:'auto', paddingBottom:4, scrollbarWidth:'none' }}>
              {related.map(b => (
                <button key={b.id} onClick={() => onSelectRelated(b)} style={{ flexShrink:0, background:'none', border:'none', cursor:'pointer', padding:0, textAlign:'left', WebkitTapHighlightColor:'transparent' }}>
                  <Cover book={b} w={70} h={98} T={T} />
                  <div style={{ width:70, fontSize:10, color:T.textMuted, marginTop:4, lineHeight:1.3, fontFamily:'system-ui', overflow:'hidden', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical' }}>{b.title}</div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SectionLabel({ label, T }) {
  return <div style={{ fontSize:10, fontWeight:700, color:T.textMuted, textTransform:'uppercase', letterSpacing:1.2, marginBottom:10, fontFamily:'system-ui' }}>{label}</div>;
}

/* ─────────────────────────────────────────────────────────────
   LIBRARY
───────────────────────────────────────────────────────────── */
const SORT_OPTS = [
  { id:'az',        label:'A – Ö' },
  { id:'recent',    label:'Senast öppnad' },
  { id:'newest',    label:'Nyast utgiven' },
  { id:'favorites', label:'Favoriter' },
];

function Library({ books, onSelect, T }) {
  const [cat,      setCat]      = useState('all');
  const [sort,     setSort]     = useState('newest');
  const [query,    setQuery]    = useState('');
  const [sortOpen, setSortOpen] = useState(false);

  const favorites  = useMemo(() => books.filter(b => b.isFavorite), [books]);
  const inProgress = useMemo(() => books.filter(b => b.progressPercent > 0 && b.progressPercent < 100 && b.available), [books]);

  const filtered = useMemo(() => {
    let list = cat === 'all' ? books : books.filter(b => b.category === cat);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(b =>
        b.title.toLowerCase().includes(q) ||
        b.author.toLowerCase().includes(q) ||
        b.tags?.some(t => t.toLowerCase().includes(q))
      );
    }
    if (sort === 'az')        return [...list].sort((a, b) => a.title.localeCompare(b.title, 'sv'));
    if (sort === 'recent')    return [...list].sort((a, b) => (b.lastOpenedAt || 0) - (a.lastOpenedAt || 0));
    if (sort === 'newest')    return [...list].sort((a, b) => (b.publishedYear || 0) - (a.publishedYear || 0));
    if (sort === 'favorites') return [...list].sort((a, b) => (b.isFavorite ? 1 : 0) - (a.isFavorite ? 1 : 0));
    return list;
  }, [books, cat, query, sort]);

  const showSections = !query && cat === 'all';

  return (
    <div style={{ background:T.bg, minHeight:'100%', fontFamily:'system-ui,sans-serif' }} onClick={() => setSortOpen(false)}>
      <style>{`
        @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        ::-webkit-scrollbar{display:none}
        input::placeholder{color:${T.textMuted};opacity:.7}
      `}</style>

      <div style={{ padding:'20px 16px 0' }}>
        <h1 style={{ fontSize:27, fontWeight:800, color:T.text, margin:'0 0 16px', letterSpacing:'-.5px', fontFamily:"'Georgia',serif" }}>E-böcker</h1>

        <div style={{ position:'relative', marginBottom:12 }}>
          <svg style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', pointerEvents:'none' }} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={T.textMuted} strokeWidth="2.2" strokeLinecap="round">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            type="text" placeholder="Sök titel, författare, ämne…"
            value={query} onChange={e => setQuery(e.target.value)}
            style={{ width:'100%', padding:'11px 12px 11px 36px', borderRadius:12, background:T.card, border:`1px solid ${T.border}`, color:T.text, fontSize:14, outline:'none', boxSizing:'border-box', fontFamily:'system-ui' }}
          />
        </div>

        <div style={{ display:'flex', gap:7, overflowX:'auto', paddingBottom:14, scrollbarWidth:'none', WebkitOverflowScrolling:'touch' }}>
          {CATEGORIES.map(c => {
            const active = cat === c.id;
            return (
              <button key={c.id} onClick={() => setCat(c.id)} style={{
                flexShrink:0, padding:'6px 14px', borderRadius:20,
                background: active ? T.accent : T.card,
                color: active ? '#fff' : T.textSecondary,
                border: `1px solid ${active ? T.accent : T.border}`,
                fontSize:12, fontWeight: active ? 700 : 500, cursor:'pointer',
                WebkitTapHighlightColor:'transparent', transition:'all .18s',
              }}>{c.label}</button>
            );
          })}
        </div>
      </div>

      {showSections && inProgress.length > 0 && (
        <Section title="Fortsätt läsa" T={T}>
          <div style={{ display:'flex', gap:12, overflowX:'auto', paddingBottom:4, WebkitOverflowScrolling:'touch' }}>
            {inProgress.map(b => (
              <button key={b.id} onClick={() => onSelect(b)} style={{ flexShrink:0, width:130, background:T.card, border:`1px solid ${T.border}`, borderRadius:14, padding:12, cursor:'pointer', textAlign:'left', WebkitTapHighlightColor:'transparent' }}>
                <Cover book={b} w={106} h={148} T={T} />
                <div style={{ fontSize:11, fontWeight:700, color:T.text, marginTop:8, lineHeight:1.3, overflow:'hidden', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical' }}>{b.title}</div>
                <ProgressBar pct={b.progressPercent} T={T} />
                <div style={{ fontSize:10, color:T.accent, marginTop:3, fontWeight:700 }}>Sida {b.lastReadPage}</div>
              </button>
            ))}
          </div>
        </Section>
      )}

      {showSections && favorites.length > 0 && (
        <Section title="Favoriter" T={T}>
          <div style={{ display:'flex', gap:12, overflowX:'auto', paddingBottom:4, WebkitOverflowScrolling:'touch' }}>
            {favorites.map(b => (
              <button key={b.id} onClick={() => onSelect(b)} style={{ flexShrink:0, background:'none', border:'none', cursor:'pointer', padding:0, WebkitTapHighlightColor:'transparent' }}>
                <Cover book={b} w={70} h={98} T={T} />
                <div style={{ width:70, fontSize:10, color:T.textMuted, marginTop:4, lineHeight:1.3, overflow:'hidden', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical' }}>{b.title}</div>
              </button>
            ))}
          </div>
        </Section>
      )}

      <div style={{ padding:'0 16px 40px' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
          <div style={{ fontSize:10, fontWeight:700, color:T.textMuted, textTransform:'uppercase', letterSpacing:1.2 }}>
            {query ? `Resultat (${filtered.length})` : 'Alla böcker'}
          </div>
          <div style={{ position:'relative' }} onClick={e => e.stopPropagation()}>
            <button onClick={() => setSortOpen(v => !v)} style={{ display:'flex', alignItems:'center', gap:5, background:T.card, border:`1px solid ${T.border}`, borderRadius:10, padding:'5px 10px', cursor:'pointer', fontSize:11, fontWeight:600, color:T.textMuted, WebkitTapHighlightColor:'transparent' }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M3 6h18M7 12h10M11 18h2"/></svg>
              {SORT_OPTS.find(s => s.id === sort)?.label}
            </button>
            {sortOpen && (
              <div style={{ position:'absolute', right:0, top:32, background:T.card, border:`1px solid ${T.border}`, borderRadius:12, overflow:'hidden', zIndex:50, minWidth:155, boxShadow:`0 8px 28px rgba(0,0,0,.22)` }}>
                {SORT_OPTS.map(opt => (
                  <button key={opt.id} onClick={() => { setSort(opt.id); setSortOpen(false); }} style={{ display:'block', width:'100%', padding:'10px 14px', textAlign:'left', background: sort === opt.id ? T.accentGlow : 'none', border:'none', cursor:'pointer', fontSize:13, fontWeight: sort === opt.id ? 700 : 400, color: sort === opt.id ? T.accent : T.text, fontFamily:'system-ui' }}>
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div style={{ textAlign:'center', paddingTop:48 }}>
            <div style={{ fontSize:40, marginBottom:12 }}>🔍</div>
            <div style={{ fontSize:15, fontWeight:700, color:T.text, marginBottom:6 }}>Inga böcker hittades</div>
            <div style={{ fontSize:13, color:T.textMuted }}>Prova ett annat sökord eller kategori</div>
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {filtered.map((b, i) => <BookRow key={b.id} book={b} onSelect={() => onSelect(b)} T={T} idx={i} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, children, T }) {
  return (
    <div style={{ padding:'0 16px 20px' }}>
      <div style={{ fontSize:10, fontWeight:700, color:T.textMuted, textTransform:'uppercase', letterSpacing:1.2, marginBottom:12 }}>{title}</div>
      {children}
    </div>
  );
}

function BookRow({ book, onSelect, T, idx }) {
  const mins = book.pageCount ? Math.round(book.pageCount * 1.5) : null;
  const timeLabel = mins ? (mins >= 60 ? `${Math.floor(mins/60)}h ${mins%60}m` : `${mins} min`) : null;
  return (
    <button onClick={onSelect} style={{
      display:'flex', alignItems:'center', gap:14,
      background:T.card, border:`1px solid ${T.border}`,
      borderRadius:14, padding:12, cursor:'pointer', textAlign:'left',
      WebkitTapHighlightColor:'transparent',
      animation:`fadeIn .3s ease both`, animationDelay:`${idx * 25}ms`,
    }}>
      <Cover book={book} w={64} h={90} T={T} />
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:14, fontWeight:700, color:T.text, marginBottom:3, lineHeight:1.3, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontFamily:"'Georgia',serif" }}>{book.title}</div>
        <div style={{ fontSize:12, color:T.textSecondary, marginBottom:5, fontWeight:500 }}>{book.author}</div>
        <div style={{ display:'flex', gap:6, alignItems:'center', flexWrap:'wrap' }}>
          <CatChip categoryId={book.category} T={T} small />
          {book.pageCount && <span style={{ fontSize:9, color:T.textMuted }}>{book.pageCount} s.</span>}
          {timeLabel && <span style={{ fontSize:9, color:T.textMuted }}>⏱ {timeLabel}</span>}
          {!book.available && <span style={{ fontSize:9, color:T.textMuted, background:T.bgSecondary, padding:'2px 7px', borderRadius:10 }}>Snart</span>}
          {book.isFavorite && <span style={{ fontSize:11 }}>❤️</span>}
        </div>
        {book.progressPercent > 0 && <ProgressBar pct={book.progressPercent} T={T} />}
      </div>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={T.textMuted} strokeWidth="2" strokeLinecap="round" style={{ flexShrink:0, opacity:.35 }}><path d="M9 18l6-6-6-6"/></svg>
    </button>
  );
}

/* ─────────────────────────────────────────────────────────────
   ROOT SCREEN
   Passes isReaderOpen up so App.js can hide/show the tab bar.
───────────────────────────────────────────────────────────── */
export default function EbooksScreen({ onReaderOpen, onReaderClose, resetToLibrary, onTabBarHide, onTabBarShow }) {
  const { theme: T } = useTheme();
  const { books, toggleFavorite, setLastReadPage, addBookmark, removeBookmark, markOpened } = useBooks();

  const [view,       setView]       = useState('library');
  const [selectedId, setSelectedId] = useState(null);
  const [readerPage, setReaderPage] = useState(null);

  // When tab is pressed again, reset to library
  useEffect(() => {
    if (resetToLibrary) {
      setView('library');
      setSelectedId(null);
      setReaderPage(null);
      onReaderClose?.();
    }
  }, [resetToLibrary]); // eslint-disable-line

  const selectedBook = useMemo(() => books.find(b => b.id === selectedId) || null, [books, selectedId]);

  const openDetail = useCallback((book) => {
    markOpened(book.id);
    setSelectedId(book.id);
    setView('detail');
  }, [markOpened]);

  const openReader = useCallback((startPage = null) => {
    setReaderPage(startPage);
    setView('reader');
    onReaderOpen?.();
    onTabBarHide?.();
  }, [onReaderOpen]);

  const closeReader = useCallback(() => {
    setView('detail');
    setReaderPage(null);
    onReaderClose?.();
    onTabBarShow?.();
  }, [onReaderClose]);

  const readerBook = useMemo(() => {
    if (!selectedBook) return null;
    if (readerPage != null) return { ...selectedBook, lastReadPage: readerPage };
    return selectedBook;
  }, [selectedBook, readerPage]);

  if (view === 'reader' && readerBook) {
    return (
      <PdfReader
        book={readerBook}
        onClose={closeReader}
        onSetPage={setLastReadPage}
        onAddBookmark={addBookmark}
        onRemoveBookmark={removeBookmark}
        onToggleFav={toggleFavorite}
      />
    );
  }

  if (view === 'detail' && selectedBook) {
    return (
      <BookDetail
        book={selectedBook}
        allBooks={books}
        onBack={() => setView('library')}
        onRead={(pg) => openReader(pg)}
        onToggleFav={toggleFavorite}
        onSelectRelated={(b) => { markOpened(b.id); setSelectedId(b.id); }}
        T={T}
      />
    );
  }

  return <Library books={books} onSelect={openDetail} T={T} />;
}
