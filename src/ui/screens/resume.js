// Resume prompt (W4), shown after a refresh in the middle of a run. A pure view (decision 0009):
// render({ sol, missionLabel, modeLabel, totalSols? }, { onResume, onStartOver })
import { el, nextId } from '../console/util.js';

export function render(model, { onResume, onStartOver } = {}) {
  const id = nextId('sc-resume');
  const root = el('section', { class: 'sc-screen sc-resume', 'aria-labelledby': id });

  function update(m) {
    root.replaceChildren(
      el('h2', { id, class: 'sc-h', tabindex: -1 }, 'Resume your mission?'),
      el('p', { class: 'sc-resume-line' }, `Sol ${m.sol} of ${m.totalSols ?? 10} · ${m.missionLabel} · ${m.modeLabel}`),
      el('div', { class: 'sc-actions' },
        el('button', { type: 'button', class: 'sc-btn sc-pri', onclick: () => onResume?.() }, 'Resume'),
        el('button', { type: 'button', class: 'sc-btn sc-sec', onclick: () => onStartOver?.() }, 'Start over')),
    );
  }
  update(model);
  return { el: root, update };
}
