// @vitest-environment jsdom
// Isometric stage (src/ui/stage): driven through its public API, real buttons and key presses.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createStage } from '../../src/ui/stage/index.js';

const JOBS = {
  solar: { name: 'Solar Field', where: 'outside' },
  recycler: { name: 'Recycler', where: 'inside' },
  pump: { name: 'Water Wall pump', where: 'inside' },
  lab: { name: 'Lab', where: 'inside' },
  rover: { name: 'Rover trip', where: 'outside' },
  shelter: { name: 'Shelter', where: 'shelter' },
};
const CREW = () => [
  { id: 'ana', name: 'Ana', dose: 12, home: false },
  { id: 'ben', name: 'Ben', dose: 40, home: false },
  { id: 'cai', name: 'Cai', dose: 0, home: true },
];

function mount(opts = {}) {
  const calls = { station: [], help: [] };
  const stage = createStage({
    jobs: JOBS, crew: CREW(), placements: { ana: 'solar', ben: 'shelter' }, picked: null, selected: null,
    mode: 'plan', layout: 'desktop', onStation: (id) => calls.station.push(id), onHelp: (id) => calls.help.push(id), ...opts,
  });
  document.body.append(stage.el);
  let changes = 0;
  stage.el.addEventListener('stagechange', () => changes++);
  return { stage, root: stage.el, calls, changes: () => changes };
}
const spots = (root) => [...root.querySelectorAll('.st-hs')];
const spot = (root, id) => root.querySelector(`.st-hs[data-station="${id}"]`);
const label = (root, id) => spot(root, id).getAttribute('aria-label');
const tool = (root, name) => root.querySelector(`[role="toolbar"] [aria-label="${name}"]`);
const key = (target, k) => target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
const zoomText = (root) => root.querySelector('.st-zoom').textContent;

afterEach(() => {
  vi.useRealTimers();
  document.documentElement.classList.remove('reduced-motion');
  document.body.innerHTML = '';
});

describe('drawing and hotspots', () => {
  it('draws an SVG outpost and 6 hotspot buttons with who-is-here labels', () => {
    const { root, stage } = mount();
    expect(root.querySelectorAll('svg.st-svg path').length).toBeGreaterThan(60);
    expect(spots(root)).toHaveLength(6);
    expect(spots(root).every((b) => b.tagName === 'BUTTON')).toBe(true);
    expect(label(root, 'solar')).toBe('Solar Field: Ana is here');
    expect(label(root, 'shelter')).toBe('Shelter: Ben is here');
    expect(label(root, 'lab')).toBe('Lab: nobody here');
    expect(stage.hotspots().map((h) => h.id).sort()).toEqual(['lab', 'pump', 'recycler', 'rover', 'shelter', 'solar']);
    for (const h of stage.hotspots()) {
      expect(h.x).toBeGreaterThan(0); expect(h.x).toBeLessThan(860);
      expect(spot(root, h.id).style.left).toBe(`${h.x}px`);
    }
  });

  it('leaves crew who went home off the stage', () => {
    const { root } = mount({ placements: { ana: 'solar', ben: 'shelter', cai: 'lab' } });
    expect(label(root, 'lab')).toBe('Lab: nobody here');
    expect([...root.querySelectorAll('.st-tag')].map((t) => t.textContent)).toEqual(['ANA', 'BEN']);
  });

  it('a click calls onStation(id) and ? on a hotspot calls onHelp(id)', () => {
    const { root, calls } = mount();
    spot(root, 'rover').click();
    expect(calls.station).toEqual(['rover']);
    key(spot(root, 'lab'), '?');
    expect(calls.help).toEqual(['lab']);
  });

  it('update moves an astronaut and changes the labels', () => {
    const { root, stage } = mount();
    const before = root.querySelector('.st-tag').style.cssText;
    stage.update({ placements: { ana: 'lab', ben: 'shelter' } });
    expect(label(root, 'lab')).toBe('Lab: Ana is here');
    expect(label(root, 'solar')).toBe('Solar Field: nobody here');
    expect(root.querySelector('.st-tag').style.cssText).not.toBe(before);
  });

  it('shows selected and picked with more than colour', () => {
    const { root, stage } = mount({ selected: 'lab', picked: 'ben' });
    expect(spot(root, 'lab').getAttribute('aria-current')).toBe('true');
    expect(spot(root, 'lab').classList.contains('is-sel')).toBe(true);
    expect(label(root, 'lab')).toBe('Lab: nobody here. Send Ben here');
    expect(root.querySelector('.st-tag.is-picked').textContent).toBe('BEN · PICKED');
    stage.update({ selected: null, picked: null });
    expect(spot(root, 'lab').hasAttribute('aria-current')).toBe(false);
    expect(root.querySelector('.st-tag.is-picked')).toBeNull();
  });

  it('storm mode dims the stage and warns on outside stations', () => {
    const { root } = mount({ mode: 'storm' });
    expect(root.querySelector('rect.st-dim')).not.toBeNull();
    expect(label(root, 'solar')).toBe('Solar Field: Ana is here. Outside, not safe in a storm');
    expect(spot(root, 'solar').textContent).toBe('!');
    expect(spot(root, 'lab').textContent).toBe('');
  });

  it('flow dots run only on pipes whose job is staffed', () => {
    const { root, stage } = mount();
    expect(root.querySelectorAll('.st-flow')).toHaveLength(2); // solar power line
    stage.update({ placements: { ana: 'recycler', ben: 'pump' } });
    expect(root.querySelectorAll('.st-flow')).toHaveLength(4);
    stage.update({ placements: { ana: 'shelter', ben: 'shelter' } });
    expect(root.querySelectorAll('.st-flow')).toHaveLength(0);
  });

  it('phone layout is smaller, has no toolbar and fires stagechange', () => {
    const { root, stage, changes } = mount();
    const desk = stage.hotspots();
    stage.update({ layout: 'phone' });
    expect(root.querySelector('.st-view').style.width).toBe('390px');
    expect(root.querySelector('.st-controls').hidden).toBe(true);
    expect(stage.hotspots()).not.toEqual(desk);
    expect(changes()).toBe(1);
  });
});

