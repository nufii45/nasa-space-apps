// @vitest-environment jsdom
// Game flow (src/main.js): boots the real screen controller in jsdom and plays it by clicking buttons
// found by their visible text or accessible name. Expected numbers come from replaying the same
// placements through the sim, never from tuning values, so retuning constants.js keeps this green.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { newGame, step, needsRescue, normalisePlacements } from '../../src/sim/sim.js';
import { buildRun } from '../../src/sim/sky.js';
import { JOBS, LIMITS, RESCUE_SECONDS, SCIENCE_GOAL, SOLS_PER_RUN } from '../../src/sim/constants.js';

const ROOT = resolve(import.meta.dirname, '../..'); // jsdom env: import.meta.url is not a file: URL
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const BODY = read('index.html').match(/<body>([\s\S]*)<\/body>/)[1].replace(/<script[\s\S]*?<\/script>/g, '');
const REAL_SKY = JSON.parse(read('public/data/sky.json'));
const NOW = Date.parse('2026-11-15T00:00:00Z'); // buildRun seeds random runs from Date.now()
const SEED = NOW >>> 0;

// Jobs by role, read from JOBS so retuning keeps them right.
const NEAR = Object.keys(JOBS).find((id) => JOBS[id].where === 'outside' && !JOBS[id].walkBackSeconds); // Solar Field
const FAR = Object.keys(JOBS).find((id) => JOBS[id].where === 'outside' && JOBS[id].walkBackSeconds); // Rover
const INSIDE = Object.keys(JOBS).find((id) => JOBS[id].where === 'inside'); // Recycler

// ---------- Hand-made skies ----------
const day = (i) => new Date(Date.UTC(2020, 2, 1 + i)).toISOString().slice(0, 10); // sol 1 of a random run = day(0)
const flare = (i, cls, particles = true) => ({ date: day(i), type: 'flare', class: cls, particles, id: `F${i}`, url: 'u' });
const cme = (i, warnFrom = i) => ({ date: day(i), type: 'cme-mars', warnFrom: day(warnFrom), id: `C${i}`, url: 'u' });
// The range is exactly 10 days wide, so a random run always starts on day(0).
const makeSky = (events, extra = {}) => ({ sample: false, fetched: '2020-12-31', range: [day(0), day(SOLS_PER_RUN)], events, ...extra });

// ---------- Boot ----------
let added = [];
const realAdd = window.addEventListener;
const settle = (ms = 0) => vi.advanceTimersByTimeAsync(ms);

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
  vi.resetModules();
  document.head.innerHTML = '';
  document.body.innerHTML = BODY;
  history.replaceState(null, '', location.pathname);
  localStorage.clear();
  // main.js adds a window hashchange listener per import; track them so old modules do not react later.
  added = [];
  window.addEventListener = function (...a) { added.push(a); return realAdd.apply(this, a); };
  // jsdom 31 has <dialog> but no showModal()/close(); stub the browser behaviour.
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});

