import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTheme } from '../context/ThemeContext';
import names from '../data/asmaul_husna.json';

const FAV_KEY = 'asmaul_husna_favorites';
function loadFavs() {
  try { return new Set(JSON.parse(localStorage.getItem(FAV_KEY) || '[]')); }
  catch { return new Set(); }
}
function saveFavs(set) {
  try { localStorage.setItem(FAV_KEY, JSON.stringify([...set])); } catch {}
}

function Heart({ filled, size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24"
      fill={filled ? '#e53e3e' : 'none'}
      stroke={filled ? '#e53e3e' : 'currentColor'}
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
    </svg>
  );
}

// ── Grid card — 2 columns, no Swedish, play button, rounded + shadow ──
function GridCard({ name, onPress, isFav, onToggleFav, T }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);

  const togglePlay = e => {
    e.stopPropagation();
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) { audio.pause(); audio.currentTime = 0; setPlaying(false); }
    else { audio.play().then(() => setPlaying(true)).catch(() => {}); }
  };

  return (
    <div style={{ position: 'relative' }}>
      <audio ref={audioRef} src={`audio/${name.nr}.mp3`} onEnded={() => setPlaying(false)} />

      {/* Heart — top right, own tap target */}
      <button
        onClick={e => { e.stopPropagation(); onToggleFav(); }}
        style={{
          position: 'absolute', top: 10, right: 10, zIndex: 2,
          background: 'none', border: 'none', cursor: 'pointer', padding: 4,
          color: isFav ? '#e53e3e' : 'rgba(128,128,128,0.7)',
          WebkitTapHighlightColor: 'transparent',
          display: 'flex', alignItems: 'center',
        }}
      >
        <Heart filled={isFav} size={18} />
      </button>

      {/* Card — tappable for detail */}
      <button
        onClick={onPress}
        style={{
          width: '100%',
          background: T.card,
          border: `1px solid ${T.border}`,
          borderRadius: 22,
          boxShadow: T.isDark
            ? '0 4px 20px rgba(0,0,0,0.4)'
            : '0 4px 20px rgba(0,0,0,0.09)',
          padding: '12px 12px 14px',
          cursor: 'pointer', textAlign: 'center',
          WebkitTapHighlightColor: 'transparent',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          gap: 6, boxSizing: 'border-box',
          fontFamily: "'Inter',system-ui,sans-serif",
          transition: 'transform .1s',
        }}
      >
        {/* Number — top left */}
        <div style={{
          alignSelf: 'flex-start',
          width: 26, height: 26, borderRadius: 13,
          background: `${T.accent}18`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10, fontWeight: 700, color: T.accent,
          fontVariantNumeric: 'tabular-nums',
        }}>{name.nr}</div>

        {/* Arabic — large centre */}
        <div style={{
          fontSize: 40, lineHeight: 1.35, color: T.text,
          fontFamily: "'Scheherazade New','Traditional Arabic','Arial Unicode MS',serif",
          direction: 'rtl', minHeight: 58,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: '100%',
        }}>{name.arabic}</div>

        {/* Transliteration only */}
        <div style={{
          fontSize: 12, fontWeight: 700, color: T.text,
          lineHeight: 1.2, textAlign: 'center', letterSpacing: '-.1px',
        }}>{name.transliteration}</div>

        {/* Play button */}
        <button
          onClick={togglePlay}
          style={{
            marginTop: 4,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 32, height: 32, borderRadius: 16,
            background: playing ? T.accent : `${T.accent}18`,
            border: `1.5px solid ${T.accent}`,
            cursor: 'pointer', color: playing ? '#fff' : T.accent,
            WebkitTapHighlightColor: 'transparent',
            transition: 'all .15s',
          }}
        >
          {playing
            ? <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
            : <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3"/></svg>
          }
        </button>
      </button>
    </div>
  );
}

