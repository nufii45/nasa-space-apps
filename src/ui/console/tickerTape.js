// Ticker-tape printer for the end-of-run debrief.
// createTickerTape() -> { el, print(lines) -> Promise, clear() }
// lines: strings, or { text, strong: true } for a bold line.
import { el, reducedMotion } from './util.js';
import { play } from './sound.js';

export function createTickerTape() {
  const paper = el('div', { class: 'oc-tape-paper', role: 'log', 'aria-label': 'Mission report' });
  const root = el('div', { class: 'oc-tape' }, el('div', { class: 'oc-tape-slot', 'aria-hidden': 'true' }), paper);

  async function print(lines) {
    paper.replaceChildren();
    const instant = reducedMotion();
    if (!instant) play('whirr');
    for (const l of lines) {
      const item = typeof l === 'string' ? { text: l } : l;
      const line = el(item.strong ? 'strong' : 'div', { class: 'oc-tape-line' }, item.text);
      paper.append(line);
      if (!instant) {
        line.classList.add('is-printing');
        await new Promise((r) => setTimeout(r, 380));
        if (paper.children.length % 3 === 0) play('whirr');
      }
    }
  }
  return { el: root, print, clear: () => paper.replaceChildren() };
}
