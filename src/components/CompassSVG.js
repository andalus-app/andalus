import React from 'react';

/**
 * QIBLA COMPASS — Exactly like reference image
 *
 * RING rotates with -heading → N/S/Ö/V always at geographic positions
 * RED ARROW is STATIC, always pointing UP (12 o'clock)
 * KAABA marker sits ON the ring at qiblaDir bearing — rotates WITH ring
 *   → When heading == qiblaDir, the Kaaba lands exactly at 12 o'clock (top)
 *   → Arrow points at Kaaba = aligned ✓
 *
 * Why this works:
 *   Ring rotation = -heading
 *   Kaaba position on ring = qiblaDir
 *   Kaaba screen position = qiblaDir - heading = 0 when facing Qibla
 */
export default function CompassSVG({ heading, qiblaDir, isAligned, alignDelta, theme: T, size = 280 }) {
  const C  = size / 2;
  const OR = size / 2 - 2;    // outer bezel
  const TR = OR - 6;           // tick outer edge
  const TI = TR - 50;          // tick inner edge  
  const CR = TI - 14;          // center circle radius
  const AR = TI - 6;           // arrow tip radius

  const ringRot = -((heading % 360 + 360) % 360);

  const toRad = a => (a - 90) * Math.PI / 180;
  const px = (a, r) => C + Math.cos(toRad(a)) * r;
  const py = (a, r) => C + Math.sin(toRad(a)) * r;

  const green = '#4CAF82';

  // Kaaba position on ring at qiblaDir — it rotates with the ring
  // so when ring is rotated by ringRot, Kaaba ends up at screen angle = qiblaDir + ringRot = qiblaDir - heading
  // When heading == qiblaDir → screen angle = 0 → Kaaba at top → aligned!
  const kaabaOnRing = qiblaDir != null ? qiblaDir : 0;

  return (
    <svg width={size} height={size} style={{ display:'block', overflow:'visible' }}>
      <defs>
        <filter id="cglow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <filter id="rglow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="3" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <radialGradient id="centerbg" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={T.card}/>
          <stop offset="100%" stopColor={T.bg}/>
        </radialGradient>
      </defs>

      {/* Outer bezel — green when aligned */}
      <circle cx={C} cy={C} r={OR}
        fill="none"
        stroke={isAligned ? green : T.border}
        strokeWidth={isAligned ? 3 : 1.5}
        filter={isAligned ? 'url(#cglow)' : undefined}
      />

      {/* ── ROTATING RING ── */}
      <g transform={`rotate(${ringRot}, ${C}, ${C})`}>

        {/* Ring fill */}
        <circle cx={C} cy={C} r={TR} fill={T.bgSecondary} />
        <circle cx={C} cy={C} r={TI} fill={T.bg} />

        {/* Ticks — 1° density via 5° steps */}
        {Array.from({ length: 72 }, (_, i) => i * 5).map(d => {
          const is90 = d % 90 === 0;
          const is30 = d % 30 === 0;
          const is10 = d % 10 === 0;
          const tl = is90 ? 18 : is30 ? 13 : is10 ? 8 : 4;
          const sw = is90 ? 2.5 : is30 ? 1.5 : 0.8;
          const col = is90 ? T.text : is30 ? T.textSecondary : T.textMuted;
          const op  = is90 ? 1 : is30 ? 0.6 : 0.25;
          return (
            <line key={d}
              x1={px(d, TR - 1)} y1={py(d, TR - 1)}
              x2={px(d, TR - tl)} y2={py(d, TR - tl)}
              stroke={col} strokeWidth={sw} opacity={op} />
          );
        })}

        {/* Degree numbers outside ring every 30° */}
        {Array.from({ length: 12 }, (_, i) => i * 30).map(d => (
          <text key={d}
            x={px(d, OR - 4)} y={py(d, OR - 4) + 4.5}
            textAnchor="middle"
            fontSize={d % 90 === 0 ? 13 : 11}
            fontWeight={d % 90 === 0 ? 700 : 400}
            fill={d % 90 === 0 ? T.text : T.textMuted}
            opacity={d % 90 === 0 ? 1 : 0.6}
            fontFamily="'Inter',system-ui,sans-serif"
            transform={`rotate(${d}, ${px(d,OR-4)}, ${py(d,OR-4)})`}>
            {d}
          </text>
        ))}

        {/* Cardinal letters inside ring */}
        {[{l:'N',d:0},{l:'Ö',d:90},{l:'S',d:180},{l:'V',d:270}].map(({l,d}) => (
          <text key={l}
            x={px(d, TI + 20)} y={py(d, TI + 20) + 6}
            textAnchor="middle" fontSize="20" fontWeight="800"
            fill={l==='N' ? (isAligned ? green : T.accent) : T.text}
            fontFamily="'Inter',system-ui,sans-serif"
            transform={`rotate(${d}, ${px(d,TI+20)}, ${py(d,TI+20)})`}>
            {l}
          </text>
        ))}

        {/* KAABA on ring at qiblaDir — rotates with ring, lands at top when aligned */}
        {qiblaDir != null && (() => {
          const kx = px(kaabaOnRing, TI - 2);
          const ky = py(kaabaOnRing, TI - 2);
          return (
            <g>
              {/* Highlight marker on tick at qibla */}
              <line
                x1={px(kaabaOnRing, TR - 1)} y1={py(kaabaOnRing, TR - 1)}
                x2={px(kaabaOnRing, TI + 4)}  y2={py(kaabaOnRing, TI + 4)}
                stroke={isAligned ? green : T.accent}
                strokeWidth="3" strokeLinecap="round" />
              {/* Kaaba emoji */}
              <text x={kx} y={ky + 9}
                textAnchor="middle" fontSize="22"
                filter={isAligned ? 'url(#cglow)' : undefined}>🕋</text>
            </g>
          );
        })()}
      </g>
      {/* ── END RING ── */}

      {/* Center circle */}
      <circle cx={C} cy={C} r={CR} fill="url(#centerbg)" stroke={T.border} strokeWidth="1" />

      {/* Heading display in center */}
      <text x={C} y={C - 10}
        textAnchor="middle" fontSize="32" fontWeight="800"
        fill={isAligned ? green : T.text}
        fontFamily="'Inter',system-ui,sans-serif"
        filter={isAligned ? 'url(#cglow)' : undefined}>
        {Math.round(((heading % 360) + 360) % 360)}°
      </text>
      <text x={C} y={C + 14}
        textAnchor="middle" fontSize="10" fontWeight="500"
        fill={T.textMuted}
        fontFamily="'Inter',system-ui,sans-serif">
        {qiblaDir != null ? `Qibla: ${Math.round(qiblaDir)}°` : ''}
      </text>

      {/* Cardinal direction label for current heading */}
      {(() => {
        const h = Math.round(((heading % 360) + 360) % 360);
        const dirs = ['N','NÖ','Ö','SÖ','S','SV','V','NV'];
        const label = dirs[Math.round(h / 45) % 8];
        return (
          <text x={C} y={C + 30}
            textAnchor="middle" fontSize="13" fontWeight="700"
            fill={isAligned ? green : T.textSecondary}
            fontFamily="'Inter',system-ui,sans-serif">
            {label}
          </text>
        );
      })()}

      {/* ── STATIC NEEDLE — clearly visible, positioned near N ── */}
      {(() => {
        const needleH = CR * 1.2;          // tall enough to clearly see
        const needleW = needleH * (304 / 300) * 0.55;
        const nx = C - needleW / 2;
        const ny = C - AR + (AR - CR) * 0.15 - needleH * 0.25;
        const col1 = isAligned ? green : '#af1917';
        const col2 = isAligned ? green : '#e52a1e';
        return (
          <g>
            <svg x={nx} y={ny} width={needleW} height={needleH} viewBox="0 0 304 300">
              <polygon points="151.6,226 287.4,290.4 151.6,9.6" fill={col1} />
              <polygon points="151.6,226 15.9,290.4 151.6,9.6" fill={col2} />
            </svg>
          </g>
        );
      })()}

      {/* Pivot */}
      <circle cx={C} cy={C} r={7} fill={isAligned ? green : '#e52a1e'} opacity="0.2" />
      <circle cx={C} cy={C} r={4} fill={isAligned ? green : '#e52a1e'} />
      <circle cx={C} cy={C} r={2} fill={T.bg} />

      {/* Green ring when aligned */}
      {isAligned && (
        <circle cx={C} cy={C} r={OR + 1}
          fill="none" stroke={green} strokeWidth="4"
          filter="url(#cglow)" />
      )}
    </svg>
  );
}
