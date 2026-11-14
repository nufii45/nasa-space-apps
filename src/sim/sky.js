// Turns the archived DONKI snapshot (public/data/sky.json) into 10 sols of events for one run.
// One sol = one Earth calendar day of the real archive (a simplification, stated in the credits).
import { makeRng } from './rng.js';
import { SOLS_PER_RUN } from './constants.js';
import { stormBaseDose } from './sim.js';

const DAY = 864e5;
const toDay = (iso) => Math.floor(Date.parse(iso.slice(0, 10) + 'T00:00:00Z') / DAY);
const toIso = (day) => new Date(day * DAY).toISOString().slice(0, 10);

function strongestStorm(events) {
  let best = null;
  for (const e of events) {
    const storm = e.type === 'flare'
      ? { kind: 'flare', cls: e.class, particles: !!e.particles, date: e.date, id: e.id, url: e.url }
      : e.type === 'cme-mars'
        ? { kind: 'cme', date: e.date, id: e.id, url: e.url }
        : null;
    if (!storm) continue;
    if (!best || stormBaseDose(storm) > stormBaseDose(best)) best = storm;
  }
  return best;
}

/**
 * @param sky   parsed sky.json
 * @param opts  { mode: 'cadet'|'commander', featured: string|null, seed: number }
 * @returns { start, end, seed, sols: [{ sol, date, storm, forecast }] }
 */
export function buildRun(sky, { mode = 'cadet', featured = null, seed = Date.now() } = {}) {
  const byDay = new Map();
  for (const e of sky.events) {
    const d = toDay(e.date);
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d).push(e);
  }

  let startDay;
  if (featured && sky.featured?.[featured]) {
    const f = sky.featured[featured];
    startDay = toDay(f.start);
    seed = f.seed ?? seed;
  } else {
    const rng = makeRng(seed);
    const lo = toDay(sky.range[0]);
    const hi = toDay(sky.range[1]) - SOLS_PER_RUN;
    const bigStorms = sky.events.filter((e) => e.type === 'flare' && e.particles && /^[MX]/i.test(e.class));
    const wantBig = mode === 'commander' ? 0.8 : 0.5;
    if (bigStorms.length && rng() < wantBig) {
      const e = bigStorms[Math.floor(rng() * bigStorms.length)];
      const offset = 2 + Math.floor(rng() * 6); // big storm lands on sol 3 to 8
      startDay = Math.max(lo, Math.min(hi, toDay(e.date) - offset));
    } else {
      startDay = lo + Math.floor(rng() * Math.max(1, hi - lo));
    }
  }

  const sols = [];
  for (let i = 0; i < SOLS_PER_RUN; i++) {
    const day = startDay + i;
    const storm = strongestStorm(byDay.get(day) || []);
    // CME warnings: any CME arriving within the next 3 days whose warning has started.
    const forecast = [];
    for (let ahead = 1; ahead <= 3; ahead++) {
      for (const e of byDay.get(day + ahead) || []) {
        if (e.type === 'cme-mars' && (!e.warnFrom || toDay(e.warnFrom) <= day)) {
          forecast.push({ kind: 'cme', inSols: ahead });
        }
      }
    }
    sols.push({ sol: i + 1, date: toIso(day), storm, forecast });
  }
  return { start: toIso(startDay), end: toIso(startDay + SOLS_PER_RUN - 1), seed, sample: !!sky.sample, sols };
}
