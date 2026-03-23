/**
 * BookingScreen.js — iOS Calendar-inspired booking UI
 * Implements all 12 requirements:
 * 1. iOS dark/light theme  2. Instant notification fix
 * 3. Month view default + large iOS title  4. Year view full screen
 * 5. Search in month view  6. Plus button
 * 7. Heldag toggle + iOS drum picker  8. Recurrence dropdown
 * 9. Notes field  10. Today chip (red filled circle)
 * 11. Zoom animation year→month  12. Today chip always visible
 */
import React, {
  useState, useEffect, useCallback, useMemo, useRef
} from 'react';
import { useTheme } from '../context/ThemeContext';
import { useOfflineBooking } from '../hooks/useOfflineBooking';
import OfflineStatusBar from './OfflineStatusBar';
import { supabase } from '../services/supabaseClient';
import { useIsPWA } from '../hooks/useIsPWA';

// ─── Module-level tab bar callbacks (set by BookingScreen, used by sub-components) ──
const _tabBarCallbacks = { hide: null, show: null };

// ─── Storage keys ──────────────────────────────────────────────────────────────
const STORAGE_ADMIN     = 'islamnu_admin_mode';
const STORAGE_DEVICE    = 'islamnu_device_id';
const STORAGE_PHONE     = 'islamnu_user_phone';
const STORAGE_USER_ID   = 'islamnu_user_id';
const STORAGE_USER_NAME = 'islamnu_user_name';
const STORAGE_USER_ROLE = 'islamnu_user_role';

// ─── Constants ────────────────────────────────────────────────────────────────
const OPEN_HOUR  = 8;
const CLOSE_HOUR = 24;
const VALID_HOURS      = Array.from({ length: CLOSE_HOUR - OPEN_HOUR }, (_, i) => OPEN_HOUR + i);
const VALID_HOURS_END  = [...VALID_HOURS, 24]; // 24 = midnight end time (displayed as 00:00)
const VALID_MINUTES    = [0, 30];
const DAYS_SV   = ['M','T','O','T','F','L','S'];
const DAYS_FULL = ['Måndag','Tisdag','Onsdag','Torsdag','Fredag','Lördag','Söndag'];
const MONTHS_SV = ['Januari','Februari','Mars','April','Maj','Juni','Juli','Augusti','September','Oktober','November','December'];

