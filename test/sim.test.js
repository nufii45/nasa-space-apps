import { describe, it, expect } from 'vitest';
import { newGame, step, stormBaseDose, locationFactor, normalisePlacements } from '../src/sim/sim.js';
import { buildRun } from '../src/sim/sky.js';
import { JOBS } from '../src/sim/constants.js';

const all = (job) => ({ ana: job, ben: job, cai: job });

describe('newGame', () => {
  it('starts with PRD values', () => {
    const s = newGame();
    expect([s.sol, s.power, s.tank, s.wall, s.science]).toEqual([1, 6, 8, 0, 0]);
    expect(s.crew.map((c) => c.dose)).toEqual([0, 0, 0]);
  });
});

describe('placements', () => {
  it('one crew per job; extras and unknowns go to shelter', () => {
    const p = normalisePlacements(newGame(), { ana: 'lab', ben: 'lab', cai: 'moon' });
    expect(p).toEqual({ ana: 'lab', ben: 'shelter', cai: 'shelter' });
  });
  it('inherited object names are not jobs', () => {
    expect(normalisePlacements(newGame(), { ana: 'constructor', ben: 'toString' })).toEqual({ ana: 'shelter', ben: 'shelter', cai: 'shelter' });
  });
});

describe('power and heaters', () => {
  it('solar adds power, heaters take 2, capped at 10', () => {
    const { state } = step({ ...newGame(), power: 9 }, { ana: 'solar' });
    expect(state.power).toBe(8); // min(10, 13) - 2
  });
  it('a cold sol gives no science', () => {
    const { state, log } = step({ ...newGame(), power: 1 }, { ana: 'lab' });
    expect(state.science).toBe(0);
    expect(state.coldSols).toBe(1);
    expect(log.some((l) => l.type === 'warn')).toBe(true);
  });
  it('jobs are skipped when power runs out, in order recycler, pump, lab, rover', () => {
    // power 6 - heaters 2 = 4: recycler (2) + pump (1) + lab (1) = 4, rover skipped
    const s = { ...newGame(), crew: [...newGame().crew, { id: 'dee', name: 'Dee', dose: 0, home: false }] };
    const { state } = step(s, { ana: 'recycler', ben: 'pump', cai: 'lab', dee: 'rover' });
    expect(state.power).toBe(0);
    expect(state.science).toBe(JOBS.lab.effect.science);
  });
});

describe('water', () => {
  it('recycler +4, crew drink 2', () => {
    expect(step({ ...newGame(), tank: 4 }, { ana: 'recycler' }).state.tank).toBe(6);
    expect(step(newGame(), { ana: 'recycler' }).state.tank).toBe(8); // 8 + 4 capped at 10, then - 2
  });
  it('pump moves 4 water into the walls', () => {
    const { state } = step(newGame(), { ana: 'pump' });
    expect(state.wall).toBe(4);
    expect(state.tank).toBe(2); // 8 - 4 pumped - 2 drunk
  });
  it('two thirsty sols in a row send everyone home', () => {
    let s = { ...newGame(), tank: 0 };
    s = step(s, {}).state;
    expect(s.over).toBe(false);
    s = step(s, {}).state;
    expect(s.over).toBe(true);
    expect(s.result).toBe('home');
  });
});

describe('radiation', () => {
  it('background: +1 everyone, +5 more outside', () => {
    const { state } = step(newGame(), { ana: 'solar', ben: 'lab' });
    expect(state.crew.map((c) => c.dose)).toEqual([6, 1, 1]);
  });
  it('storm base dose by class, only with particles', () => {
    expect(stormBaseDose({ kind: 'flare', cls: 'X8.2', particles: true })).toBe(40);
    expect(stormBaseDose({ kind: 'flare', cls: 'M1.0', particles: true })).toBe(20);
    expect(stormBaseDose({ kind: 'flare', cls: 'X9.3', particles: false })).toBe(0);
    expect(stormBaseDose({ kind: 'cme' })).toBe(50);
  });
  it('location factors', () => {
    expect(locationFactor('outside', 6)).toBe(1);
    expect(locationFactor('inside', 6)).toBe(0.6);
    expect(locationFactor('shelter', 0)).toBeCloseTo(0.6);
    expect(locationFactor('shelter', 6)).toBeCloseTo(0.06);
  });
  it('rescued crew take the shelter dose', () => {
    const storm = { kind: 'flare', cls: 'X1', particles: true };
    const s = newGame();
    const left = step(s, { ana: 'rover' }, { storm }).state.crew[0].dose;
    const saved = step(s, { ana: 'rover' }, { storm }, ['ana']).state.crew[0].dose;
    expect(left).toBe(6 + 40);
    expect(saved).toBe(6 + 24);
  });
  it('crew at 100 go home, the run continues', () => {
    const s = newGame();
    s.crew[0].dose = 99;
    const { state } = step(s, { ana: 'lab' });
    expect(state.crew[0].home).toBe(true);
    expect(state.over).toBe(false);
  });
});

describe('end of run', () => {
  it('wins at 100 science with stars', () => {
    const s = { ...newGame(), science: 95, power: 10 };
    const { state } = step(s, { ana: 'lab' });
    expect(state.result).toBe('win');
    expect(state.stars).toBe(3);
  });
  it('ends after sol 10', () => {
    const s = { ...newGame(), sol: 10 };
    expect(step(s, all('shelter')).state.result).toBe('time');
  });
});

describe('buildRun', () => {
  const sky = {
    sample: true,
    range: ['2017-01-01', '2017-12-31'],
    events: [
      { date: '2017-09-10', type: 'flare', class: 'X8.2', particles: true, id: 'a' },
      { date: '2017-09-10', type: 'flare', class: 'C1.0', particles: false, id: 'b' },
      { date: '2017-09-12', type: 'cme-mars', warnFrom: '2017-09-10', id: 'c' },
    ],
    featured: { sept2017: { start: '2017-09-04', seed: 2017 } },
  };
  it('featured run is fixed and picks the strongest storm per day', () => {
    const run = buildRun(sky, { featured: 'sept2017' });
    expect(run.start).toBe('2017-09-04');
    expect(run.sols).toHaveLength(10);
    expect(run.sols[6].storm.cls).toBe('X8.2');
    expect(run.sols[8].storm.kind).toBe('cme');
    expect(run.sols[6].forecast).toEqual([{ kind: 'cme', inSols: 2 }]);
    expect(run.sols[5].forecast).toEqual([]); // warning starts on 09-10
  });
  it('same seed, same run', () => {
    expect(buildRun(sky, { seed: 42 })).toEqual(buildRun(sky, { seed: 42 }));
  });
});
