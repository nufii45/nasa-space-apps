// @vitest-environment jsdom
// Saving the run (src/main.js): after each sol the run is saved to localStorage, the report clears it,
// and a blocked storage never stops the game. Boots the real screen controller like game.test.js.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { newGame, step } from '../../src/sim/sim.js';
import { buildRun } from '../../src/sim/sky.js';
import { JOBS, SOLS_PER_RUN } from '../../src/sim/constants.js';

const ROOT = resolve(import.meta.dirname, '../..');
const BODY = readFileSync(join(ROOT, 'index.html'), 'utf8').match(/<body>([\s\S]*)<\/body>/)[1].replace(/<script[\s\S]*?<\/script>/g, '');
const NOW = Date.parse('2026-11-15T00:00:00Z');
const KEY = 'outpost-dial.save.v1';
const NEAR = Object.keys(JOBS).find((id) => JOBS[id].where === 'outside' && !JOBS[id].walkBackSeconds);
const FAR = Object.keys(JOBS).find((id) => JOBS[id].where === 'outside' && JOBS[id].walkBackSeconds);

const day = (i) => new Date(Date.UTC(2020, 2, 1 + i)).toISOString().slice(0, 10);
const flare = (i, cls) => ({ date: day(i), type: 'flare', class: cls, particles: true, id: `F${i}`, url: 'u' });
const makeSky = (events) => ({ sample: false, fetched: '2020-12-31', range: [day(0), day(SOLS_PER_RUN)], events });
// A particle X flare every day: two astronauts outside and never rescued ends the run early.
const stormy = makeSky(Array.from({ length: SOLS_PER_RUN }, (_, i) => flare(i, 'X5.0')));

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
  added = [];
  window.addEventListener = function (...a) { added.push(a); return realAdd.apply(this, a); };
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
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

const app = () => document.getElementById('app');
const nameOf = (b) => (b.getAttribute('aria-label') ?? b.textContent).trim();
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function btn(re) {
  if (typeof re === 'string') re = new RegExp(`^${esc(re)}$`);
  const found = [...document.body.querySelectorAll('button')].filter((b) => re.test(nameOf(b)));
  if (found.length !== 1) throw new Error(`expected 1 button matching ${re}, got ${found.length}`);
  return found[0];
}
const heading = () => app().querySelector('h1, h2')?.textContent;
async function pressCovered(label) {
  btn(`Lift the safety cover over ${label}`).click();
  btn(label).click();
  await settle();
}
const nameOfCrew = (id) => newGame().crew.find((c) => c.id === id).name;
function place(id, job) {
  btn(new RegExp(`^${nameOfCrew(id)},`)).click();
  btn(new RegExp(`^${esc(JOBS[job].name)}:`)).click();
}
const saved = () => JSON.parse(localStorage.getItem(KEY));
const json = (x) => JSON.parse(JSON.stringify(x));

describe('saving the run', () => {
  it('starting a run clears an old save; after a sol the save matches the game', async () => {
    localStorage.setItem(KEY, '{"v":1,"old":true}');
    await boot(makeSky([]));
    await pressCovered('LAUNCH');
    expect(localStorage.getItem(KEY)).toBeNull();
    place('ana', 'lab');
    await pressCovered('END SOL');
    expect(heading()).toBe(`Sol 2 of ${SOLS_PER_RUN}`);
    const run = buildRun(makeSky([]), { mode: 'cadet', featured: null, seed: NOW >>> 0 });
    const placements = { ana: 'lab', ben: 'shelter', cai: 'shelter' };
    const { state } = step(newGame(), placements, run.sols[0], []);
    expect(state.science).toBeGreaterThan(0); // guard: the placement mattered
    expect(saved()).toEqual(json({ v: 1, state, run, mode: 'cadet', mission: 'random', placements }));
  });

  it('the save is gone at the mission report', async () => {
    await boot(stormy);
    await pressCovered('LAUNCH');
    place('ana', NEAR); place('ben', FAR);
    let sols = 0;
    while (heading() !== 'Mission report') {
      await pressCovered('END SOL');
      if (heading() !== 'Mission report' && !/^Sol /.test(heading())) { btn('Done').click(); await settle(); } // rescue screen
      if (heading() !== 'Mission report') { sols += 1; expect(saved().state.sol).toBe(sols + 1); }
    }
    expect(sols).toBeGreaterThan(0); // precondition: a save existed before the report
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('a sol still resolves when storage throws', async () => {
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError'); });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('SecurityError'); });
    await boot(makeSky([]));
    await pressCovered('LAUNCH');
    await pressCovered('END SOL');
    expect(set).toHaveBeenCalledWith(KEY, expect.any(String)); // guard: the save was tried
    expect(heading()).toBe(`Sol 2 of ${SOLS_PER_RUN}`);
  });
});
