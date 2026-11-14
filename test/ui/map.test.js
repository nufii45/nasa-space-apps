// @vitest-environment jsdom
// Outpost map (src/ui/map): driven through its public API and simulated clicks on real buttons.
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createOutpostMap } from '../../src/ui/map/index.js';
import { JOBS } from '../../src/sim/constants.js';
import { normalisePlacements } from '../../src/sim/sim.js';

const CREW = () => [
  { id: 'ana', name: 'Ana', dose: 12, home: false },
  { id: 'ben', name: 'Ben', dose: 40, home: false },
  { id: 'cai', name: 'Cai', dose: 0, home: false },
];

// Mount a map and record every onChange / onInfo call.
function mount(opts = {}) {
  const changes = [];
  const infos = [];
  const map = createOutpostMap({
    jobs: JOBS,
    crew: CREW(),
    onChange: (p) => changes.push(p),
    onInfo: (id) => infos.push(id),
    ...opts,
  });
  document.body.append(map.el);
  return { map, root: map.el, changes, infos };
}

// Accessible name: aria-label wins, else text content (what a screen reader announces).
const nameOf = (b) => (b.getAttribute('aria-label') ?? b.textContent).trim();
const buttons = (root) => [...root.querySelectorAll('button')];
function button(root, re) {
  const found = buttons(root).filter((b) => re.test(nameOf(b)));
  if (found.length !== 1) throw new Error(`expected 1 button matching ${re}, got ${found.length}: ${buttons(root).map(nameOf).join(' | ')}`);
  return found[0];
}
const token = (root, name) => button(root, new RegExp(`^${name},`));
const station = (root, jobName) => button(root, new RegExp(`^${jobName}:`));
const hint = (root) => root.querySelector('[role="status"]').textContent;
const tap = (b) => b.click();
// The area (section) whose heading reads `title`.
const area = (root, title) => [...root.querySelectorAll('section')].find((s) => s.querySelector('h3')?.textContent === title);
// The station container (button's card) a token currently sits in, named by its station button.
function whereIs(root, name) {
  const t = token(root, name);
  const card = buttons(root).find((b) => /^[^,]+:/.test(nameOf(b)) && b.closest('.om-station') === t.closest('.om-station'));
  return card ? nameOf(card).split(':')[0] : null;
}

afterEach(() => { document.body.innerHTML = ''; });

