import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTheme } from '../context/ThemeContext';
import names from '../data/asmaul_husna.json';

// ── Storage keys ──────────────────────────────────────────────
const FAV_KEY = 'asmaul_husna_favorites';

function loadFavs() {
  try { return new Set(JSON.parse(localStorage.getItem(FAV_KEY) || '[]')); }
  catch { return new Set(); }
}
function saveFavs(set) {
  try { localStorage.setItem(FAV_KEY, JSON.stringify([...set])); } catch {}
}

// ── Helpers ────────────────────────────────────────────────────
const teal = (T) => T.accent;

// ── Detail view ────────────────────────────────────────────────
function DetailScreen({ name, onBack, isFav, onToggleFav, T }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const handler = () => onBack();
    window.addEventListener('edgeSwipeBack', handler);
    return () => window.removeEventListener('edgeSwipeBack', handler);
  }, [onBack]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) { audio.pause(); audio.currentTime = 0; setPlaying(false); }
    else { audio.play().then(() => setPlaying(true)).catch(() => {}); }
  };

  const audioSrc = `audio/${name.nr}.mp3`;

  return (
    <div style={{
      background: T.bg, minHeight: '100%', display: 'flex',
      flexDirection: 'column', fontFamily: "'Inter',system-ui,sans-serif",
    }}>
      <style>{`
        @keyframes detailFadeIn { from { opacity:0; transform:translateY(10px) } to { opacity:1; transform:translateY(0) } }
        @keyframes pulse99 { 0%,100%{transform:scale(1)} 50%{transform:scale(1.08)} }
      `}</style>
      <audio ref={audioRef} src={audioSrc} onEnded={() => setPlaying(false)} />

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
          WebkitTapHighlightColor: 'transparent', fontWeight: 300,
        }}>‹</button>

        {/* Fav heart */}
        <button onClick={onToggleFav} style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: 6,
          WebkitTapHighlightColor: 'transparent',
          animation: isFav ? 'pulse99 .3s ease' : 'none',
        }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill={isFav ? '#e53e3e' : 'none'}
            stroke={isFav ? '#e53e3e' : T.textMuted} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
          </svg>
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 40, animation: 'detailFadeIn .25s ease both' }}>

        {/* Hero: number + arabic + transliteration */}
        <div style={{ textAlign: 'center', padding: '32px 24px 20px' }}>
          {/* Number badge */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 44, height: 44, borderRadius: 22,
            background: T.accent, color: '#fff',
            fontSize: 16, fontWeight: 700, marginBottom: 16,
          }}>{name.nr}</div>

          {/* Arabic calligraphy */}
          <div style={{
            fontSize: 52, lineHeight: 1.4, color: T.text,
            fontFamily: "'Scheherazade New','Traditional Arabic','Arial Unicode MS',serif",
            marginBottom: 12, direction: 'rtl',
          }}>{name.arabic}</div>

          {/* Transliteration */}
          <div style={{
            fontSize: 22, fontWeight: 700, color: T.text,
            letterSpacing: '-.2px', marginBottom: 4,
          }}>{name.transliteration}</div>

          {/* Swedish meaning */}
          <div style={{ fontSize: 15, color: T.textMuted, fontWeight: 400, marginBottom: 24 }}>
            {name.swedish}
          </div>

          {/* Play button */}
          <button onClick={togglePlay} style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: playing ? T.accent : `${T.accent}18`,
            border: `1.5px solid ${T.accent}`,
            borderRadius: 50, padding: '10px 28px',
            cursor: 'pointer', fontSize: 14, fontWeight: 600,
            color: playing ? '#fff' : T.accent,
            WebkitTapHighlightColor: 'transparent',
            transition: 'all .2s',
          }}>
            {playing ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            )}
            {playing ? 'Pausar' : 'Lyssna'}
          </button>
        </div>

        {/* Förklaring */}
        {name.forklaring && (
          <section style={{ padding: '0 18px 20px' }}>
            <div style={{
              fontSize: 11, fontWeight: 600, letterSpacing: '1.2px',
              textTransform: 'uppercase', color: T.accent, marginBottom: 10,
            }}>Förklaring</div>
            <div style={{
              fontSize: 15, lineHeight: 1.75, color: T.textSecondary,
              fontWeight: 400,
            }}>{name.forklaring}</div>
          </section>
        )}

        {/* Koranvers */}
        {name.koranvers_arabiska && (
          <section style={{ padding: '0 18px 20px' }}>
            <div style={{
              fontSize: 11, fontWeight: 600, letterSpacing: '1.2px',
              textTransform: 'uppercase', color: T.accent, marginBottom: 10,
            }}>Koranvers</div>
            <div style={{
              background: T.isDark ? 'rgba(45,139,120,0.1)' : 'rgba(36,100,93,0.06)',
              border: `1px solid ${T.accent}30`,
              borderRadius: 16, padding: '18px 16px', overflow: 'hidden',
            }}>
              {/* Arabic verse */}
              <div style={{
                fontSize: 24, lineHeight: 1.8, textAlign: 'center',
                color: T.text, marginBottom: 14,
                fontFamily: "'Scheherazade New','Traditional Arabic','Arial Unicode MS',serif",
                direction: 'rtl',
              }}>{name.koranvers_arabiska}</div>

              <div style={{ height: 1, background: `${T.accent}25`, marginBottom: 12 }} />

              {/* Swedish translation */}
              <div style={{ fontSize: 14, color: T.textMuted, lineHeight: 1.65, fontWeight: 400 }}>
                {name.koranvers_svenska}
              </div>
              {name.sura_ayat && (
                <div style={{
                  marginTop: 8, fontSize: 13, fontWeight: 600,
                  color: T.accent,
                  fontVariantNumeric: 'tabular-nums',
                }}>[{name.sura_ayat}]</div>
              )}
            </div>
          </section>
        )}

        {/* Hadith */}
        {name.hadith && (
          <section style={{ padding: '0 18px 20px' }}>
            <div style={{
              fontSize: 11, fontWeight: 600, letterSpacing: '1.2px',
              textTransform: 'uppercase', color: '#C47B2B', marginBottom: 10,
            }}>Hadith</div>
            <div style={{
              background: T.isDark ? 'rgba(196,123,43,0.1)' : 'rgba(196,123,43,0.06)',
              border: '1px solid rgba(196,123,43,0.25)',
              borderRadius: 16, padding: '16px',
            }}>
              <div style={{ fontSize: 14, color: T.textSecondary, lineHeight: 1.7, fontWeight: 400 }}>
                {name.hadith}
              </div>
            </div>
          </section>
        )}

        {/* Antal i Koranen */}
        {name.antal_i_koranen != null && (
          <div style={{ margin: '0 18px 20px' }}>
            <div style={{
              background: T.card, border: `1px solid ${T.border}`,
              borderRadius: 14, padding: '14px 18px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span style={{ fontSize: 14, color: T.textMuted, fontWeight: 400 }}>Antal i Koranen</span>
              <span style={{
                fontSize: 22, fontWeight: 700, color: T.accent,
                fontVariantNumeric: 'tabular-nums',
              }}>{name.antal_i_koranen}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Grid card ──────────────────────────────────────────────────
function NameCard({ name, onPress, isFav, T }) {
  return (
    <button onClick={onPress} style={{
      background: T.card, border: `1px solid ${T.border}`,
      borderRadius: 16, padding: '16px 12px 14px',
      cursor: 'pointer', textAlign: 'center',
      WebkitTapHighlightColor: 'transparent',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
      position: 'relative', transition: 'transform .1s',
      fontFamily: "'Inter',system-ui,sans-serif",
    }}>
      {/* Fav dot */}
      {isFav && (
        <div style={{
          position: 'absolute', top: 8, right: 8,
          width: 8, height: 8, borderRadius: 4, background: '#e53e3e',
        }} />
      )}
      {/* Nr */}
      <div style={{
        width: 30, height: 30, borderRadius: 15,
        background: `${T.accent}18`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, fontWeight: 700, color: T.accent,
        fontVariantNumeric: 'tabular-nums',
      }}>{name.nr}</div>

      {/* Arabic */}
      <div style={{
        fontSize: 26, lineHeight: 1.4, color: T.text,
        fontFamily: "'Scheherazade New','Traditional Arabic','Arial Unicode MS',serif",
        direction: 'rtl', minHeight: 40,
        display: 'flex', alignItems: 'center',
      }}>{name.arabic}</div>

      {/* Transliteration */}
      <div style={{ fontSize: 11, fontWeight: 600, color: T.text, lineHeight: 1.3 }}>
        {name.transliteration}
      </div>
      {/* Swedish */}
      <div style={{ fontSize: 10, color: T.textMuted, fontWeight: 400, lineHeight: 1.3 }}>
        {name.swedish}
      </div>
    </button>
  );
}

// ── List row ───────────────────────────────────────────────────
function NameRow({ name, onPress, isFav, T }) {
  return (
    <button onClick={onPress} style={{
      width: '100%', background: T.card, border: 'none',
      borderBottom: `1px solid ${T.border}`,
      padding: '14px 16px',
      display: 'flex', alignItems: 'center', gap: 14,
      cursor: 'pointer', textAlign: 'left',
      WebkitTapHighlightColor: 'transparent',
      fontFamily: "'Inter',system-ui,sans-serif",
    }}>
      {/* Nr */}
      <div style={{
        width: 36, height: 36, borderRadius: 18, flexShrink: 0,
        background: `${T.accent}18`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 12, fontWeight: 700, color: T.accent,
        fontVariantNumeric: 'tabular-nums',
      }}>{name.nr}</div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: T.text }}>{name.transliteration}</span>
          <span style={{ fontSize: 12, color: T.textMuted, fontWeight: 400 }}>{name.swedish}</span>
        </div>
      </div>

      {/* Arabic right */}
      <div style={{
        fontSize: 22, color: T.accent, lineHeight: 1,
        fontFamily: "'Scheherazade New','Traditional Arabic','Arial Unicode MS',serif",
        direction: 'rtl', flexShrink: 0,
      }}>{name.arabic}</div>

      {/* Fav */}
      {isFav && (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="#e53e3e" stroke="none" style={{ flexShrink: 0 }}>
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
        </svg>
      )}

      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.textMuted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: .5 }}>
        <polyline points="9 18 15 12 9 6"/>
      </svg>
    </button>
  );
}

