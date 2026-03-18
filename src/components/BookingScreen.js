/**
 * BookingScreen.js — Bokningssystem med Supabase-backend
 * - Flexibel bokningstid (1–12 timmar)
 * - Smart tidsförslag baserat på vald längd
 * - Återkommande bokningar (veckovis / månadsvis)
 * - Besökare: återkalla eller redigera pending-bokning
 * - Admin: redigera eller ta bort bokning med obligatorisk förklaring
 * - Realtime updates, shared data across all devices
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTheme } from '../context/ThemeContext';
import { useScrollHide } from '../hooks/useScrollHide';
import { supabase } from '../services/supabaseClient';

const ADMIN_PIN      = '4242';
const STORAGE_ADMIN  = 'islamnu_admin_mode';
const STORAGE_DEVICE    = 'islamnu_device_id';
const STORAGE_PHONE     = 'islamnu_user_phone';
const STORAGE_PIN       = 'islamnu_user_pin';
const STORAGE_PIN_HASH  = 'islamnu_user_pin_hash';
const STORAGE_PIN_SHOWN = 'islamnu_pin_shown';
const STORAGE_USER_ID   = 'islamnu_user_id';   // uuid från app_users
const STORAGE_USER_NAME = 'islamnu_user_name';
const STORAGE_USER_ROLE = 'islamnu_user_role'; // 'user' | 'admin'
const RATE_LIMIT_KEY    = 'islamnu_recover_attempts';
const MAX_ATTEMPTS      = 5;
const LOCKOUT_MS        = 15 * 60 * 1000; // 15 min

// ── Engångskod för inbjudan ──────────────────────────────────────────────
function generateInviteCode(){
  return String(Math.floor(100000 + Math.random() * 900000)); // 6 siffror
}

// ── Kontrollera om en ändring kräver admin-godkännande ──────────────────
// Minskning (samma startH, kortare duration) → direkt godkänd
// Ökning av timmar, byte av datum/tid → edit_pending
function editRequiresApproval(original, updated) {
  const origStart = parseSlotStart(original.time_slot);
  const origEnd   = origStart + (original.duration_hours || 1);
  const newStart  = parseSlotStart(updated.time_slot);
  const newEnd    = newStart + (updated.duration_hours || 1);

  // Byte av datum → kräver godkännande
  if (original.date !== updated.date) return true;
  // Byte av starttid → kräver godkännande
  if (origStart !== newStart) return true;
  // Fler timmar → kräver godkännande
  if (newEnd > origEnd) return true;
  // Färre eller lika timmar, samma starttid → direkt OK
  return false;
}

const OPEN_HOUR  = 8;
const CLOSE_HOUR = 24;
// Halvtimmes-steg: 8, 8.5, 9 ... 23.5
const ALL_HOURS = Array.from({length:(CLOSE_HOUR-OPEN_HOUR)*2},(_,i)=>OPEN_HOUR+i*0.5);
function parseSlotStart(timeSlot){ const s=timeSlot.split('–')[0]; const[hh,mm]=s.split(':').map(Number); return hh+(mm===30?0.5:0); }

const DAYS_SV   = ['Mån','Tis','Ons','Tor','Fre','Lör','Sön'];
const MONTHS_SV = ['Januari','Februari','Mars','April','Maj','Juni','Juli','Augusti','September','Oktober','November','December'];

// 30 min → 16 tim (08:00–00:00 = hela dagen)
const DURATION_OPTIONS = [0.5,1,1.5,2,2.5,3,3.5,4,4.5,5,5.5,6,6.5,7,7.5,8,8.5,9,9.5,10,10.5,11,11.5,12,12.5,13,13.5,14,14.5,15,15.5,16];
function fmtDuration(h){ return h===0.5?'30 min':h%1===0?`${h} tim`:`${Math.floor(h)} tim 30 min`; }
const RECUR_OPTIONS      = [
  { value:'none',    label:'Ingen upprepning' },
  { value:'weekly',  label:'Veckovis' },
  { value:'monthly', label:'Månadsvis' },
];
const NO_END = 'no_end'; // sentinel för "inget slutdatum"

function toISO(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function parseISO(s){ const [y,m,d]=s.split('-').map(Number); return new Date(y,m-1,d); }
function isoToDisplay(s){ const d=parseISO(s); return `${d.getDate()} ${MONTHS_SV[d.getMonth()]} ${d.getFullYear()}`; }
function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,7); }
// Normaliserar telefonnummer — tar bort mellanslag, bindestreck, parenteser och ledande +46→0
function normalizePhone(p){
  let s=(p||'').replace(/[\s\-().]/g,'');
  if(s.startsWith('+46')) s='0'+s.slice(3);
  return s;
}
// Genererar en slumpmässig 4-siffrig PIN som sträng med ledande nolla om nödvändigt
function generatePin(){
  return String(Math.floor(1000+Math.random()*9000)); // 1000–9999, alltid 4 siffror
}
// SHA-256 via inbyggt Web Crypto API — ingen extern dependency
async function sha256(text){
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}
// Rate limiting: returnerar { blocked: bool, remaining: number, unlockAt: number|null }
function checkRateLimit(){
  try{
    const raw = localStorage.getItem(RATE_LIMIT_KEY);
    if(!raw) return {blocked:false,remaining:MAX_ATTEMPTS,unlockAt:null};
    const {attempts,lockedAt} = JSON.parse(raw);
    if(lockedAt){
      const unlockAt = lockedAt + LOCKOUT_MS;
      if(Date.now() < unlockAt) return {blocked:true,remaining:0,unlockAt};
      // Låsning har gått ut — återställ
      localStorage.removeItem(RATE_LIMIT_KEY);
      return {blocked:false,remaining:MAX_ATTEMPTS,unlockAt:null};
    }
    return {blocked:false,remaining:MAX_ATTEMPTS-attempts,unlockAt:null};
  }catch{ return {blocked:false,remaining:MAX_ATTEMPTS,unlockAt:null}; }
}
function recordFailedAttempt(){
  try{
    const raw = localStorage.getItem(RATE_LIMIT_KEY);
    const prev = raw ? JSON.parse(raw) : {attempts:0,lockedAt:null};
    const attempts = (prev.attempts||0)+1;
    const lockedAt = attempts>=MAX_ATTEMPTS ? Date.now() : null;
    localStorage.setItem(RATE_LIMIT_KEY, JSON.stringify({attempts,lockedAt}));
  }catch{}
}
function clearRateLimit(){ localStorage.removeItem(RATE_LIMIT_KEY); }
function fmtHour(h){ return h===24?'00:00':`${String(Math.floor(h)).padStart(2,'0')}:${h%1===0?'00':'30'}`; }
function slotLabel(startHour,dur){ return `${fmtHour(startHour)}–${fmtHour(startHour+dur)}`; }

function getWeekDays(anchor){
  const d=new Date(anchor); const day=(d.getDay()+6)%7; d.setDate(d.getDate()-day);
  return Array.from({length:7},(_,i)=>{ const dd=new Date(d); dd.setDate(dd.getDate()+i); return dd; });
}
function getMonthGrid(year,month){
  const first=new Date(year,month,1),last=new Date(year,month+1,0);
  const startPad=(first.getDay()+6)%7; const cells=[];
  for(let i=0;i<startPad;i++) cells.push(null);
  for(let d=1;d<=last.getDate();d++) cells.push(new Date(year,month,d));
  while(cells.length%7!==0) cells.push(null);
  const rows=[]; for(let i=0;i<cells.length;i+=7) rows.push(cells.slice(i,i+7)); return rows;
}
// Arbetar i 30-minutersblock (1 block = 0.5h)
function getBookedHours(bookings,iso,excludeId=null){
  const active=bookings.filter(b=>b.date===iso&&b.status!=='rejected'&&b.status!=='cancelled'&&b.id!==excludeId);
  const blocks=new Set(); // varje block representerar 30 min, nyckel = startH*2
  active.forEach(b=>{
    const parts=b.time_slot.split('–');
    // 00:00 as end time means midnight = hour 24
    const parseH=s=>{ const[hh,mm]=s.split(':').map(Number); const h=hh+(mm===30?0.5:0); return h===0?24:h; };
    const startH=parseH(parts[0]);
    const endH=parseH(parts[1]);
    const dur=b.duration_hours||(endH>startH?endH-startH:24-startH+endH);
    for(let i=0;i<dur*2;i++) blocks.add(startH*2+i);
  });
  return blocks;
}
function getAvailableStarts(bookings,iso,durationHours,excludeId=null){
  const booked=getBookedHours(bookings,iso,excludeId);
  const starts=[];
  // Only allow starts where the entire booking fits within OPEN_HOUR..CLOSE_HOUR
  // i.e. startH >= OPEN_HOUR AND startH + durationHours <= CLOSE_HOUR
  for(let h=OPEN_HOUR; h+durationHours<=CLOSE_HOUR; h+=0.5){
    if(isHourPast(iso,h,durationHours)) continue;
    const blocks=durationHours*2;
    let ok=true;
    for(let i=0;i<blocks;i++){ if(booked.has(h*2+i)){ok=false;break;} }
    if(ok) starts.push(h);
  }
  return starts;
}
function hasAnyAvailable(bookings,date,durationHours){ return getAvailableStarts(bookings,toISO(date),durationHours).length>0; }
function getRecurDates(startISO, recurrence, recurCount){
  if(recurrence==='none') return [startISO];
  const dates=[startISO];
  const base=parseISO(startISO);
  const useNoEnd = recurCount===NO_END || recurCount===undefined;
  // NO_END = max 5 år veckovis (260) / 5 år månadsvis (60)
  const defaultLimit = recurrence==='monthly' ? 60 : 260;
  const limit = useNoEnd ? defaultLimit : Number(recurCount);
  let i=1;
  while(dates.length < limit){
    const d=new Date(base);
    if(recurrence==='weekly') d.setDate(d.getDate()+7*i);
    if(recurrence==='monthly') d.setMonth(d.getMonth()+i);
    dates.push(toISO(d));
    i++;
  }
  return dates;
}
function slotColor(status){ return status==='available'?'#22c55e':status==='pending'?'#f59e0b':status==='booked'?'#ef4444':'#888'; }

// Returnerar true om ett tidsblock redan har passerat eller snart är för sent att boka.
// Regeln: startH är passerat om nuvarande tid >= startH + 30 min.
// Dvs klockan måste vara INNAN halv-timmen in i blocket för att det ska vara bokningsbart.
function isHourPast(iso, startH, durationHours) {
  // Never allow slots before opening hour
  if (startH < OPEN_HOUR) return true;
  // Never allow slots that end after closing hour
  if (startH + durationHours > CLOSE_HOUR) return true;
  const todayISO = toISO(new Date());
  if (iso !== todayISO) return false;
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = Math.floor(startH) * 60 + (startH % 1 === 0 ? 0 : 30);
  return nowMinutes >= startMinutes;
}

/* ── UI primitives ── */
function BackButton({onBack,T}){
  return <button onClick={onBack} style={{background:'none',border:'none',cursor:'pointer',display:'flex',alignItems:'center',gap:4,color:T.accent,fontFamily:'system-ui',fontSize:15,fontWeight:600,padding:'0 0 4px',WebkitTapHighlightColor:'transparent'}}>
    <span style={{fontSize:22,fontWeight:300,lineHeight:1}}>‹</span>
    Tillbaka
  </button>;
}
function Badge({status}){
  const m={
    pending:      {label:'Väntar',       bg:'#f59e0b22',color:'#f59e0b'},
    edit_pending: {label:'Ändr. väntar', bg:'#f9731622',color:'#f97316'},
    approved:     {label:'Godkänd',      bg:'#22c55e22',color:'#22c55e'},
    rejected:     {label:'Avböjd',       bg:'#ef444422',color:'#ef4444'},
    cancelled:    {label:'Inställd',     bg:'#64748b22',color:'#64748b'},
    edited:       {label:'Ändrad',       bg:'#3b82f622',color:'#3b82f6'},
  };
  const s=m[status]||{label:status,bg:'#88888822',color:'#888'};
  return <span style={{background:s.bg,color:s.color,borderRadius:8,fontSize:11,fontWeight:700,padding:'3px 8px',letterSpacing:'.3px',fontFamily:'system-ui'}}>{s.label}</span>;
}
function RecurBadge(){
  return <span style={{background:'#8b5cf622',color:'#8b5cf6',borderRadius:8,fontSize:10,fontWeight:700,padding:'2px 7px',fontFamily:'system-ui'}}>Återkommande</span>;
}
function Input({label,value,onChange,type='text',placeholder,required,T}){
  return <div style={{display:'flex',flexDirection:'column',gap:5}}>
    <label style={{fontSize:12,fontWeight:600,color:T.textMuted,fontFamily:'system-ui',letterSpacing:'.3px'}}>{label}{required&&<span style={{color:T.error}}> *</span>}</label>
    <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} style={{background:T.cardElevated,border:`1px solid ${T.border}`,borderRadius:10,padding:'11px 14px',fontSize:16,color:T.text,fontFamily:'system-ui',outline:'none',width:'100%',boxSizing:'border-box'}}/>
  </div>;
}
function Textarea({label,value,onChange,placeholder,required,T}){
  return <div style={{display:'flex',flexDirection:'column',gap:5}}>
    <label style={{fontSize:12,fontWeight:600,color:T.textMuted,fontFamily:'system-ui',letterSpacing:'.3px'}}>{label}{required&&<span style={{color:T.error}}> *</span>}</label>
    <textarea value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} rows={3} style={{background:T.cardElevated,border:`1px solid ${T.border}`,borderRadius:10,padding:'11px 14px',fontSize:16,color:T.text,fontFamily:'system-ui',outline:'none',width:'100%',boxSizing:'border-box',resize:'vertical'}}/>
  </div>;
}
function Toast({message,T}){
  if(!message) return null;
  return <div style={{position:'fixed',bottom:110,left:'50%',transform:'translateX(-50%)',background:T.accent,color:'#fff',padding:'12px 22px',borderRadius:14,fontSize:14,fontWeight:600,fontFamily:'system-ui',boxShadow:'0 4px 20px rgba(0,0,0,0.25)',zIndex:9999,whiteSpace:'nowrap',animation:'fadeInUp .25s ease'}}>{message}</div>;
}
function Spinner({T}){
  return <div style={{display:'flex',justifyContent:'center',padding:'40px 0'}}>
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="2.5" strokeLinecap="round" style={{animation:'spin 1s linear infinite'}}>
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
    </svg>
  </div>;
}

/* ── Confirm dialog ── */
function ConfirmDialog({title,message,confirmLabel,confirmColor='#ef4444',onConfirm,onCancel,requireText,requirePlaceholder,T}){
  const [text,setText]=useState('');
  const canConfirm=!requireText||text.trim().length>0;
  return <div
    style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:1000,display:'flex',alignItems:'flex-end',justifyContent:'center'}}
    onClick={onCancel}
  >
    <div
      onClick={e=>e.stopPropagation()}
      style={{background:T.card,borderRadius:'20px 20px 0 0',padding:'24px 20px 36px',width:'100%',maxWidth:500,boxSizing:'border-box',animation:'slideUp .25s cubic-bezier(0.32,0.72,0,1)'}}
    >
      <div style={{fontSize:18,fontWeight:800,color:T.text,marginBottom:8,fontFamily:'system-ui'}}>{title}</div>
      <div style={{fontSize:14,color:T.textMuted,marginBottom:16,fontFamily:'system-ui',lineHeight:1.5}}>{message}</div>
      {requireText&&<div style={{marginBottom:14}}>
        <Textarea label={requireText} value={text} onChange={setText} placeholder={requirePlaceholder||'Skriv förklaring...'} required T={T}/>
      </div>}
      <div style={{display:'flex',gap:10}}>
        <button onClick={onCancel} style={{flex:1,padding:'13px',borderRadius:12,border:`1px solid ${T.border}`,background:'none',color:T.text,fontSize:15,fontWeight:600,cursor:'pointer',fontFamily:'system-ui'}}>Avbryt</button>
        <button onClick={()=>canConfirm&&onConfirm(text)} disabled={!canConfirm} style={{flex:1,padding:'13px',borderRadius:12,border:'none',background:canConfirm?confirmColor:'#ccc',color:'#fff',fontSize:15,fontWeight:700,cursor:canConfirm?'pointer':'default',fontFamily:'system-ui'}}>{confirmLabel}</button>
      </div>
    </div>
  </div>;
}