describe('API', () => {
  it('returns { el, set } with a DOM element', () => {
    const { map } = mount();
    expect(map.el).toBeInstanceOf(HTMLElement);
    expect(typeof map.set).toBe('function');
    expect(Object.keys(map).sort()).toEqual(['el', 'set']);
  });

  it('throws when no job is the shelter', () => {
    expect(() => createOutpostMap({ jobs: { lab: JOBS.lab }, crew: CREW() })).toThrow(/shelter/);
  });

  it('works without onChange / onInfo and does not crash with no AudioContext', () => {
    expect(window.AudioContext).toBeUndefined(); // jsdom has no Web Audio
    const map = createOutpostMap({ jobs: JOBS, crew: CREW() });
    tap(token(map.el, 'Ana'));
    expect(() => tap(station(map.el, 'Lab'))).not.toThrow();
    expect(whereIs(map.el, 'Ana')).toBe('Lab');
  });

  it('does not crash when AudioContext exists but throws', () => {
    window.AudioContext = function () { throw new Error('no audio device'); };
    try {
      const { root, changes } = mount();
      tap(token(root, 'Ana'));
      tap(station(root, 'Lab'));
      expect(changes).toEqual([{ ana: 'lab', ben: 'shelter', cai: 'shelter' }]);
    } finally { delete window.AudioContext; }
  });

  it('missing crew in placements count as in the Shelter', () => {
    const { root } = mount({ placements: { ana: 'lab' } });
    expect(whereIs(root, 'Ana')).toBe('Lab');
    expect(whereIs(root, 'Ben')).toBe('Shelter');
    expect(whereIs(root, 'Cai')).toBe('Shelter');
    expect(nameOf(token(root, 'Ben'))).toMatch(/at Shelter/);
  });

  it('unknown job ids count as in the Shelter', () => {
    const { root } = mount({ placements: { ana: 'moon' } });
    expect(whereIs(root, 'Ana')).toBe('Shelter');
  });

  it('onChange gets the full new placements after every change', () => {
    const { root, changes } = mount({ placements: { ana: 'lab', ben: 'solar', cai: 'shelter' } });
    tap(token(root, 'Cai'));
    tap(station(root, 'Rover trip'));
    expect(changes).toEqual([{ ana: 'lab', ben: 'solar', cai: 'rover' }]);
    tap(token(root, 'Ana'));
    tap(station(root, 'Recycler'));
    expect(changes[1]).toEqual({ ana: 'recycler', ben: 'solar', cai: 'rover' });
    // Emitted objects are copies: mutating one does not change the map.
    changes[1].ana = 'pump';
    expect(whereIs(root, 'Ana')).toBe('Recycler');
  });

  it('onInfo: each station has a help button that calls it with the job id', () => {
    const { root, infos } = mount();
    for (const [id, job] of Object.entries(JOBS)) {
      tap(button(root, new RegExp(`^What is ${job.name}\\?`)));
      expect(infos.at(-1)).toBe(id);
    }
    expect(infos).toHaveLength(Object.keys(JOBS).length);
  });

  it('no help buttons without onInfo', () => {
    const { root } = mount({ onInfo: undefined });
    expect(buttons(root).filter((b) => /^What is/.test(nameOf(b)))).toHaveLength(0);
  });

  it('set(placements) redraws without calling onChange', () => {
    const { map, root, changes } = mount();
    map.set({ ana: 'solar', ben: 'pump' });
    expect(changes).toEqual([]);
    expect(whereIs(root, 'Ana')).toBe('Solar Field');
    expect(whereIs(root, 'Ben')).toBe('Water Wall pump');
    expect(whereIs(root, 'Cai')).toBe('Shelter');
    expect(nameOf(station(root, 'Solar Field'))).toMatch(/Ana is here/);
    // Later changes build on the set placements.
    tap(token(root, 'Cai'));
    tap(station(root, 'Solar Field'));
    expect(changes).toEqual([{ ana: 'shelter', ben: 'pump', cai: 'solar' }]);
  });

  it('works with a custom jobs object (shelter found by where, not by id)', () => {
    const jobs = {
      dig: { name: 'Dig Site', where: 'outside' },
      kitchen: { name: 'Kitchen', where: 'inside' },
      bunker: { name: 'Bunker', where: 'shelter' },
    };
    const { root, changes } = mount({ jobs, onInfo: undefined });
    expect(whereIs(root, 'Ana')).toBe('Bunker');
    expect(within(area(root, 'Outside'), /^Dig Site:/)).toBe(true);
    expect(within(area(root, 'Inside the base'), /^Kitchen:/)).toBe(true);
    expect(within(area(root, 'Inside the base'), /^Bunker:/)).toBe(true);
    tap(token(root, 'Ana'));
    tap(station(root, 'Dig Site'));
    tap(token(root, 'Ben'));
    tap(station(root, 'Dig Site'));
    expect(changes.at(-1)).toEqual({ ana: 'bunker', ben: 'dig', cai: 'bunker' });
    expect(whereIs(root, 'Ana')).toBe('Bunker');
  });

  it('custom jobs with no outside job have no Outside area', () => {
    const { root } = mount({ jobs: { lab: JOBS.lab, home: { name: 'Bunker', where: 'shelter' } } });
    expect(area(root, 'Outside')).toBeUndefined();
    expect(within(area(root, 'Inside the base'), /^Lab:/)).toBe(true);
  });
});

const within = (section, re) => !!section && buttons(section).some((b) => re.test(nameOf(b)));

