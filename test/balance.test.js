// Tests for `npm run balance` (scripts/balance-sim.mjs) and for "the game is not trivially won".
// Depends on the real public/data/sky.json: a data refetch can change these results.
// The real 1,000-run pass/fail check takes ~9 s on 8 cores and runs in `npm run balance`, not here:
// small run counts cannot resolve the 3-point forecast margin, so no test here expects the real
// data to pass. Instead each check is shown to fail on a scratch copy with one thing broken.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync, execFile } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { newGame, step, needsRescue } from '../src/sim/sim.js';
import { buildRun } from '../src/sim/sky.js';
import { CREW } from '../src/sim/constants.js';

const repo = (p) => new URL(`../${p}`, import.meta.url).pathname;
const balance = (...args) => {
  const r = spawnSync(process.execPath, [repo('scripts/balance-sim.mjs'), ...args], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout + r.stderr };
};
const runAsync = (script, ...args) => new Promise((resolve) => {
  execFile(process.execPath, [script, ...args], { encoding: 'utf8' }, (err, stdout, stderr) => {
    resolve({ code: err ? err.code : 0, out: stdout + stderr });
  });
});

// A copy of the balance script, the sim and the sky data in a temp folder, with one text replaced.
const temps = [];
afterAll(() => temps.forEach((d) => rmSync(d, { recursive: true, force: true })));
function brokenCopy(file, from, to) {
  const dir = mkdtempSync(join(tmpdir(), 'balance-'));
  temps.push(dir);
  for (const p of ['scripts/balance-sim.mjs', 'src/sim', 'public/data/sky.json']) {
    mkdirSync(join(dir, p, '..'), { recursive: true });
    cpSync(repo(p), join(dir, p), { recursive: true });
  }
  const text = readFileSync(join(dir, file), 'utf8');
  if (!text.includes(from)) throw new Error(`${file} no longer contains: ${from}`);
  writeFileSync(join(dir, file), text.replace(from, to));
  return join(dir, 'scripts/balance-sim.mjs');
}

// The slow spawns run at the same time, before the tests that read them.
let both, control, pump, forecast, fixed;
beforeAll(async () => {
  [both, control, pump, forecast, fixed] = await Promise.all([
    // One run gives the reference player 0% or 100%: outside every band, so this always fails.
    runAsync(repo('scripts/balance-sim.mjs'), '--runs', '1'),
    // Control for the broken copies below, same 50 runs: on today's data this run passes the
    // thirst, forecast and fixed-plan checks (it fails only its band, which 50 runs cannot settle).
    runAsync(repo('scripts/balance-sim.mjs'), '--runs', '50', '--mode', 'cadet'),
    runAsync(brokenCopy('scripts/balance-sim.mjs', ' && afterPump(s) >= DRINK_PER_SOL', ''), '--runs', '50', '--mode', 'cadet'),
    runAsync(brokenCopy('src/sim/constants.js', 'WALL_BLOCK_PER_UNIT = 0.15', 'WALL_BLOCK_PER_UNIT = 0'), '--runs', '50', '--mode', 'cadet'),
    runAsync(brokenCopy('src/sim/constants.js', 'effect: { science: 6 }', 'effect: { science: 50 }'), '--runs', '50', '--mode', 'cadet'),
  ]);
}, 60000);

describe('balance script output and failure', () => {
  it('with no --mode checks both modes, with every row, and finishes', () => {
    for (const mode of ['cadet', 'commander']) expect(both.out).toContain(`=== ${mode} (1 runs per strategy) ===`);
    for (const row of ['smart (rescue always)', 'smart (rescue never)', 'smart without forecast', 'best fixed plan: ', 'best schedule: ']) {
      const tableRows = both.out.split('\n').filter((l) => l.startsWith('│') && l.includes(`'${row}`));
      expect(tableRows, row).toHaveLength(2);
    }
  });

  it('exits 1 and names the failed band check for each mode', () => {
    expect(both.code).toBe(1);
    expect(both.out).toContain('BALANCE PROBLEM');
    expect(both.out).toMatch(/- cadet: smart \(rescue always\) wins (0\.0|100\.0)%, outside the 65% to 80% band\./);
    expect(both.out).toMatch(/- commander: smart \(rescue always\) wins (0\.0|100\.0)%, outside the 45% to 65% band\./);
    expect(both.out).not.toContain('OK (');
  });

  it('--mode runs just that mode', () => {
    expect(control.out).toContain('=== cadet (50 runs per strategy) ===');
    expect(control.out).not.toContain('=== commander');
  });
});