// ── Main screen ────────────────────────────────────────────────
export default function AsmaulHusnaScreen({ onBack }) {
  const { theme: T } = useTheme();
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'list'
  const [selected, setSelected] = useState(null);
  const [favs, setFavs] = useState(loadFavs);
  const [filter, setFilter] = useState('all'); // 'all' | 'favs'
  const [search, setSearch] = useState('');

  useEffect(() => {
    const handler = () => {
      if (selected) setSelected(null);
      else onBack();
    };
    window.addEventListener('edgeSwipeBack', handler);
    return () => window.removeEventListener('edgeSwipeBack', handler);
  }, [selected, onBack]);

  const toggleFav = useCallback((nr) => {
    setFavs(prev => {
      const next = new Set(prev);
      if (next.has(nr)) next.delete(nr);
      else next.add(nr);
      saveFavs(next);
      return next;
    });
  }, []);

  const filtered = names.filter(n => {
    if (filter === 'favs' && !favs.has(n.nr)) return false;
    if (search) {
      const q = search.toLowerCase();
      return n.transliteration.toLowerCase().includes(q) ||
             n.swedish.toLowerCase().includes(q) ||
             n.arabic.includes(search) ||
             String(n.nr) === search;
    }
    return true;
  });

  if (selected) return (
    <DetailScreen
      name={selected}
      onBack={() => setSelected(null)}
      isFav={favs.has(selected.nr)}
      onToggleFav={() => toggleFav(selected.nr)}
      T={T}
    />
  );

  return (
    <div style={{
      background: T.bg, minHeight: '100%', display: 'flex',
      flexDirection: 'column', fontFamily: "'Inter',system-ui,sans-serif",
    }}>
      <style>{`
        @keyframes listFadeIn { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        .name-card:active { transform: scale(0.96); }
      `}</style>

      {/* Sticky header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 20,
        background: T.bg, borderBottom: `1px solid ${T.border}`,
      }}>
        {/* Top row */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '14px 16px 10px',
        }}>
          <button onClick={onBack} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: T.accent, fontSize: 22, padding: '2px 8px 2px 0',
            WebkitTapHighlightColor: 'transparent', fontWeight: 300,
          }}>‹</button>

          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: T.text, lineHeight: 1 }}>
              Allahs 99 namn
            </div>
            <div style={{ fontSize: 12, color: T.textMuted, marginTop: 2 }}>
              أسماء الله الحسنى
            </div>
          </div>

          {/* Grid / list toggle */}
          <button onClick={() => setViewMode(v => v === 'grid' ? 'list' : 'grid')} style={{
            background: T.card, border: `1px solid ${T.border}`,
            borderRadius: 10, padding: '7px 9px',
            cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {viewMode === 'grid' ? (
              // List icon
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.textMuted} strokeWidth="2" strokeLinecap="round">
                <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
                <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
              </svg>
            ) : (
              // Grid icon
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.textMuted} strokeWidth="2" strokeLinecap="round">
                <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
              </svg>
            )}
          </button>
        </div>

        {/* Search */}
        <div style={{ padding: '0 16px 10px', display: 'flex', gap: 8 }}>
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', gap: 8,
            background: T.bgSecondary, borderRadius: 12, padding: '8px 12px',
            border: `1px solid ${T.border}`,
          }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={T.textMuted} strokeWidth="2" strokeLinecap="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Sök namn..."
              style={{
                background: 'none', border: 'none', outline: 'none',
                fontSize: 14, color: T.text, flex: 1, fontFamily: "'Inter',system-ui,sans-serif",
              }}
            />
            {search && (
              <button onClick={() => setSearch('')} style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: T.textMuted, fontSize: 16, padding: 0, lineHeight: 1,
              }}>×</button>
            )}
          </div>

          {/* Favs filter */}
          <button onClick={() => setFilter(f => f === 'favs' ? 'all' : 'favs')} style={{
            background: filter === 'favs' ? '#e53e3e' : T.card,
            border: `1px solid ${filter === 'favs' ? '#e53e3e' : T.border}`,
            borderRadius: 12, padding: '8px 12px',
            cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
            display: 'flex', alignItems: 'center', gap: 5,
            fontSize: 13, fontWeight: 600,
            color: filter === 'favs' ? '#fff' : T.textMuted,
            transition: 'all .2s',
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24"
              fill={filter === 'favs' ? '#fff' : 'none'}
              stroke={filter === 'favs' ? '#fff' : T.textMuted}
              strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
            </svg>
            {favs.size > 0 && <span>{favs.size}</span>}
          </button>
        </div>
      </div>

      {/* Count label */}
      {filtered.length < names.length && (
        <div style={{ padding: '8px 16px 0', fontSize: 12, color: T.textMuted }}>
          Visar {filtered.length} av {names.length} namn
        </div>
      )}

      {/* Name list / grid */}
      <div style={{
        flex: 1, overflowY: 'auto', paddingBottom: 24,
        animation: 'listFadeIn .2s ease both',
      }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: T.textMuted }}>
            {filter === 'favs' ? 'Inga favoriter ännu.' : 'Inga namn hittades.'}
          </div>
        ) : viewMode === 'grid' ? (
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 10, padding: '12px 16px',
          }}>
            {filtered.map(n => (
              <NameCard
                key={n.nr}
                name={n}
                onPress={() => setSelected(n)}
                isFav={favs.has(n.nr)}
                T={T}
              />
            ))}
          </div>
        ) : (
          <div style={{ paddingTop: 8 }}>
            {filtered.map(n => (
              <NameRow
                key={n.nr}
                name={n}
                onPress={() => setSelected(n)}
                isFav={favs.has(n.nr)}
                T={T}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