describe('stations and astronauts', () => {
  it('one station per job, in the area matching where; Shelter inside', () => {
    const { root } = mount();
    const outside = area(root, 'Outside');
    const inside = area(root, 'Inside the base');
    for (const job of Object.values(JOBS)) {
      const re = new RegExp(`^${job.name}:`);
      expect(buttons(root).filter((b) => re.test(nameOf(b)))).toHaveLength(1);
      expect(within(outside, re)).toBe(job.where === 'outside');
      expect(within(inside, re)).toBe(job.where !== 'outside');
    }
    // Each station shows its name as visible text.
    for (const job of Object.values(JOBS)) expect(station(root, job.name).textContent).toContain(job.name);
  });

  it('each astronaut shows name and sunburn N/100', () => {
    const { root } = mount();
    expect(token(root, 'Ana').textContent).toMatch(/Ana.*sunburn 12\/100/);
    expect(token(root, 'Ben').textContent).toMatch(/Ben.*sunburn 40\/100/);
    expect(token(root, 'Cai').textContent).toMatch(/Cai.*sunburn 0\/100/);
  });

  it('sunburn limit comes from doseLimit', () => {
    const { root } = mount({ doseLimit: 50 });
    expect(token(root, 'Ben').textContent).toMatch(/sunburn 40\/50/);
    expect(nameOf(token(root, 'Ben'))).toMatch(/sunburn 40\/50/);
  });
});

describe('tap-then-tap placing', () => {
  it('select an astronaut, then a station', () => {
    const { root, changes } = mount();
    expect(hint(root)).toMatch(/tap an astronaut/i);
    const ana = token(root, 'Ana');
    expect(ana.getAttribute('aria-pressed')).toBe('false');
    tap(ana);
    expect(ana.getAttribute('aria-pressed')).toBe('true');
    expect(token(root, 'Ben').getAttribute('aria-pressed')).toBe('false');
    expect(hint(root)).toMatch(/tap a job for Ana/i);
    tap(station(root, 'Lab'));
    expect(changes).toEqual([{ ana: 'lab', ben: 'shelter', cai: 'shelter' }]);
    expect(whereIs(root, 'Ana')).toBe('Lab');
    expect(token(root, 'Ana').getAttribute('aria-pressed')).toBe('false');
    expect(hint(root)).toMatch(/Ana is at Lab/);
  });

  it('tapping the selected astronaut again cancels', () => {
    const { root, changes } = mount();
    tap(token(root, 'Ana'));
    tap(token(root, 'Ana'));
    expect(token(root, 'Ana').getAttribute('aria-pressed')).toBe('false');
    tap(station(root, 'Lab'));
    expect(changes).toEqual([]);
    expect(whereIs(root, 'Ana')).toBe('Shelter');
  });

  it('tapping another astronaut switches the selection', () => {
    const { root, changes } = mount();
    tap(token(root, 'Ana'));
    tap(token(root, 'Ben'));
    expect(token(root, 'Ana').getAttribute('aria-pressed')).toBe('false');
    expect(token(root, 'Ben').getAttribute('aria-pressed')).toBe('true');
    tap(station(root, 'Lab'));
    expect(changes).toEqual([{ ana: 'shelter', ben: 'lab', cai: 'shelter' }]);
  });

  it('tapping a station with nobody selected does nothing but explain', () => {
    const { root, changes } = mount();
    tap(station(root, 'Lab'));
    expect(changes).toEqual([]);
    expect(hint(root)).toMatch(/tap an astronaut first/i);
  });

  it('placing on the station they are already at does not call onChange', () => {
    const { root, changes } = mount({ placements: { ana: 'lab' } });
    tap(token(root, 'Ana'));
    tap(station(root, 'Lab'));
    expect(changes).toEqual([]);
    expect(hint(root)).toMatch(/stays/i);
  });
});

