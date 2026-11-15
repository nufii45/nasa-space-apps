// @vitest-environment jsdom
// Screen views (src/ui/screens): Sol result, mission report, resume prompt. Pure views driven with stub models.
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render as solResult } from '../../src/ui/screens/solResult.js';
import { render as report } from '../../src/ui/screens/report.js';
import { render as resume } from '../../src/ui/screens/resume.js';

afterEach(() => { document.body.innerHTML = ''; });

const text = (n) => n.textContent.replace(/\s+/g, ' ').trim();
const buttons = (root) => [...root.querySelectorAll('button')];
const button = (root, name) => {
  const found = buttons(root).filter((b) => text(b) === name);
  if (found.length !== 1) throw new Error(`expected 1 button "${name}", got: ${buttons(root).map(text).join(' | ')}`);
  return found[0];
};
const mount = (view) => { document.body.append(view.el); return view; };
const calls = (...names) => {
  const log = [];
  return { log, handlers: Object.fromEntries(names.map((n) => [n, () => log.push(n)])) };
};
const enter = (target) => target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
const heading = (root) => root.querySelector('h1, h2');

const SOL = {
  sol: 3,
  date: '6 Sep 2017',
  changes: [
    { text: '+5 power', why: 'Ana cleaned the Solar Field.', dir: 'up' },
    { text: '−2 water', why: 'The crew drank.', dir: 'down' },
    { text: '+6 science', why: 'Ben did experiments in the Lab.', dir: 'up' },
  ],
  doses: [{ name: 'Ana', before: 26, after: 46 }, { name: 'Ben', before: 10, after: 15, limit: 50 }],
  isLast: false,
};

describe('Sol result (W2)', () => {
  it('lists only the changes it is given, each with its word and why', () => {
    const { el } = mount(solResult(SOL, {}));
    const lines = [...el.querySelectorAll('li')].map(text);
    expect(lines.slice(0, 3)).toEqual([
      '+5 power Ana cleaned the Solar Field.',
      '−2 water The crew drank.',
      '+6 science Ben did experiments in the Lab.',
    ]);
    expect(el.querySelector('.sc-up').textContent).toBe('+5 power');
    expect([...el.querySelectorAll('.sc-down')].map(text)[0]).toBe('−2 water');
  });

  it('one line per astronaut dose, with a meter from before to after', () => {
    const { el } = mount(solResult(SOL, {}));
    const doses = [...el.querySelectorAll('.sc-dose')];
    expect(doses).toHaveLength(2);
    expect(text(doses[0])).toMatch(/^Ana \+20 radiation 26 → 46\/100$/);
    expect(text(doses[1])).toMatch(/^Ben \+5 radiation 10 → 15\/50$/);
    const meter = doses[0].querySelector('[role="img"]');
    expect(meter.getAttribute('aria-label')).toBe('Ana: radiation went from 26 to 46 out of 100.');
    expect(meter.querySelector('.sc-meter-before').style.width).toBe('26%');
    expect(meter.querySelector('.sc-meter-added').style.left).toBe('26%');
    expect(meter.querySelector('.sc-meter-added').style.width).toBe('20%');
  });

  it('no changes and no doses: no lines', () => {
    const { el } = mount(solResult({ sol: 1, changes: [], doses: [] }, {}));
    expect(el.querySelectorAll('li')).toHaveLength(0);
  });

  it('heading is an h2 with tabindex -1 and the sol number; shows the real date', () => {
    const { el } = mount(solResult(SOL, {}));
    const h = heading(el);
    expect(h.tagName).toBe('H2');
    expect(h.getAttribute('tabindex')).toBe('-1');
    expect(text(h)).toBe('Sol 3 done');
    expect(text(el)).toContain('Real sky: 6 Sep 2017');
  });

  it('NEXT SOL is the only button and calls onNext', () => {
    const { log, handlers } = calls('onNext');
    const { el } = mount(solResult(SOL, handlers));
    expect(buttons(el)).toHaveLength(1);
    button(el, 'NEXT SOL →').click();
    expect(log).toEqual(['onNext']);
  });

  it('Enter anywhere on the card calls onNext once (heading, a line, the button)', () => {
    const { log, handlers } = calls('onNext');
    const { el } = mount(solResult(SOL, handlers));
    enter(heading(el));
    expect(log).toHaveLength(1);
    enter(el.querySelector('.sc-dose'));
    expect(log).toHaveLength(2);
    // On the button the browser turns Enter into a click; the card must not call onNext a second time.
    enter(button(el, 'NEXT SOL →'));
    expect(log).toHaveLength(2);
    el.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(log).toHaveLength(2);
  });

  it('update(model) redraws with the new model', () => {
    const view = mount(solResult(SOL, {}));
    view.update({ sol: 4, date: '7 Sep 2017', changes: [{ text: '+1 power', why: 'Sunny.', dir: 'up' }], doses: [] });
    expect(text(heading(view.el))).toBe('Sol 4 done');
    expect([...view.el.querySelectorAll('li')].map(text)).toEqual(['+1 power Sunny.']);
    expect(text(view.el)).toContain('7 Sep 2017');
  });
});

