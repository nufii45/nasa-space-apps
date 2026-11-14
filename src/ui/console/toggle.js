// Flip switch with a status LED.
// createToggle({ label, on, onLabel, offLabel, onChange }) -> { el, get, set }
import { el } from './util.js';
import { play } from './sound.js';

export function createToggle({ label, on = false, onLabel = 'ON', offLabel = 'OFF', onChange = () => {} }) {
  const lever = el('span', { class: 'oc-toggle-lever', 'aria-hidden': 'true' });
  const led = el('span', { class: 'oc-led', 'aria-hidden': 'true' });
  const state = el('span', { class: 'oc-toggle-state' });
  const btn = el('button', { class: 'oc-toggle', role: 'switch', type: 'button', 'aria-label': label },
    el('span', { class: 'oc-toggle-track', 'aria-hidden': 'true' }, lever), state);
  const root = el('div', { class: 'oc-toggle-wrap' }, el('div', { class: 'oc-row' }, led, btn), el('div', { class: 'oc-caption' }, label));
  const render = () => {
    btn.setAttribute('aria-checked', on);
    btn.classList.toggle('is-on', on);
    led.classList.toggle('is-on', on);
    state.textContent = on ? onLabel : offLabel;
  };
  btn.addEventListener('click', () => { on = !on; render(); play('clack'); onChange(on); });
  render();
  return { el: root, get: () => on, set: (v) => { on = !!v; render(); } };
}
