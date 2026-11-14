// Big button under a flip-up safety cover: lift the cover, then press.
// createCoverButton({ label, tone: 'go'|'storm', onPress }) -> { el, close, setDisabled }
// The cover drops again 4 s after lifting if the button isn't pressed.
import { el } from './util.js';
import { play } from './sound.js';

export function createCoverButton({ label, tone = 'go', onPress = () => {}, autoClose = 4000 }) {
  let open = false;
  let timer = null;
  const press = el('button', { type: 'button', class: `oc-big-button tone-${tone}`, tabindex: -1, 'aria-hidden': 'true' }, label);
  const cover = el('button', { type: 'button', class: 'oc-cover', 'aria-expanded': 'false', 'aria-label': `Lift the safety cover over ${label}` },
    el('span', { class: 'oc-cover-hint' }, 'LIFT'));
  const root = el('div', { class: 'oc-cover-wrap' }, el('div', { class: 'oc-cover-housing' }, press, cover), el('div', { class: 'oc-caption' }, label));

  const setOpen = (v) => {
    open = v;
    root.classList.toggle('is-open', open);
    cover.setAttribute('aria-expanded', open);
    press.tabIndex = open ? 0 : -1;
    press.setAttribute('aria-hidden', !open);
    clearTimeout(timer);
    if (open && autoClose) timer = setTimeout(() => setOpen(false), autoClose);
  };
  cover.addEventListener('click', () => {
    setOpen(!open);
    play('cover');
    if (open) press.focus();
  });
  press.addEventListener('click', () => {
    if (!open || press.disabled) return;
    play('thunk');
    root.classList.add('is-pressed');
    setTimeout(() => { root.classList.remove('is-pressed'); setOpen(false); }, 180);
    onPress();
  });
  return {
    el: root,
    close: () => setOpen(false),
    setDisabled: (d) => { press.disabled = d; cover.disabled = d; },
  };
}
