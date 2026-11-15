// Sol result card (W2): what changed on the Mars day that just ended. A pure view (decision 0009):
// render({ sol, date, changes: [{ text, why, dir }], doses: [{ name, before, after, limit? }], isLast }, { onNext })
import { el, nextId } from '../console/util.js';

const pct = (v, limit) => `${Math.max(0, Math.min(100, (v / limit) * 100))}%`;

function doseLine({ name, before, after, limit = 100 }) {
  const added = after - before;
  return el('li', { class: 'sc-line sc-dose' },
    el('span', { class: 'sc-badge sc-down' }, `${name} ${added >= 0 ? '+' : '−'}${Math.abs(added)}`), ' ',
    el('span', {}, 'radiation'), ' ',
    el('span', { class: 'sc-meter-row' },
      el('span', { class: 'sc-meter', role: 'img', 'aria-label': `${name}: radiation went from ${before} to ${after} out of ${limit}.` },
        el('span', { class: 'sc-meter-before', style: `width: ${pct(Math.min(before, after), limit)}` }),
        el('span', { class: 'sc-meter-added', style: `left: ${pct(Math.min(before, after), limit)}; width: ${pct(Math.abs(added), limit)}` })),
      el('span', { class: 'sc-mono', 'aria-hidden': 'true' }, `${before} → ${after}/${limit}`)));
}

export function render(model, { onNext } = {}) {
  const id = nextId('sc-result');
  // tabindex -1: a click on the card's text keeps focus on the card, so Enter still works.
  const root = el('section', { class: 'sc-screen sc-result', 'aria-labelledby': id, tabindex: -1 });
  // Enter anywhere on the card moves on; a focused button or link already handles its own Enter.
  root.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.repeat || e.target.closest?.('button, a')) return;
    e.preventDefault();
    onNext?.();
  });

  function update(m) {
    root.replaceChildren(
      el('div', { class: 'sc-head' },
        el('h2', { id, class: 'sc-h', tabindex: -1 }, `Sol ${m.sol} done`),
        m.date ? el('span', { class: 'sc-mono sc-quiet' }, `Real sky: ${m.date}`) : null),
      el('p', { class: 'sc-quiet' }, 'Here is what changed on this Mars day.'),
      el('ul', { class: 'sc-lines' },
        (m.changes ?? []).map((c) => el('li', { class: 'sc-line' },
          el('span', { class: `sc-badge sc-${c.dir === 'down' ? 'down' : 'up'}` }, c.text), ' ',
          c.why ? el('span', {}, c.why) : null)),
        (m.doses ?? []).map(doseLine)),
      el('div', { class: 'sc-actions' },
        el('button', { type: 'button', class: 'sc-btn sc-pri', onclick: () => onNext?.() }, m.isLast ? 'NEXT: MISSION REPORT →' : 'NEXT SOL →')),
    );
  }
  update(model);
  return { el: root, update };
}