// ── List row ──────────────────────────────────────────────────
function ListRow({ name, onPress, isFav, onToggleFav, T }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center',
      borderBottom: `1px solid ${T.border}`,
      background: T.card,
      fontFamily: "'Inter',system-ui,sans-serif",
    }}>
      <button
        onClick={onPress}
        style={{
          flex: 1, display: 'flex', alignItems: 'center', gap: 12,
          padding: '13px 0 13px 16px',
          background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
          WebkitTapHighlightColor: 'transparent', minWidth: 0,
        }}
      >
        <div style={{
          width: 34, height: 34, borderRadius: 17, flexShrink: 0,
          background: `${T.accent}18`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 700, color: T.accent,
          fontVariantNumeric: 'tabular-nums',
        }}>{name.nr}</div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.text, lineHeight: 1.2 }}>
            {name.transliteration}
          </div>
          <div style={{ fontSize: 12, color: T.textMuted, fontWeight: 400, marginTop: 2, lineHeight: 1.3 }}>
            {name.swedish}
          </div>
        </div>

        <div style={{
          fontSize: 26, color: T.text, lineHeight: 1,
          fontFamily: "'Scheherazade New','Traditional Arabic','Arial Unicode MS',serif",
          direction: 'rtl', flexShrink: 0, paddingRight: 4,
        }}>{name.arabic}</div>
      </button>

      <button
        onClick={onToggleFav}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          padding: '13px 14px', color: isFav ? '#e53e3e' : T.textMuted,
          WebkitTapHighlightColor: 'transparent',
          display: 'flex', alignItems: 'center', flexShrink: 0,
        }}
      >
        <Heart filled={isFav} size={17} />
      </button>
    </div>
  );
}