/* ── Generisk iOS-scroll-hjul ── */
function ScrollPicker({options, value, onChange, label, formatFn, T}) {
  const ITEM_H = 44;
  const listRef = React.useRef(null);
  const velRef = React.useRef(0);        // hastighet för momentum
  const lastY = React.useRef(0);
  const lastT = React.useRef(0);
  const rafRef = React.useRef(null);
  const isDragging = React.useRef(false);
  const startY = React.useRef(0);
  const startST = React.useRef(0);

  const selectedIdx = React.useMemo(() => {
    const i = options.indexOf(value);
    return i === -1 ? 0 : i;
  }, [options, value]);

  // Scrolla till valt värde utan animation vid mount, med animation annars
  const scrollTo = React.useCallback((idx, animate=false) => {
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

  React.useEffect(() => {
    requestAnimationFrame(() => scrollTo(selectedIdx, false));
  }, [selectedIdx, scrollTo]);

  const snapNearest = React.useCallback(() => {
    if (!listRef.current) return;
    const idx = Math.round(listRef.current.scrollTop / ITEM_H);
    const clamped = Math.max(0, Math.min(options.length - 1, idx));
    scrollTo(clamped, true);
    onChange(options[clamped]);
  }, [ITEM_H, options, onChange, scrollTo]);

  // Momentum scroll
  const runMomentum = React.useCallback(() => {
    if (!listRef.current) return;
    velRef.current *= 0.93;
    listRef.current.scrollTop += velRef.current;
    if (Math.abs(velRef.current) > 0.5) {
      rafRef.current = requestAnimationFrame(runMomentum);
    } else {
      snapNearest();
    }
  }, [snapNearest]);

  // Touch
  const onTouchStart = React.useCallback((e) => {
    isDragging.current = true;
    startY.current = e.touches[0].clientY;
    startST.current = listRef.current.scrollTop;
    lastY.current = e.touches[0].clientY;
    lastT.current = Date.now();
    velRef.current = 0;
    cancelAnimationFrame(rafRef.current);
  }, []);

  const onTouchMove = React.useCallback((e) => {
    if (!isDragging.current) return;
    const dy = startY.current - e.touches[0].clientY;
    listRef.current.scrollTop = startST.current + dy;
    const now = Date.now();
    const dt = now - lastT.current || 1;
    velRef.current = (lastY.current - e.touches[0].clientY) / dt * 16;
    lastY.current = e.touches[0].clientY;
    lastT.current = now;
  }, []);

  const onTouchEnd = React.useCallback(() => {
    isDragging.current = false;
    if (Math.abs(velRef.current) > 1) {
      rafRef.current = requestAnimationFrame(runMomentum);
    } else {
      snapNearest();
    }
  }, [runMomentum, snapNearest]);

  // Mouse
  const onMouseDown = React.useCallback((e) => {
    isDragging.current = true;
    startY.current = e.clientY;
    startST.current = listRef.current.scrollTop;
    lastY.current = e.clientY;
    lastT.current = Date.now();
    velRef.current = 0;
    cancelAnimationFrame(rafRef.current);
  }, []);

  const onMouseMove = React.useCallback((e) => {
    if (!isDragging.current) return;
    const dy = startY.current - e.clientY;
    listRef.current.scrollTop = startST.current + dy;
    const now = Date.now();
    const dt = now - lastT.current || 1;
    velRef.current = (lastY.current - e.clientY) / dt * 16;
    lastY.current = e.clientY;
    lastT.current = now;
  }, []);

  const onMouseUp = React.useCallback(() => {
    if (!isDragging.current) return;
    isDragging.current = false;
    if (Math.abs(velRef.current) > 1) {
      rafRef.current = requestAnimationFrame(runMomentum);
    } else {
      snapNearest();
    }
  }, [runMomentum, snapNearest]);

  React.useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  return (
    <div style={{display:'flex',flexDirection:'column',gap:8}}>
      {label && <label style={{fontSize:12,fontWeight:600,color:T.textMuted,fontFamily:'system-ui',letterSpacing:'.3px'}}>{label}</label>}
      <div style={{position:'relative',height:ITEM_H*3,borderRadius:14,overflow:'hidden',border:`1px solid ${T.border}`,background:T.cardElevated,userSelect:'none',WebkitUserSelect:'none'}}>
        <div style={{position:'absolute',top:0,left:0,right:0,height:ITEM_H,background:`linear-gradient(to bottom,${T.cardElevated},transparent)`,zIndex:2,pointerEvents:'none'}}/>
        <div style={{position:'absolute',bottom:0,left:0,right:0,height:ITEM_H,background:`linear-gradient(to top,${T.cardElevated},transparent)`,zIndex:2,pointerEvents:'none'}}/>
        <div style={{position:'absolute',top:'50%',left:0,right:0,height:ITEM_H,transform:'translateY(-50%)',background:`${T.accent}18`,borderTop:`1.5px solid ${T.accent}44`,borderBottom:`1.5px solid ${T.accent}44`,zIndex:1,pointerEvents:'none'}}/>
        <style>{`.sp-${label?.replace(/\s/g,'')||'x'}::-webkit-scrollbar{display:none}`}</style>
        <div
          ref={listRef}
          className={`sp-${label?.replace(/\s/g,'')||'x'}`}
          onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
          onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
          style={{height:'100%',overflowY:'scroll',scrollbarWidth:'none',msOverflowStyle:'none',WebkitOverflowScrolling:'touch',cursor:'grab'}}
        >
          <div style={{height:ITEM_H}}/>
          {options.map((opt, i) => {
            const isSel = opt === value;
            return (
              <div key={opt} onClick={() => { scrollTo(i, true); onChange(opt); }}
                style={{height:ITEM_H,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',WebkitTapHighlightColor:'transparent'}}>
                <span style={{fontSize:isSel?18:15,fontWeight:isSel?800:400,color:isSel?T.accent:T.textMuted,fontFamily:'system-ui',transition:'color .15s, font-size .15s',letterSpacing:isSel?'-.3px':'0'}}>
                  {formatFn ? formatFn(opt) : String(opt)}
                </span>
              </div>
            );
          })}
          <div style={{height:ITEM_H}}/>
        </div>
      </div>
    </div>
  );
}

function DurationPicker({value, onChange, T}) {
  return <ScrollPicker options={DURATION_OPTIONS} value={value} onChange={onChange} label="BOKNINGSLÄNGD" formatFn={fmtDuration} T={T}/>;
}

/* Upprepningsalternativ för antal */
// Max 260 veckor (5 år) och 60 månader (5 år)
const RECUR_COUNT_OPTIONS_WEEKLY  = [...Array.from({length:260},(_,i)=>i+1), NO_END];
const RECUR_COUNT_OPTIONS_MONTHLY = [...Array.from({length:60},(_,i)=>i+1), NO_END];
function fmtRecurCount(v, recurrence) {
  if (v === NO_END) return recurrence==='monthly' ? 'Max (60 månader)' : 'Max (260 veckor)';
  const unit = recurrence === 'monthly' ? (v===1?'månad':'månader') : (v===1?'vecka':'veckor');
  return `${v} ${unit}`;
}

function RecurrencePicker({recurrence, onChange, recurCount, onRecurCountChange, T}){
  const countOptions = recurrence === 'monthly' ? RECUR_COUNT_OPTIONS_MONTHLY : RECUR_COUNT_OPTIONS_WEEKLY;

  return <div style={{display:'flex',flexDirection:'column',gap:12}}>
    <div style={{display:'flex',flexDirection:'column',gap:8}}>
      <label style={{fontSize:12,fontWeight:600,color:T.textMuted,fontFamily:'system-ui',letterSpacing:'.3px'}}>UPPREPNING</label>
      <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
        {RECUR_OPTIONS.map(o=>(
          <button key={o.value} onClick={()=>onChange(o.value)} style={{padding:'7px 14px',borderRadius:20,border:`1px solid ${recurrence===o.value?T.accent:T.border}`,background:recurrence===o.value?`${T.accent}22`:'none',color:recurrence===o.value?T.accent:T.textMuted,fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'system-ui',WebkitTapHighlightColor:'transparent'}}>{o.label}</button>
        ))}
      </div>
    </div>
    {recurrence!=='none'&&(
      <ScrollPicker
        options={countOptions}
        value={recurCount}
        onChange={onRecurCountChange}
        label="ANTAL UPPREPNINGAR"
        formatFn={v => fmtRecurCount(v, recurrence)}
        T={T}
      />
    )}
  </div>;
}

/* ── TimeSlotPanel ── */
function TimeSlotPanel({bookings,date,isAdmin,durationHours,onSelectSlot,onClose,T}){
  const iso=toISO(date);
  const availableStarts=getAvailableStarts(bookings,iso,durationHours);

  // Fix 4: auto-visa bara lediga om det finns bokningar på dagen
  const hasBookingsOnDay = bookings.some(b=>b.date===iso&&b.status!=='rejected'&&b.status!=='cancelled');
  const [showOnlyAvailable, setShowOnlyAvailable] = React.useState(hasBookingsOnDay);

  // Fix 1: komprimera bokade block — bygg sammansatta block istället för en rad per halvtimme
  const compactSlots = useMemo(()=>{
    // Hämta alla aktiva bokningar på dagen
    const activeBookings = bookings.filter(b=>
      b.date===iso && b.status!=='rejected' && b.status!=='cancelled'
    ).map(b=>{
      const parts=b.time_slot.split('–');
      // 00:00 as end = midnight = hour 24, never 0
      const parseH=s=>{const[hh,mm]=s.split(':').map(Number);const h=hh+(mm===30?0.5:0);return h===0?24:h;};
      const startH = parseH(parts[0]);
      const rawEndH = parseH(parts[1]);
      const endH = rawEndH > startH ? rawEndH : (b.duration_hours ? startH + b.duration_hours : 24);
      return { startH, endH, status: b.status, booking: b };
    }).sort((a,b)=>a.startH-b.startH);

    // Slå ihop överlappande/angränsande bokade block
    const merged=[];
    for(const b of activeBookings){
      const last=merged[merged.length-1];
      if(last&&b.startH<=last.endH){
        last.endH=Math.max(last.endH,b.endH);
        if(['pending','edit_pending'].includes(b.status)&&last.status==='booked') last.status='pending';
      } else {
        merged.push({...b});
      }
    }

    // Bygg lista: lediga gaps + bokade block
    const result=[];
    let cursor=OPEN_HOUR; // always start from opening time, never before
    for(const block of merged){
      if(block.startH>cursor){
        // Ledigt gap — only show slots that end at or before CLOSE_HOUR
        for(let h=cursor;h+durationHours<=block.startH;h+=0.5){
          if(!isHourPast(iso,h,durationHours))
            result.push({type:'available',startH:h,label:slotLabel(h,durationHours)});
        }
      }
      result.push({
        type:'booked',
        startH:block.startH,
        endH:block.endH,
        label:`${fmtHour(block.startH)}–${fmtHour(block.endH)}`,
        status:block.status,
        booking:block.booking,
      });
      cursor=block.endH;
    }
    // Lediga tider efter sista bokning — only up to CLOSE_HOUR
    for(let h=cursor;h+durationHours<=CLOSE_HOUR;h+=0.5){
      if(!isHourPast(iso,h,durationHours))
        result.push({type:'available',startH:h,label:slotLabel(h,durationHours)});
    }
    return result;
  },[bookings,iso,durationHours]);

  const visibleSlots = showOnlyAvailable
    ? compactSlots.filter(s=>s.type==='available')
    : compactSlots;

  return <div style={{marginTop:16,background:T.card,border:`1px solid ${T.border}`,borderRadius:16,overflow:'hidden'}}>
    <div style={{padding:'14px 16px 10px',borderBottom:`1px solid ${T.border}`,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
      <div>
        <div style={{fontSize:13,fontWeight:700,color:T.text,fontFamily:'system-ui'}}>Tillgängliga tider · {fmtDuration(durationHours)}</div>
        <div style={{fontSize:11,color:T.textMuted,fontFamily:'system-ui',marginTop:2}}>{isoToDisplay(iso)}</div>
      </div>
      <div style={{display:'flex',alignItems:'center',gap:6}}>
        <button onClick={()=>setShowOnlyAvailable(v=>!v)} style={{padding:'4px 10px',borderRadius:20,border:`1px solid ${showOnlyAvailable?T.accent:T.border}`,background:showOnlyAvailable?`${T.accent}22`:'none',color:showOnlyAvailable?T.accent:T.textMuted,fontSize:11,fontWeight:600,cursor:'pointer',fontFamily:'system-ui',WebkitTapHighlightColor:'transparent',whiteSpace:'nowrap'}}>
          {showOnlyAvailable?'Visa alla':'Bara lediga'}
        </button>
        <button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer',color:T.textMuted,padding:4}}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    </div>
    {visibleSlots.length===0&&<div style={{padding:'20px 16px',textAlign:'center',color:T.textMuted,fontSize:13,fontFamily:'system-ui'}}>
      {availableStarts.length===0?`Inga lediga tider för ${fmtDuration(durationHours)} detta datum.`:'Inga fler lediga tider.'}
    </div>}
    <div style={{padding:'8px 10px 10px',display:'flex',flexDirection:'column',gap:5}}>
      {visibleSlots.map((slot,idx)=>{
        if(slot.type==='available'){
          return <div key={`a-${slot.startH}`} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'9px 12px',background:T.cardElevated,borderRadius:10,border:`1px solid ${'#22c55e44'}`}}>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <div style={{width:8,height:8,borderRadius:'50%',background:'#22c55e',flexShrink:0}}/>
              <span style={{fontSize:14,fontWeight:600,color:T.text,fontFamily:'system-ui'}}>{slot.label}</span>
            </div>
            <button onClick={()=>onSelectSlot(date,slot.label,slot.startH,durationHours)} style={{background:T.accent,color:'#fff',border:'none',borderRadius:8,padding:'5px 12px',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'system-ui',WebkitTapHighlightColor:'transparent'}}>Välj</button>
          </div>;
        }
        // Bokad rad
        const color=slot.status==='pending'?'#f59e0b':'#ef4444';
        return <div key={`b-${slot.startH}`} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'9px 12px',background:`${color}0d`,borderRadius:10,border:`1px solid ${color}33`,opacity:isAdmin?1:0.7}}>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <div style={{width:8,height:8,borderRadius:'50%',background:color,flexShrink:0}}/>
            <span style={{fontSize:14,fontWeight:600,color:T.text,fontFamily:'system-ui'}}>{slot.label}</span>
            {isAdmin&&slot.booking&&<span style={{fontSize:11,color:T.textMuted,fontFamily:'system-ui'}}>· {slot.booking.name}</span>}
          </div>
          <div style={{display:'flex',alignItems:'center',gap:6}}>
            <Badge status={slot.status}/>
            {isAdmin&&slot.booking&&<button onClick={()=>onSelectSlot(date,slot.label,slot.startH,durationHours,slot.booking)} style={{background:`${T.accent}22`,color:T.accent,border:'none',borderRadius:8,padding:'5px 10px',fontSize:11,fontWeight:700,cursor:'pointer',fontFamily:'system-ui'}}>Detaljer</button>}
          </div>
        </div>;
      })}
    </div>
  </div>;
}
/* ── CalendarView ── */
function CalendarView({bookings,onSelectSlot,isAdmin,T}){
  const today=new Date(); today.setHours(0,0,0,0);
  const [viewMode,setViewMode]=useState('week');
  const [anchor,setAnchor]=useState(today);
  const [selectedDate,setSelectedDate]=useState(today);  // Fix 6: idag vald direkt
  const [showSlots,setShowSlots]=useState(true);          // Fix 6: visa tider direkt
  const [durationHours,setDurationHours]=useState(1);
  const weekDays=useMemo(()=>getWeekDays(anchor),[anchor]);
  const monthGrid=useMemo(()=>getMonthGrid(anchor.getFullYear(),anchor.getMonth()),[anchor]);
  const navPrev=()=>{const d=new Date(anchor);viewMode==='week'?d.setDate(d.getDate()-7):d.setMonth(d.getMonth()-1);setAnchor(d);};
  const navNext=()=>{const d=new Date(anchor);viewMode==='week'?d.setDate(d.getDate()+7):d.setMonth(d.getMonth()+1);setAnchor(d);};
  const handleDayPress=(date)=>{if(!date) return; const c=new Date(date);c.setHours(0,0,0,0);if(c<today) return;setSelectedDate(c);setShowSlots(true);};
  const headerLabel=viewMode==='week'?`${weekDays[0].getDate()} – ${weekDays[6].getDate()} ${MONTHS_SV[weekDays[6].getMonth()]} ${weekDays[6].getFullYear()}`:`${MONTHS_SV[anchor.getMonth()]} ${anchor.getFullYear()}`;
  const hasB=(d)=>d&&bookings.some(b=>b.date===toISO(d)&&b.status!=='rejected'&&b.status!=='cancelled');
  const isPast=(d)=>{if(!d) return false;const x=new Date(d);x.setHours(0,0,0,0);return x<today;};
  const isToday=(d)=>{if(!d) return false;const x=new Date(d);x.setHours(0,0,0,0);return x.getTime()===today.getTime();};
  const isSel=(d)=>{if(!d||!selectedDate) return false;const x=new Date(d);x.setHours(0,0,0,0);return x.getTime()===selectedDate.getTime();};
  const DayBtn=({date,small=false})=>{
    if(!date) return <div/>;
    const past=isPast(date),tod=isToday(date),sel=isSel(date),hb=hasB(date),avail=!past&&hasAnyAvailable(bookings,date,durationHours);
    return <button onClick={()=>!past&&handleDayPress(date)} style={{borderRadius:small?10:12,border:sel?`2px solid ${T.accent}`:`1px solid ${small?'transparent':T.border}`,background:sel?`${T.accent}22`:tod?`${T.accent}11`:small?'none':T.card,padding:small?'6px 2px':'8px 4px 6px',cursor:past?'default':'pointer',opacity:past?0.35:1,display:'flex',flexDirection:'column',alignItems:'center',gap:small?2:4,WebkitTapHighlightColor:'transparent',transition:'all .12s'}}>
      <span style={{fontSize:small?14:16,fontWeight:tod?800:small?500:600,color:sel?T.accent:T.text,fontFamily:'system-ui'}}>{date.getDate()}</span>
      {!small&&<span style={{fontSize:9,color:T.textMuted,fontFamily:'system-ui'}}>{MONTHS_SV[date.getMonth()].slice(0,3)}</span>}
      {hb&&<div style={{width:small?4:5,height:small?4:5,borderRadius:'50%',background:avail?T.accent:'#ef4444'}}/>}
    </button>;
  };
  return <div>
    <div style={{marginBottom:14}}><DurationPicker value={durationHours} onChange={h=>{setDurationHours(h);}} T={T}/></div>
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
      <div style={{display:'flex',gap:6}}>
        {['week','month'].map(m=><button key={m} onClick={()=>setViewMode(m)} style={{padding:'5px 14px',borderRadius:20,border:`1px solid ${viewMode===m?T.accent:T.border}`,background:viewMode===m?`${T.accent}22`:'none',color:viewMode===m?T.accent:T.textMuted,fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'system-ui',WebkitTapHighlightColor:'transparent'}}>{m==='week'?'Vecka':'Månad'}</button>)}
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
    {viewMode==='week'&&<div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:4}}>{weekDays.map((d,i)=><DayBtn key={i} date={d}/>)}</div>}
    {viewMode==='month'&&<div>{monthGrid.map((row,ri)=><div key={ri} style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:3,marginBottom:3}}>{row.map((d,ci)=><DayBtn key={ci} date={d} small/>)}</div>)}</div>}
    <div style={{display:'flex',gap:14,marginTop:14,flexWrap:'wrap'}}>
      {[['#22c55e','Ledig tid'],['#f59e0b','Väntar'],['#ef4444','Bokad/full']].map(([c,l])=><div key={l} style={{display:'flex',alignItems:'center',gap:5}}><div style={{width:10,height:10,borderRadius:'50%',background:c}}/><span style={{fontSize:11,color:T.textMuted,fontFamily:'system-ui'}}>{l}</span></div>)}
    </div>
    {showSlots&&selectedDate&&<TimeSlotPanel bookings={bookings} date={selectedDate} isAdmin={isAdmin} durationHours={durationHours} onSelectSlot={onSelectSlot} onClose={()=>setShowSlots(false)} T={T}/>}
  </div>;
}

/* ── BookingForm (ny bokning) ── */
function BookingForm({date,slotLabel:slot,durationHours,onSubmit,onBack,loading,bookings,T}){
  const userName  = localStorage.getItem('islamnu_user_name') || '';
  const userPhone = localStorage.getItem('islamnu_user_phone') || '';
  const [form,setForm]=useState({name:userName,phone:userPhone,activity:''});
  const [recurrence,setRecurrence]=useState('none');
  const [recurCount,setRecurCount]=useState(2);
  const [error,setError]=useState('');
  const set=f=>v=>setForm(p=>({...p,[f]:v}));
  const recurDates=useMemo(()=>recurrence==='none'?[toISO(date)]:getRecurDates(toISO(date),recurrence,recurCount),[date,recurrence,recurCount]);
  const conflictDates=useMemo(()=>{
    if(recurrence==='none') return [];
    const startH=parseSlotStart(slot);
    return recurDates.filter((iso,idx)=>idx!==0&&!getAvailableStarts(bookings,iso,durationHours).includes(startH));
  },[recurDates,slot,durationHours,bookings,recurrence]);
  const handleSubmit=()=>{
    if(!form.activity.trim()){setError('Beskriv aktiviteten.');return;}
    onSubmit({...form,date:toISO(date),time_slot:slot,duration_hours:durationHours,recurrence,recur_dates:recurrence!=='none'?recurDates:null});
  };
  return <div style={{paddingTop:'max(20px, env(safe-area-inset-top, 0px))',paddingLeft:'16px',paddingRight:'16px',paddingBottom:'20px',fontFamily:'system-ui'}}>
    <BackButton onBack={onBack} T={T}/>
    <div style={{marginTop:16,marginBottom:20}}>
      <div style={{fontSize:22,fontWeight:800,color:T.text,letterSpacing:'-.4px',marginBottom:8}}>Bokningsförfrågan</div>
      <div style={{display:'inline-flex',alignItems:'center',gap:8,background:`${T.accent}18`,borderRadius:10,padding:'6px 12px'}}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        <span style={{fontSize:13,color:T.accent,fontWeight:600}}>{isoToDisplay(toISO(date))} · {slot} · {durationHours}h</span>
      </div>
    </div>
    {/* Inloggad som — readonly info */}
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
        <RecurrencePicker recurrence={recurrence} onChange={r=>{setRecurrence(r);setRecurCount(2);}} recurCount={recurCount} onRecurCountChange={setRecurCount} T={T}/>
        {recurrence!=='none'&&recurDates.length>0&&<div style={{marginTop:12}}>
          <div style={{fontSize:11,fontWeight:700,color:T.textMuted,letterSpacing:'.3px',marginBottom:8}}>UPPREPNING GÄLLER</div>
          <div style={{background:T.cardElevated,borderRadius:10,padding:'10px 12px',display:'flex',flexDirection:'column',gap:6}}>
            <div style={{display:'flex',justifyContent:'space-between',fontSize:12,fontFamily:'system-ui'}}>
              <span style={{color:T.textMuted}}>Från</span>
              <span style={{color:T.text,fontWeight:600}}>{isoToDisplay(recurDates[0])} · {slot}</span>
            </div>
            <div style={{height:1,background:T.border}}/>
            <div style={{display:'flex',justifyContent:'space-between',fontSize:12,fontFamily:'system-ui'}}>
              <span style={{color:T.textMuted}}>Till</span>
              <span style={{color:T.text,fontWeight:600}}>{isoToDisplay(recurDates[recurDates.length-1])} · {slot}</span>
            </div>
            <div style={{height:1,background:T.border}}/>
            <div style={{display:'flex',justifyContent:'space-between',fontSize:12,fontFamily:'system-ui'}}>
              <span style={{color:T.textMuted}}>Antal tillfällen</span>
              <span style={{color:T.accent,fontWeight:700}}>{recurDates.length} st</span>
            </div>
          </div>
          {conflictDates.length>0&&<div style={{marginTop:8,background:'#ef444418',borderRadius:8,padding:'8px 10px',fontSize:12,color:'#ef4444'}}>{conflictDates.length} tillfälle(n) har tidskonflikter och skickas ändå för admin att granska.</div>}
        </div>}
      </div>
      {error&&<div style={{fontSize:13,color:T.error,background:`${T.error}18`,padding:'10px 14px',borderRadius:8}}>{error}</div>}
      <button onClick={handleSubmit} disabled={loading} style={{background:loading?T.textMuted:T.accent,color:'#fff',border:'none',borderRadius:12,padding:'14px',fontSize:16,fontWeight:700,cursor:loading?'default':'pointer',marginTop:4,WebkitTapHighlightColor:'transparent',display:'flex',alignItems:'center',justifyContent:'center',gap:8}}>
        {loading?'Skickar...':<>Skicka {recurrence!=='none'?`${recurDates.length} bokningsförfrågningar`:'bokningsförfrågan'} <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></>}
      </button>
      <p style={{fontSize:11,color:T.textMuted,textAlign:'center',margin:0}}>Din förfrågan granskas av en administratör.</p>
    </div>
  </div>;
}

