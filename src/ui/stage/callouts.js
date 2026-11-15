// Callout cards for the isometric stage: one card per station with a dashed leader line to its
// hotspot, plus a Labels toggle. Plain data and handlers in, DOM out (decision 0009).
// createCallouts({ stage, stations, who, selected, picked, layout, onSelect, onHelp })
//   -> { el, update(partial), setVisible(bool) }
//   stage: { el, hotspots() -> [{ id, x, y }], overlay } in stage px; stations: [{ id, title, text, icon }]
//   (icon is an SVG path "d" on a 24 px grid); who: { jobId: [names] }; layout: 'desktop' | 'phone'.
// Desktop: el lives in stage.overlay. Phone: el leaves the overlay and holds only the selected card
// (or a hint); the caller places it under the stage. Styles: callouts.css (imported by the caller).
import { el } from '../console/util.js';

// Card slots in stage px, from Scene.dc.html (desktop stage 860x440). Stations without a slot get no card.
const SLOTS = { recycler: [4, 4], shelter: [4, 148], lab: [4, 292], pump: [660, 4], solar: [660, 136], rover: [660, 268] };
const CARD_W = 196;
const ANCHOR_Y = 30; // the line leaves the card's side this far below its top
const SHELTER = 'shelter';
const KEYS = ['stations', 'who', 'selected', 'picked', 'layout'];

const list = (names) => (names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0]);
function whoText(id, names) {
  if (id === SHELTER) return names.length ? `${list(names)} resting here · room for everyone` : 'Nobody here · room for everyone';
  return names.length ? `${list(names)} ${names.length > 1 ? 'are' : 'is'} here` : 'Nobody here yet';
}

export function createCallouts({ stage, onSelect = () => {}, onHelp = () => {}, ...data }) {
  const s = { stations: [], who: {}, selected: null, picked: null, layout: 'desktop' };
  for (const k of KEYS) if (data[k] !== undefined) s[k] = data[k];
  let visible = true;
  const cards = new Map(); // station id -> { card, pick, icon, title, help, text, here, mark }

  const lines = el('svg:svg', { class: 'co-lines', 'aria-hidden': 'true', focusable: 'false' });
  const deck = el('div', { class: 'co-cards' });
  const hint = el('p', { class: 'co-hint', text: 'Tap a station to see what it does.' });
  const state = el('span', { class: 'co-toggle-state', 'aria-hidden': 'true' });
  const toggle = el('button', { type: 'button', class: 'co-toggle', 'aria-label': 'Labels', onclick: () => setVisible(!visible) },
    el('svg:svg', { width: 20, height: 20, viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' }, el('svg:path', { d: 'M4 5h16v10H9l-5 4z' })),
    el('span', { 'aria-hidden': 'true', text: 'Labels' }), state);
  const root = el('div', { class: 'co' }, lines, deck, hint, toggle);

  function makeCard(id) {
    const icon = el('svg:path', {});
    const title = el('span', { class: 'co-title' });
    const pick = el('button', { type: 'button', class: 'co-pick' },
      el('span', { class: 'co-ic', 'aria-hidden': 'true' }, el('svg:svg', { width: 20, height: 20, viewBox: '0 0 24 24', focusable: 'false' }, icon)), title);
    // stopPropagation: the help button sits inside the card, whose click selects.
    const help = el('button', { type: 'button', class: 'co-help', onclick: (e) => { e.stopPropagation(); onHelp(id); } }, '?');
    const text = el('p', { class: 'co-text' });
    const here = el('span', { class: 'co-who' });
    const mark = el('span', { class: 'co-mark', text: 'Selected' });
    const card = el('div', { class: 'co-card', 'data-id': id, onclick: () => onSelect(id) },
      el('div', { class: 'co-head' }, pick, help), text, el('div', { class: 'co-foot' }, here, mark));
    deck.append(card);
    cards.set(id, { card, pick, icon, title, help, text, here, mark });
  }

  function fill(st, phone) {
    const c = cards.get(st.id);
    const names = s.who?.[st.id] ?? [];
    const sel = st.id === s.selected;
    const target = !!s.picked && (st.id === SHELTER || !names.length);
    const name = String(st.title ?? '');
    c.title.textContent = name.toUpperCase();
    c.text.textContent = st.text ?? '';
    if (st.icon) c.icon.setAttribute('d', st.icon); else c.icon.removeAttribute('d');
    c.here.textContent = whoText(st.id, names);
    c.here.classList.toggle('is-free', !names.length);
    c.card.classList.toggle('is-sel', sel);
    c.card.classList.toggle('is-target', target);
    c.mark.hidden = !sel;
    c.pick.setAttribute('aria-label', target ? `${name}: send your astronaut here` : name);
    if (sel) c.pick.setAttribute('aria-current', 'true'); else c.pick.removeAttribute('aria-current');
    c.help.setAttribute('aria-label', `Help: what does the ${name} do?`);
    const slot = SLOTS[st.id];
    if (slot) Object.assign(c.card.style, { left: `${slot[0]}px`, top: `${slot[1]}px` });
    c.card.hidden = phone ? !sel : !visible || !slot;
  }

  function drawLines() {
    if (lines.hidden) return lines.replaceChildren();
    lines.replaceChildren(...stage.hotspots().filter((p) => cards.has(p.id) && SLOTS[p.id]).flatMap(({ id, x, y }) => {
      const [cx, cy] = SLOTS[id];
      const ax = x > cx + CARD_W ? cx + CARD_W : cx;
      const ay = cy + ANCHOR_Y;
      return [el('svg:line', { class: 'co-line', 'data-id': id, x1: ax, y1: ay, x2: x, y2: y, 'stroke-dasharray': '3 4' }),
        el('svg:circle', { class: 'co-anchor', cx: ax, cy: ay, r: 4 })];
    }));
  }

  // Updates nodes in place (never rebuilds a card that still exists), so keyboard focus stays put.
  function render() {
    const phone = s.layout === 'phone';
    const stations = s.stations ?? [];
    const ids = new Set(stations.map((st) => st.id));
    for (const [id, c] of cards) if (!ids.has(id)) { c.card.remove(); cards.delete(id); }
    for (const st of stations) { if (!cards.has(st.id)) makeCard(st.id); fill(st, phone); }
    root.classList.toggle('is-phone', phone);
    lines.hidden = phone || !visible;
    toggle.hidden = phone;
    toggle.setAttribute('aria-pressed', String(visible));
    state.textContent = visible ? 'on' : 'off';
    hint.hidden = !phone || cards.has(s.selected);
    if (phone) { if (root.parentNode === stage.overlay) root.remove(); }
    else if (root.parentNode !== stage.overlay) stage.overlay.append(root);
    drawLines();
  }

  function update(partial = {}) {
    for (const k of KEYS) if (Object.hasOwn(partial, k)) s[k] = partial[k];
    render();
  }

  function setVisible(on) {
    visible = !!on;
    render();
  }

  // shortcut: never removed, as the contract has no destroy; add one if callouts outlive their stage.
  stage.el.addEventListener('stagechange', drawLines);
  render();
  return { el: root, update, setVisible };
}
