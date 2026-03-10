// Prayer names in display order (including Shuruq = Sunrise, Midnight)
export const PRAYER_NAMES = ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha', 'Midnight'];

// Swedish display names
export const PRAYER_SWEDISH = {
  Fajr:     'Fajr',
  Sunrise:  'Shuruq',
  Dhuhr:    'Dhuhr',
  Asr:      'Asr',
  Maghrib:  'Maghrib',
  Isha:     'Isha',
  Midnight: 'Halva natten',
};

// AlAdhan API method IDs — verified from API responses
// method=3 → Muslim World League (confirmed: Isha 19:45 Stockholm 2026-03-09)
export const CALC_METHODS = {
  3:  'Muslim World League',
  2:  'Islamiska Sällskapet Nordamerika (ISNA)',
  5:  'Egyptiska Myndigheten',
  4:  'Umm Al-Qura, Mecka',
  1:  'Karachi – Islamiska Vetenskaper',
  7:  'Teheran – Geofysikinstitutet',
  8:  'Gulfregionen',
  9:  'Kuwait',
  10: 'Qatar',
  11: 'Singapore',
  12: 'Islamiska Förbundet Frankrike',
  13: 'Diyanet, Turkiet',
  14: 'Muslimer i Ryssland',
  15: 'Moonsighting Committee (Nordamerika)',
};

// Which prayers count for "next prayer" countdown (includes Shuruq, not Midnight)
export const PRAYER_NAMES_COUNTABLE = ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];

export function timeToSec(t) {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return h * 3600 + m * 60;
}

/** Format "HH:MM" as 24h "HH:MM" */
export function fmt24(t) {
  if (!t) return '--:--';
  const [h, m] = t.split(':').map(Number);
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}

export function fmtCountdown(s) {
  s = Math.max(0, Math.round(s));
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60]
    .map(v => String(v).padStart(2, '0')).join(':');
}

export function getTodayDateStr() {
  const n = new Date();
  return `${String(n.getDate()).padStart(2,'0')}-${String(n.getMonth()+1).padStart(2,'0')}-${n.getFullYear()}`;
}

/** Next countable prayer (Fajr/Dhuhr/Asr/Maghrib/Isha only) */
export function getNextPrayer(times, now) {
  if (!times) return null;
  const nowSec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  for (const name of PRAYER_NAMES_COUNTABLE) {
    if (!times[name]) continue;
    const s = timeToSec(times[name]);
    if (s > nowSec) return { name, time: times[name], secondsUntil: s - nowSec };
  }
  // All passed — next Fajr tomorrow
  const fajrSec = timeToSec(times.Fajr);
  return { name: 'Fajr', time: times.Fajr, secondsUntil: 86400 - nowSec + fajrSec };
}

export function stripTz(t) { return (t || '').replace(/\s*\(.*\)/, '').trim(); }

/** Swedish weekday + date string */
export function swedishDate(date) {
  return date.toLocaleDateString('sv-SE', { weekday:'long', month:'long', day:'numeric' })
    .replace(/^\w/, c => c.toUpperCase());
}

const SWEDISH_MONTHS = ['Januari','Februari','Mars','April','Maj','Juni','Juli','Augusti','September','Oktober','November','December'];
export function swedishMonthYear(month, year) {
  return `${SWEDISH_MONTHS[month-1]} ${year}`;
}

// Hijri month names in Swedish
const HIJRI_MONTHS_SV = [
  'Muharram','Safar','Rabi al-Awwal','Rabi al-Thani',
  'Jumada al-Awwal','Jumada al-Thani','Rajab','Sha\'ban',
  'Ramadan','Shawwal','Dhu al-Qa\'da','Dhu al-Hijja',
];

export function formatHijri(hijri) {
  if (!hijri) return '';
  const day   = hijri.day;
  const month = hijri.month?.en || '';
  const year  = hijri.year;
  // Try to get Swedish month name by number
  const mNum  = parseInt(hijri.month?.number || 0);
  const mName = mNum >= 1 && mNum <= 12 ? HIJRI_MONTHS_SV[mNum-1] : month;
  return `${day} ${mName} ${year} AH`;
}