describe('one astronaut per job, Shelter holds any number', () => {
  it('placing on a taken job moves the other astronaut to the Shelter', () => {
    const { root, changes } = mount({ placements: { ana: 'lab', ben: 'solar' } });
    tap(token(root, 'Ben'));
    tap(station(root, 'Lab'));
    expect(changes).toEqual([{ ana: 'shelter', ben: 'lab', cai: 'shelter' }]);
    expect(whereIs(root, 'Ana')).toBe('Shelter');
    expect(whereIs(root, 'Ben')).toBe('Lab');
    expect(hint(root)).toMatch(/Ana went to the Shelter/);
  });

  it('the Shelter holds everyone and never bumps', () => {
    const { root, changes } = mount({ placements: { ana: 'lab', ben: 'solar', cai: 'rover' } });
    for (const n of ['Ana', 'Ben', 'Cai']) { tap(token(root, n)); tap(station(root, 'Shelter')); }
    expect(changes.at(-1)).toEqual({ ana: 'shelter', ben: 'shelter', cai: 'shelter' });
    for (const n of ['Ana', 'Ben', 'Cai']) expect(whereIs(root, n)).toBe('Shelter');
    expect(nameOf(station(root, 'Shelter'))).toMatch(/Ana and Ben and Cai are here/);
  });
});

describe('astronauts who went home', () => {
  const crew = () => [...CREW().slice(0, 2), { id: 'cai', name: 'Cai', dose: 100, home: true }];

  it('are shown as gone home and cannot be selected or placed', () => {
    const { root, changes } = mount({ crew: crew(), placements: { ana: 'lab', cai: 'solar' } });
    const cai = token(root, 'Cai');
    expect(nameOf(cai)).toMatch(/went home/);
    expect(cai.textContent).toMatch(/went home/);
    expect(cai.getAttribute('aria-disabled')).toBe('true');
    expect(within(area(root, 'Went home'), /^Cai,/)).toBe(true);
    expect(cai.closest('.om-station')).toBeNull(); // not on any station
    expect(nameOf(station(root, 'Solar Field'))).toMatch(/nobody here/);
    tap(cai);
    expect(cai.getAttribute('aria-pressed')).not.toBe('true');
    expect(hint(root)).toMatch(/Cai went home/);
    tap(station(root, 'Rover trip'));
    expect(changes).toEqual([]);
  });

  it('do not block a job (no bump of a stale home placement)', () => {
    const { root, changes } = mount({ crew: crew(), placements: { cai: 'solar' } });
    tap(token(root, 'Ana'));
    tap(station(root, 'Solar Field'));
    expect(changes).toEqual([{ ana: 'solar', ben: 'shelter' }]);
    expect(normalisePlacements({ crew: crew() }, changes[0])).toEqual({ ana: 'solar', ben: 'shelter' });
  });

  it('when everyone went home the hint says so', () => {
    const all = CREW().map((c) => ({ ...c, home: true }));
    const { root } = mount({ crew: all });
    expect(hint(root)).toMatch(/everyone went home/i);
  });
});

describe('accessibility', () => {
  it('every station, astronaut and help control is a <button> with a name', () => {
    const { root } = mount({ crew: [...CREW(), { id: 'dee', name: 'Dee', dose: 100, home: true }] });
    const all = buttons(root);
    // 6 stations + 6 help + 4 astronauts
    expect(all).toHaveLength(16);
    for (const b of all) {
      expect(b.getAttribute('type')).toBe('button');
      expect(nameOf(b).length).toBeGreaterThan(0);
    }
    // No clickable non-buttons.
    expect(root.querySelectorAll('[onclick], [role="button"], [tabindex]')).toHaveLength(0);
  });

  it('where each astronaut is can be read as text', () => {
    const { root } = mount({ placements: { ana: 'rover' } });
    expect(nameOf(token(root, 'Ana'))).toMatch(/at Rover trip/);
    expect(nameOf(token(root, 'Ben'))).toMatch(/at Shelter/);
    expect(nameOf(station(root, 'Rover trip'))).toMatch(/Ana is here/);
    expect(nameOf(station(root, 'Lab'))).toMatch(/nobody here/);
  });
});

