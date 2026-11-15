// Outpost map: a top-down Mars base where the player puts astronauts on jobs.
// Tap an astronaut, then tap a station. The only rule here is "one astronaut per job, any
// number in the Shelter" (same as normalisePlacements in src/sim/sim.js); the caller runs the sol.
// createOutpostMap({ jobs, crew, placements, onChange, onInfo, doseLimit }) -> { el, set(placements) }
//   jobs: JOBS from constants.js; crew: [{ id, name, dose, home }]; placements: { crewId: jobId }
//   onChange(placements) after every change, one entry per crew member still on Mars;
//   onInfo(jobId) adds a "?" button per station.
import '../console/console.css';
import './map.css';
import { el } from '../console/util.js';
import { play } from '../console/sound.js';

export function createOutpostMap({ jobs, crew, placements = {}, onChange = () => {}, onInfo = null, doseLimit = 100 }) {
  const shelter = Object.keys(jobs).find((id) => jobs[id].where === 'shelter');
  if (!shelter) throw new Error('createOutpostMap: jobs need one with where "shelter"');
  let picked = null; // crew id
  const active = crew.filter((c) => !c.home);
  const byId = new Map(crew.map((c) => [c.id, c]));
  // Mirrors normalisePlacements: active crew only, missing/unknown -> Shelter, first in crew order keeps a job.
  function normalise(p) {
    p ??= {};
    const out = {};
    const taken = new Set();
    for (const c of active) {
      let job = Object.hasOwn(p, c.id) && Object.hasOwn(jobs, p[c.id]) ? p[c.id] : shelter;
      if (job !== shelter && taken.has(job)) job = shelter;
      if (job !== shelter) taken.add(job);
      out[c.id] = job;
    }
    return out;
  }
  let current = normalise(placements);
  const jobOf = (c) => current[c.id];

  const hint = el('p', { class: 'om-hint', role: 'status' });
  const stations = new Map(); // job id -> { btn, status, slot }
  function effect(id) {
    if (id === shelter) return 'Rest here · safest in a storm';
    const job = jobs[id];
    const words = { power: 'power', tank: 'water', wall: 'shield water', science: 'science' };
    const gains = Object.entries(job.effect ?? {}).filter(([, n]) => n > 0).map(([key, n]) => `+${n} ${words[key] ?? key}`);
    if (job.effect?.wall && job.effect?.tank < 0) gains.push(`uses up to ${-job.effect.tank} water`);
    if (job.power) gains.push(`costs ${job.power} power`);
    return gains.join(' · ');
  }
  function station(id) {
    const job = jobs[id];
    const effectText = effect(id);
    const status = el('span', { class: 'om-station-status' });
    const btn = el('button', { type: 'button', class: 'om-station-btn', onclick: () => place(id) }, picture(id),
      el('span', { class: 'om-station-text' }, el('span', { class: 'om-station-name' }, job.name),
        effectText ? el('span', { class: 'om-station-effect' }, effectText) : null, status));
    const info = onInfo && el('button', { type: 'button', class: 'om-info', 'aria-label': `What is ${job.name}?`, onclick: () => onInfo(id) }, '?');
    const slot = el('div', { class: 'om-slot' });
    stations.set(id, { btn, status, slot });
    return el('div', { class: `om-station${id === shelter ? ' is-shelter' : ''}` }, el('div', { class: 'om-station-head' }, btn, info), slot);
  }
  const ids = Object.keys(jobs).filter((id) => id !== shelter);
  const zone = (cls, title, backdrop, list) =>
    el('section', { class: `om-zone ${cls}` }, backdrop, el('h3', { class: 'om-zone-title oc-caption' }, title),
      el('div', { class: 'om-stations' }, list.map(station)));
  const outsideIds = ids.filter((id) => jobs[id].where === 'outside');
  const outside = outsideIds.length ? zone('is-outside', 'Outside', null, outsideIds) : null;
  const inside = zone('is-inside', 'Inside the base', floor(), [shelter, ...ids.filter((id) => jobs[id].where !== 'outside')]);

  const tokens = new Map(crew.map((c) => [c.id, el('button', {
    type: 'button', class: 'om-token', 'aria-disabled': c.home && 'true', onclick: () => pick(c.id),
    'aria-label': c.home ? `${c.name}, radiation ${c.dose}/${doseLimit}, went home` : null,
  }, el('span', { class: 'om-helmet', 'aria-hidden': 'true' }),
    el('span', { class: 'om-token-text' }, el('strong', {}, c.name), el('span', { class: 'om-dose' }, `radiation ${c.dose}/${doseLimit}`),
      c.home ? el('span', { class: 'om-dose' }, 'went home') : null))]));
  const gone = crew.filter((c) => c.home);
  const home = gone.length
    ? el('section', { class: 'om-home' }, el('h3', { class: 'om-zone-title oc-caption' }, 'Went home'),
      el('div', { class: 'om-slot' }, gone.map((c) => tokens.get(c.id))))
    : null;

  const root = el('div', { class: 'om' }, ground(), hint, inside, outside, home);

  function pick(id) {
    const c = byId.get(id);
    if (c.home) return draw(`${c.name} went home and can't work.`);
    picked = picked === id ? null : id;
    play('click');
    draw();
  }

  function place(jobId) {
    if (!picked) return draw('Tap an astronaut first, then a job.');
    const who = byId.get(picked);
    picked = null;
    if (jobOf(who) === jobId) return draw(`${who.name} stays at ${jobs[jobId].name}.`);
    // Taking a job someone else has bumps them to the Shelter.
    const bumped = jobId === shelter ? [] : active.filter((c) => c !== who && jobOf(c) === jobId);
    for (const c of bumped) current[c.id] = shelter;
    current[who.id] = jobId;
    play('clack');
    draw(`${who.name} is at ${jobs[jobId].name}.${bumped.map((c) => ` ${c.name} went to the ${jobs[shelter].name}.`).join('')}`);
    onChange({ ...current });
  }

  function draw(msg) {
    const p = picked && byId.get(picked).name;
    for (const c of active) {
      const t = tokens.get(c.id);
      const where = jobOf(c);
      const { slot } = stations.get(where);
      t.setAttribute('aria-pressed', picked === c.id);
      t.setAttribute('aria-label', `${c.name}, radiation ${c.dose}/${doseLimit}, at ${jobs[where].name}`);
      // Re-appending a node blurs it, so only move tokens that changed station.
      if (t.parentNode !== slot) {
        const hadFocus = document.activeElement === t;
        slot.append(t);
        if (hadFocus) t.focus();
      }
    }
    for (const [id, s] of stations) {
      const here = active.filter((c) => jobOf(c) === id).map((c) => c.name);
      const who = here.length ? `${here.join(' and ')} ${here.length > 1 ? 'are' : 'is'} here` : 'nobody here';
      s.status.textContent = p ? `Send ${p} here` : id === shelter ? `${here.length} inside` : here.length ? 'Busy' : 'Free';
      s.btn.setAttribute('aria-label', `${jobs[id].name}: ${who}.${p ? ` Send ${p} here.` : ''}`);
      s.btn.classList.toggle('is-target', !!p);
    }
    hint.textContent = msg
      || (!active.length ? 'Everyone went home.'
        : p ? `Now tap a job for ${p}. Tap ${p} again to cancel.`
          : 'Tap an astronaut, then tap a job.');
  }

  // Same placements as shown: leave the hint alone, so a caller echoing onChange back keeps the "went to the Shelter" note.
  function set(next) {
    const n = normalise(next);
    if (active.every((c) => n[c.id] === current[c.id])) return;
    current = n;
    draw();
  }

  draw();
  return { el: root, set };
}

