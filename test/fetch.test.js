// Tests for scripts/fetch-donki.mjs. The script runs in a child process inside a temp folder (it
// writes relative to its working folder), with `fetch` replaced by a fake and retry waits set to 0
// by a preload module. Nothing here touches the network or the repo's public/data/sky.json.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const script = new URL('../scripts/fetch-donki.mjs', import.meta.url).pathname;

// FAKE is a JSON list of responses, used in order; the last one repeats. Each is
// { status, body } or { throw: message }. Every call is logged as "FAKE <n> key=<sent api_key?>".
const PRELOAD = `
const plan = JSON.parse(process.env.FAKE);
let n = 0;
const wait = globalThis.setTimeout;
globalThis.setTimeout = (f, _ms, ...a) => wait(f, 0, ...a);
globalThis.fetch = async (url) => {
  const r = plan[Math.min(n, plan.length - 1)];
  n++;
  console.log('FAKE ' + n + ' key=' + new URL(url).searchParams.has('api_key'));
  if (r.throw) throw new TypeError(r.throw);
  return new Response(r.body ?? '[]', { status: r.status });
};
`;

let dir;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'fetch-donki-'));
  mkdirSync(join(dir, 'public/data'), { recursive: true });
  writeFileSync(join(dir, 'preload.mjs'), PRELOAD);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const fetchDonki = (fake, env = {}) => {
  const r = spawnSync(process.execPath, ['--import', join(dir, 'preload.mjs'), script], {
    cwd: dir,
    encoding: 'utf8',
    // One 60-day window at most per type unless a test widens it; never the real API.
    env: { PATH: process.env.PATH, DONKI_BASE: 'http://127.0.0.1:9/DONKI', FROM: '2012', TO: '2012', FAKE: JSON.stringify(fake), ...env },
  });
  const out = r.stdout + r.stderr;
  return { code: r.status, out, calls: (out.match(/^FAKE \d+/gm) || []).length };
};
const skyPath = () => join(dir, 'public/data/sky.json');
const FLARE = JSON.stringify([{ flrID: 'F1', classType: 'X1.0', peakTime: '2012-03-07T00:00Z' }]);

describe('fetch-donki', () => {
  it('writes sky.json from good responses', () => {
    const { code, out } = fetchDonki([{ status: 200, body: FLARE }]);
    expect(code, out).toBe(0);
    const sky = JSON.parse(readFileSync(skyPath(), 'utf8'));
    expect(sky.range).toEqual(['2012-01-01', '2012-12-31']);
    expect(sky.events.some((e) => e.id === 'F1' && e.type === 'flare')).toBe(true);
  });

  it('fails at once on a 4xx other than 429', () => {
    const { code, out, calls } = fetchDonki([{ status: 400, body: 'range too long' }]);
    expect(code).not.toBe(0);
    expect(calls).toBe(1);
    expect(out).toContain('Failed: FLR 2012-01-01..2012-03-01: HTTP 400 range too long');
    expect(existsSync(skyPath())).toBe(false);
  });

  it('retries a 429 and a network error, then goes on', () => {
    const { code, out, calls } = fetchDonki([{ status: 429 }, { throw: 'fetch failed' }, { status: 200, body: FLARE }]);
    expect(code, out).toBe(0);
    expect(out).toMatch(/HTTP 429.*retry 1/);
    expect(out).toMatch(/network error \(fetch failed\), retry 2/);
    expect(calls).toBeGreaterThan(3);
  });

  it('gives up after 4 attempts on a server error', () => {
    const { code, out, calls } = fetchDonki([{ status: 500, body: 'down' }]);
    expect(code).not.toBe(0);
    expect(calls).toBe(4);
    expect(out).toContain('Failed after 4 attempts: FLR 2012-01-01..2012-03-01: HTTP 500 down');
  });

  it.each([
    [{ FROM: 'abc' }],
    [{ FROM: '2012.5' }],
    [{ FROM: '2020', TO: '2019' }],
    [{ TO: 'next' }],
  ])('rejects bad years %j before fetching', (env) => {
    const { code, out, calls } = fetchDonki([{ status: 200, body: FLARE }], env);
    expect(code).not.toBe(0);
    expect(calls).toBe(0);
    expect(out).toContain('FROM and TO must be years with FROM <= TO');
  });

  it('leaves sky.json alone when no events were produced', () => {
    writeFileSync(skyPath(), 'KEEP');
    const { code, out } = fetchDonki([{ status: 200, body: '[]' }]);
    expect(code).not.toBe(0);
    expect(out).toContain('No events produced');
    expect(readFileSync(skyPath(), 'utf8')).toBe('KEEP');
  });

  it.each([
    ['an HTTP error', [{ status: 403, body: 'bad key' }]],
    ['network errors', [{ throw: 'fetch failed' }]],
  ])('never prints the api_key on %s', (_, fake) => {
    const { code, out } = fetchDonki(fake, { DONKI_BASE: 'https://api.nasa.gov/DONKI', NASA_API_KEY: 'SECRET-KEY-42' });
    expect(code).not.toBe(0);
    expect(out).toContain('key=true'); // the key was really sent, so this test is not vacuous
    expect(out).not.toContain('SECRET-KEY-42');
  });
});
