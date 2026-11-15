// Balance check (decision 0007). Plays the same real-data runs with several policies per mode and
// fails (exit 1) unless, in every mode checked:
//   1. the reference "sensible kid" (smart, rescuing everyone outside) wins inside its band,
//   2. smart never makes a sol thirsty by pumping,
//   3. following the CME forecast pays: smart beats the same policy without its forecast reaction,
//   4. no plan that repeats the same jobs every sol wins too often.
// The best schedule written in advance (job by sol number) is reported, never enforced.
// Usage: npm run balance [-- --runs 1000] [-- --mode cadet|commander]   (no --mode: both modes)
import { readFile } from 'node:fs/promises';
import { availableParallelism } from 'node:os';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { newGame, step, needsRescue, normalisePlacements, stormBaseDose } from '../src/sim/sim.js';
import { buildRun } from '../src/sim/sky.js';
import { JOBS, CREW, DRINK_PER_SOL, LIMITS, SOLS_PER_RUN } from '../src/sim/constants.js';

// Win-rate bands for smart with rescue "always" (only crew outside can be rescued, as in the game).
const SMART_BAND = { cadet: [0.65, 0.8], commander: [0.45, 0.65] };
// smart must win at least this much more often than smart without its forecast reaction.
const FORECAST_MARGIN = 0.03;
// No same-jobs-every-sol plan may win more often than this.
const FIXED_LIMIT = 0.8;

const ids = CREW.map((c) => c.id);
// One game. policy(state, sol) -> [job per crew], or a fixed array. rescue: 'outside' | 'never'.
function play(run, policy, rescue = 'outside') {
  let s = newGame();
  let pumpThirst = 0;
  for (const sol of run.sols) {
    if (s.over) break;
    const jobs = typeof policy === 'function' ? policy(s, sol) : policy;
    const placements = Object.fromEntries(ids.map((id, i) => [id, jobs[i]]));
    const placed = normalisePlacements(s, placements);
    // The rescue screen only offers crew who are outside.
    const rescued = rescue === 'outside' && needsRescue(sol.storm)
      ? ids.filter((id) => JOBS[placed[id]]?.where === 'outside') : [];
    const next = step(s, placements, sol, rescued).state;
    if (Object.values(placed).includes('pump') && next.thirstySols > s.thirstySols) pumpThirst++;
    s = next;
  }
  return { s, pumpThirst };
}

// Water left in the tank after a pump this sol (same cap as sim.js).
const afterPump = (s) => s.tank - Math.min(-JOBS.pump.effect.tank, s.tank, LIMITS.wall - s.wall);

// The reference "sensible kid". Its only correction (decision 0007): never pump the tank below a day's drink.
const smart = (s, sol) => {
  const jobs = ['solar', 'lab', 'rover'];
  if (s.tank <= 3) jobs[2] = 'recycler';
  else if (sol.forecast.length && s.wall < 4 && afterPump(s) >= DRINK_PER_SOL) jobs[2] = 'pump';
  if (s.power <= 2 && jobs[2] === 'rover') jobs[2] = 'shelter';
  return jobs;
};
// The same kid ignoring the forecast.
const noForecast = (s, sol) => smart(s, { ...sol, forecast: [] });

function score(runs, policy, rescue) {
  let wins = 0, stars = 0, science = 0, anyHome = 0, allHome = 0, pumpThirst = 0;
  for (const run of runs) {
    const r = play(run, policy, rescue);
    if (r.s.result === 'win') wins++;
    if (r.s.crew.some((c) => c.home)) anyHome++;
    if (r.s.result === 'home') allHome++;
    stars += r.s.stars;
    science += r.s.science;
    pumpThirst += r.pumpThirst;
  }
  const n = runs.length;
  const share = (x) => +(x / n).toFixed(3);
  return { winRate: share(wins), avgStars: +(stars / n).toFixed(2), avgScience: Math.round(science / n), anyCrewHome: share(anyHome), wholeCrewHome: share(allHome), pumpThirstySols: pumpThirst };
}

const jobIds = Object.keys(JOBS);
// Every distinct same-jobs-every-sol plan (multiset of 3 jobs).
const fixed = [];
for (let a = 0; a < jobIds.length; a++)
  for (let b = a; b < jobIds.length; b++)
    for (let c = b; c < jobIds.length; c++) fixed.push([jobIds[a], jobIds[b], jobIds[c]]);