// Small top-down pictures of each job, drawn with simple shapes on a 40x40 grid.
const PICS = {
  solar: [['circle', { cx: 33, cy: 7, r: 5, class: 'om-pic-sun' }],
    ...[[3, 14], [21, 14], [3, 26], [21, 26]].map(([x, y]) => ['rect', { x, y, width: 16, height: 10, class: 'om-pic-dark om-pic-edge' }])],
  recycler: [['circle', { cx: 20, cy: 20, r: 16, class: 'om-pic-dark' }],
    ['circle', { cx: 20, cy: 20, r: 12, class: 'om-pic-ring' }],
    ['path', { d: 'M20 10 C25 17 27 21 27 24 A7 7 0 0 1 13 24 C13 21 15 17 20 10 Z', class: 'om-pic-glass' }]],
  pump: [['rect', { x: 26, y: 3, width: 11, height: 34, rx: 2, class: 'om-pic-glass om-pic-edge' }],
    ['rect', { x: 8, y: 17, width: 19, height: 6, class: 'om-pic-dark' }],
    ['circle', { cx: 10, cy: 20, r: 7, class: 'om-pic-sun om-pic-edge' }]],
  lab: [['path', { d: 'M15 4 H25 V14 L35 32 A3 3 0 0 1 32 36 H8 A3 3 0 0 1 5 32 L15 14 Z', class: 'om-pic-light om-pic-edge' }],
    ['path', { d: 'M10 25 H30 L34 33 H6 Z', class: 'om-pic-glass' }]],
  rover: [...[[7, 10], [7, 20], [7, 30], [33, 10], [33, 20], [33, 30]].map(([cx, cy]) => ['circle', { cx, cy, r: 4, class: 'om-pic-dark' }]),
    ['rect', { x: 10, y: 6, width: 20, height: 28, rx: 3, class: 'om-pic-light om-pic-edge' }],
    ['circle', { cx: 20, cy: 13, r: 3.5, class: 'om-pic-sun' }]],
  shelter: [['path', { d: 'M20 3 L35 9 V20 C35 29 28 35 20 38 C12 35 5 29 5 20 V9 Z', class: 'om-pic-dark' }],
    ['path', { d: 'M13 20 L18 25 L27 15', class: 'om-pic-check' }]],
};
// Unknown jobs get a crate.
const CRATE = [['rect', { x: 6, y: 6, width: 28, height: 28, rx: 3, class: 'om-pic-crate om-pic-edge' }],
  ['path', { d: 'M6 6 L34 34 M34 6 L6 34', class: 'om-pic-cross' }]];

