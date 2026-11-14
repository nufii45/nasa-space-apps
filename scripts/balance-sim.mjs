// Plays many runs per strategy and flags any strategy that wins too often.
// Usage: npm run balance [-- --runs 1000 --mode commander]
import { readFile } from 'node:fs/promises';
import { newGame, step, needsRescue } from '../src/sim/sim.js';
import { buildRun } from '../src/sim/sky.js';
import { JOBS, CREW } from '../src/sim/constants.js';

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : def;
};
const RUNS = Number(arg('runs', 1000));
const MODE = arg('mode', 'commander');
const LIMIT = 0.8;

const sky = JSON.parse(await readFile(new URL('../public/data/sky.json', import.meta.url)));
if (sky.sample) console.warn('WARNING: sky.json is SAMPLE data. Run `npm run fetch:donki` for real balance numbers.\n');

const jobIds = Object.keys(JOBS);
// Every distinct fixed placement (multiset of 3 jobs), repeated every sol.
const fixed = [];
for (let a = 0; a < jobIds.length; a++)
  for (let b = a; b < jobIds.length; b++)
    for (let c = b; c < jobIds.length; c++) fixed.push([jobIds[a], jobIds[b], jobIds[c]]);

function play(policy, rescueAll, seed) {
  const run = buildRun(sky, { mode: MODE, seed });
  let s = newGame();
  for (const sol of run.sols) {
    if (s.over) break;
    const jobs = typeof policy === 'function' ? policy(s, sol) : policy;
    const placements = Object.fromEntries(CREW.map((c, i) => [c.id, jobs[i]]));
    const rescued = rescueAll && needsRescue(sol.storm) ? CREW.map((c) => c.id) : [];
    s = step(s, placements, sol, rescued).state;
  }
  return s;
}

// A simple "sensible kid" policy, for reference.
const smart = (s, sol) => {
  const jobs = ['solar', 'lab', 'rover'];
  if (s.tank <= 3) jobs[2] = 'recycler';
  else if (sol.forecast.length && s.wall < 4) jobs[2] = 'pump';
  if (s.power <= 2 && jobs[2] === 'rover') jobs[2] = 'shelter';
  return jobs;
};

const results = [];
for (const [label, policy] of [...fixed.map((f) => [f.join('+'), f]), ['smart (adaptive)', smart]]) {
  for (const rescueAll of [true, false]) {
    let wins = 0, stars = 0, science = 0, winSol = 0;
    for (let i = 0; i < RUNS; i++) {
      const s = play(policy, rescueAll, 1000 + i);
      if (s.result === 'win') { wins++; winSol += s.sol; }
      stars += s.stars;
      science += s.science;
    }
    results.push({ strategy: label, rescue: rescueAll ? 'always' : 'never', winRate: wins / RUNS, avgStars: +(stars / RUNS).toFixed(2), avgScience: Math.round(science / RUNS), avgWinSol: wins ? +(winSol / wins).toFixed(1) : null });
  }
}
results.sort((a, b) => b.winRate - a.winRate);
console.table(results.slice(0, 8));
console.table(results.filter((r) => r.strategy.startsWith('smart')));
const broken = results.filter((r) => r.strategy !== 'smart (adaptive)' && r.winRate > LIMIT);
if (broken.length) {
  console.log(`\nBALANCE PROBLEM: ${broken.length} fixed strategies win more than ${LIMIT * 100}% of runs.`);
  process.exitCode = 1;
} else {
  console.log(`\nOK: no fixed strategy wins more than ${LIMIT * 100}% of runs.`);
}