describe('fix cycle 1: onChange emits one entry per astronaut on Mars', () => {
  it('from empty placements, placing Ana emits all active crew', () => {
    const { root, changes } = mount({ placements: {} });
    tap(token(root, 'Ana'));
    tap(station(root, 'Lab'));
    expect(changes).toEqual([{ ana: 'lab', ben: 'shelter', cai: 'shelter' }]);
  });

  it('leaves out crew who went home and unknown crew ids', () => {
    const crew = [...CREW().slice(0, 2), { id: 'cai', name: 'Cai', dose: 100, home: true }];
    const { root, changes } = mount({ crew, placements: { cai: 'rover', zed: 'pump', ben: 'moon' } });
    tap(token(root, 'Ben'));
    tap(station(root, 'Rover trip'));
    expect(changes).toEqual([{ ana: 'shelter', ben: 'rover' }]);
  });

  it('every emit has exactly the active ids, after several moves', () => {
    const { root, changes } = mount();
    for (const [n, job] of [['Ana', 'Lab'], ['Ben', 'Lab'], ['Cai', 'Solar Field'], ['Ana', 'Rover trip']]) {
      tap(token(root, n));
      tap(station(root, job));
    }
    expect(changes).toHaveLength(4);
    for (const out of changes) expect(Object.keys(out).sort()).toEqual(['ana', 'ben', 'cai']);
    expect(changes.at(-1)).toEqual({ ana: 'rover', ben: 'lab', cai: 'solar' });
  });
});

describe('fix cycle 1: the map normalises initial placements and set() input', () => {
  const crew3 = () => [...CREW().slice(0, 2), { id: 'cai', name: 'Cai', dose: 100, home: true }];

  it('duplicates: the first in crew order keeps the job, not the first key', () => {
    const placements = { cai: 'lab', ben: 'lab', ana: 'lab' };
    const { root } = mount({ placements });
    expect(shown(root, CREW())).toEqual({ ana: 'lab', ben: 'shelter', cai: 'shelter' });
    expect(shown(root, CREW())).toEqual(normalisePlacements({ crew: CREW() }, placements));
    expect(nameOf(station(root, 'Lab'))).toMatch(/^Lab: Ana is here\.$/);
  });

  it('went-home crew are left out: their old job shows as free', () => {
    const { root, changes } = mount({ crew: crew3(), placements: { cai: 'solar', ana: 'lab' } });
    expect(nameOf(station(root, 'Solar Field'))).toMatch(/nobody here/);
    expect(station(root, 'Solar Field').textContent).toMatch(/Free/);
    expect(shown(root, crew3())).toEqual({ ana: 'lab', ben: 'shelter' });
    expect(changes).toEqual([]);
  });

  it('missing and unknown job ids become the Shelter', () => {
    const { root } = mount({ placements: { ana: 'moon', ben: null } });
    expect(shown(root, CREW())).toEqual({ ana: 'shelter', ben: 'shelter', cai: 'shelter' });
  });

  it.each(['constructor', 'toString', 'hasOwnProperty', '__proto__', 'valueOf'])(
    'prototype name %s as a job id shows the astronaut in the Shelter without crashing', (bad) => {
      const { root, map, changes } = mount({ placements: { ana: bad, ben: 'lab' } });
      expect(shown(root, CREW())).toEqual({ ana: 'shelter', ben: 'lab', cai: 'shelter' });
      map.set({ ana: 'lab', ben: bad });
      expect(shown(root, CREW())).toEqual({ ana: 'lab', ben: 'shelter', cai: 'shelter' });
      tap(token(root, 'Cai'));
      tap(station(root, 'Rover trip'));
      expect(changes).toEqual([{ ana: 'lab', ben: 'shelter', cai: 'rover' }]);
    });

  it('placements inherited from the prototype chain are ignored', () => {
    const placements = Object.create({ ana: 'lab' });
    const { root } = mount({ placements });
    expect(whereIs(root, 'Ana')).toBe('Shelter');
  });

  it('set() normalises too: duplicates, went-home and unknown', () => {
    const { root, map, changes } = mount({ crew: crew3() });
    map.set({ ben: 'pump', ana: 'pump', cai: 'lab', zed: 'lab' });
    expect(shown(root, crew3())).toEqual({ ana: 'pump', ben: 'shelter' });
    expect(nameOf(station(root, 'Lab'))).toMatch(/nobody here/);
    expect(changes).toEqual([]);
  });
});