// Best schedule written in advance: Solar Field + Lab every sol, the third job chosen by sol number,
// rescuing like smart. A lower bound, not an exact best: only schedules that win a storm-free week are
// tried (they form a trie), and a calm win before sol 10 is padded with rover trips. The trie is played
// on every distinct stormy run, split across worker threads.
const THIRD = ['pump', 'recycler', 'rover', 'shelter'];
const PLACE = Object.fromEntries(THIRD.map((job) => [job, Object.fromEntries(ids.map((id, i) => [id, ['solar', 'lab', job][i]]))]));
const OUTSIDE = Object.fromEntries(THIRD.map((job) => [job, ids.filter((id) => JOBS[PLACE[job][id]].where === 'outside')]));
const calmSol = { storm: null, forecast: [] };

// Node: { id, job, s: state after this sol in a calm week, kids: [] }. A leaf is a calm win.
function buildTrie() {
  const n = SOLS_PER_RUN;
  const grow = (s, depth, job) => {
    const node = { job, s, kids: [] };
    if (s.over || depth === n) return s.result === 'win' ? node : null;
    for (const j of THIRD) {
      const kid = grow(step(s, PLACE[j], calmSol).state, depth + 1, j);
      if (kid) node.kids.push(kid);
    }
    return node.kids.length ? node : null;
  };
  const root = grow(newGame(), 0, null);
  const nodes = [];
  (function number(node) { node.id = nodes.push(node) - 1; node.kids.forEach(number); })(root || { kids: [] });
  return { root, nodes };
}

// For each schedule that wins this group's runs, adds the group's weight per mode to wins[node.id * K + k]
// at the node where it wins (a win at a node counts for every leaf below).
function walk(node, s, depth, g, calm, wins) {
  const sol = g.sols[depth];
  const harm = needsRescue(sol.storm);
  // Until the first harmful storm the game is the calm one: reuse it.
  const stillCalm = calm && !harm;
  for (const kid of node.kids) {
    let t = stillCalm ? kid.s : step(s, PLACE[kid.job], sol, harm ? OUTSIDE[kid.job] : []).state;
    if (!kid.kids.length) {
      // The calm week is won here; a stormy one goes on with rover trips (shortcut: suffix not searched).
      for (let d = depth + 1; d < g.sols.length && !t.over; d++) {
        t = step(t, PLACE.rover, g.sols[d], needsRescue(g.sols[d].storm) ? OUTSIDE.rover : []).state;
      }
    }
    if (t.over) {
      if (t.result === 'win') g.weights.forEach((w, k) => { wins[kid.id * g.weights.length + k] += w; });
      continue;
    }
    walk(kid, t, depth + 1, g, stillCalm, wins);
  }
}

// One search for all modes at once: most seeds give the same week in both modes.
async function bestSchedules(runSets) {
  const K = runSets.length;
  // A run's outcome for these schedules depends only on each sol's storm dose; calm runs are won by all.
  const groups = new Map();
  const calmWins = Array(K).fill(0);
  runSets.forEach((runs, k) => {
    for (const run of runs) {
      if (!run.sols.some((x) => needsRescue(x.storm))) { calmWins[k]++; continue; }
      const key = run.sols.map((x) => stormBaseDose(x.storm)).join();
      if (!groups.has(key)) groups.set(key, { sols: run.sols.map((x) => ({ storm: x.storm, forecast: [] })), weights: Array(K).fill(0) });
      groups.get(key).weights[k]++;
    }
  });
  const list = [...groups.values()];
  const w = Math.max(1, Math.min(availableParallelism(), list.length));
  const working = Promise.all(Array.from({ length: w }, (_, i) => new Promise((resolve, reject) => {
    new Worker(new URL(import.meta.url), { workerData: list.filter((_, j) => j % w === i) })
      .once('message', resolve).once('error', reject);
  })));
  const { root } = buildTrie();
  // The caller's own work runs while the workers do.
  const parts = await working;
  if (!root) return runSets.map(() => null);
  return runSets.map((_, k) => {
    let best = null;
    (function pick(node, sched, wins) {
      wins += parts.reduce((sum, part) => sum + (part[node.id * K + k] || 0), 0);
      if (!node.kids.length) { if (!best || wins > best.wins) best = { sched, wins }; return; }
      for (const kid of node.kids) pick(kid, [...sched, kid.job], wins);
    })(root, [], calmWins[k]);
    const sched = [...best.sched, ...Array(SOLS_PER_RUN - best.sched.length).fill('rover')];
    return { label: `solar+lab+[${sched.join(',')}]`, policy: (s) => ['solar', 'lab', sched[s.sol - 1]] };
  });
}

