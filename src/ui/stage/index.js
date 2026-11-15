// Isometric outpost stage: the base drawn as SVG with 6 station hotspots (real <button>s) on top.
// It draws what it is given and reports clicks; it holds no placing rules and imports nothing
// from src/sim/. Styles live in stage.css (the page imports it).
// createStage({ jobs, crew, placements, picked, selected, mode: 'plan'|'storm',
//               layout: 'desktop'|'phone', onStation(id), onHelp(id) })
//   -> { el, update(partial), hotspots(), overlay, destroy() }
// hotspots() gives [{ id, x, y }] in the stage drawing's own px, the same space as `overlay`
// (both sit in the zoomed and panned layer). el fires a bubbling 'stagechange' event whenever
// that layer moves or the hotspots move: rotate, zoom, pan, layout.
import { el, clamp, reducedMotion } from '../console/util.js';
import { scene, hotspotPoints, projector, STATIONS } from './geometry.js';
import { createToolbar } from './toolbar.js';

const COLORS = ['#7C6BD6', '#3F86C9', '#3E9B6A', '#C76B98', '#B8862B', '#5A6178'];
const ZOOMS = [0.75, 1, 1.25, 1.5];
const SPIN_MS = 15000; // one 90° view every 15 s = 1 turn per 60 s (Components board, Motion)
const motionOff = () => reducedMotion() || document.documentElement.classList.contains('reduced-motion');