describe('fix cycle 1: set() with what is already shown does nothing', () => {
  it('echoing onChange back into set() keeps the bump hint', () => {
    let map;
    const changes = [];
    map = createOutpostMap({ jobs: JOBS, crew: CREW(), placements: { ana: 'lab' }, onChange: (p) => { changes.push(p); map.set(p); } });
    document.body.append(map.el);
    tap(token(map.el, 'Ben'));
    tap(station(map.el, 'Lab'));
    expect(changes).toEqual([{ ana: 'shelter', ben: 'lab', cai: 'shelter' }]);
    expect(hint(map.el)).toBe('Ben is at Lab. Ana went to the Shelter.');
    expect(whereIs(map.el, 'Ana')).toBe('Shelter');
  });

  it('an equivalent but differently written set() leaves the hint alone', () => {
    const { root, map } = mount({ placements: { ana: 'lab' } });
    tap(station(root, 'Lab')); // nobody picked: hint explains
    const before = hint(root);
    expect(before).toMatch(/tap an astronaut first/i);
    map.set({ ana: 'lab', ben: 'moon', zed: 'solar' }); // normalises to what is shown
    expect(hint(root)).toBe(before);
  });

  it('a set() that changes placements does redraw', () => {
    const { root, map } = mount({ placements: { ana: 'lab' } });
    tap(station(root, 'Lab'));
    map.set({ ana: 'solar' });
    expect(whereIs(root, 'Ana')).toBe('Solar Field');
    expect(hint(root)).not.toMatch(/tap an astronaut first/i);
  });
});

describe('fix cycle 1: station pictures', () => {
  const pic = (b) => b.querySelector('svg');

  it('every station button has an aria-hidden inline SVG next to its visible name', () => {
    const { root } = mount();
    for (const job of Object.values(JOBS)) {
      const b = station(root, job.name);
      const svgs = b.querySelectorAll('svg');
      expect(svgs).toHaveLength(1);
      expect(svgs[0].getAttribute('aria-hidden')).toBe('true');
      expect(svgs[0].children.length).toBeGreaterThan(0);
      expect(b.textContent).toContain(job.name); // name still visible text
      expect(nameOf(b)).toMatch(new RegExp(`^${job.name}: (nobody|\\w+ (and \\w+ )*(is|are)) here\\.$`));
    }
  });

  it('known jobs get distinct pictures', () => {
    const { root } = mount();
    const drawn = Object.values(JOBS).map((j) => pic(station(root, j.name)).innerHTML);
    expect(new Set(drawn).size).toBe(drawn.length);
  });

  it('unknown job ids (incl. prototype names) get the same fallback picture', () => {
    const jobs = {
      dig: { name: 'Dig Site', where: 'outside' },
      constructor: { name: 'Builder', where: 'inside' },
      bunker: { name: 'Bunker', where: 'shelter' },
    };
    const { root, changes } = mount({ jobs, onInfo: undefined });
    const dig = pic(station(root, 'Dig Site'));
    const builder = pic(station(root, 'Builder'));
    expect(dig.getAttribute('aria-hidden')).toBe('true');
    expect(dig.children.length).toBeGreaterThan(0);
    expect(builder.innerHTML).toBe(dig.innerHTML);
    // A real job id named 'constructor' still works as a job.
    tap(token(root, 'Ana'));
    tap(station(root, 'Builder'));
    expect(changes).toEqual([{ ana: 'constructor', ben: 'bunker', cai: 'bunker' }]);
    expect(whereIs(root, 'Ana')).toBe('Builder');
    // Different from every known picture.
    const known = mount().root;
    for (const j of Object.values(JOBS)) expect(pic(station(known, j.name)).innerHTML).not.toBe(dig.innerHTML);
  });
});