/* ── EditBookingForm — besökare redigerar sin pending-bokning ── */
function EditBookingForm({booking, bookings, onSubmit, onBack, loading, T}){
  const today=new Date(); today.setHours(0,0,0,0);
  const [step,setStep]=useState('date');
  const [anchor,setAnchor]=useState(()=>parseISO(booking.date));
  const [selectedDate,setSelectedDate]=useState(()=>parseISO(booking.date));
  const [durationHours,setDurationHours]=useState(booking.duration_hours||1);
  const [selectedStartH,setSelectedStartH]=useState(()=>parseSlotStart(booking.time_slot));
  const [activity,setActivity]=useState(booking.activity);
  const [error,setError]=useState('');
  const monthGrid=useMemo(()=>getMonthGrid(anchor.getFullYear(),anchor.getMonth()),[anchor]);
  const isPast=(d)=>{if(!d) return false;const x=new Date(d);x.setHours(0,0,0,0);return x<today;};
  const isToday=(d)=>{if(!d) return false;const x=new Date(d);x.setHours(0,0,0,0);return x.getTime()===today.getTime();};

  const handleSubmit=()=>{
    if(!activity.trim()){setError('Beskriv aktiviteten.');return;}
    onSubmit({id:booking.id, date:toISO(selectedDate), time_slot:slotLabel(selectedStartH,durationHours), duration_hours:durationHours, activity, originalStatus:booking.status});
  };

  return <div style={{paddingTop:'max(20px, env(safe-area-inset-top, 0px))',paddingLeft:'16px',paddingRight:'16px',paddingBottom:'20px',fontFamily:'system-ui'}}>
    <BackButton onBack={onBack} T={T}/>
    <div style={{fontSize:20,fontWeight:800,color:T.text,marginTop:16,marginBottom:4}}>Ändra bokning</div>
    <div style={{fontSize:13,color:booking.status==='pending'?T.textMuted:'#f97316',marginBottom:20,background:booking.status==='pending'?'none':'#f9731611',borderRadius:8,padding:booking.status==='pending'?'0':'8px 12px'}}>
      {booking.status==='pending'
        ?'Du kan ändra fritt — bokningen förblir i väntande läge.'
        :'Bokningen är bekräftad. Din ändring skickas som en förfrågan till admin för godkännande.'}
    </div>

    {step==='date'&&<>
      <div style={{fontSize:12,fontWeight:700,color:T.textMuted,marginBottom:10,letterSpacing:'.3px'}}>1. VÄLJ NYTT DATUM & LÄNGD</div>
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
      <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:2,marginBottom:6}}>
        {DAYS_SV.map(d=><div key={d} style={{textAlign:'center',fontSize:10,fontWeight:700,color:T.textMuted,letterSpacing:'.5px'}}>{d}</div>)}
      </div>
      <div>{monthGrid.map((row,ri)=><div key={ri} style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:3,marginBottom:3}}>
        {row.map((d,ci)=>{
          if(!d) return <div key={ci}/>;
          const past=isPast(d),tod=isToday(d),isSel=selectedDate&&toISO(d)===toISO(selectedDate);
          return <button key={ci} onClick={()=>{if(past) return;const c=new Date(d);c.setHours(0,0,0,0);setSelectedDate(c);setStep('time');}} style={{borderRadius:10,border:isSel?`2px solid ${T.accent}`:'1px solid transparent',background:isSel?`${T.accent}22`:tod?`${T.accent}11`:'none',padding:'6px 2px',cursor:past?'default':'pointer',opacity:past?0.35:1,display:'flex',flexDirection:'column',alignItems:'center',gap:2,WebkitTapHighlightColor:'transparent'}}>
            <span style={{fontSize:14,fontWeight:tod?800:500,color:isSel?T.accent:T.text,fontFamily:'system-ui'}}>{d.getDate()}</span>
          </button>;
        })}
      </div>)}</div>
    </>}

    {step==='time'&&selectedDate&&<>
      <div style={{fontSize:12,fontWeight:700,color:T.textMuted,marginBottom:12,letterSpacing:'.3px'}}>2. VÄLJ NY TID — {isoToDisplay(toISO(selectedDate))} · {durationHours}h</div>
      <div style={{display:'flex',flexDirection:'column',gap:6}}>
        {ALL_HOURS.filter(h=>h+durationHours<=CLOSE_HOUR).map(h=>{
          const avail=getAvailableStarts(bookings,toISO(selectedDate),durationHours,booking.id).includes(h);
          const isCurrent=toISO(selectedDate)===booking.date&&h===parseSlotStart(booking.time_slot)&&durationHours===(booking.duration_hours||1);
          return <button key={h} onClick={()=>{if(!avail) return;setSelectedStartH(h);setStep('details');}} style={{padding:'12px 16px',borderRadius:10,border:`1px solid ${isCurrent?T.accent+'66':avail?T.accent+'44':T.border}`,background:isCurrent?`${T.accent}11`:T.cardElevated,color:avail?T.text:T.textMuted,fontSize:14,fontWeight:600,cursor:avail?'pointer':'default',opacity:avail?1:0.4,textAlign:'left',fontFamily:'system-ui',WebkitTapHighlightColor:'transparent'}}>
            {slotLabel(h,durationHours)}
            {isCurrent&&<span style={{float:'right',fontSize:10,color:T.accent,fontWeight:700}}>Nuvarande</span>}
            {avail&&!isCurrent&&<span style={{float:'right',fontSize:11,color:T.accent,fontWeight:700}}>Välj →</span>}
          </button>;
        })}
      </div>
      <button onClick={()=>setStep('date')} style={{marginTop:12,background:'none',border:'none',color:T.accent,cursor:'pointer',fontSize:13,fontWeight:600,fontFamily:'system-ui',padding:0}}>← Byt datum</button>
    </>}

    {step==='details'&&<>
      <div style={{background:`${T.accent}18`,borderRadius:10,padding:'8px 12px',marginBottom:16,display:'inline-flex',alignItems:'center',gap:8}}>
        <span style={{fontSize:13,color:T.accent,fontWeight:600}}>{isoToDisplay(toISO(selectedDate))} · {slotLabel(selectedStartH,durationHours)} · {durationHours}h</span>
      </div>
      <div style={{display:'flex',flexDirection:'column',gap:14}}>
        <Textarea label="AKTIVITET" value={activity} onChange={setActivity} placeholder="Beskriv aktiviteten..." required T={T}/>
        {error&&<div style={{fontSize:13,color:T.error,background:`${T.error}18`,padding:'10px 14px',borderRadius:8}}>{error}</div>}
        <button onClick={handleSubmit} disabled={loading} style={{background:loading?T.textMuted:'#3b82f6',color:'#fff',border:'none',borderRadius:12,padding:'14px',fontSize:16,fontWeight:700,cursor:loading?'default':'pointer',WebkitTapHighlightColor:'transparent',display:'flex',alignItems:'center',justifyContent:'center',gap:8}}>
          {loading?'Sparar...':<>{booking.status==='pending'?'Skicka ny förfrågan':'Begär ändring'} <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg></>}
        </button>
      </div>
      <button onClick={()=>setStep('time')} style={{marginTop:12,background:'none',border:'none',color:T.accent,cursor:'pointer',fontSize:13,fontWeight:600,fontFamily:'system-ui',padding:0}}>← Byt tid</button>
    </>}
  </div>;
}

/* ── ConfirmationScreen ── */
/* ── PinRevealScreen — visas en gång efter första bokningen ── */
function PinRevealScreen({pin, onContinue, T}){
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard?.writeText(pin).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),2000);}).catch(()=>{});
  };
  return <div style={{padding:'24px 20px',fontFamily:'system-ui',display:'flex',flexDirection:'column',alignItems:'center',minHeight:'100%',background:T.bg}}>
    <div style={{width:'100%',maxWidth:360,display:'flex',flexDirection:'column',alignItems:'center',gap:20,paddingTop:40}}>
      {/* Ikon */}
      <div style={{width:72,height:72,borderRadius:'50%',background:`${T.accent}22`,display:'flex',alignItems:'center',justifyContent:'center'}}>
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          <circle cx="12" cy="16" r="1" fill={T.accent}/>
        </svg>
      </div>
      <div style={{textAlign:'center'}}>
        <div style={{fontSize:22,fontWeight:800,color:T.text,marginBottom:8}}>Din personliga bokningskod</div>
        <div style={{fontSize:14,color:T.textMuted,lineHeight:1.65,maxWidth:300}}>
          Spara den här koden. Du behöver den om du vill se dina bokningar från en ny enhet eller efter rensad cache.
        </div>
      </div>

      {/* PIN-display */}
      <div style={{background:T.card,border:`2px solid ${T.accent}55`,borderRadius:20,padding:'28px 36px',textAlign:'center',width:'100%',boxSizing:'border-box'}}>
        <div style={{fontSize:11,fontWeight:700,color:T.textMuted,letterSpacing:'1px',marginBottom:16}}>BOKNINGSKOD</div>
        <div style={{display:'flex',justifyContent:'center',gap:12,marginBottom:20}}>
          {pin.split('').map((d,i)=>(
            <div key={i} style={{width:52,height:64,borderRadius:12,background:T.bg,border:`1.5px solid ${T.accent}44`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:32,fontWeight:800,color:T.accent,fontFamily:'system-ui',letterSpacing:0}}>
              {d}
            </div>
          ))}
        </div>
        <button onClick={handleCopy} style={{background:'none',border:`1px solid ${T.border}`,borderRadius:8,padding:'6px 16px',fontSize:12,color:copied?'#22c55e':T.textMuted,cursor:'pointer',fontFamily:'system-ui',fontWeight:600,display:'flex',alignItems:'center',gap:6,margin:'0 auto',WebkitTapHighlightColor:'transparent'}}>
          {copied
            ?<><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>Kopierad!</>
            :<><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>Kopiera kod</>
          }
        </button>
      </div>

      {/* Påminnelse */}
      <div style={{background:'#f59e0b18',border:'1px solid #f59e0b44',borderRadius:12,padding:'12px 16px',width:'100%',boxSizing:'border-box'}}>
        <div style={{fontSize:12,color:'#f59e0b',fontWeight:700,marginBottom:4}}>⚠️ Viktigt</div>
        <div style={{fontSize:12,color:'#f59e0b',lineHeight:1.6}}>
          Kod + telefonnummer = tillgång till dina bokningar. Dela inte koden med någon.
        </div>
      </div>

      <button onClick={onContinue} style={{width:'100%',padding:'15px',borderRadius:14,border:'none',background:T.accent,color:'#fff',fontSize:16,fontWeight:700,cursor:'pointer',fontFamily:'system-ui',WebkitTapHighlightColor:'transparent',marginTop:4}}>
        Jag har sparat koden →
      </button>
    </div>
  </div>;
}

function ConfirmationScreen({booking,onBack,T}){
  return <div style={{paddingTop:'max(20px, env(safe-area-inset-top, 0px))',paddingLeft:'16px',paddingRight:'16px',paddingBottom:'20px',fontFamily:'system-ui'}}>
    <BackButton onBack={onBack} T={T}/>
    <div style={{marginTop:24,display:'flex',flexDirection:'column',alignItems:'center',gap:16}}>
      <div style={{width:72,height:72,borderRadius:'50%',background:'#22c55e22',display:'flex',alignItems:'center',justifyContent:'center'}}>
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      </div>
      <div style={{textAlign:'center'}}>
        <div style={{fontSize:22,fontWeight:800,color:T.text,marginBottom:6}}>Bokning bekräftad</div>
        <div style={{fontSize:14,color:T.textMuted}}>Visa denna bekräftelse vid ankomst</div>
      </div>
      <div style={{width:'100%',background:T.card,border:'2px solid #22c55e44',borderRadius:18,padding:'20px',boxSizing:'border-box'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16,paddingBottom:12,borderBottom:`1px solid ${T.border}`}}>
          <div style={{fontSize:13,fontWeight:700,color:T.textMuted,letterSpacing:'.5px'}}>BOKNINGSBEKRÄFTELSE</div>
          <Badge status="approved"/>
        </div>
        {[['Namn',booking.name],['Datum',isoToDisplay(booking.date)],['Tid',booking.time_slot],['Längd',`${booking.duration_hours||1} timmar`],['Aktivitet',booking.activity],['Boknings-ID',booking.id.toUpperCase()]].map(([l,v])=>(
          <div key={l} style={{marginBottom:10}}>
            <div style={{fontSize:10,fontWeight:700,color:T.textMuted,letterSpacing:'.5px',marginBottom:2}}>{l.toUpperCase()}</div>
            <div style={{fontSize:14,fontWeight:600,color:T.text}}>{v}</div>
          </div>
        ))}
        {booking.recurrence&&booking.recurrence!=='none'&&(
          <div style={{marginTop:8,padding:'8px 10px',background:'#8b5cf618',borderRadius:8}}>
            <div style={{fontSize:10,fontWeight:700,color:'#8b5cf6',letterSpacing:'.5px',marginBottom:4}}>ÅTERKOMMANDE BOKNING</div>
            <div style={{fontSize:12,color:'#8b5cf6'}}>{RECUR_OPTIONS.find(o=>o.value===booking.recurrence)?.label}</div>
          </div>
        )}
      </div>
    </div>
  </div>;
}