function picture(id) {
  const shapes = Object.hasOwn(PICS, id) ? PICS[id] : CRATE;
  return el('svg:svg', { class: 'om-pic', viewBox: '0 0 40 40', width: 40, height: 40, 'aria-hidden': 'true', focusable: 'false' },
    shapes.map(([tag, attrs]) => el(`svg:${tag}`, attrs)));
}

// Mars ground seen from above: rust sand, craters and rover tracks.
function ground() {
  const craters = [[40, 60, 18], [330, 40, 26], [210, 250, 14], [370, 230, 20], [90, 270, 10], [250, 110, 8], [150, 30, 6]];
  return el('svg:svg', { class: 'om-backdrop', viewBox: '0 0 400 300', preserveAspectRatio: 'xMidYMid slice', 'aria-hidden': 'true', focusable: 'false' },
    el('svg:rect', { width: 400, height: 300, class: 'om-ground' }),
    el('svg:path', { d: 'M -10 180 C 100 140, 170 240, 410 200', class: 'om-track' }),
    craters.map(([cx, cy, r]) => el('svg:circle', { cx, cy, r, class: 'om-crater' })));
}

// Habitat floor seen from above: tiles.
function floor() {
  const lines = [];
  for (let i = 0; i <= 400; i += 40) lines.push(el('svg:line', { x1: i, y1: 0, x2: i, y2: 300, class: 'om-tile' }));
  for (let i = 0; i <= 300; i += 40) lines.push(el('svg:line', { x1: 0, y1: i, x2: 400, y2: i, class: 'om-tile' }));
  return el('svg:svg', { class: 'om-backdrop', viewBox: '0 0 400 300', preserveAspectRatio: 'xMidYMid slice', 'aria-hidden': 'true', focusable: 'false' },
    el('svg:rect', { width: 400, height: 300, class: 'om-floor' }), lines);
}
