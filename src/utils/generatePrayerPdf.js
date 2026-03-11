// generatePrayerPdf.js
// Generates a styled PDF using Canvas -> jsPDF pattern via HTML Canvas
// No external lib needed — uses browser's built-in canvas + window.print with full CSS

import { fmt24, swedishMonthYear } from './prayerUtils';

// Swedish day abbreviations
const DAYS_SV = ['Sön', 'Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör'];

function getDayAbbr(year, month, day) {
  const d = new Date(year, month - 1, day);
  return DAYS_SV[d.getDay()];
}

function isWeekend(year, month, day) {
  const d = new Date(year, month - 1, day);
  return d.getDay() === 0 || d.getDay() === 6;
}

// The islam.nu logo as inline SVG (teal, horizontal)
const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 43.2 10.17" width="130" height="30">
<defs><style>.l{fill:#24645d;}</style></defs>
<path class="l" d="M43.2,2.14v5.7A2.14,2.14,0,0,1,41.06,10h0V6.91h-.23V5.81h-.09a.2.2,0,0,0-.1-.12A2,2,0,0,0,40,3.38s-1.3-1.23-1.75-1.23-1.76,1.23-1.76,1.23a2,2,0,0,0-.68,2.31.18.18,0,0,0-.1.12h-.08v1.1h-.24V10h0A2.14,2.14,0,0,1,33.2,7.84V2.14A2.14,2.14,0,0,1,35.34,0h5.72A2.14,2.14,0,0,1,43.2,2.14Z"/><path class="l" d="M20.1,0V2.37c0,.47-.58.48-.63.48h0V0Z"/><path class="l" d="M28.33,0V2.37c0,.47-.58.48-.63.48h0V0Z"/><path class="l" d="M29.51,0V2.65a1,1,0,0,1-.38.82,1.81,1.81,0,0,1-1.2.36h-.47V3.26s1.43.31,1.43-.86c0-.21,0-2.4,0-2.4Z"/><path class="l" d="M26.78,1.67V3a1.65,1.65,0,0,1,0,.32,1.73,1.73,0,0,1-.1.24.63.63,0,0,1-.34.3,1.09,1.09,0,0,1-.67,0,.73.73,0,0,1-.41-.3l-.09-.12,0,0a.76.76,0,0,1-.64.4h-.29l-.11,0-.06,0a1.08,1.08,0,0,1-.34-.17l-.12-.11s-.07.26-.5.27H21.87A1.28,1.28,0,0,1,21,3.27a1.07,1.07,0,0,1-.76.52c-.15,0-.3,0-.46,0h-.5V3.27h.46a1.43,1.43,0,0,0,.63-.21.69.69,0,0,0,.32-.47,1.37,1.37,0,0,0,0-.29l0-1.73V0h.62V.3c0,.72,0,1.45,0,2.18a2.35,2.35,0,0,0,0,.26.71.71,0,0,0,.34.47.3.3,0,0,0,.16,0H23s0-.06,0-.1V1.87h.61V2.7A.67.67,0,0,0,23.7,3a.55.55,0,0,0,.34.31.61.61,0,0,0,.3,0,.28.28,0,0,0,.22-.2.89.89,0,0,0,0-.22v-1h.6s0,.06,0,.1c0,.2,0,.41,0,.61a1.27,1.27,0,0,0,0,.34.53.53,0,0,0,.37.37.48.48,0,0,0,.29,0,.28.28,0,0,0,.22-.19.58.58,0,0,0,0-.22V1.67Z"/><path class="l" d="M18.1,1.66a1.42,1.42,0,0,0-.68,0,.88.88,0,0,0-.7.55s0,.06,0,.1h-.76a.61.61,0,0,0-.57.54,2.11,2.11,0,0,0,0,.26c0,.37,0,.75,0,1.13v.89H16V4.76L16,3.3a1.41,1.41,0,0,1,0-.18.24.24,0,0,1,.22-.21,2.06,2.06,0,0,1,.37,0h.06s0,.11.05.16a1.05,1.05,0,0,0,.76.74,1.37,1.37,0,0,0,.57,0,1,1,0,0,0,.79-.67,1.51,1.51,0,0,0,.05-.52A1.08,1.08,0,0,0,18.1,1.66Zm.06,1.41a.42.42,0,0,1-.43.26.38.38,0,0,1-.29-.14.66.66,0,0,1-.17-.38v-.1a.77.77,0,0,1,.06-.33.45.45,0,0,1,.78-.08.66.66,0,0,1,.11.26A.81.81,0,0,1,18.16,3.07Z"/><rect class="l" x="10.2" y="0.37" width="0.73" height="0.73"/><rect class="l" x="12.72" y="3.17" width="0.73" height="0.73"/><rect class="l" x="6.87" y="4.31" width="0.67" height="0.67"/><rect class="l" x="7.91" y="4.31" width="0.67" height="0.67"/><path class="l" d="M28.52,4.94v.27h-1l.11-.27h.25a.42.42,0,0,1,.24-.59.51.51,0,0,1,.41.15l-.12.18s-.26-.21-.32,0,.14.22.26.23Z"/><path class="l" d="M10.92,1.67V1.61h-.73V2.9a.25.25,0,0,1-.27.26H8.75c-.15,0-.38-.28-.38-.52v-1H7.63v1c0,.23-.21.52-.36.52H5.92V2.49A1,1,0,0,0,4.86,1.6,1.13,1.13,0,0,0,3.71,2.75a1.08,1.08,0,0,0,1.07,1.1H5.1a.58.58,0,0,1-.46.23l-2.18,0H.83C.33,4,0,4.15,0,4.71V10H.63V5c0-.25,0-.32.33-.32l1.81,0h.09l1.79,0a1.14,1.14,0,0,0,1.22-.92H7.38a.87.87,0,0,0,.79-.39.7.7,0,0,0,.61.39H10.1a.75.75,0,0,0,.83-.79C10.93,2.57,10.93,1.82,10.92,1.67ZM5.19,3.16H4.82c-.31,0-.43-.15-.43-.43s.12-.52.41-.52.39,0,.39.23Z"/><polygon class="l" points="25.53 5.73 25.53 8.65 22.44 5.5 22.44 8.19 22.44 9.98 23.05 9.98 23.05 7.08 26.14 10.17 26.14 5.73 25.53 5.73"/><rect class="l" x="20.03" y="9.25" width="0.73" height="0.73"/><polygon class="l" points="18.44 9.97 17.82 9.98 17.35 7.4 16.13 10.12 14.91 7.4 14.44 9.98 13.82 9.97 14.69 5.55 16.13 8.71 17.57 5.55 18.44 9.97"/><path class="l" d="M10.71,5.55,8.71,10h.67l.48-1h1.71l.49,1h.66Zm-.6,2.84L10.71,7l.61,1.41Z"/><polygon class="l" points="7.58 9.4 7.58 9.98 5.72 9.98 5.72 5.73 6.34 5.73 6.34 9.4 7.58 9.4"/><path class="l" d="M30.89,8.93A1.55,1.55,0,0,1,29.41,10h0a1.52,1.52,0,0,1-1.47-1.05,2.34,2.34,0,0,1-.08-.72V5.73h.62V8.21a1.48,1.48,0,0,0,.12.72.86.86,0,0,0,.81.47.94.94,0,0,0,.82-.47,1.38,1.38,0,0,0,.13-.72V0H31V8.21A2.21,2.21,0,0,1,30.89,8.93Z"/><path class="l" d="M2.91,10A1.26,1.26,0,0,1,1.57,8.77l.6-.14s.07.81.74.77a.7.7,0,0,0,.71-.77s0-.45-.71-.7l-.42-.18a1.77,1.77,0,0,1-.38-.24.94.94,0,0,1-.36-.73c0-1.07,1.16-1.14,1.16-1.14a1.29,1.29,0,0,1,1.22.69l-.49.29a.76.76,0,0,0-.41-.37.87.87,0,0,0-.47,0,.51.51,0,0,0-.38.56c0,.34.66.53.66.53a1.87,1.87,0,0,1,1,.6,1.22,1.22,0,0,1,.23.7A1.3,1.3,0,0,1,2.91,10Z"/></svg>`;

export function generatePrayerPdf({ days, location, month, year }) {
  if (!days.length) return;

  const cityName    = location?.city || location?.name || 'Okänd stad';
  const countryName = location?.country || 'Sverige';
  const monthLabel  = swedishMonthYear(month, year);
  const today       = new Date();
  const isCurrentMonth = month === today.getMonth() + 1 && year === today.getFullYear();
  const todayDay    = isCurrentMonth ? today.getDate() : -1;

  const ACCENT    = '#24645d';
  const ACCENT_LT = '#e8f4f2';
  const ACCENT_MD = '#b2d8d4';
  const GRAY1     = '#f7f8f8';
  const GRAY2     = '#e8eaea';
  const TEXT_DARK = '#1a1a1a';
  const TEXT_MED  = '#444';
  const TEXT_MUTED= '#888';
  const WEEKEND   = '#fdf6f0';

  // Encode the SVG logo as a data URI
  const logoDataUri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(LOGO_SVG)}`;

  const html = `<!DOCTYPE html>
<html lang="sv">
<head>
<meta charset="utf-8"/>
<title>Bönetider ${monthLabel} – ${cityName}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif;
    background: #fff;
    color: ${TEXT_DARK};
    padding: 28px 32px 40px;
    max-width: 680px;
    margin: 0 auto;
  }

  /* ── HEADER ── */
  .header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: 22px;
    padding-bottom: 18px;
    border-bottom: 2.5px solid ${ACCENT};
  }
  .header-left h1 {
    font-size: 22px;
    font-weight: 800;
    color: ${TEXT_DARK};
    letter-spacing: -0.4px;
    line-height: 1.2;
    margin-bottom: 4px;
  }
  .header-left .meta {
    font-size: 12px;
    color: ${TEXT_MUTED};
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
  }
  .header-left .meta span {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .header-right {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 6px;
  }
  .header-right img {
    height: 28px;
    width: auto;
  }

  /* ── TABLE ── */
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12.5px;
  }

  thead tr {
    background: ${ACCENT};
    color: #fff;
  }
  thead th {
    padding: 9px 8px;
    font-weight: 700;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    text-align: center;
  }
  thead th:first-child { text-align: left; padding-left: 12px; border-radius: 0; }
  thead th:nth-child(2) { text-align: left; }

  tbody tr { border-bottom: 1px solid ${GRAY2}; }
  tbody tr:nth-child(even) td { background: ${GRAY1}; }
  tbody tr.weekend td { background: ${WEEKEND}; }
  tbody tr.today td {
    background: ${ACCENT_LT} !important;
    font-weight: 700;
    color: ${ACCENT};
  }
  tbody tr.today td.date-col .date-num {
    background: ${ACCENT};
    color: #fff;
    border-radius: 50%;
    width: 22px;
    height: 22px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-weight: 800;
  }

  td {
    padding: 7px 8px;
    text-align: center;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.3px;
  }
  td.date-col {
    text-align: left;
    padding-left: 12px;
    white-space: nowrap;
  }
  td.day-col {
    text-align: left;
    color: ${TEXT_MUTED};
    font-size: 11px;
    font-weight: 500;
    width: 28px;
    padding-right: 2px;
  }
  tbody tr.today td.day-col { color: ${ACCENT}; }

  /* today bar on left */
  tbody tr.today td:first-child { border-left: 3px solid ${ACCENT}; }

  /* ── FOOTER ── */
  .footer {
    margin-top: 20px;
    padding-top: 14px;
    border-top: 1px solid ${GRAY2};
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
  }
  .footer-left {
    font-size: 11px;
    color: ${TEXT_MUTED};
  }
  .footer-left strong { color: ${ACCENT}; }
  .footer-right {
    font-size: 11px;
    color: ${TEXT_MUTED};
  }

  /* ── PRINT ── */
  @media print {
    @page { margin: 1.2cm 1.4cm; size: A4 portrait; }
    body { padding: 0; }
    .no-print { display: none; }
  }
</style>
</head>
<body>

<div class="header">
  <div class="header-left">
    <h1>Bönetider för ${cityName}<br>(${monthLabel})</h1>
    <div class="meta">
      <span>📍 ${cityName}${countryName && countryName !== cityName ? ', ' + countryName : ''}</span>
      <span>📅 ${monthLabel}</span>
    </div>
  </div>
  <div class="header-right">
    <img src="${logoDataUri}" alt="islam.nu"/>
    <div style="font-size:10px;color:${TEXT_MUTED};text-align:right">Islam.nu</div>
  </div>
</div>

<table>
  <thead>
    <tr>
      <th></th>
      <th style="text-align:left">Datum</th>
      <th>Fajr</th>
      <th>Shuruq</th>
      <th>Dhuhr</th>
      <th>Asr</th>
      <th>Maghrib</th>
      <th>Ishâ</th>
    </tr>
  </thead>
  <tbody>
${days.map(d => {
  const dateStr   = `${year}-${String(month).padStart(2,'0')}-${String(d.day).padStart(2,'0')}`;
  const dayAbbr   = getDayAbbr(year, month, d.day);
  const weekend   = isWeekend(year, month, d.day);
  const isToday   = d.day === todayDay;
  const rowClass  = [isToday ? 'today' : '', weekend && !isToday ? 'weekend' : ''].filter(Boolean).join(' ');
  return `    <tr class="${rowClass}">
      <td class="day-col">${dayAbbr}</td>
      <td class="date-col"><span class="date-num">${dateStr}</span></td>
      <td>${fmt24(d.Fajr)}</td>
      <td>${fmt24(d.Sunrise)}</td>
      <td>${fmt24(d.Dhuhr)}</td>
      <td>${fmt24(d.Asr)}</td>
      <td>${fmt24(d.Maghrib)}</td>
      <td>${fmt24(d.Isha)}</td>
    </tr>`;
}).join('\n')}
  </tbody>
</table>

<div class="footer">
  <div class="footer-left">
    Bönetiderna är hämtade från <strong>islam.nu</strong> &nbsp;·&nbsp; <a href="https://www.islam.nu" style="color:${ACCENT}">www.islam.nu</a>
  </div>
  <div class="footer-right">
    För islamisk kunskap i Sverige &copy; ${year}
  </div>
</div>

<script>
  // Auto-trigger print dialog
  window.addEventListener('load', () => setTimeout(() => window.print(), 350));
</script>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const win  = window.open(url, '_blank');
  if (win) {
    win.addEventListener('afterprint', () => URL.revokeObjectURL(url));
  }
}
