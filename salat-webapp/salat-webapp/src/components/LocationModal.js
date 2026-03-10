import React, { useState } from 'react';
import { searchCity } from '../services/prayerApi';

export default function LocationModal({ detected, onConfirm, onClose, theme: T }) {
  const [showSearch, setShowSearch] = useState(!detected);
  const [query,      setQuery]      = useState('');
  const [results,    setResults]    = useState([]);
  const [searching,  setSearching]  = useState(false);
  const [searchErr,  setSearchErr]  = useState('');

  const doSearch = async () => {
    if (!query.trim()) return;
    setSearching(true); setSearchErr('');
    try {
      const r = await searchCity(query);
      setResults(r);
      if (r.length === 0) setSearchErr('Inga städer hittades. Prova ett annat namn.');
    } catch (e) { setSearchErr(e.message); }
    finally { setSearching(false); }
  };

  return (
    <div style={{
      position:'fixed', inset:0, background:'rgba(0,0,0,0.65)',
      display:'flex', alignItems:'center', justifyContent:'center',
      zIndex:1000, padding:'24px',
    }} onClick={e => e.target === e.currentTarget && onClose?.()}>
      <div style={{
        background:T.card, borderRadius:22, padding:'26px 22px',
        border:`1px solid ${T.border}`, width:'100%', maxWidth:420,
        maxHeight:'80vh', overflowY:'auto',
      }}>
        <h2 style={{ fontSize:19, fontWeight:800, color:T.text, marginBottom:18, textAlign:'center' }}>
          📍 Din plats
        </h2>

        {!showSearch && detected && (
          <>
            <p style={{ color:T.textMuted, textAlign:'center', marginBottom:6, fontSize:14 }}>
              Vi hittade din plats som
            </p>
            <p style={{ color:T.accent, textAlign:'center', fontSize:22, fontWeight:800, marginBottom:18 }}>
              {detected.city}{detected.country ? `, ${detected.country}` : ''}
            </p>
            <p style={{ color:T.textMuted, textAlign:'center', marginBottom:20, fontSize:13 }}>
              Visa bönetider för denna plats?
            </p>
            <button onClick={() => onConfirm(detected)} style={{
              width:'100%', padding:'13px', borderRadius:13,
              background:T.accent, color:T.isDark?'#000':'#fff',
              fontSize:15, fontWeight:700, marginBottom:9, border:'none', cursor:'pointer',
            }}>
              Ja, använd {detected.city}
            </button>
            <button onClick={() => setShowSearch(true)} style={{
              width:'100%', padding:'12px', borderRadius:13,
              background:'none', color:T.textMuted, fontSize:14, fontWeight:500,
              border:`1px solid ${T.border}`, cursor:'pointer',
            }}>
              Välj en annan stad
            </button>
          </>
        )}

        {showSearch && (
          <>
            {detected && (
              <button onClick={() => setShowSearch(false)} style={{
                background:'none', border:'none', color:T.textMuted,
                fontSize:13, cursor:'pointer', marginBottom:12,
              }}>← Tillbaka</button>
            )}
            <p style={{ color:T.textMuted, fontSize:14, marginBottom:10 }}>Sök efter din stad:</p>
            <div style={{ display:'flex', gap:8, marginBottom:8 }}>
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && doSearch()}
                placeholder="t.ex. Stockholm, Göteborg…"
                autoFocus
                style={{
                  flex:1, padding:'11px 13px', borderRadius:10,
                  border:`1px solid ${T.border}`, background:T.bgSecondary,
                  color:T.text, fontSize:14,
                }}
              />
              <button onClick={doSearch} style={{
                padding:'11px 16px', borderRadius:10,
                background:T.accent, color:T.isDark?'#000':'#fff',
                fontSize:14, fontWeight:700, border:'none', cursor:'pointer',
              }}>
                {searching ? '…' : '🔍'}
              </button>
            </div>
            {searchErr && <p style={{ color:T.error, fontSize:13, marginBottom:8 }}>{searchErr}</p>}
            <div style={{ maxHeight:240, overflowY:'auto' }}>
              {results.map((r, i) => (
                <button key={i} onClick={() => onConfirm(r)} style={{
                  display:'block', width:'100%', textAlign:'left',
                  padding:'11px 4px', background:'none', border:'none',
                  borderBottom:`1px solid ${T.border}`, cursor:'pointer',
                }}>
                  <div style={{ fontSize:15, fontWeight:600, color:T.text }}>
                    {r.city}{r.country ? `, ${r.country}` : ''}
                  </div>
                  <div style={{ fontSize:12, color:T.textMuted, marginTop:2 }}>
                    {r.latitude.toFixed(3)}, {r.longitude.toFixed(3)}
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