describe('module boundary', () => {
  it('imports nothing from src/sim (directly or through its imports)', () => {
    const seen = new Set();
    const walk = (file) => {
      if (seen.has(file)) return;
      seen.add(file);
      const src = readFileSync(file, 'utf8');
      for (const [, spec] of src.matchAll(/(?:import|export)[^'"]*?from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]/g)
        .map((m) => [m[0], m[1] ?? m[2] ?? m[3]])) {
        expect(spec.startsWith('.'), `${file} imports bare module ${spec}`).toBe(true);
        const target = resolve(dirname(file), spec);
        expect(target, `${file} imports ${spec}`).not.toMatch(/[\\/]src[\\/]sim[\\/]/);
        if (target.endsWith('.js')) walk(target);
      }
    };
    walk(resolve(import.meta.dirname, '../../src/ui/map/index.js'));
    expect(seen.size).toBeGreaterThan(1); // the walker actually followed imports
  });
});

describe('the rules accept everything the map emits', () => {
  // Small deterministic RNG so failures replay.
  const rng = (seed) => () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
  // Prototype names ('constructor') are left out here: normalisePlacements keeps them (see its own test below).
  const ids = [...Object.keys(JOBS), 'lab', 'solar', 'moon', undefined];
  const pickOf = (r, list) => list[Math.floor(r() * list.length)];
  // Raw placements: random jobs (duplicates likely), unknown ids, went-home crew, a stranger, random key order.
  function rawPlacements(r, crew) {
    const entries = [...crew.map((c) => c.id), 'zed'].filter(() => r() < 0.9).map((id) => [id, pickOf(r, ids)]);
    entries.sort(() => r() - 0.5);
    return Object.fromEntries(entries);
  }

  it('starting from RAW placements: shows normalisePlacements(raw), and every emit is left unchanged by it', () => {
    let emitted = 0;
    let sets = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const r = rng(seed);
      const crew = CREW().map((c) => ({ ...c, home: r() < 0.2 }));
      const state = { crew };
      const activeIds = crew.filter((c) => !c.home).map((c) => c.id).sort();
      const raw = rawPlacements(r, crew);
      const { root, changes, map } = mount({ crew, placements: raw });
      const ctx = `seed ${seed}`;
      expect(shown(root, crew), `${ctx} mount ${JSON.stringify(raw)}`).toEqual(normalisePlacements(state, raw));
      for (let i = 0; i < 25; i++) {
        const before = changes.length;
        if (r() < 0.1) {
          const next = rawPlacements(r, crew);
          map.set(next);
          sets++;
          expect(shown(root, crew), `${ctx} set ${JSON.stringify(next)}`).toEqual(normalisePlacements(state, next));
        }
        tap(pickOf(r, buttons(root)));
        if (changes.length > before) {
          const out = changes.at(-1);
          emitted++;
          expect(Object.keys(out).sort(), `${ctx} keys`).toEqual(activeIds);
          expect(normalisePlacements(state, out), `${ctx} ${JSON.stringify(out)}`).toEqual(out);
          expect(shown(root, crew), `${ctx} drawn`).toEqual(out);
        }
      }
      document.body.innerHTML = '';
    }
    expect(emitted).toBeGreaterThan(300); // the random play really placed people
    expect(sets).toBeGreaterThan(300);
  });
});

// What the map shows: { crewId: jobId } for crew still on Mars, read from the DOM.
function shown(root, crew, jobs = JOBS) {
  const idByName = Object.fromEntries(Object.entries(jobs).map(([id, j]) => [j.name, id]));
  return Object.fromEntries(crew.filter((c) => !c.home).map((c) => [c.id, idByName[whereIs(root, c.name)]]));
}
