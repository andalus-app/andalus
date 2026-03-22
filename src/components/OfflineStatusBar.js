/**
 * OfflineStatusBar — visar bokningsstatus vid offline/sync
 *
 * Props:
 *   status   'queued' | 'syncing' | 'sent' | null
 *   T        theme object från useTheme()
 *   position 'bottom' | 'top'  (default: 'bottom')
 */

import React, { useEffect, useRef, useState } from 'react';

// ── Spinner ──────────────────────────────────────────────────────────────────
function Spinner({ color }) {
  return (
    <svg
      width="18" height="18" viewBox="0 0 18 18" fill="none"
      style={{ animation: 'osb-spin 1.1s linear infinite', flexShrink: 0 }}
    >
      <circle cx="9" cy="9" r="7" stroke={color} strokeOpacity="0.18" strokeWidth="2"/>
      <path d="M9 2a7 7 0 0 1 7 7" stroke={color} strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}

// ── Checkmark ────────────────────────────────────────────────────────────────
function Checkmark({ color }) {
  return (
    <svg
      width="18" height="18" viewBox="0 0 18 18" fill="none"
      style={{ flexShrink: 0, animation: 'osb-pop 0.32s cubic-bezier(0.34,1.56,0.64,1)' }}
    >
      <circle cx="9" cy="9" r="8.5" stroke={color} strokeOpacity="0.25"/>
      <path
        d="M5.5 9.5l2.5 2.5 4.5-5"
        stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function OfflineStatusBar({ status, T, position = 'bottom' }) {
  const [visible, setVisible] = useState(false);
  const [displayStatus, setDisplayStatus] = useState(status);
  const prevRef = useRef(status);

  // Entrance / exit
  useEffect(() => {
    if (status === null) {
      // Brief delay before hiding (lets 'sent' animation settle)
      const t = setTimeout(() => setVisible(false), 400);
      return () => clearTimeout(t);
    }
    setDisplayStatus(status);
    setVisible(true);
  }, [status]);

  // Smooth state transition: keep showing previous state briefly
  useEffect(() => {
    if (status && status !== prevRef.current) {
      // Small delay so the old state is visible for a moment
      const t = setTimeout(() => setDisplayStatus(status), 180);
      prevRef.current = status;
      return () => clearTimeout(t);
    }
    prevRef.current = status;
  }, [status]);

  if (!visible && !status) return null;

  // ── Colors ──────────────────────────────────────────────────────────────
  const isSent = displayStatus === 'sent';
  const isDark = T?.isDark ?? false;

  const bg = isSent
    ? isDark ? 'rgba(52,199,89,0.14)' : 'rgba(52,199,89,0.10)'
    : isDark ? 'rgba(255,255,255,0.07)' : 'rgba(36,100,93,0.07)';

  const border = isSent
    ? isDark ? 'rgba(52,199,89,0.25)' : 'rgba(52,199,89,0.22)'
    : isDark ? 'rgba(255,255,255,0.10)' : 'rgba(36,100,93,0.12)';

  const iconColor = isSent
    ? '#34C759'
    : T?.accent ?? '#24645d';

  const textColor = isSent
    ? isDark ? '#34C759' : '#1a7a3a'
    : isDark ? 'rgba(255,255,255,0.75)' : 'rgba(36,100,93,0.85)';

  const text = isSent
    ? 'Bokning skickad'
    : 'Skickas automatiskt när du är online';

  // ── Positioning ─────────────────────────────────────────────────────────
  const posStyle = position === 'top'
    ? { top: 'max(16px, env(safe-area-inset-top, 16px))', left: 0, right: 0 }
    : { bottom: 'max(104px, calc(env(safe-area-inset-bottom, 0px) + 96px))', left: 0, right: 0 };

  return (
    <>
      <style>{`
        @keyframes osb-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes osb-pop {
          from { transform: scale(0.6); opacity: 0; }
          to   { transform: scale(1);   opacity: 1; }
        }
        @keyframes osb-in {
          from { opacity: 0; transform: translateY(8px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)   scale(1); }
        }
        @keyframes osb-out {
          from { opacity: 1; transform: translateY(0)   scale(1); }
          to   { opacity: 0; transform: translateY(6px) scale(0.97); }
        }
        @keyframes osb-fade {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
      `}</style>

      <div
        style={{
          position: 'fixed',
          zIndex: 1800,
          display: 'flex',
          justifyContent: 'center',
          padding: '0 20px',
          pointerEvents: 'none',
          animation: status ? 'osb-in 0.30s cubic-bezier(0.4,0,0.2,1)' : 'osb-out 0.28s cubic-bezier(0.4,0,0.2,1) forwards',
          ...posStyle,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 16px',
            borderRadius: 32,
            background: bg,
            border: `1px solid ${border}`,
            boxShadow: isDark
              ? '0 2px 16px rgba(0,0,0,0.28), 0 1px 4px rgba(0,0,0,0.18)'
              : '0 2px 16px rgba(36,100,93,0.10), 0 1px 4px rgba(0,0,0,0.06)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            maxWidth: 340,
            width: '100%',
            boxSizing: 'border-box',
            transition: 'background 0.4s ease, border-color 0.4s ease',
          }}
        >
          {/* Icon */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 20, height: 20, flexShrink: 0,
            animation: 'osb-fade 0.25s ease',
            key: displayStatus, // force remount on state change
          }}>
            {isSent
              ? <Checkmark color={iconColor}/>
              : <Spinner color={iconColor}/>
            }
          </div>

          {/* Text */}
          <span
            key={displayStatus}
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: textColor,
              fontFamily: "'Inter', system-ui, sans-serif",
              letterSpacing: '-0.1px',
              lineHeight: 1.3,
              animation: 'osb-fade 0.25s ease',
              transition: 'color 0.4s ease',
              flex: 1,
            }}
          >
            {text}
          </span>
        </div>
      </div>
    </>
  );
}