const RECUR_OPTIONS = [
  { value: 'none',     label: 'Ingen upprepning' },
  { value: 'daily',    label: 'Varje dag' },
  { value: 'weekly',   label: 'Varje vecka' },
  { value: 'biweekly', label: 'Varannan vecka' },
  { value: 'monthly',  label: 'Varje månad' },
  { value: 'yearly',   label: 'Varje år' },
  { value: 'custom',   label: 'Anpassad (välj dagar)' },
];
// Custom recurrence day helpers — stored as 'custom:0,1,5,6' (0=Mon..6=Sun)
function parseCustomDays(r) {
  if (!r || !r.startsWith('custom:')) return [];
  return r.slice(7).split(',').map(Number).filter(n => !isNaN(n));
}
function buildCustomRecurrence(days) {
  if (!days || days.length === 0) return 'custom:';
  return 'custom:' + [...days].sort((a,b)=>a-b).join(',');
}
function fmtRecur(r) {
  if(!r) return 'Ingen upprepning';
  if(r.startsWith('custom:')) {
    const days = parseCustomDays(r);
    if(days.length === 0) return 'Anpassad (inga dagar valda)';
    const names = ['Måndag','Tisdag','Onsdag','Torsdag','Fredag','Lördag','Söndag'];
    return 'Anpassad: ' + days.map(d => names[d]).join(', ');
  }
  return RECUR_OPTIONS.find(o=>o.value===r)?.label || r;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function toISO(d) {
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function parseISO(s) { const [y,m,d]=s.split('-').map(Number); return new Date(y,m-1,d); }
function isoToDisplay(s) {
  const d=parseISO(s);
  return d.getDate()+' '+MONTHS_SV[d.getMonth()]+' '+d.getFullYear();
}
function uid() { return Date.now().toString(36)+Math.random().toString(36).slice(2,7); }
function fmtTime(h,m) { return String(h===24?0:h).padStart(2,'0')+':'+String(m).padStart(2,'0'); }
function slotFromHM(sH,sM,eH,eM) { return fmtTime(sH,sM)+'–'+fmtTime(eH,eM); }
function parseSlotParts(slot) {
  const [s,e]=slot.split('–');
  const p=t=>{const[h,m]=t.split(':').map(Number);return{h,m};};
  const st=p(s); const en=p(e);
  const sd=st.h+st.m/60; const ed=en.h===0?24:en.h+en.m/60;
  return{startH:st.h,startM:st.m,endH:en.h===0?24:en.h,endM:en.m,startDecimal:sd,endDecimal:ed,duration:ed-sd};
}
function fmtDuration(h) {
  if(h<1) return '30 min';
  const f=Math.floor(h),half=h%1!==0;
  return half?f+' tim 30 min':f+' tim';
}
function normalizePhone(p) {
  let s=(p||'').replace(/[\s\-().]/g,'');
  if(s.startsWith('+46')) s='0'+s.slice(3);
  return s;
}
async function sha256(text) {
  const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}
function generateInviteCode() { return String(Math.floor(100000+Math.random()*900000)); }
function getMonthGrid(year,month) {
  const first=new Date(year,month,1);
  const last=new Date(year,month+1,0);
  const pad=(first.getDay()+6)%7;
  const cells=[];
  for(let i=0;i<pad;i++) cells.push(null);
  for(let d=1;d<=last.getDate();d++) cells.push(new Date(year,month,d));
  while(cells.length%7!==0) cells.push(null);
  const rows=[];
  for(let i=0;i<cells.length;i+=7) rows.push(cells.slice(i,i+7));
  return rows;
}

// ─── Recurrence engine ────────────────────────────────────────────────────────
function expandBooking(booking, windowStart, windowEnd, exceptions=[]) {
  const{start_date,end_date,recurrence}=booking;
  const skipDates=new Set(exceptions.filter(e=>e.booking_id===booking.id&&e.type==='skip').map(e=>e.exception_date));
  const editMap={};
  exceptions.filter(e=>e.booking_id===booking.id&&e.type==='edit').forEach(e=>{editMap[e.exception_date]=e;});
  const dates=[];
  if(!recurrence||recurrence==='none') {
    if(start_date>=windowStart&&start_date<=windowEnd&&!skipDates.has(start_date))
      dates.push(applyException(booking,start_date,editMap[start_date]));
    return dates;
  }
  let current=parseISO(start_date);
  const endD=end_date?parseISO(end_date):parseISO(windowEnd);
  const winEnd=parseISO(windowEnd);
  const effectiveEnd=endD<winEnd?endD:winEnd;
  const winStart=parseISO(windowStart);
  let safety=0;
  while(current<=effectiveEnd&&safety++<5000) {
    const iso=toISO(current);
    if(current>=winStart&&!skipDates.has(iso)) dates.push(applyException(booking,iso,editMap[iso]));
    const next=new Date(current);
    if(recurrence==='daily') next.setDate(next.getDate()+1);
    else if(recurrence==='weekly') next.setDate(next.getDate()+7);
    else if(recurrence==='biweekly') next.setDate(next.getDate()+14);
    else if(recurrence==='monthly') next.setMonth(next.getMonth()+1);
    else if(recurrence==='yearly') next.setFullYear(next.getFullYear()+1);
    else if(recurrence && recurrence.startsWith('custom:')) {
      // Advance one day at a time, skip days not in custom set
      const customDays = parseCustomDays(recurrence);
      if (customDays.length === 0) break;
      next.setDate(next.getDate()+1);
      let safety = 0;
      while (safety++ < 14) {
        const dow = (next.getDay()+6)%7; // 0=Mon..6=Sun
        if (customDays.includes(dow)) break;
        next.setDate(next.getDate()+1);
      }
    }
    else break;
    current=next;
  }
  return dates;
}
function applyException(booking,date,exc) {
  if(!exc) return{...booking,date,_exception:null};
  return{...booking,date,time_slot:exc.new_time_slot||booking.time_slot,
    duration_hours:exc.new_duration_hours||booking.duration_hours,
    activity:exc.new_activity||booking.activity,status:exc.new_status||booking.status,
    admin_comment:exc.admin_comment||booking.admin_comment,_exception:exc,_exception_id:exc.id};
}
function expandAll(bookings,exceptions,windowStart,windowEnd) {
  const result=[];
  for(const b of bookings) {
    if(b.status==='cancelled'||b.status==='rejected') continue;
    result.push(...expandBooking(b,windowStart,windowEnd,exceptions));
  }
  return result;
}
function getOccurrencesForDate(bookings,exceptions,iso) { return expandAll(bookings,exceptions,iso,iso); }
function getBookedBlocks(bookings,exceptions,iso,excludeId=null) {
  const occs=getOccurrencesForDate(bookings,exceptions,iso).filter(o=>o.id!==excludeId);
  const blocks=new Set();
  occs.forEach(o=>{const p=parseSlotParts(o.time_slot);for(let i=0;i<p.duration*2;i++) blocks.add(p.startDecimal*2+i);});
  return blocks;
}
function hasBookingsOnDate(bookings,exceptions,iso) { return getOccurrencesForDate(bookings,exceptions,iso).length>0; }

// ─── iOS Toggle ───────────────────────────────────────────────────────────────
function IOSToggle({value,onChange,T}) {
  return (
    <div onClick={()=>onChange(!value)} style={{
      width:51,height:31,borderRadius:16,cursor:'pointer',
      background:value?T.toggleOn:T.toggleTrack,
      position:'relative',transition:'background 0.3s',
      flexShrink:0,WebkitTapHighlightColor:'transparent'}}>
      <div style={{position:'absolute',top:2,left:value?22:2,
        width:27,height:27,borderRadius:'50%',background:'#fff',
        boxShadow:'0 2px 6px rgba(0,0,0,0.3)',
        transition:'left 0.3s cubic-bezier(0.34,1.56,0.64,1)'}}/>
    </div>
  );
}

// ─── iOS Drum Picker ─────────────────────────────────────────────────────────
function DrumPicker({options,value,onChange,formatFn,T,width=80}) {
  const ITEM_H=44;
  const listRef=useRef(null);
  const velRef=useRef(0),lastY=useRef(0),lastT=useRef(0);
  const rafRef=useRef(null),isDragging=useRef(false);
  const startY=useRef(0),startST=useRef(0);
  const clsId=useRef('dp_'+Math.random().toString(36).slice(2,8)).current;

  const idx=useMemo(()=>{const i=options.indexOf(value);return i===-1?0:i;},[options,value]);

  const scrollTo=useCallback((i,animate=false)=>{
    if(!listRef.current) return;
    listRef.current.style.scrollBehavior=animate?'smooth':'';
    listRef.current.scrollTop=i*ITEM_H;
    if(animate) setTimeout(()=>{if(listRef.current) listRef.current.style.scrollBehavior='';},350);
  },[]);

  useEffect(()=>{requestAnimationFrame(()=>scrollTo(idx,false));},[idx,scrollTo]);

  const snap=useCallback(()=>{
    if(!listRef.current) return;
    const i=Math.max(0,Math.min(options.length-1,Math.round(listRef.current.scrollTop/ITEM_H)));
    scrollTo(i,true);
    onChange(options[i]);
  },[options,onChange,scrollTo]);

  const runMomentum=useCallback(()=>{
    if(!listRef.current) return;
    velRef.current*=0.92;
    listRef.current.scrollTop+=velRef.current;
    if(Math.abs(velRef.current)>0.4) rafRef.current=requestAnimationFrame(runMomentum);
    else snap();
  },[snap]);

  const onTouchStart=useCallback(e=>{
    isDragging.current=true;
    startY.current=e.touches[0].clientY;
    startST.current=listRef.current.scrollTop;
    lastY.current=e.touches[0].clientY;lastT.current=Date.now();
    velRef.current=0;cancelAnimationFrame(rafRef.current);
    e.stopPropagation();
  },[]);
  const onTouchMove=useCallback(e=>{
    if(!isDragging.current) return;
    listRef.current.scrollTop=startST.current+(startY.current-e.touches[0].clientY);
    const dt=Date.now()-lastT.current||1;
    velRef.current=(lastY.current-e.touches[0].clientY)/dt*16;
    lastY.current=e.touches[0].clientY;lastT.current=Date.now();
    e.preventDefault();e.stopPropagation();
  },[]);
  const onTouchEnd=useCallback(e=>{
    isDragging.current=false;e.stopPropagation();
    if(Math.abs(velRef.current)>1) rafRef.current=requestAnimationFrame(runMomentum);
    else snap();
  },[runMomentum,snap]);
  const onMouseDown=useCallback(e=>{
    isDragging.current=true;startY.current=e.clientY;
    startST.current=listRef.current.scrollTop;
    lastY.current=e.clientY;lastT.current=Date.now();
    velRef.current=0;cancelAnimationFrame(rafRef.current);
  },[]);
  const onMouseMove=useCallback(e=>{
    if(!isDragging.current) return;
    listRef.current.scrollTop=startST.current+(startY.current-e.clientY);
    const dt=Date.now()-lastT.current||1;
    velRef.current=(lastY.current-e.clientY)/dt*16;
    lastY.current=e.clientY;lastT.current=Date.now();
  },[]);
  const onMouseUp=useCallback(()=>{
    if(!isDragging.current) return;
    isDragging.current=false;
    if(Math.abs(velRef.current)>1) rafRef.current=requestAnimationFrame(runMomentum);
    else snap();
  },[runMomentum,snap]);

  useEffect(()=>()=>cancelAnimationFrame(rafRef.current),[]);

  return (
    <div style={{position:'relative',height:ITEM_H*3,width,overflow:'hidden',userSelect:'none',WebkitUserSelect:'none'}}>
      <div style={{position:'absolute',top:0,left:0,right:0,height:ITEM_H,
        background:`linear-gradient(to bottom,${T.card}f0 0%,${T.card}00 100%)`,
        zIndex:2,pointerEvents:'none'}}/>
      <div style={{position:'absolute',bottom:0,left:0,right:0,height:ITEM_H,
        background:`linear-gradient(to top,${T.card}f0 0%,${T.card}00 100%)`,
        zIndex:2,pointerEvents:'none'}}/>
      <div style={{position:'absolute',top:'50%',left:0,right:0,height:ITEM_H,
        transform:'translateY(-50%)',background:T.pickerHighlight,
        borderTop:`0.5px solid ${T.accent}55`,borderBottom:`0.5px solid ${T.accent}55`,
        zIndex:1,pointerEvents:'none'}}/>
      <style>{`.${clsId}::-webkit-scrollbar{display:none}`}</style>
      <div ref={listRef} className={clsId}
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
        onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
        style={{height:'100%',overflowY:'scroll',scrollbarWidth:'none',
          msOverflowStyle:'none',WebkitOverflowScrolling:'touch',cursor:'grab'}}>
        <div style={{height:ITEM_H}}/>
        {options.map((opt,i)=>(
          <div key={String(opt)} onClick={()=>{scrollTo(i,true);onChange(opt);}}
            style={{height:ITEM_H,display:'flex',alignItems:'center',
              justifyContent:'center',cursor:'pointer',WebkitTapHighlightColor:'transparent'}}>
            <span style={{
              fontSize:opt===value?20:16,fontWeight:opt===value?700:400,
              color:opt===value?T.text:T.textMuted,fontFamily:'system-ui',
              transition:'font-size 0.12s,color 0.12s'}}>
              {formatFn?formatFn(opt):String(opt)}
            </span>
          </div>
        ))}
        <div style={{height:ITEM_H}}/>
      </div>
    </div>
  );
}

// ─── Time Accordion ──────────────────────────────────────────────────────────
function TimeAccordion({label,hour,minute,onConfirm,bookedBlocks,isStart,pairedHour,pairedMinute,T}) {
  const [open,setOpen]=useState(false);
  const [pendingH,setPendingH]=useState(hour);
  const [pendingM,setPendingM]=useState(minute);

  const validHours=useMemo(()=>{
    if(isStart) return VALID_HOURS;
    const sd=pairedHour+pairedMinute/60;
    return VALID_HOURS_END.filter(h=>h>sd&&h<=24);
  },[isStart,pairedHour,pairedMinute]);

  // Minuter: bara :00 gäller när sluttid är 24 (midnatt kan inte vara 24:30)
  // 23:30 är fullt giltig sluttid — regeln gäller BARA timme 24
  const validMinutes=useMemo(()=>{
    if(!isStart&&pendingH===24) return [0];
    return VALID_MINUTES;
  },[isStart,pendingH]);

  // Fix 2+3: when validMinutes changes, immediately clamp pendingM to a valid value
  useEffect(()=>{
    if(!validMinutes.includes(pendingM)) {
      setPendingM(validMinutes[0]);
    }
  },[validMinutes]); // eslint-disable-line

  // isOccupied: för starttid kollas om blocket är upptaget.
  // För sluttid: sluttid som exakt matchar en befintlig boknings START ska INTE räknas
  // som krock — 08:00-09:00 krockar inte med en befintlig 09:00-10:00.
  // Vi löser detta genom att sluttid kollar block (h+m/60)*2 - 1 (sista blocket som faktiskt används)
  // men bara när det inte är starttid.
  const isOccupied=useCallback((h,m)=>{
    if(isStart) {
      return bookedBlocks.has((h+m/60)*2);
    } else {
      // Sluttid: kolla om den halvtimme som slutar PRECIS vid h:m är upptagen
      // d.v.s. block precis INNAN sluttiden. Om h:m är exakt en existerande boknings
      // starttid så är det OK — ingen krock.
      const endBlock=(h+m/60)*2;
      // Om sluttiden är exakt på en heltimmes- eller halvtimmegräns och det blocket
      // tillhör en annan bokning som BÖRJAR där, är det ingen krock.
      // Enklast: kolla blocket precis före (endBlock - 1)
      if(endBlock===0) return false;
      return bookedBlocks.has(endBlock-1);
    }
  },[bookedBlocks,isStart]);

  useEffect(()=>{if(open){setPendingH(hour);setPendingM(minute);}},[open,hour,minute]);

  const handleConfirm=()=>{onConfirm(pendingH,pendingM);setOpen(false);};
  const handleHeaderChipClick=(e)=>{
    e.stopPropagation();
    if(open&&!isOccupied(pendingH,pendingM)){handleConfirm();}
    else{setOpen(v=>!v);}
  };

  // Fix 1: 24 should display as 00:00
  const fmtHour=h=>String(h===24?0:h).padStart(2,'0');
  const displayTime=fmtHour(hour)+':'+String(minute).padStart(2,'0');
  const pendingTime=fmtHour(pendingH)+':'+String(pendingM).padStart(2,'0');
  const occ=isOccupied(pendingH,pendingM);

  return (
    <div style={{background:T.card,border:`0.5px solid ${T.border}`,borderRadius:12,overflow:'hidden'}}>
      <div onClick={()=>setOpen(v=>!v)} style={{
        display:'flex',alignItems:'center',justifyContent:'space-between',
        padding:'13px 16px',cursor:'pointer',WebkitTapHighlightColor:'transparent'}}>
        <span style={{fontSize:16,color:T.text,fontFamily:'system-ui'}}>{label}</span>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <div onClick={handleHeaderChipClick}
            title={open?'Klicka för att bekräfta':''}
            style={{
              background:open?(occ?T.error:T.accent):`${T.accent}22`,
              color:open?'#fff':T.accent,
              borderRadius:8,padding:'4px 10px',fontSize:15,fontWeight:600,
              transition:'all 0.2s',cursor:'pointer',
              WebkitTapHighlightColor:'transparent',
              boxShadow:open&&!occ?`0 0 0 2px ${T.accent}44`:'none',
            }}>
            {open?pendingTime:displayTime}
          </div>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke={T.textMuted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            style={{transform:open?'rotate(180deg)':'none',transition:'transform 0.25s'}}>
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </div>
      </div>
      <div style={{maxHeight:open?220:0,overflow:'hidden',
        transition:'max-height 0.35s cubic-bezier(0.4,0,0.2,1)'}}>
        <div style={{borderTop:`0.5px solid ${T.separator}`,padding:'12px 16px 16px'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:0}}>
            {/* Fix 1: formatFn visar 24 som 00 i drum-pickern */}
            <DrumPicker options={validHours} value={pendingH}
              onChange={h=>setPendingH(h)} formatFn={fmtHour} T={T} width={80}/>
            <span style={{fontSize:22,fontWeight:700,color:T.text,margin:'0 4px',paddingBottom:2}}>:</span>
            {/* Fix 2+3: pendingM är alltid synkat via useEffect ovan */}
            <DrumPicker options={validMinutes} value={validMinutes.includes(pendingM)?pendingM:validMinutes[0]}
              onChange={m=>setPendingM(m)} formatFn={m=>String(m).padStart(2,'0')} T={T} width={80}/>
          </div>
          {occ && <div style={{textAlign:'center',fontSize:12,color:T.error,marginTop:8}}>Denna tid är upptagen</div>}
          <button onClick={handleConfirm} disabled={occ} style={{
            display:'block',width:'100%',marginTop:12,
            background:occ?T.textTertiary:T.accent,color:'#fff',
            border:'none',borderRadius:10,padding:'11px',fontSize:15,fontWeight:700,
            cursor:occ?'not-allowed':'pointer',fontFamily:'system-ui',
            WebkitTapHighlightColor:'transparent'}}>
            Bekräfta {pendingTime}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Primitives ───────────────────────────────────────────────────────────────
function BackButton({onBack,label='Tillbaka',T}) {
  return (
    <button onClick={onBack} style={{background:'none',border:'none',cursor:'pointer',
      display:'flex',alignItems:'center',gap:4,
      color:T.accent,fontFamily:'system-ui',fontSize:17,fontWeight:400,
      padding:'0 0 4px',WebkitTapHighlightColor:'transparent'}}>
      <svg width="10" height="17" viewBox="0 0 10 17" fill="none">
        <path d="M9 1L1 8.5L9 16" stroke={T.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      <span>{label}</span>
    </button>
  );
}
function Badge({status}) {
  const m={
    pending:{label:'Väntar',bg:'#FF9F0A22',color:'#FF9F0A'},
    edit_pending:{label:'Ändr. väntar',bg:'#FF6B2222',color:'#FF6B22'},
    approved:{label:'Godkänd',bg:'#34C75922',color:'#34C759'},
    rejected:{label:'Avböjd',bg:'#FF3B3022',color:'#FF3B30'},
    cancelled:{label:'Inställd',bg:'#8E8E9322',color:'#8E8E93'},
    edited:{label:'Ändrad',bg:'#0A84FF22',color:'#0A84FF'},
  };
  const s=m[status]||{label:status,bg:'#88888822',color:'#888'};
  return <span style={{background:s.bg,color:s.color,borderRadius:8,
    fontSize:11,fontWeight:700,padding:'3px 8px',fontFamily:'system-ui'}}>{s.label}</span>;
}
function RecurBadge({recurrence}) {
  return <span style={{background:'#8b5cf622',color:'#8b5cf6',borderRadius:8,
    fontSize:10,fontWeight:700,padding:'2px 7px',fontFamily:'system-ui'}}>{fmtRecur(recurrence)}</span>;
}
// ─── OccurrenceRow — swipe-left to reveal delete, tap Ta bort to confirm ──────
function OccurrenceRow({occ, booking, isSkipped, isOwn, isAdmin, onUserCancel, onAdminDelete, idx, total, T}) {
  const [offsetX, setOffsetX] = React.useState(0);
  const [revealed, setRevealed] = React.useState(false);
  const startXRef = React.useRef(null);
  const startYRef = React.useRef(null);
  const axisRef = React.useRef(null);
  const canDelete = !isSkipped && (booking.status==='approved'||booking.status==='edited'||booking.status==='pending');
  const showActions = (isOwn&&!isAdmin) || isAdmin;

  const onTouchStart = e => {
    startXRef.current = e.touches[0].clientX;
    startYRef.current = e.touches[0].clientY;
    axisRef.current = null;
  };
  const onTouchMove = e => {
    if (!startXRef.current) return;
    const dx = e.touches[0].clientX - startXRef.current;
    const dy = Math.abs(e.touches[0].clientY - startYRef.current);
    if (!axisRef.current) {
      axisRef.current = Math.abs(dx) > dy ? 'h' : 'v';
    }
    if (axisRef.current !== 'h') return;
    e.stopPropagation();
    const clamped = Math.max(-72, Math.min(0, dx + (revealed ? -72 : 0)));
    setOffsetX(clamped);
  };
  const onTouchEnd = () => {
    if (axisRef.current === 'h') {
      if (offsetX < -36) { setOffsetX(-72); setRevealed(true); }
      else { setOffsetX(0); setRevealed(false); }
    }
    startXRef.current = null;
    axisRef.current = null;
  };

  const handleDelete = () => {
    setOffsetX(0); setRevealed(false);
    if (isAdmin) onAdminDelete(occ);
    else onUserCancel(occ);
  };

  return (
    <div style={{position:'relative', overflow:'hidden',
      borderBottom: idx<total-1 ? `0.5px solid ${T.separator}` : 'none'}}>
      {/* Red delete action revealed on swipe */}
      <div style={{position:'absolute', right:0, top:0, bottom:0, width:72,
        background:T.error, display:'flex', alignItems:'center', justifyContent:'center'}}>
        <button onClick={handleDelete}
          style={{background:'none',border:'none',cursor:'pointer',
            display:'flex',flexDirection:'column',alignItems:'center',gap:3,
            WebkitTapHighlightColor:'transparent'}}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
            stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14H6L5 6"/>
            <path d="M10 11v6M14 11v6"/>
            <path d="M9 6V4h6v2"/>
          </svg>
          <span style={{fontSize:10,fontWeight:700,color:'#fff'}}>Radera</span>
        </button>
      </div>
      {/* Row content — slides left on swipe */}
      <div
        onTouchStart={canDelete&&showActions ? onTouchStart : undefined}
        onTouchMove={canDelete&&showActions ? onTouchMove : undefined}
        onTouchEnd={canDelete&&showActions ? onTouchEnd : undefined}
        style={{
          display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'10px 0', opacity: isSkipped ? 0.4 : 1,
          transform: `translateX(${offsetX}px)`,
          transition: startXRef.current ? 'none' : 'transform 0.22s cubic-bezier(0.4,0,0.2,1)',
          background: T.sheetBg,
          position:'relative', zIndex:1,
          touchAction: canDelete&&showActions ? 'pan-y' : 'auto',
        }}>
        <div>
          <div style={{fontSize:14,fontWeight:600,color:T.text}}>{isoToDisplay(occ.date)}</div>
          <div style={{fontSize:12,color:T.textMuted}}>{occ.time_slot}{booking.duration_hours?' · '+fmtDuration(booking.duration_hours):''}</div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          {isSkipped && <span style={{fontSize:11,color:T.textMuted}}>Inställd</span>}
          {/* Ta bort button — visible when not swiped, works on tap */}
          {canDelete && showActions && !isSkipped && (
            <button
              onClick={handleDelete}
              style={{background:'none',border:`1px solid ${T.error}44`,borderRadius:8,
                padding:'4px 10px',cursor:'pointer',color:T.error,
                fontSize:12,fontWeight:600,
                WebkitTapHighlightColor:'transparent',
                touchAction:'manipulation'}}>
              Radera
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Hides tab bar on mount, restores on unmount — used inside sheets
function HideTabBar() {
  useEffect(()=>{
    _tabBarCallbacks.hide?.();
    return()=>_tabBarCallbacks.show?.();
  },[]);
  return null;
}
// Forces tab bar visible — used in login view so user can navigate away
function ShowTabBar() {
  useEffect(()=>{
    _tabBarCallbacks.show?.();
    return()=>{};
  },[]);
  return null;
}

function Toast({message}) {
  if(!message) return null;
  return <div style={{position:'fixed',bottom:110,left:'50%',transform:'translateX(-50%)',
    background:'rgba(28,28,30,0.92)',backdropFilter:'blur(20px)',
    color:'#fff',padding:'12px 22px',borderRadius:14,fontSize:14,fontWeight:600,
    fontFamily:'system-ui',boxShadow:'0 4px 24px rgba(0,0,0,0.35)',
    zIndex:9999,whiteSpace:'nowrap',animation:'bsFadeInUp .25s ease'}}>{message}</div>;
}
function Spinner({T}) {
  return <div style={{display:'flex',justifyContent:'center',padding:'40px 0'}}>
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={T.accent}
      strokeWidth="2.5" strokeLinecap="round" style={{animation:'bsSpin 1s linear infinite'}}>
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
    </svg>
  </div>;
}
function ConfirmDialog({title,message,confirmLabel,confirmColor='#FF3B30',onConfirm,onCancel,requireText,requirePlaceholder,T}) {
  const[text,setText]=useState('');
  const canConfirm=!requireText||text.trim().length>0;
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',zIndex:2000,
      display:'flex',alignItems:'flex-end',justifyContent:'center'}} onClick={onCancel}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.sheetBg,borderRadius:'20px 20px 0 0',
        padding:'24px 20px 36px',width:'100%',maxWidth:500,boxSizing:'border-box',
        animation:'bsSlideUp .28s cubic-bezier(0.32,0.72,0,1)'}}>
        <div style={{fontSize:18,fontWeight:700,color:T.text,marginBottom:8,fontFamily:'system-ui'}}>{title}</div>
        <div style={{fontSize:14,color:T.textMuted,marginBottom:16,fontFamily:'system-ui',lineHeight:1.5}}>{message}</div>
        {requireText&&<textarea value={text} onChange={e=>setText(e.target.value)}
          placeholder={requirePlaceholder||'Skriv förklaring...'} rows={3}
          style={{width:'100%',boxSizing:'border-box',background:T.cardElevated,
            border:`0.5px solid ${T.border}`,borderRadius:10,padding:'10px 12px',
            fontSize:16,color:T.text,fontFamily:'system-ui',resize:'none',outline:'none',marginBottom:14}}/>}
        <div style={{display:'flex',gap:10}}>
          <button onClick={onCancel} style={{flex:1,padding:'13px',borderRadius:12,
            border:`0.5px solid ${T.border}`,background:'none',color:T.text,
            fontSize:15,fontWeight:600,cursor:'pointer',fontFamily:'system-ui'}}>Avbryt</button>
          <button onClick={()=>canConfirm&&onConfirm(text)} disabled={!canConfirm} style={{flex:1,
            padding:'13px',borderRadius:12,border:'none',
            background:canConfirm?confirmColor:T.textTertiary,color:'#fff',
            fontSize:15,fontWeight:700,cursor:canConfirm?'pointer':'default',
            fontFamily:'system-ui'}}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
function Input({label,value,onChange,type='text',placeholder,required,T}) {
  return <div style={{display:'flex',flexDirection:'column',gap:5}}>
    <label style={{fontSize:12,fontWeight:600,color:T.textMuted,fontFamily:'system-ui',letterSpacing:'.3px'}}>
      {label}{required&&<span style={{color:T.error}}> *</span>}
    </label>
    <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
      onFocus={()=>_tabBarCallbacks.hide?.()}
      onBlur={()=>_tabBarCallbacks.show?.()}
      style={{background:T.card,border:`0.5px solid ${T.border}`,borderRadius:10,
        padding:'11px 14px',fontSize:16,color:T.text,fontFamily:'system-ui',
        outline:'none',width:'100%',boxSizing:'border-box'}}/>
  </div>;
}
function Textarea({label,value,onChange,placeholder,T}) {
  return <div style={{display:'flex',flexDirection:'column',gap:5}}>
    <label style={{fontSize:12,fontWeight:600,color:T.textMuted,fontFamily:'system-ui',letterSpacing:'.3px'}}>{label}</label>
    <textarea value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} rows={3}
      onFocus={()=>_tabBarCallbacks.hide?.()}
      onBlur={()=>_tabBarCallbacks.show?.()}
      style={{background:T.card,border:`0.5px solid ${T.border}`,borderRadius:10,
        padding:'11px 14px',fontSize:16,color:T.text,fontFamily:'system-ui',
        outline:'none',width:'100%',boxSizing:'border-box',resize:'vertical'}}/>
  </div>;
}

// ─── Today Chip ─────────────────────────────────────────────────────────────
function TodayChip({onPress,T}) {
  return <button onClick={onPress} style={{
    background:T.accentRed,color:'#fff',border:'none',borderRadius:20,
    padding:'6px 14px',fontSize:13,fontWeight:700,cursor:'pointer',
    fontFamily:'system-ui',WebkitTapHighlightColor:'transparent',
    boxShadow:'0 2px 8px rgba(255,59,48,0.35)',
    display:'flex',alignItems:'center',gap:5}}>
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round">
      <rect x="3" y="4" width="18" height="18" rx="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
      <line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
    Idag
  </button>;
}

// ─── Recurrence Picker (dropdown) ────────────────────────────────────────────
function RecurrencePicker({recurrence,onChange,endDate,onEndDateChange,defaultDate,T}) {
  const[showDP,setShowDP]=useState(false);
  const[pAnchor,setPAnchor]=useState(()=>endDate?parseISO(endDate):new Date());
  const today=new Date();today.setHours(0,0,0,0);
  const mg=useMemo(()=>getMonthGrid(pAnchor.getFullYear(),pAnchor.getMonth()),[pAnchor]);

  return <div style={{display:'flex',flexDirection:'column',gap:12}}>
    <div style={{display:'flex',flexDirection:'column',gap:6}}>
      <label style={{fontSize:12,fontWeight:600,color:T.textMuted,fontFamily:'system-ui',letterSpacing:'.3px'}}>UPPREPNING</label>
      <div style={{position:'relative'}}>
        <select
          value={recurrence.startsWith('custom') ? 'custom' : recurrence}
          onChange={e=>{
            const val = e.target.value;
            if(val === 'custom') {
              if(recurrence.startsWith('custom')) {
                // Keep existing custom days
                onChange(recurrence);
              } else {
                // Pre-select the weekday of the selected date as default
                const defaultDow = defaultDate
                  ? (new Date(defaultDate + 'T12:00:00').getDay() + 6) % 7 // 0=Mon..6=Sun
                  : -1;
                onChange(defaultDow >= 0 ? buildCustomRecurrence([defaultDow]) : 'custom:');
              }
            } else {
              onChange(val);
              onEndDateChange(null);
            }
          }}
          style={{width:'100%',padding:'11px 40px 11px 14px',background:T.card,
            border:`0.5px solid ${T.border}`,borderRadius:10,fontSize:16,color:T.text,
            fontFamily:'system-ui',appearance:'none',WebkitAppearance:'none',
            outline:'none',cursor:'pointer'}}>
          {RECUR_OPTIONS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <div style={{position:'absolute',right:12,top:'50%',transform:'translateY(-50%)',
          pointerEvents:'none',color:T.textMuted}}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </div>
      </div>
    </div>
    {recurrence.startsWith('custom')&&<div style={{display:'flex',flexDirection:'column',gap:8}}>
      <label style={{fontSize:12,fontWeight:600,color:T.textMuted,fontFamily:'system-ui',letterSpacing:'.3px'}}>VÄLJ DAGAR</label>
      <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
        {['Måndag','Tisdag','Onsdag','Torsdag','Fredag','Lördag','Söndag'].map((dayName,i)=>{
          const days=parseCustomDays(recurrence);
          const sel=days.includes(i);
          return <button key={i} type="button" onClick={e=>{
            e.preventDefault();e.stopPropagation();
            const cur=parseCustomDays(recurrence);
            const next=sel?cur.filter(d=>d!==i):[...cur,i];
            onChange(buildCustomRecurrence(next));
          }} style={{
            padding:'8px 12px',borderRadius:20,border:'none',cursor:'pointer',
            background:sel?'#24645d':'none',
            color:sel?'#fff':T.text,
            fontWeight:sel?700:500,fontSize:13,
            fontFamily:'system-ui',
            WebkitTapHighlightColor:'transparent',
            boxShadow:sel?'none':`inset 0 0 0 1.5px ${T.border}`,
            transition:'all .15s',
          }}>{dayName}</button>;
        })}
      </div>
    </div>}
    {recurrence!=='none'&&<div style={{display:'flex',flexDirection:'column',gap:8}}>
      <label style={{fontSize:12,fontWeight:600,color:T.textMuted,fontFamily:'system-ui',letterSpacing:'.3px'}}>SLUTDATUM (valfritt)</label>
      <div style={{display:'flex',gap:8}}>
        <button onClick={()=>{onEndDateChange(null);setShowDP(false);}}
          style={{padding:'7px 14px',borderRadius:20,
            border:`1px solid ${!endDate?T.accent:T.border}`,
            background:!endDate?`${T.accent}22`:'none',
            color:!endDate?T.accent:T.textMuted,
            fontSize:12,fontWeight:600,cursor:'pointer',WebkitTapHighlightColor:'transparent'}}>
          Inget slutdatum
        </button>
        <button onClick={()=>setShowDP(v=>!v)}
          style={{padding:'7px 14px',borderRadius:20,
            border:`1px solid ${endDate?T.accent:T.border}`,
            background:endDate?`${T.accent}22`:'none',
            color:endDate?T.accent:T.textMuted,
            fontSize:12,fontWeight:600,cursor:'pointer',WebkitTapHighlightColor:'transparent'}}>
          {endDate?isoToDisplay(endDate):'Välj datum'}
        </button>
      </div>
      {showDP&&<div style={{background:T.card,border:`0.5px solid ${T.border}`,borderRadius:14,padding:14}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
          <button onClick={()=>{const d=new Date(pAnchor);d.setMonth(d.getMonth()-1);setPAnchor(d);}}
            style={{width:32,height:32,borderRadius:8,border:`0.5px solid ${T.border}`,
              background:T.card,display:'flex',alignItems:'center',justifyContent:'center',
              cursor:'pointer',color:T.text}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
          <span style={{fontSize:13,fontWeight:700,color:T.text}}>{MONTHS_SV[pAnchor.getMonth()]} {pAnchor.getFullYear()}</span>
          <button onClick={()=>{const d=new Date(pAnchor);d.setMonth(d.getMonth()+1);setPAnchor(d);}}
            style={{width:32,height:32,borderRadius:8,border:`0.5px solid ${T.border}`,
              background:T.card,display:'flex',alignItems:'center',justifyContent:'center',
              cursor:'pointer',color:T.text}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:2,marginBottom:4}}>
          {DAYS_SV.map(d=><div key={d} style={{textAlign:'center',fontSize:9,fontWeight:700,color:T.textMuted}}>{d}</div>)}
        </div>
        {mg.map((row,ri)=>(<div key={ri} style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:2,marginBottom:2}}>
          {row.map((d,ci)=>{
            if(!d) return <div key={ci}/>;
            const past=d<today,isSel=endDate&&toISO(d)===endDate;
            return <button key={ci} onClick={()=>{if(past)return;onEndDateChange(toISO(d));setShowDP(false);}}
              style={{borderRadius:8,border:isSel?`2px solid ${T.accent}`:'1px solid transparent',
                background:isSel?`${T.accent}22`:'none',padding:'6px 2px',
                cursor:past?'default':'pointer',opacity:past?0.3:1,
                display:'flex',alignItems:'center',justifyContent:'center',
                WebkitTapHighlightColor:'transparent'}}>
              <span style={{fontSize:13,fontWeight:isSel?700:400,color:isSel?T.accent:T.text}}>{d.getDate()}</span>
            </button>;
          })}
        </div>))}
      </div>}
    </div>}
  </div>;
}

// ─── Year View ───────────────────────────────────────────────────────────────
function YearView({year,onSelectMonth,bookings,exceptions,T,onBack}) {
  const today=new Date();
  const scrollRef=useRef(null);

  useEffect(()=>{
    if(!scrollRef.current) return;
    const el=scrollRef.current.querySelector('[data-todaymonth="true"]');
    if(el) setTimeout(()=>el.scrollIntoView({behavior:'smooth',block:'center'}),200);
  },[]);

  const years=Array.from({length:5},(_,i)=>year+i);

  return <div style={{position:'fixed',inset:0,background:T.bg,zIndex:100,
    display:'flex',flexDirection:'column',
    animation:'bsYearIn 0.38s cubic-bezier(0.4,0,0.2,1)'}}>
    <div style={{paddingTop:'max(20px,env(safe-area-inset-top,0px))',
      padding:'max(20px,env(safe-area-inset-top,0px)) 20px 16px',
      background:T.bg,borderBottom:`0.5px solid ${T.separator}`,
      display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>
      <button onClick={onBack} style={{background:'none',border:'none',cursor:'pointer',
        color:T.accent,fontSize:17,fontFamily:'system-ui',padding:0,
        WebkitTapHighlightColor:'transparent'}}>Stäng</button>
      <span style={{fontSize:17,fontWeight:700,color:T.text,fontFamily:'system-ui'}}>{year}</span>
      <TodayChip onPress={()=>{
        const el=scrollRef.current?.querySelector('[data-todaymonth="true"]');
        if(el) el.scrollIntoView({behavior:'smooth',block:'center'});
        onSelectMonth(today.getFullYear(),today.getMonth());
      }} T={T}/>
    </div>
    <div ref={scrollRef} style={{flex:1,overflowY:'auto',padding:'0 16px 40px',WebkitOverflowScrolling:'touch'}}>
      {years.map(yr=>(
        <div key={yr}>
          <div style={{fontSize:28,fontWeight:700,color:T.text,fontFamily:'system-ui',
            letterSpacing:'-.5px',paddingTop:24,paddingBottom:12}}>{yr}</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20}}>
            {Array.from({length:12},(_,m)=>{
              const isCurrent=yr===today.getFullYear()&&m===today.getMonth();
              const grid=getMonthGrid(yr,m);
              const bookedDays=new Set();
              const wS=`${yr}-${String(m+1).padStart(2,'0')}-01`;
              const lastD=new Date(yr,m+1,0).getDate();
              const wE=`${yr}-${String(m+1).padStart(2,'0')}-${String(lastD).padStart(2,'0')}`;
              expandAll(bookings,exceptions,wS,wE).forEach(o=>{bookedDays.add(parseInt(o.date.split('-')[2]));});
              return <div key={m} data-todaymonth={isCurrent?'true':undefined}
                onClick={()=>onSelectMonth(yr,m)}
                style={{cursor:'pointer',WebkitTapHighlightColor:'transparent'}}>
                <div style={{fontSize:14,fontWeight:700,
                  color:isCurrent?T.accentRed:T.text,
                  fontFamily:'system-ui',marginBottom:6,letterSpacing:'-.2px'}}>
                  {MONTHS_SV[m]}
                </div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',marginBottom:2}}>
                  {DAYS_SV.map(d=><div key={d} style={{textAlign:'center',fontSize:8,
                    fontWeight:600,color:T.textMuted,fontFamily:'system-ui'}}>{d}</div>)}
                </div>
                {grid.map((row,ri)=>(<div key={ri} style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)'}}>
                  {row.map((d,ci)=>{
                    if(!d) return <div key={ci}/>;
                    const isT=d.getFullYear()===today.getFullYear()&&d.getMonth()===today.getMonth()&&d.getDate()===today.getDate();
                    const hasB=bookedDays.has(d.getDate());
                    return <div key={ci} style={{textAlign:'center',position:'relative',padding:'1px 0'}}>
                      <span style={{display:'inline-flex',alignItems:'center',justifyContent:'center',
                        width:20,height:20,borderRadius:'50%',
                        background:isT?T.accentRed:'none',
                        fontSize:10,fontWeight:isT?700:400,
                        color:isT?'#fff':T.text,fontFamily:'system-ui'}}>{d.getDate()}</span>
                      {hasB&&<div style={{width:3,height:3,borderRadius:'50%',
                        background:T.accent,margin:'0 auto',marginTop:-1}}/>}
                    </div>;
                  })}
                </div>))}
              </div>;
            })}
          </div>
        </div>
      ))}
    </div>
  </div>;
}

// ─── Calendar View ────────────────────────────────────────────────────────────
function CalendarView({bookings,exceptions,onSelectDate,isAdmin,selectedDate,T,onYearViewOpen}) {
  const today=new Date();today.setHours(0,0,0,0);
  const[anchor,setAnchor]=useState(()=>{
    if(selectedDate){const d=new Date(selectedDate);return new Date(d.getFullYear(),d.getMonth(),1);}
    return new Date(today.getFullYear(),today.getMonth(),1);
  });
  const[slideDir,setSlideDir]=useState(null);
  // incomingDir: direction the NEW title slides in from (opposite of outgoing)
  const[incomingDir,setIncomingDir]=useState(null);
  // displayAnchor lags behind anchor so the title can animate out before updating
  const[displayAnchor,setDisplayAnchor]=useState(anchor);
  const swipeRef=useRef(null);
  const navInProgressRef=useRef(false);
  const gridRef=useRef(null);

  // Register passive:false touchmove on the grid so preventDefault() works on iOS
  useEffect(()=>{
    const el=gridRef.current;
    if(!el) return;
    const onMove=e=>{
      if(!swipeRef.current) return;
      const dx=Math.abs(e.touches[0].clientX-swipeRef.current.x);
      const dy=Math.abs(e.touches[0].clientY-swipeRef.current.y);
      if(swipeRef.current.locked===null&&(dx>4||dy>4)){
        swipeRef.current.locked=dx>dy?'h':'v';
      }
      if(swipeRef.current.locked==='h') e.preventDefault();
    };
    el.addEventListener('touchmove',onMove,{passive:false});
    return()=>el.removeEventListener('touchmove',onMove);
  },[]);

  useEffect(()=>{
    if(selectedDate) {
      const next=new Date(selectedDate.getFullYear(),selectedDate.getMonth(),1);
      // Only animate if month actually changed
      if(next.getMonth()!==anchor.getMonth()||next.getFullYear()!==anchor.getFullYear()){
        const dir=next>anchor?'next':'prev';
        setSlideDir(dir);
        setIncomingDir(null);
        setAnchor(next);
        setTimeout(()=>{
          setIncomingDir(dir);
          setDisplayAnchor(next);
          setSlideDir(null);
          setTimeout(()=>setIncomingDir(null),400);
        },380);
      }
    }
  },[selectedDate]);// eslint-disable-line

  const navigate=dir=>{
    if(navInProgressRef.current) return;
    navInProgressRef.current=true;
    setSlideDir(dir);
    setIncomingDir(null); // clear incoming while outgoing plays
    const d=new Date(anchor);
    dir==='next'?d.setMonth(d.getMonth()+1):d.setMonth(d.getMonth()-1);
    setAnchor(d);
    // Auto-select: today if navigating to current month, else 1st of new month
    const newY=d.getFullYear(), newM=d.getMonth();
    const todayY=today.getFullYear(), todayM=today.getMonth();
    const autoDate = (newY===todayY && newM===todayM)
      ? new Date(today)
      : new Date(newY, newM, 1);
    autoDate.setHours(0,0,0,0);
    onSelectDate(autoDate);
    // Title slides out (380ms), then update displayAnchor and slide new title in
    setTimeout(()=>{
      setIncomingDir(dir); // new title slides in from the same direction
      setDisplayAnchor(d);
      setSlideDir(null);
      navInProgressRef.current=false;
      // Clear incoming after animation completes
      setTimeout(()=>setIncomingDir(null), 400);
    },380);
  };
  const handleSwipeStart=e=>{
    swipeRef.current={x:e.touches[0].clientX,y:e.touches[0].clientY,locked:null};
  };

  const handleSwipeEnd=e=>{
    if(!swipeRef.current) return;
    const dx=e.changedTouches[0].clientX-swipeRef.current.x;
    const dy=Math.abs(e.changedTouches[0].clientY-swipeRef.current.y);
    const wasHorizontal=swipeRef.current.locked==='h';
    swipeRef.current=null;
    if(!wasHorizontal||Math.abs(dx)<40||dy>60) return;
    if(dx<0) navigate('next'); else navigate('prev');
  };

  const monthGrid=useMemo(()=>getMonthGrid(anchor.getFullYear(),anchor.getMonth()),[anchor]);
  const isToday=d=>{if(!d)return false;const c=new Date(d);c.setHours(0,0,0,0);return c.getTime()===today.getTime();};
  const isSel=d=>{
    if(!d||!selectedDate) return false;
    const s=new Date(selectedDate);s.setHours(0,0,0,0);
    const c=new Date(d);c.setHours(0,0,0,0);
    return s.getTime()===c.getTime();
  };
  const isPast=d=>{if(!d)return false;const c=new Date(d);c.setHours(0,0,0,0);return c<today;};
  const hasB=d=>d&&hasBookingsOnDate(bookings,exceptions,toISO(d));

  return <div>
    <div style={{paddingLeft:20,paddingRight:20,paddingBottom:8}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:4}}>
        <button onClick={onYearViewOpen} style={{background:'none',border:'none',cursor:'pointer',
          display:'flex',alignItems:'center',gap:5,color:T.textMuted,
          fontFamily:'system-ui',padding:0,WebkitTapHighlightColor:'transparent'}}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke={T.textMuted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          <span style={{fontSize:16,fontWeight:500}}>{anchor.getFullYear()}</span>
        </button>
        <div style={{display:'flex',gap:8}}>
          {['prev','next'].map(dir=>(
            <button key={dir} onClick={()=>navigate(dir)}
              style={{width:32,height:32,borderRadius:'50%',border:'none',
                background:T.cardElevated,display:'flex',alignItems:'center',
                justifyContent:'center',cursor:'pointer',color:T.text,
                WebkitTapHighlightColor:'transparent'}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                {dir==='prev'?<polyline points="15 18 9 12 15 6"/>:<polyline points="9 18 15 12 9 6"/>}
              </svg>
            </button>
          ))}
        </div>
      </div>
      {/* Month title — slides out on navigate, new name slides in */}
      <div style={{overflow:'hidden',marginBottom:16,height:36}}>
        <div key={displayAnchor.getMonth()+'_'+displayAnchor.getFullYear()}
          style={{
            fontSize:32,fontWeight:700,color:T.text,fontFamily:'system-ui',
            letterSpacing:'-.8px',lineHeight:'36px',
            animation:slideDir
              ? slideDir==='next'
                ? 'bsTitleSlideLeft 0.38s cubic-bezier(0.4,0,0.2,1) forwards'
                : 'bsTitleSlideRight 0.38s cubic-bezier(0.4,0,0.2,1) forwards'
              : incomingDir
                ? incomingDir==='next'
                  ? 'bsTitleSlideInFromRight 0.38s cubic-bezier(0.4,0,0.2,1)'
                  : 'bsTitleSlideInFromLeft 0.38s cubic-bezier(0.4,0,0.2,1)'
                : 'none',
          }}>
          {MONTHS_SV[displayAnchor.getMonth()]}
        </div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',marginBottom:4}}>
        {DAYS_SV.map(d=><div key={d} style={{textAlign:'center',fontSize:12,fontWeight:600,
          color:T.textMuted,fontFamily:'system-ui',letterSpacing:'.5px'}}>{d}</div>)}
      </div>
    </div>
    <div ref={gridRef} onTouchStart={handleSwipeStart} onTouchEnd={handleSwipeEnd}
      style={{paddingLeft:8,paddingRight:8,
        animation:slideDir
          ? slideDir==='next'
            ? 'bsGridSlideLeft 0.38s cubic-bezier(0.4,0,0.2,1)'
            : 'bsGridSlideRight 0.38s cubic-bezier(0.4,0,0.2,1)'
          : 'none'}}>
      {monthGrid.map((row,ri)=>(
        <div key={ri} style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:2,marginBottom:2}}>
          {row.map((d,ci)=>{
            if(!d) return <div key={ci}/>;
            const tod=isToday(d),sel=isSel(d),past=isPast(d),hb=hasB(d);
            return <button key={ci}
              onClick={()=>{const c=new Date(d);c.setHours(0,0,0,0);onSelectDate(c);}}
              style={{borderRadius:10,border:'none',
                background:sel?T.calSelected:'none',
                padding:'6px 2px 5px',cursor:'pointer',
                opacity:past?0.45:1,
                display:'flex',flexDirection:'column',alignItems:'center',gap:2,
                WebkitTapHighlightColor:'transparent',transition:'background 0.15s'}}>
              <div style={{width:32,height:32,borderRadius:'50%',
                background:tod&&!sel?T.calToday:'none',
                display:'flex',alignItems:'center',justifyContent:'center'}}>
                <span style={{fontSize:16,fontWeight:tod?700:400,
                  color:sel?'#fff':tod?'#fff':T.text,fontFamily:'system-ui'}}>{d.getDate()}</span>
              </div>
              {hb&&<div style={{width:5,height:5,borderRadius:'50%',background:sel?'#fff':T.accent}}/>}
            </button>;
          })}
        </div>
      ))}
    </div>
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',
      paddingLeft:20,paddingRight:20,paddingTop:12,paddingBottom:4}}>
      <div style={{display:'flex',gap:12}}>
        {[[T.accent,'Bokad'],[T.calToday,'Idag']].map(([c,l])=>(
          <div key={l} style={{display:'flex',alignItems:'center',gap:4}}>
            <div style={{width:7,height:7,borderRadius:'50%',background:c}}/>
            <span style={{fontSize:11,color:T.textMuted,fontFamily:'system-ui'}}>{l}</span>
          </div>
        ))}
      </div>
      <TodayChip onPress={()=>{
        const c=new Date(today);
        const targetAnchor=new Date(today.getFullYear(),today.getMonth(),1);
        // Only animate if we're not already on the current month
        if(targetAnchor.getMonth()!==anchor.getMonth()||targetAnchor.getFullYear()!==anchor.getFullYear()){
          const dir=targetAnchor>anchor?'next':'prev';
          setSlideDir(dir);
          setIncomingDir(null);
          setAnchor(targetAnchor);
          setTimeout(()=>{
            setIncomingDir(dir);
            setDisplayAnchor(targetAnchor);
            setSlideDir(null);
            setTimeout(()=>setIncomingDir(null),400);
          },380);
        }
        onSelectDate(c);
      }} T={T}/>
    </div>
  </div>;
}

// ─── Day Panel ────────────────────────────────────────────────────────────────
// ─── DayPanelCard — swipe-left to reveal delete in activity list ──────────────
function DayPanelCard({occ, isOwn, isAdmin, onPress, onSwipeDelete, T}) {
  const [offsetX, setOffsetX] = React.useState(0);
  const [revealed, setRevealed] = React.useState(false);
  const startXRef = React.useRef(null);
  const startYRef = React.useRef(null);
  const axisRef = React.useRef(null);
  const canSwipe = !!onSwipeDelete && (occ.status==='approved'||occ.status==='edited'||occ.status==='pending');
  const REVEAL = 80;

  const onTouchStart = e => {
    startXRef.current = e.touches[0].clientX;
    startYRef.current = e.touches[0].clientY;
    axisRef.current = null;
  };
  const onTouchMove = e => {
    if (!startXRef.current) return;
    const dx = e.touches[0].clientX - startXRef.current;
    const dy = Math.abs(e.touches[0].clientY - startYRef.current);
    if (!axisRef.current) {
      axisRef.current = Math.abs(dx) > dy ? 'h' : 'v';
    }
    if (axisRef.current !== 'h') return;
    e.stopPropagation();
    const base = revealed ? -REVEAL : 0;
    const clamped = Math.max(-REVEAL, Math.min(0, base + dx));
    setOffsetX(clamped);
  };
  const onTouchEnd = () => {
    if (axisRef.current === 'h') {
      if (offsetX < -REVEAL / 2) { setOffsetX(-REVEAL); setRevealed(true); }
      else { setOffsetX(0); setRevealed(false); }
    }
    startXRef.current = null; axisRef.current = null;
  };

  const handleDelete = e => {
    e.stopPropagation();
    setOffsetX(0); setRevealed(false);
    onSwipeDelete?.();
  };

  const accentColor = occ.status==='approved'||occ.status==='edited' ? T.accent
    : occ.status==='pending'||occ.status==='edit_pending' ? T.warning : T.textMuted;

  return (
    <div style={{position:'relative', borderRadius:14, overflow:'hidden'}}>
      {/* Delete action revealed on swipe */}
      {canSwipe && <div style={{
        position:'absolute', right:0, top:0, bottom:0, width:REVEAL,
        background:T.error, borderRadius:'0 14px 14px 0',
        display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:3,
      }}>
        <button onClick={handleDelete}
          style={{background:'none',border:'none',cursor:'pointer',
            display:'flex',flexDirection:'column',alignItems:'center',gap:3,
            WebkitTapHighlightColor:'transparent',touchAction:'manipulation'}}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
            stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14H6L5 6"/>
            <path d="M10 11v6M14 11v6M9 6V4h6v2"/>
          </svg>
          <span style={{fontSize:10,fontWeight:700,color:'#fff'}}>Radera</span>
        </button>
      </div>}
      {/* Card content */}
      <div
        onTouchStart={canSwipe ? onTouchStart : undefined}
        onTouchMove={canSwipe ? onTouchMove : undefined}
        onTouchEnd={canSwipe ? onTouchEnd : undefined}
        onClick={axisRef.current === 'h' ? undefined : onPress}
        style={{
          background: T.card,
          border: `0.5px solid ${isOwn ? T.border : T.separator}`,
          borderRadius: 14, padding: '12px 14px',
          cursor: isOwn ? 'pointer' : 'default',
          WebkitTapHighlightColor: 'transparent',
          display: 'flex', alignItems: 'flex-start', gap: 12,
          opacity: isOwn ? 1 : 0.72,
          transform: `translateX(${offsetX}px)`,
          transition: startXRef.current ? 'none' : 'transform 0.22s cubic-bezier(0.4,0,0.2,1)',
          touchAction: canSwipe ? 'pan-y' : 'auto',
          position: 'relative', zIndex: 1,
        }}>
        <div style={{width:4, borderRadius:2, alignSelf:'stretch', flexShrink:0,
          background: accentColor}}/>
        <div style={{flex:1, minWidth:0}}>
          {/* Own booking or admin: show full details */}
          {(isOwn||isAdmin)&&<div style={{fontSize:15,fontWeight:600,color:T.text,fontFamily:'system-ui',marginBottom:2}}>{occ.activity}</div>}
          <div style={{fontSize:13,color:T.textMuted,fontFamily:'system-ui'}}>{occ.time_slot} · {fmtDuration(occ.duration_hours)}</div>
          {/* Admin sees name+phone for all bookings */}
          {isAdmin && <div style={{fontSize:12,color:T.textMuted,fontFamily:'system-ui',marginTop:2}}>
            {occ.name}{occ.phone ? ` · ${occ.phone}` : ''}
          </div>}
          {/* Non-admin own booking: show own notes */}
          {isOwn&&!isAdmin&&occ.notes && <div style={{fontSize:12,color:T.textMuted,fontFamily:'system-ui',marginTop:4,fontStyle:'italic'}}>{occ.notes}</div>}
          {/* Other user's booking: show only booker's name, no activity/notes */}
          {!isOwn && !isAdmin && <div style={{fontSize:12,color:T.textMuted,fontFamily:'system-ui',marginTop:2}}>
            {occ.name||'Annan bokning'}
          </div>}
        </div>
        <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:4}}>
          {/* Only own user and admin see status badge */}
          {(isOwn||isAdmin)&&<Badge status={occ.status}/>}
          {isOwn && !isAdmin && <div style={{fontSize:10,color:T.accent,fontWeight:600,fontFamily:'system-ui'}}>Din bokning</div>}
        </div>
      </div>
    </div>
  );
}

