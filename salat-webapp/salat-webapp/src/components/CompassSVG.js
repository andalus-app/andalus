import React from 'react';

/**
 * Qibla Compass
 *
 * Design inspired by classic Qibla compasses:
 * - The ROSE (ring with N/S/E/W markings) ROTATES with the device heading
 *   so "N" always tracks real North.
 * - The KAABA marker is fixed at the top of the SVG (12 o'clock), but
 *   because the rose rotates, the Kaaba marker effectively points in the
 *   correct Qibla direction relative to the device.
 * - A static red needle always points straight up (toward the Kaaba marker).
 *
 * animNeedle: degrees = qiblaDir - deviceHeading  (how much to rotate the rose)
 */
export default function CompassSVG({ animNeedle, isAligned, theme: T, size = 280 }) {
  const C   = size / 2;
  const OR  = size / 2 - 6;   // outer ring radius
  const RR  = OR - 22;         // rose ring radius  
  const IR  = RR - 18;         // inner circle radius

  const rad = a => (a - 90) * Math.PI / 180;
  const px  = (a, r) => C + Math.cos(rad(a)) * r;
  const py  = (a, r) => C + Math.sin(rad(a)) * r;

  const ticks = Array.from({ length: 72 }, (_, i) => i * 5);
  const cardinals = [
    {l:'N',d:0},{l:'NO',d:45},{l:'O',d:90},{l:'SO',d:135},
    {l:'S',d:180},{l:'SV',d:225},{l:'V',d:270},{l:'NV',d:315},
  ];

  const nc = isAligned ? '#4CAF82' : T.accent;

  // Rose rotates: animNeedle = qiblaDir - heading
  // So when device faces Qibla, animNeedle=0 and N is at top, Kaaba at top = aligned
  const roseRotation = animNeedle;

  // Needle (static, always points up / 12 o'clock)
  const needleLen = IR - 16;
  const arrowW    = 9;
  const arrowH    = 22;

  return (
    <svg width={size} height={size} style={{ display:'block', overflow:'visible' }}>
      <defs>
        <radialGradient id="bg-grad" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor={T.cardElevated || T.card} />
          <stop offset="100%" stopColor={T.bgSecondary} />
        </radialGradient>
        <filter id="needle-glow">
          <feGaussianBlur stdDeviation="3" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <filter id="kaaba-shadow">
          <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor={T.accent} floodOpacity="0.5"/>
        </filter>
      </defs>

      {/* Outer bezel */}
      <circle cx={C} cy={C} r={OR + 4} fill={T.bgSecondary}
        stroke={isAligned ? '#4CAF82' : T.border}
        strokeWidth={isAligned ? 3 : 1.5} />

      {/* === ROTATING ROSE GROUP === */}
      <g transform={`rotate(${roseRotation}, ${C}, ${C})`}>
        {/* Rose background */}
        <circle cx={C} cy={C} r={OR} fill="url(#bg-grad)" stroke={T.border} strokeWidth="1" />

        {/* Tick marks */}
        {ticks.map(d => {
          const isMaj = d % 90 === 0;
          const isMid = d % 45 === 0;
          const is10  = d % 10 === 0;
          const r1 = OR - 1;
          const tl = isMaj ? 14 : isMid ? 9 : is10 ? 5 : 3;
          return (
            <line key={d}
              x1={px(d, r1)} y1={py(d, r1)}
              x2={px(d, r1-tl)} y2={py(d, r1-tl)}
              stroke={isMaj ? T.accent : is10 ? T.textMuted : T.border}
              strokeWidth={isMaj ? 2.5 : is10 ? 1.2 : 0.8}
              opacity={isMaj ? 1 : is10 ? 0.55 : 0.2} />
          );
        })}

        {/* Degree numbers at 30° intervals */}
        {[0,30,60,90,120,150,180,210,240,270,300,330].map(d => (
          <text key={d}
            x={px(d, OR - 32)} y={py(d, OR - 32) + 4}
            textAnchor="middle" fontSize="8" fill={T.textMuted}
            opacity=".55" fontFamily="'DM Sans',system-ui,sans-serif"
            transform={`rotate(${d}, ${px(d, OR-32)}, ${py(d, OR-32)})`}>
            {d}
          </text>
        ))}

        {/* Cardinal labels */}
        {cardinals.map(({ l, d }) => {
          const isCard = l.length === 1;
          const isN    = l === 'N';
          return (
            <text key={l}
              x={px(d, RR - 6)} y={py(d, RR - 6) + 5}
              textAnchor="middle"
              fontSize={isCard ? 14 : 9}
              fontWeight={isCard ? 800 : 600}
              fill={isN ? T.accent : isCard ? T.text : T.textMuted}
              opacity={isCard ? 1 : 0.65}
              fontFamily="'DM Sans',system-ui,sans-serif"
              transform={`rotate(${d}, ${px(d, RR-6)}, ${py(d, RR-6)})`}>
              {l}
            </text>
          );
        })}

        {/* Inner circle */}
        <circle cx={C} cy={C} r={IR} fill={T.card} stroke={T.border} strokeWidth="1" />

        {/* ══ KAABA at top of rose (12 o'clock = 0°) ══
            Fixed in the rose, so it points toward actual Qibla when device is aligned */}
        <g transform={`translate(${C}, ${C - RR + 10})`}>
          <circle cx={0} cy={0} r={14} fill={T.accent} opacity=".18" />
          <circle cx={0} cy={0} r={10} fill={T.accent} opacity=".35" />
          <text x={0} y={6} textAnchor="middle" fontSize="14"
            filter="url(#kaaba-shadow)">🕋</text>
        </g>

        {/* Alignment arc highlight when aligned */}
        {isAligned && (
          <circle cx={C} cy={C} r={IR + 4}
            fill="none" stroke="#4CAF82" strokeWidth="2.5" opacity=".4"
            strokeDasharray="20 8" />
        )}
      </g>
      {/* === END ROTATING ROSE === */}

      {/* === STATIC NEEDLE (always points up = toward Kaaba marker) === */}
      {/* Needle shaft going up */}
      <line x1={C} y1={C} x2={C} y2={C - needleLen}
        stroke={nc} strokeWidth="3.5" strokeLinecap="round"
        filter={isAligned ? 'url(#needle-glow)' : undefined} />
      {/* Arrowhead */}
      <path d={`M${C},${C - needleLen} L${C - arrowW},${C - needleLen + arrowH} L${C + arrowW},${C - needleLen + arrowH}Z`}
        fill={nc} filter={isAligned ? 'url(#needle-glow)' : undefined} />
      {/* Tail */}
      <line x1={C} y1={C} x2={C} y2={C + 22}
        stroke={nc} strokeWidth="2.5" strokeLinecap="round" opacity=".3" />

      {/* Pivot */}
      <circle cx={C} cy={C} r={10} fill={nc} opacity=".18" />
      <circle cx={C} cy={C} r={6}  fill={nc} />
      <circle cx={C} cy={C} r={2.5} fill={T.bg} />
    </svg>
  );
}
