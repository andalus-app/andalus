import React, { useState } from 'react';
import { useTheme } from '../context/ThemeContext';
import { useBanner } from '../hooks/useBanner';
import { useBookingNotifications } from '../hooks/useBookingNotifications';
import SvgIcon from './SvgIcon';

/* ── Andalus logotyp — inline SVG, färg följer tema ── */
function AndalusLogo({ size = 48, color = '#25655e' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 297.8647687 300" xmlns="http://www.w3.org/2000/svg">
      <defs><style>{`.al-fill { fill: ${color}; }`}</style></defs>
      <path className="al-fill" d="M229.8983337,232.4419815c-23.3515973-3.4663809-44.5192984.690603-63.4835746,14.1136076-4.1402025,2.9304127-7.5731318,6.8600668-12.6031989,11.50312,1.2087873-6.6497041,4.9039832-9.6434929,8.0594981-12.5828532,16.6636522-15.5221022,36.8377552-21.4412172,59.2001354-20.2233709,5.0363045.2742586,6.2443493-1.2224873,6.4749835-5.9114297.6485379-13.1849821-1.8041591-26.2285468-1.4120216-39.3846439.0348253-1.1676504-.0326719-2.8026951-.7493011-3.4530894-4.6967392-4.2630192-2.8881248-9.0038284-1.6808225-14.0000727,3.849645-15.930984-.3694156-30.4604348-10.1129292-42.8694028-15.795544-20.1165559-36.2824066-34.5198856-59.4625504-45.1581647-3.94625-1.8111019-7.8916089-1.8435882-11.7438157.0306671-24.179608,11.7641614-45.9181399,26.8398647-61.8456711,48.8430021-9.183821,12.6870321-10.5376272,27.3678506-6.5710687,42.4192727.8799517,3.3389975,1.2909127,6.2469854-1.004959,9.1638466-.8292731,1.0535214-1.6135481,2.5546112-1.5681415,3.8209828.4865891,13.5685432-2.5578041,26.9652989-1.7513271,40.573197.3163609,5.3370348,2.3572059,6.1291065,7.227329,5.8551078,25.5700588-1.4384562,47.4196381,6.6087528,64.3219439,26.4371645,1.1310801,1.3269632,2.7193817,2.5248352,2.1893167,5.5824456-38.4011816-37.349071-79.0540906-30.2310816-120.478243-7.2756687,33.40865-9.897183,66.5982867-13.1018543,98.9083429,4.3126583,7.9176722,4.2674002,15.0504011,9.6484679,20.2918334,17.6165217-42.6931229-31.907783-88.183706-27.5604479-135.1094409-11.1907318,9.3535295-10.5808433,4.9608249-22.8986083,5.1624256-34.2563011.5683803-32.0232857.1322842-64.0636499.1841138-96.0971271.0500475-30.9299825,12.2514558-55.9516911,37.61557-73.766435,27.0783512-19.0187418,56.1911244-34.6925642,85.4917613-49.9847748,8.3014932-4.3326327,16.492273-4.7589272,24.989872-.3523,30.7791162,15.9612612,61.4718744,32.1288198,89.4498177,52.7476324,22.9265651,16.8961241,33.8553273,40.4259134,34.1244253,68.6610182.3437979,36.0853725-.0389093,72.1773166.1979622,108.2644341.055468,8.4540859-3.3367699,18.0762678,6.70688,24.776502-47.6048657-17.927462-93.148058-19.2972329-136.3367176,12.2321497,4.0634977-12.1885252,31.3417417-25.7651622,54.1177189-29.3116265,21.287622-3.3147906,41.7467135.1198466,62.3805255,4.7521329-12.3222945-8.6278041-25.9948311-13.4941774-41.1806722-15.8874709Z"/>
      <path className="al-fill" d="M202.9953714,280.3336547c-15.7446797,3.6087637-30.5327401,8.3959076-44.4568505,15.6493742-6.3690967,3.317835-12.8247369,3.2756585-19.2411708.1406378-30.5720578-14.9370518-62.8805918-21.9839426-96.8771881-21.3017304-9.3015143.1866384-18.6220376-.2255849-27.8904716,1.2003595-3.0489598.4691022-6.2913152.6753066-10.2812639-.8255233,7.7859077-6.9863735,16.5695718-9.9241374,25.5778926-11.5995022,38.6925558-7.195808,76.1850121-3.6110285,111.7953792,13.96573,5.0021475,2.469033,8.9982222,2.4734882,14.1537421.0373128,27.175476-12.8412957,55.7306729-18.7830954,85.9661726-17.0737221,14.5050026.8201027,28.5771762,2.694952,42.0227913,8.2670391,3.4928526,1.447441,7.0805281,2.9060201,10.3688098,7.670108-31.1506852-2.2134122-61.1370614-3.5036566-91.1378429,3.8699164Z"/>
      <path className="al-fill" d="M139.713843,178.4258055c-11.0575565-5.2621864-16.4931641-14.0691664-16.2162323-25.4301635.2829093-11.6045515,7.1263802-19.4153159,17.7786562-23.8601656,1.6566527-.6912528,3.2516743-1.7640246,5.8266312-.0805475-10.7726795,8.6426921-13.8290648,19.1206559-6.5349068,31.2443385,3.2698295,5.4349393,8.2636234,8.7957304,14.8055101,9.442412,6.0947267.6025373,11.8417201-.6599731,18.0082508-5.0452151-4.3064581,13.2168001-18.606964,18.4807315-33.6679092,13.7293411Z"/>
    </svg>
  );
}