function DayPanel({date,bookings,exceptions,isAdmin,myBookingIds,onSelectBooking,onNewBooking,onSwipeDelete,dbLoading,T}) {
  const iso=toISO(date);
  const occs=useMemo(()=>{
    const raw=getOccurrencesForDate(bookings,exceptions,iso);
    return [...raw].sort((a,b)=>{
      const tA=a.time_slot?.split(/[-–]/)[0]?.trim()||'';
      const tB=b.time_slot?.split(/[-–]/)[0]?.trim()||'';
      return tA.localeCompare(tB);
    });
  },[bookings,exceptions,iso]);
  const today=new Date();today.setHours(0,0,0,0);
  const isToday=date.getTime()===today.getTime();
  // Skeleton shimmer for initial load
  const SkeletonRow=({isDark})=>(
    <div style={{height:68,borderRadius:14,marginBottom:8,
      background:isDark?'#1C1C1E':'#F2F2F7',overflow:'hidden',position:'relative'}}>
      <div style={{position:'absolute',inset:0,
        background:isDark
          ?'linear-gradient(90deg,#1C1C1E 25%,#2C2C2E 50%,#1C1C1E 75%)'
          :'linear-gradient(90deg,#F2F2F7 25%,#E5E5EA 50%,#F2F2F7 75%)',
        backgroundSize:'400px 100%',
        animation:'bsShimmer 1.4s ease-in-out infinite'}}/>
    </div>
  );
  return <div style={{paddingLeft:20,paddingRight:20,paddingTop:8}}>
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
      <div style={{display:'flex',alignItems:'center',gap:8}}>
        <div style={{width:34,height:34,borderRadius:'50%',
          background:isToday?T.calToday:'none',
          display:'flex',alignItems:'center',justifyContent:'center'}}>
          <span style={{fontSize:18,fontWeight:700,color:isToday?'#fff':T.text,fontFamily:'system-ui'}}>
            {date.getDate()}
          </span>
        </div>
        <div>
          <div style={{fontSize:15,fontWeight:600,color:T.text,fontFamily:'system-ui'}}>
            {DAYS_FULL[(date.getDay()+6)%7]}
          </div>
          <div style={{fontSize:12,color:T.textMuted,fontFamily:'system-ui'}}>
            {MONTHS_SV[date.getMonth()]} {date.getFullYear()}
          </div>
        </div>
      </div>
      {(()=>{
        const isPastDate=date<today;
        return <button
          onClick={()=>{if(!isPastDate)onNewBooking(date);}}
          disabled={isPastDate}
          title={isPastDate?'Kan inte boka passerade datum':'Ny bokning'}
          style={{width:36,height:36,borderRadius:'50%',border:'none',
            background:isPastDate?T.cardElevated:T.accent,
            color:isPastDate?T.textMuted:'#fff',
            display:'flex',alignItems:'center',justifyContent:'center',
            cursor:isPastDate?'default':'pointer',
            WebkitTapHighlightColor:'transparent',
            boxShadow:isPastDate?'none':`0 2px 10px ${T.accentGlow}`,
            transition:'background 0.2s, box-shadow 0.2s',
          }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </button>;
      })()}
    </div>
    {dbLoading&&occs.length===0?(
      <div style={{marginTop:4}}>
        <style>{`@keyframes bsShimmer{0%{background-position:-400px 0}100%{background-position:400px 0}}`}</style>
        {[1,2].map(i=>(
          <div key={i} style={{height:68,borderRadius:14,marginBottom:8,overflow:'hidden',position:'relative',
            background:T.isDark?'#1C1C1E':'#F2F2F7'}}>
            <div style={{position:'absolute',inset:0,backgroundSize:'400px 100%',animation:'bsShimmer 1.4s ease-in-out infinite',
              background:T.isDark
                ?'linear-gradient(90deg,#1C1C1E 25%,#2C2C2E 50%,#1C1C1E 75%)'
                :'linear-gradient(90deg,#F2F2F7 25%,#E5E5EA 50%,#F2F2F7 75%)'}}/>
          </div>
        ))}
      </div>
    ):occs.length===0?(
      <div style={{textAlign:'center',paddingTop:32,paddingBottom:20,
        fontSize:22,fontWeight:700,color:T.textMuted,fontFamily:'system-ui',
        letterSpacing:'-.3px'}}>Inga aktiviteter</div>
    ):(
      <div style={{display:'flex',flexDirection:'column',gap:8}}>
        {occs.map(o=>{
          // clickable if admin (all) or if it's user's own booking
          const isOwn=isAdmin||(myBookingIds&&myBookingIds.has(o.id));
          return (
          <DayPanelCard key={o.id+(o.date||'')}
            occ={o} isOwn={isOwn} isAdmin={isAdmin}
            onPress={()=>{ if(isOwn) onSelectBooking(o); }}
            onSwipeDelete={isOwn&&onSwipeDelete ? ()=>onSwipeDelete(o) : null}
            T={T}/>
          );
        })}
      </div>
    )}
  </div>;
}

// ─── Search Panel ─────────────────────────────────────────────────────────────
function SearchPanel({bookings,exceptions,onSelectBooking,onClose,T}) {
  const[query,setQuery]=useState('');
  const inputRef=useRef(null);
  useEffect(()=>{setTimeout(()=>inputRef.current?.focus(),100);},[]);
  const todayISO=toISO(new Date());

  // Deduplicate: one result per booking, not per occurrence.
  // Match against the booking fields directly — no expansion needed.
  const results=useMemo(()=>{
    if(!query.trim()) return[];
    const q=query.toLowerCase();
    return bookings
      .filter(b=>
        (b.name||'').toLowerCase().includes(q)||
        (b.activity||'').toLowerCase().includes(q)||
        (b.notes||'').toLowerCase().includes(q)||
        (b.time_slot||'').toLowerCase().includes(q)
      )
      .slice(0,30);
  },[query,bookings]);

  return <div style={{position:'fixed',inset:0,background:T.bg,zIndex:200,
    display:'flex',flexDirection:'column',animation:'bsSlideUp .25s cubic-bezier(0.32,0.72,0,1)'}}>
    <div style={{padding:'max(20px,env(safe-area-inset-top,0px)) 16px 0',background:T.bg}}>
      <div style={{display:'flex',gap:10,alignItems:'center',marginBottom:12}}>
        <div style={{flex:1,display:'flex',alignItems:'center',gap:8,
          background:T.card,borderRadius:12,padding:'10px 14px',border:`0.5px solid ${T.border}`}}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke={T.textMuted} strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
          </svg>
          <input ref={inputRef} value={query} onChange={e=>setQuery(e.target.value)}
            placeholder="Sök bokningar..."
            onFocus={()=>_tabBarCallbacks.hide?.()}
            onBlur={()=>_tabBarCallbacks.show?.()}
            style={{flex:1,background:'none',border:'none',outline:'none',
              fontSize:16,color:T.text,fontFamily:'system-ui'}}/>
          {query&&<button onClick={()=>setQuery('')}
            style={{background:'none',border:'none',color:T.textMuted,
              cursor:'pointer',padding:0,fontSize:18,lineHeight:1}}>×</button>}
        </div>
        <button onClick={onClose} style={{background:'none',border:'none',color:T.accent,
          cursor:'pointer',fontSize:17,fontFamily:'system-ui',
          WebkitTapHighlightColor:'transparent',padding:0}}>Avbryt</button>
      </div>
    </div>
    <div style={{flex:1,overflowY:'auto',overscrollBehavior:'contain',padding:'0 16px 40px'}}>
      {query&&results.length===0&&<div style={{textAlign:'center',padding:'40px 0',
        color:T.textMuted,fontSize:14,fontFamily:'system-ui'}}>Inga resultat för "{query}"</div>}
      {results.map((b)=>{
        const isRecur=b.recurrence&&b.recurrence!=='none';
        // Next upcoming occurrence for display date
        const wEnd=toISO(new Date(new Date().setFullYear(new Date().getFullYear()+5)));
        const nextOcc=isRecur?expandBooking(b,todayISO,wEnd,exceptions)[0]:null;
        const displayDate=nextOcc?.date||b.start_date;
        return (
          <div key={b.id} onClick={()=>onSelectBooking(b)}
            style={{background:T.card,border:`0.5px solid ${T.border}`,borderRadius:14,
              padding:'12px 14px',marginBottom:8,cursor:'pointer',WebkitTapHighlightColor:'transparent'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6}}>
              <div style={{fontSize:15,fontWeight:700,color:T.text,fontFamily:'system-ui',flex:1,marginRight:8}}>{b.activity}</div>
              <Badge status={b.status}/>
            </div>
            {isRecur&&(
              <div style={{marginBottom:5}}>
                <RecurBadge recurrence={b.recurrence}/>
              </div>
            )}
            <div style={{fontSize:13,color:T.textMuted,fontFamily:'system-ui'}}>
              {isRecur?'Nästa: ':''}{isoToDisplay(displayDate)} · {b.time_slot}
            </div>
            {b.end_date&&<div style={{fontSize:11,color:T.textMuted,fontFamily:'system-ui',marginTop:2}}>
              Slutar {isoToDisplay(b.end_date)}
            </div>}
            {!b.end_date&&isRecur&&<div style={{fontSize:11,color:T.textMuted,fontFamily:'system-ui',marginTop:2}}>
              Inget slutdatum
            </div>}
            {b.name&&<div style={{fontSize:12,color:T.textMuted,fontFamily:'system-ui',marginTop:3}}>{b.name}</div>}
            {b.notes&&<div style={{fontSize:12,color:T.textMuted,fontFamily:'system-ui',marginTop:2,fontStyle:'italic'}}>{b.notes}</div>}
          </div>
        );
      })}
    </div>
  </div>;
}

// ─── Booking Form ──────────────────────────────────────────────────────────────
function BookingForm({date,onSubmit,onBack,loading,bookings,exceptions,T}) {
  const userName=localStorage.getItem(STORAGE_USER_NAME)||'';
  const userPhone=localStorage.getItem(STORAGE_PHONE)||'';
  const iso=toISO(date);
  const[allDay,setAllDay]=useState(false);
  const[startH,setStartH]=useState(OPEN_HOUR);
  const[startM,setStartM]=useState(0);
  const[endH,setEndH]=useState(OPEN_HOUR+1);
  const[endM,setEndM]=useState(0);
  const[activity,setActivity]=useState('');
  const[notes,setNotes]=useState('');
  const[recurrence,setRecurrence]=useState('none');
  const[endDate,setEndDate]=useState(null);
  const[error,setError]=useState('');
  const[conflicts,setConflicts]=useState(null);

  const bookedBlocks=useMemo(()=>getBookedBlocks(bookings,exceptions,iso),[bookings,exceptions,iso]);
  const durationHours=allDay?16:(endH+endM/60-startH-startM/60);
  const slot=allDay?fmtTime(OPEN_HOUR,0)+'–'+fmtTime(0,0):slotFromHM(startH,startM,endH===CLOSE_HOUR?0:endH,endM);

  const findConflicts=()=>{
    if(recurrence==='none') return[];
    const wEnd=endDate||(()=>{const d=new Date(date);d.setFullYear(d.getFullYear()+2);return toISO(d);})();
    const tempB={id:'__prev__',start_date:iso,end_date:endDate||null,
      recurrence,time_slot:slot,duration_hours:durationHours,status:'pending'};
    const occs=expandBooking(tempB,iso,wEnd,[]);
    const found=[];
    const sd=startH+startM/60;
    for(const occ of occs) {
      const bb=getBookedBlocks(bookings,exceptions,occ.date);
      let clash=false;
      for(let i=0;i<durationHours*2;i++){if(bb.has(sd*2+i)){clash=true;break;}}
      if(clash) found.push({date:occ.date,time_slot:slot});
    }
    return found;
  };

  // Check if the single selected date/time conflicts
  const hasSingleConflict=useMemo(()=>{
    if(allDay) return false;
    const sd=startH+startM/60;
    for(let i=0;i<durationHours*2;i++){if(bookedBlocks.has(sd*2+i)) return true;}
    return false;
  },[bookedBlocks,startH,startM,durationHours,allDay]);

  const handleSubmit=()=>{
    if(!activity.trim()){setError('Ange en aktivitet.');return;}
    if(!allDay&&durationHours<=0){setError('Sluttid måste vara efter starttid.');return;}
    if(recurrence.startsWith('custom:')&&parseCustomDays(recurrence).length===0){
      setError('Välj minst en dag för anpassad upprepning.');return;
    }
    // Block single-date conflicts completely
    if(hasSingleConflict){setError('Denna tid är upptagen — välj en annan tid.');return;}
    if(recurrence!=='none'){const f=findConflicts();if(f.length>0){setConflicts(f);return;}}
    onSubmit({name:userName,phone:userPhone,activity,notes,date:iso,
      time_slot:slot,duration_hours:durationHours,recurrence,end_date:endDate,skip_dates:[]});
  };

  const handleBookAvailable=()=>{
    if(!conflicts) return;
    onSubmit({name:userName,phone:userPhone,activity,notes,date:iso,
      time_slot:slot,duration_hours:durationHours,recurrence,end_date:endDate,
      skip_dates:conflicts.map(c=>c.date)});
    setConflicts(null);
  };

  return <div style={{paddingTop:'max(20px,env(safe-area-inset-top,0px))',
    paddingLeft:16,paddingRight:16,paddingBottom:40,fontFamily:'system-ui'}}>
    {onBack&&<BackButton onBack={onBack} T={T}/>}
    <div style={{marginTop:16,marginBottom:20}}>
      <div style={{fontSize:26,fontWeight:700,color:T.text,letterSpacing:'-.5px',marginBottom:8}}>Ny aktivitet</div>
      <div style={{fontSize:14,color:T.textMuted}}>{DAYS_FULL[(date.getDay()+6)%7]}, {isoToDisplay(iso)}</div>
    </div>
    <div style={{display:'flex',alignItems:'center',gap:10,background:T.card,
      border:`0.5px solid ${T.border}`,borderRadius:12,padding:'12px 14px',marginBottom:16}}>
      <div style={{width:34,height:34,borderRadius:'50%',background:`${T.accent}22`,
        display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.accent}
          strokeWidth="2" strokeLinecap="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
        </svg>
      </div>
      <div>
        <div style={{fontSize:14,fontWeight:600,color:T.text}}>{userName}</div>
        <div style={{fontSize:12,color:T.textMuted}}>{userPhone}</div>
      </div>
    </div>
    <div style={{display:'flex',flexDirection:'column',gap:14}}>
      <Input label="AKTIVITET" value={activity} onChange={setActivity} placeholder="Vad är aktiviteten?" required T={T}/>
      <div style={{background:T.card,border:`0.5px solid ${T.border}`,borderRadius:12,overflow:'hidden'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',
          padding:'13px 16px',borderBottom:allDay?'none':`0.5px solid ${T.separator}`}}>
          <span style={{fontSize:16,color:T.text}}>Heldag</span>
          <IOSToggle value={allDay} onChange={setAllDay} T={T}/>
        </div>
        {!allDay&&<>
          <TimeAccordion label="Startar" hour={startH} minute={startM}
            onConfirm={(h,m)=>{setStartH(h);setStartM(m);
              if(endH+endM/60<=h+m/60){setEndH(Math.min(h+1,CLOSE_HOUR));setEndM(0);}}}
            bookedBlocks={bookedBlocks} isStart={true} pairedHour={startH} pairedMinute={startM} T={T}/>
          <div style={{height:'0.5px',background:T.separator}}/>
          <TimeAccordion label="Slutar" hour={endH} minute={endM}
            onConfirm={(h,m)=>{setEndH(h);setEndM(m);}}
            bookedBlocks={bookedBlocks} isStart={false} pairedHour={startH} pairedMinute={startM} T={T}/>
        </>}
      </div>
      <div style={{background:T.card,border:`0.5px solid ${T.border}`,borderRadius:12,padding:14}}>
        <RecurrencePicker recurrence={recurrence} onChange={r=>{setRecurrence(r);setEndDate(null);}}
          endDate={endDate} onEndDateChange={setEndDate} defaultDate={iso} T={T}/>
      </div>
      <Textarea label="ANTECKNINGAR" value={notes} onChange={setNotes}
        placeholder="Lägg till anteckningar..." T={T}/>
      {error&&<div style={{fontSize:13,color:T.error,background:`${T.error}18`,
        padding:'10px 14px',borderRadius:8}}>{error}</div>}
      <button onClick={handleSubmit} disabled={loading||hasSingleConflict}
        title={hasSingleConflict?'Denna tid är upptagen — välj en annan tid':''}
        style={{background:loading||hasSingleConflict?T.textTertiary:T.accent,color:'#fff',border:'none',
          borderRadius:12,padding:'15px',fontSize:16,fontWeight:700,
          cursor:loading||hasSingleConflict?'not-allowed':'pointer',WebkitTapHighlightColor:'transparent',
          display:'flex',alignItems:'center',justifyContent:'center',gap:8,
          opacity:hasSingleConflict?0.5:1,transition:'opacity .2s,background .2s'}}>
        {hasSingleConflict?'Tiden är upptagen':loading?'Skickar...':'Skicka bokningsförfrågan'}
      </button>
      <p style={{fontSize:11,color:T.textMuted,textAlign:'center',margin:0}}>
        Din förfrågan granskas av en administratör.
      </p>
    </div>
    {conflicts&&<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',zIndex:2000,
      display:'flex',alignItems:'flex-end',justifyContent:'center',touchAction:'none'}} onClick={()=>setConflicts(null)}>
      <HideTabBar/>
      <div onClick={e=>e.stopPropagation()} style={{
        background:T.sheetBg,borderRadius:'20px 20px 0 0',
        padding:'24px 20px 36px',width:'100%',maxWidth:500,boxSizing:'border-box',
        animation:'bsSlideUp .25s cubic-bezier(0.32,0.72,0,1)',maxHeight:'80vh',overflowY:'auto'}}>
        <div style={{fontSize:17,fontWeight:700,color:T.text,marginBottom:8}}>Tidskonflikter hittades</div>
        <div style={{fontSize:13,color:T.textMuted,marginBottom:16}}>{conflicts.length} tillfällen krockar.</div>
        <div style={{maxHeight:200,overflowY:'auto',marginBottom:16,display:'flex',flexDirection:'column',gap:6}}>
          {conflicts.map((c,i)=><div key={i} style={{background:`${T.warning}18`,
            border:`1px solid ${T.warning}33`,borderRadius:10,padding:'8px 12px'}}>
            <div style={{fontSize:13,fontWeight:600,color:T.text}}>{isoToDisplay(c.date)} · {c.time_slot}</div>
          </div>)}
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:10}}>
          <button onClick={()=>setConflicts(null)} style={{padding:'13px',borderRadius:12,
            border:`1px solid ${T.accent}`,background:'none',color:T.accent,
            fontSize:14,fontWeight:700,cursor:'pointer'}}>← Ändra tid</button>
          <button onClick={handleBookAvailable} disabled={loading} style={{padding:'13px',borderRadius:12,
            border:'none',background:T.accent,color:'#fff',fontSize:14,fontWeight:700,cursor:'pointer'}}>
            {loading?'Skickar...':'Boka bara lediga tillfällen →'}
          </button>
        </div>
      </div>
    </div>}
  </div>;
}