/* ── MyBookings ── */
function MyBookings({bookings, onViewConfirmation, onEdit, onCancel, onCancelOne, onCancelFromDate, onRecover, onBack, highlightBookingId, T}){
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [occurrenceSheet, setOccurrenceSheet] = useState(null);
  const highlightRef = useRef(null);

  // Auto-scroll to highlighted booking on mount
  useEffect(() => {
    if (highlightBookingId && highlightRef.current) {
      setTimeout(() => {
        highlightRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 300);
    }
  }, []); // eslint-disable-line

  // Återhämtning via telefon + PIN
  const [showRecover, setShowRecover] = useState(false);
  const [recoverPhone, setRecoverPhone] = useState(()=>localStorage.getItem('islamnu_user_phone')||'');
  const [recoverPin, setRecoverPin] = useState('');
  const [recoverState, setRecoverState] = useState('idle'); // idle|loading|success|notfound|wrong_pin|locked|error
  const [recoverCount, setRecoverCount] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState(null);

  const sorted=bookings.slice().sort((a,b)=>b.created_at-a.created_at);
  const groups=useMemo(()=>{
    const map={};
    sorted.forEach(b=>{const key=b.recurrence_group_id||b.id;if(!map[key]) map[key]={group_id:key,bookings:[],recurrence:b.recurrence,name:b.name,activity:b.activity};map[key].bookings.push(b);});
    return Object.values(map);
  },[sorted]);

  const groupStatus=(grp)=>{
    const ss=grp.bookings.map(b=>b.status);
    for(const s of ['pending','edit_pending','approved','edited','rejected','cancelled']) if(ss.includes(s)) return s;
    return ss[0];
  };

  const StatusInfo=({b})=>{
    if(b.status==='cancelled') return <div style={{marginTop:8,background:'#64748b18',borderRadius:8,padding:'8px 10px'}}><div style={{fontSize:11,fontWeight:700,color:'#64748b',marginBottom:3}}>INSTÄLLD</div>{b.admin_comment&&<div style={{fontSize:12,color:'#64748b'}}>{b.admin_comment}</div>}</div>;
    if(b.status==='rejected')  return <div style={{marginTop:8,background:'#ef444418',borderRadius:8,padding:'8px 10px'}}><div style={{fontSize:11,fontWeight:700,color:'#ef4444',marginBottom:3}}>AVBÖJD</div>{b.admin_comment&&<div style={{fontSize:12,color:'#ef4444'}}>{b.admin_comment}</div>}</div>;
    if(b.status==='edit_pending') return <div style={{marginTop:8,background:'#f9731618',borderRadius:8,padding:'8px 10px'}}><div style={{fontSize:11,fontWeight:700,color:'#f97316',marginBottom:3}}>ÄNDRINGSFÖRFRÅGAN VÄNTAR</div><div style={{fontSize:12,color:'#f97316'}}>Din ändring granskas av admin.</div></div>;
    if(b.status==='edited')    return <div style={{marginTop:8,background:'#3b82f618',borderRadius:8,padding:'8px 10px'}}><div style={{fontSize:11,fontWeight:700,color:'#3b82f6',marginBottom:3}}>ÄNDRAD AV ADMIN</div>{b.admin_comment&&<div style={{fontSize:12,color:'#3b82f6'}}>{b.admin_comment}</div>}</div>;
    return null;
  };

  // Sheet för enstaka tillfälle — välj omfång
  const OccurrenceSheet = () => {
    if(!occurrenceSheet) return null;
    const b = occurrenceSheet;
    const grp = selectedGroup;
    const sortedAll = grp?.bookings.slice().sort((a,x)=>a.date.localeCompare(x.date))||[];
    const futureCount = sortedAll.filter(x=>x.date>=b.date&&x.status!=='cancelled').length;
    const isPendingOcc = b.status==='pending'||b.status==='edit_pending';
    return (
      <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:1000,display:'flex',alignItems:'flex-end',justifyContent:'center'}} onClick={()=>setOccurrenceSheet(null)}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.card,borderRadius:'20px 20px 0 0',padding:'24px 20px 36px',width:'100%',maxWidth:500,boxSizing:'border-box',animation:'slideUp .25s cubic-bezier(0.32,0.72,0,1)'}}>
          <div style={{fontSize:16,fontWeight:800,color:T.text,marginBottom:4,fontFamily:'system-ui'}}>{isoToDisplay(b.date)} · {b.time_slot}</div>
          <div style={{marginBottom:20}}><Badge status={b.status}/></div>
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            <button onClick={()=>{setOccurrenceSheet(null);onCancelOne(b);}} style={{padding:'14px',borderRadius:12,border:'1px solid #ef444433',background:'#ef444411',color:'#ef4444',fontSize:14,fontWeight:700,cursor:'pointer',fontFamily:'system-ui',textAlign:'left',WebkitTapHighlightColor:'transparent'}}>
              {isPendingOcc?'🗑 Återkalla bara detta tillfälle':'🗑 Avboka bara detta tillfälle'}
              <div style={{fontSize:12,fontWeight:400,marginTop:3,opacity:.75}}>Övriga tillfällen i serien påverkas inte</div>
            </button>
            {futureCount>1&&<button onClick={()=>{setOccurrenceSheet(null);onCancelFromDate(b,sortedAll.filter(x=>x.date>=b.date&&x.status!=='cancelled'));}} style={{padding:'14px',borderRadius:12,border:'1px solid #ef444433',background:'#ef444411',color:'#ef4444',fontSize:14,fontWeight:700,cursor:'pointer',fontFamily:'system-ui',textAlign:'left',WebkitTapHighlightColor:'transparent'}}>
              {isPendingOcc?'🗑 Återkalla detta + alla kommande':'🗑 Avboka detta + alla kommande'}
              <div style={{fontSize:12,fontWeight:400,marginTop:3,opacity:.75}}>{futureCount} tillfällen fr.o.m. {isoToDisplay(b.date)}</div>
            </button>}
            <button onClick={()=>setOccurrenceSheet(null)} style={{padding:'13px',borderRadius:12,border:`1px solid ${T.border}`,background:'none',color:T.text,fontSize:14,fontWeight:600,cursor:'pointer',fontFamily:'system-ui',WebkitTapHighlightColor:'transparent'}}>Avbryt</button>
          </div>
        </div>
      </div>
    );
  };

  // ── Detaljvy för vald grupp ──
  // Pulse keyframe injected here
  const pulseStyle = <style>{`@keyframes bookingPulse{0%{box-shadow:0 0 0 0 rgba(34,197,94,0.5)}50%{box-shadow:0 0 0 10px rgba(34,197,94,0)}100%{box-shadow:0 0 0 0 rgba(34,197,94,0)}}`}</style>;

  if(selectedGroup){
    const grp=selectedGroup;
    const isRecur=grp.bookings.length>1;
    const status=groupStatus(grp);
    const sortedB=grp.bookings.slice().sort((a,b)=>a.date.localeCompare(b.date));
    const rep=sortedB[0];
    const isPending    =status==='pending';
    const isEditPending=status==='edit_pending';
    const isApproved   =status==='approved'||status==='edited';
    const canEdit  =!isRecur&&(isPending||isApproved);
    const canDelete=isPending||isEditPending||isApproved;

    return <div style={{paddingTop:'max(20px, env(safe-area-inset-top, 0px))',paddingLeft:'16px',paddingRight:'16px',paddingBottom:'20px',fontFamily:'system-ui'}}>
      <OccurrenceSheet/>
      <BackButton onBack={()=>{setSelectedGroup(null);setOccurrenceSheet(null);}} T={T}/>
      <div style={{fontSize:20,fontWeight:800,color:T.text,marginTop:16,marginBottom:16}}>Bokningsdetaljer</div>

      {/* Info-kort */}
      <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:16,padding:'16px',marginBottom:12}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
          <Badge status={status}/>
          {isRecur&&<RecurBadge/>}
        </div>
        {[['Aktivitet',rep.activity],['Tid',rep.time_slot],['Längd',`${rep.duration_hours||1} timmar`]].map(([l,v])=>(
          <div key={l} style={{marginBottom:10,paddingBottom:10,borderBottom:`1px solid ${T.border}`}}>
            <div style={{fontSize:10,fontWeight:700,color:T.textMuted,letterSpacing:'.5px',marginBottom:2}}>{l.toUpperCase()}</div>
            <div style={{fontSize:14,color:T.text}}>{v}</div>
          </div>
        ))}
        {rep.admin_comment&&<div style={{padding:'8px 10px',background:`${T.accent}11`,borderRadius:8}}>
          <div style={{fontSize:10,fontWeight:700,color:T.textMuted,letterSpacing:'.5px',marginBottom:2}}>KOMMENTAR FRÅN ADMIN</div>
          <div style={{fontSize:13,color:T.text}}>{rep.admin_comment}</div>
        </div>}
      </div>

      {/* Alla tillfällen — klickbara */}
      {isRecur&&<div style={{background:T.card,border:'1px solid #8b5cf644',borderRadius:14,padding:'14px',marginBottom:12}}>
        <div style={{fontSize:11,fontWeight:700,color:'#8b5cf6',marginBottom:4,letterSpacing:'.3px'}}>ALLA TILLFÄLLEN ({grp.bookings.length} st)</div>
        <div style={{fontSize:11,color:T.textMuted,marginBottom:10}}>Tryck på ett tillfälle för att avboka det enskilt</div>
        <div style={{display:'flex',flexDirection:'column',gap:4,maxHeight:280,overflowY:'auto'}}>
          {sortedB.map(b=>{
            const isCancelled=b.status==='cancelled'||b.status==='rejected';
            return <div key={b.id}
              onClick={()=>{if(!isCancelled) setOccurrenceSheet(b);}}
              style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 10px',background:T.cardElevated,borderRadius:8,cursor:isCancelled?'default':'pointer',opacity:isCancelled?0.45:1}}>
              <div>
                <span style={{fontSize:12,color:T.text,fontWeight:500}}>{isoToDisplay(b.date)}</span>
                <span style={{fontSize:11,color:T.textMuted}}> · {b.time_slot}</span>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:6}}>
                <Badge status={b.status}/>
                {!isCancelled&&<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={T.textMuted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>}
              </div>
            </div>;
          })}
        </div>
      </div>}

      {/* Enkel bokning */}
      {!isRecur&&<div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:14,padding:'14px',marginBottom:12}}>
        <div style={{fontSize:12,color:T.textMuted,marginBottom:4}}>{isoToDisplay(rep.date)}</div>
        <StatusInfo b={rep}/>
        {isApproved&&<div onClick={()=>onViewConfirmation(rep)} style={{marginTop:10,fontSize:12,color:T.accent,fontWeight:600,display:'flex',alignItems:'center',gap:4,cursor:'pointer'}}>
          Visa bekräftelse <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        </div>}
      </div>}

      {/* Inforutor */}
      {isPending&&!isRecur&&<div style={{marginBottom:12,fontSize:11,color:T.accent,background:`${T.accent}11`,borderRadius:8,padding:'8px 12px'}}>Du kan ändra eller ta bort fritt — bokningen är ej bekräftad.</div>}
      {isApproved&&!isRecur&&<div style={{marginBottom:12,fontSize:11,color:'#f97316',background:'#f9731611',borderRadius:8,padding:'8px 12px'}}>Bekräftad — ändring kräver admins godkännande, avbokning är direkt.</div>}
      {isEditPending&&!isRecur&&<div style={{marginBottom:12,fontSize:11,color:'#f97316',background:'#f9731611',borderRadius:8,padding:'8px 12px'}}>Din ändringsförfrågan väntar på admin. Du kan fortfarande ta bort bokningen.</div>}
      {isRecur&&<div style={{marginBottom:12,fontSize:11,color:T.textMuted,background:T.cardElevated,borderRadius:8,padding:'8px 12px'}}>Tryck på enstaka tillfällen ovan för att avboka dem, eller avboka hela serien nedan.</div>}

      {/* Åtgärdsknappar */}
      {(canEdit||canDelete)&&<div style={{display:'flex',gap:10,marginTop:4}}>
        {canEdit&&<button onClick={()=>onEdit(rep)} style={{flex:1,padding:'13px',borderRadius:12,border:'1px solid #3b82f644',background:'#3b82f611',color:'#3b82f6',fontSize:14,fontWeight:700,cursor:'pointer',fontFamily:'system-ui',WebkitTapHighlightColor:'transparent',display:'flex',alignItems:'center',justifyContent:'center',gap:6}}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          {isApproved?'Begär ändring':'Ändra'}
        </button>}
        {canDelete&&<button onClick={()=>onCancel(rep)} style={{flex:1,padding:'13px',borderRadius:12,border:'1px solid #ef444433',background:'#ef444411',color:'#ef4444',fontSize:14,fontWeight:700,cursor:'pointer',fontFamily:'system-ui',WebkitTapHighlightColor:'transparent',display:'flex',alignItems:'center',justifyContent:'center',gap:6}}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          {isRecur?(isPending?'Återkalla hela serien':'Avboka hela serien'):(isApproved?'Avboka':'Återkalla')}
        </button>}
      </div>}
    </div>;
  }

  const handleRecover = async () => {
    if(!recoverPhone.trim()||recoverPin.length!==4) return;
    // Rate limiting
    const rl = checkRateLimit();
    if(rl.blocked){
      setLockoutUntil(rl.unlockAt);
      setRecoverState('locked');
      return;
    }
    setRecoverState('loading');
    try{
      const n = await onRecover(recoverPhone, recoverPin);
      if(n===0){
        recordFailedAttempt();
        const rl2 = checkRateLimit();
        if(rl2.blocked){ setLockoutUntil(rl2.unlockAt); setRecoverState('locked'); }
        else setRecoverState('wrong_pin');
      } else {
        clearRateLimit();
        setRecoverCount(n);
        setRecoverState('success');
        setShowRecover(false);
      }
    }catch{
      setRecoverState('error');
    }
  };

  const lockoutMinutes = lockoutUntil ? Math.ceil((lockoutUntil-Date.now())/60000) : 0;

  // ── Listvy — 1 rad per grupp ──
  return <div style={{paddingTop:'max(20px, env(safe-area-inset-top, 0px))',paddingLeft:'16px',paddingRight:'16px',paddingBottom:'20px',fontFamily:'system-ui'}}>
    {pulseStyle}
    <BackButton onBack={onBack} T={T}/>
    <div style={{fontSize:22,fontWeight:800,color:T.text,letterSpacing:'-.4px',marginTop:16,marginBottom:20}}>Mina bokningar</div>
    {recoverCount>0&&<div style={{background:'#22c55e18',border:'1px solid #22c55e33',borderRadius:12,padding:'12px 14px',marginBottom:14,fontSize:13,color:'#22c55e',fontWeight:600}}>
      ✓ {recoverCount} bokning{recoverCount>1?'ar':''} återhämtad{recoverCount>1?'e':''}!
    </div>}
    {groups.length===0
      ?<div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:14,paddingTop:32}}>
        <div style={{fontSize:40,marginBottom:4}}>📋</div>
        <div style={{fontSize:16,fontWeight:700,color:T.text}}>Inga bokningar hittades</div>
        <div style={{fontSize:13,color:T.textMuted,textAlign:'center',lineHeight:1.6,maxWidth:280}}>
          Om du har bokningar sedan tidigare kan de ha kopplats bort. Ange telefon och bokningskod för att hämta dem.
        </div>
        {!showRecover
          ?<button onClick={()=>setShowRecover(true)} style={{marginTop:4,padding:'12px 24px',borderRadius:12,border:`1px solid ${T.accent}44`,background:`${T.accent}18`,color:T.accent,fontSize:14,fontWeight:700,cursor:'pointer',fontFamily:'system-ui',WebkitTapHighlightColor:'transparent'}}>
            Hämta mina tidigare bokningar
          </button>
          :<div style={{width:'100%',maxWidth:320,display:'flex',flexDirection:'column',gap:10}}>
            <div style={{fontSize:13,color:T.textMuted,textAlign:'center',lineHeight:1.5}}>
              Ange telefonnummer och din 4-siffriga bokningskod
            </div>
            <input type="tel" value={recoverPhone}
              onChange={e=>{ setRecoverPhone(e.target.value); setRecoverState('idle'); }}
              placeholder="07X-XXX XX XX" autoFocus
              style={{background:T.cardElevated,border:`1px solid ${recoverState==='wrong_pin'||recoverState==='notfound'?T.error:T.border}`,borderRadius:10,padding:'12px 14px',fontSize:16,color:T.text,fontFamily:'system-ui',outline:'none',width:'100%',boxSizing:'border-box'}}
            />
            <input type="tel" inputMode="numeric" maxLength={4} value={recoverPin}
              onChange={e=>{ const v=e.target.value.replace(/\D/g,'').slice(0,4); setRecoverPin(v); setRecoverState('idle'); }}
              placeholder="- - - -"
              style={{background:T.cardElevated,border:`1px solid ${recoverState==='wrong_pin'?T.error:T.border}`,borderRadius:10,padding:'12px 14px',fontSize:22,fontWeight:800,color:T.accent,fontFamily:'system-ui',outline:'none',width:'100%',boxSizing:'border-box',textAlign:'center',letterSpacing:8}}
            />
            {recoverState==='wrong_pin'&&<div style={{fontSize:12,color:'#ef4444',background:'#ef444418',borderRadius:8,padding:'8px 10px',textAlign:'center'}}>
              Fel telefon eller bokningskod. {checkRateLimit().remaining} försök kvar.
            </div>}
            {recoverState==='notfound'&&<div style={{fontSize:12,color:'#ef4444',background:'#ef444418',borderRadius:8,padding:'8px 10px',textAlign:'center'}}>
              Inga bokningar hittades för detta telefonnummer.
            </div>}
            {recoverState==='locked'&&<div style={{fontSize:12,color:'#f59e0b',background:'#f59e0b18',borderRadius:8,padding:'8px 10px',textAlign:'center'}}>
              För många felaktiga försök. Försök igen om {lockoutMinutes} min.
            </div>}
            {recoverState==='error'&&<div style={{fontSize:12,color:'#f59e0b',background:'#f59e0b18',borderRadius:8,padding:'8px 10px',textAlign:'center'}}>
              Något gick fel — försök igen.
            </div>}
            <button onClick={handleRecover}
              disabled={recoverState==='loading'||recoverState==='locked'||!recoverPhone.trim()||recoverPin.length!==4}
              style={{padding:'13px',borderRadius:12,border:'none',background:(recoverState==='loading'||recoverState==='locked'||!recoverPhone.trim()||recoverPin.length!==4)?T.textMuted:T.accent,color:'#fff',fontSize:15,fontWeight:700,cursor:'pointer',fontFamily:'system-ui',WebkitTapHighlightColor:'transparent',display:'flex',alignItems:'center',justifyContent:'center',gap:8}}>
              {recoverState==='loading'
                ?<><div style={{width:14,height:14,borderRadius:7,border:'2px solid rgba(255,255,255,0.35)',borderTopColor:'#fff',animation:'spin .7s linear infinite'}}/> Söker...</>
                :'Hämta mina bokningar'
              }
            </button>
            <button onClick={()=>{setShowRecover(false);setRecoverState('idle');setRecoverPin('');}} style={{background:'none',border:'none',color:T.textMuted,fontSize:13,cursor:'pointer',fontFamily:'system-ui',padding:'4px 0'}}>Avbryt</button>
          </div>
        }
      </div>
      :<div style={{display:'flex',flexDirection:'column',gap:10}}>
        {groups.map(grp=>{
          const isRecur=grp.bookings.length>1;
          const status=groupStatus(grp);
          const sortedB=grp.bookings.slice().sort((a,b)=>a.date.localeCompare(b.date));
          const firstDate=sortedB[0]?.date;
          const lastDate=sortedB[sortedB.length-1]?.date;
          const rep=sortedB[0];
          const isHighlighted = highlightBookingId && grp.bookings.some(b => b.id === highlightBookingId);
          return <div key={grp.group_id}
            ref={isHighlighted ? highlightRef : null}
            onClick={()=>setSelectedGroup(grp)}
            style={{
              background:T.card,
              border:`1px solid ${isHighlighted ? '#22c55e' : status==='pending'?'#f59e0b44':status==='edit_pending'?'#f9731644':status==='edited'?'#3b82f633':status==='cancelled'?'#64748b33':T.border}`,
              borderRadius:14, padding:'14px 16px', cursor:'pointer',
              animation: isHighlighted ? 'bookingPulse 2s ease-in-out 3' : 'none',
              boxShadow: isHighlighted ? '0 0 0 0 rgba(34,197,94,0.4)' : 'none',
            }}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:4}}>
              <div style={{display:'flex',alignItems:'center',gap:6}}>
                {isRecur&&<RecurBadge/>}
                <div style={{fontSize:14,fontWeight:700,color:T.text}}>{rep?.time_slot}</div>
              </div>
              <Badge status={status}/>
            </div>
            <div style={{fontSize:12,color:T.textMuted,marginBottom:2}}>
              {isRecur
                ?`${isoToDisplay(firstDate)} – ${isoToDisplay(lastDate)} · ${grp.bookings.length} tillfällen`
                :`${isoToDisplay(firstDate)} · ${rep?.duration_hours||1}h`
              }
            </div>
            <div style={{fontSize:12,color:T.textMuted}}>{grp.activity}</div>
          </div>;
        })}
      </div>
    }
  </div>;
}

