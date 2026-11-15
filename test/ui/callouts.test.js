// @vitest-environment jsdom
// Stage callouts (src/ui/stage/callouts.js), driven against a stub stage with simulated clicks.
import { describe, it, expect, afterEach } from 'vitest';
import { createCallouts } from '../../src/ui/stage/callouts.js';

const STATIONS = [
  { id: 'recycler', title: 'Recycler', text: 'Cleans water so the crew can drink it again.', icon: 'M4 12h16' },
  { id: 'shelter', title: 'Shelter', text: 'Safest place in a storm. Rest here.', icon: 'M12 3l8 3v6z' },
  { id: 'lab', title: 'Lab', text: 'Do experiments to earn science.', icon: 'M9 3h6' },
  { id: 'pump', title: 'Water Wall pump', text: 'Moves water into the Shelter walls to block radiation.', icon: 'M12 3c4 5 6 8 6 11z' },
  { id: 'solar', title: 'Solar Field', text: 'Makes power from sunlight.', icon: 'M8 12a4 4 0 1 0 8 0' },
  { id: 'rover', title: 'Rover trip', text: 'Drive far to study rocks.', icon: 'M4 14h16' },
];
const SPOTS = { solar: [473, 132], rover: [386, 262], recycler: [323, 156], pump: [402, 104], lab: [341, 284], shelter: [334, 99] };

// Stub of the lane 2 stage: an overlay inside el, movable hotspots and the stagechange event.
function stubStage() {
  const spots = structuredClone(SPOTS);
  const overlay = document.createElement('div');
  const el = document.createElement('div');
  el.append(overlay);
  document.body.append(el);
  return {
    el, overlay, spots,
    hotspots: () => Object.entries(spots).map(([id, [x, y]]) => ({ id, x, y })),
    move(id, x, y) { spots[id] = [x, y]; overlay.dispatchEvent(new CustomEvent('stagechange', { bubbles: true })); },
  };
}

function mount(opts = {}) {
  const stage = stubStage();
  const selects = [];
  const helps = [];
  const co = createCallouts({
    stage, stations: STATIONS, who: { solar: ['Ana'], shelter: ['Cai'] }, selected: null, picked: null, layout: 'desktop',
    onSelect: (id) => selects.push(id), onHelp: (id) => helps.push(id), ...opts,
  });
  return { stage, co, selects, helps };
}

const shown = (root) => [...root.querySelectorAll('.co-card')].filter((c) => !c.hidden);
const card = (root, id) => root.querySelector(`.co-card[data-id="${id}"]`);
const lines = (root) => [...root.querySelectorAll('line')].filter((l) => !l.closest('[hidden]'));
const line = (root, id) => root.querySelector(`line[data-id="${id}"]`);
const toggle = (root) => root.querySelector('.co-toggle');

afterEach(() => { document.body.innerHTML = ''; });

