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

const STORAGE_ADMIN   = 'islamnu_admin_mode';
const STORAGE_DEVICE  = 'islamnu_device_id';
const STORAGE_PHONE   = 'islamnu_user_phone';
const STORAGE_USER_ID = 'islamnu_user_id';
const STORAGE_USER_NAME = 'islamnu_user_name';
const STORAGE_USER_ROLE = 'islamnu_user_role';

function generateInviteCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

const OPEN_HOUR  = 8;
const CLOSE_HOUR = 24;
const NO_END = 'no_end';

const ALL_HOURS = Array.from({ length: (CLOSE_HOUR - OPEN_HOUR) * 2 }, (_, i) => OPEN_HOUR + i * 0.5);
const DAYS_SV   = ['Mån','Tis','Ons','Tor','Fre','Lör','Sön'];
const MONTHS_SV = ['Januari','Februari','Mars','April','Maj','Juni','Juli','Augusti','September','Oktober','November','December'];
const DURATION_OPTIONS = [0.5,1,1.5,2,2.5,3,3.5,4,4.5,5,5.5,6,6.5,7,7.5,8,8.5,9,9.5,10,10.5,11,11.5,12,12.5,13,13.5,14,14.5,15,15.5,16];
const RECUR_OPTIONS = [
  { value: 'none',    label: 'Ingen upprepning' },
  { value: 'daily',   label: 'Varje dag' },
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
    if (recurrence === 'daily') {
      current = new Date(current);
      current.setDate(current.getDate() + 1);
    } else if (recurrence === 'weekly') {
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

// ── TimeSlotPanel — Starttid/Sluttid-väljare ─────────────────────────────────

function TimeSlotPanel({ bookings, exceptions, date, isAdmin, durationHours, onSelectSlot, onClose, T }) {
  const iso = toISO(date);
  const booked = useMemo(() => getBookedBlocks(bookings, exceptions, iso), [bookings, exceptions, iso]);

  // Alla möjliga starttider (ej passerade, ej bokade)
  const availableStarts = useMemo(() => {
    const starts = [];
    for (let h = OPEN_HOUR; h < CLOSE_HOUR; h += 0.5) {
      if (isHourPast(iso, h)) continue;
      if (!booked.has(h * 2)) starts.push(h);
    }
    return starts;
  }, [booked, iso]);

  const [selectedStart, setSelectedStart] = useState(null);

  // Giltiga sluttider baserat på vald starttid — stopp vid nästa bokad block
  const availableEnds = useMemo(() => {
    if (selectedStart === null) return [];
    const ends = [];
    for (let h = selectedStart + 0.5; h <= CLOSE_HOUR; h += 0.5) {
      // Kolla om blocket [selectedStart, h) är fritt
      let ok = true;
      for (let b = selectedStart; b < h; b += 0.5) {
        if (booked.has(b * 2)) { ok = false; break; }
      }
      if (!ok) break;
      ends.push(h);
    }
    return ends;
  }, [selectedStart, booked]);

  const handleStartSelect = (h) => {
    setSelectedStart(h);
  };

  const handleEndSelect = (endH) => {
    const dur = endH - selectedStart;
    const label = slotLabel(selectedStart, dur);
    onSelectSlot(date, label, selectedStart, dur);
  };

  const occs = useMemo(() => getOccurrencesForDate(bookings, exceptions, iso), [bookings, exceptions, iso]);

  return (
    <div style={{marginTop:16,background:T.card,border:`1px solid ${T.border}`,borderRadius:16,overflow:'hidden'}}>
      {/* Header */}
      <div style={{padding:'14px 16px 12px',borderBottom:`1px solid ${T.border}`,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div>
          <div style={{fontSize:13,fontWeight:700,color:T.text,fontFamily:'system-ui'}}>
            {selectedStart === null ? 'Välj starttid' : `Välj sluttid · från ${fmtHour(selectedStart)}`}
          </div>
          <div style={{fontSize:11,color:T.textMuted,fontFamily:'system-ui',marginTop:2}}>{isoToDisplay(iso)}</div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:6}}>
          {selectedStart !== null && (
            <button onClick={()=>setSelectedStart(null)}
              style={{padding:'4px 10px',borderRadius:20,border:`1px solid ${T.border}`,background:'none',color:T.accent,fontSize:11,fontWeight:600,cursor:'pointer',fontFamily:'system-ui',WebkitTapHighlightColor:'transparent'}}>
              ← Byt start
            </button>
          )}
          <button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer',color:T.textMuted,padding:4}}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>

      {/* Bokade block — visas alltid som info */}
      {occs.length > 0 && (
        <div style={{padding:'8px 12px 0',display:'flex',flexWrap:'wrap',gap:4}}>
          {occs.map(o => {
            const color = ['pending','edit_pending'].includes(o.status) ? '#f59e0b' : '#ef4444';
            return (
              <div key={o.id} style={{padding:'3px 8px',borderRadius:8,background:`${color}18`,border:`1px solid ${color}44`,fontSize:11,fontWeight:600,color,fontFamily:'system-ui'}}>
                {o.time_slot} {isAdmin ? `· ${o.name}` : ''}
              </div>
            );
          })}
        </div>
      )}

      {/* Starttid-väljare */}
      {selectedStart === null && (
        <div style={{padding:'10px 10px 12px'}}>
          {availableStarts.length === 0 ? (
            <div style={{padding:'16px',textAlign:'center',color:T.textMuted,fontSize:13,fontFamily:'system-ui'}}>Inga lediga tider detta datum.</div>
          ) : (
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:6}}>
              {availableStarts.map(h => (
                <button key={h} onClick={()=>handleStartSelect(h)}
                  style={{padding:'10px 4px',borderRadius:10,border:`1px solid ${T.accent}44`,background:`${T.accent}11`,color:T.accent,fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'system-ui',WebkitTapHighlightColor:'transparent',textAlign:'center'}}>
                  {fmtHour(h)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Sluttid-väljare */}
      {selectedStart !== null && (
        <div style={{padding:'10px 10px 12px'}}>
          {availableEnds.length === 0 ? (
            <div style={{padding:'16px',textAlign:'center',color:T.textMuted,fontSize:13,fontFamily:'system-ui'}}>Ingen tid tillgänglig efter {fmtHour(selectedStart)}.</div>
          ) : (
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:6}}>
              {availableEnds.map(h => {
                const dur = h - selectedStart;
                return (
                  <button key={h} onClick={()=>handleEndSelect(h)}
                    style={{padding:'10px 4px',borderRadius:10,border:`1px solid #22c55e44`,background:'#22c55e11',color:'#22c55e',fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'system-ui',WebkitTapHighlightColor:'transparent',textAlign:'center',display:'flex',flexDirection:'column',alignItems:'center',gap:1}}>
                    <span>{fmtHour(h)}</span>
                    <span style={{fontSize:10,fontWeight:500,opacity:0.8}}>{fmtDuration(dur)}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
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
  const durationHours = 0.5; // används bara för hasAnyAvailable-check, visas ej
  const swipeRef = useRef(null);

  const weekDays = useMemo(() => getWeekDays(anchor), [anchor]);
  const monthGrid = useMemo(() => getMonthGrid(anchor.getFullYear(), anchor.getMonth()), [anchor]);

  const navPrev = () => { const d=new Date(anchor); viewMode==='week'?d.setDate(d.getDate()-7):d.setMonth(d.getMonth()-1); setAnchor(d); };
  const navNext = () => { const d=new Date(anchor); viewMode==='week'?d.setDate(d.getDate()+7):d.setMonth(d.getMonth()+1); setAnchor(d); };

  const handleSwipeStart = (e) => {
    const t = e.touches[0];
    swipeRef.current = { x: t.clientX, y: t.clientY };
  };
  const handleSwipeEnd = (e) => {
    if (!swipeRef.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - swipeRef.current.x;
    const dy = Math.abs(t.clientY - swipeRef.current.y);
    swipeRef.current = null;
    if (Math.abs(dx) < 40 || dy > 60) return; // för liten rörelse eller vertikal
    if (dx < 0) navNext(); else navPrev();
  };

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
      <div onTouchStart={handleSwipeStart} onTouchEnd={handleSwipeEnd} style={{userSelect:'none'}}>
        {viewMode==='week' && <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:4}}>{weekDays.map((d,i)=><DayBtn key={i} date={d}/>)}</div>}
        {viewMode==='month' && <div>{monthGrid.map((row,ri)=><div key={ri} style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:3,marginBottom:3}}>{row.map((d,ci)=><DayBtn key={ci} date={d} small/>)}</div>)}</div>}
      </div>
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
  const [conflicts, setConflicts] = useState(null);
  const set = f => v => setForm(p=>({...p,[f]:v}));

  // Räkna ut starttid från slot-strängen t.ex. "11:00–12:00"
  const parseStartH = (s) => {
    const part = s.split('–')[0];
    const [hh,mm] = part.split(':').map(Number);
    return hh + (mm === 30 ? 0.5 : 0);
  };

  const findConflicts = () => {
    if (recurrence === 'none') return [];
    const startH = parseStartH(slot);
    const startISO = toISO(date);
    const windowEnd = (() => {
      if (endDate) return endDate;
      const d = new Date(date); d.setFullYear(d.getFullYear() + 2); return toISO(d);
    })();
    const tempBooking = {
      id: '__preview__', start_date: startISO, end_date: endDate || null,
      recurrence, time_slot: slot, duration_hours: durationHours, status: 'pending',
    };
    const occurrences = expandBooking(tempBooking, startISO, windowEnd, []);
    const found = [];
    for (const occ of occurrences) {
      const bookedBlocks = getBookedBlocks(bookings, exceptions, occ.date);
      let hasConflict = false;
      for (let i = 0; i < durationHours * 2; i++) {
        if (bookedBlocks.has(startH * 2 + i)) { hasConflict = true; break; }
      }
      if (hasConflict) {
        const occsOnDate = getOccurrencesForDate(bookings, exceptions, occ.date);
        const clashing = occsOnDate.filter(o => {
          const parts = o.time_slot.split('–');
          const parseH = s => { const [hh,mm]=s.split(':').map(Number); const h=hh+(mm===30?0.5:0); return h===0?24:h; };
          const oStart = parseH(parts[0]);
          const oEnd = oStart + o.duration_hours;
          return !(oEnd <= startH || oStart >= startH + durationHours);
        });
        found.push({ date: occ.date, time_slot: slot, clashing });
      }
    }
    return found;
  };

  const handleSubmit = () => {
    if (!form.activity.trim()) { setError('Beskriv aktiviteten.'); return; }
    if (recurrence !== 'none') {
      const found = findConflicts();
      if (found.length > 0) { setConflicts(found); return; }
    }
    onSubmit({ ...form, date:toISO(date), time_slot:slot, duration_hours:durationHours, recurrence, end_date:endDate, skip_dates:[] });
  };

  const handleBookAvailable = () => {
    if (!conflicts) return;
    const skipDates = conflicts.map(c => c.date);
    onSubmit({ ...form, date:toISO(date), time_slot:slot, duration_hours:durationHours, recurrence, end_date:endDate, skip_dates:skipDates });
    setConflicts(null);
  };

  return (
    <div style={{paddingTop:'max(20px, env(safe-area-inset-top, 0px))',paddingLeft:'16px',paddingRight:'16px',paddingBottom:'20px',fontFamily:'system-ui'}}>
      {onBack && <BackButton onBack={onBack} T={T}/>}
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
                ? `Återkommer ${recurrence==='daily'?'varje dag':recurrence==='weekly'?'varje vecka':'varje månad'} från ${isoToDisplay(toISO(date))} till ${isoToDisplay(endDate)}`
                : `Återkommer ${recurrence==='daily'?'varje dag':recurrence==='weekly'?'varje vecka':'varje månad'} från ${isoToDisplay(toISO(date))} utan slutdatum`}
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
      {/* ── Konfliktdialog för besökare ── */}
    {conflicts && (
      <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.65)',zIndex:2000,display:'flex',alignItems:'flex-end',justifyContent:'center'}} onClick={()=>setConflicts(null)}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.card,borderRadius:'20px 20px 0 0',padding:'24px 20px 36px',width:'100%',maxWidth:500,boxSizing:'border-box',animation:'slideUp .25s cubic-bezier(0.32,0.72,0,1)',maxHeight:'80vh',overflowY:'auto'}}>
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:6}}>
            <div style={{width:32,height:32,borderRadius:10,background:'#f59e0b22',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            </div>
            <div style={{fontSize:17,fontWeight:800,color:T.text,fontFamily:'system-ui'}}>Tidskonflikter hittades</div>
          </div>
          <div style={{fontSize:13,color:T.textMuted,marginBottom:16,fontFamily:'system-ui'}}>
            {conflicts.length} av dina tillfällen krockar med befintliga bokningar. Välj hur du vill fortsätta.
          </div>

          <div style={{display:'flex',flexDirection:'column',gap:6,marginBottom:20,maxHeight:220,overflowY:'auto'}}>
            {conflicts.map((c,i) => (
              <div key={i} style={{background:'#f59e0b11',border:'1px solid #f59e0b33',borderRadius:10,padding:'10px 12px'}}>
                <div style={{fontSize:13,fontWeight:700,color:T.text,fontFamily:'system-ui',marginBottom:4}}>
                  {isoToDisplay(c.date)} · {c.time_slot}
                </div>
                {c.clashing.map(b => (
                  <div key={b.id} style={{fontSize:11,color:'#f59e0b',fontFamily:'system-ui'}}>
                    ↳ Redan bokad
                  </div>
                ))}
              </div>
            ))}
          </div>

          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            <button onClick={()=>setConflicts(null)}
              style={{padding:'13px',borderRadius:12,border:`1px solid ${T.accent}`,background:'none',color:T.accent,fontSize:14,fontWeight:700,cursor:'pointer',fontFamily:'system-ui',WebkitTapHighlightColor:'transparent'}}>
              ← Ändra tid
            </button>
            <button onClick={handleBookAvailable} disabled={loading}
              style={{padding:'13px',borderRadius:12,border:'none',background:T.accent,color:'#fff',fontSize:14,fontWeight:700,cursor:'pointer',fontFamily:'system-ui',WebkitTapHighlightColor:'transparent'}}>
              {loading ? 'Skickar...' : `Skicka förfrågan för lediga tillfällen (hoppa över ${conflicts.length} st)`}
            </button>
          </div>
        </div>
      </div>
    )}
    </div>
  );
}

// ── MyBookings ────────────────────────────────────────────────────────────────

function MyBookings({ bookings, exceptions, loading, onBack, onCancel, onCancelFromDate, onCancelSeries, onRestore, highlightBookingId, highlightFilter, onLogout, T }) {
  const [selectedId, setSelectedId] = useState(null);
  const [deleteSheet, setDeleteSheet] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelReasonError, setCancelReasonError] = useState(false);
  const [filter, setFilter] = useState(highlightFilter || 'all');
  const highlightRef = useRef(null);

  // Synka selected med live bookings
  const selected = useMemo(() =>
    selectedId ? bookings.find(b => b.id === selectedId) || null : null,
  [selectedId, bookings]);

  // Synka filter när highlightFilter ändras utifrån
  useEffect(() => {
    if (highlightFilter) setFilter(highlightFilter);
  }, [highlightFilter]);

  // Scrolla till highlighted bokning
  useEffect(() => {
    if (highlightBookingId && highlightRef.current) {
      setTimeout(() => highlightRef.current?.scrollIntoView({ behavior:'smooth', block:'center' }), 350);
    }
  }, [highlightBookingId, filter]);

  const today = toISO(new Date());
  const windowEnd = (() => { const d=new Date(); d.setFullYear(d.getFullYear()+2); return toISO(d); })();

  // Sortera senaste överst (created_at desc)
  const sorted = useMemo(() => {
    const all = bookings.slice().sort((a,b) => (b.created_at||0) - (a.created_at||0));
    if (filter === 'all') return all;
    if (filter === 'pending') return all.filter(b => b.status === 'pending' || b.status === 'edit_pending');
    if (filter === 'approved') return all.filter(b => b.status === 'approved' || b.status === 'edited');
    if (filter === 'cancelled') return all.filter(b => b.status === 'cancelled' || b.status === 'rejected');
    return all;
  }, [bookings, filter]);

  // Filter counts
  const counts = useMemo(() => ({
    all: bookings.length,
    pending: bookings.filter(b => b.status==='pending'||b.status==='edit_pending').length,
    approved: bookings.filter(b => b.status==='approved'||b.status==='edited').length,
    cancelled: bookings.filter(b => b.status==='cancelled'||b.status==='rejected').length,
  }), [bookings]);

  const FILTERS = [
    { id:'all',       label:'Alla' },
    { id:'pending',   label:'Väntar' },
    { id:'approved',  label:'Godkända' },
    { id:'cancelled', label:'Inställda' },
  ];

  if (selected !== null) {
    const b = selected;
    const isRecur = b.recurrence !== 'none';
    const upcoming = isRecur
      ? expandBooking(b, today, windowEnd, exceptions).slice(0,10)
      : [{ ...b, date: b.start_date }];

    return (
      <div style={{paddingTop:'max(20px, env(safe-area-inset-top, 0px))',paddingLeft:'16px',paddingRight:'16px',paddingBottom:'100px',fontFamily:'system-ui'}}>
        <BackButton onBack={()=>setSelectedId(null)} T={T}/>
        <div style={{fontSize:20,fontWeight:800,color:T.text,marginTop:16,marginBottom:16}}>Bokningsdetaljer</div>

        <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:16,padding:'16px',marginBottom:12}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
            <Badge status={b.status}/>
            {isRecur && <RecurBadge endDate={b.end_date}/>}
          </div>
          {[['Aktivitet',b.activity],['Tid',b.time_slot],['Längd',fmtDuration(b.duration_hours)],['Startdatum',isoToDisplay(b.start_date)],['Upprepning',b.recurrence==='daily'?'Varje dag':b.recurrence==='weekly'?'Varje vecka':b.recurrence==='monthly'?'Varje månad':'Ingen']].map(([l,v])=>(
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

        {/* Delete / restore actions */}
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          {b.status === 'cancelled' ? (
            /* Avbokad — visa Återta för alla bokningstyper */
            (() => {
              // För upprepade: kolla om start_date är ledig (serien kan återtas)
              // För engångsbokningar: kolla exakt datum
              const checkDate = b.start_date;
              const timeAvailable = getAvailableStarts(bookings, exceptions, checkDate, b.duration_hours, b.id).includes(parseSlotStart(b.time_slot));
              return (
                <button
                  onClick={() => { if (timeAvailable) onRestore?.(b); }}
                  disabled={!timeAvailable}
                  style={{padding:'13px',borderRadius:12,border:`1px solid ${timeAvailable?'#22c55e44':'#88888844'}`,background:timeAvailable?'#22c55e11':'#88888811',color:timeAvailable?'#22c55e':'#888',fontSize:14,fontWeight:700,cursor:timeAvailable?'pointer':'not-allowed',fontFamily:'system-ui',textAlign:'left',WebkitTapHighlightColor:'transparent',opacity:timeAvailable?1:0.6}}>
                  {timeAvailable ? '↩ Återta bokningen' : '↩ Återta bokningen (ej tillgänglig)'}
                  <div style={{fontSize:12,fontWeight:400,marginTop:3,opacity:.75}}>
                    {timeAvailable
                      ? isRecur ? 'Serien återaktiveras — tillfällen skapas igen' : 'Tiden är ledig — bokningen återaktiveras som Väntar'
                      : 'En annan bokning har tagit denna tid'}
                  </div>
                </button>
              );
            })()
          ) : (
            /* Aktiv bokning — visa Avboka med bekräftelse för alla typer */
            isRecur ? (
              <button onClick={()=>setDeleteSheet({booking:b, occurrence_date:b.start_date, deleteAll:true})}
                style={{padding:'13px',borderRadius:12,border:'1px solid #ef444433',background:'#ef444411',color:'#ef4444',fontSize:14,fontWeight:700,cursor:'pointer',fontFamily:'system-ui',textAlign:'left',WebkitTapHighlightColor:'transparent'}}>
                🗑 Avboka hela serien
                <div style={{fontSize:12,fontWeight:400,marginTop:3,opacity:.75}}>Tar bort alla kommande tillfällen</div>
              </button>
            ) : (
              <button onClick={()=>setDeleteSheet({booking:b, occurrence_date:b.start_date})}
                style={{padding:'13px',borderRadius:12,border:'1px solid #ef444433',background:'#ef444411',color:'#ef4444',fontSize:14,fontWeight:700,cursor:'pointer',fontFamily:'system-ui',textAlign:'left',WebkitTapHighlightColor:'transparent'}}>
                🗑 Avboka
              </button>
            )
          )}
        </div>

        {/* Delete sheet — Outlook-stil */}
        {deleteSheet && (
          <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:1000,display:'flex',alignItems:'flex-end',justifyContent:'center'}} onClick={()=>{setDeleteSheet(null);setCancelReason('');setCancelReasonError(false);}}>
            <div onClick={e=>e.stopPropagation()} style={{background:T.card,borderRadius:'20px 20px 0 0',padding:'24px 20px 36px',width:'100%',maxWidth:500,boxSizing:'border-box',animation:'slideUp .25s cubic-bezier(0.32,0.72,0,1)'}}>
              <div style={{fontSize:16,fontWeight:800,color:T.text,marginBottom:4,fontFamily:'system-ui'}}>
                {deleteSheet.deleteAll ? 'Är du säker? Avboka hela serien?' : 'Är du säker på att du vill avboka?'}
              </div>
              <div style={{fontSize:12,color:T.textMuted,marginBottom:14,fontFamily:'system-ui'}}>
                Du kan ange en anledning (valfritt) — admin ser detta meddelande.
              </div>

              {/* Anledning — krävs för godkända bokningar */}
              <div style={{marginBottom:14}}>
                <textarea
                  value={cancelReason}
                  onChange={e=>{setCancelReason(e.target.value);setCancelReasonError(false);}}
                  placeholder="Anledning (valfritt)"
                  rows={3}
                  style={{width:'100%',boxSizing:'border-box',background:T.cardElevated,border:`1px solid ${T.border}`,borderRadius:10,padding:'10px 12px',fontSize:14,color:T.text,fontFamily:'system-ui',resize:'none',outline:'none'}}
                />
              </div>

              <div style={{display:'flex',flexDirection:'column',gap:10}}>
                {!deleteSheet.deleteAll && (() => {
                  const isRecurring = deleteSheet.booking.recurrence !== 'none';
                  const userName = () => localStorage.getItem('islamnu_user_name') || 'Besökaren';
                  const reason = () => cancelReason.trim() ? `Avbokad av ${userName()}: ${cancelReason.trim()}` : `Avbokad av ${userName()}.`;
                  return isRecurring ? (
                    <>
                      <button onClick={()=>{ setDeleteSheet(null); setCancelReason(''); setCancelReasonError(false); onCancel(deleteSheet.booking, deleteSheet.occurrence_date, reason()); }}
                        style={{padding:'14px',borderRadius:12,border:'1px solid #ef444433',background:'#ef444411',color:'#ef4444',fontSize:14,fontWeight:700,cursor:'pointer',fontFamily:'system-ui',textAlign:'left',WebkitTapHighlightColor:'transparent'}}>
                        🗑 Ta bort bara detta tillfälle
                        <div style={{fontSize:12,fontWeight:400,marginTop:3,opacity:.75}}>Övriga tillfällen påverkas inte</div>
                      </button>
                      <button onClick={()=>{ setDeleteSheet(null); setCancelReason(''); setCancelReasonError(false); onCancelFromDate(deleteSheet.booking, deleteSheet.occurrence_date, reason()); }}
                        style={{padding:'14px',borderRadius:12,border:'1px solid #ef444433',background:'#ef444411',color:'#ef4444',fontSize:14,fontWeight:700,cursor:'pointer',fontFamily:'system-ui',textAlign:'left',WebkitTapHighlightColor:'transparent'}}>
                        🗑 Ta bort detta och alla kommande
                        <div style={{fontSize:12,fontWeight:400,marginTop:3,opacity:.75}}>Sätter slutdatum till dagen innan detta tillfälle</div>
                      </button>
                    </>
                  ) : (
                    <button onClick={()=>{ setDeleteSheet(null); setCancelReason(''); setCancelReasonError(false); onCancel(deleteSheet.booking, deleteSheet.occurrence_date, reason()); }}
                      style={{padding:'14px',borderRadius:12,border:'1px solid #ef444433',background:'#ef444411',color:'#ef4444',fontSize:14,fontWeight:700,cursor:'pointer',fontFamily:'system-ui',textAlign:'left',WebkitTapHighlightColor:'transparent'}}>
                      🗑 Avboka bokningen
                    </button>
                  );
                })()}
                {deleteSheet.deleteAll && (
                  <button onClick={()=>{
                    const userName = localStorage.getItem('islamnu_user_name') || 'Besökaren';
                    const reason = cancelReason.trim() ? `Avbokad av ${userName}: ${cancelReason.trim()}` : `Avbokad av ${userName}.`;
                    setDeleteSheet(null); setCancelReason(''); setCancelReasonError(false);
                    onCancelSeries(deleteSheet.booking, reason);
                  }}
                    style={{padding:'14px',borderRadius:12,border:'1px solid #ef444433',background:'#ef444411',color:'#ef4444',fontSize:14,fontWeight:700,cursor:'pointer',fontFamily:'system-ui',textAlign:'left',WebkitTapHighlightColor:'transparent'}}>
                    🗑 Ja, avboka hela serien
                  </button>
                )}
                <button onClick={()=>{setDeleteSheet(null);setCancelReason('');setCancelReasonError(false);}}
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
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:0}}>
        <BackButton onBack={onBack} T={T}/>
        <button onClick={onLogout}
          style={{padding:'7px 14px',borderRadius:20,border:'1px solid #ef444433',background:'#ef444411',color:'#ef4444',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'system-ui',WebkitTapHighlightColor:'transparent',display:'flex',alignItems:'center',gap:6}}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          Logga ut
        </button>
      </div>
      <div style={{fontSize:22,fontWeight:800,color:T.text,marginTop:16,marginBottom:12}}>Mina bokningar</div>

      {/* Filter chips */}
      <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:14}}>
        {FILTERS.map(f => (
          <button key={f.id} onClick={()=>setFilter(f.id)}
            style={{padding:'6px 14px',borderRadius:20,border:`1px solid ${filter===f.id?T.accent:T.border}`,background:filter===f.id?`${T.accent}22`:'none',color:filter===f.id?T.accent:T.textMuted,fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'system-ui',WebkitTapHighlightColor:'transparent',display:'flex',alignItems:'center',gap:5}}>
            {f.label}
            {counts[f.id]>0&&<span style={{background:filter===f.id?T.accent:'#88888833',color:filter===f.id?'#fff':T.textMuted,borderRadius:8,fontSize:10,fontWeight:800,padding:'1px 6px'}}>{counts[f.id]}</span>}
          </button>
        ))}
      </div>

      {loading && <Spinner T={T}/>}
      {!loading && sorted.length === 0 && (
        <div style={{textAlign:'center',padding:'40px 0',color:T.textMuted,fontSize:14}}>
          {filter==='all' ? 'Inga bokningar hittades.' : `Inga ${FILTERS.find(f=>f.id===filter)?.label.toLowerCase()} bokningar.`}
        </div>
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
              onClick={()=>setSelectedId(b.id)}
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

function AdminPanel({ bookings, exceptions, onBack, onApprove, onReject, onDelete, onDeleteSeries, onDeleteFromDate, onAdminAddRecurring, onRefreshNotifications, onMarkAdminSeen, onManageUsers, adminInitialFilter, T }) {
  const [filter, setFilter] = useState(adminInitialFilter || 'all');
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
      <div style={{paddingTop:'max(20px, env(safe-area-inset-top, 0px))',paddingLeft:'16px',paddingRight:'16px',paddingBottom:'100px',fontFamily:'system-ui'}}>
        <BackButton onBack={()=>{setSelected(null);setComment('');}} T={T}/>
        <div style={{fontSize:20,fontWeight:800,color:T.text,marginTop:16,marginBottom:16}}>Bokningsdetaljer</div>

        <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:16,padding:'16px',marginBottom:12}}>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12}}>
            <Badge status={b.status}/>
            {isRecur && <RecurBadge endDate={b.end_date}/>}
          </div>
          {[['Namn',b.name],['Telefon',b.phone],['Aktivitet',b.activity],['Tid',b.time_slot],['Längd',fmtDuration(b.duration_hours)],['Startdatum',isoToDisplay(b.start_date)],['Upprepning',b.recurrence==='daily'?'Varje dag':b.recurrence==='weekly'?'Varje vecka':b.recurrence==='monthly'?'Varje månad':'Ingen']].map(([l,v])=>(
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
    <div style={{paddingTop:'max(20px, env(safe-area-inset-top, 0px))',paddingLeft:'16px',paddingRight:'16px',paddingBottom:'100px',fontFamily:'system-ui'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
        <div style={{fontSize:22,fontWeight:800,color:T.text,letterSpacing:'-.4px'}}>Adminpanel</div>
        <div style={{display:'flex',gap:8}}>
          <button onClick={()=>onManageUsers?.()} title="Hantera konton"
            style={{width:40,height:40,borderRadius:12,border:`1px solid ${T.border}`,background:T.card,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',color:T.text,WebkitTapHighlightColor:'transparent'}}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          </button>
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
  const [conflicts, setConflicts] = useState(null); // null | [{date, time_slot, bookedBy}]
  const monthGrid = useMemo(()=>getMonthGrid(anchor.getFullYear(),anchor.getMonth()),[anchor]);

  // Scanna alla framtida tillfällen för konflikter
  const findConflicts = () => {
    if (recurrence === 'none') return [];
    const startISO = toISO(selectedDate);
    const windowEnd = (() => {
      if (endDate) return endDate;
      const d = new Date(selectedDate); d.setFullYear(d.getFullYear() + 2); return toISO(d);
    })();
    // Generera alla tillfällen för den nya bokningen
    const tempBooking = {
      id: '__preview__', start_date: startISO, end_date: endDate || null,
      recurrence, time_slot: slotLabel(selectedStartH, durationHours),
      duration_hours: durationHours, status: 'approved',
    };
    const occurrences = expandBooking(tempBooking, startISO, windowEnd, []);
    const found = [];
    for (const occ of occurrences) {
      const booked = getBookedBlocks(bookings, exceptions, occ.date);
      let hasConflict = false;
      for (let i = 0; i < durationHours * 2; i++) {
        if (booked.has(selectedStartH * 2 + i)) { hasConflict = true; break; }
      }
      if (hasConflict) {
        // Hitta vilka bokningar som krockar
        const occsOnDate = getOccurrencesForDate(bookings, exceptions, occ.date);
        const clashing = occsOnDate.filter(o => {
          const parts = o.time_slot.split('–');
          const parseH = s => { const [hh,mm]=s.split(':').map(Number); const h=hh+(mm===30?0.5:0); return h===0?24:h; };
          const oStart = parseH(parts[0]);
          const oEnd = oStart + o.duration_hours;
          return !(oEnd <= selectedStartH || oStart >= selectedStartH + durationHours);
        });
        found.push({ date: occ.date, time_slot: slotLabel(selectedStartH, durationHours), clashing });
      }
    }
    return found;
  };

  const handleSubmit = async () => {
    if (!form.name.trim()||!form.activity.trim()) return;
    // Kolla konflikter för återkommande bokningar
    if (recurrence !== 'none' && selectedStartH !== null) {
      const found = findConflicts();
      if (found.length > 0) {
        setConflicts(found);
        return;
      }
    }
    setLoading(true);
    await onSubmit({ ...form, date:toISO(selectedDate), time_slot:slotLabel(selectedStartH,durationHours), duration_hours:durationHours, recurrence, end_date:endDate, skip_dates:[] });
    setLoading(false);
  };

  const handleBookAvailable = async () => {
    if (!conflicts) return;
    setLoading(true);
    const skipDates = conflicts.map(c => c.date);
    await onSubmit({ ...form, date:toISO(selectedDate), time_slot:slotLabel(selectedStartH,durationHours), duration_hours:durationHours, recurrence, end_date:endDate, skip_dates:skipDates });
    setLoading(false);
    setConflicts(null);
  };

  return (
    <>
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

    {/* ── Konfliktdialog ── */}
    {conflicts && (
      <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.65)',zIndex:2000,display:'flex',alignItems:'flex-end',justifyContent:'center'}} onClick={()=>setConflicts(null)}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.card,borderRadius:'20px 20px 0 0',padding:'24px 20px 36px',width:'100%',maxWidth:500,boxSizing:'border-box',animation:'slideUp .25s cubic-bezier(0.32,0.72,0,1)',maxHeight:'80vh',overflowY:'auto'}}>
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:6}}>
            <div style={{width:32,height:32,borderRadius:10,background:'#ef444422',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            </div>
            <div style={{fontSize:17,fontWeight:800,color:T.text,fontFamily:'system-ui'}}>Tidskonflikter hittades</div>
          </div>
          <div style={{fontSize:13,color:T.textMuted,marginBottom:16,fontFamily:'system-ui'}}>
            {conflicts.length} tillfälle{conflicts.length!==1?'n':''} krockar med befintliga bokningar.
          </div>

          {/* Lista konflikter */}
          <div style={{display:'flex',flexDirection:'column',gap:6,marginBottom:20,maxHeight:260,overflowY:'auto'}}>
            {conflicts.map((c,i) => (
              <div key={i} style={{background:`#ef444411`,border:'1px solid #ef444433',borderRadius:10,padding:'10px 12px'}}>
                <div style={{fontSize:13,fontWeight:700,color:T.text,fontFamily:'system-ui',marginBottom:4}}>
                  {isoToDisplay(c.date)} · {c.time_slot}
                </div>
                {c.clashing.map(b => (
                  <div key={b.id} style={{fontSize:11,color:'#ef4444',fontFamily:'system-ui'}}>
                    ↳ {b.name} · {b.time_slot}
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Val */}
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            <button onClick={()=>setConflicts(null)}
              style={{padding:'13px',borderRadius:12,border:`1px solid ${T.accent}`,background:'none',color:T.accent,fontSize:14,fontWeight:700,cursor:'pointer',fontFamily:'system-ui',WebkitTapHighlightColor:'transparent'}}>
              ← Ändra tid
            </button>
            <button onClick={handleBookAvailable} disabled={loading}
              style={{padding:'13px',borderRadius:12,border:'none',background:T.accent,color:'#fff',fontSize:14,fontWeight:700,cursor:'pointer',fontFamily:'system-ui',WebkitTapHighlightColor:'transparent'}}>
              {loading ? 'Bokar...' : 'Boka bara lediga tillfällen ✓'}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

// ── Login screens ─────────────────────────────────────────────────────────────

// Full UserLogin: telefon → engångskod (första gången) → välj PIN → inloggad
function UserLogin({ onSuccess, onBack, T }) {
  const [step, setStep] = useState('phone'); // phone|invite|setpin|pin
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [newPin, setNewPin] = useState('');
  const [newPin2, setNewPin2] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [userData, setUserData] = useState(null);
  const lookupRef = useRef(null);

  const handlePhoneChange = (val) => {
    setPhone(val); setError('');
    clearTimeout(lookupRef.current);
    const norm = normalizePhone(val);
    if (norm.length >= 10) {
      lookupRef.current = setTimeout(async () => {
        const { data } = await supabase.from('app_users').select('id,name,role,invite_used,pin_hash,deleted_at').eq('phone',norm).maybeSingle();
        if (data && !data.deleted_at) {
          setUserData({...data, norm});
          setStep(data.invite_used ? 'pin' : 'invite');
        }
      }, 400);
    }
  };

  const handlePhoneNext = async () => {
    if (!phone.trim()) { setError('Ange ditt telefonnummer.'); return; }
    setLoading(true); setError('');
    const norm = normalizePhone(phone);
    const { data } = await supabase.from('app_users').select('id,name,role,invite_used,pin_hash,deleted_at').eq('phone',norm).maybeSingle();
    setLoading(false);
    if (!data || data.deleted_at) { setError('Inget konto hittades. Kontakta admin för att få ett konto.'); return; }
    setUserData({...data, norm});
    setStep(data.invite_used ? 'pin' : 'invite');
  };

  const handleInviteSubmit = async () => {
    if (inviteCode.length !== 6) { setError('Ange 6-siffrig inbjudningskod.'); return; }
    setLoading(true); setError('');
    const { data } = await supabase.from('app_users').select('invite_code').eq('id',userData.id).maybeSingle();
    if (data?.invite_code !== inviteCode) { setLoading(false); setError('Fel kod. Kontrollera koden med admin.'); return; }
    setLoading(false);
    setStep('setpin');
  };

  const handleSetPin = async () => {
    if (newPin.length < 4) { setError('PIN måste vara minst 4 siffror.'); return; }
    if (newPin !== newPin2) { setError('PIN-koderna matchar inte.'); return; }
    setLoading(true); setError('');
    const pinHash = await sha256(userData.norm + ':' + newPin);
    await supabase.from('app_users').update({ pin_hash:pinHash, invite_used:true, invite_code:null, last_login:Date.now() }).eq('id',userData.id);
    setLoading(false);
    localStorage.setItem(STORAGE_USER_ID, userData.id);
    localStorage.setItem(STORAGE_USER_NAME, userData.name);
    localStorage.setItem(STORAGE_USER_ROLE, userData.role);
    localStorage.setItem(STORAGE_PHONE, userData.norm);
    if (userData.role === 'admin') localStorage.setItem(STORAGE_ADMIN, 'true');
    onSuccess({ id:userData.id, name:userData.name, role:userData.role });
  };

  const handlePinSubmit = async () => {
    setLoading(true); setError('');
    const pinHash = await sha256(userData.norm + ':' + pin);
    if (pinHash !== userData.pin_hash) { setLoading(false); setError('Fel PIN-kod. Försök igen.'); setPin(''); return; }
    await supabase.from('app_users').update({ last_login:Date.now() }).eq('id',userData.id);
    setLoading(false);
    localStorage.setItem(STORAGE_USER_ID, userData.id);
    localStorage.setItem(STORAGE_USER_NAME, userData.name);
    localStorage.setItem(STORAGE_USER_ROLE, userData.role);
    localStorage.setItem(STORAGE_PHONE, userData.norm);
    if (userData.role === 'admin') localStorage.setItem(STORAGE_ADMIN, 'true');
    else localStorage.removeItem(STORAGE_ADMIN);
    onSuccess({ id:userData.id, name:userData.name, role:userData.role });
  };

  const iconStyle = { width:56,height:56,borderRadius:'50%',background:`${T.accent}22`,display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 14px' };

  return (
    <div style={{paddingTop:'max(20px, env(safe-area-inset-top, 0px))',paddingLeft:'16px',paddingRight:'16px',paddingBottom:'20px',fontFamily:'system-ui'}}>
      {onBack && <BackButton onBack={onBack} T={T}/>}
      <div style={{marginTop:24,maxWidth:340,margin:'24px auto 0'}}>
        {step==='phone'&&<>
          <div style={{textAlign:'center',marginBottom:24}}>
            <div style={iconStyle}><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div>
            <div style={{fontSize:20,fontWeight:800,color:T.text}}>Åtkomst endast för behöriga</div>
            <div style={{fontSize:13,color:T.textMuted,marginTop:4}}>Ange ditt telefonnummer</div>
          </div>
          <input type="tel" value={phone} onChange={e=>handlePhoneChange(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handlePhoneNext()} placeholder="07X-XXX XX XX" autoFocus
            style={{background:T.cardElevated,border:`1px solid ${T.border}`,borderRadius:12,padding:'13px 16px',fontSize:18,color:T.text,outline:'none',width:'100%',boxSizing:'border-box'}}/>
          {error&&<div style={{fontSize:13,color:'#ef4444',background:'#ef444418',padding:'10px 14px',borderRadius:8,marginTop:8}}>{error}</div>}
          <button onClick={handlePhoneNext} disabled={loading}
            style={{marginTop:16,width:'100%',padding:'14px',borderRadius:12,border:'none',background:T.accent,color:'#fff',fontSize:16,fontWeight:700,cursor:'pointer'}}>
            {loading?'Kontrollerar...':'Fortsätt →'}
          </button>
        </>}

        {step==='invite'&&<>
          <div style={{textAlign:'center',marginBottom:24}}>
            <div style={iconStyle}><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></div>
            <div style={{fontSize:20,fontWeight:800,color:T.text}}>Välkommen, {userData?.name}</div>
            <div style={{fontSize:13,color:T.textMuted,marginTop:4}}>Ange din 6-siffriga inbjudningskod från admin</div>
          </div>
          <input type="tel" inputMode="numeric" maxLength={6} value={inviteCode} onChange={e=>{setInviteCode(e.target.value.replace(/\D/g,'').slice(0,6));setError('');}} placeholder="- - - - - -"
            style={{background:T.cardElevated,border:`1px solid ${T.border}`,borderRadius:12,padding:'14px',fontSize:28,color:T.text,outline:'none',width:'100%',boxSizing:'border-box',textAlign:'center',letterSpacing:12}}/>
          {error&&<div style={{fontSize:13,color:'#ef4444',background:'#ef444418',padding:'10px 14px',borderRadius:8,marginTop:8}}>{error}</div>}
          <button onClick={handleInviteSubmit} disabled={loading}
            style={{marginTop:16,width:'100%',padding:'14px',borderRadius:12,border:'none',background:T.accent,color:'#fff',fontSize:16,fontWeight:700,cursor:'pointer'}}>
            {loading?'Kontrollerar...':'Verifiera kod →'}
          </button>
          <button onClick={()=>{setStep('phone');setError('');}} style={{marginTop:10,background:'none',border:'none',color:T.textMuted,cursor:'pointer',fontSize:13,width:'100%'}}>← Byt telefonnummer</button>
        </>}

        {step==='setpin'&&<>
          <div style={{textAlign:'center',marginBottom:24}}>
            <div style={iconStyle}><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></div>
            <div style={{fontSize:20,fontWeight:800,color:T.text}}>Välj PIN-kod</div>
            <div style={{fontSize:13,color:T.textMuted,marginTop:4}}>Används vid framtida inloggning</div>
          </div>
          <input type="password" inputMode="numeric" maxLength={6} value={newPin} onChange={e=>{setNewPin(e.target.value.replace(/\D/g,'').slice(0,6));setError('');}} placeholder="Välj PIN (4-6 siffror)"
            style={{background:T.cardElevated,border:`1px solid ${T.border}`,borderRadius:12,padding:'14px',fontSize:24,color:T.text,outline:'none',width:'100%',boxSizing:'border-box',textAlign:'center',letterSpacing:8,marginBottom:10}}/>
          <input type="password" inputMode="numeric" maxLength={6} value={newPin2} onChange={e=>{setNewPin2(e.target.value.replace(/\D/g,'').slice(0,6));setError('');}} placeholder="Upprepa PIN"
            style={{background:T.cardElevated,border:`1px solid ${T.border}`,borderRadius:12,padding:'14px',fontSize:24,color:T.text,outline:'none',width:'100%',boxSizing:'border-box',textAlign:'center',letterSpacing:8}}/>
          {error&&<div style={{fontSize:13,color:'#ef4444',background:'#ef444418',padding:'10px 14px',borderRadius:8,marginTop:8}}>{error}</div>}
          <button onClick={handleSetPin} disabled={loading}
            style={{marginTop:16,width:'100%',padding:'14px',borderRadius:12,border:'none',background:T.accent,color:'#fff',fontSize:16,fontWeight:700,cursor:'pointer'}}>
            {loading?'Sparar...':'Spara PIN & logga in'}
          </button>
        </>}

        {step==='pin'&&<>
          <div style={{textAlign:'center',marginBottom:24}}>
            <div style={iconStyle}><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div>
            <div style={{fontSize:20,fontWeight:800,color:T.text}}>Välkommen, {userData?.name}</div>
            <div style={{fontSize:13,color:T.textMuted,marginTop:4}}>Ange din PIN-kod</div>
          </div>
          <input type="password" inputMode="numeric" maxLength={6} value={pin} onChange={async e=>{
              const val=e.target.value.replace(/\D/g,'').slice(0,6);
              setPin(val); setError('');
              // Auto-submit when PIN is correct length (4-6 digits) and matches
              if (val.length >= 4 && userData?.pin_hash) {
                const hash = await sha256(userData.norm + ':' + val);
                if (hash === userData.pin_hash) {
                  setLoading(true);
                  await supabase.from('app_users').update({ last_login:Date.now() }).eq('id',userData.id);
                  setLoading(false);
                  localStorage.setItem(STORAGE_USER_ID, userData.id);
                  localStorage.setItem(STORAGE_USER_NAME, userData.name);
                  localStorage.setItem(STORAGE_USER_ROLE, userData.role);
                  localStorage.setItem(STORAGE_PHONE, userData.norm);
                  if (userData.role === 'admin') localStorage.setItem(STORAGE_ADMIN, 'true');
                  else localStorage.removeItem(STORAGE_ADMIN);
                  onSuccess({ id:userData.id, name:userData.name, role:userData.role });
                }
              }
            }} onKeyDown={e=>e.key==='Enter'&&handlePinSubmit()} placeholder="PIN-kod" autoFocus
            style={{background:T.cardElevated,border:`1px solid ${T.border}`,borderRadius:12,padding:'14px',fontSize:28,color:T.text,outline:'none',width:'100%',boxSizing:'border-box',textAlign:'center',letterSpacing:12}}/>
          {error&&<div style={{fontSize:13,color:'#ef4444',background:'#ef444418',padding:'10px 14px',borderRadius:8,marginTop:8}}>{error}</div>}
          <button onClick={handlePinSubmit} disabled={loading}
            style={{marginTop:16,width:'100%',padding:'14px',borderRadius:12,border:'none',background:T.accent,color:'#fff',fontSize:16,fontWeight:700,cursor:'pointer'}}>
            {loading?'Loggar in...':'Logga in'}
          </button>
          <button onClick={()=>{setStep('phone');setPhone('');setError('');setUserData(null);}} style={{marginTop:10,background:'none',border:'none',color:T.textMuted,cursor:'pointer',fontSize:13,width:'100%'}}>← Byt konto</button>
        </>}
      </div>
    </div>
  );
}

// ── UserManagement — admin skapar/hanterar konton ─────────────────────────────

function UserManagement({ onBack, T }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name:'', phone:'', role:'user' });
  const [creating, setCreating] = useState(false);
  const [newInvite, setNewInvite] = useState(null);
  const [resetTarget, setResetTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const currentUserId = localStorage.getItem(STORAGE_USER_ID);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('app_users').select('id,name,phone,role,invite_used,created_at,last_login,deleted_at,deleted_by_name').order('created_at',{ascending:false});
    if (data) setUsers(data);
    setLoading(false);
  };
  useEffect(()=>{ load(); },[]);// eslint-disable-line

  const handleCreate = async () => {
    if (!form.name.trim()||!form.phone.trim()) { setError('Namn och telefon krävs.'); return; }
    setCreating(true); setError('');
    const norm = normalizePhone(form.phone);
    const existing = await supabase.from('app_users').select('id').eq('phone',norm).maybeSingle();
    if (existing.data) { setCreating(false); setError('Det finns redan ett konto med detta telefonnummer.'); return; }
    const code = generateInviteCode();
    const { error:err } = await supabase.from('app_users').insert([{
      id:uid(), name:form.name.trim(), phone:norm, role:form.role,
      invite_code:code, invite_used:false,
      created_by:currentUserId, created_at:Date.now(), last_login:null, pin_hash:null,
    }]);
    setCreating(false);
    if (err) { setError('Kunde inte skapa konto: '+err.message); return; }
    setNewInvite({ name:form.name.trim(), code, phone:norm });
    setForm({ name:'', phone:'', role:'user' });
    setShowCreate(false);
    load();
  };

  const handleResetPin = async (user) => {
    const code = generateInviteCode();
    await supabase.from('app_users').update({ invite_code:code, invite_used:false, pin_hash:null }).eq('id',user.id);
    setResetTarget({...user, code});
    load();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const adminName = localStorage.getItem(STORAGE_USER_NAME)||'Okänd admin';
    const adminId   = localStorage.getItem(STORAGE_USER_ID)||'?';
    await supabase.from('app_users').update({ deleted_at:Date.now(), deleted_by_id:adminId, deleted_by_name:adminName, pin_hash:null, invite_code:null }).eq('id',deleteTarget.id);
    setDeleting(false); setDeleteTarget(null); load();
  };

  const roleLabel = r => r==='admin'?'Admin':'Användare';
  const roleBg    = r => r==='admin'?'#f59e0b22':'#22c55e22';
  const roleColor = r => r==='admin'?'#f59e0b':'#22c55e';

  return (
    <div style={{paddingTop:'max(20px, env(safe-area-inset-top, 0px))',paddingLeft:'16px',paddingRight:'16px',paddingBottom:'20px',fontFamily:'system-ui',minHeight:'100%',background:T.bg}}>
      <BackButton onBack={onBack} T={T}/>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginTop:16,marginBottom:20}}>
        <div style={{fontSize:22,fontWeight:800,color:T.text}}>Hantera konton</div>
        <button onClick={()=>setShowCreate(v=>!v)} style={{background:T.accent,color:'#fff',border:'none',borderRadius:12,padding:'8px 16px',fontSize:13,fontWeight:700,cursor:'pointer',WebkitTapHighlightColor:'transparent',display:'flex',alignItems:'center',gap:6}}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Nytt konto
        </button>
      </div>

      {(newInvite||resetTarget)&&<div style={{background:`${T.accent}18`,border:`1px solid ${T.accent}44`,borderRadius:16,padding:16,marginBottom:16}}>
        <div style={{fontSize:13,fontWeight:700,color:T.accent,marginBottom:8}}>
          {newInvite?`✓ Konto skapat för ${newInvite.name}`:`✓ Ny kod för ${resetTarget.name}`}
        </div>
        <div style={{fontSize:12,color:T.textMuted,marginBottom:10}}>Dela denna engångskod med användaren. Den används bara en gång.</div>
        <div style={{display:'flex',alignItems:'center',gap:10,background:T.bg,borderRadius:10,padding:'10px 14px'}}>
          <span style={{fontSize:28,fontWeight:800,color:T.accent,letterSpacing:8,fontVariantNumeric:'tabular-nums'}}>{newInvite?.code||resetTarget?.code}</span>
          <button onClick={()=>navigator.clipboard?.writeText(newInvite?.code||resetTarget?.code)} style={{background:'none',border:`1px solid ${T.border}`,borderRadius:8,padding:'5px 10px',fontSize:12,color:T.textMuted,cursor:'pointer'}}>Kopiera</button>
        </div>
        <div style={{fontSize:11,color:T.textMuted,marginTop:8}}>Tel: {newInvite?.phone||resetTarget?.phone}</div>
        <button onClick={()=>{setNewInvite(null);setResetTarget(null);}} style={{marginTop:10,background:'none',border:'none',color:T.textMuted,cursor:'pointer',fontSize:12}}>Stäng ×</button>
      </div>}

      {showCreate&&<div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:16,padding:16,marginBottom:16}}>
        <div style={{fontSize:15,fontWeight:700,color:T.text,marginBottom:14}}>Skapa nytt konto</div>
        <div style={{display:'flex',flexDirection:'column',gap:10}}>
          <Input label="NAMN" value={form.name} onChange={v=>setForm(p=>({...p,name:v}))} placeholder="Personens namn" required T={T}/>
          <Input label="TELEFON" value={form.phone} onChange={v=>setForm(p=>({...p,phone:v}))} placeholder="07X-XXX XX XX" required T={T} type="tel"/>
          <div>
            <label style={{fontSize:12,fontWeight:600,color:T.textMuted,letterSpacing:'.3px'}}>ROLL</label>
            <div style={{display:'flex',gap:8,marginTop:6}}>
              {['user','admin'].map(r=>(
                <button key={r} onClick={()=>setForm(p=>({...p,role:r}))} style={{flex:1,padding:'10px',borderRadius:10,border:`1px solid ${form.role===r?T.accent:T.border}`,background:form.role===r?`${T.accent}18`:'none',color:form.role===r?T.accent:T.textMuted,fontWeight:600,fontSize:13,cursor:'pointer',WebkitTapHighlightColor:'transparent'}}>
                  {r==='admin'?'Admin':'Användare'}
                </button>
              ))}
            </div>
          </div>
          {error&&<div style={{fontSize:13,color:'#ef4444',background:'#ef444415',borderRadius:8,padding:'8px 12px'}}>{error}</div>}
          <div style={{display:'flex',gap:8}}>
            <button onClick={()=>{setShowCreate(false);setError('');}} style={{flex:1,padding:'11px',borderRadius:10,border:`1px solid ${T.border}`,background:'none',color:T.textMuted,fontWeight:600,cursor:'pointer'}}>Avbryt</button>
            <button onClick={handleCreate} disabled={creating} style={{flex:1,padding:'11px',borderRadius:10,border:'none',background:T.accent,color:'#fff',fontWeight:700,cursor:'pointer',WebkitTapHighlightColor:'transparent'}}>{creating?'Skapar...':'Skapa konto'}</button>
          </div>
        </div>
      </div>}

      {deleteTarget&&<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',zIndex:100,display:'flex',alignItems:'flex-end',justifyContent:'center',padding:'0 16px 32px'}}>
        <div style={{background:T.card,borderRadius:20,padding:24,width:'100%',maxWidth:400}}>
          <div style={{fontSize:17,fontWeight:800,color:T.text,marginBottom:8}}>Radera konto?</div>
          <div style={{fontSize:13,color:T.textMuted,marginBottom:6,lineHeight:1.5}}><strong style={{color:T.text}}>{deleteTarget.name}</strong> ({deleteTarget.phone})</div>
          <div style={{fontSize:12,color:T.textMuted,marginBottom:20,lineHeight:1.5,background:'#ef444411',borderRadius:8,padding:'8px 12px',border:'1px solid #ef444433'}}>
            Kontot inaktiveras. Deras bokningar påverkas inte. Raderingen loggas med ditt namn.
          </div>
          <div style={{display:'flex',gap:10}}>
            <button onClick={()=>setDeleteTarget(null)} style={{flex:1,padding:'12px',borderRadius:12,border:`1px solid ${T.border}`,background:'none',color:T.text,fontWeight:600,cursor:'pointer',fontSize:14}}>Avbryt</button>
            <button onClick={handleDelete} disabled={deleting} style={{flex:1,padding:'12px',borderRadius:12,border:'none',background:'#ef4444',color:'#fff',fontWeight:700,cursor:'pointer',fontSize:14,WebkitTapHighlightColor:'transparent'}}>
              {deleting?'Raderar...':'Radera konto'}
            </button>
          </div>
        </div>
      </div>}

      {loading ? <Spinner T={T}/> : <>
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          {users.filter(u=>!u.deleted_at).length===0&&<div style={{textAlign:'center',color:T.textMuted,padding:'40px 0'}}>Inga aktiva konton</div>}
          {users.filter(u=>!u.deleted_at).map(u=>(
            <div key={u.id} style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:14,padding:'14px 16px'}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6}}>
                <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                  <div style={{fontSize:15,fontWeight:700,color:T.text}}>{u.name}</div>
                  <span style={{background:roleBg(u.role),color:roleColor(u.role),borderRadius:8,fontSize:11,fontWeight:700,padding:'2px 8px'}}>{roleLabel(u.role)}</span>
                  {!u.invite_used&&<span style={{background:'#f59e0b22',color:'#f59e0b',borderRadius:8,fontSize:10,fontWeight:700,padding:'2px 7px'}}>Ej aktiverat</span>}
                </div>
                {u.id!==currentUserId&&<button onClick={()=>setDeleteTarget(u)} style={{background:'#ef444418',border:'1px solid #ef444433',borderRadius:8,cursor:'pointer',color:'#ef4444',fontSize:12,fontWeight:600,padding:'4px 10px',WebkitTapHighlightColor:'transparent'}}>Radera</button>}
              </div>
              <div style={{fontSize:12,color:T.textMuted,marginBottom:8}}>{u.phone}</div>
              <div style={{display:'flex',gap:6}}>
                <button onClick={()=>handleResetPin(u)} style={{padding:'5px 12px',borderRadius:8,border:`1px solid ${T.border}`,background:T.cardElevated,color:T.textMuted,fontSize:12,fontWeight:600,cursor:'pointer',WebkitTapHighlightColor:'transparent'}}>
                  Ny inbjudningskod
                </button>
              </div>
            </div>
          ))}
        </div>
        {users.filter(u=>u.deleted_at).length>0&&<>
          <div style={{fontSize:12,fontWeight:700,color:T.textMuted,letterSpacing:'.5px',marginTop:24,marginBottom:10}}>RADERADE KONTON</div>
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {users.filter(u=>u.deleted_at).map(u=>(
              <div key={u.id} style={{background:T.card,border:'1px solid #ef444433',borderRadius:14,padding:'14px 16px',opacity:0.7}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:4}}>
                  <div style={{fontSize:14,fontWeight:700,color:T.textMuted,textDecoration:'line-through'}}>{u.name}</div>
                  <span style={{background:'#ef444422',color:'#ef4444',borderRadius:8,fontSize:10,fontWeight:700,padding:'2px 8px'}}>Raderat</span>
                </div>
                <div style={{fontSize:12,color:T.textMuted,marginBottom:4}}>{u.phone}</div>
                <div style={{fontSize:11,color:T.textMuted}}>Raderades av <strong style={{color:T.text}}>{u.deleted_by_name||'Okänd'}</strong>{u.deleted_at&&<> · {new Date(u.deleted_at).toLocaleDateString('sv-SE')}</>}</div>
              </div>
            ))}
          </div>
        </>}
      </>}
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
  highlightFilter,
  onMarkAdminSeen,
  markVisitorSeen,
  adminInitialFilter,
  visitorUnread = 0,
}) {
  const { theme: T } = useTheme();
  const [bookings, setBookings] = useState([]);
  const [exceptions, setExceptions] = useState([]);
  const [dbLoading, setDbLoading] = useState(true);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [toast, setToast] = useState('');
  const [view, setView] = useState(() => {
    const userId = localStorage.getItem(STORAGE_USER_ID);
    const role   = localStorage.getItem(STORAGE_USER_ROLE);
    if (!userId) return 'login'; // kalender är skyddad — alltid inloggning först
    if (startAtAdmin || role === 'admin') return 'admin';
    if (highlightBookingId) return 'my-bookings';
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

  // Smart initial load:
  // Steg 1 — snabb fetch av egna bokningar → Mina bokningar visas omedelbart
  // Steg 2 — full fetch i bakgrunden → kalendern och admin fylls på
  useEffect(() => {
    const userId = localStorage.getItem(STORAGE_USER_ID);
    const devId  = localStorage.getItem('islamnu_device_id');

    if (userId || devId) {
      let q = supabase.from('bookings').select('*').order('created_at', { ascending: false });
      if (userId) q = q.eq('user_id', userId);
      else q = q.eq('device_id', devId);
      q.then(({ data }) => {
        if (data && data.length > 0) {
          setBookings(data);
          setDbLoading(false); // visa UI direkt utan att vänta på full fetch
        }
      });
    }

    // Full fetch i bakgrunden
    fetchAll();
  }, [fetchAll]); // eslint-disable-line

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

  // Navigera till my-bookings när highlightBookingId sätts, till kalender när det rensas
  useEffect(() => {
    if (highlightBookingId) {
      setView('my-bookings');
    } else if (!highlightBookingId && view === 'my-bookings') {
      // Rensades via direkt tab-klick — gå till kalender (bara om inloggad)
      const userId = localStorage.getItem(STORAGE_USER_ID);
      if (userId) setView('calendar');
    }
  }, [highlightBookingId]); // eslint-disable-line

  // Edge swipe back — bara om inloggad (kalender är skyddad)
  const viewRef = useRef(view);
  useEffect(() => { viewRef.current = view; }, [view]);
  useEffect(() => {
    const handler = () => {
      // Blockera alltid edge swipe i login-vyn — oavsett localStorage-state
      if (viewRef.current === 'login') return;
      const userId = localStorage.getItem(STORAGE_USER_ID);
      if (!userId) return;
      setView('calendar');
    };
    window.addEventListener('edgeSwipeBack', handler);
    return () => window.removeEventListener('edgeSwipeBack', handler);
  }, []); // eslint-disable-line

  // Tab bar hide/show based on view
  useEffect(() => {
    // Tab bar alltid synlig — onTabBarShow körs alltid
    onTabBarShow?.();
    // Rensa visitor badge när Mina bokningar öppnas
    if (view === 'my-bookings') markVisitorSeen?.();
    // Rensa admin cancelled badge när admin öppnar adminpanelen
    if (view === 'admin') onMarkAdminSeen?.();
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

    // Skapa skip-exceptions för krockar om användaren valde "boka bara lediga"
    const skipDates = formData.skip_dates || [];
    if (skipDates.length > 0) {
      const excs = skipDates.map(date => ({
        id: uid(),
        booking_id: booking.id,
        exception_date: date,
        type: 'skip',
        created_at: Date.now(),
      }));
      await supabase.from('booking_exceptions').insert(excs);
      setExceptions(prev => [...prev, ...excs]);
    }

    activateForDevice?.();
    localStorage.setItem(STORAGE_PHONE, normalizePhone(formData.phone));
    // Lägg till bokningen direkt i local state — syns omedelbart i Mina bokningar
    setBookings(prev => [booking, ...prev]);
    showToast(skipDates.length > 0 ? `Förfrågan skickad — ${skipDates.length} krockar hoppades över!` : 'Bokningsförfrågan skickad!');
    setView('my-bookings');
  }, [deviceId, loggedInUser, showToast, activateForDevice]);

  // Visitor: cancel single occurrence (adds exception)
  const handleCancelOccurrence = useCallback(async (booking, occurrenceDate, reason) => {
    const userName = localStorage.getItem(STORAGE_USER_NAME) || 'Besökaren';
    const comment = reason || `Avbokad av ${userName}.`;
    if (!occurrenceDate || booking.recurrence === 'none') {
      // Single booking — cancel it directly
      const { error } = await supabase.from('bookings').update({ status:'cancelled', admin_comment:comment, resolved_at:Date.now() }).eq('id', booking.id);
      if (error) { showToast('Något gick fel.'); return; }
      setBookings(prev => prev.map(b => b.id===booking.id ? {...b,status:'cancelled',admin_comment:comment} : b));
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
  const handleCancelFromDate = useCallback(async (booking, fromDate, reason) => {
    const prevDay = new Date(parseISO(fromDate));
    prevDay.setDate(prevDay.getDate() - 1);
    const newEndDate = toISO(prevDay);
    const userName = localStorage.getItem(STORAGE_USER_NAME) || 'Besökaren';
    const comment = reason || `Avbokad av ${userName}.`;
    const { error } = await supabase.from('bookings').update({ end_date:newEndDate, admin_comment:comment, resolved_at:Date.now() }).eq('id', booking.id);
    if (error) { showToast('Något gick fel.'); return; }
    setBookings(prev => prev.map(b => b.id===booking.id ? {...b,end_date:newEndDate,admin_comment:comment} : b));
    showToast('Serien avbokad från detta datum.');
  }, [showToast]);

  // Visitor: cancel entire series
  const handleCancelSeries = useCallback(async (booking, reason) => {
    const userName = localStorage.getItem(STORAGE_USER_NAME) || 'Besökaren';
    const comment = reason || `Avbokad av ${userName}.`;
    const { error } = await supabase.from('bookings').update({ status:'cancelled', admin_comment:comment, resolved_at:Date.now() }).eq('id', booking.id);
    if (error) { showToast('Något gick fel.'); return; }
    setBookings(prev => prev.map(b => b.id===booking.id ? {...b,status:'cancelled',admin_comment:comment} : b));
    showToast('Hela serien avbokad.');
  }, [showToast]);

  // Visitor/Admin: restore a cancelled booking
  const handleRestoreBooking = useCallback(async (booking) => {
    const newStatus = booking.user_id ? 'pending' : 'approved';
    const { error } = await supabase.from('bookings').update({
      status: newStatus,
      admin_comment: '',
      resolved_at: null,
    }).eq('id', booking.id);
    if (error) { showToast('Något gick fel.'); return; }
    setBookings(prev => prev.map(b => b.id===booking.id ? {...b,status:newStatus,admin_comment:'',resolved_at:null} : b));
    showToast(newStatus==='pending' ? 'Bokning återskickad som förfrågan ✓' : 'Bokning återaktiverad ✓');
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
    const adminName = localStorage.getItem(STORAGE_USER_NAME) || 'Admin';
    const comment = `Avbokad av ${adminName}: ${explanation}`;
    if (booking.recurrence !== 'none' && occurrenceDate) {
      const exc = { id:uid(), booking_id:booking.id, exception_date:occurrenceDate, type:'skip', admin_comment:comment, created_at:Date.now() };
      const { error } = await supabase.from('booking_exceptions').insert([exc]);
      if (error) { showToast('Något gick fel.'); return; }
      setExceptions(prev => [...prev, exc]);
    } else {
      const { error } = await supabase.from('bookings').update({ status:'cancelled', admin_comment:comment, resolved_at:Date.now() }).eq('id', booking.id);
      if (error) { showToast('Något gick fel.'); return; }
      setBookings(prev => prev.map(b => b.id===booking.id ? {...b,status:'cancelled',admin_comment:comment} : b));
    }
    showToast('Tillfälle borttaget & besökare notifierad.');
  }, [showToast]);

  // Admin: delete entire series
  const handleAdminDeleteSeries = useCallback(async (booking, explanation) => {
    const adminName = localStorage.getItem(STORAGE_USER_NAME) || 'Admin';
    const comment = `Avbokad av ${adminName}: ${explanation}`;
    const { error } = await supabase.from('bookings').update({ status:'cancelled', admin_comment:comment, resolved_at:Date.now() }).eq('id', booking.id);
    if (error) { showToast('Något gick fel.'); return; }
    setBookings(prev => prev.map(b => b.id===booking.id ? {...b,status:'cancelled',admin_comment:comment} : b));
    showToast('Hela serien borttagen & besökare notifierad.');
  }, [showToast]);

  // Admin: add recurring booking directly
  const handleAdminAddRecurring = useCallback(async (formData) => {
    const bookingId = uid();
    const booking = {
      id: bookingId,
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

    // Skapa skip-exceptions för krockar
    const skipDates = formData.skip_dates || [];
    if (skipDates.length > 0) {
      const excs = skipDates.map(date => ({
        id: uid(),
        booking_id: bookingId,
        exception_date: date,
        type: 'skip',
        created_at: Date.now(),
      }));
      const { error: excError } = await supabase.from('booking_exceptions').insert(excs);
      if (excError) console.error('Exception insert error:', excError);
      setExceptions(prev => [...prev, ...excs]);
      showToast(`Bokning tillagd — ${skipDates.length} krockar hoppades över ✓`);
    } else {
      showToast('Återkommande bokning tillagd ✓');
    }
    setBookings(prev => [booking, ...prev]);
  }, [showToast]);

  // Called when UserLogin succeeds — handle both admin and regular user
  const handleLoginSuccess = useCallback((user) => {
    setLoggedInUser(user);
    localStorage.setItem(STORAGE_USER_ID, user.id);
    localStorage.setItem(STORAGE_USER_NAME, user.name);
    localStorage.setItem(STORAGE_USER_ROLE, user.role);
    if (user.role === 'admin') {
      localStorage.setItem(STORAGE_ADMIN, 'true');
      setAdminMode(true);
      registerAdminDevice?.();
      setView('admin');
      showToast(`Välkommen, ${user.name}`);
    } else {
      localStorage.removeItem(STORAGE_ADMIN);
      setAdminMode(false);
      setView('calendar');
      showToast(`Välkommen, ${user.name}`);
    }
  }, [showToast, registerAdminDevice]);

  const handleAdminLogin = handleLoginSuccess; // kept for compatibility

  const handleAdminLogout = useCallback(() => {
    localStorage.removeItem(STORAGE_ADMIN);
    localStorage.removeItem(STORAGE_USER_ID);
    localStorage.removeItem(STORAGE_USER_NAME);
    localStorage.removeItem(STORAGE_USER_ROLE);
    setAdminMode(false);
    setLoggedInUser(null);
    setView('login');
    showToast('Utloggad');
    dismissAdminDevice?.();
  }, [showToast, dismissAdminDevice]);

  const handleUserLogout = useCallback(() => {
    localStorage.removeItem(STORAGE_USER_ID);
    localStorage.removeItem(STORAGE_USER_NAME);
    localStorage.removeItem(STORAGE_USER_ROLE);
    localStorage.removeItem(STORAGE_ADMIN);
    setLoggedInUser(null);
    setAdminMode(false);
    setView('login');
    showToast('Utloggad');
  }, [showToast]);

  const handleSelectSlot = useCallback((date, slotLbl, startH, durationHours, existingBooking) => {
    if (adminMode && existingBooking) { setView('admin'); return; }
    setPendingSlot({ date, slotLabel:slotLbl, startH, durationHours });
    setView('form');
  }, [adminMode]);

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
              <button onClick={()=>{ setView('my-bookings'); markVisitorSeen?.(); }}
                style={{padding:'7px 14px',borderRadius:20,border:`1px solid ${visitorUnread>0?T.accent:T.border}`,background:visitorUnread>0?`${T.accent}11`:T.card,color:T.text,fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'system-ui',WebkitTapHighlightColor:'transparent',display:'flex',alignItems:'center',gap:6,position:'relative'}}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                {loggedInUser?.name || 'Mitt konto'}
                {visitorUnread > 0 && (
                  <span style={{background:T.accent,color:'#fff',borderRadius:10,fontSize:10,fontWeight:800,padding:'1px 6px',minWidth:16,textAlign:'center'}}>
                    {visitorUnread > 9 ? '9+' : visitorUnread}
                  </span>
                )}
              </button>
              {adminMode && (
                <button onClick={()=>setView('admin')}
                  style={{padding:'7px 14px',borderRadius:20,border:'1px solid #f59e0b44',background:'#f59e0b18',color:'#f59e0b',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'system-ui',WebkitTapHighlightColor:'transparent'}}>
                  Adminpanel →
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
          onRestore={handleRestoreBooking}
          highlightBookingId={highlightBookingId}
          highlightFilter={highlightFilter}
          onLogout={handleUserLogout}
          T={T}
        />
      )}

      {view === 'login' && (
        <UserLogin
          onSuccess={handleLoginSuccess}
          onBack={undefined}
          T={T}
        />
      )}

      {view === 'users' && (
        <UserManagement onBack={()=>setView('admin')} T={T}/>
      )}

      {view === 'admin' && (
        <AdminPanel
          bookings={bookings} exceptions={exceptions}
          onBack={handleAdminLogout}
          onApprove={handleApprove} onReject={handleReject}
          onDelete={handleAdminDelete} onDeleteSeries={handleAdminDeleteSeries}
          onDeleteFromDate={handleCancelFromDate}
          adminInitialFilter={adminInitialFilter}
          onAdminAddRecurring={handleAdminAddRecurring}
          onRefreshNotifications={onRefreshNotifications}
          onMarkAdminSeen={onMarkAdminSeen}
          onManageUsers={()=>setView('users')}
          T={T}
        />
      )}
    </div>
  );
}