/* ── AdminAddRecurring ── */
function AdminAddRecurring({onSubmit,onBack,bookings,T}){
  const today=new Date(); today.setHours(0,0,0,0);
  const [form,setForm]=useState({name:'',phone:'',activity:''});
  const [durationHours,setDurationHours]=useState(2);
  const [selectedDate,setSelectedDate]=useState(null);
  const [selectedStartH,setSelectedStartH]=useState(null);
  const [recurrence,setRecurrence]=useState('weekly');
  const [recurCount,setRecurCount]=useState(NO_END);
  const [step,setStep]=useState('date');
  const [anchor,setAnchor]=useState(today);
  const [error,setError]=useState('');
  const set=f=>v=>setForm(p=>({...p,[f]:v}));
  const monthGrid=useMemo(()=>getMonthGrid(anchor.getFullYear(),anchor.getMonth()),[anchor]);
  const recurDates=useMemo(()=>!selectedDate?[]:getRecurDates(toISO(selectedDate),recurrence,recurCount),[selectedDate,recurrence,recurCount]);
  const isPast=(d)=>{if(!d) return false;const x=new Date(d);x.setHours(0,0,0,0);return x<today;};
  const isToday=(d)=>{if(!d) return false;const x=new Date(d);x.setHours(0,0,0,0);return x.getTime()===today.getTime();};
  const handleSubmit=()=>{
    if(!form.name.trim()||!form.activity.trim()){setError('Fyll i namn och aktivitet.');return;}
    onSubmit({...form,date:toISO(selectedDate),time_slot:slotLabel(selectedStartH,durationHours),duration_hours:durationHours,recurrence,recur_dates:recurDates,status:'approved'});
  };
  return <div style={{paddingTop:'max(20px, env(safe-area-inset-top, 0px))',paddingLeft:'16px',paddingRight:'16px',paddingBottom:'20px',fontFamily:'system-ui'}}>
    <BackButton onBack={onBack} T={T}/>
    <div style={{fontSize:20,fontWeight:800,color:T.text,marginTop:16,marginBottom:4}}>Lägg till återkommande bokning</div>
    <div style={{fontSize:13,color:T.textMuted,marginBottom:20}}>Skapas som direkt godkänd bokning.</div>
    {step==='date'&&<>
      <div style={{fontSize:12,fontWeight:700,color:T.textMuted,marginBottom:10,letterSpacing:'.3px'}}>1. VÄLJ STARTDATUM & INSTÄLLNINGAR</div>
      <div style={{marginBottom:14}}><DurationPicker value={durationHours} onChange={setDurationHours} T={T}/></div>
      <div style={{marginBottom:14}}><RecurrencePicker recurrence={recurrence} onChange={r=>{setRecurrence(r);setRecurCount(NO_END);}} recurCount={recurCount} onRecurCountChange={setRecurCount} T={T}/></div>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
        <button onClick={()=>{const d=new Date(anchor);d.setMonth(d.getMonth()-1);setAnchor(d);}} style={{width:32,height:32,borderRadius:8,border:`1px solid ${T.border}`,background:T.card,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',color:T.text}}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <span style={{fontSize:13,fontWeight:700,color:T.text}}>{MONTHS_SV[anchor.getMonth()]} {anchor.getFullYear()}</span>
        <button onClick={()=>{const d=new Date(anchor);d.setMonth(d.getMonth()+1);setAnchor(d);}} style={{width:32,height:32,borderRadius:8,border:`1px solid ${T.border}`,background:T.card,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',color:T.text}}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:2,marginBottom:6}}>{DAYS_SV.map(d=><div key={d} style={{textAlign:'center',fontSize:10,fontWeight:700,color:T.textMuted,letterSpacing:'.5px'}}>{d}</div>)}</div>
      <div>{monthGrid.map((row,ri)=><div key={ri} style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:3,marginBottom:3}}>
        {row.map((d,ci)=>{if(!d) return <div key={ci}/>;const past=isPast(d),tod=isToday(d);return <button key={ci} onClick={()=>{if(past) return;const c=new Date(d);c.setHours(0,0,0,0);setSelectedDate(c);setStep('time');}} style={{borderRadius:10,border:'1px solid transparent',background:tod?`${T.accent}18`:'none',padding:'6px 2px',cursor:past?'default':'pointer',opacity:past?0.35:1,display:'flex',flexDirection:'column',alignItems:'center',gap:2,WebkitTapHighlightColor:'transparent'}}>
          <span style={{fontSize:14,fontWeight:tod?800:500,color:T.text,fontFamily:'system-ui'}}>{d.getDate()}</span>
        </button>;})}
      </div>)}</div>
    </>}
    {step==='time'&&selectedDate&&<>
      <div style={{fontSize:12,fontWeight:700,color:T.textMuted,marginBottom:12,letterSpacing:'.3px'}}>2. VÄLJ TID — {isoToDisplay(toISO(selectedDate))} · {durationHours}h</div>
      {getAvailableStarts(bookings,toISO(selectedDate),durationHours).length===0
        ?<div style={{color:T.textMuted,fontSize:13,padding:'20px 0',textAlign:'center'}}>Inga lediga tider för {fmtDuration(durationHours)}. <button onClick={()=>setStep('date')} style={{background:'none',border:'none',color:T.accent,cursor:'pointer',fontWeight:700}}>Byt datum</button></div>
        :<div style={{display:'flex',flexDirection:'column',gap:6}}>
          {ALL_HOURS.filter(h=>h+durationHours<=CLOSE_HOUR).map(h=>{const avail=getAvailableStarts(bookings,toISO(selectedDate),durationHours).includes(h);return <button key={h} onClick={()=>{if(avail){setSelectedStartH(h);setStep('details');}}} style={{padding:'12px 16px',borderRadius:10,border:`1px solid ${avail?T.accent+'44':T.border}`,background:T.cardElevated,color:avail?T.text:T.textMuted,fontSize:14,fontWeight:600,cursor:avail?'pointer':'default',opacity:avail?1:0.4,textAlign:'left',fontFamily:'system-ui',WebkitTapHighlightColor:'transparent'}}>
            {slotLabel(h,durationHours)}{avail&&<span style={{float:'right',fontSize:11,color:T.accent,fontWeight:700}}>Välj →</span>}
          </button>;})}
        </div>
      }
      <button onClick={()=>setStep('date')} style={{marginTop:12,background:'none',border:'none',color:T.accent,cursor:'pointer',fontSize:13,fontWeight:600,fontFamily:'system-ui',padding:0}}>← Byt datum</button>
    </>}
    {step==='details'&&selectedDate&&selectedStartH!==null&&<>
      <div style={{background:`${T.accent}18`,borderRadius:10,padding:'8px 12px',marginBottom:16,display:'inline-flex',alignItems:'center',gap:8}}>
        <span style={{fontSize:13,color:T.accent,fontWeight:600}}>{isoToDisplay(toISO(selectedDate))} · {slotLabel(selectedStartH,durationHours)} · {durationHours}h</span>
      </div>
      <div style={{background:T.card,border:'1px solid #8b5cf644',borderRadius:12,padding:'12px',marginBottom:16}}>
        <div style={{fontSize:11,fontWeight:700,color:'#8b5cf6',marginBottom:8,letterSpacing:'.3px'}}>ÅTERKOMMANDE TILLFÄLLEN</div>
        <div style={{display:'flex',flexDirection:'column',gap:6}}>
          <div style={{display:'flex',justifyContent:'space-between',fontSize:12,fontFamily:'system-ui'}}>
            <span style={{color:T.textMuted}}>Från</span>
            <span style={{color:T.text,fontWeight:600}}>{recurDates.length>0?isoToDisplay(recurDates[0]):'-'} · {slotLabel(selectedStartH,durationHours)}</span>
          </div>
          <div style={{height:1,background:T.border}}/>
          <div style={{display:'flex',justifyContent:'space-between',fontSize:12,fontFamily:'system-ui'}}>
            <span style={{color:T.textMuted}}>Till</span>
            <span style={{color:T.text,fontWeight:600}}>{recurDates.length>0?isoToDisplay(recurDates[recurDates.length-1]):'-'} · {slotLabel(selectedStartH,durationHours)}</span>
          </div>
          <div style={{height:1,background:T.border}}/>
          <div style={{display:'flex',justifyContent:'space-between',fontSize:12,fontFamily:'system-ui'}}>
            <span style={{color:T.textMuted}}>Antal tillfällen</span>
            <span style={{color:'#8b5cf6',fontWeight:700}}>{recurDates.length} st</span>
          </div>
        </div>
      </div>
      <div style={{display:'flex',flexDirection:'column',gap:14}}>
        <Input label="NAMN" value={form.name} onChange={set('name')} placeholder="Bokningsnamn / organisation" required T={T}/>
        <Input label="TELEFON" value={form.phone} onChange={set('phone')} placeholder="07X-XXX XX XX" T={T} type="tel"/>
        <Textarea label="AKTIVITET" value={form.activity} onChange={set('activity')} placeholder="Beskriv aktiviteten..." required T={T}/>
        {error&&<div style={{fontSize:13,color:T.error,background:`${T.error}18`,padding:'10px 14px',borderRadius:8}}>{error}</div>}
        <button onClick={handleSubmit} style={{background:'#8b5cf6',color:'#fff',border:'none',borderRadius:12,padding:'13px',fontSize:15,fontWeight:700,cursor:'pointer',WebkitTapHighlightColor:'transparent'}}>Lägg till {recurDates.length} bokningar direkt ✓</button>
      </div>
      <button onClick={()=>setStep('time')} style={{marginTop:12,background:'none',border:'none',color:T.accent,cursor:'pointer',fontSize:13,fontWeight:600,fontFamily:'system-ui',padding:0}}>← Byt tid</button>
    </>}
  </div>;
}

/* ── AdminEditForm — admin redigerar en bokning med obligatorisk förklaring ── */
function AdminEditForm({booking, bookings, onSubmit, onBack, loading, T}){
  const today=new Date(); today.setHours(0,0,0,0);
  const [step,setStep]=useState('date');
  const [anchor,setAnchor]=useState(()=>parseISO(booking.date));
  const [selectedDate,setSelectedDate]=useState(()=>parseISO(booking.date));
  const [durationHours,setDurationHours]=useState(booking.duration_hours||1);
  const [selectedStartH,setSelectedStartH]=useState(()=>parseSlotStart(booking.time_slot));
  const [activity,setActivity]=useState(booking.activity);
  const [adminComment,setAdminComment]=useState('');
  const [error,setError]=useState('');
  const monthGrid=useMemo(()=>getMonthGrid(anchor.getFullYear(),anchor.getMonth()),[anchor]);
  const isPast=(d)=>{if(!d) return false;const x=new Date(d);x.setHours(0,0,0,0);return x<today;};
  const isToday=(d)=>{if(!d) return false;const x=new Date(d);x.setHours(0,0,0,0);return x.getTime()===today.getTime();};
  const handleSubmit=()=>{
    if(!adminComment.trim()){setError('Du måste ange en förklaring till ändringen.');return;}
    onSubmit({id:booking.id,date:toISO(selectedDate),time_slot:slotLabel(selectedStartH,durationHours),duration_hours:durationHours,activity,admin_comment:adminComment});
  };
  return <div style={{paddingTop:'max(20px, env(safe-area-inset-top, 0px))',paddingLeft:'16px',paddingRight:'16px',paddingBottom:'20px',fontFamily:'system-ui'}}>
    <BackButton onBack={onBack} T={T}/>
    <div style={{fontSize:20,fontWeight:800,color:T.text,marginTop:16,marginBottom:4}}>Ändra bokning</div>
    <div style={{background:'#3b82f618',border:'1px solid #3b82f633',borderRadius:10,padding:'10px 12px',marginBottom:20,fontSize:12,color:'#3b82f6',fontFamily:'system-ui'}}>
      Du måste ange en förklaring — besökaren får automatiskt en notis om ändringen.
    </div>
    {step==='date'&&<>
      <div style={{fontSize:12,fontWeight:700,color:T.textMuted,marginBottom:10,letterSpacing:'.3px'}}>1. VÄLJ NYTT DATUM & LÄNGD</div>
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
      <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:2,marginBottom:6}}>{DAYS_SV.map(d=><div key={d} style={{textAlign:'center',fontSize:10,fontWeight:700,color:T.textMuted,letterSpacing:'.5px'}}>{d}</div>)}</div>
      <div>{monthGrid.map((row,ri)=><div key={ri} style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:3,marginBottom:3}}>
        {row.map((d,ci)=>{if(!d) return <div key={ci}/>;const past=isPast(d),tod=isToday(d),isSel=selectedDate&&toISO(d)===toISO(selectedDate);return <button key={ci} onClick={()=>{if(past) return;const c=new Date(d);c.setHours(0,0,0,0);setSelectedDate(c);setStep('time');}} style={{borderRadius:10,border:isSel?`2px solid ${T.accent}`:'1px solid transparent',background:isSel?`${T.accent}22`:tod?`${T.accent}11`:'none',padding:'6px 2px',cursor:past?'default':'pointer',opacity:past?0.35:1,display:'flex',flexDirection:'column',alignItems:'center',gap:2,WebkitTapHighlightColor:'transparent'}}>
          <span style={{fontSize:14,fontWeight:tod?800:500,color:isSel?T.accent:T.text,fontFamily:'system-ui'}}>{d.getDate()}</span>
        </button>;})}
      </div>)}</div>
    </>}
    {step==='time'&&selectedDate&&<>
      <div style={{fontSize:12,fontWeight:700,color:T.textMuted,marginBottom:12,letterSpacing:'.3px'}}>2. VÄLJ NY TID — {isoToDisplay(toISO(selectedDate))} · {durationHours}h</div>
      <div style={{display:'flex',flexDirection:'column',gap:6}}>
        {ALL_HOURS.filter(h=>h+durationHours<=CLOSE_HOUR).map(h=>{
          const avail=getAvailableStarts(bookings,toISO(selectedDate),durationHours,booking.id).includes(h);
          const isCurrent=toISO(selectedDate)===booking.date&&h===parseSlotStart(booking.time_slot)&&durationHours===(booking.duration_hours||1);
          return <button key={h} onClick={()=>{if(!avail) return;setSelectedStartH(h);setStep('details');}} style={{padding:'12px 16px',borderRadius:10,border:`1px solid ${isCurrent?T.accent+'66':avail?T.accent+'44':T.border}`,background:isCurrent?`${T.accent}11`:T.cardElevated,color:avail?T.text:T.textMuted,fontSize:14,fontWeight:600,cursor:avail?'pointer':'default',opacity:avail?1:0.4,textAlign:'left',fontFamily:'system-ui',WebkitTapHighlightColor:'transparent'}}>
            {slotLabel(h,durationHours)}
            {isCurrent&&<span style={{float:'right',fontSize:10,color:T.accent,fontWeight:700}}>Nuvarande</span>}
            {avail&&!isCurrent&&<span style={{float:'right',fontSize:11,color:T.accent,fontWeight:700}}>Välj →</span>}
          </button>;
        })}
      </div>
      <button onClick={()=>setStep('date')} style={{marginTop:12,background:'none',border:'none',color:T.accent,cursor:'pointer',fontSize:13,fontWeight:600,fontFamily:'system-ui',padding:0}}>← Byt datum</button>
    </>}
    {step==='details'&&<>
      <div style={{background:`${T.accent}18`,borderRadius:10,padding:'8px 12px',marginBottom:16,display:'inline-flex',alignItems:'center',gap:8}}>
        <span style={{fontSize:13,color:T.accent,fontWeight:600}}>{isoToDisplay(toISO(selectedDate))} · {slotLabel(selectedStartH,durationHours)} · {durationHours}h</span>
      </div>
      <div style={{display:'flex',flexDirection:'column',gap:14}}>
        <Textarea label="AKTIVITET" value={activity} onChange={setActivity} placeholder="Beskriv aktiviteten..." T={T}/>
        <Textarea label="FÖRKLARING TILL BESÖKAREN *" value={adminComment} onChange={setAdminComment} placeholder="Förklara varför bokningen ändrades..." required T={T}/>
        {error&&<div style={{fontSize:13,color:T.error,background:`${T.error}18`,padding:'10px 14px',borderRadius:8}}>{error}</div>}
        <button onClick={handleSubmit} disabled={loading} style={{background:loading?T.textMuted:'#3b82f6',color:'#fff',border:'none',borderRadius:12,padding:'14px',fontSize:16,fontWeight:700,cursor:loading?'default':'pointer',WebkitTapHighlightColor:'transparent',display:'flex',alignItems:'center',justifyContent:'center',gap:8}}>
          {loading?'Sparar...':<>Spara ändringar & notifiera besökare <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg></>}
        </button>
      </div>
      <button onClick={()=>setStep('time')} style={{marginTop:12,background:'none',border:'none',color:T.accent,cursor:'pointer',fontSize:13,fontWeight:600,fontFamily:'system-ui',padding:0}}>← Byt tid</button>
    </>}
  </div>;
}

