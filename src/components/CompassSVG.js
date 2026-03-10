import React from 'react';

/**
 * QIBLA COMPASS — Korrekt logik (som Apple Kompass):
 *
 * RINGEN roterar med  -heading  → N/S/Ö/V sitter alltid på sina geografiska platser
 * KAABAN är STATISK på sin absoluta bäring (qiblaDir grader från 12 o'clock)
 *   → Om Qibla=148° placeras Kaaban vid 148° = mellan S och Ö, rör sig inte
 * PILEN pekar alltid upp (12 o'clock) — statisk
 * När du vrider telefonen mot 148° är pilen i linje med Kaaban → grön
 * HEADING i mitten visar vart du pekar live
 */
export default function CompassSVG({ heading, qiblaDir, isAligned, theme: T, size = 300 }) {
  const C  = size / 2;
  const OR = size / 2 - 36;   // outer ring edge
  const IR = OR - 52;         // inner ring edge (tick band width = 52)
  const CR = IR - 10;         // center circle

  const nc = isAligned ? '#4CAF82' : T.accent;

  const toRad = a => (a - 90) * Math.PI / 180;
  const tx = (a, r) => C + Math.cos(toRad(a)) * r;
  const ty = (a, r) => C + Math.sin(toRad(a)) * r;

  // Ring rotates so that North stays at geographic North
  // ring rotation = -heading (when heading=0 N is at top, when heading=90 ring rotates -90 so N is at left = correct)
  const ringRot = -((heading % 360 + 360) % 360);

  // Kaaba sits at fixed absolute angle = qiblaDir from top (12 o'clock)
  // It does NOT rotate — it's always at its geographic bearing on screen
  const kaabaAngle = qiblaDir != null ? qiblaDir : 0;
  const kaabaR = OR + 24; // outside the ring
  const kx = tx(kaabaAngle, kaabaR);
  const ky = ty(kaabaAngle, kaabaR);

  const displayDeg = Math.round(((heading % 360) + 360) % 360);

  const degLabels = Array.from({ length: 36 }, (_, i) => i * 10);

  return (
    <svg width={size} height={size} style={{ display:'block', overflow:'visible' }}>
      <defs>
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <filter id="kglow" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="6" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>

      {/* ── STATIC KAABA at its absolute geographic bearing ── */}
      {qiblaDir != null && (
        <g filter="url(#kglow)">
          <circle cx={kx} cy={ky} r={20}
            fill={isAligned ? '#4CAF82' : T.accent}
            opacity={isAligned ? 0.4 : 0.25} />
          <text x={kx} y={ky + 9}
            textAnchor="middle" fontSize="26">🕋</text>
        </g>
      )}

      {/* ── ROTATING RING (follows heading, N always points North) ── */}
      <g transform={`rotate(${ringRot}, ${C}, ${C})`}>

        {/* Ring background band */}
        <circle cx={C} cy={C} r={OR + 4}
          fill={T.bgSecondary}
          stroke={isAligned ? '#4CAF82' : T.border}
          strokeWidth={isAligned ? 2.5 : 1} />
        <circle cx={C} cy={C} r={IR} fill={T.bg} />

        {/* Tick marks every 5° */}
        {Array.from({ length: 72 }, (_, i) => i * 5).map(d => {
          const is90 = d % 90 === 0;
          const is30 = d % 30 === 0;
          const is10 = d % 10 === 0;
          const tl = is90 ? 16 : is30 ? 11 : is10 ? 7 : 4;
          const sw = is90 ? 2.5 : is30 ? 1.5 : 0.9;
          const col = is90 ? (isAligned ? '#4CAF82' : T.accent) : is30 ? T.textSecondary : T.border;
          const op = is90 ? 1 : is30 ? 0.7 : 0.4;
          return (
            <line key={d}
              x1={tx(d, OR)} y1={ty(d, OR)}
              x2={tx(d, OR - tl)} y2={ty(d, OR - tl)}
              stroke={col} strokeWidth={sw} opacity={op} />
          );
        })}

        {/* Degree labels every 30° — large and clear outside ring */}
        {degLabels.filter(d => d % 30 === 0).map(d => {
          const r = OR + 18;
          return (
            <text key={d}
              x={tx(d, r)} y={ty(d, r) + 4}
              textAnchor="middle"
              fontSize={d % 90 === 0 ? 13 : 11}
              fontWeight={d % 90 === 0 ? 800 : 500}
              fill={d % 90 === 0 ? (isAligned ? '#4CAF82' : T.accent) : T.textSecondary}
              opacity={d % 90 === 0 ? 1 : 0.65}
              fontFamily="'DM Sans',system-ui,sans-serif"
              transform={`rotate(${d}, ${tx(d,r)}, ${ty(d,r)})`}>
              {d}
            </text>
          );
        })}

        {/* Cardinal letters N S Ö V — inside the ring, big */}
        {[{l:'N',d:0},{l:'Ö',d:90},{l:'S',d:180},{l:'V',d:270}].map(({l, d}) => (
          <text key={l}
            x={tx(d, IR - 16)} y={ty(d, IR - 16) + 5}
            textAnchor="middle"
            fontSize="18" fontWeight="800"
            fill={l === 'N' ? (isAligned ? '#4CAF82' : T.accent) : T.text}
            fontFamily="'DM Sans',system-ui,sans-serif"
            transform={`rotate(${d}, ${tx(d,IR-16)}, ${ty(d,IR-16)})`}>
            {l}
          </text>
        ))}
      </g>
      {/* ── END ROTATING RING ── */}

      {/* ── CENTER CIRCLE (static) ── */}
      <circle cx={C} cy={C} r={CR}
        fill={T.bg}
        stroke={isAligned ? '#4CAF82' : T.border}
        strokeWidth={isAligned ? 2 : 1}
        opacity={isAligned ? 0.7 : 0.5} />

      {/* Crosshair lines in center */}
      <line x1={C} y1={C - CR + 6} x2={C} y2={C + CR - 6}
        stroke={T.border} strokeWidth="0.8" opacity="0.3" />
      <line x1={C - CR + 6} y1={C} x2={C + CR - 6} y2={C}
        stroke={T.border} strokeWidth="0.8" opacity="0.3" />

      {/* Heading in center */}
      <text x={C} y={C - 8}
        textAnchor="middle" fontSize="28" fontWeight="800"
        fill={isAligned ? '#4CAF82' : T.text}
        fontFamily="'DM Sans',system-ui,sans-serif"
        filter={isAligned ? 'url(#glow)' : undefined}>
        {displayDeg}°
      </text>
      <text x={C} y={C + 14}
        textAnchor="middle" fontSize="10" fontWeight="600"
        fill={T.textMuted}
        fontFamily="'DM Sans',system-ui,sans-serif">
        {qiblaDir != null ? `Qibla: ${Math.round(qiblaDir)}°` : 'Beräknar…'}
      </text>

      {/* ── STATIC ARROW pointing up — aligned with Kaaba when heading = qiblaDir ── */}
      <line x1={C} y1={C - (CR - 10)} x2={C} y2={C - (IR - 6)}
        stroke={nc} strokeWidth="3.5" strokeLinecap="round"
        filter={isAligned ? 'url(#glow)' : undefined} />
      <polygon
        points={`${C},${C-(IR-6)} ${C-9},${C-(IR-26)} ${C+9},${C-(IR-26)}`}
        fill={nc}
        filter={isAligned ? 'url(#glow)' : undefined} />
      <line x1={C} y1={C + (CR - 10)} x2={C} y2={C + 22}
        stroke={nc} strokeWidth="2.5" strokeLinecap="round" opacity="0.2" />

      {/* Pivot */}
      <circle cx={C} cy={C} r={6} fill={nc} opacity="0.25" />
      <circle cx={C} cy={C} r={3.5} fill={nc} />
      <circle cx={C} cy={C} r={1.5} fill={T.bg} />

      {/* Green ring when aligned */}
      {isAligned && (
        <circle cx={C} cy={C} r={OR + 12}
          fill="none" stroke="#4CAF82" strokeWidth="3"
          opacity="0.5" strokeDasharray="22 8"
          filter="url(#glow)" />
      )}
    </svg>
  );
}