describe('each enforced check can fail', () => {
  it('control: the real script passes the thirst, forecast and fixed-plan checks', () => {
    expect(control.out).not.toMatch(/thirsty by pumping|following the forecast gains|best fixed plan: \S+ wins/);
  });

  it('smart pumping itself thirsty (the drinking-water guard removed)', () => {
    expect(pump.code).toBe(1);
    expect(pump.out).toMatch(/- cadet: smart made \d+ sols thirsty by pumping\./);
  });

  it('the forecast not paying (walls block nothing)', () => {
    expect(forecast.code).toBe(1);
    expect(forecast.out).toMatch(/- cadet: following the forecast gains -?\d+\.\d% .*less than 3%\./);
  });

  it('a fixed plan winning too often (Lab +50 science)', () => {
    expect(fixed.code).toBe(1);
    expect(fixed.out).toMatch(/- cadet: best fixed plan: \S+ wins 100\.0%, more than 80%\./);
  });
});

describe('balance script arguments', () => {
  it.each([
    [['--runs', '0'], '--runs must be a positive integer (got "0")'],
    [['--runs', 'abc'], '--runs must be a positive integer (got "abc")'],
    [['--runs', '1.5'], '--runs must be a positive integer (got "1.5")'],
    [['--runs', '-5'], '--runs must be a positive integer (got "-5")'],
    [['--runs', ''], '--runs must be a positive integer (got "")'],
    [['--runs'], '--runs needs a value.'],
    [['--runs', '--mode', 'cadet'], '--runs needs a value.'],
    [['--mode=cadet'], 'Unknown argument "--mode=cadet".'],
    [['--mode', 'moon'], 'Unknown mode "moon" (cadet or commander).'],
    [['--foo', '1'], 'Unknown argument "--foo".'],
    [['cadet'], 'Unknown argument "cadet".'],
    [['--runs', '1', 'extra'], 'Unknown argument "extra".'],
  ])('rejects %j', (args, message) => {
    const { code, out } = balance(...args);
    expect(code).toBe(1);
    expect(out).toContain(message);
    expect(out).toContain('Usage: npm run balance');
    expect(out).not.toContain('===');
  });

  // Same bug class as normalisePlacements: inherited names must not pass as modes.
  it('rejects an inherited name as a mode before running anything', () => {
    const { code, out } = balance('--runs', '1', '--mode', 'constructor');
    expect(code).toBe(1);
    expect(out).toContain('Unknown mode "constructor" (cadet or commander).');
  });
});

describe('weeks with no harmful storm', () => {
  const sky = JSON.parse(readFileSync(repo('public/data/sky.json')));
  const calm = [];
  for (let seed = 1000; seed < 1300; seed++) {
    const r = buildRun(sky, { mode: 'cadet', seed });
    if (!r.sols.some((s) => needsRescue(s.storm))) calm.push(r);
  }
  const play = (r, policy) => {
    let s = newGame();
    for (const sol of r.sols) {
      const jobs = typeof policy === 'function' ? policy(s) : policy;
      s = step(s, Object.fromEntries(CREW.map((c, i) => [c.id, jobs[i]])), sol).state;
    }
    return s;
  };

  it('the archive has calm weeks to test', () => {
    expect(calm.length).toBeGreaterThan(10);
  });

  it('everyone in the Shelter never wins (no science)', () => {
    for (const r of calm) {
      const s = play(r, ['shelter', 'shelter', 'shelter']);
      expect(s.result).not.toBe('win');
      expect(s.science).toBe(0);
    }
  });

  it('never recycling water sends the crew home thirsty', () => {
    for (const r of calm) {
      const s = play(r, ['solar', 'lab', 'rover']);
      expect(s.result).toBe('home');
      expect(s.science).toBeLessThan(100);
      expect(s.thirstySols).toBe(2);
    }
  });

  it('sensible outdoor work (recycling when the tank is low) always wins', () => {
    for (const r of calm) {
      const s = play(r, (st) => ['solar', 'lab', st.tank <= 3 ? 'recycler' : 'rover']);
      expect(s.result).toBe('win');
      expect(s.crew.filter((c) => c.home)).toEqual([]);
    }
  });
});
