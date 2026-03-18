/**
 * BookingScreen.js — Ny arkitektur: 1 rad per bokning/serie
 *
 * Datamodell:
 *   bookings          — 1 rad per bokning eller återkommande serie
 *   booking_exceptions — undantag: hoppa över eller redigera enskilt tillfälle
 *
 * Recurrence expanderas dynamiskt i frontend — aldrig 260 rader per serie.
 * Stöd för oändliga serier (end_date = null), Outlook-stil delete this/series.
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTheme } from '../context/ThemeContext';
import { useScrollHide } from '../hooks/useScrollHide';
import { supabase } from '../services/supabaseClient';

const ADMIN_PIN       = '4242';
const STORAGE_ADMIN   = 'islamnu_admin_mode';
const STORAGE_DEVICE  = 'islamnu_device_id';
const STORAGE_PHONE   = 'islamnu_user_phone';
const STORAGE_USER_ID = 'islamnu_user_id';
const STORAGE_USER_NAME = 'islamnu_user_name';

const OPEN_HOUR  = 8;
const CLOSE_HOUR = 24;
const NO_END = 'no_end';

const ALL_HOURS = Array.from({ length: (CLOSE_HOUR - OPEN_HOUR) * 2 }, (_, i) => OPEN_HOUR + i * 0.5);
const DAYS_SV   = ['Mån','Tis','Ons','Tor','Fre','Lör','Sön'];
const MONTHS_SV = ['Januari','Februari','Mars','April','Maj','Juni','Juli','Augusti','September','Oktober','November','December'];
const DURATION_OPTIONS = [0.5,1,1.5,2,2.5,3,3.5,4,4.5,5,5.5,6,6.5,7,7.5,8,8.5,9,9.5,10,10.5,11,11.5,12,12.5,13,13.5,14,14.5,15,15.5,16];
const RECUR_OPTIONS = [
  { value: 'none',    label: 'Ingen upprepning' },
  { value: 'weekly',  label: 'Veckovis' },
  { value: 'monthly', label: 'Månadsvis' },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function toISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function parseISO(s) {
  const [y,m,d] = s.split('-').map(Number);
  return new Date(y, m-1, d);
}
function isoToDisplay(s) {
  const d = parseISO(s);
  return `${d.getDate()} ${MONTHS_SV[d.getMonth()]} ${d.getFullYear()}`;
}
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
function fmtHour(h) { return h === 24 ? '00:00' : `${String(Math.floor(h)).padStart(2,'0')}:${h%1===0?'00':'30'}`; }
function slotLabel(startH, dur) { return `${fmtHour(startH)}–${fmtHour(startH+dur)}`; }
function parseSlotStart(timeSlot) {
  const s = timeSlot.split('–')[0];
  const [hh,mm] = s.split(':').map(Number);
  return hh + (mm === 30 ? 0.5 : 0);
}
function fmtDuration(h) {
  return h === 0.5 ? '30 min' : h%1===0 ? `${h} tim` : `${Math.floor(h)} tim 30 min`;
}
function normalizePhone(p) {
  let s = (p||'').replace(/[\s\-().]/g,'');
  if (s.startsWith('+46')) s = '0' + s.slice(3);
  return s;
}
async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}
function isHourPast(iso, startH) {
  if (startH < OPEN_HOUR) return true;
  const todayISO = toISO(new Date());
  if (iso !== todayISO) return false;
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const startMin = Math.floor(startH) * 60 + (startH%1===0 ? 0 : 30);
  return nowMin >= startMin;
}
function getMonthGrid(year, month) {
  const first = new Date(year, month, 1), last = new Date(year, month+1, 0);
  const startPad = (first.getDay()+6)%7;
  const cells = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = 1; d <= last.getDate(); d++) cells.push(new Date(year, month, d));
  while (cells.length%7 !== 0) cells.push(null);
  const rows = [];
  for (let i = 0; i < cells.length; i+=7) rows.push(cells.slice(i,i+7));
  return rows;
}
function getWeekDays(anchor) {
  const d = new Date(anchor);
  const day = (d.getDay()+6)%7;
  d.setDate(d.getDate() - day);
  return Array.from({length:7}, (_,i) => { const dd = new Date(d); dd.setDate(dd.getDate()+i); return dd; });
}

// ── Core recurrence engine ────────────────────────────────────────────────────
// Expanderar en bokningsserie till alla ISO-datum som faller inom ett fönster.
// end_date=null = oändlig serie (vi genererar tills windowEnd).

function expandBooking(booking, windowStart, windowEnd, exceptions = []) {
  const { start_date, end_date, recurrence } = booking;
  const skipDates = new Set(
    exceptions.filter(e => e.booking_id === booking.id && e.type === 'skip').map(e => e.exception_date)
  );
  const editMap = {};
  exceptions.filter(e => e.booking_id === booking.id && e.type === 'edit').forEach(e => {
    editMap[e.exception_date] = e;
  });

  const dates = [];
  if (recurrence === 'none') {
    if (start_date >= windowStart && start_date <= windowEnd) {
      if (!skipDates.has(start_date)) {
        dates.push(applyException(booking, start_date, editMap[start_date]));
      }
    }
    return dates;
  }

  let current = parseISO(start_date);
  const endD = end_date ? parseISO(end_date) : parseISO(windowEnd);
  const winEnd = parseISO(windowEnd);
  const effectiveEnd = endD < winEnd ? endD : winEnd;
  const winStart = parseISO(windowStart);

  let safety = 0;
  while (current <= effectiveEnd && safety++ < 5000) {
    const iso = toISO(current);
    if (current >= winStart && !skipDates.has(iso)) {
      dates.push(applyException(booking, iso, editMap[iso]));
    }
    if (recurrence === 'weekly') {
      current = new Date(current);
      current.setDate(current.getDate() + 7);
    } else if (recurrence === 'monthly') {
      current = new Date(current);
      current.setMonth(current.getMonth() + 1);
    } else break;
  }
  return dates;
}

function applyException(booking, date, exc) {
  if (!exc) return { ...booking, date, _exception: null };
  return {
    ...booking,
    date,
    time_slot: exc.new_time_slot || booking.time_slot,
    duration_hours: exc.new_duration_hours || booking.duration_hours,
    activity: exc.new_activity || booking.activity,
    status: exc.new_status || booking.status,
    admin_comment: exc.admin_comment || booking.admin_comment,
    _exception: exc,
    _exception_id: exc.id,
  };
}

// Expand all bookings for a given date range into flat occurrence list
function expandAll(bookings, exceptions, windowStart, windowEnd) {
  const result = [];
  for (const b of bookings) {
    if (b.status === 'cancelled' || b.status === 'rejected') continue;
    const occurrences = expandBooking(b, windowStart, windowEnd, exceptions);
    result.push(...occurrences);
  }
  return result;
}

// For a specific date, get all active occurrences
function getOccurrencesForDate(bookings, exceptions, iso) {
  return expandAll(bookings, exceptions, iso, iso);
}

// Conflict detection: get booked half-hour blocks for a date
function getBookedBlocks(bookings, exceptions, iso, excludeBookingId = null) {
  const occs = getOccurrencesForDate(bookings, exceptions, iso)
    .filter(o => o.id !== excludeBookingId);
  const blocks = new Set();
  occs.forEach(o => {
    const parts = o.time_slot.split('–');
    const parseH = s => { const [hh,mm] = s.split(':').map(Number); const h = hh+(mm===30?0.5:0); return h===0?24:h; };
    const startH = parseH(parts[0]);
    const dur = o.duration_hours;
    for (let i = 0; i < dur*2; i++) blocks.add(startH*2+i);
  });
  return blocks;
}

function getAvailableStarts(bookings, exceptions, iso, durationHours, excludeBookingId = null) {
  const booked = getBookedBlocks(bookings, exceptions, iso, excludeBookingId);
  const starts = [];
  for (let h = OPEN_HOUR; h + durationHours <= CLOSE_HOUR; h += 0.5) {
    if (isHourPast(iso, h)) continue;
    let ok = true;
    for (let i = 0; i < durationHours*2; i++) {
      if (booked.has(h*2+i)) { ok = false; break; }
    }
    if (ok) starts.push(h);
  }
  return starts;
}

function hasAnyAvailable(bookings, exceptions, date, durationHours) {
  return getAvailableStarts(bookings, exceptions, toISO(date), durationHours).length > 0;
}

function hasBookingsOnDate(bookings, exceptions, iso) {
  return getOccurrencesForDate(bookings, exceptions, iso).length > 0;
}

// ── UI Primitives ─────────────────────────────────────────────────────────────

function BackButton({ onBack, T }) {
  return (
    <button onClick={onBack} style={{background:'none',border:'none',cursor:'pointer',display:'flex',alignItems:'center',gap:4,color:T.accent,fontFamily:'system-ui',fontSize:15,fontWeight:600,padding:'0 0 4px',WebkitTapHighlightColor:'transparent'}}>
      <span style={{fontSize:22,fontWeight:300,lineHeight:1}}>‹</span>
      Tillbaka
    </button>
  );
}

function Badge({ status }) {
  const m = {
    pending:      { label:'Väntar',        bg:'#f59e0b22', color:'#f59e0b' },
    edit_pending: { label:'Ändr. väntar',  bg:'#f9731622', color:'#f97316' },
    approved:     { label:'Godkänd',       bg:'#22c55e22', color:'#22c55e' },
    rejected:     { label:'Avböjd',        bg:'#ef444422', color:'#ef4444' },
    cancelled:    { label:'Inställd',      bg:'#64748b22', color:'#64748b' },
    edited:       { label:'Ändrad',        bg:'#3b82f622', color:'#3b82f6' },
  };
  const s = m[status] || { label: status, bg:'#88888822', color:'#888' };
  return <span style={{background:s.bg,color:s.color,borderRadius:8,fontSize:11,fontWeight:700,padding:'3px 8px',letterSpacing:'.3px',fontFamily:'system-ui'}}>{s.label}</span>;
}

function RecurBadge({ endDate }) {
  const label = endDate ? 'Återkommande' : 'Återkommande · Ingen slutdatum';
  return <span style={{background:'#8b5cf622',color:'#8b5cf6',borderRadius:8,fontSize:10,fontWeight:700,padding:'2px 7px',fontFamily:'system-ui'}}>{label}</span>;
}

function Input({ label, value, onChange, type='text', placeholder, required, T }) {
  return (
    <div style={{display:'flex',flexDirection:'column',gap:5}}>
      <label style={{fontSize:12,fontWeight:600,color:T.textMuted,fontFamily:'system-ui',letterSpacing:'.3px'}}>{label}{required&&<span style={{color:'#ef4444'}}> *</span>}</label>
      <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
        style={{background:T.cardElevated,border:`1px solid ${T.border}`,borderRadius:10,padding:'11px 14px',fontSize:16,color:T.text,fontFamily:'system-ui',outline:'none',width:'100%',boxSizing:'border-box'}}/>
    </div>
  );
}

function Textarea({ label, value, onChange, placeholder, required, T }) {
  return (
    <div style={{display:'flex',flexDirection:'column',gap:5}}>
      <label style={{fontSize:12,fontWeight:600,color:T.textMuted,fontFamily:'system-ui',letterSpacing:'.3px'}}>{label}{required&&<span style={{color:'#ef4444'}}> *</span>}</label>
      <textarea value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} rows={3}
        style={{background:T.cardElevated,border:`1px solid ${T.border}`,borderRadius:10,padding:'11px 14px',fontSize:16,color:T.text,fontFamily:'system-ui',outline:'none',width:'100%',boxSizing:'border-box',resize:'vertical'}}/>
    </div>
  );
}

function Toast({ message, T }) {
  if (!message) return null;
  return (
    <div style={{position:'fixed',bottom:110,left:'50%',transform:'translateX(-50%)',background:T.accent,color:'#fff',padding:'12px 22px',borderRadius:14,fontSize:14,fontWeight:600,fontFamily:'system-ui',boxShadow:'0 4px 20px rgba(0,0,0,0.25)',zIndex:9999,whiteSpace:'nowrap',animation:'fadeInUp .25s ease'}}>
      {message}
    </div>
  );
}

function Spinner({ T }) {
  return (
    <div style={{display:'flex',justifyContent:'center',padding:'40px 0'}}>
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="2.5" strokeLinecap="round" style={{animation:'spin 1s linear infinite'}}>
        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
      </svg>
    </div>
  );
}

function ConfirmDialog({ title, message, confirmLabel, confirmColor='#ef4444', onConfirm, onCancel, requireText, requirePlaceholder, T }) {
  const [text, setText] = useState('');
  const canConfirm = !requireText || text.trim().length > 0;
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:1000,display:'flex',alignItems:'flex-end',justifyContent:'center'}} onClick={onCancel}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.card,borderRadius:'20px 20px 0 0',padding:'24px 20px 36px',width:'100%',maxWidth:500,boxSizing:'border-box',animation:'slideUp .25s cubic-bezier(0.32,0.72,0,1)'}}>
        <div style={{fontSize:18,fontWeight:800,color:T.text,marginBottom:8,fontFamily:'system-ui'}}>{title}</div>
        <div style={{fontSize:14,color:T.textMuted,marginBottom:16,fontFamily:'system-ui',lineHeight:1.5}}>{message}</div>
        {requireText&&<div style={{marginBottom:14}}><Textarea label={requireText} value={text} onChange={setText} placeholder={requirePlaceholder||'Skriv förklaring...'} required T={T}/></div>}
        <div style={{display:'flex',gap:10}}>
          <button onClick={onCancel} style={{flex:1,padding:'13px',borderRadius:12,border:`1px solid ${T.border}`,background:'none',color:T.text,fontSize:15,fontWeight:600,cursor:'pointer',fontFamily:'system-ui'}}>Avbryt</button>
          <button onClick={()=>canConfirm&&onConfirm(text)} disabled={!canConfirm} style={{flex:1,padding:'13px',borderRadius:12,border:'none',background:canConfirm?confirmColor:'#ccc',color:'#fff',fontSize:15,fontWeight:700,cursor:canConfirm?'pointer':'default',fontFamily:'system-ui'}}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

// ── iOS-style scroll picker ───────────────────────────────────────────────────

function ScrollPicker({ options, value, onChange, label, formatFn, T }) {
  const ITEM_H = 44;
  const listRef = useRef(null);
  const velRef = useRef(0);
  const lastY = useRef(0);
  const lastT = useRef(0);
  const rafRef = useRef(null);
  const isDragging = useRef(false);
  const startY = useRef(0);
  const startST = useRef(0);

  const selectedIdx = useMemo(() => {
    const i = options.indexOf(value);
    return i === -1 ? 0 : i;
  }, [options, value]);

  const scrollTo = useCallback((idx, animate=false) => {
    if (!listRef.current) return;
    const target = idx * ITEM_H;
    if (animate) {
      listRef.current.style.scrollBehavior = 'smooth';
      listRef.current.scrollTop = target;
      setTimeout(() => { if (listRef.current) listRef.current.style.scrollBehavior = ''; }, 300);
    } else {
      listRef.current.style.scrollBehavior = '';
      listRef.current.scrollTop = target;
    }
  }, [ITEM_H]);

  useEffect(() => { requestAnimationFrame(() => scrollTo(selectedIdx, false)); }, [selectedIdx, scrollTo]);

  const snapNearest = useCallback(() => {
    if (!listRef.current) return;
    const idx = Math.round(listRef.current.scrollTop / ITEM_H);
    const clamped = Math.max(0, Math.min(options.length - 1, idx));
    scrollTo(clamped, true);
    onChange(options[clamped]);
  }, [ITEM_H, options, onChange, scrollTo]);

  const runMomentum = useCallback(() => {
    if (!listRef.current) return;
    velRef.current *= 0.93;
    listRef.current.scrollTop += velRef.current;
    if (Math.abs(velRef.current) > 0.5) {
      rafRef.current = requestAnimationFrame(runMomentum);
    } else snapNearest();
  }, [snapNearest]);

  const onTouchStart = useCallback((e) => {
    isDragging.current = true;
    startY.current = e.touches[0].clientY;
    startST.current = listRef.current.scrollTop;
    lastY.current = e.touches[0].clientY;
    lastT.current = Date.now();
    velRef.current = 0;
    cancelAnimationFrame(rafRef.current);
  }, []);
  const onTouchMove = useCallback((e) => {
    if (!isDragging.current) return;
    const dy = startY.current - e.touches[0].clientY;
    listRef.current.scrollTop = startST.current + dy;
    const now = Date.now(); const dt = now - lastT.current || 1;
    velRef.current = (lastY.current - e.touches[0].clientY) / dt * 16;
    lastY.current = e.touches[0].clientY; lastT.current = now;
  }, []);
  const onTouchEnd = useCallback(() => {
    isDragging.current = false;
    if (Math.abs(velRef.current) > 1) { rafRef.current = requestAnimationFrame(runMomentum); }
    else snapNearest();
  }, [runMomentum, snapNearest]);
  const onMouseDown = useCallback((e) => {
    isDragging.current = true; startY.current = e.clientY;
    startST.current = listRef.current.scrollTop; lastY.current = e.clientY;
    lastT.current = Date.now(); velRef.current = 0; cancelAnimationFrame(rafRef.current);
  }, []);
  const onMouseMove = useCallback((e) => {
    if (!isDragging.current) return;
    const dy = startY.current - e.clientY; listRef.current.scrollTop = startST.current + dy;
    const now = Date.now(); const dt = now - lastT.current || 1;
    velRef.current = (lastY.current - e.clientY) / dt * 16;
    lastY.current = e.clientY; lastT.current = now;
  }, []);
  const onMouseUp = useCallback(() => {
    if (!isDragging.current) return; isDragging.current = false;
    if (Math.abs(velRef.current) > 1) { rafRef.current = requestAnimationFrame(runMomentum); }
    else snapNearest();
  }, [runMomentum, snapNearest]);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  const cls = `sp-${(label||'x').replace(/\s/g,'')}`;
  return (
    <div style={{display:'flex',flexDirection:'column',gap:8}}>
      {label&&<label style={{fontSize:12,fontWeight:600,color:T.textMuted,fontFamily:'system-ui',letterSpacing:'.3px'}}>{label}</label>}
      <div style={{position:'relative',height:ITEM_H*3,borderRadius:14,overflow:'hidden',border:`1px solid ${T.border}`,background:T.cardElevated,userSelect:'none',WebkitUserSelect:'none'}}>
        <div style={{position:'absolute',top:0,left:0,right:0,height:ITEM_H,background:`linear-gradient(to bottom,${T.cardElevated},transparent)`,zIndex:2,pointerEvents:'none'}}/>
        <div style={{position:'absolute',bottom:0,left:0,right:0,height:ITEM_H,background:`linear-gradient(to top,${T.cardElevated},transparent)`,zIndex:2,pointerEvents:'none'}}/>
        <div style={{position:'absolute',top:'50%',left:0,right:0,height:ITEM_H,transform:'translateY(-50%)',background:`${T.accent}18`,borderTop:`1.5px solid ${T.accent}44`,borderBottom:`1.5px solid ${T.accent}44`,zIndex:1,pointerEvents:'none'}}/>
        <style>{`.${cls}::-webkit-scrollbar{display:none}`}</style>
        <div ref={listRef} className={cls}
          onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
          onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
          style={{height:'100%',overflowY:'scroll',scrollbarWidth:'none',msOverflowStyle:'none',WebkitOverflowScrolling:'touch',cursor:'grab'}}>
          <div style={{height:ITEM_H}}/>
          {options.map((opt, i) => (
            <div key={String(opt)} onClick={()=>{scrollTo(i,true);onChange(opt);}}
              style={{height:ITEM_H,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',WebkitTapHighlightColor:'transparent'}}>
              <span style={{fontSize:opt===value?18:15,fontWeight:opt===value?800:400,color:opt===value?T.accent:T.textMuted,fontFamily:'system-ui',transition:'color .15s, font-size .15s',letterSpacing:opt===value?'-.3px':'0'}}>
                {formatFn ? formatFn(opt) : String(opt)}
              </span>
            </div>
          ))}
          <div style={{height:ITEM_H}}/>
        </div>
      </div>
    </div>
  );
}

function DurationPicker({ value, onChange, T }) {
  return <ScrollPicker options={DURATION_OPTIONS} value={value} onChange={onChange} label="BOKNINGSLÄNGD" formatFn={fmtDuration} T={T}/>;
}

// ── RecurrencePicker — välj upprepning + valfritt slutdatum ───────────────────

function RecurrencePicker({ recurrence, onChange, endDate, onEndDateChange, T }) {
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pickerAnchor, setPickerAnchor] = useState(() => endDate ? parseISO(endDate) : new Date());
  const today = new Date(); today.setHours(0,0,0,0);
  const monthGrid = useMemo(() => getMonthGrid(pickerAnchor.getFullYear(), pickerAnchor.getMonth()), [pickerAnchor]);

  return (
    <div style={{display:'flex',flexDirection:'column',gap:12}}>
      <div style={{display:'flex',flexDirection:'column',gap:8}}>
        <label style={{fontSize:12,fontWeight:600,color:T.textMuted,fontFamily:'system-ui',letterSpacing:'.3px'}}>UPPREPNING</label>
        <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
          {RECUR_OPTIONS.map(o => (
            <button key={o.value} onClick={()=>onChange(o.value)}
              style={{padding:'7px 14px',borderRadius:20,border:`1px solid ${recurrence===o.value?T.accent:T.border}`,background:recurrence===o.value?`${T.accent}22`:'none',color:recurrence===o.value?T.accent:T.textMuted,fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'system-ui',WebkitTapHighlightColor:'transparent'}}>
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {recurrence !== 'none' && (
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          <label style={{fontSize:12,fontWeight:600,color:T.textMuted,fontFamily:'system-ui',letterSpacing:'.3px'}}>SLUTDATUM (valfritt)</label>
          <div style={{display:'flex',gap:8,alignItems:'center'}}>
            <button onClick={()=>{onEndDateChange(null);setShowDatePicker(false);}}
              style={{padding:'7px 14px',borderRadius:20,border:`1px solid ${!endDate?T.accent:T.border}`,background:!endDate?`${T.accent}22`:'none',color:!endDate?T.accent:T.textMuted,fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'system-ui',WebkitTapHighlightColor:'transparent'}}>
              Ingen slutdatum
            </button>
            <button onClick={()=>setShowDatePicker(v=>!v)}
              style={{padding:'7px 14px',borderRadius:20,border:`1px solid ${endDate?T.accent:T.border}`,background:endDate?`${T.accent}22`:'none',color:endDate?T.accent:T.textMuted,fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'system-ui',WebkitTapHighlightColor:'transparent'}}>
              {endDate ? isoToDisplay(endDate) : 'Välj slutdatum'}
            </button>
          </div>

          {showDatePicker && (
            <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:14,padding:'14px'}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
                <button onClick={()=>{const d=new Date(pickerAnchor);d.setMonth(d.getMonth()-1);setPickerAnchor(d);}}
                  style={{width:32,height:32,borderRadius:8,border:`1px solid ${T.border}`,background:T.card,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',color:T.text}}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                </button>
                <span style={{fontSize:13,fontWeight:700,color:T.text}}>{MONTHS_SV[pickerAnchor.getMonth()]} {pickerAnchor.getFullYear()}</span>
                <button onClick={()=>{const d=new Date(pickerAnchor);d.setMonth(d.getMonth()+1);setPickerAnchor(d);}}
                  style={{width:32,height:32,borderRadius:8,border:`1px solid ${T.border}`,background:T.card,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',color:T.text}}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                </button>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:2,marginBottom:4}}>
                {DAYS_SV.map(d=><div key={d} style={{textAlign:'center',fontSize:9,fontWeight:700,color:T.textMuted}}>{d}</div>)}
              </div>
              {monthGrid.map((row,ri) => (
                <div key={ri} style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:2,marginBottom:2}}>
                  {row.map((d,ci) => {
                    if (!d) return <div key={ci}/>;
                    const past = d < today;
                    const isSel = endDate && toISO(d) === endDate;
                    return (
                      <button key={ci} onClick={()=>{ if(past) return; onEndDateChange(toISO(d)); setShowDatePicker(false); }}
                        style={{borderRadius:8,border:isSel?`2px solid ${T.accent}`:'1px solid transparent',background:isSel?`${T.accent}22`:'none',padding:'6px 2px',cursor:past?'default':'pointer',opacity:past?0.35:1,display:'flex',alignItems:'center',justifyContent:'center',WebkitTapHighlightColor:'transparent'}}>
                        <span style={{fontSize:13,fontWeight:isSel?800:400,color:isSel?T.accent:T.text}}>{d.getDate()}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── TimeSlotPanel ─────────────────────────────────────────────────────────────

function TimeSlotPanel({ bookings, exceptions, date, isAdmin, durationHours, onSelectSlot, onClose, T }) {
  const iso = toISO(date);
  const occs = useMemo(() => getOccurrencesForDate(bookings, exceptions, iso), [bookings, exceptions, iso]);
  const hasBookings = occs.length > 0;
  const [showOnlyAvailable, setShowOnlyAvailable] = useState(hasBookings);

  const compactSlots = useMemo(() => {
    const active = occs.map(o => {
      const parts = o.time_slot.split('–');
      const parseH = s => { const [hh,mm] = s.split(':').map(Number); const h = hh+(mm===30?0.5:0); return h===0?24:h; };
      const startH = parseH(parts[0]);
      const endH = startH + o.duration_hours;
      return { startH, endH, status: o.status, booking: o };
    }).sort((a,b) => a.startH - b.startH);

    const merged = [];
    for (const b of active) {
      const last = merged[merged.length-1];
      if (last && b.startH <= last.endH) {
        last.endH = Math.max(last.endH, b.endH);
        if (['pending','edit_pending'].includes(b.status) && last.status === 'booked') last.status = 'pending';
      } else merged.push({...b});
    }

    const result = [];
    let cursor = OPEN_HOUR;
    for (const block of merged) {
      if (block.startH > cursor) {
        for (let h = cursor; h+durationHours <= block.startH; h+=0.5) {
          if (!isHourPast(iso, h)) result.push({ type:'available', startH:h, label:slotLabel(h,durationHours) });
        }
      }
      result.push({ type:'booked', startH:block.startH, endH:block.endH, label:`${fmtHour(block.startH)}–${fmtHour(block.endH)}`, status:block.status, booking:block.booking });
      cursor = block.endH;
    }
    for (let h = cursor; h+durationHours <= CLOSE_HOUR; h+=0.5) {
      if (!isHourPast(iso, h)) result.push({ type:'available', startH:h, label:slotLabel(h,durationHours) });
    }
    return result;
  }, [occs, iso, durationHours]);

  const visible = showOnlyAvailable ? compactSlots.filter(s=>s.type==='available') : compactSlots;

  return (
    <div style={{marginTop:16,background:T.card,border:`1px solid ${T.border}`,borderRadius:16,overflow:'hidden'}}>
      <div style={{padding:'14px 16px 10px',borderBottom:`1px solid ${T.border}`,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div>
          <div style={{fontSize:13,fontWeight:700,color:T.text,fontFamily:'system-ui'}}>Tillgängliga tider · {fmtDuration(durationHours)}</div>
          <div style={{fontSize:11,color:T.textMuted,fontFamily:'system-ui',marginTop:2}}>{isoToDisplay(iso)}</div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:6}}>
          <button onClick={()=>setShowOnlyAvailable(v=>!v)}
            style={{padding:'4px 10px',borderRadius:20,border:`1px solid ${showOnlyAvailable?T.accent:T.border}`,background:showOnlyAvailable?`${T.accent}22`:'none',color:showOnlyAvailable?T.accent:T.textMuted,fontSize:11,fontWeight:600,cursor:'pointer',fontFamily:'system-ui',WebkitTapHighlightColor:'transparent'}}>
            {showOnlyAvailable ? 'Visa alla' : 'Bara lediga'}
          </button>
          <button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer',color:T.textMuted,padding:4}}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>
      {visible.length === 0 && (
        <div style={{padding:'20px 16px',textAlign:'center',color:T.textMuted,fontSize:13,fontFamily:'system-ui'}}>
          Inga lediga tider för {fmtDuration(durationHours)} detta datum.
        </div>
      )}
      <div style={{padding:'8px 10px 10px',display:'flex',flexDirection:'column',gap:5}}>
        {visible.map((slot) => {
          if (slot.type === 'available') {
            return (
              <div key={`a-${slot.startH}`} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'9px 12px',background:T.cardElevated,borderRadius:10,border:'1px solid #22c55e44'}}>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <div style={{width:8,height:8,borderRadius:'50%',background:'#22c55e',flexShrink:0}}/>
                  <span style={{fontSize:14,fontWeight:600,color:T.text,fontFamily:'system-ui'}}>{slot.label}</span>
                </div>
                <button onClick={()=>onSelectSlot(date, slot.label, slot.startH, durationHours)}
                  style={{background:T.accent,color:'#fff',border:'none',borderRadius:8,padding:'5px 12px',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'system-ui',WebkitTapHighlightColor:'transparent'}}>
                  Välj
                </button>
              </div>
            );
          }
          const color = slot.status==='pending'||slot.status==='edit_pending' ? '#f59e0b' : '#ef4444';
          return (
            <div key={`b-${slot.startH}`} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'9px 12px',background:`${color}0d`,borderRadius:10,border:`1px solid ${color}33`,opacity:isAdmin?1:0.7}}>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <div style={{width:8,height:8,borderRadius:'50%',background:color,flexShrink:0}}/>
                <span style={{fontSize:14,fontWeight:600,color:T.text,fontFamily:'system-ui'}}>{slot.label}</span>
                {isAdmin&&slot.booking&&<span style={{fontSize:11,color:T.textMuted,fontFamily:'system-ui'}}>· {slot.booking.name}</span>}
              </div>
              <div style={{display:'flex',alignItems:'center',gap:6}}>
                <Badge status={slot.status}/>
                {isAdmin&&slot.booking&&<button onClick={()=>onSelectSlot(date,slot.label,slot.startH,durationHours,slot.booking)}
                  style={{background:`${T.accent}22`,color:T.accent,border:'none',borderRadius:8,padding:'5px 10px',fontSize:11,fontWeight:700,cursor:'pointer',fontFamily:'system-ui'}}>Detaljer</button>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── CalendarView ──────────────────────────────────────────────────────────────

function CalendarView({ bookings, exceptions, onSelectSlot, isAdmin, T }) {
  const today = new Date(); today.setHours(0,0,0,0);
  const [viewMode, setViewMode] = useState('week');
  const [anchor, setAnchor] = useState(today);
  const [selectedDate, setSelectedDate] = useState(today);
  const [showSlots, setShowSlots] = useState(true);
  const [durationHours, setDurationHours] = useState(1);

  const weekDays = useMemo(() => getWeekDays(anchor), [anchor]);
  const monthGrid = useMemo(() => getMonthGrid(anchor.getFullYear(), anchor.getMonth()), [anchor]);

  const navPrev = () => { const d=new Date(anchor); viewMode==='week'?d.setDate(d.getDate()-7):d.setMonth(d.getMonth()-1); setAnchor(d); };
  const navNext = () => { const d=new Date(anchor); viewMode==='week'?d.setDate(d.getDate()+7):d.setMonth(d.getMonth()+1); setAnchor(d); };

  const headerLabel = viewMode==='week'
    ? `${weekDays[0].getDate()} – ${weekDays[6].getDate()} ${MONTHS_SV[weekDays[6].getMonth()]} ${weekDays[6].getFullYear()}`
    : `${MONTHS_SV[anchor.getMonth()]} ${anchor.getFullYear()}`;

  const hasB = (d) => d && hasBookingsOnDate(bookings, exceptions, toISO(d));
  const isPast = (d) => { if(!d) return false; const x=new Date(d); x.setHours(0,0,0,0); return x<today; };
  const isToday = (d) => { if(!d) return false; const x=new Date(d); x.setHours(0,0,0,0); return x.getTime()===today.getTime(); };
  const isSel = (d) => { if(!d||!selectedDate) return false; const x=new Date(d); x.setHours(0,0,0,0); return x.getTime()===selectedDate.getTime(); };

  const DayBtn = ({ date, small=false }) => {
    if (!date) return <div/>;
    const past=isPast(date), tod=isToday(date), sel=isSel(date), hb=hasB(date);
    const avail = !past && hasAnyAvailable(bookings, exceptions, date, durationHours);
    return (
      <button onClick={()=>{ if(past) return; const c=new Date(date); c.setHours(0,0,0,0); setSelectedDate(c); setShowSlots(true); }}
        style={{borderRadius:small?10:12,border:sel?`2px solid ${T.accent}`:`1px solid ${small?'transparent':T.border}`,background:sel?`${T.accent}22`:tod?`${T.accent}11`:small?'none':T.card,padding:small?'6px 2px':'8px 4px 6px',cursor:past?'default':'pointer',opacity:past?0.35:1,display:'flex',flexDirection:'column',alignItems:'center',gap:small?2:4,WebkitTapHighlightColor:'transparent',transition:'all .12s'}}>
        <span style={{fontSize:small?14:16,fontWeight:tod?800:small?500:600,color:sel?T.accent:T.text,fontFamily:'system-ui'}}>{date.getDate()}</span>
        {!small&&<span style={{fontSize:9,color:T.textMuted,fontFamily:'system-ui'}}>{MONTHS_SV[date.getMonth()].slice(0,3)}</span>}
        {hb&&<div style={{width:small?4:5,height:small?4:5,borderRadius:'50%',background:avail?T.accent:'#ef4444'}}/>}
      </button>
    );
  };

  return (
    <div>
      <div style={{marginBottom:14}}><DurationPicker value={durationHours} onChange={setDurationHours} T={T}/></div>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
        <div style={{display:'flex',gap:6}}>
          {['week','month'].map(m => (
            <button key={m} onClick={()=>setViewMode(m)}
              style={{padding:'5px 14px',borderRadius:20,border:`1px solid ${viewMode===m?T.accent:T.border}`,background:viewMode===m?`${T.accent}22`:'none',color:viewMode===m?T.accent:T.textMuted,fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'system-ui',WebkitTapHighlightColor:'transparent'}}>
              {m==='week'?'Vecka':'Månad'}
            </button>
          ))}
        </div>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <button onClick={navPrev} style={{width:28,height:28,borderRadius:8,border:`1px solid ${T.border}`,background:T.card,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',color:T.text,WebkitTapHighlightColor:'transparent'}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <span style={{fontSize:11,fontWeight:700,color:T.text,fontFamily:'system-ui',minWidth:96,textAlign:'center'}}>{headerLabel}</span>
          <button onClick={navNext} style={{width:28,height:28,borderRadius:8,border:`1px solid ${T.border}`,background:T.card,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',color:T.text,WebkitTapHighlightColor:'transparent'}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:2,marginBottom:6}}>
        {DAYS_SV.map(d=><div key={d} style={{textAlign:'center',fontSize:10,fontWeight:700,color:T.textMuted,fontFamily:'system-ui',letterSpacing:'.5px'}}>{d}</div>)}
      </div>
      {viewMode==='week' && <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:4}}>{weekDays.map((d,i)=><DayBtn key={i} date={d}/>)}</div>}
      {viewMode==='month' && <div>{monthGrid.map((row,ri)=><div key={ri} style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:3,marginBottom:3}}>{row.map((d,ci)=><DayBtn key={ci} date={d} small/>)}</div>)}</div>}
      <div style={{display:'flex',gap:14,marginTop:14,flexWrap:'wrap'}}>
        {[['#22c55e','Ledig tid'],['#f59e0b','Väntar'],['#ef4444','Bokad/full']].map(([c,l])=>(
          <div key={l} style={{display:'flex',alignItems:'center',gap:5}}>
            <div style={{width:10,height:10,borderRadius:'50%',background:c}}/><span style={{fontSize:11,color:T.textMuted,fontFamily:'system-ui'}}>{l}</span>
          </div>
        ))}
      </div>
      {showSlots && selectedDate && (
        <TimeSlotPanel bookings={bookings} exceptions={exceptions} date={selectedDate} isAdmin={isAdmin}
          durationHours={durationHours} onSelectSlot={onSelectSlot} onClose={()=>setShowSlots(false)} T={T}/>
      )}
    </div>
  );
}

// ── BookingForm ───────────────────────────────────────────────────────────────

function BookingForm({ date, slotLabel: slot, durationHours, onSubmit, onBack, loading, bookings, exceptions, T }) {
  const userName  = localStorage.getItem(STORAGE_USER_NAME) || '';
  const userPhone = localStorage.getItem(STORAGE_PHONE) || '';
  const [form, setForm] = useState({ name:userName, phone:userPhone, activity:'' });
  const [recurrence, setRecurrence] = useState('none');
  const [endDate, setEndDate] = useState(null);
  const [error, setError] = useState('');
  const set = f => v => setForm(p=>({...p,[f]:v}));

  const handleSubmit = () => {
    if (!form.activity.trim()) { setError('Beskriv aktiviteten.'); return; }
    onSubmit({ ...form, date:toISO(date), time_slot:slot, duration_hours:durationHours, recurrence, end_date:endDate });
  };

  return (
    <div style={{paddingTop:'max(20px, env(safe-area-inset-top, 0px))',paddingLeft:'16px',paddingRight:'16px',paddingBottom:'20px',fontFamily:'system-ui'}}>
      <BackButton onBack={onBack} T={T}/>
      <div style={{marginTop:16,marginBottom:20}}>
        <div style={{fontSize:22,fontWeight:800,color:T.text,letterSpacing:'-.4px',marginBottom:8}}>Bokningsförfrågan</div>
        <div style={{display:'inline-flex',alignItems:'center',gap:8,background:`${T.accent}18`,borderRadius:10,padding:'6px 12px'}}>
          <span style={{fontSize:13,color:T.accent,fontWeight:600}}>{isoToDisplay(toISO(date))} · {slot} · {fmtDuration(durationHours)}</span>
        </div>
      </div>
      <div style={{display:'flex',alignItems:'center',gap:10,background:T.card,border:`1px solid ${T.border}`,borderRadius:12,padding:'12px 14px',marginBottom:14}}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        <div>
          <div style={{fontSize:14,fontWeight:700,color:T.text}}>{userName}</div>
          <div style={{fontSize:12,color:T.textMuted}}>{userPhone}</div>
        </div>
      </div>
      <div style={{display:'flex',flexDirection:'column',gap:14}}>
        <Textarea label="AKTIVITET" value={form.activity} onChange={set('activity')} placeholder="Beskriv aktiviteten kort..." required T={T}/>
        <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:14,padding:'14px'}}>
          <RecurrencePicker recurrence={recurrence} onChange={r=>{setRecurrence(r);setEndDate(null);}} endDate={endDate} onEndDateChange={setEndDate} T={T}/>
          {recurrence !== 'none' && (
            <div style={{marginTop:12,padding:'10px 12px',background:T.cardElevated,borderRadius:10,fontSize:12,color:T.textMuted,fontFamily:'system-ui'}}>
              {endDate
                ? `Återkommer ${recurrence==='weekly'?'varje vecka':'varje månad'} från ${isoToDisplay(toISO(date))} till ${isoToDisplay(endDate)}`
                : `Återkommer ${recurrence==='weekly'?'varje vecka':'varje månad'} från ${isoToDisplay(toISO(date))} utan slutdatum`}
            </div>
          )}
        </div>
        {error && <div style={{fontSize:13,color:'#ef4444',background:'#ef444418',padding:'10px 14px',borderRadius:8}}>{error}</div>}
        <button onClick={handleSubmit} disabled={loading}
          style={{background:loading?T.textMuted:T.accent,color:'#fff',border:'none',borderRadius:12,padding:'14px',fontSize:16,fontWeight:700,cursor:loading?'default':'pointer',marginTop:4,WebkitTapHighlightColor:'transparent',display:'flex',alignItems:'center',justifyContent:'center',gap:8}}>
          {loading ? 'Skickar...' : <>Skicka bokningsförfrågan <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></>}
        </button>
        <p style={{fontSize:11,color:T.textMuted,textAlign:'center',margin:0}}>Din förfrågan granskas av en administratör.</p>
      </div>
    </div>
  );
}

// ── MyBookings ────────────────────────────────────────────────────────────────

function MyBookings({ bookings, exceptions, loading, onBack, onCancel, onCancelFromDate, onCancelSeries, highlightBookingId, T }) {
  const [selected, setSelected] = useState(null);
  const [deleteSheet, setDeleteSheet] = useState(null); // {booking, occurrence_date}
  const highlightRef = useRef(null);

  useEffect(() => {
    if (highlightBookingId && highlightRef.current) {
      setTimeout(() => highlightRef.current?.scrollIntoView({ behavior:'smooth', block:'center' }), 300);
    }
  }, []); // eslint-disable-line

  const today = toISO(new Date());
  // Expand my bookings for the next 2 years for display
  const windowEnd = (() => { const d=new Date(); d.setFullYear(d.getFullYear()+2); return toISO(d); })();

  // Build display: show booking card + next upcoming occurrence
  const sorted = bookings.slice().sort((a,b) => a.start_date.localeCompare(b.start_date));

  if (selected) {
    const b = selected;
    const isRecur = b.recurrence !== 'none';
    const upcoming = isRecur
      ? expandBooking(b, today, windowEnd, exceptions).slice(0,10)
      : [{ ...b, date: b.start_date }];

    return (
      <div style={{paddingTop:'max(20px, env(safe-area-inset-top, 0px))',paddingLeft:'16px',paddingRight:'16px',paddingBottom:'20px',fontFamily:'system-ui'}}>
        <BackButton onBack={()=>setSelected(null)} T={T}/>
        <div style={{fontSize:20,fontWeight:800,color:T.text,marginTop:16,marginBottom:16}}>Bokningsdetaljer</div>

        <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:16,padding:'16px',marginBottom:12}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
            <Badge status={b.status}/>
            {isRecur && <RecurBadge endDate={b.end_date}/>}
          </div>
          {[['Aktivitet',b.activity],['Tid',b.time_slot],['Längd',fmtDuration(b.duration_hours)],['Startdatum',isoToDisplay(b.start_date)]].map(([l,v])=>(
            <div key={l} style={{marginBottom:10,paddingBottom:10,borderBottom:`1px solid ${T.border}`}}>
              <div style={{fontSize:10,fontWeight:700,color:T.textMuted,letterSpacing:'.5px',marginBottom:2}}>{l.toUpperCase()}</div>
              <div style={{fontSize:14,color:T.text}}>{v}</div>
            </div>
          ))}
          {b.end_date && <div style={{marginBottom:10,paddingBottom:10,borderBottom:`1px solid ${T.border}`}}>
            <div style={{fontSize:10,fontWeight:700,color:T.textMuted,letterSpacing:'.5px',marginBottom:2}}>SLUTDATUM</div>
            <div style={{fontSize:14,color:T.text}}>{isoToDisplay(b.end_date)}</div>
          </div>}
          {b.admin_comment && <div style={{padding:'8px 10px',background:`${T.accent}11`,borderRadius:8}}>
            <div style={{fontSize:10,fontWeight:700,color:T.textMuted,letterSpacing:'.5px',marginBottom:2}}>KOMMENTAR FRÅN ADMIN</div>
            <div style={{fontSize:13,color:T.text}}>{b.admin_comment}</div>
          </div>}
        </div>

        {isRecur && upcoming.length > 0 && (
          <div style={{background:T.card,border:'1px solid #8b5cf644',borderRadius:14,padding:'14px',marginBottom:12}}>
            <div style={{fontSize:11,fontWeight:700,color:'#8b5cf6',letterSpacing:'.5px',marginBottom:10}}>
              KOMMANDE TILLFÄLLEN {!b.end_date && '(visar närmaste 10)'}
            </div>
            {upcoming.map((occ,i) => (
              <div key={i} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 0',borderBottom:i<upcoming.length-1?`1px solid ${T.border}`:'none'}}>
                <div>
                  <div style={{fontSize:13,fontWeight:600,color:T.text}}>{isoToDisplay(occ.date)}</div>
                  <div style={{fontSize:11,color:T.textMuted}}>{occ.time_slot}</div>
                </div>
                <div style={{display:'flex',alignItems:'center',gap:6}}>
                  <Badge status={occ.status||b.status}/>
                  <button onClick={()=>setDeleteSheet({booking:b, occurrence_date:occ.date, isLast:upcoming.length===1})}
                    style={{background:'none',border:'none',cursor:'pointer',color:'#ef4444',fontSize:18,lineHeight:1,padding:'0 4px',WebkitTapHighlightColor:'transparent'}}>×</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Delete actions */}
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          {isRecur ? <>
            <button onClick={()=>setDeleteSheet({booking:b, occurrence_date:b.start_date, deleteAll:true})}
              style={{padding:'13px',borderRadius:12,border:'1px solid #ef444433',background:'#ef444411',color:'#ef4444',fontSize:14,fontWeight:700,cursor:'pointer',fontFamily:'system-ui',textAlign:'left',WebkitTapHighlightColor:'transparent'}}>
              🗑 Avboka hela serien
              <div style={{fontSize:12,fontWeight:400,marginTop:3,opacity:.75}}>Tar bort alla kommande tillfällen</div>
            </button>
          </> : (
            <button onClick={()=>onCancel(b)}
              style={{padding:'13px',borderRadius:12,border:'1px solid #ef444433',background:'#ef444411',color:'#ef4444',fontSize:14,fontWeight:700,cursor:'pointer',fontFamily:'system-ui',textAlign:'left',WebkitTapHighlightColor:'transparent'}}>
              🗑 Avboka
            </button>
          )}
        </div>

        {/* Delete sheet — Outlook-stil */}
        {deleteSheet && (
          <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:1000,display:'flex',alignItems:'flex-end',justifyContent:'center'}} onClick={()=>setDeleteSheet(null)}>
            <div onClick={e=>e.stopPropagation()} style={{background:T.card,borderRadius:'20px 20px 0 0',padding:'24px 20px 36px',width:'100%',maxWidth:500,boxSizing:'border-box',animation:'slideUp .25s cubic-bezier(0.32,0.72,0,1)'}}>
              <div style={{fontSize:16,fontWeight:800,color:T.text,marginBottom:16,fontFamily:'system-ui'}}>
                {deleteSheet.deleteAll ? 'Avboka hela serien?' : `Avboka ${isoToDisplay(deleteSheet.occurrence_date)}?`}
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:10}}>
                {!deleteSheet.deleteAll && <>
                  <button onClick={()=>{setDeleteSheet(null);onCancel(deleteSheet.booking, deleteSheet.occurrence_date);}}
                    style={{padding:'14px',borderRadius:12,border:'1px solid #ef444433',background:'#ef444411',color:'#ef4444',fontSize:14,fontWeight:700,cursor:'pointer',fontFamily:'system-ui',textAlign:'left',WebkitTapHighlightColor:'transparent'}}>
                    🗑 Ta bort bara detta tillfälle
                    <div style={{fontSize:12,fontWeight:400,marginTop:3,opacity:.75}}>Övriga tillfällen påverkas inte</div>
                  </button>
                  <button onClick={()=>{setDeleteSheet(null);onCancelFromDate(deleteSheet.booking, deleteSheet.occurrence_date);}}
                    style={{padding:'14px',borderRadius:12,border:'1px solid #ef444433',background:'#ef444411',color:'#ef4444',fontSize:14,fontWeight:700,cursor:'pointer',fontFamily:'system-ui',textAlign:'left',WebkitTapHighlightColor:'transparent'}}>
                    🗑 Ta bort detta och alla kommande
                    <div style={{fontSize:12,fontWeight:400,marginTop:3,opacity:.75}}>Sätter slutdatum till dagen innan detta tillfälle</div>
                  </button>
                </>}
                {deleteSheet.deleteAll && (
                  <button onClick={()=>{setDeleteSheet(null);onCancelSeries(deleteSheet.booking);}}
                    style={{padding:'14px',borderRadius:12,border:'1px solid #ef444433',background:'#ef444411',color:'#ef4444',fontSize:14,fontWeight:700,cursor:'pointer',fontFamily:'system-ui',textAlign:'left',WebkitTapHighlightColor:'transparent'}}>
                    🗑 Ja, avboka hela serien
                  </button>
                )}
                <button onClick={()=>setDeleteSheet(null)}
                  style={{padding:'13px',borderRadius:12,border:`1px solid ${T.border}`,background:'none',color:T.text,fontSize:14,fontWeight:600,cursor:'pointer',fontFamily:'system-ui',WebkitTapHighlightColor:'transparent'}}>
                  Avbryt
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{paddingTop:'max(20px, env(safe-area-inset-top, 0px))',paddingLeft:'16px',paddingRight:'16px',paddingBottom:'20px',fontFamily:'system-ui'}}>
      <BackButton onBack={onBack} T={T}/>
      <div style={{fontSize:22,fontWeight:800,color:T.text,marginTop:16,marginBottom:16}}>Mina bokningar</div>
      {loading && <Spinner T={T}/>}
      {!loading && sorted.length === 0 && (
        <div style={{textAlign:'center',padding:'40px 0',color:T.textMuted,fontSize:14}}>Inga bokningar hittades.</div>
      )}
      <div style={{display:'flex',flexDirection:'column',gap:10}}>
        {sorted.map(b => {
          const isRecur = b.recurrence !== 'none';
          const nextOcc = isRecur
            ? expandBooking(b, today, windowEnd, exceptions)[0]
            : null;
          const displayDate = nextOcc?.date || b.start_date;
          const isHighlight = b.id === highlightBookingId;
          return (
            <div key={b.id} ref={isHighlight?highlightRef:null}
              onClick={()=>setSelected(b)}
              style={{background:T.card,border:`1px solid ${isHighlight?T.accent:T.border}`,borderRadius:14,padding:'14px 16px',cursor:'pointer',transition:'all .12s',boxShadow:isHighlight?`0 0 0 2px ${T.accent}44`:'none'}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <Badge status={b.status}/>
                  {isRecur && <RecurBadge endDate={b.end_date}/>}
                </div>
                <span style={{fontSize:11,color:T.textMuted,fontFamily:'system-ui'}}>{isoToDisplay(displayDate)}</span>
              </div>
              <div style={{fontSize:15,fontWeight:700,color:T.text,marginBottom:4}}>{b.activity}</div>
              <div style={{fontSize:13,color:T.textMuted}}>{b.time_slot} · {fmtDuration(b.duration_hours)}</div>
              {b.admin_comment && <div style={{marginTop:8,fontSize:12,color:T.textMuted,fontStyle:'italic'}}>"{b.admin_comment}"</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── AdminPanel ────────────────────────────────────────────────────────────────

function AdminPanel({ bookings, exceptions, onBack, onApprove, onReject, onDelete, onDeleteSeries, onDeleteFromDate, onAdminAddRecurring, onRefreshNotifications, onMarkAdminSeen, T }) {
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [comment, setComment] = useState('');
  const [deleteDialog, setDeleteDialog] = useState(null);
  const [addForm, setAddForm] = useState(null);

  const today = toISO(new Date());
  const windowEnd = (() => { const d=new Date(); d.setFullYear(d.getFullYear()+2); return toISO(d); })();

  // Group bookings by status for filter tabs
  const pending   = bookings.filter(b=>b.status==='pending'||b.status==='edit_pending');
  const approved  = bookings.filter(b=>b.status==='approved'||b.status==='edited');
  const rejected  = bookings.filter(b=>b.status==='rejected');
  const cancelled = bookings.filter(b=>b.status==='cancelled');

  const filtered = filter==='all' ? bookings :
    filter==='pending' ? pending :
    filter==='approved' ? approved :
    filter==='rejected' ? rejected : cancelled;

  const sorted = filtered.slice().sort((a,b)=>b.created_at-a.created_at);

  const filters = [
    { id:'all',       label:'Alla',     count: bookings.length },
    { id:'pending',   label:'Väntar',   count: pending.length },
    { id:'approved',  label:'Godkända', count: approved.length },
    { id:'rejected',  label:'Avböjda',  count: rejected.length },
    { id:'cancelled', label:'Inställda',count: cancelled.length },
  ];

  if (selected) {
    const b = selected;
    const isRecur = b.recurrence !== 'none';
    const upcoming = isRecur ? expandBooking(b, today, windowEnd, exceptions).slice(0,10) : null;

    return (
      <div style={{paddingTop:'max(20px, env(safe-area-inset-top, 0px))',paddingLeft:'16px',paddingRight:'16px',paddingBottom:'20px',fontFamily:'system-ui'}}>
        <BackButton onBack={()=>{setSelected(null);setComment('');}} T={T}/>
        <div style={{fontSize:20,fontWeight:800,color:T.text,marginTop:16,marginBottom:16}}>Bokningsdetaljer</div>

        <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:16,padding:'16px',marginBottom:12}}>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12}}>
            <Badge status={b.status}/>
            {isRecur && <RecurBadge endDate={b.end_date}/>}
          </div>
          {[['Namn',b.name],['Telefon',b.phone],['Aktivitet',b.activity],['Tid',b.time_slot],['Längd',fmtDuration(b.duration_hours)],['Startdatum',isoToDisplay(b.start_date)]].map(([l,v])=>(
            <div key={l} style={{marginBottom:10,paddingBottom:10,borderBottom:`1px solid ${T.border}`}}>
              <div style={{fontSize:10,fontWeight:700,color:T.textMuted,letterSpacing:'.5px',marginBottom:2}}>{l.toUpperCase()}</div>
              <div style={{fontSize:14,color:T.text}}>{v}</div>
            </div>
          ))}
          {b.end_date && <div style={{marginBottom:10,paddingBottom:10,borderBottom:`1px solid ${T.border}`}}>
            <div style={{fontSize:10,fontWeight:700,color:T.textMuted,letterSpacing:'.5px',marginBottom:2}}>SLUTDATUM</div>
            <div style={{fontSize:14,color:T.text}}>{isoToDisplay(b.end_date)}</div>
          </div>}
        </div>

        {isRecur && upcoming && (
          <div style={{background:T.card,border:'1px solid #8b5cf644',borderRadius:14,padding:'14px',marginBottom:12}}>
            <div style={{fontSize:11,fontWeight:700,color:'#8b5cf6',letterSpacing:'.5px',marginBottom:10}}>KOMMANDE TILLFÄLLEN (närmaste 10)</div>
            {upcoming.map((occ,i) => (
              <div key={i} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 0',borderBottom:i<upcoming.length-1?`1px solid ${T.border}`:'none'}}>
                <div>
                  <div style={{fontSize:13,fontWeight:600,color:T.text}}>{isoToDisplay(occ.date)}</div>
                  <div style={{fontSize:11,color:T.textMuted}}>{occ.time_slot}</div>
                </div>
                <button onClick={()=>setDeleteDialog({booking:b, occurrence_date:occ.date, type:'one'})}
                  style={{background:'none',border:'none',cursor:'pointer',color:'#ef4444',fontSize:18,padding:'0 4px',WebkitTapHighlightColor:'transparent'}}>×</button>
              </div>
            ))}
          </div>
        )}

        {(b.status==='pending'||b.status==='edit_pending') && (
          <div style={{display:'flex',flexDirection:'column',gap:10,marginBottom:12}}>
            <Textarea label="KOMMENTAR (valfritt)" value={comment} onChange={setComment} placeholder="Skriv en kommentar till besökaren..." T={T}/>
            <div style={{display:'flex',gap:10}}>
              <button onClick={async()=>{setActionLoading(true);await onApprove(b.id,comment);setActionLoading(false);setSelected(null);setComment('');onMarkAdminSeen?.();onRefreshNotifications?.();}}
                disabled={actionLoading}
                style={{flex:1,padding:'13px',borderRadius:12,border:'none',background:'#22c55e',color:'#fff',fontSize:15,fontWeight:700,cursor:'pointer',fontFamily:'system-ui'}}>
                {actionLoading?'...':isRecur?`Godkänn serien`:'Godkänn'}
              </button>
              <button onClick={async()=>{if(!comment.trim()){alert('Kommentar krävs vid avböjning.');return;}setActionLoading(true);await onReject(b.id,comment);setActionLoading(false);setSelected(null);setComment('');onMarkAdminSeen?.();onRefreshNotifications?.();}}
                disabled={actionLoading}
                style={{flex:1,padding:'13px',borderRadius:12,border:'none',background:'#ef4444',color:'#fff',fontSize:15,fontWeight:700,cursor:'pointer',fontFamily:'system-ui'}}>
                {actionLoading?'...':'Avböj'}
              </button>
            </div>
          </div>
        )}

        <div style={{display:'flex',flexDirection:'column',gap:8,marginTop:4}}>
          {isRecur ? <>
            <button onClick={()=>setDeleteDialog({booking:b, type:'series'})}
              style={{padding:'13px',borderRadius:12,border:'1px solid #ef444433',background:'#ef444411',color:'#ef4444',fontSize:14,fontWeight:700,cursor:'pointer',fontFamily:'system-ui',textAlign:'left',WebkitTapHighlightColor:'transparent'}}>
              🗑 Ta bort hela serien
            </button>
          </> : (
            <button onClick={()=>setDeleteDialog({booking:b, type:'single'})}
              style={{padding:'13px',borderRadius:12,border:'1px solid #ef444433',background:'#ef444411',color:'#ef4444',fontSize:14,fontWeight:700,cursor:'pointer',fontFamily:'system-ui',textAlign:'left',WebkitTapHighlightColor:'transparent'}}>
              🗑 Ta bort bokning
            </button>
          )}
        </div>

        {deleteDialog && (
          <ConfirmDialog
            title={deleteDialog.type==='series'?'Ta bort hela serien?':deleteDialog.type==='one'?`Ta bort ${isoToDisplay(deleteDialog.occurrence_date)}?`:'Ta bort bokning?'}
            message={deleteDialog.type==='series'?'Alla tillfällen i serien tas bort.':deleteDialog.type==='one'?'Bara detta tillfälle tas bort — serien fortsätter.':'Bokningen tas bort och besökaren notifieras.'}
            confirmLabel="Ta bort"
            requireText="FÖRKLARING TILL BESÖKAREN"
            requirePlaceholder="Varför tas bokningen bort?"
            onConfirm={async(explanation)=>{
              setActionLoading(true);
              if (deleteDialog.type==='series') await onDeleteSeries(deleteDialog.booking, explanation);
              else if (deleteDialog.type==='one') await onDelete(deleteDialog.booking, deleteDialog.occurrence_date, explanation);
              else await onDelete(deleteDialog.booking, null, explanation);
              setActionLoading(false);
              setDeleteDialog(null);
              setSelected(null);
              onRefreshNotifications?.();
            }}
            onCancel={()=>setDeleteDialog(null)}
            T={T}
          />
        )}
      </div>
    );
  }

  return (
    <div style={{paddingTop:'max(20px, env(safe-area-inset-top, 0px))',paddingLeft:'16px',paddingRight:'16px',paddingBottom:'20px',fontFamily:'system-ui'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
        <div style={{fontSize:22,fontWeight:800,color:T.text,letterSpacing:'-.4px'}}>Adminpanel</div>
        <div style={{display:'flex',gap:8}}>
          <button onClick={()=>setAddForm({})} title="Lägg till bokning"
            style={{width:40,height:40,borderRadius:12,border:`1px solid ${T.border}`,background:T.card,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',color:T.text,WebkitTapHighlightColor:'transparent'}}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
          <button onClick={onBack} title="Logga ut"
            style={{width:40,height:40,borderRadius:12,border:'1px solid #ef444433',background:'#ef444411',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',color:'#ef4444',WebkitTapHighlightColor:'transparent'}}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          </button>
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:16}}>
        {filters.map(f => (
          <button key={f.id} onClick={()=>setFilter(f.id)}
            style={{padding:'6px 14px',borderRadius:20,border:`1px solid ${filter===f.id?T.accent:T.border}`,background:filter===f.id?`${T.accent}22`:'none',color:filter===f.id?T.accent:T.textMuted,fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'system-ui',WebkitTapHighlightColor:'transparent',display:'flex',alignItems:'center',gap:5}}>
            {f.label}
            {f.count>0&&<span style={{background:filter===f.id?T.accent:'#88888844',color:filter===f.id?'#fff':T.textMuted,borderRadius:8,fontSize:10,fontWeight:800,padding:'1px 6px'}}>{f.count}</span>}
          </button>
        ))}
      </div>

      {sorted.length === 0 && <div style={{textAlign:'center',padding:'40px 0',color:T.textMuted,fontSize:14}}>Inga bokningar i denna kategori.</div>}

      <div style={{display:'flex',flexDirection:'column',gap:10}}>
        {sorted.map(b => {
          const isRecur = b.recurrence !== 'none';
          const nextOcc = isRecur ? expandBooking(b, today, windowEnd, exceptions)[0] : null;
          const displayDate = nextOcc?.date || b.start_date;
          return (
            <div key={b.id} onClick={()=>{setSelected(b);setComment('');}}
              style={{background:T.card,border:`1px solid ${b.status==='pending'||b.status==='edit_pending'?'#f59e0b44':T.border}`,borderRadius:14,padding:'14px 16px',cursor:'pointer',animation:(b.status==='pending'||b.status==='edit_pending')?'cardPulse 2s ease-in-out infinite':'none'}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <Badge status={b.status}/>
                  {isRecur&&<RecurBadge endDate={b.end_date}/>}
                </div>
                <span style={{fontSize:11,color:T.textMuted}}>{isoToDisplay(displayDate)}</span>
              </div>
              <div style={{fontSize:15,fontWeight:700,color:T.text,marginBottom:2}}>{b.name}</div>
              <div style={{fontSize:13,color:T.textMuted,marginBottom:4}}>{b.activity}</div>
              <div style={{fontSize:12,color:T.textMuted}}>{b.time_slot} · {fmtDuration(b.duration_hours)}</div>
            </div>
          );
        })}
      </div>

      {/* Admin add recurring form */}
      {addForm !== null && (
        <AdminAddForm bookings={bookings} exceptions={exceptions} onSubmit={async(data)=>{await onAdminAddRecurring(data);setAddForm(null);}} onClose={()=>setAddForm(null)} T={T}/>
      )}
    </div>
  );
}

// ── AdminAddForm ──────────────────────────────────────────────────────────────

function AdminAddForm({ bookings, exceptions, onSubmit, onClose, T }) {
  const today = new Date(); today.setHours(0,0,0,0);
  const [step, setStep] = useState('date');
  const [anchor, setAnchor] = useState(today);
  const [selectedDate, setSelectedDate] = useState(today);
  const [durationHours, setDurationHours] = useState(1);
  const [selectedStartH, setSelectedStartH] = useState(null);
  const [recurrence, setRecurrence] = useState('weekly');
  const [endDate, setEndDate] = useState(null);
  const [form, setForm] = useState({ name:'', phone:'', activity:'' });
  const [loading, setLoading] = useState(false);
  const monthGrid = useMemo(()=>getMonthGrid(anchor.getFullYear(),anchor.getMonth()),[anchor]);

  const handleSubmit = async () => {
    if (!form.name.trim()||!form.activity.trim()) return;
    setLoading(true);
    await onSubmit({ ...form, date:toISO(selectedDate), time_slot:slotLabel(selectedStartH,durationHours), duration_hours:durationHours, recurrence, end_date:endDate });
    setLoading(false);
  };

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:1000,display:'flex',alignItems:'flex-end',justifyContent:'center'}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.card,borderRadius:'20px 20px 0 0',padding:'24px 20px 36px',width:'100%',maxWidth:500,boxSizing:'border-box',animation:'slideUp .25s cubic-bezier(0.32,0.72,0,1)',maxHeight:'90vh',overflowY:'auto'}}>
        <div style={{fontSize:18,fontWeight:800,color:T.text,marginBottom:16,fontFamily:'system-ui'}}>Lägg till återkommande bokning</div>

        {step==='date' && <>
          <div style={{marginBottom:14}}><DurationPicker value={durationHours} onChange={setDurationHours} T={T}/></div>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
            <button onClick={()=>{const d=new Date(anchor);d.setMonth(d.getMonth()-1);setAnchor(d);}} style={{width:32,height:32,borderRadius:8,border:`1px solid ${T.border}`,background:T.card,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',color:T.text}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <span style={{fontSize:13,fontWeight:700,color:T.text}}>{MONTHS_SV[anchor.getMonth()]} {anchor.getFullYear()}</span>
            <button onClick={()=>{const d=new Date(anchor);d.setMonth(d.getMonth()+1);setAnchor(d);}} style={{width:32,height:32,borderRadius:8,border:`1px solid ${T.border}`,background:T.card,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',color:T.text}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:2,marginBottom:4}}>{DAYS_SV.map(d=><div key={d} style={{textAlign:'center',fontSize:9,fontWeight:700,color:T.textMuted}}>{d}</div>)}</div>
          {monthGrid.map((row,ri)=><div key={ri} style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:2,marginBottom:2}}>
            {row.map((d,ci)=>{
              if(!d) return <div key={ci}/>;
              const isSel=selectedDate&&toISO(d)===toISO(selectedDate);
              return <button key={ci} onClick={()=>{const c=new Date(d);c.setHours(0,0,0,0);setSelectedDate(c);setStep('time');}} style={{borderRadius:8,border:isSel?`2px solid ${T.accent}`:'1px solid transparent',background:isSel?`${T.accent}22`:'none',padding:'6px 2px',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',WebkitTapHighlightColor:'transparent'}}>
                <span style={{fontSize:13,fontWeight:isSel?800:400,color:isSel?T.accent:T.text}}>{d.getDate()}</span>
              </button>;
            })}
          </div>)}
        </>}

        {step==='time' && selectedDate && <>
          <div style={{fontSize:12,fontWeight:700,color:T.textMuted,marginBottom:12,letterSpacing:'.3px'}}>{isoToDisplay(toISO(selectedDate))} — VÄLJ TID</div>
          <div style={{display:'flex',flexDirection:'column',gap:6,maxHeight:260,overflowY:'auto'}}>
            {ALL_HOURS.filter(h=>h+durationHours<=CLOSE_HOUR).map(h=>{
              const avail=getAvailableStarts(bookings,exceptions,toISO(selectedDate),durationHours).includes(h);
              return <button key={h} onClick={()=>{setSelectedStartH(h);setStep('details');}} style={{padding:'11px 16px',borderRadius:10,border:`1px solid ${T.accent}44`,background:T.cardElevated,color:T.text,fontSize:14,fontWeight:600,cursor:'pointer',textAlign:'left',fontFamily:'system-ui',WebkitTapHighlightColor:'transparent',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                {slotLabel(h,durationHours)}
                {!avail&&<span style={{fontSize:10,color:'#ef4444',fontWeight:700}}>Upptagen</span>}
              </button>;
            })}
          </div>
          <button onClick={()=>setStep('date')} style={{marginTop:12,background:'none',border:'none',color:T.accent,cursor:'pointer',fontSize:13,fontWeight:600,fontFamily:'system-ui',padding:0}}>← Byt datum</button>
        </>}

        {step==='details' && <>
          <div style={{background:`${T.accent}18`,borderRadius:10,padding:'8px 12px',marginBottom:16}}>
            <span style={{fontSize:13,color:T.accent,fontWeight:600}}>{isoToDisplay(toISO(selectedDate))} · {slotLabel(selectedStartH,durationHours)}</span>
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:12}}>
            <Input label="NAMN" value={form.name} onChange={v=>setForm(p=>({...p,name:v}))} placeholder="Namn på bokaren" required T={T}/>
            <Input label="TELEFON" value={form.phone} onChange={v=>setForm(p=>({...p,phone:v}))} placeholder="Telefonnummer" T={T}/>
            <Textarea label="AKTIVITET" value={form.activity} onChange={v=>setForm(p=>({...p,activity:v}))} placeholder="Beskriv aktiviteten..." required T={T}/>
            <RecurrencePicker recurrence={recurrence} onChange={setRecurrence} endDate={endDate} onEndDateChange={setEndDate} T={T}/>
            <button onClick={handleSubmit} disabled={loading||!form.name.trim()||!form.activity.trim()||selectedStartH===null}
              style={{padding:'13px',borderRadius:12,border:'none',background:T.accent,color:'#fff',fontSize:15,fontWeight:700,cursor:'pointer',fontFamily:'system-ui'}}>
              {loading?'Lägger till...':'Lägg till bokning ✓'}
            </button>
          </div>
          <button onClick={()=>setStep('time')} style={{marginTop:12,background:'none',border:'none',color:T.accent,cursor:'pointer',fontSize:13,fontWeight:600,fontFamily:'system-ui',padding:0}}>← Byt tid</button>
        </>}
      </div>
    </div>
  );
}

// ── Login screens ─────────────────────────────────────────────────────────────

function LoginScreen({ onLogin, onBack, T }) {
  const [step, setStep] = useState('phone');
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [newPin2, setNewPin2] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handlePhoneSubmit = async () => {
    const norm = normalizePhone(phone);
    if (norm.length < 7) { setError('Ange ett giltigt telefonnummer.'); return; }
    setLoading(true);
    const { data } = await supabase.from('app_users').select('id,name,role,pin_hash').eq('phone',norm).maybeSingle();
    setLoading(false);
    if (!data) { setError('Inget konto hittades. Kontakta admin för att skapa konto.'); return; }
    localStorage.setItem(STORAGE_PHONE, norm);
    localStorage.setItem(STORAGE_USER_ID, data.id);
    localStorage.setItem(STORAGE_USER_NAME, data.name);
    if (!data.pin_hash) { setStep('set-pin'); }
    else { setStep('pin'); }
  };

  const handlePinSubmit = async () => {
    const norm = normalizePhone(phone);
    const { data } = await supabase.from('app_users').select('id,name,role,pin_hash').eq('phone',norm).maybeSingle();
    if (!data) { setError('Fel uppstod.'); return; }
    setLoading(true);
    const hash = await sha256(pin);
    setLoading(false);
    if (hash !== data.pin_hash) { setError('Fel PIN. Försök igen.'); return; }
    onLogin({ id:data.id, name:data.name, role:data.role });
  };

  const handleSetPin = async () => {
    if (newPin.length < 4) { setError('PIN måste vara minst 4 siffror.'); return; }
    if (newPin !== newPin2) { setError('PIN-koderna matchar inte.'); return; }
    const norm = normalizePhone(phone);
    setLoading(true);
    const hash = await sha256(newPin);
    await supabase.from('app_users').update({ pin_hash:hash }).eq('phone',norm);
    const { data } = await supabase.from('app_users').select('id,name,role').eq('phone',norm).maybeSingle();
    setLoading(false);
    if (data) onLogin({ id:data.id, name:data.name, role:data.role });
  };

  return (
    <div style={{paddingTop:'max(20px, env(safe-area-inset-top, 0px))',paddingLeft:'16px',paddingRight:'16px',paddingBottom:'20px',fontFamily:'system-ui'}}>
      <BackButton onBack={onBack} T={T}/>
      <div style={{fontSize:22,fontWeight:800,color:T.text,marginTop:20,marginBottom:6}}>Logga in</div>
      <div style={{fontSize:14,color:T.textMuted,marginBottom:24}}>Logga in för att boka och hantera dina bokningar.</div>
      {step==='phone'&&<>
        <Input label="TELEFONNUMMER" value={phone} onChange={v=>{setPhone(v);setError('');}} type="tel" placeholder="07XX XXX XXX" required T={T}/>
        {error&&<div style={{fontSize:13,color:'#ef4444',background:'#ef444418',padding:'10px 14px',borderRadius:8,marginTop:8}}>{error}</div>}
        <button onClick={handlePhoneSubmit} disabled={loading} style={{marginTop:16,width:'100%',padding:'14px',borderRadius:12,border:'none',background:T.accent,color:'#fff',fontSize:16,fontWeight:700,cursor:'pointer',fontFamily:'system-ui'}}>
          {loading?'Kontrollerar...':'Fortsätt →'}
        </button>
      </>}
      {step==='pin'&&<>
        <input type="password" inputMode="numeric" maxLength={6} value={pin} onChange={e=>{setPin(e.target.value.replace(/\D/g,'').slice(0,6));setError('');}}
          onKeyDown={e=>e.key==='Enter'&&handlePinSubmit()} placeholder="PIN-kod" autoFocus
          style={{background:T.cardElevated,border:`1px solid ${T.border}`,borderRadius:10,padding:'14px',fontSize:24,color:T.text,fontFamily:'system-ui',outline:'none',width:'100%',boxSizing:'border-box',textAlign:'center',letterSpacing:8}}/>
        {error&&<div style={{fontSize:13,color:'#ef4444',background:'#ef444418',padding:'10px 14px',borderRadius:8,marginTop:8}}>{error}</div>}
        <button onClick={handlePinSubmit} disabled={loading} style={{marginTop:16,width:'100%',padding:'14px',borderRadius:12,border:'none',background:T.accent,color:'#fff',fontSize:16,fontWeight:700,cursor:'pointer',fontFamily:'system-ui'}}>
          {loading?'Loggar in...':'Logga in'}
        </button>
      </>}
      {step==='set-pin'&&<>
        <div style={{fontSize:14,color:T.textMuted,marginBottom:16}}>Välj en PIN-kod för att skydda ditt konto.</div>
        <input type="password" inputMode="numeric" maxLength={6} value={newPin} onChange={e=>{setNewPin(e.target.value.replace(/\D/g,'').slice(0,6));setError('');}} placeholder="Välj PIN (4-6 siffror)"
          style={{background:T.cardElevated,border:`1px solid ${T.border}`,borderRadius:10,padding:'14px',fontSize:24,color:T.text,fontFamily:'system-ui',outline:'none',width:'100%',boxSizing:'border-box',textAlign:'center',letterSpacing:8,marginBottom:10}}/>
        <input type="password" inputMode="numeric" maxLength={6} value={newPin2} onChange={e=>{setNewPin2(e.target.value.replace(/\D/g,'').slice(0,6));setError('');}} placeholder="Upprepa PIN"
          style={{background:T.cardElevated,border:`1px solid ${T.border}`,borderRadius:10,padding:'14px',fontSize:24,color:T.text,fontFamily:'system-ui',outline:'none',width:'100%',boxSizing:'border-box',textAlign:'center',letterSpacing:8}}/>
        {error&&<div style={{fontSize:13,color:'#ef4444',background:'#ef444418',padding:'10px 14px',borderRadius:8,marginTop:8}}>{error}</div>}
        <button onClick={handleSetPin} disabled={loading} style={{marginTop:16,width:'100%',padding:'14px',borderRadius:12,border:'none',background:T.accent,color:'#fff',fontSize:16,fontWeight:700,cursor:'pointer',fontFamily:'system-ui'}}>
          {loading?'Sparar...':'Spara PIN & logga in'}
        </button>
      </>}
    </div>
  );
}

function AdminLoginScreen({ onLogin, onBack, T }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const handleSubmit = () => {
    if (pin === ADMIN_PIN) { onLogin(); }
    else { setError('Fel PIN-kod.'); setPin(''); }
  };
  return (
    <div style={{paddingTop:'max(20px, env(safe-area-inset-top, 0px))',paddingLeft:'16px',paddingRight:'16px',paddingBottom:'20px',fontFamily:'system-ui'}}>
      <BackButton onBack={onBack} T={T}/>
      <div style={{fontSize:22,fontWeight:800,color:T.text,marginTop:20,marginBottom:24}}>Admin-inloggning</div>
      <input type="password" inputMode="numeric" maxLength={6} value={pin} onChange={e=>{setPin(e.target.value.replace(/\D/g,'').slice(0,6));setError('');}}
        onKeyDown={e=>e.key==='Enter'&&handleSubmit()} placeholder="PIN-kod" autoFocus
        style={{background:T.cardElevated,border:`1px solid ${T.border}`,borderRadius:10,padding:'14px',fontSize:24,color:T.text,fontFamily:'system-ui',outline:'none',width:'100%',boxSizing:'border-box',textAlign:'center',letterSpacing:8}}/>
      {error&&<div style={{fontSize:13,color:'#ef4444',background:'#ef444418',padding:'10px 14px',borderRadius:8,marginTop:8}}>{error}</div>}
      <button onClick={handleSubmit} style={{marginTop:16,width:'100%',padding:'14px',borderRadius:12,border:'none',background:T.accent,color:'#fff',fontSize:16,fontWeight:700,cursor:'pointer',fontFamily:'system-ui'}}>Logga in</button>
    </div>
  );
}

// ── Main BookingScreen ────────────────────────────────────────────────────────

export default function BookingScreen({
  onTabBarHide, onTabBarShow,
  activateForDevice, registerAdminDevice, dismissAdminDevice,
  onRefreshNotifications,
  startAtAdminLogin, startAtAdmin,
  highlightBookingId,
  onMarkAdminSeen,
}) {
  const { theme: T } = useTheme();
  const [bookings, setBookings] = useState([]);
  const [exceptions, setExceptions] = useState([]);
  const [dbLoading, setDbLoading] = useState(true);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [toast, setToast] = useState('');
  const [view, setView] = useState(() => {
    if (startAtAdmin || localStorage.getItem(STORAGE_ADMIN)==='true') return 'admin';
    if (startAtAdminLogin) return 'admin-login';
    return 'calendar';
  });
  const [pendingSlot, setPendingSlot] = useState(null);
  const [adminMode, setAdminMode] = useState(() => localStorage.getItem(STORAGE_ADMIN)==='true');
  const [loggedInUser, setLoggedInUser] = useState(() => {
    const id = localStorage.getItem(STORAGE_USER_ID);
    const name = localStorage.getItem(STORAGE_USER_NAME);
    return id && name ? { id, name } : null;
  });

  const deviceId = useRef((() => {
    let id = localStorage.getItem(STORAGE_DEVICE);
    if (!id) { id = Date.now().toString(36)+Math.random().toString(36).slice(2,9); localStorage.setItem(STORAGE_DEVICE,id); }
    return id;
  })()).current;

  const showToast = useCallback((msg) => { setToast(msg); setTimeout(()=>setToast(''),3000); }, []);

  // ── Fetch all bookings + exceptions ────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    const [{ data: bData }, { data: eData }] = await Promise.all([
      supabase.from('bookings').select('*').order('created_at', { ascending:false }),
      supabase.from('booking_exceptions').select('*'),
    ]);
    if (bData) setBookings(bData);
    if (eData) setExceptions(eData);
    setDbLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Realtime — debounced
  useEffect(() => {
    let timer = null;
    const debounced = () => { clearTimeout(timer); timer = setTimeout(fetchAll, 600); };
    const ch = supabase.channel('booking-v2-realtime')
      .on('postgres_changes', { event:'*', schema:'public', table:'bookings' }, debounced)
      .on('postgres_changes', { event:'*', schema:'public', table:'booking_exceptions' }, debounced)
      .subscribe();
    return () => { clearTimeout(timer); supabase.removeChannel(ch); };
  }, [fetchAll]);

  // Edge swipe back
  useEffect(() => {
    const handler = () => { setView('calendar'); };
    window.addEventListener('edgeSwipeBack', handler);
    return () => window.removeEventListener('edgeSwipeBack', handler);
  }, []); // eslint-disable-line

  // Tab bar hide/show based on view
  useEffect(() => {
    if (view === 'admin' || view === 'my-bookings' || view === 'form') {
      onTabBarHide?.();
    } else {
      onTabBarShow?.();
    }
  }, [view]); // eslint-disable-line

  // ── My bookings: filter for this device/user ───────────────────────────────
  const myBookings = useMemo(() => {
    const userId = localStorage.getItem(STORAGE_USER_ID);
    return bookings.filter(b =>
      (userId && b.user_id === userId) || b.device_id === deviceId
    );
  }, [bookings, deviceId]);

  // ── DB actions ─────────────────────────────────────────────────────────────

  const handleSubmitBooking = useCallback(async (formData) => {
    setSubmitLoading(true);
    const userId = localStorage.getItem(STORAGE_USER_ID) || loggedInUser?.id || null;
    const booking = {
      id: uid(),
      name: formData.name,
      phone: formData.phone,
      activity: formData.activity,
      time_slot: formData.time_slot,
      duration_hours: formData.duration_hours,
      start_date: formData.date,
      end_date: formData.end_date || null,
      recurrence: formData.recurrence || 'none',
      status: 'pending',
      admin_comment: '',
      created_at: Date.now(),
      resolved_at: null,
      device_id: deviceId,
      user_id: userId,
    };
    const { error } = await supabase.from('bookings').insert([booking]);
    setSubmitLoading(false);
    if (error) { showToast(`Fel: ${error.message}`); return; }
    activateForDevice?.();
    localStorage.setItem(STORAGE_PHONE, normalizePhone(formData.phone));
    showToast('Bokningsförfrågan skickad!');
    setView('my-bookings');
  }, [deviceId, loggedInUser, showToast, activateForDevice]);

  // Visitor: cancel single occurrence (adds exception)
  const handleCancelOccurrence = useCallback(async (booking, occurrenceDate) => {
    if (!occurrenceDate || booking.recurrence === 'none') {
      // Single booking — cancel it directly
      const { error } = await supabase.from('bookings').update({ status:'cancelled', admin_comment:'Avbokad av besökaren.', resolved_at:Date.now() }).eq('id', booking.id);
      if (error) { showToast('Något gick fel.'); return; }
      setBookings(prev => prev.map(b => b.id===booking.id ? {...b,status:'cancelled',admin_comment:'Avbokad av besökaren.'} : b));
    } else {
      // Recurring — add skip exception
      const exc = { id:uid(), booking_id:booking.id, exception_date:occurrenceDate, type:'skip', created_at:Date.now() };
      const { error } = await supabase.from('booking_exceptions').insert([exc]);
      if (error) { showToast('Något gick fel.'); return; }
      setExceptions(prev => [...prev, exc]);
    }
    showToast('Tillfälle avbokat.');
  }, [showToast]);

  // Visitor: cancel from date forward (set end_date)
  const handleCancelFromDate = useCallback(async (booking, fromDate) => {
    const prevDay = new Date(parseISO(fromDate));
    prevDay.setDate(prevDay.getDate() - 1);
    const newEndDate = toISO(prevDay);
    const { error } = await supabase.from('bookings').update({ end_date:newEndDate }).eq('id', booking.id);
    if (error) { showToast('Något gick fel.'); return; }
    setBookings(prev => prev.map(b => b.id===booking.id ? {...b,end_date:newEndDate} : b));
    showToast('Serien avbokad från detta datum.');
  }, [showToast]);

  // Visitor: cancel entire series
  const handleCancelSeries = useCallback(async (booking) => {
    const { error } = await supabase.from('bookings').update({ status:'cancelled', admin_comment:'Avbokad av besökaren.', resolved_at:Date.now() }).eq('id', booking.id);
    if (error) { showToast('Något gick fel.'); return; }
    setBookings(prev => prev.map(b => b.id===booking.id ? {...b,status:'cancelled',admin_comment:'Avbokad av besökaren.'} : b));
    showToast('Hela serien avbokad.');
  }, [showToast]);

  // Admin: approve
  const handleApprove = useCallback(async (bookingId, comment) => {
    const { error } = await supabase.from('bookings').update({ status:'approved', admin_comment:comment||'', resolved_at:Date.now() }).eq('id', bookingId);
    if (error) { showToast('Något gick fel.'); return; }
    setBookings(prev => prev.map(b => b.id===bookingId ? {...b,status:'approved',admin_comment:comment||''} : b));
    showToast('Bokning godkänd ✓');
  }, [showToast]);

  // Admin: reject
  const handleReject = useCallback(async (bookingId, comment) => {
    const { error } = await supabase.from('bookings').update({ status:'rejected', admin_comment:comment, resolved_at:Date.now() }).eq('id', bookingId);
    if (error) { showToast('Något gick fel.'); return; }
    setBookings(prev => prev.map(b => b.id===bookingId ? {...b,status:'rejected',admin_comment:comment} : b));
    showToast('Bokning avböjd.');
  }, [showToast]);

  // Admin: delete single occurrence or single booking
  const handleAdminDelete = useCallback(async (booking, occurrenceDate, explanation) => {
    if (booking.recurrence !== 'none' && occurrenceDate) {
      const exc = { id:uid(), booking_id:booking.id, exception_date:occurrenceDate, type:'skip', admin_comment:explanation, created_at:Date.now() };
      const { error } = await supabase.from('booking_exceptions').insert([exc]);
      if (error) { showToast('Något gick fel.'); return; }
      setExceptions(prev => [...prev, exc]);
    } else {
      const { error } = await supabase.from('bookings').update({ status:'cancelled', admin_comment:explanation, resolved_at:Date.now() }).eq('id', booking.id);
      if (error) { showToast('Något gick fel.'); return; }
      setBookings(prev => prev.map(b => b.id===booking.id ? {...b,status:'cancelled',admin_comment:explanation} : b));
    }
    showToast('Tillfälle borttaget & besökare notifierad.');
  }, [showToast]);

  // Admin: delete entire series
  const handleAdminDeleteSeries = useCallback(async (booking, explanation) => {
    const { error } = await supabase.from('bookings').update({ status:'cancelled', admin_comment:explanation, resolved_at:Date.now() }).eq('id', booking.id);
    if (error) { showToast('Något gick fel.'); return; }
    setBookings(prev => prev.map(b => b.id===booking.id ? {...b,status:'cancelled',admin_comment:explanation} : b));
    showToast('Hela serien borttagen & besökare notifierad.');
  }, [showToast]);

  // Admin: add recurring booking directly
  const handleAdminAddRecurring = useCallback(async (formData) => {
    const booking = {
      id: uid(),
      name: formData.name,
      phone: formData.phone || '',
      activity: formData.activity,
      time_slot: formData.time_slot,
      duration_hours: formData.duration_hours,
      start_date: formData.date,
      end_date: formData.end_date || null,
      recurrence: formData.recurrence || 'none',
      status: 'approved',
      admin_comment: '',
      created_at: Date.now(),
      resolved_at: Date.now(),
      device_id: 'admin',
      user_id: null,
    };
    const { error } = await supabase.from('bookings').insert([booking]);
    if (error) { showToast('Något gick fel.'); return; }
    setBookings(prev => [booking, ...prev]);
    showToast('Återkommande bokning tillagd ✓');
  }, [showToast]);

  const handleAdminLogin = useCallback(() => {
    localStorage.setItem(STORAGE_ADMIN, 'true');
    setAdminMode(true);
    setView('admin');
    showToast('Välkommen, admin');
    registerAdminDevice?.();
  }, [showToast, registerAdminDevice]);

  const handleAdminLogout = useCallback(() => {
    localStorage.setItem(STORAGE_ADMIN, 'false');
    setAdminMode(false);
    setView('calendar');
    showToast('Utloggad');
    dismissAdminDevice?.();
  }, [showToast, dismissAdminDevice]);

  const handleSelectSlot = useCallback((date, slotLbl, startH, durationHours, existingBooking) => {
    if (adminMode && existingBooking) { setView('admin'); return; }
    if (!loggedInUser) { setView('login'); return; }
    setPendingSlot({ date, slotLabel:slotLbl, startH, durationHours });
    setView('form');
  }, [adminMode, loggedInUser]);

  // ── Render ─────────────────────────────────────────────────────────────────

  const scrollRef = useRef(null);
  const { visible: headerVis, onScroll } = useScrollHide({ threshold:40 });

  if (dbLoading) return (
    <div style={{padding:'80px 16px',background:T.bg,minHeight:'100%'}}><Spinner T={T}/></div>
  );

  return (
    <div style={{background:T.bg,minHeight:'100%',fontFamily:'system-ui'}}>
      <style>{`
        @keyframes fadeInUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        @keyframes cardPulse{0%,100%{box-shadow:0 0 0 0 rgba(245,158,11,0.4)}50%{box-shadow:0 0 0 6px rgba(245,158,11,0)}}
      `}</style>
      <Toast message={toast} T={T}/>

      {view === 'calendar' && (
        <div ref={scrollRef} onScroll={onScroll} style={{paddingTop:'max(20px, env(safe-area-inset-top, 0px))',paddingLeft:'16px',paddingRight:'16px',paddingBottom:'20px'}}>
          {/* Header */}
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20}}>
            <div style={{fontSize:22,fontWeight:800,color:T.text,letterSpacing:'-.4px'}}>Boka lokal</div>
            <div style={{display:'flex',gap:8}}>
              {!adminMode && (
                <button onClick={()=>setView(loggedInUser?'my-bookings':'login')}
                  style={{padding:'7px 14px',borderRadius:20,border:`1px solid ${T.border}`,background:T.card,color:T.text,fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'system-ui',WebkitTapHighlightColor:'transparent',display:'flex',alignItems:'center',gap:6}}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  {loggedInUser ? loggedInUser.name : 'Logga in'}
                </button>
              )}
              {adminMode ? (
                <button onClick={()=>setView('admin')}
                  style={{padding:'7px 14px',borderRadius:20,border:`1px solid #f59e0b44`,background:'#f59e0b18',color:'#f59e0b',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'system-ui',WebkitTapHighlightColor:'transparent'}}>
                  Adminpanel →
                </button>
              ) : (
                <button onClick={()=>setView('admin-login')}
                  style={{padding:'7px 14px',borderRadius:20,border:`1px solid ${T.border}`,background:T.card,color:T.textMuted,fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'system-ui',WebkitTapHighlightColor:'transparent'}}>
                  Admin
                </button>
              )}
            </div>
          </div>

          <CalendarView bookings={bookings} exceptions={exceptions} onSelectSlot={handleSelectSlot} isAdmin={adminMode} T={T}/>
        </div>
      )}

      {view === 'form' && pendingSlot && (
        <BookingForm
          date={pendingSlot.date} slotLabel={pendingSlot.slotLabel}
          durationHours={pendingSlot.durationHours}
          onSubmit={handleSubmitBooking} onBack={()=>setView('calendar')}
          loading={submitLoading} bookings={bookings} exceptions={exceptions} T={T}
        />
      )}

      {view === 'my-bookings' && (
        <MyBookings
          bookings={myBookings} exceptions={exceptions}
          loading={false} onBack={()=>setView('calendar')}
          onCancel={handleCancelOccurrence}
          onCancelFromDate={handleCancelFromDate}
          onCancelSeries={handleCancelSeries}
          highlightBookingId={highlightBookingId} T={T}
        />
      )}

      {view === 'login' && (
        <LoginScreen
          onLogin={(user)=>{ setLoggedInUser(user); localStorage.setItem(STORAGE_USER_ID,user.id); localStorage.setItem(STORAGE_USER_NAME,user.name); setView('my-bookings'); }}
          onBack={()=>setView('calendar')} T={T}
        />
      )}

      {view === 'admin-login' && (
        <AdminLoginScreen onLogin={handleAdminLogin} onBack={()=>setView('calendar')} T={T}/>
      )}

      {view === 'admin' && (
        <AdminPanel
          bookings={bookings} exceptions={exceptions}
          onBack={handleAdminLogout}
          onApprove={handleApprove} onReject={handleReject}
          onDelete={handleAdminDelete} onDeleteSeries={handleAdminDeleteSeries}
          onDeleteFromDate={handleCancelFromDate}
          onAdminAddRecurring={handleAdminAddRecurring}
          onRefreshNotifications={onRefreshNotifications}
          onMarkAdminSeen={onMarkAdminSeen}
          T={T}
        />
      )}
    </div>
  );
}
