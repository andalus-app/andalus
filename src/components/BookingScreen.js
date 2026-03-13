/**
 * BookingScreen.js — Bokningssystem med Supabase-backend
 * Realtime updates, shared data across all devices.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useTheme } from '../context/ThemeContext';
import { supabase } from '../services/supabaseClient';

const ADMIN_PIN     = '1234';
const STORAGE_ADMIN = 'islamnu_admin_mode';

const TIME_SLOTS = ['08:00–10:00','10:00–12:00','12:00–14:00','14:00–16:00','16:00–18:00','18:00–20:00'];
const DAYS_SV    = ['Mån','Tis','Ons','Tor','Fre','Lör','Sön'];
const MONTHS_SV  = ['Januari','Februari','Mars','April','Maj','Juni','Juli','Augusti','September','Oktober','November','December'];

function toISO(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function parseISO(s) { const [y,m,d]=s.split('-').map(Number); return new Date(y,m-1,d); }
function isoToDisplay(s) { const d=parseISO(s); return `${d.getDate()} ${MONTHS_SV[d.getMonth()]} ${d.getFullYear()}`; }
function uid() { return Date.now().toString(36)+Math.random().toString(36).slice(2,7); }

function getWeekDays(anchor) {
  const d=new Date(anchor); const day=(d.getDay()+6)%7; d.setDate(d.getDate()-day);
  return Array.from({length:7},(_,i)=>{ const dd=new Date(d); dd.setDate(dd.getDate()+i); return dd; });
}
function getMonthGrid(year,month) {
  const first=new Date(year,month,1),last=new Date(year,month+1,0);
  const startPad=(first.getDay()+6)%7; const cells=[];
  for(let i=0;i<startPad;i++) cells.push(null);
  for(let d=1;d<=last.getDate();d++) cells.push(new Date(year,month,d));
  while(cells.length%7!==0) cells.push(null);
  const rows=[]; for(let i=0;i<cells.length;i+=7) rows.push(cells.slice(i,i+7)); return rows;
}
function getSlotStatus(bookings,date,slot) {
  const iso=typeof date==='string'?date:toISO(date);
  const b=bookings.find(b=>b.date===iso&&b.time_slot===slot&&b.status!=='rejected');
  if(!b) return 'available';
  return b.status==='pending'?'pending':b.status==='approved'?'booked':'available';
}
function slotColor(s){ return s==='available'?'#22c55e':s==='pending'?'#f59e0b':s==='booked'?'#ef4444':'#888'; }

function BackButton({onBack,T}){
  return <button onClick={onBack} style={{background:'none',border:'none',cursor:'pointer',display:'flex',alignItems:'center',gap:6,color:T.accent,fontFamily:'system-ui',fontSize:15,fontWeight:600,padding:'0 0 4px',WebkitTapHighlightColor:'transparent'}}>
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
    Tillbaka
  </button>;
}
function Badge({status}){
  const m={pending:{label:'Väntar',bg:'#f59e0b22',color:'#f59e0b'},approved:{label:'Godkänd',bg:'#22c55e22',color:'#22c55e'},rejected:{label:'Avböjd',bg:'#ef444422',color:'#ef4444'}};
  const s=m[status]||{label:status,bg:'#88888822',color:'#888'};
  return <span style={{background:s.bg,color:s.color,borderRadius:8,fontSize:11,fontWeight:700,padding:'3px 8px',letterSpacing:'.3px',fontFamily:'system-ui'}}>{s.label}</span>;
}
function Input({label,value,onChange,type='text',placeholder,required,T}){
  return <div style={{display:'flex',flexDirection:'column',gap:5}}>
    <label style={{fontSize:12,fontWeight:600,color:T.textMuted,fontFamily:'system-ui',letterSpacing:'.3px'}}>{label}{required&&<span style={{color:T.error}}> *</span>}</label>
    <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} style={{background:T.cardElevated,border:`1px solid ${T.border}`,borderRadius:10,padding:'11px 14px',fontSize:15,color:T.text,fontFamily:'system-ui',outline:'none',width:'100%',boxSizing:'border-box'}}/>
  </div>;
}
function Textarea({label,value,onChange,placeholder,required,T}){
  return <div style={{display:'flex',flexDirection:'column',gap:5}}>
    <label style={{fontSize:12,fontWeight:600,color:T.textMuted,fontFamily:'system-ui',letterSpacing:'.3px'}}>{label}{required&&<span style={{color:T.error}}> *</span>}</label>
    <textarea value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} rows={3} style={{background:T.cardElevated,border:`1px solid ${T.border}`,borderRadius:10,padding:'11px 14px',fontSize:15,color:T.text,fontFamily:'system-ui',outline:'none',width:'100%',boxSizing:'border-box',resize:'vertical'}}/>
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

function TimeSlotPanel({bookings,date,isAdmin,onSelectSlot,onClose,T}){
  const iso=toISO(date);
  return <div style={{marginTop:16,background:T.card,border:`1px solid ${T.border}`,borderRadius:16,overflow:'hidden'}}>
    <div style={{padding:'14px 16px 10px',borderBottom:`1px solid ${T.border}`,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
      <div>
        <div style={{fontSize:13,fontWeight:700,color:T.text,fontFamily:'system-ui'}}>Tillgängliga tider</div>
        <div style={{fontSize:11,color:T.textMuted,fontFamily:'system-ui',marginTop:2}}>{isoToDisplay(iso)}</div>
      </div>
      <button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer',color:T.textMuted,padding:4}}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <div style={{padding:'8px 10px 10px',display:'flex',flexDirection:'column',gap:6}}>
      {TIME_SLOTS.map(slot=>{
        const status=getSlotStatus(bookings,iso,slot);
        const color=slotColor(status);
        const canBook=status==='available';
        const booking=bookings.find(b=>b.date===iso&&b.time_slot===slot&&b.status!=='rejected');
        return <div key={slot} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 12px',background:T.cardElevated,borderRadius:10,border:`1px solid ${canBook?`${color}44`:T.border}`,opacity:!canBook&&!isAdmin?0.6:1}}>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <div style={{width:8,height:8,borderRadius:'50%',background:color,flexShrink:0}}/>
            <span style={{fontSize:14,fontWeight:600,color:T.text,fontFamily:'system-ui'}}>{slot}</span>
            {isAdmin&&booking&&<span style={{fontSize:11,color:T.textMuted,fontFamily:'system-ui'}}>· {booking.name}</span>}
          </div>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            {status!=='available'&&<Badge status={status}/>}
            {canBook&&<button onClick={()=>onSelectSlot(date,slot)} style={{background:T.accent,color:'#fff',border:'none',borderRadius:8,padding:'5px 12px',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'system-ui',WebkitTapHighlightColor:'transparent'}}>Välj</button>}
            {isAdmin&&booking&&<button onClick={()=>onSelectSlot(date,slot,booking)} style={{background:`${T.accent}22`,color:T.accent,border:'none',borderRadius:8,padding:'5px 10px',fontSize:11,fontWeight:700,cursor:'pointer',fontFamily:'system-ui'}}>Detaljer</button>}
          </div>
        </div>;
      })}
    </div>
  </div>;
}

function CalendarView({bookings,onSelectSlot,isAdmin,T}){
  const today=new Date(); today.setHours(0,0,0,0);
  const [viewMode,setViewMode]=useState('week');
  const [anchor,setAnchor]=useState(today);
  const [selectedDate,setSelectedDate]=useState(null);
  const [showSlots,setShowSlots]=useState(false);
  const weekDays=useMemo(()=>getWeekDays(anchor),[anchor]);
  const monthGrid=useMemo(()=>getMonthGrid(anchor.getFullYear(),anchor.getMonth()),[anchor]);
  const navPrev=()=>{ const d=new Date(anchor); viewMode==='week'?d.setDate(d.getDate()-7):d.setMonth(d.getMonth()-1); setAnchor(d); };
  const navNext=()=>{ const d=new Date(anchor); viewMode==='week'?d.setDate(d.getDate()+7):d.setMonth(d.getMonth()+1); setAnchor(d); };
  const handleDayPress=(date)=>{ if(!date) return; const c=new Date(date);c.setHours(0,0,0,0); if(c<today) return; setSelectedDate(c);setShowSlots(true); };
  const headerLabel=viewMode==='week'?`${weekDays[0].getDate()} – ${weekDays[6].getDate()} ${MONTHS_SV[weekDays[6].getMonth()]} ${weekDays[6].getFullYear()}`:`${MONTHS_SV[anchor.getMonth()]} ${anchor.getFullYear()}`;
  const hasB=(d)=>d&&bookings.some(b=>b.date===toISO(d)&&b.status!=='rejected');
  const isPast=(d)=>{ if(!d) return false; const x=new Date(d);x.setHours(0,0,0,0);return x<today; };
  const isToday=(d)=>{ if(!d) return false; const x=new Date(d);x.setHours(0,0,0,0);return x.getTime()===today.getTime(); };
  const isSel=(d)=>{ if(!d||!selectedDate) return false; const x=new Date(d);x.setHours(0,0,0,0);return x.getTime()===selectedDate.getTime(); };

  const DayBtn=({date,small=false})=>{
    if(!date) return <div/>;
    const past=isPast(date),tod=isToday(date),sel=isSel(date),hb=hasB(date);
    return <button onClick={()=>!past&&handleDayPress(date)} style={{borderRadius:small?10:12,border:sel?`2px solid ${T.accent}`:`1px solid ${small?'transparent':T.border}`,background:sel?`${T.accent}22`:tod?`${T.accent}11`:small?'none':T.card,padding:small?'6px 2px':'8px 4px 6px',cursor:past?'default':'pointer',opacity:past?0.35:1,display:'flex',flexDirection:'column',alignItems:'center',gap:small?2:4,WebkitTapHighlightColor:'transparent',transition:'all .12s'}}>
      <span style={{fontSize:small?14:16,fontWeight:tod?800:small?500:600,color:sel?T.accent:T.text,fontFamily:'system-ui'}}>{date.getDate()}</span>
      {!small&&<span style={{fontSize:9,color:T.textMuted,fontFamily:'system-ui'}}>{MONTHS_SV[date.getMonth()].slice(0,3)}</span>}
      {hb&&<div style={{width:small?4:5,height:small?4:5,borderRadius:'50%',background:T.accent}}/>}
    </button>;
  };

  return <div>
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
      {[['#22c55e','Ledig tid'],['#f59e0b','Väntar'],['#ef4444','Bokad']].map(([c,l])=><div key={l} style={{display:'flex',alignItems:'center',gap:5}}><div style={{width:10,height:10,borderRadius:'50%',background:c}}/><span style={{fontSize:11,color:T.textMuted,fontFamily:'system-ui'}}>{l}</span></div>)}
    </div>
    {showSlots&&selectedDate&&<TimeSlotPanel bookings={bookings} date={selectedDate} isAdmin={isAdmin} onSelectSlot={onSelectSlot} onClose={()=>setShowSlots(false)} T={T}/>}
  </div>;
}

function BookingForm({date,slot,onSubmit,onBack,loading,T}){
  const [form,setForm]=useState({name:'',phone:'',email:'',activity:''});
  const [error,setError]=useState('');
  const set=f=>v=>setForm(p=>({...p,[f]:v}));
  const handleSubmit=()=>{
    if(!form.name.trim()||!form.phone.trim()||!form.email.trim()||!form.activity.trim()){setError('Vänligen fyll i alla obligatoriska fält.');return;}
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)){setError('Ange en giltig e-postadress.');return;}
    onSubmit({...form,date:toISO(date),time_slot:slot});
  };
  return <div style={{padding:'20px 16px',fontFamily:'system-ui'}}>
    <BackButton onBack={onBack} T={T}/>
    <div style={{marginTop:16,marginBottom:20}}>
      <div style={{fontSize:22,fontWeight:800,color:T.text,letterSpacing:'-.4px',marginBottom:8}}>Bokningsförfrågan</div>
      <div style={{display:'inline-flex',alignItems:'center',gap:8,background:`${T.accent}18`,borderRadius:10,padding:'6px 12px'}}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        <span style={{fontSize:13,color:T.accent,fontWeight:600}}>{isoToDisplay(toISO(date))} · {slot}</span>
      </div>
    </div>
    <div style={{display:'flex',flexDirection:'column',gap:14}}>
      <Input label="NAMN" value={form.name} onChange={set('name')} placeholder="Ditt fullständiga namn" required T={T}/>
      <Input label="TELEFON" value={form.phone} onChange={set('phone')} placeholder="07X-XXX XX XX" required T={T} type="tel"/>
      <Input label="E-POST" value={form.email} onChange={set('email')} placeholder="din@epost.se" required T={T} type="email"/>
      <Textarea label="AKTIVITET" value={form.activity} onChange={set('activity')} placeholder="Beskriv aktiviteten kort..." required T={T}/>
      {error&&<div style={{fontSize:13,color:T.error,background:`${T.error}18`,padding:'10px 14px',borderRadius:8}}>{error}</div>}
      <button onClick={handleSubmit} disabled={loading} style={{background:loading?T.textMuted:T.accent,color:'#fff',border:'none',borderRadius:12,padding:'14px',fontSize:16,fontWeight:700,cursor:loading?'default':'pointer',marginTop:4,WebkitTapHighlightColor:'transparent',display:'flex',alignItems:'center',justifyContent:'center',gap:8}}>
        {loading?'Skickar...':(<>Skicka bokningsförfrågan <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></>)}
      </button>
      <p style={{fontSize:11,color:T.textMuted,textAlign:'center',margin:0}}>Din förfrågan granskas av en administratör.</p>
    </div>
  </div>;
}

function ConfirmationScreen({booking,onBack,T}){
  return <div style={{padding:'20px 16px',fontFamily:'system-ui'}}>
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
        {[['Namn',booking.name],['Datum',isoToDisplay(booking.date)],['Tid',booking.time_slot],['Aktivitet',booking.activity],['Boknings-ID',booking.id.toUpperCase()]].map(([l,v])=>(
          <div key={l} style={{marginBottom:10}}>
            <div style={{fontSize:10,fontWeight:700,color:T.textMuted,letterSpacing:'.5px',marginBottom:2}}>{l.toUpperCase()}</div>
            <div style={{fontSize:14,fontWeight:600,color:T.text}}>{v}</div>
          </div>
        ))}
      </div>
    </div>
  </div>;
}

function MyBookings({bookings,onViewConfirmation,onBack,T}){
  const sorted=bookings.slice().sort((a,b)=>b.created_at-a.created_at);
  return <div style={{padding:'20px 16px',fontFamily:'system-ui'}}>
    <BackButton onBack={onBack} T={T}/>
    <div style={{fontSize:22,fontWeight:800,color:T.text,letterSpacing:'-.4px',marginTop:16,marginBottom:20}}>Mina bokningar</div>
    {sorted.length===0?<div style={{textAlign:'center',padding:'40px 0',color:T.textMuted,fontSize:14}}>Inga bokningar än</div>:(
      <div style={{display:'flex',flexDirection:'column',gap:10}}>
        {sorted.map(b=><div key={b.id} onClick={()=>b.status==='approved'&&onViewConfirmation(b)} style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:14,padding:'14px 16px',cursor:b.status==='approved'?'pointer':'default'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:4}}>
            <div style={{fontSize:14,fontWeight:700,color:T.text}}>{b.time_slot}</div>
            <Badge status={b.status}/>
          </div>
          <div style={{fontSize:12,color:T.textMuted,marginBottom:2}}>{isoToDisplay(b.date)}</div>
          <div style={{fontSize:12,color:T.textMuted}}>{b.activity}</div>
          {b.status==='rejected'&&b.admin_comment&&<div style={{marginTop:8,background:'#ef444418',borderRadius:8,padding:'8px 10px',fontSize:12,color:'#ef4444'}}><strong>Kommentar:</strong> {b.admin_comment}</div>}
          {b.status==='approved'&&<div style={{marginTop:8,fontSize:12,color:T.accent,fontWeight:600,display:'flex',alignItems:'center',gap:4}}>Visa bekräftelse <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg></div>}
        </div>)}
      </div>
    )}
  </div>;
}

function AdminPanel({bookings,onAction,onBack,actionLoading,T}){
  const [filter,setFilter]=useState('all');
  const [selected,setSelected]=useState(null);
  const [comment,setComment]=useState('');
  const [commentError,setCommentError]=useState('');
  const filtered=bookings.filter(b=>filter==='all'||b.status===filter).sort((a,b)=>b.created_at-a.created_at);
  const handleAction=(booking,action)=>{
    if(action==='rejected'&&!comment.trim()){setCommentError('Du måste ange en kommentar vid avböjning.');return;}
    onAction(booking.id,action,comment.trim());
    setSelected(null);setComment('');setCommentError('');
  };
  if(selected) return <div style={{padding:'20px 16px',fontFamily:'system-ui'}}>
    <BackButton onBack={()=>{setSelected(null);setComment('');setCommentError('');}} T={T}/>
    <div style={{fontSize:20,fontWeight:800,color:T.text,marginTop:16,marginBottom:16}}>Bokningsdetaljer</div>
    <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:16,padding:'16px',marginBottom:16}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
        <Badge status={selected.status}/><span style={{fontSize:10,color:T.textMuted}}>ID: {selected.id.toUpperCase()}</span>
      </div>
      {[['Namn',selected.name],['Telefon',selected.phone],['E-post',selected.email],['Datum',isoToDisplay(selected.date)],['Tid',selected.time_slot],['Aktivitet',selected.activity]].map(([l,v])=>(
        <div key={l} style={{marginBottom:10,paddingBottom:10,borderBottom:`1px solid ${T.border}`}}>
          <div style={{fontSize:10,fontWeight:700,color:T.textMuted,letterSpacing:'.5px',marginBottom:2}}>{l.toUpperCase()}</div>
          <div style={{fontSize:14,color:T.text}}>{v}</div>
        </div>
      ))}
    </div>
    {selected.status==='pending'&&<div style={{display:'flex',flexDirection:'column',gap:12}}>
      <Textarea label="KOMMENTAR (obligatorisk vid avböjning)" value={comment} onChange={setComment} placeholder="Ange orsak om du avböjer..." T={T}/>
      {commentError&&<div style={{fontSize:12,color:T.error,background:`${T.error}18`,padding:'8px 12px',borderRadius:8}}>{commentError}</div>}
      <div style={{display:'flex',gap:10}}>
        <button onClick={()=>handleAction(selected,'approved')} disabled={actionLoading} style={{flex:1,padding:'13px',borderRadius:12,border:'none',background:'#22c55e',color:'#fff',fontSize:15,fontWeight:700,cursor:actionLoading?'default':'pointer',WebkitTapHighlightColor:'transparent',display:'flex',alignItems:'center',justifyContent:'center',gap:6}}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          {actionLoading?'...':'Godkänn'}
        </button>
        <button onClick={()=>handleAction(selected,'rejected')} disabled={actionLoading} style={{flex:1,padding:'13px',borderRadius:12,border:'none',background:'#ef4444',color:'#fff',fontSize:15,fontWeight:700,cursor:actionLoading?'default':'pointer',WebkitTapHighlightColor:'transparent',display:'flex',alignItems:'center',justifyContent:'center',gap:6}}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          {actionLoading?'...':'Avböj'}
        </button>
      </div>
    </div>}
  </div>;
  const pending=bookings.filter(b=>b.status==='pending').length;
  return <div style={{padding:'20px 16px',fontFamily:'system-ui'}}>
    <BackButton onBack={onBack} T={T}/>
    <div style={{display:'flex',alignItems:'center',gap:10,marginTop:16,marginBottom:16}}>
      <div style={{fontSize:22,fontWeight:800,color:T.text,letterSpacing:'-.4px'}}>Adminpanel</div>
      {pending>0&&<div style={{background:'#f59e0b',color:'#fff',fontSize:11,fontWeight:700,borderRadius:10,padding:'3px 8px'}}>{pending} ny</div>}
    </div>
    <div style={{display:'flex',gap:6,marginBottom:14,flexWrap:'wrap'}}>
      {[['all','Alla'],['pending','Väntar'],['approved','Godkända'],['rejected','Avböjda']].map(([id,label])=>(
        <button key={id} onClick={()=>setFilter(id)} style={{padding:'5px 14px',borderRadius:20,border:`1px solid ${filter===id?T.accent:T.border}`,background:filter===id?`${T.accent}22`:'none',color:filter===id?T.accent:T.textMuted,fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'system-ui',WebkitTapHighlightColor:'transparent'}}>{label}</button>
      ))}
    </div>
    {filtered.length===0?<div style={{textAlign:'center',padding:'40px 0',color:T.textMuted,fontSize:14}}>Inga bokningar</div>:(
      <div style={{display:'flex',flexDirection:'column',gap:8}}>
        {filtered.map(b=><div key={b.id} onClick={()=>setSelected(b)} style={{background:T.card,border:`1px solid ${b.status==='pending'?'#f59e0b44':T.border}`,borderRadius:14,padding:'14px 16px',cursor:'pointer'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:4}}>
            <div style={{fontSize:14,fontWeight:700,color:T.text}}>{b.name}</div><Badge status={b.status}/>
          </div>
          <div style={{fontSize:12,color:T.textMuted,marginBottom:2}}>{isoToDisplay(b.date)} · {b.time_slot}</div>
          <div style={{fontSize:12,color:T.textMuted}}>{b.activity}</div>
        </div>)}
      </div>
    )}
  </div>;
}

function AdminLogin({onSuccess,onBack,T}){
  const [pin,setPin]=useState('');
  const [error,setError]=useState('');
  const handleSubmit=()=>{ if(pin===ADMIN_PIN){onSuccess();}else{setError('Fel PIN-kod. Försök igen.');setPin('');} };
  return <div style={{padding:'20px 16px',fontFamily:'system-ui'}}>
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

export default function BookingScreen({onBack}){
  const {theme:T}=useTheme();
  const [bookings,setBookings]=useState([]);
  const [dbLoading,setDbLoading]=useState(true);
  const [submitLoading,setSubmitLoading]=useState(false);
  const [actionLoading,setActionLoading]=useState(false);
  const [adminMode,setAdminModeState]=useState(()=>localStorage.getItem(STORAGE_ADMIN)==='true');
  const [view,setView]=useState('calendar');
  const [pendingSlot,setPendingSlot]=useState(null);
  const [viewConfirmation,setViewConfirmation]=useState(null);
  const [myBookings,setMyBookings]=useState([]);
  const [toast,setToast]=useState('');

  const showToast=useCallback((msg)=>{ setToast(msg); setTimeout(()=>setToast(''),3000); },[]);

  const fetchBookings=useCallback(async()=>{
    const {data,error}=await supabase.from('bookings').select('*').order('created_at',{ascending:false});
    if(!error&&data) setBookings(data);
    setDbLoading(false);
  },[]);

  useEffect(()=>{ fetchBookings(); },[fetchBookings]);

  useEffect(()=>{
    const channel=supabase.channel('bookings-realtime')
      .on('postgres_changes',{event:'*',schema:'public',table:'bookings'},()=>fetchBookings())
      .subscribe();
    return ()=>supabase.removeChannel(channel);
  },[fetchBookings]);

  useEffect(()=>{
    const handler=()=>{ if(view==='calendar') onBack(); else setView('calendar'); };
    window.addEventListener('edgeSwipeBack',handler);
    return ()=>window.removeEventListener('edgeSwipeBack',handler);
  },[onBack,view]);

  const handleSubmitBooking=useCallback(async(formData)=>{
    setSubmitLoading(true);
    const booking={id:uid(),name:formData.name,phone:formData.phone,email:formData.email,activity:formData.activity,date:formData.date,time_slot:formData.time_slot,status:'pending',admin_comment:'',created_at:Date.now(),resolved_at:null};
    const {error}=await supabase.from('bookings').insert([booking]);
    setSubmitLoading(false);
    if(error){ showToast('Något gick fel. Försök igen.'); return; }
    setMyBookings(prev=>[booking,...prev]);
    showToast('Bokningsförfrågan skickad!');
    setView('my-bookings');
  },[showToast]);

  const handleAdminAction=useCallback(async(bookingId,action,comment)=>{
    setActionLoading(true);
    const {error}=await supabase.from('bookings').update({status:action,admin_comment:comment,resolved_at:Date.now()}).eq('id',bookingId);
    setActionLoading(false);
    if(error){ showToast('Något gick fel.'); return; }
    showToast(action==='approved'?'Bokning godkänd ✓':'Bokning avböjd');
    setMyBookings(prev=>prev.map(b=>b.id===bookingId?{...b,status:action,admin_comment:comment}:b));
  },[showToast]);

  const handleAdminLogin=useCallback(()=>{ localStorage.setItem(STORAGE_ADMIN,'true'); setAdminModeState(true); setView('admin'); showToast('Välkommen, admin'); },[showToast]);
  const handleAdminLogout=useCallback(()=>{ localStorage.setItem(STORAGE_ADMIN,'false'); setAdminModeState(false); setView('calendar'); showToast('Utloggad'); },[showToast]);
  const handleSelectSlot=useCallback((date,slot,existingBooking)=>{ if(adminMode&&existingBooking){setView('admin');return;} setPendingSlot({date,slot}); setView('form'); },[adminMode]);
  const pendingCount=bookings.filter(b=>b.status==='pending').length;

  if(view==='form'&&pendingSlot) return <div style={{background:T.bg,minHeight:'100%'}}><BookingForm date={pendingSlot.date} slot={pendingSlot.slot} onSubmit={handleSubmitBooking} onBack={()=>setView('calendar')} loading={submitLoading} T={T}/><Toast message={toast} T={T}/></div>;
  if(view==='my-bookings'){
    if(viewConfirmation) return <div style={{background:T.bg,minHeight:'100%'}}><ConfirmationScreen booking={viewConfirmation} onBack={()=>setViewConfirmation(null)} T={T}/></div>;
    return <div style={{background:T.bg,minHeight:'100%'}}><MyBookings bookings={myBookings} onViewConfirmation={setViewConfirmation} onBack={()=>setView('calendar')} T={T}/><Toast message={toast} T={T}/></div>;
  }
  if(view==='admin-login') return <div style={{background:T.bg,minHeight:'100%'}}><AdminLogin onSuccess={handleAdminLogin} onBack={()=>setView('calendar')} T={T}/></div>;
  if(view==='admin') return <div style={{background:T.bg,minHeight:'100%'}}><AdminPanel bookings={bookings} onAction={handleAdminAction} onBack={()=>setView('calendar')} actionLoading={actionLoading} T={T}/><Toast message={toast} T={T}/></div>;

  return <div style={{background:T.bg,minHeight:'100%',fontFamily:'system-ui, sans-serif'}}>
    <style>{`@keyframes fadeInUp{from{opacity:0;transform:translateX(-50%) translateY(8px)}to{opacity:1;transform:translateX(-50%) translateY(0)}} @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    <div style={{padding:'20px 16px 24px',paddingTop:'max(20px, env(safe-area-inset-top))'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20}}>
        <div>
          <BackButton onBack={onBack} T={T}/>
          <div style={{fontSize:26,fontWeight:800,color:T.text,letterSpacing:'-.4px',marginTop:6}}>Boka lokal</div>
        </div>
        <div style={{display:'flex',gap:8}}>
          <button onClick={()=>setView('my-bookings')} style={{position:'relative',background:T.card,border:`1px solid ${T.border}`,borderRadius:12,width:40,height:40,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',WebkitTapHighlightColor:'transparent'}}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.textMuted} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          </button>
          <button onClick={()=>adminMode?setView('admin'):setView('admin-login')} style={{position:'relative',background:adminMode?`${T.accent}22`:T.card,border:`1px solid ${adminMode?T.accent+'66':T.border}`,borderRadius:12,width:40,height:40,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',WebkitTapHighlightColor:'transparent'}}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={adminMode?T.accent:T.textMuted} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            {pendingCount>0&&adminMode&&<div style={{position:'absolute',top:-3,right:-3,width:14,height:14,borderRadius:'50%',background:'#f59e0b',color:'#fff',fontSize:8,fontWeight:800,display:'flex',alignItems:'center',justifyContent:'center'}}>{pendingCount}</div>}
          </button>
          {adminMode&&<button onClick={handleAdminLogout} style={{background:'#ef444418',border:'1px solid #ef444433',borderRadius:12,width:40,height:40,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',WebkitTapHighlightColor:'transparent'}}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          </button>}
        </div>
      </div>
      {adminMode&&<div style={{background:`${T.accent}18`,border:`1px solid ${T.accent}44`,borderRadius:10,padding:'8px 12px',marginBottom:16,display:'flex',alignItems:'center',gap:8}}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <span style={{fontSize:12,color:T.accent,fontWeight:600}}>Adminläge aktivt — du ser alla bokningsdetaljer</span>
      </div>}
      <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:18,padding:'16px 14px'}}>
        {dbLoading?<Spinner T={T}/>:<CalendarView bookings={bookings} onSelectSlot={handleSelectSlot} isAdmin={adminMode} T={T}/>}
      </div>
      <p style={{fontSize:11,color:T.textMuted,textAlign:'center',marginTop:14,marginBottom:0}}>Välj ett datum och en ledig tid för att skicka en bokningsförfrågan.</p>
    </div>
    <Toast message={toast} T={T}/>
  </div>;
}