/* ── AdminPanel ── */
function AdminPanel({bookings,onAction,onEdit,onDelete,onDeleteMany,onAddRecurring,onBack,onLogout,onMarkAdminSeen,actionLoading,onTabBarHide,onTabBarShow,preselect,onClearPreselect,initialFilter,onManageUsers,T}){
  const hasPending = bookings.some(b=>b.status==='pending'||b.status==='edit_pending');
  // initialFilter='pending' when navigating from a notif click — always show pending first
  const [filter,setFilter]=useState(()=>initialFilter==='pending'?'pending':hasPending?'pending':'all');
  const [selected,setSelected]=useState(null);
  const [selectedOccurrence,setSelectedOccurrence]=useState(null);
  const [comment,setComment]=useState('');
  const [commentError,setCommentError]=useState('');
  const [showAddRecur,setShowAddRecur]=useState(false);
  const [showEditForm,setShowEditForm]=useState(false);
  const [deleteMode,setDeleteMode]=useState(null);
  const [deleteExplanation,setDeleteExplanation]=useState('');
  const [deleteExplanationError,setDeleteExplanationError]=useState('');

  // Markera admin-notiser som lästa när panelen öppnas — per enhet via localStorage
  useEffect(()=>{ onMarkAdminSeen?.(); },[]);// eslint-disable-line

  // If opened from notif, switch to 'pending' as soon as bookings load
  useEffect(()=>{
    if(initialFilter==='pending' && bookings.some(b=>b.status==='pending'||b.status==='edit_pending')){
      setFilter('pending');
    }
  },[bookings,initialFilter]); // eslint-disable-line

  // Per-status räknare för filter-badges — live från bookings-prop
  const statusCounts = useMemo(()=>{
    const counts = { pending:0, approved:0, edited:0, rejected:0, cancelled:0 };
    // Gruppera per grupp-id för att inte räkna varje rad i en serie
    const seen = new Set();
    bookings.forEach(b=>{
      const key = b.recurrence_group_id || b.id;
      if(seen.has(key)) return;
      seen.add(key);
      const s = b.status;
      if(s==='pending'||s==='edit_pending') counts.pending++;
      else if(s==='approved') counts.approved++;
      else if(s==='edited') counts.edited++;
      else if(s==='rejected') counts.rejected++;
      else if(s==='cancelled') counts.cancelled++;
    });
    return counts;
  },[bookings]);

  // "Ny sedan sist" — olästa per status för denna enhet
  const unseenCounts = useMemo(()=>{
    const adminSeenAt = parseInt(localStorage.getItem('islamnu_bookings_admin_seen')||'0',10);
    const unseen = { pending:0, cancelled:0 };
    const seen = new Set();
    bookings.forEach(b=>{
      const key = b.recurrence_group_id || b.id;
      if(seen.has(key)) return;
      seen.add(key);
      const isNewPending = (b.status==='pending'||b.status==='edit_pending') && b.created_at > adminSeenAt;
      const isNewCancelled = b.status==='cancelled' &&
        (b.admin_comment||'').includes('esökaren') &&
        b.resolved_at > adminSeenAt;
      if(isNewPending) unseen.pending++;
      if(isNewCancelled) unseen.cancelled++;
    });
    return unseen;
  },[bookings]);

  // Fix 5+6: öppna rätt bokning direkt från kalender-detaljer-knapp
  useEffect(()=>{
    if(!preselect||!bookings.length) return;
    const grpBookings = bookings.filter(b=>(b.recurrence_group_id||b.id)===preselect);
    if(!grpBookings.length) return;
    const isRecur = grpBookings.length>1;
    const first = grpBookings[0];
    setSelected({group_id:preselect, bookings:grpBookings, isRecur, name:first.name, activity:first.activity});
    setFilter('all');
    onClearPreselect?.();
  },[preselect, bookings]); // eslint-disable-line

  // Gruppera bokningar — en rad per bokning/grupp
  // Fix 2: synka selected med live bookings-data (uppdaterar direkt när tillfällen raderas)
  useEffect(()=>{
    if(!selected) return;
    const live = bookings.filter(b=>(b.recurrence_group_id||b.id)===selected.group_id);
    if(live.length===0){ setSelected(null); return; }
    setSelected(prev=>prev?({...prev, bookings:live}):null);
  },[bookings]); // eslint-disable-line

  const groups = useMemo(()=>{
    const statusFilter = (b) => {
      if(filter==='all') return true;
      if(filter==='pending') return b.status==='pending'||b.status==='edit_pending';
      return b.status===filter;
    };
    const allFiltered = bookings.filter(statusFilter);
    const map = {};
    allFiltered.forEach(b=>{
      const key = b.recurrence_group_id || b.id;
      if(!map[key]) map[key]={ group_id:key, bookings:[], recurrence:b.recurrence, name:b.name, activity:b.activity };
      map[key].bookings.push(b);
    });
    return Object.values(map).sort((a,b)=>{
      const aMax = Math.max(...a.bookings.map(x=>x.created_at));
      const bMax = Math.max(...b.bookings.map(x=>x.created_at));
      return bMax - aMax;
    });
  }, [bookings, filter]);

  const groupStatus = (grp) => {
    const statuses = grp.bookings.map(b=>b.status);
    for(const s of ['pending','edit_pending','approved','edited','rejected','cancelled']) if(statuses.includes(s)) return s;
    return statuses[0];
  };

  const handleAction=(action)=>{
    if(action==='rejected'&&!comment.trim()){setCommentError('Du måste ange en kommentar vid avböjning.');return;}
    const targets = selected.bookings.filter(b=>
      action==='approved'||action==='rejected'
        ? b.status==='pending'||b.status==='edit_pending'
        : true
    );
    targets.forEach(b=>onAction(b.id,action,comment.trim()));
    setSelected(null);setComment('');setCommentError('');
  };

  // Stäng alla delete-dialoger
  const closeDelete = () => {
    setDeleteMode(null);
    setDeleteExplanation('');
    setDeleteExplanationError('');
    onTabBarShow?.();
  };

  // Bekräfta borttagning
  const confirmDelete = () => {
    if(!deleteExplanation.trim()){setDeleteExplanationError('Ange en förklaring till besökaren.');return;}
    if(deleteMode==='all'){
      selected.bookings.forEach(b=>onDelete(b.id,deleteExplanation.trim()));
      closeDelete(); setSelected(null);
    } else if(deleteMode==='one'){
      onDelete(selectedOccurrence.id,deleteExplanation.trim());
      closeDelete(); setSelectedOccurrence(null);
    } else if(deleteMode==='one_and_future'){
      // Alla tillfällen på samma eller senare datum som det valda
      const cutoff = selectedOccurrence.date;
      const targets = selected.bookings
        .filter(b=>b.date>=cutoff&&b.status!=='cancelled')
        .sort((a,b)=>a.date.localeCompare(b.date));
      onDeleteMany(targets.map(b=>b.id), deleteExplanation.trim());
      closeDelete(); setSelectedOccurrence(null);
    }
  };

  if(showAddRecur) return <AdminAddRecurring onSubmit={(data)=>{onAddRecurring(data);setShowAddRecur(false);}} onBack={()=>setShowAddRecur(false)} bookings={bookings} T={T}/>;
  if(showEditForm&&selected) return <AdminEditForm booking={selected.bookings[0]} bookings={bookings} onSubmit={(data)=>{onEdit(data);setShowEditForm(false);setSelected(null);}} onBack={()=>setShowEditForm(false)} loading={actionLoading} T={T}/>;

  /* ── Delete-bekräftelsedialog (sheet) ── */
  /* ── Beräkna sheet-innehåll ── */
  const deleteSheetContent = deleteMode ? (()=>{
    const isAll=deleteMode==='all';
    const isFuture=deleteMode==='one_and_future';
    const cutoff=selectedOccurrence?.date;
    const futureCount=isFuture&&selected?selected.bookings.filter(b=>b.date>=cutoff&&b.status!=='cancelled').length:0;
    const title=isAll?'Ta bort alla tillfällen':isFuture?`Ta bort detta + ${futureCount-1} kommande`:'Ta bort detta tillfälle';
    const msg=isAll?`Alla ${selected?.bookings.length} tillfällen i serien tas bort permanent.`:isFuture?`${isoToDisplay(cutoff)} och ${futureCount-1} kommande tillfällen tas bort. Tidigare påverkas inte.`:`Tillfället ${isoToDisplay(selectedOccurrence?.date)} · ${selectedOccurrence?.time_slot} tas bort. Övriga påverkas inte.`;
    return {title,msg};
  })() : null;

  const occurrenceSheetData = (selectedOccurrence&&!deleteMode) ? (()=>{
    const b=selectedOccurrence;
    const sortedAll=selected?.bookings.slice().sort((a,x)=>a.date.localeCompare(x.date))||[];
    const futureCount=sortedAll.filter(x=>x.date>=b.date&&x.status!=='cancelled').length;
    return {b,futureCount};
  })() : null;

  if(selected) return <div style={{paddingTop:'max(20px, env(safe-area-inset-top, 0px))',paddingLeft:'16px',paddingRight:'16px',paddingBottom:'20px',fontFamily:'system-ui'}}>
    {/* Fix 3: inline sheets — inga inner components som återskapar DOM och tappar fokus */}
    {deleteSheetContent&&<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:1000,display:'flex',alignItems:'flex-end',justifyContent:'center'}} onClick={closeDelete}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.card,borderRadius:'20px 20px 0 0',padding:'24px 20px 36px',width:'100%',maxWidth:500,boxSizing:'border-box',animation:'slideUp .25s cubic-bezier(0.32,0.72,0,1)'}}>
        <div style={{fontSize:18,fontWeight:800,color:T.text,marginBottom:6,fontFamily:'system-ui'}}>{deleteSheetContent.title}</div>
        <div style={{fontSize:13,color:T.textMuted,marginBottom:16,fontFamily:'system-ui',lineHeight:1.5}}>{deleteSheetContent.msg}</div>
        <div style={{marginBottom:14}}>
          <label style={{fontSize:12,fontWeight:600,color:T.textMuted,fontFamily:'system-ui',letterSpacing:'.3px',display:'block',marginBottom:5}}>FÖRKLARING TILL BESÖKAREN *</label>
          <textarea value={deleteExplanation} onChange={e=>setDeleteExplanation(e.target.value)} placeholder="Förklara varför bokningen tas bort..." rows={3}
            style={{background:T.cardElevated,border:`1px solid ${deleteExplanationError?T.error:T.border}`,borderRadius:10,padding:'11px 14px',fontSize:16,color:T.text,fontFamily:'system-ui',outline:'none',width:'100%',boxSizing:'border-box',resize:'vertical'}}/>
          {deleteExplanationError&&<div style={{fontSize:12,color:T.error,marginTop:4}}>{deleteExplanationError}</div>}
        </div>
        <div style={{display:'flex',gap:10}}>
          <button onClick={closeDelete} style={{flex:1,padding:'13px',borderRadius:12,border:`1px solid ${T.border}`,background:'none',color:T.text,fontSize:15,fontWeight:600,cursor:'pointer',fontFamily:'system-ui'}}>Avbryt</button>
          <button onClick={confirmDelete} disabled={actionLoading} style={{flex:1,padding:'13px',borderRadius:12,border:'none',background:'#ef4444',color:'#fff',fontSize:15,fontWeight:700,cursor:actionLoading?'default':'pointer',fontFamily:'system-ui'}}>
            {actionLoading?'Tar bort...':'Ta bort'}
          </button>
        </div>
      </div>
    </div>}
    {occurrenceSheetData&&<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:1000,display:'flex',alignItems:'flex-end',justifyContent:'center'}} onClick={()=>setSelectedOccurrence(null)}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.card,borderRadius:'20px 20px 0 0',padding:'24px 20px 36px',width:'100%',maxWidth:500,boxSizing:'border-box',animation:'slideUp .25s cubic-bezier(0.32,0.72,0,1)'}}>
        <div style={{fontSize:16,fontWeight:800,color:T.text,marginBottom:4,fontFamily:'system-ui'}}>{isoToDisplay(occurrenceSheetData.b.date)} · {occurrenceSheetData.b.time_slot}</div>
        <div style={{marginBottom:20}}><Badge status={occurrenceSheetData.b.status}/></div>
        <div style={{display:'flex',flexDirection:'column',gap:10}}>
          <button onClick={()=>{onTabBarHide?.();setDeleteMode('one');}} style={{padding:'14px',borderRadius:12,border:'1px solid #ef444433',background:'#ef444411',color:'#ef4444',fontSize:14,fontWeight:700,cursor:'pointer',fontFamily:'system-ui',textAlign:'left',WebkitTapHighlightColor:'transparent'}}>
            🗑 Avboka bara detta tillfälle
            <div style={{fontSize:12,fontWeight:400,marginTop:3,opacity:.75}}>Övriga tillfällen i serien påverkas inte</div>
          </button>
          {occurrenceSheetData.futureCount>1&&<button onClick={()=>{onTabBarHide?.();setDeleteMode('one_and_future');}} style={{padding:'14px',borderRadius:12,border:'1px solid #ef444433',background:'#ef444411',color:'#ef4444',fontSize:14,fontWeight:700,cursor:'pointer',fontFamily:'system-ui',textAlign:'left',WebkitTapHighlightColor:'transparent'}}>
            🗑 Avboka detta + alla {occurrenceSheetData.futureCount-1} kommande
            <div style={{fontSize:12,fontWeight:400,marginTop:3,opacity:.75}}>Fr.o.m. {isoToDisplay(occurrenceSheetData.b.date)} — tidigare påverkas inte</div>
          </button>}
          <button onClick={()=>setSelectedOccurrence(null)} style={{padding:'13px',borderRadius:12,border:`1px solid ${T.border}`,background:'none',color:T.text,fontSize:14,fontWeight:600,cursor:'pointer',fontFamily:'system-ui',WebkitTapHighlightColor:'transparent'}}>Avbryt</button>
        </div>
      </div>
    </div>}
    <BackButton onBack={()=>{setSelected(null);setComment('');setCommentError('');setSelectedOccurrence(null);closeDelete();}} T={T}/>
    <div style={{fontSize:20,fontWeight:800,color:T.text,marginTop:16,marginBottom:4}}>Bokningsdetaljer</div>

    {/* Personinfo */}
    <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:16,padding:'16px',marginBottom:12}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
        <Badge status={groupStatus(selected)}/>
        {selected.isRecur&&<RecurBadge/>}
      </div>
      {[['Namn',selected.bookings[0].name],['Telefon',selected.bookings[0].phone],['Aktivitet',selected.bookings[0].activity],['Tid',selected.bookings[0].time_slot],['Längd',`${selected.bookings[0].duration_hours||1} timmar`]].map(([l,v])=>(
        <div key={l} style={{marginBottom:10,paddingBottom:10,borderBottom:`1px solid ${T.border}`}}>
          <div style={{fontSize:10,fontWeight:700,color:T.textMuted,letterSpacing:'.5px',marginBottom:2}}>{l.toUpperCase()}</div>
          <div style={{fontSize:14,color:T.text}}>{v}</div>
        </div>
      ))}
      {selected.bookings[0].admin_comment&&<div style={{padding:'8px 10px',background:`${T.accent}11`,borderRadius:8}}>
        <div style={{fontSize:10,fontWeight:700,color:T.textMuted,letterSpacing:'.5px',marginBottom:2}}>SENASTE KOMMENTAR</div>
        <div style={{fontSize:13,color:T.text}}>{selected.bookings[0].admin_comment}</div>
      </div>}
    </div>

    {/* Tillfällen — klickbara för enstaka avbokning */}
    {selected.isRecur&&<div style={{background:T.card,border:'1px solid #8b5cf644',borderRadius:14,padding:'14px',marginBottom:12}}>
      <div style={{fontSize:11,fontWeight:700,color:'#8b5cf6',marginBottom:4,letterSpacing:'.3px'}}>
        ALLA TILLFÄLLEN ({selected.bookings.length} st)
      </div>
      <div style={{fontSize:11,color:T.textMuted,marginBottom:10}}>Tryck på ett tillfälle för att avboka det enskilt</div>
      <div style={{display:'flex',flexDirection:'column',gap:4,maxHeight:260,overflowY:'auto'}}>
        {selected.bookings.slice().sort((a,b)=>a.date.localeCompare(b.date)).map(b=>{
          const isCancelled = b.status==='cancelled';
          return <div key={b.id}
            onClick={()=>!isCancelled&&setSelectedOccurrence(b)}
            style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 10px',background:T.cardElevated,borderRadius:8,cursor:isCancelled?'default':'pointer',opacity:isCancelled?0.45:1,transition:'opacity .1s'}}>
            <div>
              <span style={{fontSize:12,color:T.text,fontWeight:500}}>{isoToDisplay(b.date)}</span>
              <span style={{fontSize:11,color:T.textMuted}}> · {b.time_slot}</span>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:6}}>
              <Badge status={b.status}/>
              {!isCancelled&&<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.textMuted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>}
            </div>
          </div>;
        })}
      </div>
    </div>}

    {/* Godkänn / Avböj — pending och edit_pending */}
    {selected.bookings.some(b=>b.status==='pending'||b.status==='edit_pending')&&<div style={{display:'flex',flexDirection:'column',gap:12,marginBottom:16}}>
      {selected.bookings.some(b=>b.status==='edit_pending')&&<div style={{background:'#f9731618',border:'1px solid #f9731633',borderRadius:10,padding:'10px 12px',fontSize:12,color:'#f97316'}}>
        Besökaren har begärt en ändring. Godkänn för att bekräfta, eller avböj för att behålla originalet.
      </div>}
      {selected.isRecur&&<div style={{background:`${T.accent}11`,border:`1px solid ${T.accent}33`,borderRadius:10,padding:'10px 12px',fontSize:12,color:T.accent}}>
        Godkänn/Avböj gäller alla {selected.bookings.filter(b=>b.status==='pending'||b.status==='edit_pending').length} väntande tillfällen på en gång.
      </div>}
      <Textarea label="KOMMENTAR (obligatorisk vid avböjning)" value={comment} onChange={setComment} placeholder="Ange orsak om du avböjer..." T={T}/>
      {commentError&&<div style={{fontSize:12,color:T.error,background:`${T.error}18`,padding:'8px 12px',borderRadius:8}}>{commentError}</div>}
      <div style={{display:'flex',gap:10}}>
        <button onClick={()=>handleAction('approved')} disabled={actionLoading} style={{flex:1,padding:'13px',borderRadius:12,border:'none',background:'#22c55e',color:'#fff',fontSize:15,fontWeight:700,cursor:actionLoading?'default':'pointer',WebkitTapHighlightColor:'transparent',display:'flex',alignItems:'center',justifyContent:'center',gap:6}}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          {actionLoading?'...':selected.isRecur?`Godkänn alla (${selected.bookings.filter(b=>b.status==='pending'||b.status==='edit_pending').length})`:'Godkänn'}
        </button>
        <button onClick={()=>handleAction('rejected')} disabled={actionLoading} style={{flex:1,padding:'13px',borderRadius:12,border:'none',background:'#ef4444',color:'#fff',fontSize:15,fontWeight:700,cursor:actionLoading?'default':'pointer',WebkitTapHighlightColor:'transparent',display:'flex',alignItems:'center',justifyContent:'center',gap:6}}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          {actionLoading?'...':'Avböj'}
        </button>
      </div>
    </div>}

    {/* Ändra / Ta bort hela gruppen */}
    {groupStatus(selected)!=='cancelled'&&<div style={{display:'flex',gap:10,marginTop:4}}>
      <button onClick={()=>setShowEditForm(true)} style={{flex:1,padding:'13px',borderRadius:12,border:'1px solid #3b82f644',background:'#3b82f611',color:'#3b82f6',fontSize:14,fontWeight:700,cursor:'pointer',fontFamily:'system-ui',WebkitTapHighlightColor:'transparent',display:'flex',alignItems:'center',justifyContent:'center',gap:6}}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        Ändra bokning
      </button>
      <button onClick={()=>{setDeleteMode('all');onTabBarHide?.();}} disabled={actionLoading} style={{flex:1,padding:'13px',borderRadius:12,border:'1px solid #ef444433',background:'#ef444411',color:'#ef4444',fontSize:14,fontWeight:700,cursor:actionLoading?'default':'pointer',fontFamily:'system-ui',WebkitTapHighlightColor:'transparent',display:'flex',alignItems:'center',justifyContent:'center',gap:6}}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
        {selected.isRecur?'Ta bort alla':'Ta bort'}
      </button>
    </div>}
  </div>;

  const pending=bookings.filter(b=>b.status==='pending'||b.status==='edit_pending').length;
  return <div style={{paddingTop:'max(20px, env(safe-area-inset-top, 0px))',paddingLeft:'16px',paddingRight:'16px',paddingBottom:'20px',fontFamily:'system-ui'}}>
    <BackButton onBack={onBack} T={T}/>
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginTop:16,marginBottom:16}}>
      <div style={{display:'flex',alignItems:'center',gap:10}}>
        <div style={{fontSize:22,fontWeight:800,color:T.text,letterSpacing:'-.4px'}}>Adminpanel</div>
        {pending>0&&<div style={{background:'#f59e0b',color:'#fff',fontSize:11,fontWeight:700,borderRadius:10,padding:'3px 8px'}}>{pending} ny</div>}
      </div>
      <div style={{display:'flex',gap:6,alignItems:'center',flexShrink:0}}>
        <button onClick={()=>setShowAddRecur(true)} title="Återkommande bokningar" style={{width:36,height:36,display:'flex',alignItems:'center',justifyContent:'center',background:'#8b5cf622',border:'1px solid #8b5cf644',borderRadius:10,cursor:'pointer',WebkitTapHighlightColor:'transparent'}}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
        </button>
        {onManageUsers&&<button onClick={onManageUsers} title="Hantera konton" style={{width:36,height:36,display:'flex',alignItems:'center',justifyContent:'center',background:`${T.accent}18`,border:`1px solid ${T.accent}44`,borderRadius:10,cursor:'pointer',WebkitTapHighlightColor:'transparent'}}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        </button>}
        {onLogout&&<button onClick={onLogout} title="Logga ut" style={{width:36,height:36,display:'flex',alignItems:'center',justifyContent:'center',background:'#ef444418',border:'1px solid #ef444433',borderRadius:10,cursor:'pointer',WebkitTapHighlightColor:'transparent'}}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
        </button>}
      </div>
    </div>
    <div style={{display:'flex',gap:6,marginBottom:14,flexWrap:'wrap'}}>
      {[
        ['all',     'Alla',      null,         null],
        ['pending', 'Väntar',    statusCounts.pending,   unseenCounts.pending],
        ['approved','Godkända',  statusCounts.approved,  null],
        ['edited',  'Ändrade',   statusCounts.edited,    null],
        ['rejected','Avböjda',   statusCounts.rejected,  null],
        ['cancelled','Inställda',statusCounts.cancelled, unseenCounts.cancelled],
      ].map(([id,label,count,unseen])=>{
        const isActive = filter===id;
        const hasUnseen = unseen > 0;
        return (
          <button key={id} onClick={()=>setFilter(id)} style={{
            position:'relative',
            padding: count!=null ? '5px 10px 5px 12px' : '5px 14px',
            borderRadius:20,
            border:`1px solid ${isActive?T.accent:hasUnseen?'#f59e0b66':T.border}`,
            background:isActive?`${T.accent}22`:hasUnseen?'#f59e0b11':'none',
            color:isActive?T.accent:hasUnseen?'#f59e0b':T.textMuted,
            fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'system-ui',
            WebkitTapHighlightColor:'transparent',
            display:'flex',alignItems:'center',gap:5,
          }}>
            {label}
            {count!=null && count>0 && (
              <span style={{
                background: hasUnseen ? '#f59e0b' : isActive ? T.accent : '#88888844',
                color: hasUnseen||isActive ? '#fff' : T.textMuted,
                borderRadius:10,fontSize:10,fontWeight:800,
                padding:'1px 5px',lineHeight:'16px',
                transition:'background .2s',
              }}>{count>99?'99+':count}</span>
            )}
          </button>
        );
      })}
    </div>
    {groups.length===0
      ?<div style={{textAlign:'center',padding:'40px 0',color:T.textMuted,fontSize:14}}>Inga bokningar</div>
      :<div style={{display:'flex',flexDirection:'column',gap:8}}>
        {groups.map(grp=>{
          const isRecur = grp.bookings.length>1;
          const status = groupStatus(grp);
          const sorted = grp.bookings.slice().sort((a,b)=>a.date.localeCompare(b.date));
          const firstDate = sorted[0]?.date;
          const lastDate = sorted[sorted.length-1]?.date;
          return <div key={grp.group_id} onClick={()=>setSelected({...grp,isRecur})} style={{background:T.card,border:`1px solid ${status==='pending'?'#f59e0b44':status==='edit_pending'?'#f9731644':status==='edited'?'#3b82f633':T.border}`,borderRadius:14,padding:'14px 16px',cursor:'pointer'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:4}}>
              <div style={{display:'flex',alignItems:'center',gap:6}}>
                <div style={{fontSize:14,fontWeight:700,color:T.text}}>{grp.name}</div>
                {isRecur&&<RecurBadge/>}
              </div>
              <Badge status={status}/>
            </div>
            <div style={{fontSize:12,color:T.textMuted,marginBottom:2}}>
              {isRecur
                ? `${isoToDisplay(firstDate)} – ${isoToDisplay(lastDate)} · ${grp.bookings.length} tillfällen`
                : `${isoToDisplay(firstDate)} · ${sorted[0]?.time_slot} · ${sorted[0]?.duration_hours||1}h`
              }
            </div>
            <div style={{fontSize:12,color:T.textMuted}}>{grp.activity}</div>
          </div>;
        })}
      </div>
    }
  </div>;
}
/* ── AdminLogin ── */
/* ── UserLogin — telefon + PIN eller engångskod ── */
function UserLogin({onSuccess, onBack, T}){
  const [step,setStep]=useState('phone'); // phone|pin|invite|setpin
  const [phone,setPhone]=useState('');
  const [pin,setPin]=useState('');
  const [inviteCode,setInviteCode]=useState('');
  const [newPin,setNewPin]=useState('');
  const [newPin2,setNewPin2]=useState('');
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [userData,setUserData]=useState(null);
  const lookupRef = React.useRef(null);

  // Auto-sök när telefonnummer verkar komplett (10+ siffror efter normalisering)
  const handlePhoneChange = (val) => {
    setPhone(val);
    setError('');
    clearTimeout(lookupRef.current);
    const norm = normalizePhone(val);
    if(norm.length >= 10){
      lookupRef.current = setTimeout(async () => {
        const {data} = await supabase.from('app_users').select('id,name,role,invite_used,pin_hash').eq('phone',norm).maybeSingle();
        if(data){
          setUserData({...data,norm});
          if(!data.invite_used) setStep('invite');
          else setStep('pin');
        }
      }, 400);
    }
  };

  const handlePhoneNext=async()=>{
    if(!phone.trim()){setError('Ange ditt telefonnummer.');return;}
    setLoading(true);setError('');
    const norm=normalizePhone(phone);
    const {data}=await supabase.from('app_users').select('id,name,role,invite_used,pin_hash').eq('phone',norm).maybeSingle();
    setLoading(false);
    if(!data){setError('Inget konto hittades. Kontakta admin för att få ett konto.');return;}
    setUserData({...data,norm});
    if(!data.invite_used){setStep('invite');}
    else{setStep('pin');}
  };

  const handleInviteSubmit=async()=>{
    if(inviteCode.length!==6){setError('Ange 6-siffrig inbjudningskod.');return;}
    setLoading(true);setError('');
    const {data}=await supabase.from('app_users').select('invite_code').eq('id',userData.id).maybeSingle();
    if(data?.invite_code!==inviteCode){setLoading(false);setError('Fel kod. Kontrollera koden med admin.');return;}
    setLoading(false);
    setStep('setpin');
  };

  const handleSetPin=async()=>{
    if(newPin.length<4){setError('PIN måste vara minst 4 siffror.');return;}
    if(newPin!==newPin2){setError('PIN-koderna matchar inte.');return;}
    setLoading(true);setError('');
    const pinHash=await sha256(userData.norm+':'+newPin);
    await supabase.from('app_users').update({pin_hash:pinHash,invite_used:true,invite_code:null,last_login:Date.now()}).eq('id',userData.id);
    setLoading(false);
    localStorage.setItem(STORAGE_USER_ID,userData.id);
    localStorage.setItem(STORAGE_USER_NAME,userData.name);
    localStorage.setItem(STORAGE_USER_ROLE,userData.role);
    localStorage.setItem(STORAGE_PHONE,userData.norm);
    localStorage.setItem(STORAGE_PIN_HASH,pinHash);
    if(userData.role==='admin'){localStorage.setItem(STORAGE_ADMIN,'true');}
    onSuccess({id:userData.id,name:userData.name,role:userData.role});
  };

  const handlePinSubmit=async()=>{
    const rl=checkRateLimit();
    if(rl.blocked){setError(`För många försök. Försök igen om ${Math.ceil((rl.unlockAt-Date.now())/60000)} min.`);return;}
    setLoading(true);setError('');
    const pinHash=await sha256(userData.norm+':'+pin);
    if(pinHash!==userData.pin_hash){
      recordFailedAttempt();
      const rl2=checkRateLimit();
      setLoading(false);
      if(rl2.blocked){setError('För många försök. Kontakta admin för att återställa.');}
      else{setError(`Fel PIN-kod. ${rl2.remaining} försök kvar.`);}
      setPin('');
      return;
    }
    clearRateLimit();
    await supabase.from('app_users').update({last_login:Date.now()}).eq('id',userData.id);
    setLoading(false);
    localStorage.setItem(STORAGE_USER_ID,userData.id);
    localStorage.setItem(STORAGE_USER_NAME,userData.name);
    localStorage.setItem(STORAGE_USER_ROLE,userData.role);
    localStorage.setItem(STORAGE_PHONE,userData.norm);
    localStorage.setItem(STORAGE_PIN_HASH,pinHash);
    if(userData.role==='admin'){localStorage.setItem(STORAGE_ADMIN,'true');}
    else{localStorage.removeItem(STORAGE_ADMIN);}
    onSuccess({id:userData.id,name:userData.name,role:userData.role});
  };

  const iconStyle={width:56,height:56,borderRadius:'50%',background:`${T.accent}22`,display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 14px'};

  return <div style={{paddingTop:'max(20px, env(safe-area-inset-top, 0px))',paddingLeft:'16px',paddingRight:'16px',paddingBottom:'20px',fontFamily:'system-ui'}}>
    <BackButton onBack={onBack} T={T}/>
    <div style={{marginTop:24,maxWidth:340,margin:'24px auto 0'}}>

      {step==='phone'&&<>
        <div style={{textAlign:'center',marginBottom:24}}>
          <div style={iconStyle}><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div>
          <div style={{fontSize:20,fontWeight:800,color:T.text}}>Åtkomst endast för behöriga</div>
          <div style={{fontSize:13,color:T.textMuted,marginTop:4}}>Ange ditt telefonnummer</div>
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          <input type="tel" value={phone} onChange={e=>handlePhoneChange(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handlePhoneNext()} placeholder="07X-XXX XX XX" autoFocus
            style={{background:T.cardElevated,border:`1px solid ${T.border}`,borderRadius:12,padding:'13px 16px',fontSize:18,color:T.text,outline:'none',width:'100%',boxSizing:'border-box'}}/>
          {error&&<div style={{fontSize:13,color:T.error,textAlign:'center',background:`${T.error}15`,borderRadius:8,padding:'8px 12px'}}>{error}</div>}
          <button onClick={handlePhoneNext} disabled={loading} style={{background:T.accent,color:'#fff',border:'none',borderRadius:12,padding:'13px',fontSize:15,fontWeight:700,cursor:'pointer',WebkitTapHighlightColor:'transparent'}}>
            {loading?'Söker...':'Fortsätt →'}
          </button>
        </div>
      </>}

      {step==='invite'&&<>
        <div style={{textAlign:'center',marginBottom:24}}>
          <div style={iconStyle}><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></div>
          <div style={{fontSize:20,fontWeight:800,color:T.text}}>Inbjudningskod</div>
          <div style={{fontSize:13,color:T.textMuted,marginTop:4}}>Välkommen {userData?.name}! Ange koden du fått av admin.</div>
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          <input type="tel" inputMode="numeric" maxLength={6} value={inviteCode} onChange={e=>{setInviteCode(e.target.value.replace(/\D/g,'').slice(0,6));setError('');}} placeholder="- - - - - -"
            style={{background:T.cardElevated,border:`1px solid ${T.border}`,borderRadius:12,padding:'13px 16px',fontSize:28,fontWeight:800,color:T.accent,outline:'none',width:'100%',boxSizing:'border-box',textAlign:'center',letterSpacing:12}}/>
          {error&&<div style={{fontSize:13,color:T.error,textAlign:'center',background:`${T.error}15`,borderRadius:8,padding:'8px 12px'}}>{error}</div>}
          <button onClick={handleInviteSubmit} disabled={loading} style={{background:T.accent,color:'#fff',border:'none',borderRadius:12,padding:'13px',fontSize:15,fontWeight:700,cursor:'pointer',WebkitTapHighlightColor:'transparent'}}>
            {loading?'Verifierar...':'Verifiera kod →'}
          </button>
          <button onClick={()=>setStep('phone')} style={{background:'none',border:'none',color:T.textMuted,cursor:'pointer',fontSize:13,padding:'4px 0'}}>← Byt telefonnummer</button>
        </div>
      </>}

      {step==='setpin'&&<>
        <div style={{textAlign:'center',marginBottom:24}}>
          <div style={iconStyle}><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/><circle cx="12" cy="16" r="1" fill={T.accent}/></svg></div>
          <div style={{fontSize:20,fontWeight:800,color:T.text}}>Välj din PIN-kod</div>
          <div style={{fontSize:13,color:T.textMuted,marginTop:4}}>Du behöver PIN-koden varje gång du loggar in.</div>
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          <input type="password" inputMode="numeric" maxLength={6} value={newPin} onChange={e=>{setNewPin(e.target.value.replace(/\D/g,'').slice(0,6));setError('');}} placeholder="Välj PIN (4-6 siffror)"
            style={{background:T.cardElevated,border:`1px solid ${T.border}`,borderRadius:12,padding:'13px 16px',fontSize:18,color:T.text,outline:'none',width:'100%',boxSizing:'border-box',textAlign:'center',letterSpacing:'6px'}}/>
          <input type="password" inputMode="numeric" maxLength={6} value={newPin2} onChange={e=>{setNewPin2(e.target.value.replace(/\D/g,'').slice(0,6));setError('');}} onKeyDown={e=>e.key==='Enter'&&handleSetPin()} placeholder="Upprepa PIN"
            style={{background:T.cardElevated,border:`1px solid ${T.border}`,borderRadius:12,padding:'13px 16px',fontSize:18,color:T.text,outline:'none',width:'100%',boxSizing:'border-box',textAlign:'center',letterSpacing:'6px'}}/>
          {error&&<div style={{fontSize:13,color:T.error,textAlign:'center',background:`${T.error}15`,borderRadius:8,padding:'8px 12px'}}>{error}</div>}
          <button onClick={handleSetPin} disabled={loading} style={{background:T.accent,color:'#fff',border:'none',borderRadius:12,padding:'13px',fontSize:15,fontWeight:700,cursor:'pointer',WebkitTapHighlightColor:'transparent'}}>
            {loading?'Sparar...':'Spara PIN & logga in →'}
          </button>
        </div>
      </>}

      {step==='pin'&&<>
        <div style={{textAlign:'center',marginBottom:24}}>
          <div style={iconStyle}><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></div>
          <div style={{fontSize:20,fontWeight:800,color:T.text}}>Välkommen, {userData?.name}</div>
          <div style={{fontSize:13,color:T.textMuted,marginTop:4}}>Ange din PIN-kod</div>
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          <input type="password" inputMode="numeric" maxLength={6} value={pin} onChange={e=>{setPin(e.target.value.replace(/\D/g,'').slice(0,6));setError('');}} onKeyDown={e=>e.key==='Enter'&&handlePinSubmit()} placeholder="PIN-kod" autoFocus
            style={{background:T.cardElevated,border:`1px solid ${T.border}`,borderRadius:12,padding:'13px 16px',fontSize:22,color:T.text,fontFamily:'system-ui',textAlign:'center',letterSpacing:'8px',outline:'none',width:'100%',boxSizing:'border-box'}}/>
          {error&&<div style={{fontSize:13,color:T.error,textAlign:'center',background:`${T.error}15`,borderRadius:8,padding:'8px 12px'}}>{error}</div>}
          <button onClick={handlePinSubmit} disabled={loading} style={{background:T.accent,color:'#fff',border:'none',borderRadius:12,padding:'13px',fontSize:15,fontWeight:700,cursor:'pointer',WebkitTapHighlightColor:'transparent'}}>
            {loading?'Loggar in...':'Logga in →'}
          </button>
          <button onClick={()=>setStep('phone')} style={{background:'none',border:'none',color:T.textMuted,cursor:'pointer',fontSize:13,padding:'4px 0'}}>← Byt konto</button>
        </div>
      </>}
    </div>
  </div>;
}

/* ── UserManagement — admin skapar/hanterar konton ── */
function UserManagement({onBack,T}){
  const [users,setUsers]=useState([]);
  const [loading,setLoading]=useState(true);
  const [showCreate,setShowCreate]=useState(false);
  const [form,setForm]=useState({name:'',phone:'',role:'user'});
  const [creating,setCreating]=useState(false);
  const [newInvite,setNewInvite]=useState(null); // {name,code}
  const [resetTarget,setResetTarget]=useState(null); // user som får ny inbjudningskod
  const [error,setError]=useState('');
  const currentUserId=localStorage.getItem(STORAGE_USER_ID);

  const load=async()=>{
    setLoading(true);
    const {data}=await supabase.from('app_users').select('id,name,phone,role,invite_used,created_at,last_login').order('created_at',{ascending:false});
    if(data) setUsers(data);
    setLoading(false);
  };
  useEffect(()=>{load();},[]);// eslint-disable-line

  const handleCreate=async()=>{
    if(!form.name.trim()||!form.phone.trim()){setError('Namn och telefon krävs.');return;}
    setCreating(true);setError('');
    const norm=normalizePhone(form.phone);
    const existing=await supabase.from('app_users').select('id').eq('phone',norm).maybeSingle();
    if(existing.data){setCreating(false);setError('Det finns redan ett konto med detta telefonnummer.');return;}
    const code=generateInviteCode();
    const {error:err}=await supabase.from('app_users').insert([{
      id:uid(),name:form.name.trim(),phone:norm,role:form.role,
      invite_code:code,invite_used:false,
      created_by:currentUserId,created_at:Date.now(),last_login:null,pin_hash:null,
    }]);
    setCreating(false);
    if(err){setError('Kunde inte skapa konto: '+err.message);return;}
    setNewInvite({name:form.name.trim(),code,phone:norm});
    setForm({name:'',phone:'',role:'user'});
    setShowCreate(false);
    load();
  };

  const handleResetPin=async(user)=>{
    const code=generateInviteCode();
    await supabase.from('app_users').update({invite_code:code,invite_used:false,pin_hash:null}).eq('id',user.id);
    setResetTarget({...user,code});
    load();
  };

  const handleDelete=async(userId)=>{
    if(!window.confirm('Ta bort kontot? Bokningarna behålls men kopplas loss från kontot.')) return;
    await supabase.from('app_users').delete().eq('id',userId);
    load();
  };

  const roleLabel=r=>r==='admin'?'Admin':'Användare';
  const roleBg=r=>r==='admin'?'#f59e0b22':'#22c55e22';
  const roleColor=r=>r==='admin'?'#f59e0b':'#22c55e';

  return <div style={{paddingTop:'max(20px, env(safe-area-inset-top, 0px))',paddingLeft:'16px',paddingRight:'16px',paddingBottom:'20px',fontFamily:'system-ui',minHeight:'100%',background:T.bg}}>
    <BackButton onBack={onBack} T={T}/>
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginTop:16,marginBottom:20}}>
      <div style={{fontSize:22,fontWeight:800,color:T.text}}>Hantera konton</div>
      <button onClick={()=>setShowCreate(v=>!v)} style={{background:T.accent,color:'#fff',border:'none',borderRadius:12,padding:'8px 16px',fontSize:13,fontWeight:700,cursor:'pointer',WebkitTapHighlightColor:'transparent',display:'flex',alignItems:'center',gap:6}}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Nytt konto
      </button>
    </div>

    {/* Ny inbjudningskod visad */}
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

    {/* Skapa konto formulär */}
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
        {error&&<div style={{fontSize:13,color:T.error,background:`${T.error}15`,borderRadius:8,padding:'8px 12px'}}>{error}</div>}
        <div style={{display:'flex',gap:8}}>
          <button onClick={()=>{setShowCreate(false);setError('');}} style={{flex:1,padding:'11px',borderRadius:10,border:`1px solid ${T.border}`,background:'none',color:T.textMuted,fontWeight:600,cursor:'pointer'}}>Avbryt</button>
          <button onClick={handleCreate} disabled={creating} style={{flex:1,padding:'11px',borderRadius:10,border:'none',background:T.accent,color:'#fff',fontWeight:700,cursor:'pointer',WebkitTapHighlightColor:'transparent'}}>{creating?'Skapar...':'Skapa konto'}</button>
        </div>
      </div>
    </div>}

    {/* Användarlista */}
    {loading?<Spinner T={T}/>:
      users.length===0?<div style={{textAlign:'center',color:T.textMuted,padding:'40px 0'}}>Inga konton</div>:
      <div style={{display:'flex',flexDirection:'column',gap:8}}>
        {users.map(u=>(
          <div key={u.id} style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:14,padding:'14px 16px'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6}}>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <div style={{fontSize:15,fontWeight:700,color:T.text}}>{u.name}</div>
                <span style={{background:roleBg(u.role),color:roleColor(u.role),borderRadius:8,fontSize:11,fontWeight:700,padding:'2px 8px'}}>{roleLabel(u.role)}</span>
                {!u.invite_used&&<span style={{background:'#f59e0b22',color:'#f59e0b',borderRadius:8,fontSize:10,fontWeight:700,padding:'2px 7px'}}>Ej aktiverat</span>}
              </div>
              {u.id!==currentUserId&&<button onClick={()=>handleDelete(u.id)} style={{background:'none',border:'none',cursor:'pointer',color:T.textMuted,fontSize:18,lineHeight:1,padding:'0 4px',WebkitTapHighlightColor:'transparent'}}>×</button>}
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
    }
  </div>;
}

