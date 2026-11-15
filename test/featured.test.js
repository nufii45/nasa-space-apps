// The featured "Sept 2017" mission must be winnable. The plan below was found by a full search
// over placements (exact to sol 5, then the best 200,000 states per sol), rescuing only
// crew who are outside (all the rescue screen allows).
// Depends on the real public/data/sky.json: a data refetch can change the storms and break it.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { newGame, step, needsRescue } from '../src/sim/sim.js';
import { buildRun } from '../src/sim/sky.js';
import { JOBS } from '../src/sim/constants.js';

const sky = JSON.parse(readFileSync(new URL('../public/data/sky.json', import.meta.url)));

// [ana, ben, cai] jobs per sol, and who is brought back to the Shelter when a storm hits.
const PLAN = [
  [['solar', 'lab', 'rover'], ['ana', 'cai']],
  [['solar', 'recycler', 'rover'], []],
  [['solar', 'rover', 'lab'], ['ana', 'ben']],
  [['solar', 'lab', 'rover'], []],
  [['solar', 'rover', 'lab'], []],
  [['lab', 'solar', 'rover'], []],
  [['recycler', 'solar', 'rover'], ['ben', 'cai']],
];

describe.each(['cadet', 'commander'])('featured Sept 2017 run, %s', (mode) => {
  const run = buildRun(sky, { mode, featured: 'sept2017' });

  it('is the fixed real week starting 2017-09-04', () => {
    expect(run.start).toBe('2017-09-04');
    expect(run.sols.filter((s) => needsRescue(s.storm)).map((s) => s.sol)).toEqual([1, 3, 7, 9, 10]);
  });

  it('can be won with nobody sent home', () => {
    let s = newGame();
    PLAN.forEach(([[ana, ben, cai], rescued], i) => {
      const sol = run.sols[i];
      // Only rescue on a harmful storm, as the game does.
      expect(rescued.length === 0 || needsRescue(sol.storm)).toBe(true);
      // And only crew at an outside job, as the rescue screen allows.
      const jobs = { ana, ben, cai };
      for (const id of rescued) expect(JOBS[jobs[id]].where).toBe('outside');
      s = step(s, { ana, ben, cai }, sol, rescued).state;
    });
    expect(s.result).toBe('win');
    expect(s.sol).toBe(7);
    expect(s.stars).toBe(3);
    expect(s.crew.filter((c) => c.home)).toEqual([]);
  });
});