// ─── CancelledOccurrencesList ─────────────────────────────────────────────────
// Shows admin-cancelled individual occurrences from booking_exceptions
// Used in both MyBookings detail and BookingDetailSheet
function CancelledOccurrencesList({bookingId, exceptions, timeSlot, T}) {
  const adminCancelled = useMemo(() => {
    return exceptions
      .filter(e =>
        e.booking_id === bookingId &&
        e.type === 'skip' &&
        e.admin_comment &&
        e.admin_comment.trim().length > 0
      )
      .sort((a, b) => a.exception_date.localeCompare(b.exception_date));
  }, [bookingId, exceptions]);

  if (adminCancelled.length === 0) return null;

  return (
    <div style={{
      background: `${T.error}0d`,
      border: `1px solid ${T.error}33`,
      borderRadius: 14, padding: 14, marginBottom: 12,
    }}>
      <div style={{
        fontSize: 11, fontWeight: 700, color: T.error,
        letterSpacing: '.6px', marginBottom: 10,
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
          stroke={T.error} strokeWidth="2.5" strokeLinecap="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        INSTÄLLDA TILLFÄLLEN ({adminCancelled.length})
      </div>
      {adminCancelled.map((exc, i) => {
        // Extract just the explanation after "Avbokad av Name: "
        const comment = exc.admin_comment || '';
        const colonIdx = comment.indexOf(': ');
        const reason = colonIdx !== -1 ? comment.slice(colonIdx + 2) : comment;
        return (
          <div key={exc.exception_date}
            style={{
              paddingTop: 10, paddingBottom: 10,
              borderBottom: i < adminCancelled.length - 1
                ? `0.5px solid ${T.error}22` : 'none',
            }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>
                {isoToDisplay(exc.exception_date)}
              </div>
              <div style={{ fontSize: 11, color: T.error, fontWeight: 600,
                background: `${T.error}18`, borderRadius: 6, padding: '2px 7px' }}>
                Inställd
              </div>
            </div>
            <div style={{ fontSize: 12, color: T.textMuted, marginBottom: reason ? 4 : 0 }}>
              {timeSlot}
            </div>
            {reason && (
              <div style={{ fontSize: 12, color: T.textMuted, fontStyle: 'italic' }}>
                "{reason}"
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── My Bookings ──────────────────────────────────────────────────────────────
function MyBookings({bookings,exceptions,loading,onBack,onCancel,onCancelFromDate,onCancelSeries,highlightBookingId,highlightBooking,highlightFilter,onLogout,T}) {
  // If a specific booking object is passed directly, open its detail immediately
  const[selectedId,setSelectedId]=useState(()=>highlightBooking?.id||null);
  const[deleteSheet,setDeleteSheet]=useState(null);
  const[cancelReason,setCancelReason]=useState('');
  const[cancelReasonError,setCancelReasonError]=useState(false);
  const[dsKbOffset,setDsKbOffset]=useState(0);

  // Track keyboard height for deleteSheet positioning
  useEffect(()=>{
    if(!deleteSheet) return;
    const vv=window.visualViewport;
    if(!vv) return;
    const upd=()=>setDsKbOffset(Math.max(0,window.innerHeight-vv.height-vv.offsetTop));
    vv.addEventListener('resize',upd); vv.addEventListener('scroll',upd);
    upd();
    return()=>{vv.removeEventListener('resize',upd); vv.removeEventListener('scroll',upd); setDsKbOffset(0);};
  },[deleteSheet]);
  const[filter,setFilter]=useState(highlightFilter||'all');
  const highlightRef=useRef(null);
  const today=toISO(new Date());
  const wEnd=toISO(new Date(new Date().setFullYear(new Date().getFullYear()+2)));

  const selected=useMemo(()=>selectedId?(bookings.find(b=>b.id===selectedId)||highlightBooking||null):null,[selectedId,bookings,highlightBooking]);// eslint-disable-line

  useEffect(()=>{if(highlightFilter)setFilter(highlightFilter);},[highlightFilter]);
  useEffect(()=>{
    // If a booking object was passed directly (from BookingDetailSheet "Se alla detaljer"),
    // selectedId is already set via useState initializer — no need to find it.
    if(highlightBooking) return;
    if(highlightBookingId){
      const target=bookings.find(b=>b.id===highlightBookingId);
      if(target){
        setSelectedId(target.id);
      } else if(highlightRef.current){
        setTimeout(()=>{
          highlightRef.current?.scrollIntoView({behavior:'smooth',block:'center'});
          if(navigator.vibrate) navigator.vibrate([60,40,60,40,120]);
        },350);
      }
    }
  },[highlightBookingId,highlightBooking,filter,bookings]);// eslint-disable-line

  const FILTERS=[{id:'all',label:'Alla'},{id:'pending',label:'Väntar'},{id:'approved',label:'Godkända'},{id:'cancelled',label:'Inställda'}];
  const counts={
    all:bookings.length,
    pending:bookings.filter(b=>b.status==='pending'||b.status==='edit_pending').length,
    approved:bookings.filter(b=>b.status==='approved'||b.status==='edited').length,
    cancelled:bookings.filter(b=>b.status==='cancelled'||b.status==='rejected').length,
  };
  const sorted=useMemo(()=>{
    const all=bookings.slice().sort((a,b)=>(b.created_at||0)-(a.created_at||0));
    if(filter==='all') return all;
    if(filter==='pending') return all.filter(b=>b.status==='pending'||b.status==='edit_pending');
    if(filter==='approved') return all.filter(b=>b.status==='approved'||b.status==='edited');
    if(filter==='cancelled') return all.filter(b=>b.status==='cancelled'||b.status==='rejected');
    return all;
  },[bookings,filter]);

  const [upcomingLimit,setUpcomingLimit]=useState(10);

  if(selected) {
    const b=selected;
    const isRecur=b.recurrence&&b.recurrence!=='none';
    const allUpcoming=isRecur?expandBooking(b,today,wEnd,exceptions):[];
    const upcoming=isRecur?allUpcoming.slice(0,upcomingLimit):[{...b,date:b.start_date}];
    return <div style={{paddingTop:'max(20px,env(safe-area-inset-top,0px))',
      paddingLeft:16,paddingRight:16,
      paddingBottom:'max(120px,calc(env(safe-area-inset-bottom,0px) + 110px))',
      fontFamily:'system-ui',overscrollBehavior:'contain'}}>
      <BackButton onBack={()=>setSelectedId(null)} T={T}/>
      <div style={{fontSize:20,fontWeight:700,color:T.text,marginTop:16,marginBottom:16}}>Bokningsdetaljer</div>
      <div style={{background:T.card,border:`0.5px solid ${T.border}`,borderRadius:16,padding:16,marginBottom:12}}>
        <div style={{display:'flex',gap:8,marginBottom:12}}>
          <Badge status={b.status}/>
          {isRecur&&<RecurBadge recurrence={b.recurrence}/>}
        </div>
        {[['Aktivitet',b.activity],['Tid',b.time_slot],['Längd',fmtDuration(b.duration_hours)],
          ['Startdatum',isoToDisplay(b.start_date)],['Upprepning',fmtRecur(b.recurrence)]
        ].map(([l,v])=><div key={l} style={{marginBottom:10,paddingBottom:10,borderBottom:`0.5px solid ${T.separator}`}}>
          <div style={{fontSize:10,fontWeight:700,color:T.textMuted,letterSpacing:'.5px',marginBottom:2}}>{l.toUpperCase()}</div>
          <div style={{fontSize:14,color:T.text}}>{v}</div>
        </div>)}
        {b.notes&&<div style={{marginBottom:10,paddingBottom:10,borderBottom:`0.5px solid ${T.separator}`}}>
          <div style={{fontSize:10,fontWeight:700,color:T.textMuted,letterSpacing:'.5px',marginBottom:2}}>ANTECKNINGAR</div>
          <div style={{fontSize:14,color:T.text}}>{b.notes}</div>
        </div>}
        {b.end_date&&<div style={{marginBottom:10,paddingBottom:10,borderBottom:`0.5px solid ${T.separator}`}}>
          <div style={{fontSize:10,fontWeight:700,color:T.textMuted,letterSpacing:'.5px',marginBottom:2}}>SLUTDATUM</div>
          <div style={{fontSize:14,color:T.text}}>{isoToDisplay(b.end_date)}</div>
        </div>}
        {b.admin_comment&&(!b.admin_comment.startsWith('Avbokad av ')||b.status==='cancelled'||b.status==='rejected')&&(!isRecur||b.status==='cancelled'||b.status==='rejected')&&<div style={{padding:'8px 10px',background:`${T.accent}11`,borderRadius:8}}>
          <div style={{fontSize:10,fontWeight:700,color:T.textMuted,letterSpacing:'.5px',marginBottom:2}}>KOMMENTAR FRÅN ADMIN</div>
          <div style={{fontSize:13,color:T.text}}>{b.admin_comment}</div>
        </div>}
      </div>
      {isRecur&&upcoming.length>0&&<div style={{background:T.card,border:'1px solid #8b5cf644',
        borderRadius:14,padding:14,marginBottom:12}}>
        <div style={{fontSize:11,fontWeight:700,color:'#8b5cf6',letterSpacing:'.5px',marginBottom:10}}>
          KOMMANDE TILLFÄLLEN
        </div>
        {upcoming.map((occ,i)=><div key={i} style={{display:'flex',alignItems:'center',
          justifyContent:'space-between',padding:'8px 0',
          borderBottom:i<upcoming.length-1||upcomingLimit<allUpcoming.length?`0.5px solid ${T.separator}`:'none'}}>
          <div>
            <div style={{fontSize:13,fontWeight:600,color:T.text}}>{isoToDisplay(occ.date)}</div>
            <div style={{fontSize:11,color:T.textMuted}}>{occ.time_slot}</div>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:6}}>
            <Badge status={occ.status||b.status}/>
            <button onClick={()=>setDeleteSheet({booking:b,occurrence_date:occ.date})}
              style={{background:'none',border:`1px solid ${T.error}44`,borderRadius:8,
                padding:'4px 10px',cursor:'pointer',color:T.error,
                fontSize:12,fontWeight:600,WebkitTapHighlightColor:'transparent',
                touchAction:'manipulation'}}>Radera</button>
          </div>
        </div>)}
        {isRecur&&upcomingLimit<allUpcoming.length&&(
          <button onClick={()=>setUpcomingLimit(l=>l+20)}
            style={{width:'100%',marginTop:8,padding:'10px',borderRadius:10,
              border:`0.5px solid ${'#8b5cf6'}44`,background:`${'#8b5cf6'}11`,
              color:'#8b5cf6',fontSize:13,fontWeight:700,cursor:'pointer',
              WebkitTapHighlightColor:'transparent',touchAction:'manipulation'}}>
            Visa mer ({allUpcoming.length-upcomingLimit} kvar)
          </button>
        )}
      </div>}
      {/* Inställda tillfällen — admin-borttagna enstaka dagar med kommentar */}
      {isRecur&&<CancelledOccurrencesList
        bookingId={b.id} exceptions={exceptions} timeSlot={b.time_slot} T={T}/>}
      <div style={{display:'flex',flexDirection:'column',gap:8}}>
        {(b.status==='cancelled'||b.status==='rejected')?(
          <div style={{padding:'10px 12px',background:`${T.accent}0d`,borderRadius:10,
            fontSize:13,color:T.textMuted}}>
            {b.status==='rejected'?'Din bokning avböjdes av admin.':'Bokningen ställdes in.'}
          </div>
        ):isRecur?(
          <button onClick={()=>setDeleteSheet({booking:b,occurrence_date:b.start_date,deleteAll:true})}
            style={{padding:'13px',borderRadius:12,border:`1px solid ${T.error}33`,
              background:`${T.error}11`,color:T.error,fontSize:14,fontWeight:700,
              cursor:'pointer',textAlign:'left',WebkitTapHighlightColor:'transparent'}}>
            Radera hela serien
          </button>
        ):(
          <button onClick={()=>setDeleteSheet({booking:b,occurrence_date:b.start_date})}
            style={{padding:'13px',borderRadius:12,border:`1px solid ${T.error}33`,
              background:`${T.error}11`,color:T.error,fontSize:14,fontWeight:700,
              cursor:'pointer',WebkitTapHighlightColor:'transparent'}}>
            Radera bokning
          </button>
        )}
      </div>
      {deleteSheet&&<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:1000,
          display:'flex',alignItems:'flex-end',justifyContent:'center',touchAction:'none'}}
        onClick={()=>{setDeleteSheet(null);setCancelReason('');setCancelReasonError(false);}}>
        <HideTabBar/>
        <div onClick={e=>e.stopPropagation()} style={{background:T.sheetBg,borderRadius:'20px 20px 0 0',
          padding:'24px 20px 36px',width:'100%',maxWidth:500,boxSizing:'border-box',
          position:'relative',bottom:dsKbOffset,
          animation:'bsSlideUp .25s cubic-bezier(0.32,0.72,0,1)'}}>
            <div style={{fontSize:16,fontWeight:700,color:T.text,marginBottom:4}}>
              Radera bokning
            </div>
            <div style={{fontSize:13,color:T.textMuted,marginBottom:12}}>
              {isoToDisplay(deleteSheet.occurrence_date)} · {deleteSheet.booking.time_slot}{deleteSheet.booking.duration_hours?' · '+fmtDuration(deleteSheet.booking.duration_hours):''}
            </div>
          <textarea value={cancelReason}
            onChange={e=>{setCancelReason(e.target.value);setCancelReasonError(false);}}
            placeholder="Anledning (obligatorisk)" rows={3}
            onFocus={()=>_tabBarCallbacks.hide?.()}
            onBlur={()=>_tabBarCallbacks.show?.()}
            style={{width:'100%',boxSizing:'border-box',background:T.cardElevated,
              border:`0.5px solid ${cancelReasonError?T.error:T.border}`,
              borderRadius:10,padding:'10px 12px',fontSize:16,color:T.text,
              fontFamily:'system-ui',resize:'none',outline:'none',marginBottom:14}}/>
          {cancelReasonError&&<div style={{color:T.error,fontSize:12,marginBottom:10}}>Anledning krävs.</div>}
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            {!deleteSheet.deleteAll&&(()=>{
              const isR=deleteSheet.booking.recurrence&&deleteSheet.booking.recurrence!=='none';
              const uName=localStorage.getItem(STORAGE_USER_NAME)||'Besökaren';
              const getReason=()=>`Avbokad av ${uName}: ${cancelReason.trim()}`;
              const validate=fn=>{if(!cancelReason.trim()){setCancelReasonError(true);return;}fn();};
              return isR?<>
                <button onClick={()=>validate(()=>{setDeleteSheet(null);setCancelReason('');setCancelReasonError(false);onCancel(deleteSheet.booking,deleteSheet.occurrence_date,getReason());})}
                  style={{padding:'14px',borderRadius:12,border:`1px solid ${T.error}33`,background:`${T.error}11`,color:T.error,fontSize:14,fontWeight:700,cursor:'pointer',textAlign:'left',WebkitTapHighlightColor:'transparent'}}>
                  Radera bara detta tillfälle
                </button>
                <button onClick={()=>validate(()=>{setDeleteSheet(null);setCancelReason('');setCancelReasonError(false);onCancelFromDate(deleteSheet.booking,deleteSheet.occurrence_date,getReason());})}
                  style={{padding:'14px',borderRadius:12,border:`1px solid ${T.error}33`,background:`${T.error}11`,color:T.error,fontSize:14,fontWeight:700,cursor:'pointer',textAlign:'left',WebkitTapHighlightColor:'transparent'}}>
                  Radera detta och alla kommande
                </button>
              </>:<button onClick={()=>validate(()=>{setDeleteSheet(null);setCancelReason('');setCancelReasonError(false);onCancel(deleteSheet.booking,deleteSheet.occurrence_date,getReason());})}
                style={{padding:'14px',borderRadius:12,border:`1px solid ${T.error}33`,background:`${T.error}11`,color:T.error,fontSize:14,fontWeight:700,cursor:'pointer',WebkitTapHighlightColor:'transparent'}}>
                Radera bokning
              </button>;
            })()}
            {deleteSheet.deleteAll&&<button onClick={()=>{
              if(!cancelReason.trim()){setCancelReasonError(true);return;}
              const uName=localStorage.getItem(STORAGE_USER_NAME)||'Besökaren';
              const reason=`Avbokad av ${uName}: ${cancelReason.trim()}`;
              setDeleteSheet(null);setCancelReason('');setCancelReasonError(false);
              onCancelSeries(deleteSheet.booking,reason);
            }} style={{padding:'14px',borderRadius:12,border:`1px solid ${T.error}33`,background:`${T.error}11`,
              color:T.error,fontSize:14,fontWeight:700,cursor:'pointer',WebkitTapHighlightColor:'transparent'}}>
              Radera hela serien
            </button>}
            <button onClick={()=>{setDeleteSheet(null);setCancelReason('');setCancelReasonError(false);}}
              style={{padding:'13px',borderRadius:12,border:`0.5px solid ${T.border}`,
                background:'none',color:T.text,fontSize:14,fontWeight:600,
                cursor:'pointer',WebkitTapHighlightColor:'transparent'}}>Avbryt</button>
          </div>
        </div>
      </div>}
    </div>;
  }

  return <div style={{paddingTop:'max(20px,env(safe-area-inset-top,0px))',
    paddingLeft:16,paddingRight:16,
    paddingBottom:'max(100px,calc(env(safe-area-inset-bottom,0px) + 90px))',
    overscrollBehavior:'contain'}}>
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:0}}>
      <BackButton onBack={onBack} T={T}/>
      <button onClick={onLogout} style={{padding:'7px 14px',borderRadius:20,
        border:`1px solid ${T.error}33`,background:`${T.error}11`,color:T.error,
        fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'system-ui',
        WebkitTapHighlightColor:'transparent',display:'flex',alignItems:'center',gap:6}}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
          <polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
        Logga ut
      </button>
    </div>
    <div style={{fontSize:26,fontWeight:700,color:T.text,marginTop:16,marginBottom:12}}>Mina bokningar</div>
    <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:14}}>
      {FILTERS.map(f=><button key={f.id} onClick={()=>setFilter(f.id)}
        style={{padding:'6px 14px',borderRadius:20,
          border:`1px solid ${filter===f.id?T.accent:T.border}`,
          background:filter===f.id?`${T.accent}22`:'none',
          color:filter===f.id?T.accent:T.textMuted,
          fontSize:12,fontWeight:600,cursor:'pointer',
          fontFamily:'system-ui',WebkitTapHighlightColor:'transparent',
          display:'flex',alignItems:'center',gap:5}}>
        {f.label}
        {counts[f.id]>0&&<span style={{background:filter===f.id?T.accent:'#88888833',
          color:filter===f.id?'#fff':T.textMuted,borderRadius:8,fontSize:10,fontWeight:800,
          padding:'1px 6px'}}>{counts[f.id]}</span>}
      </button>)}
    </div>
    {loading&&<Spinner T={T}/>}
    {!loading&&sorted.length===0&&<div style={{textAlign:'center',padding:'40px 0',color:T.textMuted,fontSize:14}}>Inga bokningar.</div>}
    <div style={{display:'flex',flexDirection:'column',gap:10}}>
      {sorted.map(b=>{
        const isRecur=b.recurrence&&b.recurrence!=='none';
        const nextOcc=isRecur?expandBooking(b,today,wEnd,exceptions)[0]:null;
        const displayDate=nextOcc?.date||b.start_date;
        const isHL=b.id===highlightBookingId;
        const hlColor=(b.status==='cancelled'||b.status==='rejected')?T.accentBlue:T.accent;
        return <div key={b.id} ref={isHL?highlightRef:null}
          onClick={()=>setSelectedId(b.id)}
          style={{background:T.card,border:`0.5px solid ${isHL?hlColor:T.border}`,
            borderRadius:14,padding:'14px 16px',cursor:'pointer',
            boxShadow:isHL?`0 0 0 3px ${hlColor}44`:'none',
            animation:isHL?'bsHighlight 1.2s ease-in-out 3':'none','--hl':`${hlColor}55`}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <Badge status={b.status}/>
              {isRecur&&<RecurBadge recurrence={b.recurrence}/>}
            </div>
            <span style={{fontSize:11,color:T.textMuted}}>{isoToDisplay(displayDate)}</span>
          </div>
          <div style={{fontSize:15,fontWeight:600,color:T.text,marginBottom:4}}>{b.activity}</div>
          <div style={{fontSize:13,color:T.textMuted}}>{b.time_slot} · {fmtDuration(b.duration_hours)}</div>
          {b.admin_comment&&<div style={{marginTop:8,fontSize:12,color:T.textMuted,fontStyle:'italic'}}>
            "{b.admin_comment}"
          </div>}
        </div>;
      })}
    </div>
  </div>;
}

// ─── Admin Add Form ──────────────────────────────────────────────────────────
function AdminAddForm({bookings,exceptions,onSubmit,onClose,onOpenDetail,T}) {
  const today=new Date();today.setHours(0,0,0,0);
  // Calendar state
  const[showYearPicker,setShowYearPicker]=useState(false);
  const[yearPickerYear,setYearPickerYear]=useState(today.getFullYear());
  const[anchor,setAnchor]=useState(()=>new Date(today.getFullYear(),today.getMonth(),1));
  const[displayAnchor,setDisplayAnchor]=useState(()=>new Date(today.getFullYear(),today.getMonth(),1));
  const[slideDir,setSlideDir]=useState(null);
  const[incomingDir,setIncomingDir]=useState(null);
  const[selectedDate,setSelectedDate]=useState(today);
  // Form sheet state
  const[showForm,setShowForm]=useState(false);
  const[startH,setStartH]=useState(OPEN_HOUR);
  const[startM,setStartM]=useState(0);
  const[endH,setEndH]=useState(OPEN_HOUR+1);
  const[endM,setEndM]=useState(0);
  const[recurrence,setRecurrence]=useState('none');
  const[endDate,setEndDate]=useState(null);
  const[form,setForm]=useState({name:'',phone:'',activity:'',notes:''});
  const[loading,setLoading]=useState(false);
  const navInProgressRef=useRef(false);
  const swipeRef=useRef(null);
  const gridRef=useRef(null);
  const mg=useMemo(()=>getMonthGrid(anchor.getFullYear(),anchor.getMonth()),[anchor]);
  const iso=toISO(selectedDate);
  const bookedBlocks=useMemo(()=>getBookedBlocks(bookings,exceptions,iso),[bookings,exceptions,iso]);
  const dH=endH+endM/60-startH-startM/60;
  const slot=slotFromHM(startH,startM,endH===CLOSE_HOUR?0:endH,endM);
  const occs=useMemo(()=>{
    const raw=getOccurrencesForDate(bookings,exceptions,iso);
    return [...raw].sort((a,b)=>{
      const tA=a.time_slot?.split(/[-–]/)[0]?.trim()||'';
      const tB=b.time_slot?.split(/[-–]/)[0]?.trim()||'';
      return tA.localeCompare(tB);
    });
  },[bookings,exceptions,iso]);

  const navigate=dir=>{
    if(navInProgressRef.current) return;
    navInProgressRef.current=true;
    setSlideDir(dir);setIncomingDir(null);
    const d=new Date(anchor);
    dir==='next'?d.setMonth(d.getMonth()+1):d.setMonth(d.getMonth()-1);
    setAnchor(d);
    // Auto-select today for current month, else 1st of new month
    const newY=d.getFullYear(),newM=d.getMonth();
    const todayY=today.getFullYear(),todayM=today.getMonth();
    const autoDate=(newY===todayY&&newM===todayM)?new Date(today):new Date(newY,newM,1);
    autoDate.setHours(0,0,0,0);
    setSelectedDate(autoDate);
    setTimeout(()=>{
      setIncomingDir(dir);setDisplayAnchor(d);setSlideDir(null);
      navInProgressRef.current=false;
      setTimeout(()=>setIncomingDir(null),400);
    },320);
  };

  const goToToday=()=>{
    const t=new Date(today.getFullYear(),today.getMonth(),1);
    const dir=t>anchor?'next':'prev';
    if(t.getMonth()===anchor.getMonth()&&t.getFullYear()===anchor.getFullYear()){
      setSelectedDate(today);return;
    }
    setSlideDir(dir);setIncomingDir(null);setAnchor(t);
    setTimeout(()=>{setIncomingDir(dir);setDisplayAnchor(t);setSlideDir(null);
      setTimeout(()=>setIncomingDir(null),400);},320);
    setSelectedDate(today);
  };

  useEffect(()=>{
    const el=gridRef.current;if(!el) return;
    const onMove=e=>{
      if(!swipeRef.current) return;
      const dx=Math.abs(e.touches[0].clientX-swipeRef.current.x);
      const dy=Math.abs(e.touches[0].clientY-swipeRef.current.y);
      if(swipeRef.current.locked===null&&(dx>4||dy>4)) swipeRef.current.locked=dx>dy?'h':'v';
      if(swipeRef.current.locked==='h') e.preventDefault();
    };
    el.addEventListener('touchmove',onMove,{passive:false});
    return()=>el.removeEventListener('touchmove',onMove);
  },[]);

  const isToday_=d=>{if(!d)return false;const c=new Date(d);c.setHours(0,0,0,0);return c.getTime()===today.getTime();};
  const isSel_=d=>{if(!d)return false;const c=new Date(d);c.setHours(0,0,0,0);return c.getTime()===selectedDate.getTime();};
  const hasB_=d=>d&&hasBookingsOnDate(bookings,exceptions,toISO(d));

  const openForm=()=>{
    setForm({name:'',phone:'',activity:'',notes:''});
    setStartH(OPEN_HOUR);setStartM(0);setEndH(OPEN_HOUR+1);setEndM(0);
    setRecurrence('none');setEndDate(null);
    setShowForm(true);
    _tabBarCallbacks.hide?.();
  };
  const closeForm=()=>{setShowForm(false);_tabBarCallbacks.show?.();};

  return <div style={{position:'fixed',inset:0,background:T.bg,zIndex:2500,display:'flex',flexDirection:'column'}}>
    <HideTabBar/>
    {/* ── Fixed header ── */}
    <div style={{background:T.bg,flexShrink:0,paddingTop:'max(16px,env(safe-area-inset-top,16px))'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',
        paddingLeft:20,paddingRight:20,paddingBottom:4}}>
        <button onClick={onClose}
          style={{background:'none',border:'none',cursor:'pointer',color:T.accent,
            fontSize:16,padding:0,WebkitTapHighlightColor:'transparent',
            display:'flex',alignItems:'center',gap:4}}>
          <svg width="8" height="14" viewBox="0 0 8 14" fill="none">
            <path d="M7 1L1 7l6 6" stroke={T.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Stäng
        </button>
        <div style={{fontSize:17,fontWeight:700,color:T.text}}>Lägg till bokning</div>
        <button onClick={()=>{setYearPickerYear(anchor.getFullYear());setShowYearPicker(true);}}
          style={{background:'none',border:'none',cursor:'pointer',color:T.textMuted,padding:0,
            display:'flex',alignItems:'center',gap:4,WebkitTapHighlightColor:'transparent'}}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
            stroke={T.textMuted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          <span style={{fontSize:15,fontWeight:500}}>{anchor.getFullYear()}</span>
        </button>
      </div>
      {/* Month + nav */}
      <div style={{paddingLeft:20,paddingRight:20,
        display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:4}}>
        <button onClick={()=>navigate('prev')}
          style={{width:34,height:34,borderRadius:'50%',border:'none',
            background:T.cardElevated,display:'flex',alignItems:'center',
            justifyContent:'center',cursor:'pointer',color:T.text,WebkitTapHighlightColor:'transparent'}}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <div style={{overflow:'hidden',flex:1,height:36,marginLeft:8}}>
          <div key={displayAnchor.getMonth()+'_'+displayAnchor.getFullYear()} style={{
            fontSize:30,fontWeight:700,color:T.text,fontFamily:'system-ui',
            letterSpacing:'-.8px',lineHeight:'36px',
            animation:slideDir
              ?(slideDir==='next'?'bsTitleSlideLeft 0.38s cubic-bezier(0.4,0,0.2,1) forwards':'bsTitleSlideRight 0.38s cubic-bezier(0.4,0,0.2,1) forwards')
              :incomingDir
                ?(incomingDir==='next'?'bsTitleSlideInFromRight 0.38s cubic-bezier(0.4,0,0.2,1)':'bsTitleSlideInFromLeft 0.38s cubic-bezier(0.4,0,0.2,1)')
                :'none'}}>
            {MONTHS_SV[displayAnchor.getMonth()]}
          </div>
        </div>
        <button onClick={()=>navigate('next')}
          style={{width:34,height:34,borderRadius:'50%',border:'none',
            background:T.cardElevated,display:'flex',alignItems:'center',
            justifyContent:'center',cursor:'pointer',color:T.text,WebkitTapHighlightColor:'transparent'}}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </button>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',paddingLeft:8,paddingRight:8,marginBottom:4}}>
        {DAYS_SV.map(d=><div key={d} style={{textAlign:'center',fontSize:12,fontWeight:600,
          color:T.textMuted,fontFamily:'system-ui',letterSpacing:'.5px'}}>{d}</div>)}
      </div>
    </div>
    {/* ── Scrollable content ── */}
    <div style={{flex:1,overflowY:'auto',WebkitOverflowScrolling:'touch',position:'relative'}}>
      {/* Calendar grid */}
      <div ref={gridRef}
        onTouchStart={e=>{swipeRef.current={x:e.touches[0].clientX,y:e.touches[0].clientY,locked:null};}}
        onTouchEnd={e=>{
          if(!swipeRef.current) return;
          const dx=e.changedTouches[0].clientX-swipeRef.current.x;
          const dy=Math.abs(e.changedTouches[0].clientY-swipeRef.current.y);
          const wasH=swipeRef.current.locked==='h';swipeRef.current=null;
          if(!wasH||Math.abs(dx)<40||dy>60) return;
          if(dx<0) navigate('next'); else navigate('prev');
        }}
        style={{paddingLeft:8,paddingRight:8,
          animation:slideDir?(slideDir==='next'?'bsGridSlideLeft 0.38s cubic-bezier(0.4,0,0.2,1)':'bsGridSlideRight 0.38s cubic-bezier(0.4,0,0.2,1)'):'none'}}>
        {mg.map((row,ri)=>(
          <div key={ri} style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:2,marginBottom:2}}>
            {row.map((d,ci)=>{
              if(!d) return <div key={ci}/>;
              const tod=isToday_(d),sel=isSel_(d),hb=hasB_(d);
              return <button key={ci}
                onClick={()=>{const c=new Date(d);c.setHours(0,0,0,0);setSelectedDate(c);}}
                style={{borderRadius:10,border:'none',background:sel?T.calSelected:'none',
                  padding:'6px 2px 5px',cursor:'pointer',
                  display:'flex',flexDirection:'column',alignItems:'center',gap:2,
                  WebkitTapHighlightColor:'transparent',transition:'background 0.15s'}}>
                <div style={{width:32,height:32,borderRadius:'50%',
                  background:tod&&!sel?T.calToday:'none',
                  display:'flex',alignItems:'center',justifyContent:'center'}}>
                  <span style={{fontSize:16,fontWeight:tod?700:400,
                    color:sel?'#fff':tod?'#fff':T.text,fontFamily:'system-ui'}}>{d.getDate()}</span>
                </div>
                {hb&&<div style={{width:5,height:5,borderRadius:'50%',background:sel?'#fff':T.accent}}/>}
              </button>;
            })}
          </div>
        ))}
      </div>
      {/* Legend + Today chip */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 20px 12px'}}>
        <div style={{display:'flex',gap:12}}>
          {[[T.accent,'Bokad'],[T.calToday,'Idag']].map(([c,l])=>(
            <div key={l} style={{display:'flex',alignItems:'center',gap:4}}>
              <div style={{width:7,height:7,borderRadius:'50%',background:c}}/>
              <span style={{fontSize:11,color:T.textMuted,fontFamily:'system-ui'}}>{l}</span>
            </div>
          ))}
        </div>
        <TodayChip onPress={goToToday} T={T}/>
      </div>
      {/* ── Day panel ── */}
      <div style={{height:'0.5px',background:T.separator,margin:'0 0 8px'}}/>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 20px 12px'}}>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <div style={{width:38,height:38,borderRadius:'50%',
            background:isToday_(selectedDate)?T.calToday:'none',
            display:'flex',alignItems:'center',justifyContent:'center',
            border:isToday_(selectedDate)?'none':`2px solid ${T.separator}`}}>
            <span style={{fontSize:18,fontWeight:700,
              color:isToday_(selectedDate)?'#fff':T.text,fontFamily:'system-ui'}}>
              {selectedDate.getDate()}
            </span>
          </div>
          <div>
            <div style={{fontSize:15,fontWeight:600,color:T.text,fontFamily:'system-ui'}}>
              {DAYS_FULL[(selectedDate.getDay()+6)%7]}
            </div>
            <div style={{fontSize:12,color:T.textMuted,fontFamily:'system-ui'}}>
              {MONTHS_SV[selectedDate.getMonth()]} {selectedDate.getFullYear()}
            </div>
          </div>
        </div>
        {/* + knapp — öppnar bokningsformulär */}
        <button onClick={openForm}
          style={{width:36,height:36,borderRadius:'50%',border:'none',
            background:T.accent,color:'#fff',
            display:'flex',alignItems:'center',justifyContent:'center',
            cursor:'pointer',WebkitTapHighlightColor:'transparent',
            boxShadow:`0 2px 10px ${T.accentGlow}`}}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </button>
      </div>
      {/* Befintliga bokningar för vald dag */}
      {occs.length===0
        ?<div style={{textAlign:'center',paddingTop:24,paddingBottom:32,
          fontSize:22,fontWeight:700,color:T.textMuted,fontFamily:'system-ui',
          letterSpacing:'-.3px'}}>Inga aktiviteter</div>
        :<div style={{display:'flex',flexDirection:'column',gap:8,padding:'0 20px 32px'}}>
          {occs.map(o=>{
            const sc={approved:'#34C759',edited:'#34C759',pending:'#FF9F0A',
              edit_pending:'#FF9F0A',cancelled:'#8E8E93',rejected:'#FF3B30'}[o.status]||T.accent;
            return <div key={o.id+(o.date||'')}
              onClick={()=>onOpenDetail&&onOpenDetail(bookings.find(b=>b.id===o.id)||o,o.date)}
              style={{background:T.card,border:`0.5px solid ${T.border}`,
                borderRadius:14,padding:'12px 14px',
                display:'flex',alignItems:'flex-start',gap:12,
                cursor:'pointer',WebkitTapHighlightColor:'transparent'}}>
              <div style={{width:4,borderRadius:2,alignSelf:'stretch',flexShrink:0,background:sc}}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:15,fontWeight:600,color:T.text,fontFamily:'system-ui',marginBottom:2}}>{o.activity}</div>
                <div style={{fontSize:13,color:T.textMuted,fontFamily:'system-ui'}}>{o.time_slot} · {fmtDuration(o.duration_hours)}</div>
                <div style={{fontSize:12,color:T.textMuted,fontFamily:'system-ui',marginTop:2}}>
                  {o.name}{o.phone?` · ${o.phone}`:''}
                </div>
              </div>
              <Badge status={o.status}/>
            </div>;
          })}
        </div>}
      {/* Year picker overlay */}
      {showYearPicker&&<div style={{position:'fixed',inset:0,zIndex:3000,background:T.bg}}>
        <YearView year={yearPickerYear} bookings={bookings} exceptions={exceptions} T={T}
          onBack={()=>setShowYearPicker(false)}
          onSelectMonth={(y,m)=>{
            const d=new Date(y,m,1);
            setAnchor(d);setDisplayAnchor(d);setYearPickerYear(y);
            setShowYearPicker(false);
          }}/>
      </div>}
    </div>

    {/* ── Bokningsformulär — bottom sheet ── */}
    {showForm&&<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:3000,
      display:'flex',alignItems:'flex-end',justifyContent:'center',touchAction:'none'}}
      onClick={e=>{if(e.target===e.currentTarget)closeForm();}}>
      <div onClick={e=>e.stopPropagation()} style={{
        background:T.sheetBg,borderRadius:'20px 20px 0 0',
        width:'100%',maxWidth:500,boxSizing:'border-box',
        maxHeight:'90vh',display:'flex',flexDirection:'column',
        animation:'bsSlideUp .28s cubic-bezier(0.32,0.72,0,1)'}}>
        {/* Sheet header */}
        <div style={{padding:'20px 20px 0',flexShrink:0}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
            <div>
              <div style={{fontSize:19,fontWeight:700,color:T.text}}>Ny aktivitet</div>
              <div style={{fontSize:13,color:T.textMuted,marginTop:2}}>
                {DAYS_FULL[(selectedDate.getDay()+6)%7]} {selectedDate.getDate()} {MONTHS_SV[selectedDate.getMonth()]} {selectedDate.getFullYear()}
              </div>
            </div>
            <button onClick={closeForm}
              style={{background:'none',border:'none',fontSize:22,color:T.textMuted,
                cursor:'pointer',padding:'0 4px',lineHeight:1,WebkitTapHighlightColor:'transparent'}}>×</button>
          </div>
        </div>
        {/* Scrollable form content */}
        <div style={{flex:1,overflowY:'auto',padding:'0 20px',WebkitOverflowScrolling:'touch'}}>
          {/* Tid */}
          <div style={{background:T.card,border:`0.5px solid ${T.border}`,borderRadius:12,overflow:'hidden',marginBottom:14}}>
            <TimeAccordion label="Startar" hour={startH} minute={startM}
              onConfirm={(h,m)=>{setStartH(h);setStartM(m);if(endH+endM/60<=h+m/60){setEndH(Math.min(h+1,CLOSE_HOUR));setEndM(0);}}}
              bookedBlocks={bookedBlocks} isStart={true} pairedHour={startH} pairedMinute={startM} T={T}/>
            <div style={{height:'0.5px',background:T.separator}}/>
            <TimeAccordion label="Slutar" hour={endH} minute={endM}
              onConfirm={(h,m)=>{setEndH(h);setEndM(m);}}
              bookedBlocks={bookedBlocks} isStart={false} pairedHour={startH} pairedMinute={startM} T={T}/>
          </div>
          {/* Upprepning */}
          <RecurrencePicker recurrence={recurrence} onChange={setRecurrence}
            endDate={endDate} onEndDateChange={setEndDate} defaultDate={iso} T={T}/>
          {/* Fält */}
          <div style={{marginTop:14,display:'flex',flexDirection:'column',gap:0}}>
            <Textarea label="NAMN PÅ ANSVARIG PERSON" value={form.name}
              onChange={v=>setForm(p=>({...p,name:v}))} placeholder="För- och efternamn" T={T}/>
            <Textarea label="TELEFON *" value={form.phone}
              onChange={v=>setForm(p=>({...p,phone:v}))} placeholder="07X-XXX XX XX" T={T}/>
            <Textarea label="AKTIVITET *" value={form.activity}
              onChange={v=>setForm(p=>({...p,activity:v}))} placeholder="Vad ska lokalen användas till?" T={T}/>
            <Textarea label="ANTECKNINGAR (valfritt)" value={form.notes}
              onChange={v=>setForm(p=>({...p,notes:v}))} placeholder="Anteckningar..." T={T}/>
          </div>
          {/* Submit */}
          <div style={{marginTop:16,paddingBottom:'max(24px,env(safe-area-inset-bottom,16px))'}}>
            {(()=>{
              // Check single-date conflict
              const sd=startH+startM/60;
              const singleConflict=recurrence==='none'&&Array.from({length:Math.round(dH*2)},(_,i)=>bookedBlocks.has(sd*2+i)).some(Boolean);
              return <button onClick={async()=>{
                  if(singleConflict){alert('Denna tid är upptagen — bokningen krockar med en befintlig bokning. Välj en annan tid.');return;}
                  if(!form.name.trim()||!form.phone.trim()||!form.activity.trim()){
                    alert('Namn, telefon och aktivitet krävs.');return;
                  }
                  if(recurrence.startsWith('custom:')&&parseCustomDays(recurrence).length===0){
                    alert('Välj minst en dag för anpassad upprepning.');return;
                  }
                  // Check recurring conflicts
                  if(recurrence!=='none'){
                    const wEnd=endDate||(()=>{const d=new Date(iso);d.setFullYear(d.getFullYear()+2);return toISO(d);})();
                    const tempB={id:'__check__',start_date:iso,end_date:endDate||null,recurrence,time_slot:slot,duration_hours:Math.round(dH*100)/100,status:'pending'};
                    const occs=expandBooking(tempB,iso,wEnd,[]);
                    const found=[];
                    for(const occ of occs){
                      const bb=getBookedBlocks(bookings,exceptions,occ.date);
                      let clash=false;
                      for(let i=0;i<Math.round(dH*2);i++){if(bb.has(sd*2+i)){clash=true;break;}}
                      if(clash) found.push(occ.date);
                    }
                    if(found.length>0){
                      const avail=occs.length-found.length;
                      const msg=`${found.length} tillfällen krockar med befintliga bokningar.
${avail} tillfällen är lediga.

Vill du boka bara de ${avail} lediga tillfällena?`;
                      if(!window.confirm(msg)) return;
                      setLoading(true);
                      await onSubmit({...form,date:iso,time_slot:slot,duration_hours:Math.round(dH*100)/100,recurrence,end_date:endDate,skip_dates:found});
                      setLoading(false);closeForm();return;
                    }
                  }
                  setLoading(true);
                  await onSubmit({...form,date:iso,time_slot:slot,duration_hours:Math.round(dH*100)/100,recurrence,end_date:endDate,skip_dates:[]});
                  setLoading(false);
                  closeForm();
                }}
                disabled={loading||singleConflict}
                title={singleConflict?'Denna tid är upptagen — välj en annan tid':''}
                style={{width:'100%',padding:'14px',borderRadius:12,border:'none',
                  background:loading||singleConflict?T.textTertiary:T.accent,color:'#fff',fontSize:15,fontWeight:700,
                  cursor:loading||singleConflict?'not-allowed':'pointer',WebkitTapHighlightColor:'transparent',
                  opacity:singleConflict?0.5:1,transition:'opacity .2s,background .2s',
                  touchAction:'manipulation'}}>
                {singleConflict?'Krockar med annan bokning':loading?'Sparar…':'Boka aktivitet'}
              </button>;
            })()}
          </div>
        </div>
      </div>
    </div>}
  </div>;
}