function AdminLogin({onSuccess,onBack,T}){
  const [pin,setPin]=useState('');
  const [error,setError]=useState('');
  const handleSubmit=()=>{if(pin===ADMIN_PIN){onSuccess();}else{setError('Fel PIN-kod. Försök igen.');setPin('');}};
  return <div style={{paddingTop:'max(20px, env(safe-area-inset-top, 0px))',paddingLeft:'16px',paddingRight:'16px',paddingBottom:'20px',fontFamily:'system-ui'}}>
    <BackButton onBack={onBack} T={T}/>
    <div style={{marginTop:32,maxWidth:320,margin:'32px auto 0'}}>
      <div style={{textAlign:'center',marginBottom:28}}>
        <div style={{width:56,height:56,borderRadius:'50%',background:`${T.accent}22`,display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 14px'}}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        </div>
        <div style={{fontSize:20,fontWeight:800,color:T.text}}>Adminåtkomst</div>
        <div style={{fontSize:13,color:T.textMuted,marginTop:4}}>Ange din PIN-kod</div>
      </div>
      <div style={{display:'flex',flexDirection:'column',gap:12}}>
        <input type="password" value={pin} onChange={e=>setPin(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleSubmit()} placeholder="PIN-kod" style={{background:T.cardElevated,border:`1px solid ${T.border}`,borderRadius:12,padding:'13px 16px',fontSize:18,color:T.text,fontFamily:'system-ui',textAlign:'center',letterSpacing:'6px',outline:'none',width:'100%',boxSizing:'border-box'}}/>
        {error&&<div style={{fontSize:13,color:T.error,textAlign:'center'}}>{error}</div>}
        <button onClick={handleSubmit} style={{background:T.accent,color:'#fff',border:'none',borderRadius:12,padding:'13px',fontSize:15,fontWeight:700,cursor:'pointer',WebkitTapHighlightColor:'transparent'}}>Logga in</button>
      </div>
    </div>
  </div>;
}

/* ── Root ── */
export default function BookingScreen({onBack, activateForDevice, registerAdminDevice, dismissAdminDevice, startAtAdminLogin, startAtAdmin, startAtMyBookings, highlightBookingId, onTabBarHide, onTabBarShow, onMarkAdminSeen, onMarkVisitorSeen, onRefreshNotifications}){
  const scrollRef = useRef(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = 0;
      requestAnimationFrame(() => { if (el) el.scrollTop = 0; });
    }
  }, []); // eslint-disable-line

  const {theme:T}=useTheme();
  const [bookings,setBookings]=useState([]);
  const [dbLoading,setDbLoading]=useState(true);
  const [submitLoading,setSubmitLoading]=useState(false);
  const [actionLoading,setActionLoading]=useState(false);
  const [adminMode,setAdminModeState]=useState(()=>localStorage.getItem(STORAGE_ADMIN)==='true');

  // ── Inloggad användare ────────────────────────────────────────────────
  const [loggedInUser,setLoggedInUser]=useState(()=>{
    const id=localStorage.getItem(STORAGE_USER_ID);
    const name=localStorage.getItem(STORAGE_USER_NAME);
    const role=localStorage.getItem(STORAGE_USER_ROLE);
    if(id&&name) return {id,name,role:role||'user'};
    return null;
  });
  const isLoggedIn=!!loggedInUser;
  const isAdminUser=loggedInUser?.role==='admin'||adminMode;

  const handleUserLogin=(user)=>{
    setLoggedInUser(user);
    if(user.role==='admin'){setAdminModeState(true);localStorage.setItem(STORAGE_ADMIN,'true');}
    else{setAdminModeState(false);localStorage.removeItem(STORAGE_ADMIN);}
    activateForDevice?.();
    if(user.role==='admin') registerAdminDevice?.();
    setView('calendar');
  };

  const handleUserLogout=()=>{
    setLoggedInUser(null);
    localStorage.removeItem(STORAGE_USER_ID);
    localStorage.removeItem(STORAGE_USER_NAME);
    localStorage.removeItem(STORAGE_USER_ROLE);
    localStorage.removeItem(STORAGE_ADMIN);
    localStorage.removeItem(STORAGE_PIN_HASH);
    setAdminModeState(false);
    dismissAdminDevice?.();
    setView('user-login');
  };

  const [view,setView]=useState(()=>{
    const id=localStorage.getItem(STORAGE_USER_ID);
    if(!id) return 'user-login';
    if(startAtAdminLogin) return 'admin-login';
    if(startAtAdmin) return 'admin';
    if(startAtMyBookings) return 'my-bookings';
    return 'calendar';
  });
  useEffect(()=>{ if(startAtMyBookings) onMarkVisitorSeen?.(); },[]);// eslint-disable-line
  const [adminPreselect,setAdminPreselect]=useState(null); // group_id att öppna direkt
  const [pendingSlot,setPendingSlot]=useState(null);
  const [viewConfirmation,setViewConfirmation]=useState(null);
  const [editingBooking,setEditingBooking]=useState(null);
  const [deviceId]=useState(()=>{let id=localStorage.getItem(STORAGE_DEVICE);if(!id){id=uid();localStorage.setItem(STORAGE_DEVICE,id);}return id;});
  // Mina bokningar: om inloggad, filtrera på user_id; annars device_id (bakåtkompatibilitet)
  const myBookings=useMemo(()=>{
    if(loggedInUser) return bookings.filter(b=>b.user_id===loggedInUser.id||b.device_id===deviceId);
    return bookings.filter(b=>b.device_id===deviceId);
  },[bookings,deviceId,loggedInUser]);
  const [toast,setToast]=useState('');
  const [cancelDialog,setCancelDialog]=useState(null);
  const [pendingPinToShow,setPendingPinToShow]=useState(null); // PIN att visa efter ny bokning

  const showToast=useCallback((msg)=>{setToast(msg);setTimeout(()=>setToast(''),3000);},[]);

  const fetchBookings=useCallback(async()=>{
    const {data,error}=await supabase.from('bookings').select('*').order('created_at',{ascending:false});
    if(!error&&data) setBookings(data);
    setDbLoading(false);
  },[]);

  useEffect(()=>{fetchBookings();},[fetchBookings]);
  useEffect(()=>{
    const channel=supabase.channel('bookings-realtime').on('postgres_changes',{event:'*',schema:'public',table:'bookings'},()=>fetchBookings()).subscribe();
    return ()=>supabase.removeChannel(channel);
  },[fetchBookings]);
  useEffect(()=>{
    const handler=()=>{
      if(pendingPinToShow){setPendingPinToShow(null);onTabBarShow?.();return;}
      if(view==='calendar') onBack();else setView('calendar');
    };
    window.addEventListener('edgeSwipeBack',handler);
    return ()=>window.removeEventListener('edgeSwipeBack',handler);
  },[onBack,view,pendingPinToShow]);

  // ── Tab-bar synlighet per vy ────────────────────────────────────────────
  // Hanteras som effekt istället för i render för att undvika side effects.
  useEffect(() => {
    if (pendingPinToShow) {
      // PIN-skärm täcker allt — dölj alltid
      onTabBarHide?.();
      return;
    }
    if (cancelDialog) {
      // Dialog öppen — dölj tab-bar så den inte syns bakom sheet
      onTabBarHide?.();
      return;
    }
    // Alla andra vyer: visa tab-bar
    onTabBarShow?.();
  }, [view, pendingPinToShow, cancelDialog]); // eslint-disable-line

  /* Ny bokning */
  const handleSubmitBooking=useCallback(async(formData)=>{
    setSubmitLoading(true);
    const isRecur=formData.recurrence!=='none'&&formData.recur_dates?.length>1;
    const groupId=isRecur?uid():null;

    // ── PIN-hantering ────────────────────────────────────────────────────────
    // Kolla om personen redan har en PIN (bokat förut med samma telefon)
    let pin = localStorage.getItem(STORAGE_PIN);
    let pinHash = localStorage.getItem(STORAGE_PIN_HASH);

    if(!pin || !pinHash){
      // Ny person — kolla Supabase om det finns en befintlig PIN för detta telefonnummer
      const normPhone = normalizePhone(formData.phone);
      const {data:existing} = await supabase
        .from('bookings')
        .select('user_pin_hash')
        .not('user_pin_hash','is',null)
        .limit(1);

      if(existing?.length && existing[0].user_pin_hash){
        // Telefon finns i DB — återanvänd hash (vi kan inte reversera den, PIN visas ej igen)
        pinHash = existing[0].user_pin_hash;
        pin = null; // okänd, visas inte
      } else {
        // Helt ny person — generera ny PIN
        pin = generatePin();
        pinHash = await sha256(normalizePhone(formData.phone) + ':' + pin);
        localStorage.setItem(STORAGE_PIN, pin);
        localStorage.setItem(STORAGE_PIN_HASH, pinHash);
      }
    }

    const rows=(formData.recur_dates||[formData.date]).map(iso=>({
      id:uid(),name:formData.name,phone:formData.phone,
      activity:formData.activity,date:iso,time_slot:formData.time_slot,
      duration_hours:formData.duration_hours,status:'pending',admin_comment:'',
      created_at:Date.now(),resolved_at:null,device_id:deviceId,
      user_id: loggedInUser?.id || null,
      recurrence:formData.recurrence,recurrence_group_id:groupId,
      user_pin_hash:pinHash,
    }));

    const BATCH=20;
    for(let i=0;i<rows.length;i+=BATCH){
      const {error}=await supabase.from('bookings').insert(rows.slice(i,i+BATCH));
      if(error){
        setSubmitLoading(false);
        showToast(`Fel: ${error.message||'Något gick fel. Försök igen.'}`);
        return;
      }
    }
    setSubmitLoading(false);
    activateForDevice?.();
    // Cacha kontaktuppgifter
    localStorage.setItem(STORAGE_PHONE, normalizePhone(formData.phone));
    showToast(rows.length>1?`${rows.length} bokningsförfrågningar skickade!`:'Bokningsförfrågan skickad!');
    // Visa PIN om det är ny person (pin finns i localStorage)
    const freshPin = localStorage.getItem(STORAGE_PIN);
    const alreadyShownPin = localStorage.getItem(STORAGE_PIN_SHOWN) === 'true';
    if(freshPin && !alreadyShownPin) setPendingPinToShow(freshPin);
    else setView('my-bookings');
  },[showToast, deviceId, activateForDevice]);

  /* Besökare återkallar/avbokar
     - pending / edit_pending → direkt, ingen förklaring krävs
     - approved / edited      → direkt men kräver förklaring, admin notifieras via resolved_at */
  /* Återhämtning via telefon + PIN-kod */
  const handleRecoverByPin=useCallback(async(phone,pin)=>{
    const normalizedPhone = normalizePhone(phone);
    // Hash PIN med telefon som salt — samma metod som vid bokning
    const pinHash = await sha256(normalizedPhone + ':' + pin);
    // Hämta alla bokningar med detta telefonnummer + matchande hash
    const {data,error}=await supabase
      .from('bookings')
      .select('id,device_id')
      .eq('user_pin_hash', pinHash);
    if(error) throw error;
    if(!data?.length) return 0; // fel PIN eller okänt telefonnummer
    // Koppla om till nuvarande device_id
    const ids = data.map(b=>b.id);
    const BATCH=20;
    for(let i=0;i<ids.length;i+=BATCH){
      await supabase.from('bookings').update({device_id:deviceId}).in('id',ids.slice(i,i+BATCH));
    }
    localStorage.setItem(STORAGE_PHONE, normalizedPhone);
    localStorage.setItem(STORAGE_PIN_HASH, pinHash);
    localStorage.setItem('islamnu_has_booking','true');
    activateForDevice?.();
    return ids.length;
  },[deviceId,activateForDevice]);

  /* Tyst återhämtning vid app-start om PIN-hash finns cachad i localStorage */
  useEffect(()=>{
    const cachedHash = localStorage.getItem(STORAGE_PIN_HASH);
    if(!cachedHash||myBookings.length>0) return;
    supabase.from('bookings').select('id,device_id').eq('user_pin_hash',cachedHash)
      .then(({data})=>{
        if(!data?.length) return;
        const foreign = data.filter(b=>b.device_id!==deviceId);
        if(!foreign.length) return;
        const ids = foreign.map(b=>b.id);
        const BATCH=20;
        (async()=>{
          for(let i=0;i<ids.length;i+=BATCH)
            await supabase.from('bookings').update({device_id:deviceId}).in('id',ids.slice(i,i+BATCH));
          localStorage.setItem('islamnu_has_booking','true');
          activateForDevice?.();
        })().catch(()=>{});
      }).catch(()=>{});
  // eslint-disable-next-line
  },[]);

  const handleVisitorCancel=useCallback(async(booking, reason)=>{
    const noApproval = ['pending','edit_pending'].includes(booking.status);
    const comment = noApproval ? 'Återkallad av besökaren.' : `Avbokad av besökaren: ${reason}`;
    const {error}=await supabase.from('bookings').update({
      status:'cancelled',
      admin_comment:comment,
      resolved_at:Date.now(),
    }).eq('id',booking.id);
    if(error){showToast('Något gick fel.');return;}
    showToast(noApproval?'Bokning återkallad.':'Bokning avbokad.');
    setCancelDialog(null);
  },[showToast]);

  /* Besökare avbokar ett enstaka tillfälle i en serie (direkt, ingen dialog) */
  const handleVisitorCancelOne=useCallback(async(booking)=>{
    const noApproval = ['pending','edit_pending'].includes(booking.status);
    const comment = noApproval ? 'Återkallad av besökaren.' : 'Avbokat tillfälle av besökaren.';
    const {error}=await supabase.from('bookings').update({status:'cancelled',admin_comment:comment,resolved_at:Date.now()}).eq('id',booking.id);
    if(error){showToast('Något gick fel.');return;}
    showToast(noApproval?'Tillfälle återkallat.':'Tillfälle avbokat.');
  },[showToast]);

  /* Besökare avbokar ett tillfälle + alla kommande i serien */
  const handleVisitorCancelFromDate=useCallback(async(booking, futureBookings)=>{
    const noApproval = ['pending','edit_pending'].includes(booking.status);
    const comment = noApproval ? 'Återkallad av besökaren.' : 'Avbokat av besökaren (detta och kommande).';
    const ids = futureBookings.map(b=>b.id);
    const BATCH=20;
    for(let i=0;i<ids.length;i+=BATCH){
      const {error}=await supabase.from('bookings').update({status:'cancelled',admin_comment:comment,resolved_at:Date.now()}).in('id',ids.slice(i,i+BATCH));
      if(error){showToast('Något gick fel.');return;}
    }
    showToast(`${ids.length} tillfällen ${noApproval?'återkallade':'avbokade'}.`);
  },[showToast]);

  /* Besökare redigerar bokning:
     - pending → ta bort gamla raden, skapa ny pending (frigör gamla platsen korrekt)
     - approved/edited → skickas som edit_pending för admin att granska */
  const handleVisitorEdit=useCallback(async(data)=>{
    setSubmitLoading(true);
    const original = bookings.find(b=>b.id===data.id);
    if(!original){ showToast('Något gick fel.'); setSubmitLoading(false); return; }

    const isPending = data.originalStatus==='pending';
    const needsApproval = !isPending && editRequiresApproval(original, data);

    if(isPending){
      // Pending → ta bort och skapa ny pending
      const {error: delErr} = await supabase.from('bookings').delete().eq('id', data.id);
      if(delErr){ showToast('Något gick fel.'); setSubmitLoading(false); return; }
      const newBooking = {
        id: uid(), name: original.name, phone: original.phone,
        activity: data.activity, date: data.date, time_slot: data.time_slot,
        duration_hours: data.duration_hours, status: 'pending', admin_comment: '',
        created_at: Date.now(), resolved_at: null, device_id: deviceId,
        user_id: loggedInUser?.id || null,
        recurrence: original.recurrence || 'none',
        recurrence_group_id: original.recurrence_group_id || null,
      };
      const {error: insErr} = await supabase.from('bookings').insert([newBooking]);
      setSubmitLoading(false);
      if(insErr){ showToast('Något gick fel.'); return; }
      showToast('Bokning uppdaterad — skickas som ny förfrågan!');
    } else if(!needsApproval){
      // Godkänd + minskning/oförändrad tid → direkt godkänd utan admin
      const {error} = await supabase.from('bookings').update({
        date: data.date, time_slot: data.time_slot,
        duration_hours: data.duration_hours, activity: data.activity,
        status: 'approved',
        admin_comment: 'Ändrad av användare (kortare tid, direkt godkänd).',
        resolved_at: Date.now(),
      }).eq('id', data.id);
      setSubmitLoading(false);
      if(error){ showToast('Något gick fel.'); return; }
      showToast('Bokning uppdaterad direkt ✓');
    } else {
      // Godkänd + ökning/byte → edit_pending
      const {error} = await supabase.from('bookings').update({
        date: data.date, time_slot: data.time_slot,
        duration_hours: data.duration_hours, activity: data.activity,
        status: 'edit_pending',
        admin_comment: 'Ändringsförfrågan — granskas av admin.',
        resolved_at: null,
      }).eq('id', data.id);
      setSubmitLoading(false);
      if(error){ showToast('Något gick fel.'); return; }
      showToast('Ändringsförfrågan skickad — väntar på admin.');
    }
    setView('my-bookings'); setEditingBooking(null);
  },[showToast, bookings, deviceId, loggedInUser]);

  /* Admin godkänn/avböj */
  const handleAdminAction=useCallback(async(bookingId,action,comment)=>{
    setActionLoading(true);
    const {error}=await supabase.from('bookings').update({status:action,admin_comment:comment,resolved_at:Date.now()}).eq('id',bookingId);
    setActionLoading(false);
    if(error){showToast('Något gick fel.');return;}
    onMarkAdminSeen?.(); // clear adminUnread badge immediately
    onRefreshNotifications?.(); // re-fetch pending count from DB
    showToast(action==='approved'?'Bokning godkänd ✓':'Bokning avböjd');
  },[showToast,onMarkAdminSeen,onRefreshNotifications]);

  /* Admin redigerar bokning */
  const handleAdminEdit=useCallback(async(data)=>{
    setActionLoading(true);
    const {error}=await supabase.from('bookings').update({date:data.date,time_slot:data.time_slot,duration_hours:data.duration_hours,activity:data.activity,status:'edited',admin_comment:data.admin_comment,resolved_at:Date.now()}).eq('id',data.id);
    setActionLoading(false);
    if(error){showToast('Något gick fel.');return;}
    onMarkAdminSeen?.();
    onRefreshNotifications?.();
    showToast('Bokning ändrad & besökare notifierad ✓');
  },[showToast,onMarkAdminSeen,onRefreshNotifications]);

  /* Admin tar bort bokning */
  const handleAdminDelete=useCallback(async(bookingId,explanation)=>{
    setActionLoading(true);
    const {error}=await supabase.from('bookings').update({status:'cancelled',admin_comment:explanation,resolved_at:Date.now()}).eq('id',bookingId);
    setActionLoading(false);
    if(error){showToast('Något gick fel.');return;}
    onRefreshNotifications?.();
    showToast('Bokning borttagen & besökare notifierad');
  },[showToast,onRefreshNotifications]);

  /* Admin tar bort flera bokningar (enstaka + kommande) */
  const handleAdminDeleteMany=useCallback(async(bookingIds,explanation)=>{
    setActionLoading(true);
    const BATCH=20;
    for(let i=0;i<bookingIds.length;i+=BATCH){
      const {error}=await supabase.from('bookings')
        .update({status:'cancelled',admin_comment:explanation,resolved_at:Date.now()})
        .in('id',bookingIds.slice(i,i+BATCH));
      if(error){setActionLoading(false);showToast('Något gick fel.');return;}
    }
    setActionLoading(false);
    showToast(`${bookingIds.length} tillfällen borttagna & besökare notifierad`);
  },[showToast]);

  /* Admin lägger till återkommande */
  const handleAdminAddRecurring=useCallback(async(formData)=>{
    const groupId=uid();
    const rows=(formData.recur_dates||[formData.date]).map(iso=>({
      id:uid(),name:formData.name,phone:formData.phone||'',
      activity:formData.activity,date:iso,time_slot:formData.time_slot,
      duration_hours:formData.duration_hours,status:'approved',admin_comment:'',
      created_at:Date.now(),resolved_at:Date.now(),device_id:'admin',
      recurrence:formData.recurrence,recurrence_group_id:groupId,
    }));
    const BATCH=20;
    for(let i=0;i<rows.length;i+=BATCH){
      const {error}=await supabase.from('bookings').insert(rows.slice(i,i+BATCH));
      if(error){showToast('Något gick fel.');return;}
    }
    showToast(`${rows.length} återkommande bokningar tillagda ✓`);
  },[showToast]);

  const handleAdminLogin=useCallback(()=>{
    localStorage.setItem(STORAGE_ADMIN,'true');
    setAdminModeState(true);
    setView('admin');
    showToast('Välkommen, admin');
    registerAdminDevice?.();
  },[showToast, registerAdminDevice]);
  const handleAdminLogout=useCallback(()=>{
    localStorage.setItem(STORAGE_ADMIN,'false');
    setAdminModeState(false);
    setView('calendar');
    showToast('Utloggad');
    dismissAdminDevice?.();
  },[showToast, dismissAdminDevice]);
  const handleSelectSlot=useCallback((date,slotLbl,startH,durationHours,existingBooking)=>{
    if(adminMode&&existingBooking){
      // Navigera till admin med rätt bokning förmarkerad
      setAdminPreselect(existingBooking.recurrence_group_id||existingBooking.id);
      setView('admin');
      return;
    }
    setPendingSlot({date,slotLabel:slotLbl,startH,durationHours});setView('form');
  },[adminMode]);

  // Fix 5: räkna olästa notiser för besökare (egna bokningar med svar)
  const visitorUnread = useMemo(()=>{
    const seenAt = parseInt(localStorage.getItem('islamnu_bookings_visitor_seen')||'0',10);
    return myBookings.filter(b=>['approved','rejected','cancelled','edited'].includes(b.status)&&b.resolved_at>seenAt).length;
  },[myBookings]);

  const pendingCount=bookings.filter(b=>b.status==='pending'||b.status==='edit_pending').length;

  /* Views */
  // Ej inloggad → visa inloggning
  if(!isLoggedIn && view !== 'user-login'){
    // Tillåt anonym visning av kalendern om inte inloggad
    // men blockera bokning och my-bookings
    if(view==='form'||view==='my-bookings'||view==='admin'||view==='admin-login'){
      return <div style={{background:T.bg,minHeight:'100%'}}><UserLogin onSuccess={handleUserLogin} onBack={()=>setView('calendar')} T={T}/></div>;
    }
  }

  if(view==='user-login') return <div style={{background:T.bg,minHeight:'100%'}}><UserLogin onSuccess={handleUserLogin} onBack={()=>{setView('calendar');}} T={T}/></div>;
  if(view==='user-management') return <div style={{background:T.bg,minHeight:'100%'}}><UserManagement onBack={()=>setView('admin')} T={T}/></div>;

  if(pendingPinToShow){
    return <div style={{background:T.bg,minHeight:'100%',paddingBottom:0}}>
      <PinRevealScreen pin={pendingPinToShow} onContinue={()=>{setPendingPinToShow(null);localStorage.setItem(STORAGE_PIN_SHOWN,'true');setView('my-bookings');}} T={T}/>
    </div>;
  }

  if(view==='form'&&pendingSlot) return <div style={{background:T.bg,minHeight:'100%'}}>
    <BookingForm date={pendingSlot.date} slotLabel={pendingSlot.slotLabel} durationHours={pendingSlot.durationHours} onSubmit={handleSubmitBooking} onBack={()=>setView('calendar')} loading={submitLoading} bookings={bookings} T={T}/>
    <Toast message={toast} T={T}/>
  </div>;

  if(view==='edit-booking'&&editingBooking) return <div style={{background:T.bg,minHeight:'100%'}}>
    <EditBookingForm booking={editingBooking} bookings={bookings} onSubmit={handleVisitorEdit} onBack={()=>{setView('my-bookings');setEditingBooking(null);}} loading={submitLoading} T={T}/>
    <Toast message={toast} T={T}/>
  </div>;

  if(view==='my-bookings'){
    if(viewConfirmation) return <div style={{background:T.bg,minHeight:'100%'}}><ConfirmationScreen booking={viewConfirmation} onBack={()=>setViewConfirmation(null)} T={T}/></div>;
    return <div style={{background:T.bg,minHeight:'100%'}}>
      {cancelDialog&&<ConfirmDialog
        title={['pending','edit_pending'].includes(cancelDialog.status)?'Återkalla bokning':'Avboka bokning'}
        message={['pending','edit_pending'].includes(cancelDialog.status)
          ?`Bokningen för ${isoToDisplay(cancelDialog.date)} · ${cancelDialog.time_slot} är ej bekräftad och återkallas direkt.`
          :`Bokningen för ${isoToDisplay(cancelDialog.date)} · ${cancelDialog.time_slot} är bekräftad. Du avbokar direkt men admin får en notis.`}
        confirmLabel={['pending','edit_pending'].includes(cancelDialog.status)?'Ja, återkalla':'Ja, avboka'}
        confirmColor="#ef4444"
        requireText={['approved','edited'].includes(cancelDialog.status)?'ANLEDNING TILL AVBOKNING *':undefined}
        requirePlaceholder="Förklara varför du avbokar..."
        onConfirm={(reason)=>{handleVisitorCancel(cancelDialog,reason);}}
        onCancel={()=>{setCancelDialog(null);}}
        T={T}
      />}
      <MyBookings
        bookings={myBookings}
        onViewConfirmation={setViewConfirmation}
        onEdit={(b)=>{setEditingBooking(b);setView('edit-booking');}}
        onCancel={(b)=>setCancelDialog(b)}
        onCancelOne={handleVisitorCancelOne}
        onCancelFromDate={handleVisitorCancelFromDate}
        onRecover={handleRecoverByPin}
        onBack={()=>setView('calendar')}
        highlightBookingId={highlightBookingId}
        T={T}
      />
      <Toast message={toast} T={T}/>
    </div>;
  }

  if(view==='admin-login') return <div style={{background:T.bg,minHeight:'100%'}}><AdminLogin onSuccess={handleAdminLogin} onBack={()=>setView('calendar')} T={T}/></div>;
  if(view==='admin') return <div style={{background:T.bg,minHeight:'100%'}}>
    <AdminPanel bookings={bookings} onAction={handleAdminAction} onEdit={handleAdminEdit} onDelete={handleAdminDelete} onDeleteMany={handleAdminDeleteMany} onAddRecurring={handleAdminAddRecurring} onBack={()=>setView('calendar')} onLogout={handleAdminLogout} onMarkAdminSeen={onMarkAdminSeen} actionLoading={actionLoading} onTabBarHide={onTabBarHide} onTabBarShow={onTabBarShow} preselect={adminPreselect} onClearPreselect={()=>setAdminPreselect(null)} initialFilter={startAtAdmin?'pending':undefined} T={T} onManageUsers={()=>setView('user-management')}/>
    <Toast message={toast} T={T}/>
  </div>;

  return <div ref={scrollRef} style={{background:T.bg,minHeight:'100%',fontFamily:'system-ui, sans-serif'}}>
    <style>{`@keyframes fadeInUp{from{opacity:0;transform:translateX(-50%) translateY(8px)}to{opacity:1;transform:translateX(-50%) translateY(0)}} @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}} @keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>
    <div style={{paddingTop:'max(16px, env(safe-area-inset-top))',paddingLeft:'16px',paddingRight:'16px',paddingBottom:'12px',position:'sticky',top:0,zIndex:20,background:T.bg,borderBottom:`1px solid ${T.border}`}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div style={{display:'flex',alignItems:'center',gap:4}}>
          <button onClick={onBack} style={{background:'none',border:'none',cursor:'pointer',color:T.accent,fontSize:22,fontWeight:300,lineHeight:1,padding:'4px 8px 4px 0',WebkitTapHighlightColor:'transparent'}}>‹</button>
          <button onClick={() => window.dispatchEvent(new CustomEvent('scrollToTop'))} style={{background:'none',border:'none',cursor:'pointer',padding:0,WebkitTapHighlightColor:'transparent'}}>
            <div style={{fontSize:22,fontWeight:800,color:T.text,letterSpacing:'-.4px'}}>Boka lokal</div>
          </button>
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          {/* Mina bokningar — bara om inloggad */}
          {isLoggedIn&&<button onClick={()=>{setView('my-bookings');onMarkVisitorSeen?.();}} style={{position:'relative',background:T.card,border:`1px solid ${T.border}`,borderRadius:12,width:40,height:40,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',WebkitTapHighlightColor:'transparent'}}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.textMuted} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            {visitorUnread>0&&!isAdminUser&&<div style={{position:'absolute',top:-3,right:-3,width:14,height:14,borderRadius:'50%',background:'#ef4444',color:'#fff',fontSize:8,fontWeight:800,display:'flex',alignItems:'center',justifyContent:'center'}}>{visitorUnread>9?'9+':visitorUnread}</div>}
          </button>}
          {/* Admin-knapp */}
          {isAdminUser&&<button onClick={()=>setView('admin')} style={{position:'relative',background:`${T.accent}22`,border:`1px solid ${T.accent}66`,borderRadius:12,width:40,height:40,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',WebkitTapHighlightColor:'transparent'}}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            {pendingCount>0&&<div style={{position:'absolute',top:-3,right:-3,width:14,height:14,borderRadius:'50%',background:'#f59e0b',color:'#fff',fontSize:8,fontWeight:800,display:'flex',alignItems:'center',justifyContent:'center'}}>{pendingCount>9?'9+':pendingCount}</div>}
          </button>}
          {/* Logga in / ut */}
          {!isLoggedIn
            ? <button onClick={()=>setView('user-login')} style={{background:T.accent,color:'#fff',border:'none',borderRadius:12,padding:'0 14px',height:40,fontSize:13,fontWeight:700,cursor:'pointer',WebkitTapHighlightColor:'transparent'}}>Logga in</button>
            : <button onClick={handleUserLogout} style={{background:'#ef444418',border:'1px solid #ef444433',borderRadius:12,width:40,height:40,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',WebkitTapHighlightColor:'transparent'}} title={`Logga ut (${loggedInUser?.name})`}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              </button>
          }
        </div>
      </div>
      {/* Inloggad som-banner */}
      {isLoggedIn&&<div style={{fontSize:11,color:T.textMuted,marginTop:4,paddingLeft:2}}>
        Inloggad som <span style={{fontWeight:600,color:isAdminUser?'#f59e0b':T.accent}}>{loggedInUser.name}</span>
        {isAdminUser&&<span style={{marginLeft:4,background:'#f59e0b22',color:'#f59e0b',borderRadius:6,fontSize:10,fontWeight:700,padding:'1px 6px'}}>Admin</span>}
      </div>}
    </div>
    <div style={{padding:'12px 16px 24px'}}>
      {adminMode&&<div style={{background:`${T.accent}18`,border:`1px solid ${T.accent}44`,borderRadius:10,padding:'8px 12px',marginBottom:16,display:'flex',alignItems:'center',gap:8}}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <span style={{fontSize:12,color:T.accent,fontWeight:600}}>Adminläge aktivt — du ser alla bokningsdetaljer</span>
      </div>}
      <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:18,padding:'16px 14px'}}>
        {dbLoading?<Spinner T={T}/>:<CalendarView bookings={bookings} onSelectSlot={handleSelectSlot} isAdmin={adminMode} T={T}/>}
      </div>
      <p style={{fontSize:11,color:T.textMuted,textAlign:'center',marginTop:14,marginBottom:0}}>Välj antal timmar, ett datum och en ledig tid.</p>
    </div>
    <Toast message={toast} T={T}/>
  </div>;
}