/* ── Countdown to scheduled stream ─────────────────────────── */
function useCountdownTo(isoDate) {
  const [label, setLabel] = React.useState('');
  React.useEffect(() => {
    if (!isoDate) return;
    const tick = () => {
      const diff = new Date(isoDate) - Date.now();
      if (diff <= 0) { setLabel('Startar snart'); return; }
      const h = Math.floor(diff / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      const s = Math.floor((diff % 60_000) / 1_000);
      setLabel(h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [isoDate]);
  return label;
}

/* ── YouTube live/upcoming card ─────────────────────────────── */
function YoutubeCard({ stream, T }) {
  const countdown = useCountdownTo(
    stream.status === 'upcoming' ? stream.scheduledStart : null
  );

  const isLive = stream.status === 'live';

  const scheduledLabel = React.useMemo(() => {
    if (!stream.scheduledStart) return null;
    return new Date(stream.scheduledStart).toLocaleString('sv-SE', {
      weekday: 'long', day: 'numeric', month: 'short',
      hour: '2-digit', minute: '2-digit',
    });
  }, [stream.scheduledStart]);

  return (
    <a
      href={`https://www.youtube.com/watch?v=${stream.videoId}`}
      target="_blank"
      rel="noopener noreferrer"
      style={{ textDecoration: 'none', display: 'block' }}
    >
      <div style={{
        borderRadius: 16,
        overflow: 'hidden',
        border: `1px solid ${isLive ? '#FF0000' : '#f59e0b66'}`,
        boxShadow: isLive
          ? '0 0 0 2px rgba(255,0,0,0.2), 0 4px 24px rgba(255,0,0,0.15)'
          : '0 0 0 1px rgba(245,158,11,0.15), 0 4px 20px rgba(0,0,0,0.08)',
        background: T.card,
        animation: isLive ? 'cardIn .35s ease both, liveCardRing 2s ease-out infinite' : 'cardIn .35s ease both',
      }}>
        {/* Thumbnail */}
        <div style={{ position: 'relative', aspectRatio: '16/9', background: '#0f0f0f', overflow: 'hidden' }}>
          {stream.thumbnail ? (
            <img
              src={stream.thumbnail}
              alt={stream.title}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          ) : (
            /* Fallback för upcoming utan custom thumbnail */
            <div style={{
              width: '100%', height: '100%',
              background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12,
            }}>
              <svg width="48" height="34" viewBox="0 0 48 34" fill="none">
                <rect width="48" height="34" rx="8" fill="#FF0000"/>
                <path d="M19 10l13 7-13 7V10z" fill="white"/>
              </svg>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', fontFamily: "'Inter',system-ui,sans-serif", textAlign: 'center', padding: '0 16px' }}>
                {stream.title}
              </div>
            </div>
          )}

          {/* Live badge — pulsande */}
          {isLive && (
            <div style={{
              position: 'absolute', top: 10, left: 10,
              background: '#FF0000', color: '#fff',
              borderRadius: 6, padding: '4px 10px',
              fontSize: 11, fontWeight: 800, letterSpacing: 1,
              fontFamily: "'Inter',system-ui,sans-serif",
              display: 'flex', alignItems: 'center', gap: 6,
              boxShadow: '0 2px 12px rgba(255,0,0,0.5)',
            }}>
              <span style={{
                width: 7, height: 7, borderRadius: '50%',
                background: '#fff',
                animation: 'livePulse 1s ease-in-out infinite',
                flexShrink: 0,
              }}/>
              LIVE
            </div>
          )}

          {/* Upcoming badge */}
          {!isLive && (
            <div style={{
              position: 'absolute', top: 10, left: 10,
              background: 'rgba(245,158,11,0.9)', color: '#fff',
              borderRadius: 6, padding: '4px 10px',
              fontSize: 11, fontWeight: 700,
              fontFamily: "'Inter',system-ui,sans-serif",
              display: 'flex', alignItems: 'center', gap: 5,
              backdropFilter: 'blur(4px)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            }}>
              <span style={{ fontSize: 12 }}>📅</span> Schemalagd
            </div>
          )}

          {/* Play-knapp overlay */}
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: isLive ? 'rgba(0,0,0,0.12)' : 'rgba(0,0,0,0.22)',
          }}>
            <div style={{
              width: isLive ? 56 : 52, height: isLive ? 56 : 52,
              borderRadius: '50%',
              background: isLive ? '#FF0000' : 'rgba(255,255,255,0.92)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: isLive ? '0 4px 20px rgba(255,0,0,0.5)' : '0 2px 12px rgba(0,0,0,0.3)',
              transition: 'transform .15s',
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill={isLive ? '#fff' : '#111'}>
                <path d="M8 5v14l11-7z"/>
              </svg>
            </div>
          </div>
        </div>

        {/* Info rad */}
        <div style={{ padding: '12px 14px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{
            fontSize: 14, fontWeight: 700, color: T.text,
            lineHeight: 1.35, fontFamily: "'Inter',system-ui,sans-serif",
            display: '-webkit-box', WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>{stream.title}</div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <AndalusLogo size={20} color={T.isDark ? T.accent : T.accent} />
              <span style={{ fontSize: 12, color: T.textMuted, fontFamily: "'Inter',system-ui,sans-serif" }}>Andalus</span>
            </div>
            {isLive ? (
              <span style={{
                fontSize: 12, fontWeight: 800, color: '#FF0000', fontFamily: "'Inter',system-ui,sans-serif",
                display: 'flex', alignItems: 'center', gap: 4,
              }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#FF0000', animation: 'livePulse 1s ease-in-out infinite', display: 'inline-block' }}/>
                Titta nu →
              </span>
            ) : (
              <div style={{ textAlign: 'right' }}>
                {scheduledLabel && (
                  <div style={{ fontSize: 11, color: T.textMuted, fontFamily: "'Inter',system-ui,sans-serif", textTransform: 'capitalize' }}>{scheduledLabel}</div>
                )}
                {countdown && (
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#f59e0b', fontFamily: "'Inter',system-ui,sans-serif" }}>
                    om {countdown}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </a>
  );
}


/* ── Booking notification label helpers ── */
function bookingNotifText(n) {
  const statusLabel = {
    approved:  'Din bokning har godkänts',
    rejected:  'Din bokning avböjdes',
    cancelled: 'Din bokning ställdes in',
    edited:    'Din bokning ändrades av admin',
  };
  const base = statusLabel[n.status] || 'Uppdatering på din bokning';
  return `${base} — ${n.date ? n.date.split('-').reverse().join('/') : ''} · ${n.time_slot || ''}`;
}
function bookingNotifColor(status) {
  return status==='approved'?'#22c55e':status==='rejected'?'#ef4444':status==='edited'?'#3b82f6':'#64748b';
}

/* ── Main screen ── */
export default function NewHomeScreen({ stream, onGoToAdminLogin, onGoToMyBookings }) {
  const { theme: T, mode, setMode } = useTheme();
  const { allBanners, banners, unreadCount, read, dismiss, markRead, markAllRead } = useBanner();
  const { bellNotifs, visitorUnread, adminPendingNotif, adminUnread, adminPendingCount, isAdminState, markVisitorSeen, markVisitorBadgeSeen, dismissAdminDevice } = useBookingNotifications();
  const [showBellPanel, setShowBellPanel] = React.useState(false);
  const [adminNotifDismissedThisSession, setAdminNotifDismissedThisSession] = React.useState(false);

  const isAdmin = isAdminState;

  // Show admin pending notif:
  // - Non-logged-in admin device: show when there are pending bookings
  // - Logged-in admin: show when there are pending bookings (adminUnread or adminPendingCount)
  const adminPendingForBell = isAdmin
    ? (adminUnread > 0 || adminPendingCount > 0 ? { count: adminUnread || adminPendingCount } : null)
    : adminPendingNotif;
  const showAdminPending = adminPendingForBell && !adminNotifDismissedThisSession;

  const totalUnread = unreadCount + visitorUnread + (showAdminPending ? 1 : 0);

  const handleBellOpen = (e) => {
    e.stopPropagation();
    setShowBellPanel(prev => {
      if (prev) return false; // already open — close it
      // Opening: mark banners read and clear badge
      allBanners.forEach(b => markRead(b.id));
      if (visitorUnread > 0) markVisitorBadgeSeen();
      return true;
    });
  };

  // If already logged in as admin → go directly to admin panel, else go to login
  const handleAdminNotifClick = () => {
    setShowBellPanel(false);
    onGoToAdminLogin?.(); // App.js handles routing: if adminMode → admin panel, else → login
  };

  const allItems = [
    ...(showAdminPending ? [{ type: 'admin_pending', count: adminPendingForBell.count }] : []),
    ...bellNotifs.map(n => ({ type: 'booking', ...n })),
    ...allBanners.map(b => ({ type: 'banner', ...b })),
  ];

  return (
    <div
      style={{ background: T.bg, minHeight: '100%', fontFamily: "'Inter',system-ui,sans-serif" }}
      onClick={() => setShowBellPanel(false)}
    >
      <style>{`
        @keyframes fadeUp   { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes bannerIn { from{opacity:0;transform:translateY(-6px)} to{opacity:1;transform:translateY(0)} }
        @keyframes cardIn   { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        @keyframes livePulse{ 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.3;transform:scale(.6)} }
        @keyframes liveCardRing{ 0%{box-shadow:0 0 0 2px rgba(255,0,0,0.2),0 4px 24px rgba(255,0,0,0.15)} 50%{box-shadow:0 0 0 4px rgba(255,0,0,0.08),0 4px 24px rgba(255,0,0,0.1)} 100%{box-shadow:0 0 0 2px rgba(255,0,0,0.2),0 4px 24px rgba(255,0,0,0.15)} }
      `}</style>

      {/* ── TOP BAR ── */}
      <div style={{
        position: 'relative',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 0,
        minHeight: 104,
      }}>
        {/* Logo — left:22 matches HomeScreen outer padding(14) + left(8) */}
        <div style={{ position: 'absolute', top: 12, left: 22, pointerEvents: 'none', userSelect: 'none' }}>
          <AndalusLogo size={80} color={T.isDark ? T.accent : T.accent} />
        </div>

        <div style={{ fontSize: 18, fontWeight: 600, color: T.text, letterSpacing: '-.3px' }}>Hem</div>

        {/* Right side — absolute right, same pattern as Bönetider */}
        <div style={{ position: 'absolute', top: 4, right: 18, display: 'flex', alignItems: 'center', gap: 0 }}>

          {/* Theme toggle — sun ↔ moon with spin animation */}
          <style>{`
            @keyframes iconSpin { 0% { transform: rotate(-30deg) scale(0.7); opacity: 0; } 100% { transform: rotate(0deg) scale(1); opacity: 1; } }
          `}</style>
          <button
            onClick={() => setMode(T.isDark ? 'light' : 'dark')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 8, WebkitTapHighlightColor: 'transparent', overflow: 'hidden' }}
          >
            <div key={T.isDark ? 'moon' : 'sun'} style={{ animation: 'iconSpin .25s ease both', display: 'flex' }}>
              <SvgIcon
                name={T.isDark ? 'moon' : 'sun'}
                size={22}
                color={T.textMuted}
                style={{ opacity: 0.6 }}
              />
            </div>
          </button>

        {/* Bell */}
        <div style={{ position: 'relative' }}>
          <button onClick={handleBellOpen}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 8, WebkitTapHighlightColor: 'transparent' }}>
            <div style={{ position: 'relative', display: 'inline-flex' }}>
              <SvgIcon name="bell" size={24} color={totalUnread > 0 ? T.accent : T.textMuted}
                style={{ opacity: totalUnread > 0 ? 1 : 0.5, transition: 'color .2s, opacity .2s' }} />
              {totalUnread > 0 && (
                <div style={{
                  position: 'absolute', top: -4, right: -4,
                  minWidth: 17, height: 17, borderRadius: 9,
                  background: '#FF3B30', border: `2px solid ${T.bg}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: '0 3px', boxSizing: 'border-box',
                  animation: 'fadeUp .2s ease',
                }}>
                  <span style={{ fontSize: 9, fontWeight: 800, color: '#fff', lineHeight: 1 }}>
                    {totalUnread > 9 ? '9+' : totalUnread}
                  </span>
                </div>
              )}
            </div>
          </button>

          {showBellPanel && (
            <div onClick={e => e.stopPropagation()} style={{
              position: 'absolute', top: 44, right: 0,
              width: 'min(320px, calc(100vw - 32px))',
              background: T.card, border: `1px solid ${T.border}`,
              borderRadius: 16, zIndex: 500,
              boxShadow: `0 8px 32px rgba(0,0,0,${T.isDark ? '0.5' : '0.12'})`,
              overflow: 'hidden', animation: 'fadeUp .2s ease both',
              maxHeight: '70vh', overflowY: 'auto',
            }}>
              {/* Panel header */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 14px 10px', borderBottom: `1px solid ${T.border}`,
                position: 'sticky', top: 0, background: T.card, zIndex: 1,
              }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Meddelanden</span>
                <button onClick={() => { markAllRead(); markVisitorSeen(); setAdminNotifDismissedThisSession(true); setShowBellPanel(false); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700, color: T.accent, padding: '2px 0' }}>
                  Rensa meddelanden
                </button>
              </div>

              {allItems.length === 0
                ? <div style={{ padding: '20px 14px', fontSize: 13, color: T.textMuted, textAlign: 'center' }}>Inga meddelanden</div>
                : allItems.map((item) => {

                  /* ── Admin pending notis ── */
                  if (item.type === 'admin_pending') return (
                    <div key="admin-pending" style={{ borderBottom: `1px solid ${T.border}`, background: T.isDark ? 'rgba(245,158,11,0.07)' : 'rgba(245,158,11,0.05)' }}>
                      <div onClick={handleAdminNotifClick} style={{ padding: '12px 14px 8px', display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
                        <div style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0, background: '#f59e0b22', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                          </svg>
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: '#f59e0b', marginBottom: 2 }}>Adminpanel</div>
                          <div style={{ fontSize: 13, color: T.text, lineHeight: 1.45 }}>
                            {item.count} bokning{item.count !== 1 ? 'ar' : ''} väntar på åtgärd —{' '}
                            <span style={{ color: T.accent, fontWeight: 600 }}>
                              {isAdmin ? 'öppna adminpanel' : 'logga in'}
                            </span>
                          </div>
                        </div>
                        <button onClick={e => { e.stopPropagation(); setAdminNotifDismissedThisSession(true); }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.textMuted, fontSize: 18, lineHeight: 1, padding: '0 2px', flexShrink: 0, WebkitTapHighlightColor: 'transparent' }}>×</button>
                      </div>
                      {!isAdmin && (
                        <div style={{ padding: '0 14px 10px', paddingLeft: 52 }}>
                          <button onClick={async e => { e.stopPropagation(); setAdminNotifDismissedThisSession(true); await dismissAdminDevice(); }}
                            style={{ background: 'none', border: `1px solid ${T.border}`, borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 600, color: T.textMuted, cursor: 'pointer', fontFamily: "'Inter',system-ui,sans-serif", WebkitTapHighlightColor: 'transparent' }}>
                            Jag är inte admin — visa inte igen
                          </button>
                        </div>
                      )}
                    </div>
                  );

                  /* ── Bokningsnotis ── */
                  if (item.type === 'booking') {
                    const color = bookingNotifColor(item.status);
                    return (
                      <div key={`booking-${item.id}`}
                        onClick={() => { setShowBellPanel(false); markVisitorSeen(); onGoToMyBookings?.(item.id); }}
                        style={{ padding: '11px 14px', borderBottom: `1px solid ${T.border}`, background: T.isDark ? `${color}09` : `${color}07`, display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
                        <div style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0, background: `${color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            {item.status==='approved'?<polyline points="20 6 9 17 4 12"/>:item.status==='rejected'||item.status==='cancelled'?<><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>:<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>}
                          </svg>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color, marginBottom: 2 }}>Bokningsuppdatering</div>
                          <div style={{ fontSize: 13, color: T.text, lineHeight: 1.45 }}>{bookingNotifText(item)}</div>
                          {item.admin_comment && <div style={{ fontSize: 11, color: T.textMuted, marginTop: 3, fontStyle: 'italic' }}>"{item.admin_comment}"</div>}
                          <div style={{ fontSize: 11, color: color, fontWeight: 600, marginTop: 4 }}>Visa bokning →</div>
                        </div>
                      </div>
                    );
                  }

                  /* ── Banner ── */
                  const isRead = read.includes(item.id);
                  return (
                    <div key={`banner-${item.id}`} style={{ padding: '11px 14px', borderBottom: `1px solid ${T.border}`, background: isRead ? 'transparent' : T.isDark ? 'rgba(45,139,120,0.06)' : 'rgba(36,100,93,0.05)', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      <div style={{ width: 7, height: 7, borderRadius: 4, flexShrink: 0, marginTop: 5, background: isRead ? 'transparent' : T.accent }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, color: T.textSecondary, lineHeight: 1.5 }}>{item.message}</div>
                        {item.linkText && item.linkUrl && (
                          <a href={item.linkUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', marginTop: 5, fontSize: 12, fontWeight: 700, color: T.accent, textDecoration: 'underline', textUnderlineOffset: 2 }}>{item.linkText} →</a>
                        )}
                      </div>
                    </div>
                  );
                })
              }
            </div>
          )}
        </div>
        </div>{/* end right wrapper */}
      </div>

      {/* ── CONTENT ── */}
      <div style={{ padding: '0 16px 32px', display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Admin-kort: synligt när inloggad som admin och det finns pending */}
        {isAdmin && adminUnread > 0 && (
          <div onClick={() => onGoToAdminLogin?.()} style={{
            background: T.card, border: `2px solid #f59e0b66`,
            borderLeft: `4px solid #f59e0b`,
            borderRadius: 14, padding: '13px 14px',
            display: 'flex', alignItems: 'center', gap: 12,
            cursor: 'pointer', animation: 'bannerIn .3s ease both',
          }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: '#f59e0b22', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#f59e0b', marginBottom: 2, fontFamily: "'Inter',system-ui,sans-serif" }}>ADMINPANEL</div>
              <div style={{ fontSize: 13, fontWeight: 400, color: T.text, fontFamily: "'Inter',system-ui,sans-serif" }}>
                {adminUnread} bokning{adminUnread !== 1 ? 'ar' : ''} väntar på åtgärd
              </div>
            </div>
            <div style={{ background: '#f59e0b', color: '#fff', borderRadius: 8, minWidth: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, padding: '0 6px', fontFamily: "'Inter',system-ui,sans-serif" }}>
              {adminUnread > 9 ? '9+' : adminUnread}
            </div>
          </div>
        )}

        {/* Inline banner feed */}
        {banners.map((b, i) => (
          <div key={b.id} style={{
            background: T.card, border: `1px solid ${T.accent}44`, borderLeft: `4px solid ${T.accent}`,
            borderRadius: 14, padding: '13px 14px', display: 'flex', alignItems: 'flex-start', gap: 12,
            boxShadow: `0 2px 16px ${T.accentGlow}`, animation: `bannerIn .3s ease both`, animationDelay: `${i * 60}ms`,
          }}>
            <AndalusLogo size={26} color={T.isDark ? T.accent : T.accent} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, lineHeight: 1.55, fontWeight: 400, color: T.textSecondary, fontFamily: "'Inter',system-ui,sans-serif" }}>{b.message}</div>
              {b.linkText && b.linkUrl && (
                <a href={b.linkUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', marginTop: 6, fontSize: 12, fontWeight: 700, color: T.accent, textDecoration: 'underline', textUnderlineOffset: 3, fontFamily: "'Inter',system-ui,sans-serif" }}>{b.linkText} →</a>
              )}
            </div>
            <button onClick={e => { e.stopPropagation(); dismiss(b.id); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.textMuted, fontSize: 20, lineHeight: 1, padding: '0 2px', flexShrink: 0, marginTop: -2, WebkitTapHighlightColor: 'transparent' }}>×</button>
          </div>
        ))}

        {/* YouTube live / upcoming */}
        {stream && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              {stream.status === 'live' ? (
                <>
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%', background: '#FF0000', flexShrink: 0,
                    animation: 'livePulse 1s ease-in-out infinite',
                    boxShadow: '0 0 6px rgba(255,0,0,0.6)',
                  }}/>
                  <span style={{ fontSize: 10, fontWeight: 800, color: '#FF0000', textTransform: 'uppercase', letterSpacing: 1.2, fontFamily: "'Inter',system-ui,sans-serif" }}>
                    Direktsändning just nu
                  </span>
                </>
              ) : (
                <>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b', flexShrink: 0 }}/>
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: 1.2, fontFamily: "'Inter',system-ui,sans-serif" }}>
                    Kommande sändning
                  </span>
                </>
              )}
            </div>
            <YoutubeCard stream={stream} T={T} />
          </div>
        )}
      </div>
    </div>
  );
}
