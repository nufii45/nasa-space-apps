// @vitest-environment jsdom
// Saving and resuming the run (src/main.js): after each sol the run is saved to localStorage, the report
// clears it, a refresh offers "Resume your mission?", and a broken or blocked storage never stops the game.
// Boots the real screen controller like game.test.js; a "refresh" re-imports main.js on a fresh page.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { newGame, step, normalisePlacements } from '../../src/sim/sim.js';
import { buildRun } from '../../src/sim/sky.js';
import { JOBS, LIMITS, SCIENCE_GOAL, SOLS_PER_RUN } from '../../src/sim/constants.js';

const ROOT = resolve(import.meta.dirname, '../..');
const BODY = readFileSync(join(ROOT, 'index.html'), 'utf8').match(/<body>([\s\S]*)<\/body>/)[1].replace(/<script[\s\S]*?<\/script>/g, '');
const NOW = Date.parse('2026-11-15T00:00:00Z');
const KEY = 'outpost-dial.save.v1';
const NEAR = Object.keys(JOBS).find((id) => JOBS[id].where === 'outside' && !JOBS[id].walkBackSeconds);
const FAR = Object.keys(JOBS).find((id) => JOBS[id].where === 'outside' && JOBS[id].walkBackSeconds);

const day = (i) => new Date(Date.UTC(2020, 2, 1 + i)).toISOString().slice(0, 10);
const flare = (i, cls) => ({ date: day(i), type: 'flare', class: cls, particles: true, id: `F${i}`, url: 'u' });
const makeSky = (events, extra = {}) => ({ sample: false, fetched: '2020-12-31', range: [day(0), day(SOLS_PER_RUN)], events, ...extra });
// A particle X flare every day: two astronauts outside and never rescued ends the run early.
const stormy = makeSky(Array.from({ length: SOLS_PER_RUN }, (_, i) => flare(i, 'X5.0')));
// "Sept 2017" points at day(30): sols 1 to 4 are calm, sol 5 brings a particle X flare.
const featured = makeSky([flare(34, 'X5.0')], { featured: { sept2017: { start: day(30), seed: 1 } } });

let added = [];
const realAdd = window.addEventListener;
const settle = (ms = 0) => vi.advanceTimersByTimeAsync(ms);

// A fresh page: no DOM, no module state, no old hashchange listeners. localStorage survives, like a refresh.
function freshPage() {
  for (const a of added) window.removeEventListener(...a);
  added = [];
  vi.resetModules();
  document.head.innerHTML = '';
  document.body.innerHTML = BODY;
}

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
  history.replaceState(null, '', location.pathname);
  localStorage.clear();
  window.addEventListener = function (...a) { added.push(a); return realAdd.apply(this, a); };
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  freshPage();
});

afterEach(() => {
  for (const a of added) window.removeEventListener(...a);
  window.addEventListener = realAdd;
  delete window.matchMedia;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function boot(sky) {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => structuredClone(sky) })));
  window.matchMedia = (q) => ({ matches: /reduce/.test(q), media: q, addEventListener() {}, removeEventListener() {} });
  await import('../../src/main.js');
  await settle();
}
async function refresh(sky) {
  freshPage();
  await boot(sky);
}