// ─── AdminEditSheet ──────────────────────────────────────────────────────────
// Admin can edit an existing booking: time, date, recurrence, name, phone, activity, notes
function AdminEditSheet({booking, bookings, exceptions, onSave, onCancel, T}) {
  const [startH, setStartH] = useState(() => {
    const s = booking.time_slot?.split('-')[0]?.trim() || '09:00';
    return parseInt(s.split(':')[0]) || OPEN_HOUR;
  });
  const [startM, setStartM] = useState(() => {
    const s = booking.time_slot?.split('-')[0]?.trim() || '09:00';
    return parseInt(s.split(':')[1]) || 0;
  });
  const [endH, setEndH] = useState(() => {
    const s = booking.time_slot?.split('-')[1]?.trim() || '10:00';
    return parseInt(s.split(':')[0]) || OPEN_HOUR+1;
  });
  const [endM, setEndM] = useState(() => {
    const s = booking.time_slot?.split('-')[1]?.trim() || '10:00';
    return parseInt(s.split(':')[1]) || 0;
  });
  const [recurrence, setRecurrence] = useState(booking.recurrence || 'none');
  const [endDate, setEndDate] = useState(booking.end_date || null);
  const [form, setForm] = useState({
    name: booking.name || '',
    phone: booking.phone || '',
    activity: booking.activity || '',
    notes: booking.notes || '',
  });
  const [loading, setLoading] = useState(false);
  const [conflicts, setConflicts] = useState(null);
  const iso = booking.start_date;

  const handleSaveWithSkip = async (skipDates) => {
    setLoading(true);
    await onSave({
      ...form,
      time_slot: slot,
      duration_hours: Math.round(dH*100)/100,
      recurrence,
      end_date: endDate,
      skip_dates: skipDates,
    });
    setLoading(false);
  };
  const dH = endH + endM/60 - startH - startM/60;
  const slot = slotFromHM(startH, startM, endH === CLOSE_HOUR ? 0 : endH, endM);
  const bookedBlocks = useMemo(() => getBookedBlocks(
    bookings.filter(b => b.id !== booking.id), exceptions, iso
  ), [bookings, exceptions, iso]);

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:3100,
      display:'flex',alignItems:'flex-end',justifyContent:'center',touchAction:'none'}}
      onClick={e=>{if(e.target===e.currentTarget)onCancel();}}>
      <div onClick={e=>e.stopPropagation()} style={{
        background:T.sheetBg,borderRadius:'20px 20px 0 0',
        width:'100%',maxWidth:500,boxSizing:'border-box',
        maxHeight:'92vh',display:'flex',flexDirection:'column',
        animation:'bsSlideUp .28s cubic-bezier(0.32,0.72,0,1)'}}>
        {/* Header */}
        <div style={{padding:'20px 20px 0',flexShrink:0}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:4}}>
            <div>
              <div style={{fontSize:19,fontWeight:700,color:T.text}}>Redigera bokning</div>
              <div style={{fontSize:13,color:T.textMuted,marginTop:2}}>{isoToDisplay(iso)}</div>
            </div>
            <button onClick={onCancel} style={{background:'none',border:'none',fontSize:24,
              color:T.textMuted,cursor:'pointer',padding:'0 4px',lineHeight:1,
              WebkitTapHighlightColor:'transparent'}}>×</button>
          </div>
          <div style={{height:'0.5px',background:T.separator,marginTop:16}}/>
        </div>
        {/* Scrollable content */}
        <div style={{flex:1,overflowY:'auto',padding:'16px 20px',WebkitOverflowScrolling:'touch'}}>
          {/* Time */}
          <div style={{background:T.card,border:`0.5px solid ${T.border}`,borderRadius:12,overflow:'hidden',marginBottom:14}}>
            <TimeAccordion label="Startar" hour={startH} minute={startM}
              onConfirm={(h,m)=>{setStartH(h);setStartM(m);if(endH+endM/60<=h+m/60){setEndH(Math.min(h+1,CLOSE_HOUR));setEndM(0);}}}
              bookedBlocks={bookedBlocks} isStart={true} pairedHour={startH} pairedMinute={startM} T={T}/>
            <div style={{height:'0.5px',background:T.separator}}/>
            <TimeAccordion label="Slutar" hour={endH} minute={endM}
              onConfirm={(h,m)=>{setEndH(h);setEndM(m);}}
              bookedBlocks={bookedBlocks} isStart={false} pairedHour={startH} pairedMinute={startM} T={T}/>
          </div>
          {/* Recurrence */}
          <RecurrencePicker recurrence={recurrence} onChange={setRecurrence}
            endDate={endDate} onEndDateChange={setEndDate} defaultDate={iso} T={T}/>
          {/* Fields */}
          <div style={{marginTop:14,display:'flex',flexDirection:'column',gap:0}}>
            <Textarea label="NAMN PÅ ANSVARIG PERSON" value={form.name}
              onChange={v=>setForm(p=>({...p,name:v}))} placeholder="För- och efternamn" T={T}/>
            <Textarea label="TELEFON" value={form.phone}
              onChange={v=>setForm(p=>({...p,phone:v}))} placeholder="07X-XXX XX XX" T={T}/>
            <Textarea label="AKTIVITET" value={form.activity}
              onChange={v=>setForm(p=>({...p,activity:v}))} placeholder="Vad ska lokalen användas till?" T={T}/>
            <Textarea label="ANTECKNINGAR (valfritt)" value={form.notes}
              onChange={v=>setForm(p=>({...p,notes:v}))} placeholder="Anteckningar..." T={T}/>
          </div>
          {/* Save */}
          <div style={{marginTop:16,paddingBottom:'max(24px,env(safe-area-inset-bottom,16px))'}}>
            <button onClick={()=>{
                if(!form.name.trim()||!form.activity.trim()){alert('Namn och aktivitet krävs.');return;}
                if(recurrence.startsWith('custom:')&&parseCustomDays(recurrence).length===0){
                  alert('Välj minst en dag för anpassad upprepning.');return;
                }
                // Check conflicts for recurring bookings
                if(recurrence!=='none'){
                  const wEnd=endDate||(()=>{const d=new Date(iso);d.setFullYear(d.getFullYear()+2);return toISO(d);})();
                  const tempB={id:'__check__',start_date:iso,end_date:endDate||null,
                    recurrence,time_slot:slot,duration_hours:Math.round(dH*100)/100,status:'pending'};
                  const occs=expandBooking(tempB,iso,wEnd,[]);
                  const sd=startH+startM/60;
                  const found=[];
                  for(const occ of occs){
                    const bb=getBookedBlocks(bookings.filter(b=>b.id!==booking.id),exceptions,occ.date);
                    let clash=false;
                    for(let i=0;i<Math.round(dH*2);i++){if(bb.has(sd*2+i)){clash=true;break;}}
                    if(clash) found.push({date:occ.date,time_slot:slot});
                  }
                  if(found.length>0){setConflicts(found);return;}
                }
                handleSaveWithSkip([]);
              }}
              disabled={loading}
              style={{width:'100%',padding:'14px',borderRadius:12,border:'none',
                background:loading?T.textTertiary:'#24645d',color:'#fff',fontSize:15,fontWeight:700,
                cursor:loading?'default':'pointer',WebkitTapHighlightColor:'transparent'}}>
              {loading?'Sparar…':'Spara ändringar'}
            </button>
          </div>
        </div>
      </div>

      {/* Conflict sheet */}
      {conflicts&&<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',zIndex:3200,
        display:'flex',alignItems:'flex-end',justifyContent:'center',touchAction:'none'}}>
        <div style={{background:T.sheetBg,borderRadius:'20px 20px 0 0',
          padding:'24px 20px 36px',width:'100%',maxWidth:500,boxSizing:'border-box',
          animation:'bsSlideUp .25s cubic-bezier(0.32,0.72,0,1)',maxHeight:'80vh',overflowY:'auto'}}>
          <div style={{fontSize:17,fontWeight:700,color:T.text,marginBottom:6}}>Tidskonflikter</div>
          <div style={{fontSize:13,color:T.textMuted,marginBottom:14}}>
            {conflicts.length} av de valda dagarna krockar med befintliga bokningar.
          </div>
          <div style={{maxHeight:180,overflowY:'auto',marginBottom:16,display:'flex',flexDirection:'column',gap:6}}>
            {conflicts.map((c,i)=>(
              <div key={i} style={{background:`${T.error}12`,border:`1px solid ${T.error}33`,borderRadius:10,padding:'8px 12px',display:'flex',alignItems:'center',gap:10}}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.error} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <div>
                  <div style={{fontSize:13,fontWeight:600,color:T.text}}>{isoToDisplay(c.date)}</div>
                  <div style={{fontSize:11,color:T.textMuted}}>{c.time_slot} — redan bokad</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            <button onClick={()=>setConflicts(null)}
              style={{padding:'13px',borderRadius:12,border:`1.5px solid ${T.accent}`,
                background:'none',color:T.accent,fontSize:14,fontWeight:700,cursor:'pointer'}}>
              ← Ändra tid
            </button>
            <button onClick={()=>{handleSaveWithSkip(conflicts.map(c=>c.date));setConflicts(null);}}
              disabled={loading}
              style={{padding:'13px',borderRadius:12,border:'none',
                background:'#24645d',color:'#fff',fontSize:14,fontWeight:700,cursor:'pointer'}}>
              {loading?'Sparar…':'Boka bara lediga tillfällen →'}
            </button>
          </div>
        </div>
      </div>}
    </div>
  );
}

