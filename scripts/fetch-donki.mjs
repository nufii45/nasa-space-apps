// Fetch NASA DONKI once and reduce it to public/data/sky.json.
// Run on any machine with internet:  npm run fetch:donki
// Optional env: DONKI_BASE (default CCMC), NASA_API_KEY (only for the api.nasa.gov mirror), FROM, TO.
//
// CHECK ON FIRST RUN: field names below follow DONKI's documented JSON
// (flrID, peakTime, classType, linkedEvents[].activityID, sepID, eventTime,
// activityID, cmeAnalyses[].enlilList[].impactList[].{location, arrivalTime}).
// The script prints counts and one sample of each type so you can confirm them.
import { mkdir, writeFile } from 'node:fs/promises';

const CCMC = 'https://ccmc.gsfc.nasa.gov/DONKI/WS/get';
const MIRROR = 'https://api.nasa.gov/DONKI';
const BASE = process.env.DONKI_BASE || CCMC;
const KEY = process.env.NASA_API_KEY || 'DEMO_KEY';
const FROM = Number(process.env.FROM || 2012);
const TO = Number(process.env.TO || 2025);

async function get(type, start, end) {
  const url = new URL(`${BASE}/${type}`);
  url.searchParams.set('startDate', start);
  url.searchParams.set('endDate', end);
  if (BASE.startsWith(MIRROR)) url.searchParams.set('api_key', KEY);
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (res.ok) {
      const text = await res.text();
      return text.trim() ? JSON.parse(text) : [];
    }
    console.warn(`  ${type} ${start}: HTTP ${res.status} ${(await res.text()).slice(0, 120)}, retry ${attempt}`);
    await new Promise((r) => setTimeout(r, 2000 * attempt));
  }
  throw new Error(`Failed: ${url}`);
}

const day = (t) => (t || '').slice(0, 10);
const linkIds = (e) => (e.linkedEvents || []).map((l) => l.activityID);

const raw = { FLR: [], SEP: [], CME: [] };
// DONKI rejects date ranges over 60 days (HTTP 400), so fetch in 60-day windows. End dates are inclusive.
const DAY = 864e5;
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const stop = Date.UTC(TO, 11, 31);
for (let t = Date.UTC(FROM, 0, 1); t <= stop; t += 61 * DAY) {
  const start = iso(t);
  const end = iso(Math.min(t + 60 * DAY, stop));
  for (const type of Object.keys(raw)) {
    console.log(`Fetching ${type} ${start}..${end}`);
    raw[type].push(...(await get(type, start, end)));
  }
}
await mkdir('data/raw', { recursive: true });
await writeFile('data/raw/donki.json', JSON.stringify(raw));
for (const [t, list] of Object.entries(raw)) {
  console.log(`${t}: ${list.length} records. Sample:`, JSON.stringify(list[0] || null).slice(0, 400));
}

// Which flares are linked to a solar energetic particle (SEP) event?
const sepIds = new Set(raw.SEP.map((s) => s.sepID));
const flaresLinkedFromSep = new Set(raw.SEP.flatMap(linkIds));

const events = [];
for (const f of raw.FLR) {
  if (!f.classType) continue;
  const particles = linkIds(f).some((id) => sepIds.has(id) || /-SEP-/.test(id)) || flaresLinkedFromSep.has(f.flrID);
  events.push({ date: day(f.peakTime || f.beginTime), type: 'flare', class: f.classType, particles, id: f.flrID, url: f.link });
}
for (const c of raw.CME) {
  for (const a of c.cmeAnalyses || []) {
    if (a.isMostAccurate === false) continue;
    for (const run of a.enlilList || []) {
      for (const hit of run.impactList || []) {
        if (/mars/i.test(hit.location || '') && hit.arrivalTime) {
          events.push({ date: day(hit.arrivalTime), type: 'cme-mars', warnFrom: day(c.startTime), id: c.activityID, url: c.link });
        }
      }
    }
  }
}
// De-duplicate CME arrivals (several model runs per CME).
const seen = new Set();
const unique = events.filter((e) => {
  const k = `${e.type}|${e.id}|${e.date}`;
  if (seen.has(k)) return false;
  seen.add(k);
  return true;
}).sort((a, b) => a.date.localeCompare(b.date));

const sky = {
  source: 'NASA CCMC DONKI (Space Weather Database of Notifications, Knowledge, Information)',
  sourceUrl: 'https://ccmc.gsfc.nasa.gov/tools/DONKI',
  fetched: new Date().toISOString().slice(0, 10),
  sample: false,
  range: [`${FROM}-01-01`, `${TO}-12-31`],
  events: unique,
  // Check this window contains the storm that reached Mars on 2017-09-11 and adjust if needed.
  featured: { sept2017: { start: '2017-09-04', seed: 2017 } },
};
await writeFile('public/data/sky.json', JSON.stringify(sky));
const sept = unique.filter((e) => e.date >= '2017-09-04' && e.date <= '2017-09-13');
console.log(`\nWrote public/data/sky.json: ${unique.length} events, ${(JSON.stringify(sky).length / 1024).toFixed(0)} KB`);
console.log('Featured window 2017-09-04..13:', sept);