if (isMainThread) {
  const USAGE = 'Usage: npm run balance [-- --runs <positive integer>] [-- --mode cadet|commander]';
  const fail = (msg) => {
    console.error(`${msg}\n${USAGE}`);
    process.exit(1);
  };
  const opts = { runs: '1000', mode: null };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 2) {
    const name = argv[i].startsWith('--') ? argv[i].slice(2) : '';
    if (!Object.hasOwn(opts, name)) fail(`Unknown argument "${argv[i]}".`);
    if (argv[i + 1] === undefined || argv[i + 1].startsWith('--')) fail(`--${name} needs a value.`);
    opts[name] = argv[i + 1];
  }
  const RUNS = Number(opts.runs);
  if (!(Number.isInteger(RUNS) && RUNS > 0)) fail(`--runs must be a positive integer (got "${opts.runs}").`);
  const MODES = opts.mode ? [opts.mode] : ['cadet', 'commander'];
  for (const m of MODES) if (!Object.hasOwn(SMART_BAND, m)) fail(`Unknown mode "${m}" (cadet or commander).`);

  const sky = JSON.parse(await readFile(new URL('../public/data/sky.json', import.meta.url)));
  if (sky.sample) console.warn('WARNING: sky.json is SAMPLE data. Run `npm run fetch:donki` for real balance numbers.\n');

  const failures = [];
  const pct = (x) => `${(x * 100).toFixed(1)}%`;
  const runSets = MODES.map((mode) => Array.from({ length: RUNS }, (_, i) => buildRun(sky, { mode, seed: 1000 + i })));
  const searching = bestSchedules(runSets);
  const table = MODES.map((mode, m) => {
    const runs = runSets[m];
    const ref = score(runs, smart);
    const rows = [
      { strategy: 'smart (rescue always)', ...ref },
      { strategy: 'smart (rescue never)', ...score(runs, smart, 'never') },
      { strategy: 'smart without forecast', ...score(runs, noForecast) },
    ];
    let topFixed = null;
    for (const f of fixed) {
      const r = { strategy: `best fixed plan: ${f.join('+')}`, ...score(runs, f) };
      if (!topFixed || r.winRate > topFixed.winRate) topFixed = r;
    }
    rows.push(topFixed);
    return rows;
  });
  // Report only: a failed search must not fail the run.
  const schedules = await searching.catch((e) => { console.warn(`best schedule: search failed (${e.message})`); return null; });
  for (const [m, mode] of MODES.entries()) {
    const rows = table[m];
    const [ref, , , topFixed] = rows;
    const sched = schedules?.[m];
    rows.push(sched ? { strategy: `best schedule: ${sched.label}`, ...score(runSets[m], sched.policy) } : { strategy: schedules ? 'best schedule: none wins a calm week' : 'best schedule: search failed', winRate: 0 });

    console.log(`\n=== ${mode} (${RUNS} runs per strategy) ===`);
    console.table(rows);

    const [lo, hi] = SMART_BAND[mode];
    if (ref.winRate < lo || ref.winRate > hi) failures.push(`${mode}: smart (rescue always) wins ${pct(ref.winRate)}, outside the ${lo * 100}% to ${hi * 100}% band.`);
    if (ref.pumpThirstySols) failures.push(`${mode}: smart made ${ref.pumpThirstySols} sols thirsty by pumping.`);
    const gain = ref.winRate - rows[2].winRate;
    if (gain < FORECAST_MARGIN - 1e-9) failures.push(`${mode}: following the forecast gains ${pct(gain)} (smart ${pct(ref.winRate)} vs ${pct(rows[2].winRate)} without it), less than ${FORECAST_MARGIN * 100}%.`);
    if (topFixed.winRate > FIXED_LIMIT) failures.push(`${mode}: ${topFixed.strategy} wins ${pct(topFixed.winRate)}, more than ${FIXED_LIMIT * 100}%.`);
  }

  if (failures.length) {
    console.log(`\nBALANCE PROBLEM:\n- ${failures.join('\n- ')}`);
    process.exitCode = 1;
  } else {
    console.log(`\nOK (${MODES.join(', ')}): smart is inside its band, never pumps itself thirsty, gains at least ${FORECAST_MARGIN * 100}% from the forecast, and no fixed plan wins more than ${FIXED_LIMIT * 100}%.`);
  }
} else {
  const { root, nodes } = buildTrie();
  const wins = new Float64Array(nodes.length * (workerData[0]?.weights.length || 0));
  if (root) for (const g of workerData) walk(root, newGame(), 0, g, true, wins);
  parentPort.postMessage(wins);
}