// ─── UserDeleteSheet ──────────────────────────────────────────────────────────
// Replaces UserCancelConfirmSheet — includes reason field + series options
function UserDeleteSheet({booking, occurrence_date, onConfirmOccurrence, onConfirmSeries, onCancel, T}) {
  const [reason, setReason] = useState('');
  const [err, setErr] = useState(false);
  const isRecur = booking.recurrence && booking.recurrence !== 'none';

  useEffect(()=>{
    _tabBarCallbacks.hide?.();
    return()=>_tabBarCallbacks.show?.();
  },[]);

  const validate = (fn) => {
    if (!reason.trim()) { setErr(true); return; }
    const uName = localStorage.getItem(STORAGE_USER_NAME) || 'Besökaren';
    fn(`Avbokad av ${uName}: ${reason.trim()}`);
  };

  const [kbOffset, setKbOffset] = React.useState(0);
  React.useEffect(()=>{
    const vv=window.visualViewport;
    if(!vv) return;
    const upd=()=>setKbOffset(Math.max(0,window.innerHeight-vv.height-vv.offsetTop));
    vv.addEventListener('resize',upd); vv.addEventListener('scroll',upd);
    return()=>{vv.removeEventListener('resize',upd); vv.removeEventListener('scroll',upd);};
  },[]);
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',
      zIndex:3000,display:'flex',alignItems:'flex-end',justifyContent:'center',
      touchAction:'none'}}
      onClick={onCancel}>
      <HideTabBar/>
      <div onClick={e=>e.stopPropagation()} style={{
        background:T.sheetBg,borderRadius:'20px 20px 0 0',
        padding:'24px 20px max(40px,env(safe-area-inset-bottom,28px))',
        width:'100%',maxWidth:500,boxSizing:'border-box',
        position:'relative', bottom: kbOffset,
        animation:'bsSlideUp .28s cubic-bezier(0.32,0.72,0,1)'}}>
        <div style={{fontSize:18,fontWeight:700,color:T.text,marginBottom:4,fontFamily:'system-ui'}}>
          Radera bokning
        </div>
        <div style={{fontSize:14,color:T.textMuted,marginBottom:14,fontFamily:'system-ui',lineHeight:1.5}}>
          {isoToDisplay(occurrence_date)}
          {booking.time_slot && <span> · {booking.time_slot}</span>}
          {booking.duration_hours && <span> · {fmtDuration(booking.duration_hours)}</span>}
          {isRecur && <span style={{color:T.textMuted}}> · återkommande</span>}
        </div>
        <label style={{fontSize:12,fontWeight:600,color:T.textMuted,fontFamily:'system-ui',
          letterSpacing:'.3px',display:'block',marginBottom:6}}>
          ANLEDNING <span style={{color:T.error}}>*</span>
        </label>
        <textarea
          value={reason}
          onChange={e=>{setReason(e.target.value);setErr(false);}}
          placeholder="Varför avbokar du?"
          rows={3}
          onFocus={()=>_tabBarCallbacks.hide?.()}
          onBlur={()=>_tabBarCallbacks.show?.()}
          style={{width:'100%',boxSizing:'border-box',background:T.cardElevated,
            border:`0.5px solid ${err?T.error:T.border}`,borderRadius:10,
            padding:'10px 12px',fontSize:16,color:T.text,
            fontFamily:'system-ui',resize:'none',outline:'none',marginBottom:err?4:12}}/>
        {err && <div style={{fontSize:12,color:T.error,marginBottom:10,fontFamily:'system-ui'}}>Anledning krävs.</div>}
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          {isRecur && (
            <button onClick={()=>validate(onConfirmOccurrence)}
              style={{width:'100%',padding:'13px',borderRadius:12,border:`1px solid ${T.error}33`,
                background:`${T.error}11`,color:T.error,fontSize:14,fontWeight:700,
                cursor:'pointer',fontFamily:'system-ui',WebkitTapHighlightColor:'transparent',
                touchAction:'manipulation',textAlign:'left'}}>
              Radera bara detta tillfälle
            </button>
          )}
          {isRecur && (
            <button onClick={()=>validate(onConfirmSeries)}
              style={{width:'100%',padding:'13px',borderRadius:12,border:`1px solid ${T.error}33`,
                background:`${T.error}11`,color:T.error,fontSize:14,fontWeight:700,
                cursor:'pointer',fontFamily:'system-ui',WebkitTapHighlightColor:'transparent',
                touchAction:'manipulation',textAlign:'left'}}>
              Radera hela serien
            </button>
          )}
          {!isRecur && (
            <button onClick={()=>validate(onConfirmOccurrence)}
              style={{width:'100%',padding:'13px',borderRadius:12,border:'none',
                background:T.error,color:'#fff',fontSize:14,fontWeight:700,
                cursor:'pointer',fontFamily:'system-ui',WebkitTapHighlightColor:'transparent',
                touchAction:'manipulation'}}>
              Radera bokning
            </button>
          )}
          <button onClick={onCancel}
            style={{width:'100%',padding:'13px',borderRadius:12,
              border:`0.5px solid ${T.border}`,background:'none',color:T.text,
              fontSize:14,fontWeight:600,cursor:'pointer',fontFamily:'system-ui',
              WebkitTapHighlightColor:'transparent',touchAction:'manipulation'}}>
            Avbryt
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── AdminDeleteSheet — inline bottom overlay, no position:fixed ──────────────
// Uses a full-screen overlay rendered inside the scroll root, so parent
// overflow:hidden never clips it.
function AdminDeleteSheet({dialog,actionLoading,onConfirm,onCancel,T}) {
  const[reason,setReason]=useState('');
  const[err,setErr]=useState(false);
  // Hide tab bar while this sheet is open
  useEffect(()=>{
    _tabBarCallbacks.hide?.();
    return()=>_tabBarCallbacks.show?.();
  },[]);
  const titleMap={
    series:'Radera hela serien?',
    one:`Radera ${dialog.occurrence_date?isoToDisplay(dialog.occurrence_date):'tillfälle'}?`,
    single:'Radera bokning?',
  };
  const msgMap={
    series:'Alla kommande tillfällen tas bort och besökaren notifieras.',
    one:'Bara detta tillfälle tas bort. Besökaren notifieras.',
    single:'Bokningen tas bort. Besökaren notifieras.',
  };
  const handleConfirm=async()=>{
    if(!reason.trim()){setErr(true);return;}
    await onConfirm(reason.trim());
  };
  const [kbOffset, setKbOffset] = React.useState(0);
  React.useEffect(()=>{
    const vv=window.visualViewport;
    if(!vv) return;
    const upd=()=>setKbOffset(Math.max(0,window.innerHeight-vv.height-vv.offsetTop));
    vv.addEventListener('resize',upd); vv.addEventListener('scroll',upd);
    return()=>{vv.removeEventListener('resize',upd); vv.removeEventListener('scroll',upd);};
  },[]);
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',
      zIndex:3000,display:'flex',alignItems:'flex-end',justifyContent:'center',
      touchAction:'none'}}
      onClick={onCancel}>
      <div onClick={e=>e.stopPropagation()} style={{
        background:T.sheetBg,borderRadius:'20px 20px 0 0',
        padding:'24px 20px max(36px,env(safe-area-inset-bottom,24px))',
        width:'100%',maxWidth:500,boxSizing:'border-box',
        position:'relative', bottom: kbOffset,
        animation:'bsSlideUp .28s cubic-bezier(0.32,0.72,0,1)'}}>
        <div style={{fontSize:18,fontWeight:700,color:T.text,marginBottom:6,fontFamily:'system-ui'}}>
          {titleMap[dialog.type]||'Radera?'}
        </div>
        <div style={{fontSize:14,color:T.textMuted,marginBottom:16,fontFamily:'system-ui',lineHeight:1.5}}>
          {msgMap[dialog.type]||''}
        </div>
        <label style={{fontSize:12,fontWeight:600,color:T.textMuted,
          fontFamily:'system-ui',letterSpacing:'.3px',display:'block',marginBottom:6}}>
          ANLEDNING (visas för besökaren) <span style={{color:T.error}}>*</span>
        </label>
        <textarea
          value={reason}
          onChange={e=>{setReason(e.target.value);setErr(false);}}
          placeholder="Varför tas bokningen bort?"
          rows={3}
          onFocus={()=>_tabBarCallbacks.hide?.()}
          onBlur={()=>_tabBarCallbacks.show?.()}
          style={{width:'100%',boxSizing:'border-box',background:T.cardElevated,
            border:`0.5px solid ${err?T.error:T.border}`,borderRadius:10,
            padding:'10px 12px',fontSize:16,color:T.text,
            fontFamily:'system-ui',resize:'none',outline:'none',marginBottom:err?6:14}}/>
        {err&&<div style={{fontSize:12,color:T.error,marginBottom:10,fontFamily:'system-ui'}}>
          Anledning krävs.
        </div>}
        <div style={{display:'flex',gap:10}}>
          <button onClick={onCancel}
            style={{flex:1,padding:'13px',borderRadius:12,
              border:`0.5px solid ${T.border}`,background:'none',color:T.text,
              fontSize:15,fontWeight:600,cursor:'pointer',fontFamily:'system-ui',
              WebkitTapHighlightColor:'transparent'}}>
            Avbryt
          </button>
          <button onClick={handleConfirm} disabled={actionLoading}
            style={{flex:1,padding:'13px',borderRadius:12,border:'none',
              background:actionLoading?T.textTertiary:T.error,color:'#fff',
              fontSize:15,fontWeight:700,
              cursor:actionLoading?'default':'pointer',
              fontFamily:'system-ui',WebkitTapHighlightColor:'transparent'}}>
            {actionLoading?'Raderar…':'Radera'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Admin Panel ──────────────────────────────────────────────────────────────
function AdminPanel({bookings,exceptions,onBack,onApprove,onReject,onDelete,onDeleteSeries,onDeleteFromDate,onAdminAddRecurring,onAdminEdit,onRefreshNotifications,onMarkAdminSeen,onManageUsers,onOpenBookingDetail,adminInitialFilter,adminHighlightId=null,adminHighlightFilter=null,T}) {
  const[filter,setFilter]=useState(adminHighlightFilter||adminInitialFilter||'all');
  const[selected,setSelected]=useState(null);
  const[actionLoading,setActionLoading]=useState(false);
  const[comment,setComment]=useState('');
  const[deleteDialog,setDeleteDialog]=useState(null);
  const[editDialog,setEditDialog]=useState(null);
  const[addForm,setAddForm]=useState(null);
  const highlightRef=useRef(null);
  const today=toISO(new Date());
  const wEnd=toISO(new Date(new Date().setFullYear(new Date().getFullYear()+2)));

  useEffect(()=>{if(adminHighlightFilter)setFilter(adminHighlightFilter);},[adminHighlightFilter]);
  useEffect(()=>{
    if(adminHighlightId&&highlightRef.current){
      setTimeout(()=>{
        highlightRef.current?.scrollIntoView({behavior:'smooth',block:'center'});
        if(navigator.vibrate) navigator.vibrate([60,40,60,40,120]);
        setTimeout(()=>onMarkAdminSeen?.(),3000);
      },400);
    }
  },[adminHighlightId,filter]);// eslint-disable-line

  const pending=bookings.filter(b=>b.status==='pending'||b.status==='edit_pending');
  const approved=bookings.filter(b=>b.status==='approved'||b.status==='edited');
  const rejected=bookings.filter(b=>b.status==='rejected');
  const cancelledBookings=bookings.filter(b=>b.status==='cancelled');

  // Enstaka user-avbokade tillfällen: skip-exceptions utan admin_comment
  // (admin-exceptions har alltid admin_comment, user-exceptions har det inte)
  const userSkipExceptions=exceptions.filter(e=>
    e.type==='skip' &&
    (!e.admin_comment || e.admin_comment.trim()==='') &&
    bookings.some(b=>b.id===e.booking_id&&(b.status==='approved'||b.status==='edited'))
  );

  // "Inställda"-räknaren: hela avbokade bokningar + enstaka user-avbokade tillfällen
  const cancelledCount=cancelledBookings.length+userSkipExceptions.length;

  // Sortering: senaste händelse överst
  // För approved/edited: resolved_at (när admin godkände)
  // För pending/edit_pending: created_at (när förfrågan kom in)
  // För cancelled/rejected: resolved_at (när det inställdes)
  // För exceptions: created_at (när tillfället avbokades)
  const getEventTime=(b)=>b.resolved_at||b.created_at||0;

  const sortedAll=bookings.slice().sort((a,b)=>getEventTime(b)-getEventTime(a));
  const sortedPending=pending.slice().sort((a,b)=>(b.created_at||0)-(a.created_at||0));
  const sortedApproved=approved.slice().sort((a,b)=>getEventTime(b)-getEventTime(a));
  const sortedRejected=rejected.slice().sort((a,b)=>getEventTime(b)-getEventTime(a));

  // Inställda: blanda avbokade bokningar + enstaka tillfällen, sortera på händelsetid
  const cancelledItems=[
    ...cancelledBookings.map(b=>({_type:'booking',_time:getEventTime(b),...b})),
    ...userSkipExceptions.map(e=>{
      const parentBooking=bookings.find(b=>b.id===e.booking_id);
      return {_type:'exception',_time:e.created_at||0,...e,_booking:parentBooking};
    }),
  ].sort((a,b)=>b._time-a._time);

  const filters=[
    {id:'all',label:'Alla',count:bookings.length},
    {id:'pending',label:'Väntar',count:pending.length},
    {id:'approved',label:'Godkända',count:approved.length},
    {id:'rejected',label:'Avböjda',count:rejected.length},
    {id:'cancelled',label:'Inställda',count:cancelledCount},
  ];

  // sorted används för alla filter utom 'cancelled' (som har cancelledItems)
  const sorted=filter==='pending'?sortedPending
    :filter==='approved'?sortedApproved
    :filter==='rejected'?sortedRejected
    :sortedAll;

  if(selected) {
    const b=selected;
    const isRecur=b.recurrence&&b.recurrence!=='none';
    const upcoming=isRecur?expandBooking(b,today,wEnd,exceptions).slice(0,10):null;
    return <div style={{paddingTop:'max(20px,env(safe-area-inset-top,0px))',
      paddingLeft:16,paddingRight:16,
      paddingBottom:'max(120px,calc(env(safe-area-inset-bottom,0px) + 110px))',
      overscrollBehavior:'contain'}}>
      <BackButton onBack={()=>{setSelected(null);setComment('');}} T={T}/>
      <div style={{fontSize:20,fontWeight:700,color:T.text,marginTop:16,marginBottom:16}}>Bokningsdetaljer</div>
      <div style={{background:T.card,border:`0.5px solid ${T.border}`,borderRadius:16,padding:16,marginBottom:12}}>
        <div style={{display:'flex',gap:8,marginBottom:12}}>
          <Badge status={b.status}/>
          {isRecur&&<RecurBadge recurrence={b.recurrence}/>}
        </div>
        {[['Namn',b.name],['Telefon',b.phone],['Aktivitet',b.activity],['Tid',b.time_slot],
          ['Längd',fmtDuration(b.duration_hours)],['Startdatum',isoToDisplay(b.start_date)],
          ['Upprepning',fmtRecur(b.recurrence)],
        ].map(([l,v])=><div key={l} style={{marginBottom:10,paddingBottom:10,borderBottom:`0.5px solid ${T.separator}`}}>
          <div style={{fontSize:10,fontWeight:700,color:T.textMuted,letterSpacing:'.5px',marginBottom:2}}>{l.toUpperCase()}</div>
          <div style={{fontSize:14,color:T.text}}>{v}</div>
        </div>)}
        {b.notes&&<div style={{marginBottom:10,paddingBottom:10,borderBottom:`0.5px solid ${T.separator}`}}>
          <div style={{fontSize:10,fontWeight:700,color:T.textMuted,letterSpacing:'.5px',marginBottom:2}}>ANTECKNINGAR</div>
          <div style={{fontSize:14,color:T.text}}>{b.notes}</div>
        </div>}
        {b.end_date&&<div style={{marginBottom:10,paddingBottom:10,borderBottom:`0.5px solid ${T.separator}`}}>
          <div style={{fontSize:10,fontWeight:700,color:T.textMuted,letterSpacing:'.5px',marginBottom:2}}>SLUTDATUM</div>
          <div style={{fontSize:14,color:T.text}}>{isoToDisplay(b.end_date)}</div>
        </div>}
        {b.admin_comment&&<div style={{padding:'10px 12px',background:`${T.error}0d`,border:`0.5px solid ${T.error}33`,borderRadius:10}}>
          <div style={{fontSize:10,fontWeight:700,color:T.error,letterSpacing:'.5px',marginBottom:4}}>AVBOKNINGSORSAK</div>
          <div style={{fontSize:14,color:T.text,lineHeight:1.5}}>{b.admin_comment}</div>
        </div>}
      </div>
      {/* Inställda tillfällen — enstaka avbokade dagar med anledning */}
      {isRecur&&<CancelledOccurrencesList bookingId={b.id} exceptions={exceptions} timeSlot={b.time_slot} T={T}/>}
      {isRecur&&upcoming&&<div style={{background:T.card,border:'1px solid #8b5cf644',borderRadius:14,padding:14,marginBottom:12}}>
        <div style={{fontSize:11,fontWeight:700,color:'#8b5cf6',letterSpacing:'.5px',marginBottom:10}}>KOMMANDE TILLFÄLLEN</div>
        {upcoming.map((occ,i)=><div key={i} style={{display:'flex',alignItems:'center',justifyContent:'space-between',
          padding:'8px 0',borderBottom:i<upcoming.length-1?`0.5px solid ${T.separator}`:'none'}}>
          <div>
            <div style={{fontSize:13,fontWeight:600,color:T.text}}>{isoToDisplay(occ.date)}</div>
            <div style={{fontSize:11,color:T.textMuted}}>{occ.time_slot}</div>
          </div>
          <button onClick={()=>setDeleteDialog({booking:b,occurrence_date:occ.date,type:'one'})}
            style={{background:'none',border:'none',cursor:'pointer',color:T.error,fontSize:18,padding:'0 4px',WebkitTapHighlightColor:'transparent'}}>×</button>
        </div>)}
      </div>}
      {(b.status==='pending'||b.status==='edit_pending')&&<div style={{display:'flex',flexDirection:'column',gap:10,marginBottom:12}}>
        <Textarea label="KOMMENTAR (valfritt)" value={comment} onChange={setComment}
          placeholder="Skriv en kommentar till besökaren..." T={T}/>
        <div style={{display:'flex',gap:10}}>
          <button onClick={async()=>{setActionLoading(true);await onApprove(b.id,comment);setActionLoading(false);setSelected(null);setComment('');onMarkAdminSeen?.();onRefreshNotifications?.();}}
            disabled={actionLoading}
            style={{flex:1,padding:'13px',borderRadius:12,border:'none',background:T.success,color:'#fff',fontSize:15,fontWeight:700,cursor:'pointer'}}>
            {actionLoading?'...':'Godkänn'}
          </button>
          <button onClick={async()=>{if(!comment.trim()){alert('Kommentar krävs.');return;}setActionLoading(true);await onReject(b.id,comment);setActionLoading(false);setSelected(null);setComment('');onMarkAdminSeen?.();onRefreshNotifications?.();}}
            disabled={actionLoading}
            style={{flex:1,padding:'13px',borderRadius:12,border:'none',background:T.error,color:'#fff',fontSize:15,fontWeight:700,cursor:'pointer'}}>
            {actionLoading?'...':'Avböj'}
          </button>
        </div>
      </div>}
      {/* Only show edit/delete for active bookings — cancelled ones are already done */}
      {(b.status!=='cancelled'&&b.status!=='rejected')&&<>
        <button onClick={()=>setEditDialog(b)}
          style={{padding:'13px',borderRadius:12,border:`1px solid ${'#24645d'}44`,background:'#24645d11',
            color:'#24645d',fontSize:14,fontWeight:700,cursor:'pointer',
            textAlign:'left',WebkitTapHighlightColor:'transparent',width:'100%',marginBottom:8}}>
          Redigera bokning
        </button>
        <button onClick={()=>setDeleteDialog({booking:b,type:isRecur?'series':'single'})}
          style={{padding:'13px',borderRadius:12,border:`1px solid ${T.error}33`,background:`${T.error}11`,
            color:T.error,fontSize:14,fontWeight:700,cursor:'pointer',
            textAlign:'left',WebkitTapHighlightColor:'transparent',width:'100%'}}>
          {isRecur?'Radera hela serien':'Radera bokning'}
        </button>
      </>}
      {/* Admin edit sheet */}
      {editDialog&&<AdminEditSheet
        booking={editDialog}
        bookings={bookings}
        exceptions={exceptions}
        onSave={async(data)=>{
          await onAdminEdit?.(editDialog.id, data);
          setEditDialog(null);
          setSelected(null);
          onRefreshNotifications?.();
        }}
        onCancel={()=>setEditDialog(null)}
        T={T}
      />}
      {/* Inline delete sheet — avoids position:fixed clipping from parent overflow:hidden */}
      {deleteDialog&&(
        <AdminDeleteSheet
          dialog={deleteDialog}
          actionLoading={actionLoading}
          onConfirm={async(explanation)=>{
            setActionLoading(true);
            if(deleteDialog.type==='series') await onDeleteSeries(deleteDialog.booking,explanation);
            else if(deleteDialog.type==='one') await onDelete(deleteDialog.booking,deleteDialog.occurrence_date,explanation);
            else await onDelete(deleteDialog.booking,null,explanation);
            setActionLoading(false);setDeleteDialog(null);setSelected(null);onRefreshNotifications?.();
          }}
          onCancel={()=>setDeleteDialog(null)}
          T={T}/>
      )}
    </div>;
  }

  return <div style={{paddingTop:'max(20px,env(safe-area-inset-top,0px))',paddingLeft:16,paddingRight:16,paddingBottom:'max(120px,calc(env(safe-area-inset-bottom,0px) + 110px))',overscrollBehavior:'contain'}}>
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
      <div style={{fontSize:26,fontWeight:700,color:T.text,letterSpacing:'-.5px'}}>Adminpanel</div>
      <div style={{display:'flex',gap:8}}>
        <button onClick={()=>onManageUsers?.()} title="Hantera konton"
          style={{width:40,height:40,borderRadius:12,border:`0.5px solid ${T.border}`,
            background:T.card,display:'flex',alignItems:'center',justifyContent:'center',
            cursor:'pointer',color:T.text,WebkitTapHighlightColor:'transparent'}}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
        </button>
        <button onClick={()=>setAddForm({})} title="Lägg till bokning"
          style={{width:40,height:40,borderRadius:12,border:`0.5px solid ${T.border}`,
            background:T.card,display:'flex',alignItems:'center',justifyContent:'center',
            cursor:'pointer',color:T.text,WebkitTapHighlightColor:'transparent'}}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </button>
        <button onClick={onBack} title="Logga ut"
          style={{width:40,height:40,borderRadius:12,border:`1px solid ${T.error}33`,
            background:`${T.error}11`,display:'flex',alignItems:'center',justifyContent:'center',
            cursor:'pointer',color:T.error,WebkitTapHighlightColor:'transparent'}}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
        </button>
      </div>
    </div>
    <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:16}}>
      {filters.map(f=><button key={f.id} onClick={()=>setFilter(f.id)}
        style={{padding:'6px 14px',borderRadius:20,
          border:`1px solid ${filter===f.id?T.accent:T.border}`,
          background:filter===f.id?`${T.accent}22`:'none',
          color:filter===f.id?T.accent:T.textMuted,
          fontSize:12,fontWeight:600,cursor:'pointer',
          fontFamily:'system-ui',WebkitTapHighlightColor:'transparent',
          display:'flex',alignItems:'center',gap:5}}>
        {f.label}
        {f.count>0&&<span style={{background:filter===f.id?T.accent:'#88888844',
          color:filter===f.id?'#fff':T.textMuted,borderRadius:8,fontSize:10,fontWeight:800,padding:'1px 6px'}}>
          {f.count}
        </span>}
      </button>)}
    </div>
    {sorted.length===0&&filter!=='cancelled'&&<div style={{textAlign:'center',padding:'40px 0',color:T.textMuted,fontSize:14}}>
      Inga bokningar i denna kategori.
    </div>}
    {filter==='cancelled'&&cancelledItems.length===0&&<div style={{textAlign:'center',padding:'40px 0',color:T.textMuted,fontSize:14}}>
      Inga inställda bokningar.
    </div>}
    <div style={{display:'flex',flexDirection:'column',gap:10}}>
      {/* Inställda-filter: visa både hela avbokade bokningar och enstaka user-avbokade tillfällen */}
      {filter==='cancelled'?cancelledItems.map((item,idx)=>{
        if(item._type==='exception') {
          const b=item._booking;
          if(!b) return null;
          return <div key={`exc-${item.id}`}
            onClick={()=>onOpenBookingDetail?.(b,item.exception_date)}
            style={{background:T.card,border:`0.5px solid #3b82f644`,
              borderLeft:`3px solid #3b82f6`,
              borderRadius:14,padding:'14px 16px',cursor:'pointer'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6}}>
              <div style={{display:'flex',alignItems:'center',gap:6}}>
                <span style={{background:'#3b82f622',color:'#3b82f6',borderRadius:8,
                  fontSize:11,fontWeight:700,padding:'3px 8px',fontFamily:'system-ui'}}>Enstaka tillfälle</span>
                {b.recurrence&&b.recurrence!=='none'&&<RecurBadge recurrence={b.recurrence}/>}
              </div>
              <span style={{fontSize:11,color:T.textMuted}}>{isoToDisplay(item.exception_date)}</span>
            </div>
            <div style={{fontSize:15,fontWeight:600,color:T.text,marginBottom:2}}>{b.name}</div>
            <div style={{fontSize:13,color:T.textMuted,marginBottom:4}}>{b.activity}</div>
            <div style={{fontSize:12,color:T.textMuted}}>{b.time_slot} · {fmtDuration(b.duration_hours)}</div>
            <div style={{fontSize:11,color:'#3b82f6',marginTop:6,fontWeight:600}}>Avbokat av besökaren — öppna bokning →</div>
          </div>;
        }
        // Hel avbokad bokning
        const b=item;
        const isRecur=b.recurrence&&b.recurrence!=='none';
        const nextOcc=isRecur?expandBooking(b,today,wEnd,exceptions)[0]:null;
        const displayDate=nextOcc?.date||b.start_date;
        const isHL=b.id===adminHighlightId;
        const hlColor=T.accentBlue||'#3b82f6';
        return <div key={b.id} ref={b.id===adminHighlightId?highlightRef:null}
          onClick={()=>{setSelected(b);setComment('');}}
          style={{background:T.card,
            border:`0.5px solid ${isHL?hlColor:T.border}`,
            borderRadius:14,padding:'14px 16px',cursor:'pointer',
            boxShadow:isHL?`0 0 0 3px ${hlColor}33`:'none',
            animation:isHL?`bsHighlight 1.2s ease-in-out 3`:'none',
            '--hl':`${hlColor}55`}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <Badge status={b.status}/>
              {isRecur&&<RecurBadge recurrence={b.recurrence}/>}
            </div>
            <span style={{fontSize:11,color:T.textMuted}}>{isoToDisplay(displayDate)}</span>
          </div>
          <div style={{fontSize:15,fontWeight:600,color:T.text,marginBottom:2}}>{b.name}</div>
          <div style={{fontSize:13,color:T.textMuted,marginBottom:4}}>{b.activity}</div>
          <div style={{fontSize:12,color:T.textMuted}}>{b.time_slot} · {fmtDuration(b.duration_hours)}</div>
        </div>;
      }):(
        sorted.map(b=>{
          const isRecur=b.recurrence&&b.recurrence!=='none';
          const nextOcc=isRecur?expandBooking(b,today,wEnd,exceptions)[0]:null;
          const displayDate=nextOcc?.date||b.start_date;
          const isHL=b.id===adminHighlightId;
          const hlColor=adminHighlightFilter==='cancelled'?T.accentBlue:T.warning;
          const isPending=b.status==='pending'||b.status==='edit_pending';
          return <div key={b.id} ref={b.id===adminHighlightId?highlightRef:null}
            onClick={()=>{setSelected(b);setComment('');}}
            style={{background:T.card,
              border:`0.5px solid ${isHL?hlColor:isPending?`${T.warning}44`:T.border}`,
              borderRadius:14,padding:'14px 16px',cursor:'pointer',
              boxShadow:isHL?`0 0 0 3px ${hlColor}33`:'none',
              animation:isHL?`bsHighlight 1.2s ease-in-out 3`:isPending?'bsPulse 2s ease-in-out infinite':'none',
              '--hl':`${hlColor}55`}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <Badge status={b.status}/>
                {isRecur&&<RecurBadge recurrence={b.recurrence}/>}
              </div>
              <span style={{fontSize:11,color:T.textMuted}}>{isoToDisplay(displayDate)}</span>
            </div>
            <div style={{fontSize:15,fontWeight:600,color:T.text,marginBottom:2}}>{b.name}</div>
            <div style={{fontSize:13,color:T.textMuted,marginBottom:4}}>{b.activity}</div>
            <div style={{fontSize:12,color:T.textMuted}}>{b.time_slot} · {fmtDuration(b.duration_hours)}</div>
          </div>;
        })
      )}
    </div>
    {addForm!==null&&<AdminAddForm bookings={bookings} exceptions={exceptions}
      onSubmit={async data=>{await onAdminAddRecurring(data);setAddForm(null);}}
      onClose={()=>setAddForm(null)}
      onOpenDetail={(b,date)=>{
        setAddForm(null);
        onOpenBookingDetail?.(b,date);
      }}
      T={T}/>}
  </div>;
}

// ─── Login ────────────────────────────────────────────────────────────────────
function UserLogin({onSuccess,onBack,T}) {
  const[step,setStep]=useState('phone');
  const[phone,setPhone]=useState('');
  const[pin,setPin]=useState('');
  const[inviteCode,setInviteCode]=useState('');
  const[newPin,setNewPin]=useState('');
  const[newPin2,setNewPin2]=useState('');
  const[loading,setLoading]=useState(false);
  const[error,setError]=useState('');
  const[userData,setUserData]=useState(null);
  const lookupRef=useRef(null);

  const handlePhoneChange=val=>{
    setPhone(val);setError('');
    clearTimeout(lookupRef.current);
    const norm=normalizePhone(val);
    if(norm.length>=10) {
      lookupRef.current=setTimeout(async()=>{
        const{data}=await supabase.from('app_users').select('id,name,role,invite_used,pin_hash,deleted_at').eq('phone',norm).maybeSingle();
        if(data&&!data.deleted_at){setUserData({...data,norm});setStep(data.invite_used?'pin':'invite');}
      },400);
    }
  };
  const handlePhoneNext=async()=>{
    if(!phone.trim()){setError('Ange ditt telefonnummer.');return;}
    setLoading(true);setError('');
    const norm=normalizePhone(phone);
    const{data}=await supabase.from('app_users').select('id,name,role,invite_used,pin_hash,deleted_at').eq('phone',norm).maybeSingle();
    setLoading(false);
    if(!data||data.deleted_at){setError('Inget konto hittades. Kontakta admin.');return;}
    setUserData({...data,norm});setStep(data.invite_used?'pin':'invite');
  };
  const handleInviteSubmit=async()=>{
    if(inviteCode.length!==6){setError('Ange 6-siffrig kod.');return;}
    setLoading(true);setError('');
    const{data}=await supabase.from('app_users').select('invite_code').eq('id',userData.id).maybeSingle();
    if(data?.invite_code!==inviteCode){setLoading(false);setError('Fel kod.');return;}
    setLoading(false);setStep('setpin');
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
    if(userData.role==='admin') localStorage.setItem(STORAGE_ADMIN,'true');
    onSuccess({id:userData.id,name:userData.name,role:userData.role});
  };
  const handlePinSubmit=async()=>{
    setLoading(true);setError('');
    const pinHash=await sha256(userData.norm+':'+pin);
    if(pinHash!==userData.pin_hash){setLoading(false);setError('Fel PIN-kod.');setPin('');return;}
    await supabase.from('app_users').update({last_login:Date.now()}).eq('id',userData.id);
    setLoading(false);
    localStorage.setItem(STORAGE_USER_ID,userData.id);
    localStorage.setItem(STORAGE_USER_NAME,userData.name);
    localStorage.setItem(STORAGE_USER_ROLE,userData.role);
    localStorage.setItem(STORAGE_PHONE,userData.norm);
    if(userData.role==='admin') localStorage.setItem(STORAGE_ADMIN,'true');
    else localStorage.removeItem(STORAGE_ADMIN);
    onSuccess({id:userData.id,name:userData.name,role:userData.role});
  };

  const iconS={width:56,height:56,borderRadius:'50%',background:`${T.accent}22`,
    display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 14px'};
  const inputS={background:T.cardElevated,border:`0.5px solid ${T.border}`,
    borderRadius:12,padding:'13px 16px',fontSize:18,color:T.text,outline:'none',
    width:'100%',boxSizing:'border-box'};
  const btnS={marginTop:16,width:'100%',padding:'14px',borderRadius:12,border:'none',
    background:T.accent,color:'#fff',fontSize:16,fontWeight:700,cursor:'pointer'};

  return <div style={{paddingTop:'max(20px,env(safe-area-inset-top,0px))',
    paddingLeft:16,paddingRight:16,paddingBottom:20}}>
    {onBack&&<BackButton onBack={onBack} T={T}/>}
    <div style={{marginTop:24,maxWidth:340,margin:'24px auto 0'}}>
      {step==='phone'&&<>
        <div style={{textAlign:'center',marginBottom:24}}>
          <div style={iconS}><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="1.8" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div>
          <div style={{fontSize:20,fontWeight:700,color:T.text}}>Åtkomst för behöriga</div>
          <div style={{fontSize:13,color:T.textMuted,marginTop:4}}>Ange ditt telefonnummer</div>
        </div>
        <input type="tel" value={phone} onChange={e=>handlePhoneChange(e.target.value)}
          onKeyDown={e=>e.key==='Enter'&&handlePhoneNext()} placeholder="07X-XXX XX XX" autoFocus
          style={inputS}/>
        {error&&<div style={{fontSize:13,color:T.error,background:`${T.error}18`,padding:'10px 14px',borderRadius:8,marginTop:8}}>{error}</div>}
        <button onClick={handlePhoneNext} disabled={loading} style={btnS}>{loading?'Kontrollerar...':'Fortsätt →'}</button>
      </>}
      {step==='invite'&&<>
        <div style={{textAlign:'center',marginBottom:24}}>
          <div style={iconS}><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></div>
          <div style={{fontSize:20,fontWeight:700,color:T.text}}>Välkommen, {userData?.name}</div>
          <div style={{fontSize:13,color:T.textMuted,marginTop:4}}>Ange din 6-siffriga inbjudningskod</div>
        </div>
        <input type="tel" inputMode="numeric" maxLength={6} value={inviteCode}
          onChange={e=>{setInviteCode(e.target.value.replace(/\D/g,'').slice(0,6));setError('');}}
          placeholder="- - - - - -"
          style={{...inputS,fontSize:28,textAlign:'center',letterSpacing:12}}/>
        {error&&<div style={{fontSize:13,color:T.error,background:`${T.error}18`,padding:'10px 14px',borderRadius:8,marginTop:8}}>{error}</div>}
        <button onClick={handleInviteSubmit} disabled={loading} style={btnS}>{loading?'Kontrollerar...':'Verifiera kod →'}</button>
        <button onClick={()=>{setStep('phone');setError('');}}
          style={{marginTop:10,background:'none',border:'none',color:T.textMuted,cursor:'pointer',fontSize:13,width:'100%'}}>← Byt telefonnummer</button>
      </>}
      {step==='setpin'&&<>
        <div style={{textAlign:'center',marginBottom:24}}>
          <div style={iconS}><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></div>
          <div style={{fontSize:20,fontWeight:700,color:T.text}}>Välj PIN-kod</div>
        </div>
        <input type="password" inputMode="numeric" maxLength={6} value={newPin}
          onChange={e=>{setNewPin(e.target.value.replace(/\D/g,'').slice(0,6));setError('');}}
          placeholder="Välj PIN (4-6 siffror)"
          style={{...inputS,fontSize:24,textAlign:'center',letterSpacing:8,marginBottom:10}}/>
        <input type="password" inputMode="numeric" maxLength={6} value={newPin2}
          onChange={e=>{setNewPin2(e.target.value.replace(/\D/g,'').slice(0,6));setError('');}}
          placeholder="Upprepa PIN"
          style={{...inputS,fontSize:24,textAlign:'center',letterSpacing:8}}/>
        {error&&<div style={{fontSize:13,color:T.error,background:`${T.error}18`,padding:'10px 14px',borderRadius:8,marginTop:8}}>{error}</div>}
        <button onClick={handleSetPin} disabled={loading} style={btnS}>{loading?'Sparar...':'Spara PIN & logga in'}</button>
      </>}
      {step==='pin'&&<>
        <div style={{textAlign:'center',marginBottom:24}}>
          <div style={iconS}><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="1.8" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div>
          <div style={{fontSize:20,fontWeight:700,color:T.text}}>Välkommen, {userData?.name}</div>
          <div style={{fontSize:13,color:T.textMuted,marginTop:4}}>Ange din PIN-kod</div>
        </div>
        <input type="password" inputMode="numeric" maxLength={6} value={pin}
          onChange={async e=>{
            const val=e.target.value.replace(/\D/g,'').slice(0,6);
            setPin(val);setError('');
            if(val.length>=4&&userData?.pin_hash) {
              const hash=await sha256(userData.norm+':'+val);
              if(hash===userData.pin_hash) {
                setLoading(true);
                await supabase.from('app_users').update({last_login:Date.now()}).eq('id',userData.id);
                setLoading(false);
                localStorage.setItem(STORAGE_USER_ID,userData.id);
                localStorage.setItem(STORAGE_USER_NAME,userData.name);
                localStorage.setItem(STORAGE_USER_ROLE,userData.role);
                localStorage.setItem(STORAGE_PHONE,userData.norm);
                if(userData.role==='admin') localStorage.setItem(STORAGE_ADMIN,'true');
                else localStorage.removeItem(STORAGE_ADMIN);
                onSuccess({id:userData.id,name:userData.name,role:userData.role});
              }
            }
          }}
          onKeyDown={e=>e.key==='Enter'&&handlePinSubmit()}
          placeholder="PIN-kod" autoFocus
          style={{...inputS,fontSize:28,textAlign:'center',letterSpacing:12}}/>
        {error&&<div style={{fontSize:13,color:T.error,background:`${T.error}18`,padding:'10px 14px',borderRadius:8,marginTop:8}}>{error}</div>}
        <button onClick={handlePinSubmit} disabled={loading} style={btnS}>{loading?'Loggar in...':'Logga in'}</button>
        <button onClick={()=>{setStep('phone');setPhone('');setError('');setUserData(null);}}
          style={{marginTop:10,background:'none',border:'none',color:T.textMuted,cursor:'pointer',fontSize:13,width:'100%'}}>← Byt konto</button>
      </>}
    </div>
  </div>;
}

// ─── User Management ──────────────────────────────────────────────────────────
function UserManagement({onBack,T}) {
  const[users,setUsers]=useState([]);
  const[loading,setLoading]=useState(true);
  const[showCreate,setShowCreate]=useState(false);
  const[form,setForm]=useState({name:'',phone:'',role:'user'});
  const[creating,setCreating]=useState(false);
  const[newInvite,setNewInvite]=useState(null);
  const[resetTarget,setResetTarget]=useState(null);
  const[deleteTarget,setDeleteTarget]=useState(null);
  const[deleting,setDeleting]=useState(false);
  const[error,setError]=useState('');
  const currentUserId=localStorage.getItem(STORAGE_USER_ID);

  const load=async()=>{
    setLoading(true);
    const{data}=await supabase.from('app_users').select('id,name,phone,role,invite_used,created_at,last_login,deleted_at,deleted_by_name').order('created_at',{ascending:false});
    if(data) setUsers(data);setLoading(false);
  };
  useEffect(()=>{load();},[]);// eslint-disable-line

  const handleCreate=async()=>{
    if(!form.name.trim()||!form.phone.trim()){setError('Namn och telefon krävs.');return;}
    setCreating(true);setError('');
    const norm=normalizePhone(form.phone);
    const existing=await supabase.from('app_users').select('id').eq('phone',norm).maybeSingle();
    if(existing.data){setCreating(false);setError('Det finns redan ett konto med detta nummer.');return;}
    const code=generateInviteCode();
    const{error:err}=await supabase.from('app_users').insert([{
      id:uid(),name:form.name.trim(),phone:norm,role:form.role,
      invite_code:code,invite_used:false,
      created_by:currentUserId,created_at:Date.now(),last_login:null,pin_hash:null}]);
    setCreating(false);
    if(err){setError('Kunde inte skapa konto: '+err.message);return;}
    setNewInvite({name:form.name.trim(),code,phone:norm});
    setForm({name:'',phone:'',role:'user'});setShowCreate(false);load();
  };
  const handleResetPin=async user=>{
    const code=generateInviteCode();
    await supabase.from('app_users').update({invite_code:code,invite_used:false,pin_hash:null}).eq('id',user.id);
    setResetTarget({...user,code});load();
  };
  const handleDelete=async()=>{
    if(!deleteTarget) return;
    setDeleting(true);
    const adminName=localStorage.getItem(STORAGE_USER_NAME)||'Okänd admin';
    const adminId=localStorage.getItem(STORAGE_USER_ID)||'?';
    await supabase.from('app_users').update({deleted_at:Date.now(),deleted_by_id:adminId,deleted_by_name:adminName,pin_hash:null,invite_code:null}).eq('id',deleteTarget.id);
    setDeleting(false);setDeleteTarget(null);load();
  };

  return <div style={{paddingTop:'max(20px,env(safe-area-inset-top,0px))',paddingLeft:16,paddingRight:16,paddingBottom:20,minHeight:'100%',background:T.bg}}>
    <BackButton onBack={onBack} T={T}/>
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginTop:16,marginBottom:20}}>
      <div style={{fontSize:26,fontWeight:700,color:T.text}}>Hantera konton</div>
      <button onClick={()=>setShowCreate(v=>!v)} style={{background:T.accent,color:'#fff',
        border:'none',borderRadius:12,padding:'8px 16px',fontSize:13,fontWeight:700,
        cursor:'pointer',WebkitTapHighlightColor:'transparent',
        display:'flex',alignItems:'center',gap:6}}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        Nytt konto
      </button>
    </div>
    {(newInvite||resetTarget)&&<div style={{background:`${T.accent}18`,border:`1px solid ${T.accent}44`,borderRadius:16,padding:16,marginBottom:16}}>
      <div style={{fontSize:13,fontWeight:700,color:T.accent,marginBottom:8}}>
        {newInvite?`✓ Konto skapat för ${newInvite.name}`:`✓ Ny kod för ${resetTarget.name}`}
      </div>
      <div style={{display:'flex',alignItems:'center',gap:10,background:T.bg,borderRadius:10,padding:'10px 14px'}}>
        <span style={{fontSize:28,fontWeight:800,color:T.accent,letterSpacing:8}}>
          {newInvite?.code||resetTarget?.code}
        </span>
        <button onClick={()=>navigator.clipboard?.writeText(newInvite?.code||resetTarget?.code)}
          style={{background:'none',border:`0.5px solid ${T.border}`,borderRadius:8,padding:'5px 10px',fontSize:12,color:T.textMuted,cursor:'pointer'}}>
          Kopiera
        </button>
      </div>
      <button onClick={()=>{setNewInvite(null);setResetTarget(null);}}
        style={{marginTop:10,background:'none',border:'none',color:T.textMuted,cursor:'pointer',fontSize:12}}>Stäng ×</button>
    </div>}
    {showCreate&&<div style={{background:T.card,border:`0.5px solid ${T.border}`,borderRadius:16,padding:16,marginBottom:16}}>
      <div style={{fontSize:15,fontWeight:700,color:T.text,marginBottom:14}}>Skapa nytt konto</div>
      <div style={{display:'flex',flexDirection:'column',gap:10}}>
        <Input label="NAMN" value={form.name} onChange={v=>setForm(p=>({...p,name:v}))} placeholder="Personens namn" required T={T}/>
        <Input label="TELEFON" value={form.phone} onChange={v=>setForm(p=>({...p,phone:v}))} placeholder="07X-XXX XX XX" T={T} type="tel"/>
        <div>
          <label style={{fontSize:12,fontWeight:600,color:T.textMuted,letterSpacing:'.3px'}}>ROLL</label>
          <div style={{display:'flex',gap:8,marginTop:6}}>
            {['user','admin'].map(r=><button key={r} onClick={()=>setForm(p=>({...p,role:r}))}
              style={{flex:1,padding:'10px',borderRadius:10,border:`0.5px solid ${form.role===r?T.accent:T.border}`,
                background:form.role===r?`${T.accent}18`:'none',color:form.role===r?T.accent:T.textMuted,
                fontWeight:600,fontSize:13,cursor:'pointer',WebkitTapHighlightColor:'transparent'}}>
              {r==='admin'?'Admin':'Användare'}
            </button>)}
          </div>
        </div>
        {error&&<div style={{fontSize:13,color:T.error,background:`${T.error}15`,borderRadius:8,padding:'8px 12px'}}>{error}</div>}
        <div style={{display:'flex',gap:8}}>
          <button onClick={()=>{setShowCreate(false);setError('');}}
            style={{flex:1,padding:'11px',borderRadius:10,border:`0.5px solid ${T.border}`,background:'none',color:T.textMuted,fontWeight:600,cursor:'pointer'}}>Avbryt</button>
          <button onClick={handleCreate} disabled={creating}
            style={{flex:1,padding:'11px',borderRadius:10,border:'none',background:T.accent,color:'#fff',fontWeight:700,cursor:'pointer',WebkitTapHighlightColor:'transparent'}}>
            {creating?'Skapar...':'Skapa konto'}
          </button>
        </div>
      </div>
    </div>}
    {deleteTarget&&<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',zIndex:100,
      display:'flex',alignItems:'flex-end',justifyContent:'center',padding:'0 16px 32px'}}>
      <div style={{background:T.card,borderRadius:20,padding:24,width:'100%',maxWidth:400}}>
        <div style={{fontSize:17,fontWeight:700,color:T.text,marginBottom:8}}>Radera konto?</div>
        <div style={{fontSize:13,color:T.textMuted,marginBottom:20,lineHeight:1.5}}>
          <strong style={{color:T.text}}>{deleteTarget.name}</strong> ({deleteTarget.phone})<br/>
          Kontot inaktiveras. Bokningar påverkas inte.
        </div>
        <div style={{display:'flex',gap:10}}>
          <button onClick={()=>setDeleteTarget(null)}
            style={{flex:1,padding:'12px',borderRadius:12,border:`0.5px solid ${T.border}`,background:'none',color:T.text,fontWeight:600,cursor:'pointer',fontSize:14}}>Avbryt</button>
          <button onClick={handleDelete} disabled={deleting}
            style={{flex:1,padding:'12px',borderRadius:12,border:'none',background:T.error,color:'#fff',fontWeight:700,cursor:'pointer',fontSize:14,WebkitTapHighlightColor:'transparent'}}>
            {deleting?'Raderar...':'Radera konto'}
          </button>
        </div>
      </div>
    </div>}
    {loading?<Spinner T={T}/>:(
      <div style={{display:'flex',flexDirection:'column',gap:8}}>
        {users.filter(u=>!u.deleted_at).length===0&&<div style={{textAlign:'center',color:T.textMuted,padding:'40px 0'}}>Inga aktiva konton</div>}
        {users.filter(u=>!u.deleted_at).map(u=>(
          <div key={u.id} style={{background:T.card,border:`0.5px solid ${T.border}`,borderRadius:14,padding:'14px 16px'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6}}>
              <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                <div style={{fontSize:15,fontWeight:700,color:T.text}}>{u.name}</div>
                <span style={{background:u.role==='admin'?'#FF9F0A22':'#34C75922',color:u.role==='admin'?'#FF9F0A':'#34C759',
                  borderRadius:8,fontSize:11,fontWeight:700,padding:'2px 8px'}}>
                  {u.role==='admin'?'Admin':'Användare'}
                </span>
                {!u.invite_used&&<span style={{background:'#FF9F0A22',color:'#FF9F0A',borderRadius:8,fontSize:10,fontWeight:700,padding:'2px 7px'}}>Ej aktiverat</span>}
              </div>
              {u.id!==currentUserId&&<button onClick={()=>setDeleteTarget(u)}
                style={{background:`${T.error}18`,border:`1px solid ${T.error}33`,borderRadius:8,cursor:'pointer',
                  color:T.error,fontSize:12,fontWeight:600,padding:'4px 10px',WebkitTapHighlightColor:'transparent'}}>
                Radera
              </button>}
            </div>
            <div style={{fontSize:12,color:T.textMuted,marginBottom:8}}>{u.phone}</div>
            <button onClick={()=>handleResetPin(u)}
              style={{padding:'5px 12px',borderRadius:8,border:`0.5px solid ${T.border}`,background:T.cardElevated,
                color:T.textMuted,fontSize:12,fontWeight:600,cursor:'pointer',WebkitTapHighlightColor:'transparent'}}>
              Ny inbjudningskod
            </button>
          </div>
        ))}
        {users.filter(u=>u.deleted_at).length>0&&<>
          <div style={{fontSize:12,fontWeight:700,color:T.textMuted,letterSpacing:'.5px',marginTop:24,marginBottom:10}}>RADERADE KONTON</div>
          {users.filter(u=>u.deleted_at).map(u=>(
            <div key={u.id} style={{background:T.card,border:`1px solid ${T.error}33`,borderRadius:14,padding:'14px 16px',opacity:0.6}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:4}}>
                <div style={{fontSize:14,fontWeight:700,color:T.textMuted,textDecoration:'line-through'}}>{u.name}</div>
                <span style={{background:`${T.error}22`,color:T.error,borderRadius:8,fontSize:10,fontWeight:700,padding:'2px 8px'}}>Raderat</span>
              </div>
              <div style={{fontSize:12,color:T.textMuted}}>{u.phone}</div>
              <div style={{fontSize:11,color:T.textMuted,marginTop:4}}>
                Raderades av <strong style={{color:T.text}}>{u.deleted_by_name||'Okänd'}</strong>
              </div>
            </div>
          ))}
        </>}
      </div>
    )}
  </div>;
}