afterEach(() => {
  for (const a of added) window.removeEventListener(...a);
  window.addEventListener = realAdd;
  delete window.matchMedia;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

// reducedMotion: the log and ticker tape print instantly (a real user setting); false types with timers.
async function boot(sky, { reducedMotion = true, fetchImpl } = {}) {
  vi.stubGlobal('fetch', vi.fn(fetchImpl ?? (async () => ({ ok: true, json: async () => structuredClone(sky) }))));
  if (reducedMotion) window.matchMedia = (q) => ({ matches: /reduce/.test(q), media: q, addEventListener() {}, removeEventListener() {} });
  await import('../../src/main.js');
  await settle();
}

// ---------- Queries ----------
const app = () => document.getElementById('app');
const nameOf = (b) => (b.getAttribute('aria-label') ?? b.textContent).trim();
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const allButtons = (root = document.body) => [...root.querySelectorAll('button')];
function btn(re, root = document.body) {
  if (typeof re === 'string') re = new RegExp(`^${esc(re)}$`);
  const found = allButtons(root).filter((b) => re.test(nameOf(b)));
  if (found.length !== 1) throw new Error(`expected 1 button matching ${re}, got ${found.length}: ${allButtons(root).map(nameOf).join(' | ')}`);
  return found[0];
}
const has = (re, root = document.body) => allButtons(root).some((b) => re.test(nameOf(b)));
const heading = () => app().querySelector('h1, h2')?.textContent;
const GAUGES = { power: 'Power', tank: 'Water tank', wall: 'Wall water', science: 'Science' };
const MAX = { power: LIMITS.power, tank: LIMITS.tank, wall: LIMITS.wall, science: SCIENCE_GOAL };
const gauges = () => Object.fromEntries(Object.entries(GAUGES).map(([k, label]) => {
  const g = app().querySelector(`[role="meter"][aria-label="${label}"]`);
  return [k, g && Number(g.getAttribute('aria-valuenow'))];
}));
const logLines = () => [...app().querySelectorAll('section[aria-label="Mission log"] .oc-log-line')].map((l) => l.textContent.replace('▌', ''));
const tapeLines = () => [...app().querySelectorAll('[role="log"][aria-label="Mission report"] > *')].map((l) => l.textContent);
const drawer = () => document.querySelector('dialog');
const onRescue = () => has(/^(Done|Ready)$/, app());
const rescueNames = () => allButtons(app()).map(nameOf).filter((n) => /^Bring .+ inside$/.test(n)).map((n) => n.slice(6, -7));
const timer = () => app().querySelector('[role="timer"]');
const soundSwitch = () => btn('Sound');
// Map tokens: "Ana, sunburn 12/100, at Lab" or "..., went home".
function crewOnMap() {
  const out = {};
  for (const n of allButtons(app()).map(nameOf)) {
    const m = /^(\w+), sunburn (\d+)\/\d+, (?:at (.+)|went home)$/.exec(n);
    if (m) out[m[1]] = { dose: Number(m[2]), at: m[3] ?? 'home' };
  }
  return out;
}

// ---------- Actions ----------
async function pressCovered(label) {
  btn(`Lift the safety cover over ${label}`).click();
  btn(label).click();
  await settle();
}
function chooseMission(label) {
  const t = [...app().querySelectorAll('svg text')].find((x) => x.textContent === label);
  t.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}
async function launch({ mission = 'RANDOM WEEK', commander = false } = {}) {
  chooseMission(mission);
  const sw = btn('Commander mode');
  if ((sw.getAttribute('aria-checked') === 'true') !== commander) sw.click();
  await pressCovered('LAUNCH');
}
const nameOfCrew = (id) => newGame().crew.find((c) => c.id === id).name;
function place(id, job) {
  btn(new RegExp(`^${nameOfCrew(id)},`)).click();
  btn(new RegExp(`^${esc(JOBS[job].name)}:`)).click();
}
async function openCredits() {
  history.replaceState(null, '', '#credits');
  window.dispatchEvent(new HashChangeEvent('hashchange'));
  await settle();
}

// ---------- Expected model: the same run replayed through the sim ----------
const runFor = (sky, { commander = false, mission = 'RANDOM WEEK' } = {}) =>
  buildRun(sky, { mode: commander ? 'commander' : 'cadet', featured: mission === 'SEPT 2017' ? 'sept2017' : null, seed: SEED });
function model(run) {
  return { run, state: newGame(), lines: [`Mission start. Your sky begins on ${run.start}.`], solLines: [] };
}
function advance(exp, placements, rescued) {
  const sol = exp.run.sols[exp.state.sol - 1];
  const { state, log } = step(exp.state, placements, sol, rescued);
  exp.solLines = [`— Sol ${exp.state.sol} (${sol.date}) —`, ...log.map((l) => l.text)];
  exp.lines.push(...exp.solLines);
  exp.state = state;
}
const expGauges = (s) => Object.fromEntries(Object.keys(GAUGES).map((k) => [k, Math.min(Math.max(s[k], 0), MAX[k])]));
const expCrew = (s) => Object.fromEntries(s.crew.map((c) => [c.name, c.dose]));
const doses = () => Object.fromEntries(Object.entries(crewOnMap()).map(([n, v]) => [n, v.dose]));

// Plan screen matches the model: sol, gauges, doses, and the log (whole log, or its visible tail).
function expectPlan(exp, { wholeLog = true } = {}) {
  expect(heading()).toBe(`Sol ${exp.state.sol} of ${SOLS_PER_RUN}`);
  expect(gauges()).toEqual(expGauges(exp.state));
  expect(doses()).toEqual(expCrew(exp.state));
  expectLog(exp, wholeLog);
}
function expectLog(exp, wholeLog) {
  const shown = logLines();
  if (wholeLog) expect(shown).toEqual(exp.lines);
  else {
    expect(shown).toEqual(exp.lines.slice(-shown.length)); // the visible log is the tail of the run's log
    expect(shown.slice(-exp.solLines.length)).toEqual(exp.solLines); // and ends with this sol's lines
  }
}
function expectDebrief(exp, { story }) {
  const s = exp.state;
  const r = exp.run;
  expect(s.over).toBe(true);
  expect(heading()).toBe('Mission report');
  const tape = tapeLines();
  expect(tape[0]).toMatch(s.result === 'win' ? `${'★'.repeat(s.stars)}${'☆'.repeat(3 - s.stars)}` : s.result === 'home' ? /home/ : /Time is up/);
  if (s.result !== 'win') expect(tape[0]).not.toMatch(/★/);
  expect(tape).toContain(`Science: ${s.science}/${SCIENCE_GOAL}`);
  const played = r.sols.filter((x) => x.sol <= s.sol);
  expect(tape.some((l) => l.startsWith(`Your sky: ${r.start} to ${played.at(-1).date}`))).toBe(true);
  for (const x of played.filter((x) => needsRescue(x.storm))) expect(tape.some((l) => l.includes(x.date))).toBe(true);
  const text = app().textContent;
  for (const x of r.sols.filter((x) => x.sol > s.sol)) expect(text).not.toContain(x.date);
  expect(tape.some((l) => /^Tip: /.test(l))).toBe(true);
  expect(has(/^Try again$/, app()) && has(/^Title$/, app())).toBe(true);
  const link = [...app().querySelectorAll('a')].find((a) => a.textContent === 'Read the NASA story');
  if (story) expect(link?.href).toMatch(/nasa\.gov/);
  else expect(link).toBeUndefined();
}

// Press END SOL; on a rescue, bring everyone outside in (Cadet: Done; Commander: wait out the countdown).
async function playSol(exp, placements, { commander }) {
  const sol = exp.run.sols[exp.state.sol - 1];
  await pressCovered('END SOL');
  expect(onRescue()).toBe(needsRescue(sol.storm));
  let rescued = [];
  if (onRescue()) {
    const outside = exp.state.crew.filter((c) => !c.home && JOBS[placements[c.id]].where === 'outside');
    expect(rescueNames()).toEqual(outside.map((c) => c.name));
    for (const c of outside) btn(`Bring ${c.name} inside`).click();
    if (commander) {
      await settle(RESCUE_SECONDS * 1000);
      rescued = outside.filter((c) => (JOBS[placements[c.id]].walkBackSeconds || 0) <= RESCUE_SECONDS).map((c) => c.id);
    } else {
      btn('Done').click();
      await settle();
      rescued = outside.map((c) => c.id);
    }
  }
  advance(exp, placements, rescued);
}

// =====================================================================================

describe('title screen', () => {
  // Random start = day(0); the featured "sept2017" key points at day(30). Both open with a particle flare.
  const sky = makeSky([flare(0, 'X5.0'), flare(30, 'X5.0')], { featured: { sept2017: { start: day(30), seed: 1 } } });

  it('defaults to Random week + Cadet; LAUNCH starts sol 1 of that mission', async () => {
    await boot(sky);
    expect(heading()).toBe('Outpost Dial');
    expect(app().querySelector('[role="slider"][aria-label="Mission"]').getAttribute('aria-valuetext')).toBe('RANDOM WEEK');
    expect(btn('Commander mode').getAttribute('aria-checked')).toBe('false');
    expect(btn('Commander mode').textContent).toMatch(/CADET/);
    await pressCovered('LAUNCH');
    expect(heading()).toBe(`Sol 1 of ${SOLS_PER_RUN}`);
    expect(logLines()[0]).toBe(`Mission start. Your sky begins on ${day(0)}.`);
    await pressCovered('END SOL');
    expect(onRescue()).toBe(true);
    expect(timer()).toBeNull(); // Cadet: no countdown
    expect(btn('Done')).toBeTruthy();
  });

  it('knob to SEPT 2017 + toggle to COMMANDER: LAUNCH starts that mission in Commander mode', async () => {
    await boot(sky);
    await launch({ mission: 'SEPT 2017', commander: true });
    expect(heading()).toBe(`Sol 1 of ${SOLS_PER_RUN}`);
    expect(logLines()[0]).toBe(`Mission start. Your sky begins on ${day(30)}.`);
    await pressCovered('END SOL');
    expect(timer().textContent).toBe(`${RESCUE_SECONDS} seconds left`);
    expect(btn('Ready')).toBeTruthy();
  });

  it('LAUNCH does nothing until its cover is lifted, and the cover drops again on its own', async () => {
    await boot(sky);
    btn('LAUNCH').click();
    await settle();
    expect(heading()).toBe('Outpost Dial');
    btn('Lift the safety cover over LAUNCH').click();
    await settle(5000); // cover auto-closes
    btn('LAUNCH').click();
    await settle();
    expect(heading()).toBe('Outpost Dial');
  });
});

describe('plan screen', () => {
  // Sol 1: CME warning (arrives on sol 3). Everything else calm.
  const sky = makeSky([cme(2, 0)]);

  it('shows sol, forecast, four gauges, lamps, map, END SOL and the log, with the sim\'s start state', async () => {
    await boot(sky);
    await launch();
    const run = runFor(sky);
    expect(run.sols[0].forecast.length).toBeGreaterThan(0);
    expect(heading()).toBe(`Sol 1 of ${SOLS_PER_RUN}`);
    expect(app().textContent).toContain(`about ${run.sols[0].forecast[0].inSols} sols away`);
    expect(gauges()).toEqual(expGauges(newGame()));
    expect([...app().querySelectorAll('.oc-lamp .oc-caption')].map((c) => c.textContent)).toEqual(['Power', 'Water', 'Storm', 'Crew']);
    expect(app().querySelector('.oc-lamp:nth-child(3) .oc-lamp-word').textContent).toBe('ALERT'); // storm in the forecast
    expect(doses()).toEqual(expCrew(newGame())); // every astronaut is on the map
    expect(btn('Lift the safety cover over END SOL')).toBeTruthy();
    expect(app().querySelector('section[aria-label="Mission log"]')).not.toBeNull();
  });

  it('a calm sol says clear skies', async () => {
    await boot(makeSky([]));
    await launch();
    expect(app().textContent).toContain('Clear skies forecast');
    expect(app().textContent).not.toContain('sols away');
  });

  it('has no placement controls besides the map', async () => {
    await boot(sky);
    await launch();
    const map = app().querySelector('.om');
    const other = allButtons(app()).filter((b) => !map.contains(b)).map(nameOf);
    expect(other).toEqual(['END SOL', 'Lift the safety cover over END SOL']);
    expect(app().querySelectorAll('input, select, textarea, [role="slider"], [role="switch"], [role="radio"], [role="listbox"]')).toHaveLength(0);
  });

  it('tap an astronaut then a station places them, and END SOL runs the sim with that placement', async () => {
    await boot(sky);
    await launch();
    const exp = model(runFor(sky));
    place('ana', 'lab');
    expect(crewOnMap().Ana.at).toBe(JOBS.lab.name);
    await pressCovered('END SOL');
    advance(exp, { ana: 'lab', ben: 'shelter', cai: 'shelter' }, []);
    expect(exp.solLines.some((l) => l.includes('Ana') && l.includes(JOBS.lab.name))).toBe(true); // guard: placement mattered
    expectPlan(exp);
  });

  it('tapping a station with nobody picked places nobody', async () => {
    await boot(sky);
    await launch();
    btn(new RegExp(`^${JOBS.lab.name}:`)).click();
    expect(Object.values(crewOnMap()).every((c) => c.at === JOBS.shelter.name)).toBe(true);
  });
});

describe('after END SOL', () => {
  const sky = makeSky([cme(2, 0), flare(1, 'M1.0', false)]);

  it('gauges and log follow the sim, the log keeps earlier sols, placements carry over, no results screen', async () => {
    await boot(sky);
    await launch();
    const exp = model(runFor(sky));
    const log = app().querySelector('section[aria-label="Mission log"]');
    const p = { ana: NEAR, ben: 'lab', cai: INSIDE };
    place('ana', NEAR); place('ben', 'lab'); place('cai', INSIDE);
    for (let i = 0; i < 3; i++) {
      await pressCovered('END SOL');
      if (onRescue()) { btn('Done').click(); await settle(); }
      advance(exp, p, []);
      expectPlan(exp); // straight back to the plan screen, whole log so far
      expect(app().querySelector('section[aria-label="Mission log"]')).toBe(log); // one log for the run
      expect(crewOnMap()).toMatchObject({ Ana: { at: JOBS[NEAR].name }, Ben: { at: JOBS.lab.name }, Cai: { at: JOBS[INSIDE].name } });
    }
    expect(exp.state.sol).toBe(4);
  });
});

describe('rescue', () => {
  it('appears exactly on the sols where needsRescue(storm) is true', async () => {
    // Particle X flare, flare without particles, CME, nothing, small particle flare, B flare.
    const sky = makeSky([flare(0, 'X2.0'), flare(1, 'M3.0', false), cme(2), flare(4, 'C5.0'), flare(5, 'B1.0', false)]);
    await boot(sky);
    await launch();
    const run = runFor(sky);
    const seen = [];
    while (heading() !== 'Mission report') {
      const sol = Number(/^Sol (\d+)/.exec(heading())[1]);
      await pressCovered('END SOL');
      seen.push([sol, onRescue()]);
      if (onRescue()) {
        expect(app().textContent).toContain('Everyone is already inside'); // nobody placed outside
        btn('Done').click();
        await settle();
      }
    }
    expect(seen).toEqual(seen.map(([sol]) => [sol, needsRescue(run.sols[sol - 1].storm)]));
    expect(seen.length).toBeGreaterThanOrEqual(6); // covered both kinds of sol
    expect(seen.some(([, r]) => r) && seen.some(([, r]) => !r)).toBe(true);
  });

  const xSky = makeSky([flare(0, 'X5.0'), flare(1, 'X5.0')]);
  const crewAt = { ana: NEAR, ben: FAR, cai: INSIDE };
  async function toRescue(commander) {
    await boot(xSky);
    await launch({ commander });
    const exp = model(runFor(xSky, { commander }));
    place('ana', NEAR); place('ben', FAR); place('cai', INSIDE);
    await pressCovered('END SOL');
    expect(onRescue()).toBe(true);
    return exp;
  }
  // Brought inside must change the outcome, or these tests prove nothing.
  const differs = (exp, a, b) => expect(expCrew(step(exp.state, crewAt, exp.run.sols[0], a).state)).not.toEqual(expCrew(step(exp.state, crewAt, exp.run.sols[0], b).state));

  it('lists only astronauts at outside jobs; brought in takes the Shelter dose, left out takes the outside dose', async () => {
    const exp = await toRescue(false);
    expect(rescueNames()).toEqual(['Ana', 'Ben']); // Cai is inside
    differs(exp, ['ana'], []);
    btn('Bring Ana inside').click();
    expect(has(/^Bring Ana inside$/)).toBe(false);
    btn('Done').click();
    await settle();
    advance(exp, crewAt, ['ana']);
    expect(exp.solLines.some((l) => /^Ana .*\(shelter\)$/.test(l)) && exp.solLines.some((l) => /^Ben .*\(outside\)$/.test(l))).toBe(true);
    expectPlan(exp);
  });

  it('Cadet: untimed, and the far job counts as inside at once', async () => {
    const exp = await toRescue(false);
    expect(timer()).toBeNull();
    await settle(RESCUE_SECONDS * 3000);
    expect(onRescue()).toBe(true);
    btn('Bring Ben inside').click();
    expect(app().textContent).toContain('Safe in the Shelter');
    expect(app().textContent).not.toContain('Walking back');
    btn('Done').click();
    await settle();
    advance(exp, crewAt, ['ben']);
    expectPlan(exp);
  });

  it('Commander: countdown from RESCUE_SECONDS; the far job walks back for walkBackSeconds; 0 resolves', async () => {
    const walk = JOBS[FAR].walkBackSeconds;
    expect(walk).toBeLessThan(RESCUE_SECONDS); // precondition for "arrives in time"
    const exp = await toRescue(true);
    differs(exp, ['ben'], []);
    expect(timer().textContent).toBe(`${RESCUE_SECONDS} seconds left`);
    await settle(1000);
    expect(timer().textContent).toBe(`${RESCUE_SECONDS - 1} seconds left`);
    btn('Bring Ben inside').click(); // at t = 1 s
    const benRow = () => [...app().querySelectorAll('.row')].find((r) => r.textContent.startsWith('Ben')).textContent;
    expect(benRow()).toContain('Walking back...');
    await settle((walk - 1) * 1000);
    expect(benRow()).toContain('Walking back...');
    await settle(1000);
    expect(benRow()).toContain('Safe in the Shelter');
    expect(onRescue()).toBe(true);
    await settle((RESCUE_SECONDS - 1 - walk) * 1000 - 1);
    expect(onRescue()).toBe(true); // just before 0
    await settle(1);
    advance(exp, crewAt, ['ben']); // Ana was left outside
    expectPlan(exp);
  });

  it('Commander: an astronaut still walking when the countdown hits 0 takes the outside dose', async () => {
    const walk = JOBS[FAR].walkBackSeconds;
    expect(walk).toBeGreaterThan(1);
    const exp = await toRescue(true);
    btn('Bring Ana inside').click();
    await settle((RESCUE_SECONDS - 1) * 1000);
    btn('Bring Ben inside').click();
    expect(app().textContent).toContain('Walking back...');
    await settle(1000);
    advance(exp, crewAt, ['ana']);
    expectPlan(exp);
  });

  it('Commander: Ready early resolves at once with only those already inside', async () => {
    const exp = await toRescue(true);
    differs(exp, ['ana'], ['ana', 'ben']);
    btn('Bring Ana inside').click();
    btn('Bring Ben inside').click(); // still walking
    btn('Ready').click();
    await settle();
    advance(exp, crewAt, ['ana']);
    expectPlan(exp);
    await settle(RESCUE_SECONDS * 2000); // a countdown still running would resolve the sol again
    expectPlan(exp);
  });
});

describe('help cards', () => {
  it.each(Object.keys(JOBS))('"?" for %s opens its card; every number in it comes from JOBS', async (id) => {
    await boot(makeSky([]));
    await launch();
    const j = JOBS[id];
    expect(drawer().hasAttribute('open')).toBe(false);
    btn(`What is ${j.name}?`).click();
    expect(drawer().hasAttribute('open')).toBe(true);
    expect(drawer().querySelector('h2').textContent).toBe(j.name);
    const panel = () => drawer().querySelector('[role="tabpanel"]').textContent;
    const text = [panel()];
    btn('Numbers', drawer()).click();
    text.push(panel(), drawer().querySelector('.oc-drawer-source').textContent);
    const allowed = [j.power, j.walkBackSeconds, ...Object.values(j.effect).map(Math.abs)].filter((n) => n != null);
    const numbers = text.join(' ').match(/\d+(\.\d+)?/g)?.map(Number) ?? [];
    for (const n of numbers) expect(allowed).toContain(n);
    for (const n of allowed.filter((n) => n)) expect(numbers).toContain(n);
    btn('Close', drawer()).click();
    expect(drawer().hasAttribute('open')).toBe(false);
  });

  it('an open card closes when the screen changes (END SOL, credits)', async () => {
    await boot(makeSky([]));
    await launch();
    btn('What is Lab?').click();
    await pressCovered('END SOL');
    expect(heading()).toBe(`Sol 2 of ${SOLS_PER_RUN}`);
    expect(drawer().hasAttribute('open')).toBe(false);
    btn('What is Lab?').click();
    await openCredits();
    expect(drawer().hasAttribute('open')).toBe(false);
  });
});

describe('full runs on the real archive', () => {
  // Sol 1: Solar, Lab, Recycler. Sol 2: Ben moves to the Rover. Kept for the rest of the run.
  const MOVES = { 1: { ana: NEAR, ben: 'lab', cai: INSIDE }, 2: { ben: FAR } };
  it.each([
    ['RANDOM WEEK', false], ['RANDOM WEEK', true], ['SEPT 2017', false], ['SEPT 2017', true],
  ])('%s, commander=%s: plays to the debrief and the screen equals the sim', async (mission, commander) => {
    await boot(REAL_SKY);
    await launch({ mission, commander });
    const exp = model(runFor(REAL_SKY, { mission, commander }));
    expectPlan(exp);
    let p = {};
    let rescues = 0;
    while (!exp.state.over) {
      const active = (id) => exp.state.crew.some((c) => c.id === id && !c.home);
      for (const [id, job] of Object.entries(MOVES[exp.state.sol] ?? {})) if (active(id)) { place(id, job); p[id] = job; }
      p = normalisePlacements(exp.state, p);
      rescues += needsRescue(exp.run.sols[exp.state.sol - 1].storm);
      await playSol(exp, p, { commander });
      if (!exp.state.over) expectPlan(exp, { wholeLog: false });
    }
    expect(rescues).toBeGreaterThan(0); // the clock and Sept 2017 both bring a storm
    expectDebrief(exp, { story: mission === 'SEPT 2017' });
    expectLog(exp, false);
    btn('Title').click();
    await settle();
    expect(heading()).toBe('Outpost Dial');
  });

  it('the log keeps every earlier sol\'s lines for the whole run (Sept 2017, Cadet)', async () => {
    await boot(REAL_SKY);
    await launch({ mission: 'SEPT 2017' });
    const exp = model(runFor(REAL_SKY, { mission: 'SEPT 2017' }));
    let p = {};
    while (!exp.state.over) {
      for (const [id, job] of Object.entries({ 1: { ana: NEAR, ben: 'lab', cai: INSIDE } }[exp.state.sol] ?? {})) { place(id, job); p[id] = job; }
      p = normalisePlacements(exp.state, p);
      await playSol(exp, p, { commander: false });
    }
    const shown = logLines();
    expect(exp.lines.length, 'run log length').toBeGreaterThan(0);
    expect(shown.filter((l) => l.startsWith('— Sol ')), `${shown.length} of ${exp.lines.length} lines shown`).toEqual(exp.lines.filter((l) => l.startsWith('— Sol ')));
    expect(shown).toEqual(exp.lines);
  });
});

describe('debrief', () => {
  // A particle X flare every day: placing two astronauts outside and never rescuing ends the run early.
  const stormy = makeSky(Array.from({ length: SOLS_PER_RUN }, (_, i) => flare(i, 'X5.0')));
  const P = { ana: NEAR, ben: FAR, cai: 'pump' };
  async function playToEnd(sky = stormy) {
    const exp = model(runFor(sky));
    place('ana', NEAR); place('ben', FAR); place('cai', 'pump');
    while (!exp.state.over) {
      const p = normalisePlacements(exp.state, P);
      await pressCovered('END SOL');
      if (onRescue()) { btn('Done').click(); await settle(); }
      advance(exp, p, []);
    }
    return exp;
  }

  it('a run that ends early lists only the dates and storms of the sols played', async () => {
    await boot(stormy);
    await launch();
    const exp = await playToEnd();
    expect(exp.state.sol).toBeLessThan(SOLS_PER_RUN); // precondition: it did end early
    expectDebrief(exp, { story: false });
    expectLog(exp, true);
  });

  it('"Try again" starts a fresh game at sol 1 with an empty log; "Title" goes back to the title', async () => {
    await boot(stormy);
    await launch();
    await playToEnd();
    btn('Try again').click();
    await settle();
    const exp = model(runFor(stormy));
    expectPlan(exp); // sol 1, start gauges, start doses, only the "Mission start" line
    expect(crewOnMap()).toMatchObject({ Ana: { at: JOBS.shelter.name } }); // placements reset
    await playToEnd();
    btn('Title').click();
    await settle();
    expect(heading()).toBe('Outpost Dial');
  });

  it('"Try again" leaves no timers from the old game (log and ticker tape mid-print)', async () => {
    await boot(stormy, { reducedMotion: false });
    await launch();
    const old = await playToEnd();
    expect(heading()).toBe('Mission report');
    // Preconditions: the old log has seconds of typing left, and the tape has most lines still to print.
    expect(old.lines.join('').length - logLines().join('').length).toBeGreaterThan(400); // > 5.6 s at 14 ms/char
    expect(tapeLines().length).toBeLessThan(3);
    btn('Try again').click();
    // 2 s: the new run's one line (~0.7 s) and any in-flight character or tape line finish; an old
    // log backlog or the old tape (5+ lines x 380 ms) would still be ticking.
    await settle(2000);
    expect(heading()).toBe(`Sol 1 of ${SOLS_PER_RUN}`);
    expect(logLines()).toEqual([`Mission start. Your sky begins on ${day(0)}.`]);
    expect(vi.getTimerCount()).toBe(0); // nothing of the old game still ticking
    const html = app().innerHTML;
    await settle(120_000);
    expect(app().innerHTML).toBe(html);
    expect(document.querySelector('[role="log"][aria-label="Mission report"]')).toBeNull();
  });
});

describe('credits', () => {
  const sky = makeSky([flare(0, 'X5.0')]);

  it('#credits on load shows the credits with a DONKI link; Back returns to the title', async () => {
    history.replaceState(null, '', '#credits');
    await boot(sky);
    expect(heading()).toBe('Credits and data sources');
    const donki = [...app().querySelectorAll('a')].find((a) => /DONKI/.test(a.textContent));
    expect(donki.href).toMatch(/^https:\/\/ccmc\.gsfc\.nasa\.gov\//);
    expect(app().textContent).toContain(`fetched ${sky.fetched}`);
    btn('Back').click();
    await settle();
    expect(heading()).toBe('Outpost Dial');
    expect(location.hash).toBe('');
  });

  it('opening #credits mid Commander rescue stops the countdown', async () => {
    await boot(sky);
    await launch({ commander: true });
    place('ana', NEAR);
    await pressCovered('END SOL');
    expect(timer()).not.toBeNull();
    await settle(2000);
    await openCredits();
    expect(heading()).toBe('Credits and data sources');
    await settle(RESCUE_SECONDS * 2000);
    expect(heading()).toBe('Credits and data sources');
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('mute switch', () => {
  it('is on title, plan, rescue, debrief and credits, and toggles sound', async () => {
    const sky = makeSky(Array.from({ length: SOLS_PER_RUN }, (_, i) => flare(i, 'X5.0')));
    await boot(sky);
    const seen = [];
    const check = (screen) => { expect(soundSwitch().isConnected).toBe(true); seen.push(screen); };
    check('title');
    await launch();
    check('plan');
    place('ana', NEAR); place('ben', FAR);
    await pressCovered('END SOL');
    expect(onRescue()).toBe(true);
    check('rescue');
    btn('Done').click();
    await settle();
    while (heading() !== 'Mission report') {
      await pressCovered('END SOL');
      if (onRescue()) { btn('Done').click(); await settle(); }
    }
    check('debrief');
    await openCredits();
    check('credits');
    expect(seen).toEqual(['title', 'plan', 'rescue', 'debrief', 'credits']);
    expect(soundSwitch().getAttribute('aria-checked')).toBe('true');
    soundSwitch().click();
    expect(soundSwitch().getAttribute('aria-checked')).toBe('false');
    expect(localStorage.getItem('outpost-muted')).toBe('1');
  });
});

describe('sky data', () => {
  const FOOTER = BODY.match(/<footer[^>]*>([^<]*)/)[1];

  it('sample: true shows the SAMPLE DATA banner on the plan screen and a sample footer', async () => {
    await boot(makeSky([], { sample: true }));
    expect(document.querySelector('.source-footer').firstChild.textContent).toMatch(/sample/i);
    await launch();
    expect(app().querySelector('.banner')?.textContent).toMatch(/^SAMPLE DATA/);
  });

  it('sample: false shows neither', async () => {
    await boot(makeSky([]));
    expect(document.querySelector('.source-footer').firstChild.textContent).toBe(FOOTER);
    expect(FOOTER).not.toMatch(/sample/i);
    await launch();
    expect(app().textContent).not.toMatch(/SAMPLE/i);
  });

  it('loads ./data/sky.json', async () => {
    await boot(makeSky([]));
    expect(fetch).toHaveBeenCalledWith('./data/sky.json');
  });

  it.each([
    ['network error', async () => { throw new TypeError('Failed to fetch'); }],
    ['not JSON (e.g. an HTML 404 page)', async () => ({ ok: false, status: 404, json: async () => JSON.parse('<!doctype html>') })],
  ])('%s: shows a readable error, not a blank page', async (_, fetchImpl) => {
    await boot(null, { fetchImpl });
    expect(heading()).toBe('Could not load the storm data.');
    expect(app().textContent).toContain('Please reload the page.');
  });
});

describe('no game rules in UI code', () => {
  const files = ['src/main.js', ...readdirSync(join(ROOT, 'src/ui'), { recursive: true }).filter((f) => f.endsWith('.js')).map((f) => `src/ui/${f}`)];
  const SIM = join(ROOT, 'src/sim');
  const ALLOWED = {
    'sim.js': ['newGame', 'step', 'needsRescue', 'normalisePlacements'],
    'sky.js': ['buildRun'],
    'constants.js': null, // any constant
  };
  // -> [{ file, from: absolute path, names: [...] | '*' }]
  const imports = files.flatMap((file) => {
    const src = read(file);
    const out = [];
    for (const m of src.matchAll(/import\s*(?:([\s\S]*?)\s*from\s*)?['"]([^'"]+)['"]/g)) {
      const clause = m[1] ?? '';
      const named = /\{([\s\S]*)\}/.exec(clause);
      const names = named ? named[1].split(',').map((s) => s.trim().split(/\s+as\s+/)[0]).filter(Boolean) : [];
      out.push({ file, from: resolve(dirname(join(ROOT, file)), m[2]), names: /\*|^\s*\w+\s*(,|$)/.test(clause) ? '*' : names });
    }
    for (const m of src.matchAll(/import\(\s*['"]([^'"]+)['"]/g)) out.push({ file, from: resolve(dirname(join(ROOT, file)), m[1]), names: '*' });
    return out;
  });

  it('parses some imports (guard)', () => {
    expect(imports.some((i) => i.file === 'src/main.js' && i.from === join(SIM, 'sim.js'))).toBe(true);
  });

  it('UI imports from src/sim only the allowed names', () => {
    const bad = imports.filter((i) => i.from.startsWith(SIM + '/')).filter((i) => {
      const allowed = ALLOWED[i.from.slice(SIM.length + 1)];
      if (allowed === undefined) return true;
      return allowed !== null && (i.names === '*' || i.names.some((n) => !allowed.includes(n)));
    });
    expect(bad).toEqual([]);
  });

  it('src/ui/map imports nothing from src/sim', () => {
    expect(imports.filter((i) => i.file.startsWith('src/ui/map/') && i.from.startsWith(SIM))).toEqual([]);
  });
});