const REPORT = {
  win: { ending: 'win', stars: 2, reason: 'You reached 100 science, and the whole crew stayed safe.', science: 100 },
  home: { ending: 'home', stars: 0, reason: 'The water ran out 2 sols in a row.', science: 42 },
  time: { ending: 'time', stars: 0, reason: 'You got 72 of 100 science. So close!', science: 72 },
};
const base = {
  sky: { start: '2017-09-05', end: '2017-09-14' },
  storms: [{ label: 'Sun flash (flare class X9.3)', date: '2017-09-06' }, { label: 'Sun flash (flare class X8.2)', date: '2017-09-10' }],
  tip: 'Keep someone on the Recycler before the water gets low.',
  sept2017: false,
};

describe('Mission report (W3)', () => {
  const HEADLINES = { win: 'Mission complete!', home: 'The crew had to go home', time: "Time's up: the supply ship is here" };

  it.each(Object.keys(REPORT))('%s: its own headline, the reason, colour class and picture', (ending) => {
    const { el } = mount(report({ ...base, ...REPORT[ending] }, {}));
    const h = heading(el);
    expect(h.tagName).toBe('H2');
    expect(h.getAttribute('tabindex')).toBe('-1');
    expect(text(h)).toBe(HEADLINES[ending]);
    expect(text(el.querySelector('.sc-reason'))).toBe(REPORT[ending].reason);
    expect(el.classList.contains(`sc-${ending}`)).toBe(true);
    const svg = el.querySelector('svg');
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(text(el)).toContain(`Science: ${REPORT[ending].science}/100`);
  });

  it('the three endings have three different pictures and headlines', () => {
    const drawn = Object.values(REPORT).map((m) => mount(report({ ...base, ...m }, {})).el);
    expect(new Set(drawn.map((e) => e.querySelector('svg').innerHTML)).size).toBe(3);
    expect(new Set(drawn.map((e) => text(heading(e)))).size).toBe(3);
  });

  it('win shows the stars as text with a spoken label; other endings show none', () => {
    const win = mount(report({ ...base, ...REPORT.win }, {})).el;
    const stars = win.querySelector('.sc-stars');
    expect(stars.textContent).toBe('★★☆');
    expect(stars.getAttribute('aria-label')).toBe('2 of 3 stars');
    expect(mount(report({ ...base, ...REPORT.home }, {})).el.querySelector('.sc-stars')).toBeNull();
  });

  it('shows the sky dates, every storm and the tip', () => {
    const { el } = mount(report({ ...base, ...REPORT.time, scienceGoal: 120 }, {}));
    const t = text(el);
    expect(t).toContain('Science: 72/120');
    expect(t).toContain('Your sky: 2017-09-05 to 2017-09-14');
    expect(t).toContain('2 storms reached the base:');
    expect([...el.querySelectorAll('.sc-receipt li')].map(text)).toEqual([
      'Sun flash (flare class X9.3) · 2017-09-06',
      'Sun flash (flare class X8.2) · 2017-09-10',
    ]);
    expect(t).toContain('Tip: Keep someone on the Recycler before the water gets low.');
  });

  it('no storms: says the Sun was quiet; a tip that already says Tip: is not doubled', () => {
    const { el } = mount(report({ ...base, ...REPORT.win, storms: [], tip: 'Tip: share the rover.' }, {}));
    expect(text(el)).toContain('The Sun was quiet that week.');
    expect(text(el)).toContain('Tip: share the rover.');
    expect(text(el)).not.toMatch(/Tip: Tip:/);
  });

  it('sept2017 adds the September 2017 story with its NASA link', () => {
    const plain = mount(report({ ...base, ...REPORT.win }, {})).el;
    expect(plain.querySelector('a')).toBeNull();
    expect(text(plain)).not.toContain('September 2017');
    const { el } = mount(report({ ...base, ...REPORT.win, sept2017: true }, {}));
    expect(text(el)).toContain('In September 2017 a big solar storm hit Mars.');
    const a = el.querySelector('a');
    expect(a.href).toBe('https://www.jpl.nasa.gov/news/large-solar-storm-sparks-global-aurora-and-doubles-radiation-levels-on-the-martian-surface/');
    expect(a.textContent).toBe('Read the NASA story');
    expect(a.getAttribute('rel')).toBe('noopener');
  });

  it('Try again, Change mission and Title call their handlers', () => {
    const { log, handlers } = calls('onTryAgain', 'onChangeMission', 'onTitle');
    const { el } = mount(report({ ...base, ...REPORT.home }, handlers));
    expect(buttons(el).map(text)).toEqual(['Try again', 'Change mission', 'Title']);
    button(el, 'Try again').click();
    button(el, 'Change mission').click();
    button(el, 'Title').click();
    expect(log).toEqual(['onTryAgain', 'onChangeMission', 'onTitle']);
  });

  it('update(model) redraws with a new ending', () => {
    const { log, handlers } = calls('onTitle');
    const view = mount(report({ ...base, ...REPORT.win }, handlers));
    view.update({ ...base, ...REPORT.home, storms: [] });
    expect(text(heading(view.el))).toBe('The crew had to go home');
    expect(view.el.classList.contains('sc-home')).toBe(true);
    expect(view.el.classList.contains('sc-win')).toBe(false);
    expect(view.el.querySelector('.sc-stars')).toBeNull();
    button(view.el, 'Title').click();
    expect(log).toEqual(['onTitle']);
  });
});