describe('toolbar', () => {
  it('rotate cycles 4 views and fires stagechange', () => {
    const { root, stage, changes } = mount();
    const views = [JSON.stringify(stage.hotspots())];
    for (let i = 0; i < 4; i++) { tool(root, 'Rotate right').click(); views.push(JSON.stringify(stage.hotspots())); }
    expect(new Set(views.slice(0, 4)).size).toBe(4);
    expect(views[4]).toBe(views[0]);
    expect(changes()).toBe(4);
    tool(root, 'Rotate left').click();
    expect(JSON.stringify(stage.hotspots())).toBe(views[3]);
    expect(root.querySelector('[role="status"]').textContent).toBe('View 4 of 4');
  });

  it('zoom goes from 75% to 150% and stops at both ends', () => {
    const { root, changes } = mount();
    const layer = root.querySelector('.st-layer');
    for (let i = 0; i < 5; i++) tool(root, 'Zoom in').click();
    expect(zoomText(root)).toBe('150%');
    expect(layer.style.transform).toContain('scale(1.5)');
    expect(tool(root, 'Zoom in').getAttribute('aria-disabled')).toBe('true');
    for (let i = 0; i < 5; i++) tool(root, 'Zoom out').click();
    expect(zoomText(root)).toBe('75%');
    expect(layer.style.transform).toContain('scale(0.75)');
    expect(tool(root, 'Zoom out').getAttribute('aria-disabled')).toBe('true');
    expect(changes()).toBe(5); // 100 -> 150 is 2 steps, 150 -> 75 is 3
  });

  it('drag pans the layer and the drag is not a click', () => {
    const { root, calls, changes } = mount();
    const b = spot(root, 'lab');
    const ev = (type, x, y) => b.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true }));
    ev('pointerdown', 100, 100); ev('pointermove', 140, 120); ev('pointerup', 140, 120); b.click();
    expect(root.querySelector('.st-layer').style.transform).toContain('translate(40px, 20px)');
    expect(calls.station).toEqual([]);
    expect(changes()).toBe(1);
    b.click();
    expect(calls.station).toEqual(['lab']);
  });

  it('works from the keyboard: one tab stop, arrows move, Enter-equivalent click acts, info opens and Escape closes', () => {
    const { root } = mount();
    const bar = root.querySelector('[role="toolbar"]');
    const tools = [...bar.querySelectorAll('button')];
    expect(tools.filter((b) => b.tabIndex === 0)).toHaveLength(1);
    tools[0].focus();
    key(document.activeElement, 'ArrowRight');
    expect(document.activeElement.getAttribute('aria-label')).toBe('Rotate right');
    key(document.activeElement, 'End');
    const info = document.activeElement;
    expect(info.getAttribute('aria-label')).toBe('How the stage works');
    key(info, 'ArrowRight');
    expect(document.activeElement.getAttribute('aria-label')).toBe('Rotate left');
    key(document.activeElement, 'ArrowLeft');
    expect(document.activeElement).toBe(info);
    expect(tools.filter((b) => b.tabIndex === 0)).toEqual([info]);
    info.click();
    const panel = document.getElementById(info.getAttribute('aria-controls'));
    expect(info.getAttribute('aria-expanded')).toBe('true');
    expect(panel.hidden).toBe(false);
    expect(panel.textContent).toMatch(/drag/i);
    key(info, 'Escape');
    expect(panel.hidden).toBe(true);
    expect(info.getAttribute('aria-expanded')).toBe('false');
  });
});