// ─── Main BookingScreen ────────────────────────────────────────────────────────
export default function BookingScreen({
  onTabBarHide,onTabBarShow,
  activateForDevice,registerAdminDevice,dismissAdminDevice,
  onRefreshNotifications,
  startAtAdminLogin,startAtAdmin,
  highlightBookingId,highlightFilter,
  onMarkAdminSeen,markVisitorSeen,
  adminInitialFilter,
  adminHighlightId=null,adminHighlightFilter=null,
  cancelledBookingIds=[],pendingBookingIds=[],
  visitorUnread=0,
  refreshKey=0,
}) {
  const{theme:T}=useTheme();
  const isPWA=useIsPWA();
  const[bookings,setBookings]=useState([]);
  const[exceptions,setExceptions]=useState([]);
  const[dbLoading,setDbLoading]=useState(true);
  const[submitLoading,setSubmitLoading]=useState(false);
  const[toast,setToast]=useState('');

  const[view,setView]=useState(()=>{
    const userId=localStorage.getItem(STORAGE_USER_ID);
    if(!userId) return 'login';
    if(startAtAdmin) return 'admin';
    if(highlightBookingId) return 'my-bookings';
    return 'calendar';
  });

  const today=new Date();today.setHours(0,0,0,0);
  const[selectedDate,setSelectedDate]=useState(today);
  const[showYearView,setShowYearView]=useState(false);
  const[showSearch,setShowSearch]=useState(false);
  const[yearViewYear,setYearViewYear]=useState(today.getFullYear());
  const[pendingFormDate,setPendingFormDate]=useState(null);
  const[adminMode,setAdminMode]=useState(()=>localStorage.getItem(STORAGE_ADMIN)==='true');
  const[loggedInUser,setLoggedInUser]=useState(()=>{
    const id=localStorage.getItem(STORAGE_USER_ID);
    const name=localStorage.getItem(STORAGE_USER_NAME);
    return id&&name?{id,name}:null;
  });
  const[calendarAdminDetail,setCalendarAdminDetail]=useState(null);
  const[internalAdminHighlight,setInternalAdminHighlight]=useState(null);
  const[internalHighlightId,setInternalHighlightId]=useState(null); // user: open specific booking in my-bookings
  const[internalHighlightBooking,setInternalHighlightBooking]=useState(null); // the actual booking object, avoids find() race
  // Universal booking detail — for search results and day panel clicks (all users)
  const[bookingDetail,setBookingDetail]=useState(null);
  const[clickedOccurrenceDate,setClickedOccurrenceDate]=useState(null); // which occurrence was tapped
  const[occDeleteDialog,setOccDeleteDialog]=useState(null); // admin: delete single occurrence from detail sheet
  const[userCancelConfirm,setUserCancelConfirm]=useState(null); // user: confirm before cancelling

  const deviceId=useRef((()=>{
    let id=localStorage.getItem(STORAGE_DEVICE);
    if(!id){id=Date.now().toString(36)+Math.random().toString(36).slice(2,9);localStorage.setItem(STORAGE_DEVICE,id);}
    return id;
  })()).current;

  const showToast=useCallback(msg=>{setToast(msg);setTimeout(()=>setToast(''),3000);},[]);

  // Offline booking queue
  const{submitBooking:submitOffline,offlineStatus}=useOfflineBooking({
    supabase,
    onSuccess:(booking,skipDates)=>{
      // Merge synced booking into state
      setBookings(prev=>prev.some(b=>b.id===booking.id)?prev:[booking,...prev]);
      if(skipDates&&skipDates.length>0){
        setExceptions(prev=>[...prev,...skipDates.map(date=>({
          id:uid(),booking_id:booking.id,exception_date:date,type:'skip',created_at:Date.now()
        }))]);
      }
    },
    onError:err=>showToast(`Fel: ${err.message}`),
  });

  // Make tab bar callbacks available to all sub-components (sheets, forms)
  useEffect(()=>{
    _tabBarCallbacks.hide = onTabBarHide;
    _tabBarCallbacks.show = onTabBarShow;
    return()=>{ _tabBarCallbacks.hide=null; _tabBarCallbacks.show=null; };
  },[onTabBarHide,onTabBarShow]);

  // suppressFetchRef: timestamp until which fetchAll will not overwrite bookings state.
  // Set by optimistic updates (approve/reject/cancel) to prevent Realtime from
  // briefly showing stale data right after an admin action.
  const suppressFetchRef=useRef(0);

  const fetchAll=useCallback(async()=>{
    const[{data:bData},{data:eData}]=await Promise.all([
      supabase.from('bookings').select('*').order('created_at',{ascending:false}),
      supabase.from('booking_exceptions').select('*'),
    ]);
    // If an optimistic update was made recently, merge instead of replace.
    // This ensures the in-flight DB write wins over a stale read.
    if(bData){
      if(Date.now()<suppressFetchRef.current){
        // Merge: keep optimistic status/admin_comment for suppressed IDs,
        // update everything else from DB.
        setBookings(prev=>{
          const optimisticMap=new Map(prev.map(b=>[b.id,b]));
          return bData.map(dbRow=>{
            const opt=optimisticMap.get(dbRow.id);
            // If our optimistic version has a newer resolved_at, keep it
            if(opt&&(opt.resolved_at||0)>(dbRow.resolved_at||0)) return opt;
            return dbRow;
          });
        });
      } else {
        setBookings(bData);
      }
    }
    if(eData) setExceptions(eData);
    setDbLoading(false);
  },[]);

  const hasFetchedRef=useRef(false);

  useEffect(()=>{
    const userId=localStorage.getItem(STORAGE_USER_ID);
    const devId=localStorage.getItem(STORAGE_DEVICE);
    if(!userId&&!devId){setDbLoading(false);return;}

    const initFetch=async()=>{
      // Step 1: fetch only this user's bookings — fast, makes DayPanel clickable immediately
      if(userId){
        const{data:mine}=await supabase
          .from('bookings').select('*')
          .eq('user_id',userId)
          .order('created_at',{ascending:false});
        if(mine&&mine.length>0){
          setBookings(mine);
          setDbLoading(false);
        }
      }
      // Step 2: full table fetch
      await fetchAll();
      hasFetchedRef.current=true;
    };
    initFetch();
  },[fetchAll]);

  // Re-fetch when user taps "Boka lokal" tab (refreshKey increments each press)
  // Skip the very first value (handled by initFetch above)
  useEffect(()=>{
    if(!hasFetchedRef.current) return; // initial fetch not done yet, skip
    const userId=localStorage.getItem(STORAGE_USER_ID);
    const devId=localStorage.getItem(STORAGE_DEVICE);
    if(!userId&&!devId) return;
    fetchAll();
  },[refreshKey]); // eslint-disable-line

  useEffect(()=>{
    let timer=null;
    // Increase debounce to 1200ms — gives DB time to fully commit before we read back.
    const debounced=()=>{clearTimeout(timer);timer=setTimeout(fetchAll,1200);};
    const ch=supabase.channel('booking-v3-rt')
      .on('postgres_changes',{event:'*',schema:'public',table:'bookings'},debounced)
      .on('postgres_changes',{event:'*',schema:'public',table:'booking_exceptions'},debounced)
      .subscribe();
    return()=>{clearTimeout(timer);supabase.removeChannel(ch);};
  },[fetchAll]);

  const prevHLRef=useRef(null);
  useEffect(()=>{
    const prev=prevHLRef.current;prevHLRef.current=highlightBookingId;
    if(highlightBookingId&&!prev) setView('my-bookings');
  },[highlightBookingId]);// eslint-disable-line

  const prevStartAtAdminRef=useRef(startAtAdmin);
  useEffect(()=>{
    const prev=prevStartAtAdminRef.current;prevStartAtAdminRef.current=startAtAdmin;
    if(startAtAdmin&&!prev) setView('admin');
  },[startAtAdmin]);// eslint-disable-line

  const viewRef=useRef(view);
  useEffect(()=>{viewRef.current=view;},[view]);
  const showYearViewRef=useRef(false);
  const bookingDetailRef=useRef(null);
  useEffect(()=>{bookingDetailRef.current=bookingDetail;},[bookingDetail]);
  useEffect(()=>{
    showYearViewRef.current=showYearView;
    if(showYearView) onTabBarHide?.();
    else onTabBarShow?.();
  },[showYearView]);// eslint-disable-line
  useEffect(()=>{
    const h=()=>{
      // Close booking detail sheet first if open
      if(bookingDetailRef.current){setBookingDetail(null);return;}
      // Year view is open — close it first (restores tab bar via effect above)
      if(showYearViewRef.current){setShowYearView(false);return;}
      if(viewRef.current==='login') return;
      const userId=localStorage.getItem(STORAGE_USER_ID);
      if(!userId) return;
      if(viewRef.current!=='calendar') setView('calendar');
    };
    window.addEventListener('edgeSwipeBack',h);
    return()=>window.removeEventListener('edgeSwipeBack',h);
  },[]);

  useEffect(()=>{
    // Only manage tab bar for view changes (year view tab bar handled separately above)
    if(!showYearViewRef.current) onTabBarShow?.();
    if(view==='my-bookings') markVisitorSeen?.();
    if(view==='admin') onMarkAdminSeen?.();
    // Reset Shell scroll to top and show tab bar on every internal view change
    // This prevents the scroll-hide from keeping tab bar hidden after navigating
    window.dispatchEvent(new CustomEvent('scrollToTop'));
  },[view]);// eslint-disable-line

  const myBookings=useMemo(()=>{
    const userId=localStorage.getItem(STORAGE_USER_ID);
    return bookings.filter(b=>(userId&&b.user_id===userId)||b.device_id===deviceId);
  },[bookings,deviceId]);

  // Memoize as Set so DayPanel doesn't get a new object every render
  const myBookingIds=useMemo(()=>new Set(myBookings.map(b=>b.id)),[myBookings]);

  // ── DB actions ────────────────────────────────────────────────────────────────
  const handleSubmitBooking=useCallback(async formData=>{
    setSubmitLoading(true);
    const userId=localStorage.getItem(STORAGE_USER_ID)||loggedInUser?.id||null;
    const booking={id:uid(),name:formData.name,phone:formData.phone,
      activity:formData.activity,notes:formData.notes||'',
      time_slot:formData.time_slot,duration_hours:formData.duration_hours,
      start_date:formData.date,end_date:formData.end_date||null,
      recurrence:formData.recurrence||'none',status:'pending',
      admin_comment:'',created_at:Date.now(),resolved_at:null,
      device_id:deviceId,user_id:userId};
    const skipDates=formData.skip_dates||[];
    const{queued,error}=await submitOffline(booking,skipDates);
    setSubmitLoading(false);
    if(error){showToast(`Fel: ${error.message}`);return;}
    activateForDevice?.();
    localStorage.setItem(STORAGE_PHONE,normalizePhone(formData.phone));
    if(!queued){
      // Online: onSuccess callback in useOfflineBooking already adds booking to state
      // Exceptions are handled by onSuccess too — just show toast
      if(skipDates.length>0){
        const excs=skipDates.map(date=>({id:uid(),booking_id:booking.id,exception_date:date,type:'skip',created_at:Date.now()}));
        setExceptions(prev=>[...prev,...excs]);
      }
      showToast(skipDates.length>0?`Förfrågan skickad — ${skipDates.length} krockar hoppades över!`:'Bokningsförfrågan skickad!');
    } else {
      // Offline: add optimistically so calendar shows it immediately
      setBookings(prev=>prev.some(b=>b.id===booking.id)?prev:[booking,...prev]);
      if(skipDates.length>0){
        const excs=skipDates.map(date=>({id:uid(),booking_id:booking.id,exception_date:date,type:'skip',created_at:Date.now()}));
        setExceptions(prev=>[...prev,...excs]);
      }
      // No toast — OfflineStatusBar communicates the state
    }
    setView('calendar');
  },[deviceId,loggedInUser,showToast,activateForDevice,submitOffline]);

  const handleCancelOccurrence=useCallback(async(booking,occurrenceDate,reason)=>{
    const uName=localStorage.getItem(STORAGE_USER_NAME)||'Besökaren';
    const comment=reason||`Avbokad av ${uName}.`;
    if(!occurrenceDate||booking.recurrence==='none') {
      const{error}=await supabase.from('bookings').update({status:'cancelled',admin_comment:comment,resolved_at:Date.now()}).eq('id',booking.id);
      if(error){showToast('Något gick fel.');return;}
      setBookings(prev=>prev.map(b=>b.id===booking.id?{...b,status:'cancelled',admin_comment:comment}:b));
    } else {
      const exc={id:uid(),booking_id:booking.id,exception_date:occurrenceDate,type:'skip',created_at:Date.now()};
      const{error}=await supabase.from('booking_exceptions').insert([exc]);
      if(error){showToast('Något gick fel.');return;}
      setExceptions(prev=>[...prev,exc]);
    }
    showToast('Tillfälle avbokat.');
  },[showToast]);

  const handleCancelFromDate=useCallback(async(booking,fromDate,reason)=>{
    const prevDay=new Date(parseISO(fromDate));prevDay.setDate(prevDay.getDate()-1);
    const newEndDate=toISO(prevDay);
    const uName=localStorage.getItem(STORAGE_USER_NAME)||'Besökaren';
    const comment=reason||`Avbokad av ${uName}.`;
    const{error}=await supabase.from('bookings').update({end_date:newEndDate,admin_comment:comment,resolved_at:Date.now()}).eq('id',booking.id);
    if(error){showToast('Något gick fel.');return;}
    setBookings(prev=>prev.map(b=>b.id===booking.id?{...b,end_date:newEndDate,admin_comment:comment}:b));
    showToast('Serien avbokad från detta datum.');
  },[showToast]);

  const handleCancelSeries=useCallback(async(booking,reason)=>{
    const uName=localStorage.getItem(STORAGE_USER_NAME)||'Besökaren';
    const comment=reason||`Avbokad av ${uName}.`;
    const{error}=await supabase.from('bookings').update({status:'cancelled',admin_comment:comment,resolved_at:Date.now()}).eq('id',booking.id);
    if(error){showToast('Något gick fel.');return;}
    setBookings(prev=>prev.map(b=>b.id===booking.id?{...b,status:'cancelled',admin_comment:comment}:b));
    showToast('Hela serien avbokad.');
  },[showToast]);

  const handleAdminEdit=useCallback(async(bookingId, data)=>{
    const{error}=await supabase.from('bookings').update({
      name: data.name,
      phone: data.phone,
      activity: data.activity,
      notes: data.notes || '',
      time_slot: data.time_slot,
      duration_hours: data.duration_hours,
      recurrence: data.recurrence,
      end_date: data.end_date || null,
      status: 'edited',
      admin_comment: '',
      resolved_at: Date.now(),
    }).eq('id', bookingId);
    if(error){showToast('Något gick fel: '+error.message);return;}
    // Handle skip_dates — insert exceptions for conflicting dates
    if(data.skip_dates && data.skip_dates.length>0){
      const excs=data.skip_dates.map(date=>({
        id:uid(),booking_id:bookingId,exception_date:date,
        type:'skip',admin_comment:'Hoppades över vid redigering',created_at:Date.now()
      }));
      await supabase.from('booking_exceptions').insert(excs);
      setExceptions(prev=>[...prev,...excs]);
    }
    setBookings(prev=>prev.map(b=>b.id===bookingId?{...b,
      name:data.name, phone:data.phone, activity:data.activity, notes:data.notes||'',
      time_slot:data.time_slot, duration_hours:data.duration_hours,
      recurrence:data.recurrence, end_date:data.end_date||null,
      status:'edited', admin_comment:'', resolved_at:Date.now(),
    }:b));
    showToast('Bokning uppdaterad');
  },[showToast]);

  const handleApprove=useCallback(async(bookingId,comment)=>{
    const resolvedAt=Date.now();
    const{error}=await supabase.from('bookings').update({status:'approved',admin_comment:comment||'',resolved_at:resolvedAt}).eq('id',bookingId);
    if(error){showToast('Något gick fel.');return;}
    suppressFetchRef.current=Date.now()+5000; // suppress stale Realtime read for 5s
    setBookings(prev=>prev.map(b=>b.id===bookingId?{...b,status:'approved',admin_comment:comment||'',resolved_at:resolvedAt}:b));
    showToast('Bokning godkänd ✓');
  },[showToast]);

  const handleReject=useCallback(async(bookingId,comment)=>{
    const resolvedAt=Date.now();
    const{error}=await supabase.from('bookings').update({status:'rejected',admin_comment:comment,resolved_at:resolvedAt}).eq('id',bookingId);
    if(error){showToast('Något gick fel.');return;}
    suppressFetchRef.current=Date.now()+5000;
    setBookings(prev=>prev.map(b=>b.id===bookingId?{...b,status:'rejected',admin_comment:comment,resolved_at:resolvedAt}:b));
    showToast('Bokning avböjd.');
  },[showToast]);

  const handleAdminDelete=useCallback(async(booking,occurrenceDate,explanation)=>{
    const adminName=localStorage.getItem(STORAGE_USER_NAME)||'Admin';
    const comment=`Avbokad av ${adminName}: ${explanation}`;
    if(booking.recurrence&&booking.recurrence!=='none'&&occurrenceDate) {
      const exc={id:uid(),booking_id:booking.id,exception_date:occurrenceDate,type:'skip',admin_comment:comment,created_at:Date.now()};
      const{error}=await supabase.from('booking_exceptions').insert([exc]);
      if(error){showToast('Något gick fel.');return;}
      setExceptions(prev=>[...prev,exc]);
      // Also update bookings.admin_comment + resolved_at so useBookingNotifications
      // fires the instant notification for this specific cancellation.
      await supabase.from('bookings').update({
        admin_comment:comment,
        resolved_at:Date.now(),
      }).eq('id',booking.id);
      setBookings(prev=>prev.map(b=>b.id===booking.id?{...b,admin_comment:comment,resolved_at:Date.now()}:b));
    } else {
      const{error}=await supabase.from('bookings').update({status:'cancelled',admin_comment:comment,resolved_at:Date.now()}).eq('id',booking.id);
      if(error){showToast('Något gick fel.');return;}
      setBookings(prev=>prev.map(b=>b.id===booking.id?{...b,status:'cancelled',admin_comment:comment}:b));
    }
    showToast('Tillfälle borttaget & besökare notifierad.');
  },[showToast]);

  const handleAdminDeleteSeries=useCallback(async(booking,explanation)=>{
    const adminName=localStorage.getItem(STORAGE_USER_NAME)||'Admin';
    const comment=`Avbokad av ${adminName}: ${explanation}`;
    const{error}=await supabase.from('bookings').update({status:'cancelled',admin_comment:comment,resolved_at:Date.now()}).eq('id',booking.id);
    if(error){showToast('Något gick fel.');return;}
    setBookings(prev=>prev.map(b=>b.id===booking.id?{...b,status:'cancelled',admin_comment:comment}:b));
    showToast('Hela serien borttagen & besökare notifierad.');
  },[showToast]);

  const handleAdminAddRecurring=useCallback(async formData=>{
    const bookingId=uid();
    const booking={id:bookingId,name:formData.name,phone:formData.phone||'',
      activity:formData.activity,notes:formData.notes||'',
      time_slot:formData.time_slot,duration_hours:formData.duration_hours,
      start_date:formData.date,end_date:formData.end_date||null,
      recurrence:formData.recurrence||'none',status:'approved',
      admin_comment:'',created_at:Date.now(),resolved_at:Date.now(),
      device_id:'admin',user_id:null};
    const{error}=await supabase.from('bookings').insert([booking]);
    if(error){showToast('Något gick fel.');return;}
    const skipDates=formData.skip_dates||[];
    if(skipDates.length>0){
      const excs=skipDates.map(date=>({id:uid(),booking_id:bookingId,exception_date:date,type:'skip',created_at:Date.now()}));
      await supabase.from('booking_exceptions').insert(excs);
      setExceptions(prev=>[...prev,...excs]);
    }
    setBookings(prev=>[booking,...prev]);
    showToast(skipDates.length>0?`Bokning tillagd — ${skipDates.length} krockar hoppades över ✓`:'Bokning tillagd ✓');
  },[showToast]);

  const handleLoginSuccess=useCallback(user=>{
    setLoggedInUser(user);
    localStorage.setItem(STORAGE_USER_ID,user.id);
    localStorage.setItem(STORAGE_USER_NAME,user.name);
    localStorage.setItem(STORAGE_USER_ROLE,user.role);
    // Fetch bookings immediately after login — no page refresh needed
    setDbLoading(true);
    hasFetchedRef.current=false;
    fetchAll().then(()=>{hasFetchedRef.current=true;});
    if(user.role==='admin'){
      localStorage.setItem(STORAGE_ADMIN,'true');
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
  },[showToast,registerAdminDevice,fetchAll]);

  const handleAdminLogout=useCallback(()=>{
    localStorage.removeItem(STORAGE_ADMIN);
    localStorage.removeItem(STORAGE_USER_ID);
    localStorage.removeItem(STORAGE_USER_NAME);
    localStorage.removeItem(STORAGE_USER_ROLE);
    setAdminMode(false);setLoggedInUser(null);
    setView('login');showToast('Utloggad');
    dismissAdminDevice?.();
  },[showToast,dismissAdminDevice]);

  const handleUserLogout=useCallback(()=>{
    localStorage.removeItem(STORAGE_USER_ID);
    localStorage.removeItem(STORAGE_USER_NAME);
    localStorage.removeItem(STORAGE_USER_ROLE);
    localStorage.removeItem(STORAGE_ADMIN);
    setLoggedInUser(null);setAdminMode(false);
    setView('login');showToast('Utloggad');
  },[showToast]);

  // ─── Render ───────────────────────────────────────────────────────────────────
  // Only show full-screen spinner on very first load when we have NO data yet.
  // If quick-fetch already populated bookings, show calendar immediately.
  if(dbLoading&&!adminMode&&bookings.length===0){
    return <div style={{position:'absolute',inset:0,padding:'80px 16px',background:T.bg,overflowY:'auto'}}><Spinner T={T}/></div>;
  }

  return <div style={{position:'absolute',inset:0,background:T.bg,fontFamily:'system-ui'}}>
    <style>{`
      @keyframes bsFadeInUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
      @keyframes bsSlideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
      @keyframes bsSpin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
      @keyframes bsPulse{0%,100%{box-shadow:0 0 0 0 rgba(255,159,10,.4)}50%{box-shadow:0 0 0 6px rgba(255,159,10,0)}}
      @keyframes bsSlideLeft{from{opacity:.35;transform:translateX(7%)}to{opacity:1;transform:translateX(0)}}
      @keyframes bsSlideRight{from{opacity:.35;transform:translateX(-7%)}to{opacity:1;transform:translateX(0)}}
      @keyframes bsGridSlideLeft{from{opacity:.4;transform:translateX(12%)}to{opacity:1;transform:translateX(0)}}
      @keyframes bsGridSlideRight{from{opacity:.4;transform:translateX(-12%)}to{opacity:1;transform:translateX(0)}}
      @keyframes bsTitleSlideLeft{from{opacity:1;transform:translateX(0)}to{opacity:0;transform:translateX(-30%)}}
      @keyframes bsTitleSlideRight{from{opacity:1;transform:translateX(0)}to{opacity:0;transform:translateX(30%)}}
      @keyframes bsTitleSlideInFromRight{from{opacity:0;transform:translateX(30%)}to{opacity:1;transform:translateX(0)}}
      @keyframes bsTitleSlideInFromLeft{from{opacity:0;transform:translateX(-30%)}to{opacity:1;transform:translateX(0)}}
      @keyframes bsHighlight{0%,100%{box-shadow:0 0 0 3px var(--hl,rgba(45,139,120,.3))}50%{box-shadow:0 0 0 8px transparent}}
      @keyframes bsYearIn{from{opacity:0;transform:scale(0.93)}to{opacity:1;transform:scale(1)}}
      @keyframes bsMonthZoomIn{from{opacity:0;transform:scale(0.88)}to{opacity:1;transform:scale(1)}}
      @keyframes bsStatusPulse{0%,100%{box-shadow:0 0 0 0 var(--pulse-color,#34C759)66,0 0 0 0 var(--pulse-color,#34C759)33}50%{box-shadow:0 0 0 5px var(--pulse-color,#34C759)00,0 0 0 9px var(--pulse-color,#34C759)00}}
    `}</style>
    <Toast message={toast}/>

    {/* Year View overlay */}
    {showYearView&&<YearView year={yearViewYear}
      onSelectMonth={(yr,m)=>{
        const d=new Date(yr,m,1);
        setSelectedDate(d);
        setShowYearView(false);
      }}
      bookings={bookings} exceptions={exceptions} T={T}
      onBack={()=>setShowYearView(false)}/>}

    {/* Search overlay */}
    {showSearch&&<SearchPanel bookings={adminMode ? bookings : myBookings} exceptions={exceptions}
      onSelectBooking={b=>{
        setShowSearch(false);
        // Open booking detail sheet directly
        setBookingDetail(b);
      }}
      onClose={()=>setShowSearch(false)} T={T}/>}

    {/* Calendar View */}
    {view==='calendar'&&<div style={{
      background:T.bg,
      // Egen scroll-container isolerad från Shell — förhindrar att iOS rubber-band
      // fastnar i Shell-containern och låser scrollen
      position:'absolute', inset:0,
      overflowY:'auto', overflowX:'hidden',
      WebkitOverflowScrolling:'touch',
      overscrollBehavior:'contain',
      // Ge plats för tab-baren längst ned
      paddingBottom: isPWA ? 'calc(env(safe-area-inset-bottom, 0px) + 90px)' : '100px',
      animation:'bsMonthZoomIn 0.32s cubic-bezier(0.4,0,0.2,1)',
    }}>
      {/* Header */}
      <div style={{paddingTop:'max(20px,env(safe-area-inset-top,0px))',
        paddingLeft:20,paddingRight:20,paddingBottom:0,background:T.calHeaderBg}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
          <div style={{fontSize:17,fontWeight:700,color:T.text}}>Boka lokal</div>
          <div style={{display:'flex',gap:8,alignItems:'center'}}>
            <button onClick={()=>setShowSearch(true)}
              style={{width:34,height:34,borderRadius:'50%',border:'none',
                background:T.cardElevated,display:'flex',alignItems:'center',justifyContent:'center',
                cursor:'pointer',color:T.text,WebkitTapHighlightColor:'transparent'}}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
              </svg>
            </button>
            <button onClick={()=>{setView('my-bookings');markVisitorSeen?.();}}
              style={{padding:'6px 12px',borderRadius:20,
                border:`0.5px solid ${visitorUnread>0?T.accent:T.border}`,
                background:visitorUnread>0?`${T.accent}11`:T.card,
                color:T.text,fontSize:12,fontWeight:600,cursor:'pointer',
                fontFamily:'system-ui',WebkitTapHighlightColor:'transparent',
                display:'flex',alignItems:'center',gap:5}}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
              {loggedInUser?.name||'Mitt konto'}
              {visitorUnread>0&&<span style={{background:T.accent,color:'#fff',borderRadius:10,
                fontSize:10,fontWeight:800,padding:'1px 6px',minWidth:16,textAlign:'center'}}>
                {visitorUnread>9?'9+':visitorUnread}
              </span>}
            </button>
            {adminMode&&<button onClick={()=>setView('admin')}
              style={{padding:'6px 12px',borderRadius:20,
                border:`1px solid ${T.warning}44`,background:`${T.warning}18`,
                color:T.warning,fontSize:12,fontWeight:700,cursor:'pointer',
                fontFamily:'system-ui',WebkitTapHighlightColor:'transparent'}}>Admin →</button>}
          </div>
        </div>
      </div>

      <CalendarView bookings={bookings} exceptions={exceptions}
        onSelectDate={d=>{setSelectedDate(d);}}
        isAdmin={adminMode} selectedDate={selectedDate} T={T}
        onYearViewOpen={()=>{setYearViewYear(selectedDate.getFullYear());setShowYearView(true);}}/>

      <div style={{height:'0.5px',background:T.separator,margin:'8px 0'}}/>

      <DayPanel date={selectedDate} bookings={bookings} exceptions={exceptions}
        isAdmin={adminMode}
        myBookingIds={myBookingIds}
        dbLoading={dbLoading}
        onSwipeDelete={o=>{
          const parent=bookings.find(b=>b.id===o.id)||o;
          const userId=localStorage.getItem(STORAGE_USER_ID);
          const deviceId_=localStorage.getItem(STORAGE_DEVICE);
          const isOwn=adminMode||(userId&&parent.user_id===userId)||(deviceId_&&parent.device_id===deviceId_);
          if(!isOwn) return;
          const occDate=o.date||parent.start_date;
          const isRecur=parent.recurrence&&parent.recurrence!=='none';
          if(adminMode){
            setOccDeleteDialog({booking:parent,occurrence_date:occDate,isRecur});
          } else {
            setUserCancelConfirm({booking:parent,occurrence_date:occDate});
          }
        }}
        onSelectBooking={o=>{
          const parent=bookings.find(b=>b.id===o.id)||o;
          if(adminMode){
            // Admin: open BookingDetailSheet directly — shows all details + "Öppna i adminpanel"
            setClickedOccurrenceDate(o.date||null);
            setBookingDetail(parent);
          } else {
            const userId=localStorage.getItem(STORAGE_USER_ID);
            const deviceId_=localStorage.getItem(STORAGE_DEVICE);
            const isOwn=(userId&&parent.user_id===userId)||(deviceId_&&parent.device_id===deviceId_);
            if(isOwn){
              setClickedOccurrenceDate(o.date||null);
              setBookingDetail(parent);
            }
          }
        }}
        onNewBooking={d=>{setPendingFormDate(d);setView('form');}} T={T}/>

    </div>}

    {/* Admin calendar detail sheet */}
    {calendarAdminDetail&&(()=>{
      const b=calendarAdminDetail;
      const sc={approved:'#34C759',edited:'#34C759',pending:'#FF9F0A',edit_pending:'#FF9F0A',cancelled:'#8E8E93',rejected:'#FF3B30'}[b.status]||T.accent;
      return <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:1000,
        display:'flex',alignItems:'flex-end',justifyContent:'center'}}
        onClick={()=>setCalendarAdminDetail(null)}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.sheetBg,borderRadius:'20px 20px 0 0',
          padding:'24px 20px max(32px,env(safe-area-inset-bottom,20px))',
          width:'100%',maxWidth:500,boxSizing:'border-box',
          animation:'bsSlideUp .25s cubic-bezier(0.32,0.72,0,1)'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <div style={{
                width:10,height:10,borderRadius:'50%',background:sc,
                animation:'bsStatusPulse 2s ease-in-out infinite',
                '--pulse-color':sc,
              }}/>
              <Badge status={b.status}/>
            </div>
            <button onClick={()=>setCalendarAdminDetail(null)}
              style={{background:'none',border:'none',fontSize:22,color:T.textMuted,cursor:'pointer',padding:'0 4px',lineHeight:1}}>×</button>
          </div>
          <div style={{fontSize:18,fontWeight:700,color:T.text,marginBottom:4}}>{b.activity}</div>
          <div style={{fontSize:13,color:T.textMuted,marginBottom:4}}>{b.name} · {b.time_slot}</div>
          {b.notes&&<div style={{fontSize:13,color:T.textMuted,fontStyle:'italic',marginBottom:8}}>{b.notes}</div>}
          {b.admin_comment&&<div style={{fontSize:12,color:T.textMuted,fontStyle:'italic',marginBottom:12}}>"{b.admin_comment}"</div>}
          <button onClick={()=>{setCalendarAdminDetail(null);setView('admin');}}
            style={{width:'100%',padding:'13px',borderRadius:12,border:`0.5px solid ${T.border}`,
              background:T.cardElevated,color:T.accent,fontSize:14,fontWeight:700,
              cursor:'pointer',WebkitTapHighlightColor:'transparent'}}>
            Öppna i adminpanel →
          </button>
        </div>
      </div>;
    })()}

    {/* Universal Booking Detail Sheet — shown for all users from search & day panel */}
    {bookingDetail&&(()=>{
      const b=bookingDetail;
      const isRecur=b.recurrence&&b.recurrence!=='none';
      const todayISO=toISO(new Date());
      const wEnd=toISO(new Date(new Date().setFullYear(new Date().getFullYear()+5)));
      const upcoming=isRecur?expandBooking(b,todayISO,wEnd,exceptions).slice(0,20):[{...b,date:b.start_date}];
      const isOwn=myBookings.some(mb=>mb.id===b.id);
      const sc={approved:'#34C759',edited:'#34C759',pending:'#FF9F0A',edit_pending:'#FF9F0A',cancelled:'#8E8E93',rejected:'#FF3B30'}[b.status]||T.accent;
      return <div style={{
        position:'fixed',inset:0,zIndex:1100,
        background:T.bg,
        display:'flex',flexDirection:'column',
        animation:'bsMonthZoomIn 0.22s cubic-bezier(0.4,0,0.2,1)',
      }}>
        <HideTabBar/>
        {/* Sticky header — aldrig scrollad bort */}
        <div style={{
          flexShrink:0,
          background:T.bg,
          borderBottom:`0.5px solid ${T.border}`,
          paddingTop:'max(16px,env(safe-area-inset-top,0px))',
          padding:'max(16px,env(safe-area-inset-top,0px)) 20px 12px',
        }}>
          {/* Rad 1: Tillbaka + status */}
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
            <button onClick={()=>{setBookingDetail(null);setClickedOccurrenceDate(null);}}
              style={{
                display:'flex',alignItems:'center',gap:6,
                background:'none',border:'none',cursor:'pointer',
                color:T.accent,fontSize:16,fontWeight:600,
                padding:'4px 0',
                WebkitTapHighlightColor:'transparent',
                fontFamily:'system-ui',
              }}>
              <svg width="10" height="17" viewBox="0 0 10 17" fill="none">
                <path d="M9 1L1 8.5L9 16" stroke={T.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Tillbaka
            </button>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <div style={{width:10,height:10,borderRadius:'50%',background:sc,flexShrink:0,
                animation:'bsStatusPulse 2s ease-in-out infinite','--pulse-color':sc}}/>
              <Badge status={b.status}/>
              {isRecur&&<RecurBadge recurrence={b.recurrence}/>}
            </div>
          </div>
          {/* Aktivitetstitel */}
          {(isOwn||adminMode)
            ? <div style={{fontSize:20,fontWeight:700,color:T.text,marginBottom:2}}>{b.activity}</div>
            : <div style={{fontSize:17,fontWeight:700,color:T.text,marginBottom:2}}>{b.time_slot}</div>
          }
          {adminMode&&b.name&&<div style={{fontSize:13,color:T.textMuted,marginTop:2}}>{b.name}{b.phone?` · ${b.phone}`:''}</div>}
          {(isOwn||adminMode)&&b.notes&&<div style={{fontSize:13,color:T.textMuted,fontStyle:'italic',marginTop:2}}>{b.notes}</div>}
          {(isOwn||adminMode)&&b.admin_comment&&b.status!=='cancelled'&&b.status!=='rejected'&&!b.admin_comment.startsWith('Avbokad av ')&&(
            <div style={{fontSize:12,color:T.textMuted,fontStyle:'italic',marginTop:6,
              background:`${T.accent}0d`,padding:'6px 10px',borderRadius:8}}>"{b.admin_comment}"</div>
          )}
          {!clickedOccurrenceDate&&(
            <div style={{fontSize:11,fontWeight:700,color:T.textMuted,letterSpacing:'.6px',marginTop:10}}>
              {isRecur?`TILLFÄLLEN (${upcoming.length} visas)`:'DATUM'}
            </div>
          )}
        </div>
        {/* Scrollbart innehåll */}
        <div style={{
          flex:1,overflowY:'auto',overscrollBehavior:'contain',
          WebkitOverflowScrolling:'touch',
          padding:'12px 20px',
          paddingBottom:'max(40px,env(safe-area-inset-bottom,20px))',
        }}>
            {/* Denna bokning — the specific occurrence that was tapped */}
            {clickedOccurrenceDate&&isRecur&&(()=>{
              const isSkipped=exceptions.some(e=>e.booking_id===b.id&&e.exception_date===clickedOccurrenceDate&&e.type==='skip');
              const canAct=!isSkipped&&(b.status==='approved'||b.status==='edited'||b.status==='pending');
              return <div style={{marginBottom:12}}>
                <div style={{fontSize:11,fontWeight:700,color:T.accent,letterSpacing:'.6px',marginBottom:6}}>
                  DENNA BOKNING
                </div>
                <OccurrenceRow
                  occ={{date:clickedOccurrenceDate,time_slot:b.time_slot}}
                  booking={b}
                  isSkipped={isSkipped}
                  isOwn={isOwn}
                  isAdmin={adminMode}
                  idx={0} total={1}
                  onUserCancel={occ=>{setUserCancelConfirm({booking:b,occurrence_date:occ.date});}}
                  onAdminDelete={occ=>{const ir=b.recurrence&&b.recurrence!=='none';setOccDeleteDialog({booking:b,occurrence_date:occ.date,isRecur:ir});}}
                  T={T}
                />
                {isRecur&&upcoming.length>0&&<div style={{
                  fontSize:11,fontWeight:700,color:T.textMuted,letterSpacing:'.6px',
                  marginTop:14,marginBottom:6}}>
                  KOMMANDE TILLFÄLLEN ({upcoming.length} visas)
                </div>}
              </div>;
            })()}
            {upcoming.map((occ,i)=>{
              const isSkipped=exceptions.some(e=>e.booking_id===b.id&&e.exception_date===occ.date&&e.type==='skip');
              return <OccurrenceRow
                key={occ.date+i}
                occ={occ}
                booking={b}
                isSkipped={isSkipped}
                isOwn={isOwn}
                isAdmin={adminMode}
                idx={i}
                total={upcoming.length}
                onUserCancel={occ=>setUserCancelConfirm({booking:b,occurrence_date:occ.date})}
                onAdminDelete={occ=>setOccDeleteDialog({booking:b,occurrence_date:occ.date})}
                T={T}
              />;
            })}
            {/* Inställda tillfällen — visas sist under kommande tillfällen */}
            {isRecur&&<CancelledOccurrencesList
              bookingId={b.id} exceptions={exceptions} timeSlot={b.time_slot} T={T}/>}
            {/* Admin: open in admin panel */}
            {adminMode&&<button onClick={()=>{
                setInternalAdminHighlight(b.id);
                setBookingDetail(null);
                setView('admin');
              }}
              style={{width:'100%',padding:'13px',borderRadius:12,border:`0.5px solid ${T.border}`,
                background:T.cardElevated,color:T.accent,fontSize:14,fontWeight:700,
                cursor:'pointer',WebkitTapHighlightColor:'transparent',marginTop:16}}>
              Öppna i adminpanel →
            </button>}
            {/* User: go to my bookings for full detail */}
            {!adminMode&&isOwn&&<button onClick={()=>{
                setInternalHighlightId(b.id);
                setInternalHighlightBooking(b);
                setBookingDetail(null);
                setView('my-bookings');
              }}
              style={{width:'100%',padding:'13px',borderRadius:12,border:`0.5px solid ${T.border}`,
                background:T.cardElevated,color:T.accent,fontSize:14,fontWeight:700,
                cursor:'pointer',WebkitTapHighlightColor:'transparent',marginTop:16}}>
              Se alla detaljer →
            </button>}
        </div>
      </div>
      {/* Admin delete single occurrence — rendered at z:1200 above the detail sheet */}
    })()}

    {/* AdminDeleteSheet — top-level so it shows from both DayPanel swipe and detail sheet */}
    {occDeleteDialog&&(
      <AdminDeleteSheet
        dialog={{...occDeleteDialog,type:occDeleteDialog.isRecur?'one':'single'}}
        actionLoading={false}
        onConfirm={async(explanation)=>{
          if(occDeleteDialog.isRecur){
            await handleAdminDelete(occDeleteDialog.booking,occDeleteDialog.occurrence_date,explanation);
          } else {
            await handleAdminDelete(occDeleteDialog.booking,null,explanation);
          }
          setOccDeleteDialog(null);
          setBookingDetail(null);
        }}
        onCancel={()=>setOccDeleteDialog(null)}
        T={T}/>
    )}

    {/* UserCancelSheet — top-level so it works from DayPanel swipe too */}
    {userCancelConfirm&&(
      <UserDeleteSheet
        booking={userCancelConfirm.booking}
        occurrence_date={userCancelConfirm.occurrence_date}
        onConfirmOccurrence={async(reason)=>{
          await handleCancelOccurrence(userCancelConfirm.booking,userCancelConfirm.occurrence_date,reason);
          setUserCancelConfirm(null);
          setBookingDetail(null);
        }}
        onConfirmSeries={async(reason)=>{
          await handleCancelSeries(userCancelConfirm.booking,reason);
          setUserCancelConfirm(null);
          setBookingDetail(null);
        }}
        onCancel={()=>setUserCancelConfirm(null)}
        T={T}/>
    )}

    {view==='form'&&pendingFormDate&&<div style={{position:'absolute',inset:0,overflowY:'auto',WebkitOverflowScrolling:'touch',overscrollBehavior:'contain'}}><BookingForm date={pendingFormDate}
      onSubmit={handleSubmitBooking} onBack={()=>setView('calendar')}
      loading={submitLoading} bookings={bookings} exceptions={exceptions} T={T}/></div>}

    {view==='my-bookings'&&<div style={{position:'absolute',inset:0,overflowY:'auto',WebkitOverflowScrolling:'touch',overscrollBehavior:'contain'}}><MyBookings bookings={myBookings} exceptions={exceptions}
      loading={false} onBack={()=>{setView('calendar');setInternalHighlightId(null);setInternalHighlightBooking(null);}}
      onCancel={handleCancelOccurrence} onCancelFromDate={handleCancelFromDate}
      onCancelSeries={handleCancelSeries}
      highlightBookingId={internalHighlightId||highlightBookingId}
      highlightBooking={internalHighlightBooking}
      highlightFilter={internalHighlightId?'all':highlightFilter}
      onLogout={handleUserLogout} T={T}/></div>}

    {view==='login'&&<div style={{position:'absolute',inset:0,overflowY:'auto',WebkitOverflowScrolling:'touch',overscrollBehavior:'contain'}}><ShowTabBar/><UserLogin onSuccess={handleLoginSuccess} onBack={undefined} T={T}/></div>}

    {view==='users'&&<div style={{position:'absolute',inset:0,overflowY:'auto',WebkitOverflowScrolling:'touch',overscrollBehavior:'contain'}}><UserManagement onBack={()=>setView('admin')} T={T}/></div>}
    <OfflineStatusBar status={offlineStatus} T={T} position="bottom"/>

    {view==='admin'&&<div style={{position:'absolute',inset:0,overflowY:'auto',WebkitOverflowScrolling:'touch',overscrollBehavior:'contain'}}><AdminPanel bookings={bookings} exceptions={exceptions}
      onBack={handleAdminLogout}
      onApprove={handleApprove} onReject={handleReject}
      onDelete={handleAdminDelete} onDeleteSeries={handleAdminDeleteSeries}
      onDeleteFromDate={handleCancelFromDate}
      adminInitialFilter={adminInitialFilter}
      adminHighlightId={internalAdminHighlight||adminHighlightId}
      adminHighlightFilter={internalAdminHighlight?'all':adminHighlightFilter}
      cancelledBookingIds={cancelledBookingIds} pendingBookingIds={pendingBookingIds}
      onAdminAddRecurring={handleAdminAddRecurring}
      onAdminEdit={handleAdminEdit}
      onRefreshNotifications={onRefreshNotifications}
      onMarkAdminSeen={onMarkAdminSeen}
      onManageUsers={()=>setView('users')}
      onOpenBookingDetail={(b,date)=>{
        setInternalAdminHighlight(b.id);
        setClickedOccurrenceDate(date||null);
        setBookingDetail(b);
      }} T={T}/></div>}
  </div>;
}