// ── Detail screen ─────────────────────────────────────────────
function DetailScreen({ name, onBack, isFav, onToggleFav, T }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const handler = () => onBack();
    window.addEventListener('edgeSwipeBack', handler);
    return () => window.removeEventListener('edgeSwipeBack', handler);
  }, [onBack]);

  useEffect(() => {
    return () => {
      if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; }
    };
  }, []);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) { audio.pause(); audio.currentTime = 0; setPlaying(false); }
    else { audio.play().then(() => setPlaying(true)).catch(() => {}); }
  };

  return (
    <div style={{
      background: T.bg, minHeight: '100%', display: 'flex',
      flexDirection: 'column', fontFamily: "'Inter',system-ui,sans-serif",
    }}>
      <style>{`@keyframes detailIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>
      <audio ref={audioRef} src={`audio/${name.nr}.mp3`} onEnded={() => setPlaying(false)} />

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 16px 12px',
        borderBottom: `1px solid ${T.border}`,
        background: T.bg, position: 'sticky', top: 0, zIndex: 10,
      }}>
        <button onClick={onBack} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: T.accent, fontSize: 22, padding: '2px 10px 2px 0',
          WebkitTapHighlightColor: 'transparent', fontWeight: 300, lineHeight: 1,
        }}>‹</button>
        <button onClick={onToggleFav} style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: 6,
          color: isFav ? '#e53e3e' : T.textMuted,
          WebkitTapHighlightColor: 'transparent',
        }}>
          <Heart filled={isFav} size={24} />
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 48, animation: 'detailIn .22s ease both' }}>

        <div style={{ textAlign: 'center', padding: '28px 24px 20px' }}>
          {/* Number */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 44, height: 44, borderRadius: 22,
            background: T.accent, color: '#fff',
            fontSize: 16, fontWeight: 700, marginBottom: 16,
          }}>{name.nr}</div>

          {/* Arabic */}
          <div style={{
            fontSize: 58, lineHeight: 1.4, color: T.text,
            fontFamily: "'Scheherazade New','Traditional Arabic','Arial Unicode MS',serif",
            direction: 'rtl', marginBottom: 14,
          }}>{name.arabic}</div>

          {/* Transliteration */}
          <div style={{
            fontSize: 22, fontWeight: 700, color: T.text,
            letterSpacing: '-.2px', marginBottom: 4,
          }}>{name.transliteration}</div>

          {/* Swedish */}
          <div style={{ fontSize: 15, color: T.textMuted, fontWeight: 400, marginBottom: 24 }}>
            {name.swedish}
          </div>

          {/* Play */}
          <button onClick={togglePlay} style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: playing ? T.accent : `${T.accent}18`,
            border: `1.5px solid ${T.accent}`,
            borderRadius: 50, padding: '10px 28px',
            cursor: 'pointer', fontSize: 14, fontWeight: 600,
            color: playing ? '#fff' : T.accent,
            WebkitTapHighlightColor: 'transparent',
            transition: 'all .18s',
          }}>
            {playing
              ? <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
              : <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            }
            {playing ? 'Pausar' : 'Lyssna'}
          </button>
        </div>

        <div style={{ height: 1, background: T.border, margin: '0 18px 20px' }} />

        {name.forklaring && (
          <section style={{ padding: '0 18px 20px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase', color: T.accent, marginBottom: 10 }}>Förklaring</div>
            <div style={{ fontSize: 15, lineHeight: 1.75, color: T.textSecondary || T.textMuted }}>{name.forklaring}</div>
          </section>
        )}

        {name.koranvers_arabiska && (
          <section style={{ padding: '0 18px 20px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase', color: T.accent, marginBottom: 10 }}>Koranvers</div>
            <div style={{
              background: T.isDark ? 'rgba(45,139,120,0.1)' : 'rgba(36,100,93,0.06)',
              border: `1px solid ${T.accent}30`, borderRadius: 16, padding: '18px 16px',
            }}>
              <div style={{ fontSize: 24, lineHeight: 1.8, textAlign: 'center', color: T.text, fontFamily: "'Scheherazade New','Traditional Arabic',serif", direction: 'rtl', marginBottom: 14 }}>{name.koranvers_arabiska}</div>
              <div style={{ height: 1, background: `${T.accent}25`, marginBottom: 12 }} />
              <div style={{ fontSize: 14, color: T.textMuted, lineHeight: 1.65 }}>{name.koranvers_svenska}</div>
              {name.sura_ayat && <div style={{ marginTop: 8, fontSize: 13, fontWeight: 600, color: T.accent }}>[{name.sura_ayat}]</div>}
            </div>
          </section>
        )}

        {name.hadith && (
          <section style={{ padding: '0 18px 20px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase', color: '#C47B2B', marginBottom: 10 }}>Hadith</div>
            <div style={{ background: T.isDark ? 'rgba(196,123,43,0.1)' : 'rgba(196,123,43,0.06)', border: '1px solid rgba(196,123,43,0.25)', borderRadius: 16, padding: 16 }}>
              <div style={{ fontSize: 14, color: T.textSecondary || T.textMuted, lineHeight: 1.7 }}>{name.hadith}</div>
            </div>
          </section>
        )}

        {name.antal_i_koranen != null && (
          <div style={{ margin: '0 18px' }}>
            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 14, color: T.textMuted }}>Antal i Koranen</span>
              <span style={{ fontSize: 22, fontWeight: 700, color: T.accent, fontVariantNumeric: 'tabular-nums' }}>{name.antal_i_koranen}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main screen ───────────────────────────────────────────────
export default function AsmaulHusnaScreen({ onBack }) {
  const { theme: T } = useTheme();
  const [viewMode, setViewMode] = useState('grid');
  const [selected, setSelected] = useState(null);
  const [favs, setFavs] = useState(loadFavs);
  const [filterFavs, setFilterFavs] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const handler = () => { if (selected) setSelected(null); else onBack(); };
    window.addEventListener('edgeSwipeBack', handler);
    return () => window.removeEventListener('edgeSwipeBack', handler);
  }, [selected, onBack]);

  const toggleFav = useCallback((nr) => {
    setFavs(prev => {
      const next = new Set(prev);
      if (next.has(nr)) next.delete(nr); else next.add(nr);
      saveFavs(next);
      return next;
    });
  }, []);

  const filtered = names.filter(n => {
    if (filterFavs && !favs.has(n.nr)) return false;
    if (search) {
      const q = search.toLowerCase();
      return n.transliteration.toLowerCase().includes(q) ||
             n.swedish.toLowerCase().includes(q) ||
             n.arabic.includes(search) ||
             String(n.nr) === search.trim();
    }
    return true;
  });

  if (selected) return (
    <DetailScreen
      name={selected} onBack={() => setSelected(null)}
      isFav={favs.has(selected.nr)} onToggleFav={() => toggleFav(selected.nr)}
      T={T}
    />
  );

  return (
    <div style={{ background: T.bg, minHeight: '100%', display: 'flex', flexDirection: 'column', fontFamily: "'Inter',system-ui,sans-serif" }}>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}`}</style>

      {/* Sticky header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 20, background: T.bg, borderBottom: `1px solid ${T.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px 10px' }}>
          <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.accent, fontSize: 22, padding: '2px 8px 2px 0', WebkitTapHighlightColor: 'transparent', fontWeight: 300, lineHeight: 1 }}>‹</button>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: T.text, lineHeight: 1 }}>Allahs 99 namn</div>
            <div style={{ fontSize: 12, color: T.textMuted, marginTop: 2 }}>أسماء الله الحسنى</div>
          </div>
          {/* Grid/list toggle */}
          <button onClick={() => setViewMode(v => v === 'grid' ? 'list' : 'grid')} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: '7px 9px', cursor: 'pointer', WebkitTapHighlightColor: 'transparent', display: 'flex', alignItems: 'center' }}>
            {viewMode === 'grid' ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.textMuted} strokeWidth="2" strokeLinecap="round">
                <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
                <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.textMuted} strokeWidth="2" strokeLinecap="round">
                <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
              </svg>
            )}
          </button>
        </div>

        {/* Search + fav filter */}
        <div style={{ padding: '0 16px 10px', display: 'flex', gap: 8 }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, background: T.bgSecondary || T.bg, borderRadius: 12, padding: '8px 12px', border: `1px solid ${T.border}` }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={T.textMuted} strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Sök namn..." style={{ background: 'none', border: 'none', outline: 'none', fontSize: 14, color: T.text, flex: 1, fontFamily: "'Inter',system-ui,sans-serif" }} />
            {search && <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.textMuted, fontSize: 17, padding: 0, lineHeight: 1 }}>×</button>}
          </div>
          <button onClick={() => setFilterFavs(f => !f)} style={{ background: filterFavs ? '#e53e3e' : T.card, border: `1px solid ${filterFavs ? '#e53e3e' : T.border}`, borderRadius: 12, padding: '8px 12px', cursor: 'pointer', WebkitTapHighlightColor: 'transparent', display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, fontWeight: 600, color: filterFavs ? '#fff' : T.textMuted, transition: 'all .18s' }}>
            <Heart filled={filterFavs} size={14} />
            {favs.size > 0 && <span>{favs.size}</span>}
          </button>
        </div>
      </div>

      {(search || filterFavs) && filtered.length < names.length && (
        <div style={{ padding: '6px 16px 0', fontSize: 12, color: T.textMuted }}>Visar {filtered.length} av {names.length} namn</div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 24, animation: 'fadeUp .2s ease both' }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '64px 20px', color: T.textMuted, fontSize: 15 }}>
            {filterFavs ? 'Inga favoriter ännu.' : 'Inga namn hittades.'}
          </div>
        ) : viewMode === 'grid' ? (
          // 2 columns
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, padding: '14px 16px' }}>
            {filtered.map(n => (
              <GridCard key={n.nr} name={n} onPress={() => setSelected(n)}
                isFav={favs.has(n.nr)} onToggleFav={() => toggleFav(n.nr)} T={T} />
            ))}
          </div>
        ) : (
          <div style={{ paddingTop: 4 }}>
            {filtered.map(n => (
              <ListRow key={n.nr} name={n} onPress={() => setSelected(n)}
                isFav={favs.has(n.nr)} onToggleFav={() => toggleFav(n.nr)} T={T} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
