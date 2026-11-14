// Row of warning lamps. Each lamp has an icon and a word, so colour is never the only signal.
// createLamps({ lamps: [{ id, label, icon }] }) -> { el, set(id, 'off'|'ok'|'warn'|'storm'), sweep(), clear() }
import { el, reducedMotion } from './util.js';
import { play } from './sound.js';

const WORD = { off: '', ok: 'OK', warn: 'LOW', storm: 'ALERT' };

export function createLamps({ lamps }) {
  const live = el('span', { class: 'oc-visually-hidden', role: 'status' });
  const items = new Map();
  const row = el('div', { class: 'oc-lamps' });
  for (const l of lamps) {
    const bulb = el('span', { class: 'oc-lamp-bulb', 'aria-hidden': 'true' }, l.icon || '');
    const word = el('span', { class: 'oc-lamp-word' });
    const item = el('div', { class: 'oc-lamp', 'data-state': 'off' }, bulb, el('span', { class: 'oc-caption' }, l.label), word);
    items.set(l.id, { item, word, label: l.label });
    row.append(item);
  }
  const root = el('div', { class: 'oc-lamps-wrap' }, row, live);

  function set(id, state = 'off') {
    const it = items.get(id);
    if (!it) return;
    const prev = it.item.dataset.state;
    it.item.dataset.state = state;
    it.word.textContent = WORD[state] || '';
    if (state !== prev && (state === 'warn' || state === 'storm')) {
      live.textContent = `${it.label}: ${WORD[state]}`;
      if (state === 'warn') play('beep');
    }
  }
  // Storm effect: every lamp flashes red in sequence, then returns to its own state.
  function sweep() {
    play('alarm');
    if (reducedMotion()) { root.classList.add('is-storm'); setTimeout(() => root.classList.remove('is-storm'), 1500); return; }
    root.classList.remove('is-sweeping');
    void root.offsetWidth;
    root.classList.add('is-sweeping');
    setTimeout(() => root.classList.remove('is-sweeping'), 1800);
  }
  const clear = () => items.forEach((_, id) => set(id, 'off'));
  return { el: root, set, sweep, clear };
}