describe('desktop cards', () => {
  it('mounts into the stage overlay with a card per station: icon, UPPERCASE title, sentence, who', () => {
    const { stage, co } = mount();
    expect(co.el.parentNode).toBe(stage.overlay);
    expect(shown(co.el)).toHaveLength(6);
    for (const st of STATIONS) {
      const c = card(co.el, st.id);
      expect(c.querySelector('.co-title').textContent).toBe(st.title.toUpperCase());
      expect(c.querySelector('.co-text').textContent).toBe(st.text);
      expect(c.querySelector('.co-ic path').getAttribute('d')).toBe(st.icon);
    }
    expect(card(co.el, 'solar').querySelector('.co-who').textContent).toBe('Ana is here');
    expect(card(co.el, 'shelter').querySelector('.co-who').textContent).toMatch(/^Cai resting here/);
    expect(card(co.el, 'lab').querySelector('.co-who').textContent).toBe('Nobody here yet');
  });

  it('places cards in the Scene board slots', () => {
    const { co } = mount();
    expect(card(co.el, 'recycler').style.left).toBe('4px');
    expect(card(co.el, 'rover').style.left).toBe('660px');
    expect(card(co.el, 'rover').style.top).toBe('268px');
  });

  it('inserts station text as text, not HTML', () => {
    const { co } = mount({ stations: [{ id: 'lab', title: '<b>x</b>', text: '<img src=x onerror=alert(1)>', icon: '' }] });
    expect(co.el.querySelector('img, b')).toBeNull();
    expect(card(co.el, 'lab').querySelector('.co-text').textContent).toBe('<img src=x onerror=alert(1)>');
  });

  it('"?" is a labelled button that calls onHelp and does not select', () => {
    const { co, helps, selects } = mount();
    const help = card(co.el, 'pump').querySelector('.co-help');
    expect(help.tagName).toBe('BUTTON');
    expect(help.textContent).toBe('?');
    expect(help.getAttribute('aria-label')).toBe('Help: what does the Water Wall pump do?');
    help.click();
    expect(helps).toEqual(['pump']);
    expect(selects).toEqual([]);
  });

  it('clicking a card or its title button calls onSelect once', () => {
    const { co, selects } = mount();
    card(co.el, 'rover').querySelector('.co-text').click();
    card(co.el, 'lab').querySelector('.co-pick').click();
    expect(selects).toEqual(['rover', 'lab']);
  });

  it('marks the selected card with a word, not only colour', () => {
    const { co } = mount({ selected: 'rover' });
    const c = card(co.el, 'rover');
    expect(c.classList.contains('is-sel')).toBe(true);
    expect(c.querySelector('.co-mark').hidden).toBe(false);
    expect(c.querySelector('.co-mark').textContent).toBe('Selected');
    expect(c.querySelector('.co-pick').getAttribute('aria-current')).toBe('true');
    expect(card(co.el, 'lab').querySelector('.co-mark').hidden).toBe(true);
  });

  it('with an astronaut picked, free stations and the Shelter say "send your astronaut here"', () => {
    const { co } = mount({ picked: 'ben' });
    expect(card(co.el, 'lab').querySelector('.co-pick').getAttribute('aria-label')).toBe('Lab: send your astronaut here');
    expect(card(co.el, 'shelter').querySelector('.co-pick').getAttribute('aria-label')).toBe('Shelter: send your astronaut here');
    expect(card(co.el, 'solar').querySelector('.co-pick').getAttribute('aria-label')).toBe('Solar Field');
  });
});

describe('leader lines', () => {
  it('draws one dashed line per card, ending at its hotspot', () => {
    const { co } = mount();
    expect(lines(co.el)).toHaveLength(6);
    for (const [id, [x, y]] of Object.entries(SPOTS)) {
      const l = line(co.el, id);
      expect([l.getAttribute('x2'), l.getAttribute('y2')]).toEqual([String(x), String(y)]);
      expect(l.getAttribute('stroke-dasharray')).toBeTruthy();
    }
    // Left cards anchor on their right edge, right cards on their left edge.
    expect(line(co.el, 'recycler').getAttribute('x1')).toBe('200');
    expect(line(co.el, 'rover').getAttribute('x1')).toBe('660');
  });

  it('moves the lines when the stage fires stagechange', () => {
    const { stage, co } = mount();
    stage.move('rover', 500, 300);
    expect(line(co.el, 'rover').getAttribute('x2')).toBe('500');
    expect(line(co.el, 'rover').getAttribute('y2')).toBe('300');
  });

  it('redraws on update too', () => {
    const { stage, co } = mount();
    stage.spots.lab = [111, 222];
    co.update({ selected: 'lab' });
    expect(line(co.el, 'lab').getAttribute('x2')).toBe('111');
  });
});