const app = () => document.getElementById('app');
const text = (n) => n.textContent.replace(/\s+/g, ' ').trim();
const nameOf = (b) => (b.getAttribute('aria-label') ?? b.textContent).trim();
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const appButtons = () => [...app().querySelectorAll('button')].map(nameOf);
function btn(re) {
  if (typeof re === 'string') re = new RegExp(`^${esc(re)}$`);
  const found = [...document.body.querySelectorAll('button')].filter((b) => re.test(nameOf(b)));
  if (found.length !== 1) throw new Error(`expected 1 button matching ${re}, got ${found.length}`);
  return found[0];
}
const heading = () => app().querySelector('h1, h2')?.textContent;
const onReport = () => app().querySelector('.sc-kicker')?.textContent === 'Mission report';
const onCard = () => /^Sol \d+ done$/.test(heading() ?? ''); // the Sol result card after a sol
const onRescue = () => appButtons().some((n) => /^(Done|Ready)$/.test(n));
async function pressCovered(label) {
  btn(`Lift the safety cover over ${label}`).click();
  btn(label).click();
  await settle();
}
async function nextSol() {
  btn('NEXT SOL →').click();
  await settle();
}
function chooseMission(label) {
  [...app().querySelectorAll('svg text')].find((x) => x.textContent === label).dispatchEvent(new MouseEvent('click', { bubbles: true }));
}
async function launch({ mission = 'RANDOM WEEK', commander = false } = {}) {
  chooseMission(mission);
  if (commander) btn('Commander mode').click();
  await pressCovered('LAUNCH');
}
const nameOfCrew = (id) => newGame().crew.find((c) => c.id === id).name;
function place(id, job) {
  btn(new RegExp(`^${nameOfCrew(id)},`)).click();
  btn(new RegExp(`^${esc(JOBS[job].name)}:`)).click();
}
// Play END SOL (bringing nobody in on a rescue) until the report.
async function playToReport() {
  while (!onReport()) {
    await pressCovered('END SOL');
    if (onRescue()) { btn(/^(Done|Ready)$/).click(); await settle(); }
    if (onCard()) await nextSol();
  }
}
const saved = () => JSON.parse(localStorage.getItem(KEY));
const json = (x) => JSON.parse(JSON.stringify(x));
const GAUGES = { power: 'Power', tank: 'Water tank', wall: 'Wall water', science: 'Science' };
const MAX = { power: LIMITS.power, tank: LIMITS.tank, wall: LIMITS.wall, science: SCIENCE_GOAL };
const gauges = () => Object.fromEntries(Object.entries(GAUGES).map(([k, label]) => [k, Number(app().querySelector(`[role="meter"][aria-label="${label}"]`).getAttribute('aria-valuenow'))]));
const expGauges = (s) => Object.fromEntries(Object.keys(GAUGES).map((k) => [k, Math.min(Math.max(s[k], 0), MAX[k])]));
// Map tokens: "Ana, radiation 12/100, at Lab".
function crewOnMap() {
  const out = {};
  for (const n of appButtons()) {
    const m = /^(\w+), radiation (\d+)\/\d+, (?:at (.+)|went home)$/.exec(n);
    if (m) out[m[1]] = { dose: Number(m[2]), at: m[3] ?? 'home' };
  }
  return out;
}
const expCrew = (s, p) => Object.fromEntries(s.crew.map((c) => [c.name, { dose: c.dose, at: JOBS[p[c.id]].name }]));

// Sept 2017, Commander: Ana in the Lab for 3 calm sols, so the save is at sol 4.
async function saveAtSol4() {
  await boot(featured);
  await launch({ mission: 'SEPT 2017', commander: true });
  place('ana', 'lab');
  for (let i = 0; i < 3; i++) { await pressCovered('END SOL'); await nextSol(); }
  expect(heading()).toBe(`Sol 4 of ${SOLS_PER_RUN}`);
  return saved();
}

describe('saving the run', () => {
  it('starting a run clears an old save; after a sol the save matches the game', async () => {
    localStorage.setItem(KEY, '{"v":1,"old":true}');
    await boot(makeSky([]));
    expect(heading()).toBe('Outpost Dial'); // a broken save never shows the prompt
    localStorage.setItem(KEY, '{"v":1,"old":true}');
    await pressCovered('LAUNCH');
    expect(localStorage.getItem(KEY)).toBeNull();
    place('ana', 'lab');
    await pressCovered('END SOL');
    expect(heading()).toBe('Sol 1 done');
    const run = buildRun(makeSky([]), { mode: 'cadet', featured: null, seed: NOW >>> 0 });
    const placements = { ana: 'lab', ben: 'shelter', cai: 'shelter' };
    const { state } = step(newGame(), placements, run.sols[0], []);
    expect(state.science).toBeGreaterThan(0); // guard: the placement mattered
    expect(saved()).toEqual(json({ v: 1, state, run, mode: 'cadet', mission: 'random', placements }));
  });

  it('the save is gone at the mission report, and a refresh then shows the title', async () => {
    await boot(stormy);
    await pressCovered('LAUNCH');
    place('ana', NEAR); place('ben', FAR);
    let sols = 0;
    while (!onReport()) {
      await pressCovered('END SOL');
      if (onRescue()) { btn('Done').click(); await settle(); }
      if (onCard()) { sols += 1; expect(saved().state.sol).toBe(sols + 1); await nextSol(); }
    }
    expect(sols).toBeGreaterThan(0); // precondition: a save existed before the report
    expect(localStorage.getItem(KEY)).toBeNull();
    await refresh(stormy);
    expect(heading()).toBe('Outpost Dial');
  });
});

