// Green-on-black mission log that types each line out.
// createMissionLog({ max }) -> { el, append(text, type), clear() }
// type: 'info' | 'power' | 'water' | 'shield' | 'science' | 'warn' | 'storm' | 'dose' | 'home'
import { el, reducedMotion } from './util.js';
import { play } from './sound.js';

export function createMissionLog({ max = 40, title = 'MISSION LOG' } = {}) {
  const screen = el('div', { class: 'oc-log-screen' });
  const live = el('div', { class: 'oc-visually-hidden', 'aria-live': 'polite' });
  const root = el('section', { class: 'oc-log', 'aria-label': 'Mission log' }, el('div', { class: 'oc-caption oc-log-title' }, title), screen, live);
  const queue = [];
  let busy = false;

  async function typeLine({ text, type }) {
    const line = el('div', { class: `oc-log-line type-${type}` });
    screen.append(line);
    while (screen.children.length > max) screen.firstChild.remove();
    live.textContent = text;
    if (reducedMotion()) { line.textContent = text; screen.scrollTop = screen.scrollHeight; return; }
    const cursor = el('span', { class: 'oc-log-cursor' }, '▌');
    line.append(cursor);
    for (let i = 0; i < text.length; i++) {
      cursor.before(text[i]);
      if (i % 6 === 0) play('beep');
      screen.scrollTop = screen.scrollHeight;
      await new Promise((r) => setTimeout(r, 14));
    }
    cursor.remove();
  }
  async function pump() {
    if (busy) return;
    busy = true;
    while (queue.length) await typeLine(queue.shift());
    busy = false;
  }
  return {
    el: root,
    append: (text, type = 'info') => { queue.push({ text, type }); pump(); },
    clear: () => { queue.length = 0; screen.textContent = ''; },
  };
}
