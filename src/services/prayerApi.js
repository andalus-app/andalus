import { stripTz } from '../utils/prayerUtils';

const BASE = 'https://api.aladhan.com/v1';

/**
 * Halva natten = mittpunkten mellan Maghrib och nästa dags Fajr (avrundar uppåt)
 * Exempel: Maghrib 17:38, Fajr 04:02 → 22:50
 */
export function calcMidnight(maghrib, fajrNext) {
  if (!maghrib || !fajrNext) return null;
  const [mh, mm] = maghrib.split(':').map(Number);
  const [fh, fm] = fajrNext.split(':').map(Number);
  const maghribMin = mh * 60 + mm;
  const fajrMin    = fh * 60 + fm + 24 * 60;
  const totalMin   = fajrMin - maghribMin;
  const midMin     = (maghribMin + Math.ceil(totalMin / 2)) % (24 * 60);
  return `${String(Math.floor(midMin / 60)).padStart(2,'0')}:${String(midMin % 60).padStart(2,'0')}`;
}

function mapTimings(t) {
  return {
    Fajr:     stripTz(t.Fajr),
    Sunrise:  stripTz(t.Sunrise),
    Dhuhr:    stripTz(t.Dhuhr),
    Asr:      stripTz(t.Asr),
    Maghrib:  stripTz(t.Maghrib),
    Isha:     stripTz(t.Isha),
    Midnight: null, // always calculate ourselves from Maghrib + next Fajr
  };
}

export async function fetchPrayerTimes(lat, lng, dateStr, method = 3, school = 0) {
  const url = `${BASE}/timings/${dateStr}?latitude=${lat}&longitude=${lng}&method=${method}&school=${school}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch prayer times');
  const json = await res.json();
  const timings = mapTimings(json.data.timings);
  const hijri   = json.data.date?.hijri;
  return { timings, hijri };
}

export async function fetchTomorrowPrayerTimes(lat, lng, method = 3, school = 0) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const ds = `${String(tomorrow.getDate()).padStart(2,'0')}-${String(tomorrow.getMonth()+1).padStart(2,'0')}-${tomorrow.getFullYear()}`;
  const res = await fetch(`${BASE}/timings/${ds}?latitude=${lat}&longitude=${lng}&method=${method}&school=${school}`);
  if (!res.ok) throw new Error('Failed to fetch tomorrow');
  const json = await res.json();
  return mapTimings(json.data.timings);
}


export async function fetchMonthlyTimes(lat, lng, month, year, method = 3, school = 0) {
  const res = await fetch(`${BASE}/calendar/${year}/${month}?latitude=${lat}&longitude=${lng}&method=${method}&school=${school}`);
  if (!res.ok) throw new Error('Failed to fetch monthly times');
  const json = await res.json();
  return json.data.map(day => ({
    gregorianDay: parseInt(day.date.gregorian.day),
    date: day.date.readable,
    timings: mapTimings(day.timings),
  }));
}

export async function fetchQiblaDirection(lat, lng) {
  const res = await fetch(`${BASE}/qibla/${lat}/${lng}`);
  if (!res.ok) throw new Error('Failed to fetch Qibla direction');
  const json = await res.json();
  if (json.code !== 200) throw new Error(json.status || 'API error');
  return json.data.direction;
}

export async function reverseGeocode(lat, lng) {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=14`,
    { headers: { 'User-Agent': 'BonetiderApp/1.0' } }
  );
  if (!res.ok) throw new Error('Geocoding failed');
  const json = await res.json();
  const a = json.address || {};

  const suburb =
    a.suburb        ||
    a.neighbourhood ||
    a.quarter       ||
    a.city_district ||
    null;

  const city =
    a.city   ||
    a.town   ||
    a.village||
    a.county ||
    null;

  // "Spånga, Stockholm" or just "Stockholm" if no suburb
  const displayCity = suburb && city && suburb !== city
    ? `${suburb}, ${city}`
    : city || suburb || 'Okänd plats';

  return {
    city: displayCity,
    country: a.country || '',
  };
}

export async function searchCity(query) {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=6&addressdetails=1`,
    { headers: { 'User-Agent': 'BonetiderApp/1.0' } }
  );
  if (!res.ok) throw new Error('Search failed');
  const json = await res.json();
  return json.map(r => ({
    latitude:  parseFloat(r.lat),
    longitude: parseFloat(r.lon),
    city:      r.address?.city || r.address?.town || r.address?.village || r.display_name.split(',')[0],
    country:   r.address?.country || '',
  }));
}