export function createStage(opts) {
  const s = { jobs: {}, crew: [], placements: {}, picked: null, selected: null, mode: 'plan', layout: 'desktop', onStation() {}, onHelp() {}, ...opts };
  let view = 0;
  let zoom = 1;
  let pan = [0, 0];
  let spots = {}; // id -> [x, y] for the current view
  const ac = new AbortController();
  const on = (t, type, fn, o) => t.addEventListener(type, fn, { signal: ac.signal, ...o });
  const changed = () => root.dispatchEvent(new CustomEvent('stagechange', { bubbles: true }));

  const svg = el('svg:svg', { class: 'st-svg', 'aria-hidden': 'true', focusable: 'false' });
  const tags = el('div', { class: 'st-tags', 'aria-hidden': 'true' });
  const buttons = new Map(STATIONS.map((id) => {
    const b = el('button', { type: 'button', class: 'st-hs', 'data-station': id, 'aria-keyshortcuts': '?' }, el('span', { class: 'st-dot' }));
    on(b, 'click', () => s.onStation(id));
    return [id, b];
  }));
  const spotsEl = el('div', { class: 'st-spots' }, [...buttons.values()]);
  const overlay = el('div', { class: 'st-overlay' });
  const layer = el('div', { class: 'st-layer' }, svg, tags, spotsEl, overlay);
  const status = el('span', { class: 'st-sr', role: 'status' });
  const toolbar = createToolbar({ onRotate: (d) => rotate(d, true), onZoom: stepZoom, signal: ac.signal });
  const viewEl = el('div', { class: 'st-view' }, layer, toolbar.el);
  const root = el('div', { class: 'st', role: 'group', 'aria-label': 'Outpost' }, viewEl, status);

  function draw() {
    const phone = s.layout === 'phone';
    const storm = s.mode === 'storm';
    const active = s.crew.filter((c) => !c.home);
    const stationOf = (c) => (STATIONS.includes(s.placements?.[c.id]) ? s.placements[c.id] : null);
    const count = {};
    let shelterN = 0;
    const people = active.map((c) => {
      const at = stationOf(c);
      const station = at && at !== 'shelter' ? at : 'shelter';
      const n = station === 'shelter' ? shelterN++ : (count[station] = (count[station] ?? -1) + 1);
      return { station, n, color: COLORS[s.crew.indexOf(c) % COLORS.length], dashed: !at, picked: c.id === s.picked };
    });
    const here = Object.fromEntries(STATIONS.map((id) => [id, active.filter((c) => stationOf(c) === id).map((c) => c.name)]));
    const running = new Set(STATIONS.filter((id) => id !== 'shelter' && here[id].length));
    const sc = scene(s.layout, view, { storm, running, people });
    spots = hotspotPoints(s.layout, view);

    viewEl.style.width = `${sc.w}px`;
    viewEl.style.height = `${sc.h}px`;
    svg.setAttribute('width', sc.w);
    svg.setAttribute('height', sc.h);
    svg.setAttribute('viewBox', `0 0 ${sc.w} ${sc.h}`);
    const flowsOn = !motionOff();
    svg.replaceChildren(
      ...sc.shapes.map((p) => el('svg:path', { d: p.d, fill: p.fill, stroke: p.stroke, 'stroke-width': p.sw, 'stroke-dasharray': p.dash || null, opacity: p.op === 1 ? null : p.op, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' })),
      ...(flowsOn ? sc.flows : []).map((f) => el('svg:circle', { class: 'st-flow', r: 3.2, fill: f.color, stroke: '#18213D', 'stroke-width': 1 },
        el('svg:animateMotion', { dur: f.dur, begin: f.begin, repeatCount: 'indefinite', path: f.d }))),
      storm ? el('svg:rect', { class: 'st-dim', x: 0, y: 0, width: sc.w, height: sc.h, fill: '#18213D', opacity: 0.35 }) : null,
    );

    const pickedC = s.picked && active.find((c) => c.id === s.picked);
    tags.replaceChildren(...active.flatMap((c, i) => {
      const p = people[i];
      if (phone && !p.picked) return [];
      const [x, y] = sc.feet[i];
      return [el('span', { class: `st-tag${p.picked ? ' is-picked' : ''}`, style: `left:${x}px;top:${y + 3}px` },
        c.name.toUpperCase() + (p.picked ? ' · PICKED' : p.dashed ? ' ?' : ''))];
    }));

    for (const [id, b] of buttons) {
      const [x, y] = spots[id];
      const names = here[id];
      const busy = id !== 'shelter' && names.length > 0;
      const warn = storm && s.jobs[id]?.where === 'outside';
      const target = !storm && !!pickedC && !busy;
      const sel = s.selected === id;
      b.style.left = `${x}px`;
      b.style.top = `${y}px`;
      b.className = 'st-hs' + (sel ? ' is-sel' : '') + (target ? ' is-target' : '') + (warn ? ' is-storm' : '') + (busy && !target && !sel && !warn ? ' is-full' : '');
      b.firstChild.textContent = warn ? '!' : '';
      if (sel) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
      const who = names.length ? `${names.join(' and ')} ${names.length > 1 ? 'are' : 'is'} here` : 'nobody here';
      b.setAttribute('aria-label', `${s.jobs[id]?.name ?? id}: ${who}${warn ? '. Outside, not safe in a storm' : ''}${pickedC ? `. Send ${pickedC.name} here` : ''}`);
    }
    root.dataset.layout = phone ? 'phone' : 'desktop';
    root.dataset.mode = storm ? 'storm' : 'plan';
    toolbar.el.hidden = phone; // the phone board has no toolbar: drag and pinch instead
  }

  function apply() {
    const { w, h } = projector(s.layout, view).size;
    pan = [clamp(pan[0], -w * zoom / 2, w * zoom / 2), clamp(pan[1], -h * zoom / 2, h * zoom / 2)];
    layer.style.transform = `translate(${pan[0]}px, ${pan[1]}px) scale(${zoom})`;
    toolbar.set({ zoom, canOut: zoom > ZOOMS[0], canIn: zoom < ZOOMS.at(-1) });
  }

  function rotate(d, announce) {
    view = (view + d + 4) % 4;
    draw();
    if (announce) status.textContent = `View ${view + 1} of 4`;
    changed();
  }
  function setZoom(z) {
    zoom = clamp(z, ZOOMS[0], ZOOMS.at(-1));
    apply();
    changed();
  }
  function stepZoom(d) {
    const next = d > 0 ? ZOOMS.find((z) => z > zoom + 0.01) : ZOOMS.findLast((z) => z < zoom - 0.01);
    if (next === undefined) return;
    setZoom(next);
    status.textContent = `Zoom ${Math.round(zoom * 100)}%`;
  }

  // Idle spin: one view step at a time, never under Reduced motion, stops for good on any input.
  let spin = motionOff() ? null : setInterval(() => (motionOff() ? stopSpin() : rotate(1, false)), SPIN_MS);
  function stopSpin() { clearInterval(spin); spin = null; }
  for (const t of ['pointerdown', 'keydown', 'wheel', 'focusin']) on(root, t, stopSpin);

  // Drag pans; two fingers pinch-zoom. A drag never counts as a click on a hotspot.
  const pointers = new Map();
  let start = null;
  let dragged = false;
  const begin = () => {
    const pts = [...pointers.values()];
    start = { pt: pts[0], pan: [...pan], zoom, dist: pts[1] ? Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]) : 0 };
  };
  on(viewEl, 'pointerdown', (e) => {
    if (e.target.closest('.st-controls')) return;
    pointers.set(e.pointerId, [e.clientX, e.clientY]);
    dragged = false;
    begin();
  });
  on(viewEl, 'pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, [e.clientX, e.clientY]);
    const pts = [...pointers.values()];
    if (pts.length > 1 && start.dist) {
      dragged = true;
      return setZoom(start.zoom * Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]) / start.dist);
    }
    const dx = pts[0][0] - start.pt[0], dy = pts[0][1] - start.pt[1];
    if (!dragged && Math.hypot(dx, dy) < 5) return;
    if (!dragged) viewEl.setPointerCapture?.(e.pointerId);
    dragged = true;
    pan = [start.pan[0] + dx, start.pan[1] + dy];
    apply();
    changed();
  });
  const end = (e) => { if (pointers.delete(e.pointerId) && pointers.size) begin(); };
  on(viewEl, 'pointerup', end);
  on(viewEl, 'pointercancel', end);
  on(viewEl, 'click', (e) => { if (dragged) { e.stopPropagation(); e.preventDefault(); dragged = false; } }, { capture: true });

  // Keyboard on hotspots: arrows jump to the nearest station that way, ? opens its help.
  // A focused hotspot outside the visible area is panned into view.
  const DIRS = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] };
  on(spotsEl, 'keydown', (e) => {
    const id = e.target.dataset?.station;
    if (!id) return;
    if (e.key === '?') { e.preventDefault(); return s.onHelp(id); }
    const d = DIRS[e.key];
    if (!d) return;
    e.preventDefault();
    const [x0, y0] = spots[id];
    let best = null, score = Infinity;
    for (const other of STATIONS) {
      const vx = spots[other][0] - x0, vy = spots[other][1] - y0;
      const along = vx * d[0] + vy * d[1];
      if (other === id || along <= 0) continue;
      const sc = along + 2 * Math.abs(vx * d[1] - vy * d[0]);
      if (sc < score) { score = sc; best = other; }
    }
    buttons.get(best)?.focus();
  });
  on(spotsEl, 'focusin', (e) => {
    const id = e.target.dataset?.station;
    if (!id) return;
    const { w, h } = projector(s.layout, view).size;
    const [x, y] = spots[id];
    const sx = w / 2 + (x - w / 2) * zoom + pan[0], sy = h / 2 + (y - h / 2) * zoom + pan[1];
    if (sx >= 22 && sx <= w - 22 && sy >= 22 && sy <= h - 22) return;
    pan = [-(x - w / 2) * zoom, -(y - h / 2) * zoom];
    apply();
    changed();
  });

  draw();
  apply();

  return {
    el: root,
    overlay,
    update(partial) {
      const layoutChanged = 'layout' in partial && partial.layout !== s.layout;
      Object.assign(s, partial);
      draw();
      if (layoutChanged) { apply(); changed(); }
    },
    hotspots: () => STATIONS.map((id) => ({ id, x: spots[id][0], y: spots[id][1] })),
    destroy() {
      stopSpin();
      ac.abort();
      root.remove();
    },
  };
}