describe('Resume prompt (W4)', () => {
  const MODEL = { sol: 4, missionLabel: 'Sept 2017', modeLabel: 'Commander' };

  it('asks to resume, with the line built from the model', () => {
    const { el } = mount(resume(MODEL, {}));
    const h = heading(el);
    expect(h.tagName).toBe('H2');
    expect(h.getAttribute('tabindex')).toBe('-1');
    expect(text(h)).toBe('Resume your mission?');
    expect(text(el.querySelector('p'))).toBe('Sol 4 of 10 · Sept 2017 · Commander');
  });

  it('Resume and Start over call their handlers', () => {
    const { log, handlers } = calls('onResume', 'onStartOver');
    const { el } = mount(resume(MODEL, handlers));
    expect(buttons(el).map(text)).toEqual(['Resume', 'Start over']);
    button(el, 'Resume').click();
    button(el, 'Start over').click();
    expect(log).toEqual(['onResume', 'onStartOver']);
  });

  it('update(model) redraws, and totalSols overrides 10', () => {
    const view = mount(resume(MODEL, {}));
    view.update({ sol: 2, missionLabel: 'Random week', modeLabel: 'Cadet', totalSols: 12 });
    expect(text(view.el.querySelector('p'))).toBe('Sol 2 of 12 · Random week · Cadet');
  });
});

describe('all views', () => {
  it('every button is type=button, and nothing is imported from src/sim', () => {
    for (const view of [solResult(SOL, {}), report({ ...base, ...REPORT.win }, {}), resume({ sol: 1, missionLabel: 'x', modeLabel: 'y' }, {})]) {
      for (const b of buttons(view.el)) expect(b.getAttribute('type')).toBe('button');
    }
    for (const f of ['solResult', 'report', 'resume']) {
      const src = readFileSync(resolve(import.meta.dirname, `../../src/ui/screens/${f}.js`), 'utf8');
      const imports = [...src.matchAll(/from\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
      expect(imports, f).toEqual(['../console/util.js']);
    }
  });
});