describe('Labels toggle', () => {
  it('is a toggle button (aria-pressed) that hides and shows cards and lines', () => {
    const { co } = mount();
    const t = toggle(co.el);
    expect(t.tagName).toBe('BUTTON');
    expect(t.getAttribute('aria-pressed')).toBe('true');
    t.click();
    expect(t.getAttribute('aria-pressed')).toBe('false');
    expect(shown(co.el)).toHaveLength(0);
    expect(lines(co.el)).toHaveLength(0);
    t.click();
    expect(t.getAttribute('aria-pressed')).toBe('true');
    expect(shown(co.el)).toHaveLength(6);
    expect(lines(co.el)).toHaveLength(6);
  });

  it('setVisible does the same and keeps the button in sync', () => {
    const { co } = mount();
    co.setVisible(false);
    expect(toggle(co.el).getAttribute('aria-pressed')).toBe('false');
    expect(shown(co.el)).toHaveLength(0);
    expect(lines(co.el)).toHaveLength(0);
    co.setVisible(true);
    expect(toggle(co.el).getAttribute('aria-pressed')).toBe('true');
    expect(shown(co.el)).toHaveLength(6);
  });

  it('keeps focus on the toggle after a click', () => {
    const { co } = mount();
    toggle(co.el).focus();
    toggle(co.el).click();
    expect(document.activeElement).toBe(toggle(co.el));
  });
});

describe('phone layout', () => {
  it('puts nothing in the overlay; el holds only the selected card', () => {
    const { stage, co } = mount({ layout: 'phone', selected: 'lab' });
    expect(stage.overlay.children).toHaveLength(0);
    expect(co.el.parentNode).toBeNull();
    expect(shown(co.el).map((c) => c.dataset.id)).toEqual(['lab']);
    expect(lines(co.el)).toHaveLength(0);
    expect(toggle(co.el).hidden).toBe(true);
    expect(co.el.querySelector('.co-hint').hidden).toBe(true);
  });

  it('shows a short hint when nothing is selected', () => {
    const { co } = mount({ layout: 'phone' });
    expect(shown(co.el)).toHaveLength(0);
    const hint = co.el.querySelector('.co-hint');
    expect(hint.hidden).toBe(false);
    expect(hint.textContent).toMatch(/tap a station/i);
  });

  it('leaves and re-enters the overlay on update({ layout })', () => {
    const { stage, co } = mount();
    co.update({ layout: 'phone' });
    expect(stage.overlay.contains(co.el)).toBe(false);
    document.body.append(co.el); // the integrator places el under the stage
    co.update({ layout: 'desktop' });
    expect(co.el.parentNode).toBe(stage.overlay);
    expect(shown(co.el)).toHaveLength(6);
    expect(lines(co.el)).toHaveLength(6);
  });
});

describe('update', () => {
  it('redraws who, selected and stations', () => {
    const { co } = mount();
    co.update({ who: { lab: ['Ben', 'Ana'] }, selected: 'solar' });
    expect(card(co.el, 'lab').querySelector('.co-who').textContent).toBe('Ben and Ana are here');
    expect(card(co.el, 'solar').querySelector('.co-who').textContent).toBe('Nobody here yet');
    expect(card(co.el, 'solar').classList.contains('is-sel')).toBe(true);
    co.update({ stations: STATIONS.filter((s) => s.id !== 'rover').map((s) => (s.id === 'lab' ? { ...s, text: 'New words.' } : s)) });
    expect(card(co.el, 'rover')).toBeNull();
    expect(line(co.el, 'rover')).toBeNull();
    expect(card(co.el, 'lab').querySelector('.co-text').textContent).toBe('New words.');
  });

  it('does not steal focus from a control that still exists', () => {
    const { co } = mount();
    const help = card(co.el, 'lab').querySelector('.co-help');
    help.focus();
    co.update({ who: { lab: ['Ben'] }, selected: 'lab', picked: 'ana', stations: [...STATIONS] });
    expect(document.activeElement).toBe(help);
    expect(card(co.el, 'lab').querySelector('.co-help')).toBe(help);
  });
});