describe('resume after a refresh', () => {
  it('asks to resume with the sol, mission and mode of the save', async () => {
    await saveAtSol4();
    await refresh(featured);
    expect(heading()).toBe('Resume your mission?');
    expect(document.activeElement).toBe(app().querySelector('h2'));
    expect(text(app().querySelector('.sc-resume-line'))).toBe(`Sol 4 of ${SOLS_PER_RUN} · Sept 2017 · Commander`);
    expect(appButtons()).toEqual(['Resume', 'Start over']);
  });

  it('Random week + Cadet are labelled as such', async () => {
    await boot(makeSky([]));
    await pressCovered('LAUNCH');
    await pressCovered('END SOL');
    await refresh(makeSky([]));
    expect(text(app().querySelector('.sc-resume-line'))).toBe(`Sol 2 of ${SOLS_PER_RUN} · Random week · Cadet`);
  });

  it('Resume puts back the state, placements, mission and mode, and the next sol plays on from the save', async () => {
    const save = await saveAtSol4();
    const p = normalisePlacements(save.state, save.placements);
    await refresh(featured);
    btn('Resume').click();
    await settle();
    expect(heading()).toBe(`Sol 4 of ${SOLS_PER_RUN}`);
    expect(gauges()).toEqual(expGauges(save.state));
    expect(crewOnMap()).toEqual(expCrew(save.state, p));
    expect(crewOnMap().Ana.at).toBe(JOBS.lab.name); // guard: placements came back, not the default
    expect(app().textContent).toContain(`Your sky began on ${day(30)}`); // the Sept 2017 run, not a new one
    expect(app().querySelector('.plan-storm-tip')).not.toBeNull(); // the Sept 2017 hint
    await pressCovered('END SOL'); // sol 4 is calm
    const { state } = step(save.state, p, save.run.sols[3], []);
    expect(saved().state).toEqual(json(state));
    await nextSol();
    expect(heading()).toBe(`Sol 5 of ${SOLS_PER_RUN}`);
    expect(gauges()).toEqual(expGauges(state));
    expect(crewOnMap()).toEqual(expCrew(state, p));
    await pressCovered('END SOL'); // sol 5: the X flare
    expect(app().querySelector('[role="timer"]')).not.toBeNull(); // Commander came back too
  });

  it('Random week resumed after the clock moved plays on from the save: same sols and report as an unbroken run', async () => {
    // A 60-day sky with a particle M flare every 4 days, so the week the seed picks matters.
    const wide = makeSky(Array.from({ length: 15 }, (_, i) => flare(i * 4, 'M1.0')), { range: [day(0), day(60)] });
    // Ana on the Solar Field, Ben in the Lab, Cai on the Recycler; a rescue brings nobody in.
    const cards = [];
    async function play({ stopAt } = {}) {
      while (!onReport()) {
        if (heading() === `Sol ${stopAt} of ${SOLS_PER_RUN}`) return;
        await pressCovered('END SOL');
        if (onRescue()) { btn('Done').click(); await settle(); }
        if (onCard()) { cards.push(text(app())); await nextSol(); }
      }
      return text(app().querySelector('.sc-report'));
    }
    const setUp = async () => {
      vi.setSystemTime(NOW); // the same seed for both runs
      await boot(wide);
      await pressCovered('LAUNCH');
      place('ana', NEAR); place('ben', 'lab'); place('cai', 'recycler');
    };
    await setUp();
    const unbroken = { report: await play(), cards: cards.splice(0) };
    expect(unbroken.cards.length).toBeGreaterThan(4);

    freshPage();
    localStorage.clear();
    await setUp();
    await play({ stopAt: 4 });
    const later = NOW + 9 * 86_400_000;
    vi.setSystemTime(later);
    // Precondition: rebuilding from the clock would give another week.
    expect(buildRun(wide, { mode: 'cadet', featured: null, seed: later >>> 0 }).start).not.toBe(saved().run.start);
    await refresh(wide);
    btn('Resume').click();
    await settle();
    const report = await play();
    expect(cards).toEqual(unbroken.cards);
    expect(report).toEqual(unbroken.report);
  });

  it('saved placements are normalised again, never trusted', async () => {
    const save = await saveAtSol4();
    localStorage.setItem(KEY, JSON.stringify({ ...save, placements: { ana: 'lab', ben: 'lab', cai: 'no-such-job' } }));
    await refresh(featured);
    btn('Resume').click();
    await settle();
    expect(Object.fromEntries(Object.entries(crewOnMap()).map(([n, c]) => [n, c.at])))
      .toEqual({ Ana: JOBS.lab.name, Ben: JOBS.shelter.name, Cai: JOBS.shelter.name });
  });

  it('Start over clears the save and shows the title; a later refresh shows the title too', async () => {
    await saveAtSol4();
    await refresh(featured);
    btn('Start over').click();
    await settle();
    expect(heading()).toBe('Outpost Dial');
    expect(localStorage.getItem(KEY)).toBeNull();
    await refresh(featured);
    expect(heading()).toBe('Outpost Dial');
  });

  it('a resumed run that finishes clears the save', async () => {
    await saveAtSol4();
    await refresh(featured);
    btn('Resume').click();
    await settle();
    await playToReport();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('#credits on load still opens the credits', async () => {
    await saveAtSol4();
    history.replaceState(null, '', '#credits');
    await refresh(featured);
    expect(heading()).toBe('Credits and data sources');
  });

  const good = { v: 1, mode: 'cadet', mission: 'random', placements: {} };
  it.each([
    ['not JSON', () => '{oops'],
    ['JSON null', () => 'null'],
    ['wrong version', (s) => JSON.stringify({ ...s, v: 2 })],
    ['unknown mode', (s) => JSON.stringify({ ...s, mode: 'captain' })],
    ['unknown mission', (s) => JSON.stringify({ ...s, mission: 'mars2099' })],
    ['no state', (s) => JSON.stringify({ ...s, state: undefined })],
    ['a finished run', (s) => JSON.stringify({ ...s, state: { ...s.state, over: true } })],
    ['sol out of range', (s) => JSON.stringify({ ...s, state: { ...s.state, sol: SOLS_PER_RUN + 1 } })],
    ['crew not a list', (s) => JSON.stringify({ ...s, state: { ...s.state, crew: 'Ana' } })],
    ['a gauge not a number', (s) => JSON.stringify({ ...s, state: { ...s.state, power: 'lots' } })],
    ['run too short', (s) => JSON.stringify({ ...s, run: { ...s.run, sols: s.run.sols.slice(0, 3) } })],
    ['a bad forecast entry', (s) => JSON.stringify({ ...s, run: { ...s.run, sols: s.run.sols.map((x) => ({ ...x, forecast: [null] })) } })],
    ['a forecast without inSols', (s) => JSON.stringify({ ...s, run: { ...s.run, sols: s.run.sols.map((x) => ({ ...x, forecast: [{ kind: 'cme' }] })) } })],
    ['sols without their number', (s) => JSON.stringify({ ...s, run: { ...s.run, sols: s.run.sols.map(({ sol, ...x }) => x) } })],
    ['sols out of order', (s) => JSON.stringify({ ...s, run: { ...s.run, sols: [...s.run.sols].reverse() } })],
    ['a storm that is not an object', (s) => JSON.stringify({ ...s, run: { ...s.run, sols: s.run.sols.map((x) => ({ ...x, storm: 'X9' })) } })],
    ['no crew', (s) => JSON.stringify({ ...s, state: { ...s.state, crew: [] } })],
    ['a crew member missing', (s) => JSON.stringify({ ...s, state: { ...s.state, crew: s.state.crew.slice(1) } })],
    ['a stranger in the crew', (s) => JSON.stringify({ ...s, state: { ...s.state, crew: s.state.crew.map((c, i) => (i ? c : { ...c, id: 'zed' })) } })],
  ])('a broken save (%s) is cleared and the title shows', async (_, make) => {
    const valid = { ...good, state: newGame(), run: buildRun(makeSky([]), { mode: 'cadet', featured: null, seed: 1 }) };
    localStorage.setItem(KEY, JSON.stringify(valid));
    await boot(makeSky([]));
    expect(heading()).toBe('Resume your mission?'); // guard: the valid base save is accepted
    localStorage.setItem(KEY, make(json(valid)));
    await refresh(makeSky([]));
    expect(heading()).toBe('Outpost Dial');
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});

describe('blocked storage', () => {
  it('a sol still resolves when setItem and removeItem throw', async () => {
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError'); });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('SecurityError'); });
    await boot(makeSky([]));
    await pressCovered('LAUNCH');
    await pressCovered('END SOL');
    expect(set).toHaveBeenCalledWith(KEY, expect.any(String)); // guard: the save was tried
    await nextSol();
    expect(heading()).toBe(`Sol 2 of ${SOLS_PER_RUN}`);
  });

  it('removeItem throwing at the mission report still shows the report', async () => {
    const remove = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('SecurityError'); });
    await boot(stormy);
    await pressCovered('LAUNCH');
    place('ana', NEAR); place('ben', FAR);
    await playToReport();
    expect(remove).toHaveBeenCalledWith(KEY); // guard: the clear was tried at the report
    expect(appButtons()).toEqual(['Try again', 'Change mission', 'Title']);
  });

  it.each([
    ['getItem throws', () => vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('SecurityError'); })],
    ['the localStorage getter throws', () => vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new DOMException('denied', 'SecurityError'); })],
    ['localStorage is missing', () => vi.stubGlobal('localStorage', undefined)],
  ])('%s: the game starts at the title and plays to the report', async (_, block) => {
    localStorage.setItem(KEY, 'anything');
    block();
    await boot(stormy);
    expect(heading()).toBe('Outpost Dial');
    await pressCovered('LAUNCH');
    place('ana', NEAR); place('ben', FAR);
    await playToReport();
    expect(appButtons()).toEqual(['Try again', 'Change mission', 'Title']);
  });
});