describe('keyboard between hotspots', () => {
  it('arrow keys move focus to the nearest hotspot that way', () => {
    const { root, stage } = mount();
    const pos = Object.fromEntries(stage.hotspots().map((h) => [h.id, h]));
    spot(root, 'lab').focus();
    key(spot(root, 'lab'), 'ArrowRight');
    const moved = document.activeElement.dataset.station;
    expect(moved).not.toBe('lab');
    expect(pos[moved].x).toBeGreaterThan(pos.lab.x);
    const rightmost = stage.hotspots().reduce((a, b) => (b.x > a.x ? b : a)).id;
    spot(root, rightmost).focus();
    key(spot(root, rightmost), 'ArrowRight');
    expect(document.activeElement.dataset.station).toBe(rightmost);
    const top = stage.hotspots().reduce((a, b) => (b.y < a.y ? b : a)).id;
    spot(root, top).focus();
    key(spot(root, top), 'ArrowDown');
    expect(pos[document.activeElement.dataset.station].y).toBeGreaterThan(pos[top].y);
  });
});

describe('motion', () => {
  it('turns slowly when idle and stops on input', () => {
    vi.useFakeTimers();
    const { root, stage, changes } = mount();
    const start = JSON.stringify(stage.hotspots());
    vi.advanceTimersByTime(15000);
    expect(changes()).toBe(1);
    expect(JSON.stringify(stage.hotspots())).not.toBe(start);
    root.querySelector('.st-view').dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    vi.advanceTimersByTime(60000);
    expect(changes()).toBe(1);
  });

  it('has no idle motion and no flow dots under the reduced-motion setting', () => {
    vi.useFakeTimers();
    document.documentElement.classList.add('reduced-motion');
    const { root, stage, changes } = mount();
    const start = JSON.stringify(stage.hotspots());
    vi.advanceTimersByTime(60000);
    expect(changes()).toBe(0);
    expect(JSON.stringify(stage.hotspots())).toBe(start);
    expect(root.querySelectorAll('.st-flow')).toHaveLength(0);
  });

  it('has no idle motion when the device asks for reduced motion', () => {
    vi.useFakeTimers();
    const mm = window.matchMedia;
    window.matchMedia = (q) => ({ matches: q.includes('reduce'), media: q });
    try {
      const { changes } = mount();
      vi.advanceTimersByTime(60000);
      expect(changes()).toBe(0);
    } finally { window.matchMedia = mm; }
  });

  it('stops spinning mid-run when the setting turns on', () => {
    vi.useFakeTimers();
    const { changes } = mount();
    document.documentElement.classList.add('reduced-motion');
    vi.advanceTimersByTime(60000);
    expect(changes()).toBe(0);
  });
});

describe('destroy', () => {
  it('removes the stage, its listeners and its timers', () => {
    vi.useFakeTimers();
    const { root, stage, calls, changes } = mount();
    const b = spot(root, 'solar');
    stage.destroy();
    expect(root.isConnected).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    b.click();
    expect(calls.station).toEqual([]);
    tool(root, 'Rotate right').click();
    expect(changes()).toBe(0);
  });
});
