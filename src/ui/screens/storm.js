// Storm takeover (W11): bring everyone outside back to the Shelter. A pure view (decision 0009):
// render({ title, classText, timed, left, total?, timesUp, caughtText,
//          rows: [{ id, name, where, status: 'out'|'walk'|'safe', walkLeft }] }, { onBring(id), onReady })
// update(model) runs every second, so it patches nodes in place and never replaces a control that still exists.
import { el, nextId } from '../console/util.js';

const RING_R = 52;
const RING_LEN = 2 * Math.PI * RING_R;
const seconds = (n) => `${n} ${n === 1 ? 'second' : 'seconds'}`;
const STATUS = { walk: 'Walking back…', safe: 'Safe in the Shelter' };
const statusWords = (r) => STATUS[r.status] ?? `Outside at the ${r.where}`;

export function render(model, { onBring, onReady } = {}) {
  const id = nextId('sc-storm');
  const explainId = `${id}-explain`;

  const heading = el('h2', { id, class: 'sc-h sc-storm-title', tabindex: -1 });
  const classText = el('span', {});
  const help = el('button', {
    type: 'button', class: 'sc-help', 'aria-label': 'What is a flare class?', 'aria-expanded': 'false', 'aria-controls': explainId,
    onclick: () => {
      const open = help.getAttribute('aria-expanded') !== 'true';
      help.setAttribute('aria-expanded', open);
      explain.hidden = !open;
    },
  }, '?');
  const classLine = el('p', { class: 'sc-class' }, classText, help);
  const explain = el('div', { id: explainId, class: 'sc-explain', hidden: true },
    el('p', {}, 'A flare is a flash from the Sun.'),
    el('p', {}, 'Scientists give each flare a letter for its size. C is small, M is medium, X is the biggest.'),
    el('p', {}, 'The number says how big inside that letter. X9 is bigger than X2.'));

  // Countdown ring: the number changes every second but is not live; `spoken` is, and changes only every 5 seconds.
  const arc = el('svg:circle', { cx: 60, cy: 60, r: RING_R, fill: 'none', 'stroke-width': 10, 'stroke-linecap': 'round', transform: 'rotate(-90 60 60)', class: 'sc-ring-arc' });
  const leftNum = el('span', { class: 'sc-mono sc-ring-num' });
  const leftWord = el('span', { class: 'sc-ring-word' });
  const ring = el('div', { class: 'sc-ring', role: 'timer', 'aria-live': 'off' },
    el('svg:svg', { viewBox: '0 0 120 120', 'aria-hidden': 'true', focusable: 'false' },
      el('svg:circle', { cx: 60, cy: 60, r: RING_R, class: 'sc-ring-track', fill: '#FFFDF8', 'stroke-width': 10 }), arc),
    leftNum, ' ', leftWord);
  const spoken = el('p', { class: 'sc-sr-only', 'aria-live': 'polite' });

  const timesUpText = el('span', {});
  const timesUp = el('p', { class: 'sc-timesup', role: 'alert', hidden: true }, el('strong', {}, "Time's up!"), ' ', timesUpText);

  const list = el('div', { class: 'sc-rows', 'aria-live': 'polite' });
  const nobody = el('p', { hidden: true }, 'Everyone is already inside. Phew!');
  const rows = new Map(); // id -> { row, status, extra, btn }

  const ready = el('button', { type: 'button', class: 'sc-btn sc-pri sc-ready', onclick: () => onReady?.() });
  const note = el('span', { class: 'sc-quiet' });

  const card = el('div', { class: 'sc-screen sc-storm-card' },
    el('div', { class: 'sc-storm-top' },
      el('div', { class: 'sc-storm-words' },
        el('p', { class: 'sc-h sc-kicker sc-storm-kicker' }, 'Storm alert'),
        heading,
        el('p', {}, 'Tiny, super-fast bits from the Sun are radiation. Get everyone outside back to the Shelter!'),
        classLine, explain),
      ring),
    spoken, timesUp, list, nobody,
    el('div', { class: 'sc-actions sc-storm-actions' }, note, ready));
  const root = el('section', { class: 'sc-storm', 'aria-labelledby': id },
    el('div', { class: 'sc-flash', 'aria-hidden': 'true' }), card);

  function rowFor(r) {
    let row = rows.get(r.id);
    if (row) return row;
    const status = el('span', { class: 'sc-st' });
    const extra = el('span', { class: 'sc-st-extra', 'aria-hidden': 'true' });
    const btn = el('button', { type: 'button', class: 'sc-btn sc-bring', onclick: () => onBring?.(r.id) });
    row = { status, extra, btn, name: el('strong', { class: 'sc-h' }), el: null };
    row.el = el('div', { class: 'sc-row' }, row.name, ' ', el('span', { class: 'sc-st-wrap' }, status, extra), ' ', btn);
    rows.set(r.id, row);
    list.append(row.el);
    return row;
  }

  // Removing a focused control would drop focus to <body>: hand it to the next Bring button, else the finish button.
  function removeKeepingFocus(node) {
    if (!node.parentNode) return;
    const had = node.contains(document.activeElement);
    node.remove();
    if (had) ([...list.querySelectorAll('.sc-bring')].find((b) => !b.disabled) ?? (ready.disabled ? heading : ready)).focus();
  }

  const setText = (node, text) => { if (node.textContent !== text) node.textContent = text; };

  function update(m) {
    const timed = !!m.timed;
    const left = Math.max(0, m.left ?? 0);
    const total = m.total ?? 10;
    const over = !!m.timesUp;

    setText(heading, m.title ?? '');
    setText(classText, m.classText ?? '');
    classLine.hidden = !m.classText;
    if (!m.classText) explain.hidden = true;

    ring.hidden = !timed;
    setText(leftNum, String(left));
    setText(leftWord, `${left === 1 ? 'second' : 'seconds'} left`);
    ring.setAttribute('aria-label', `${seconds(left)} left`);
    arc.setAttribute('stroke-dasharray', `${(RING_LEN * Math.min(1, left / total)).toFixed(1)} 999`);
    ring.classList.toggle('is-low', left <= 3);
    if (timed && !over && (left % 5 === 0 || !spoken.textContent)) setText(spoken, `${seconds(left)} left.`);
    if (!timed) setText(spoken, '');

    timesUp.hidden = !over;
    setText(timesUpText, over ? (m.caughtText ?? '') : '');

    const ids = new Set((m.rows ?? []).map((r) => r.id));
    for (const [rid, row] of rows) if (!ids.has(rid)) { removeKeepingFocus(row.el); rows.delete(rid); }
    for (const r of m.rows ?? []) {
      const row = rowFor(r);
      setText(row.name, r.name);
      setText(row.status, statusWords(r));
      row.status.className = `sc-st sc-st-${r.status}`;
      setText(row.extra, r.status === 'walk' && timed && r.walkLeft > 0 ? ` ${seconds(r.walkLeft)} to go` : '');
      setText(row.btn, `Bring ${r.name} inside`);
      row.btn.disabled = over;
      if (r.status !== 'out') removeKeepingFocus(row.btn);
      else if (!row.btn.parentNode) row.el.append(row.btn);
    }
    nobody.hidden = rows.size > 0;

    setText(ready, timed ? 'Ready' : 'Done');
    ready.disabled = over;
    setText(note, over ? 'Moving on…' : timed ? 'Ready ends the countdown early.' : 'Cadet mode: no timer. Take your time.');
  }
  update(model);
  return { el: root, update };
}
