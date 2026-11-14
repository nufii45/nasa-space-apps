// Rotary selector knob with 2 to 6 notches.
// createKnob({ label, options: [{ value, label, disabled? }], value, onChange }) -> { el, get, set }
// Mouse/touch: drag around the knob or tap a label. Keyboard: arrows, Home, End.
import { el, clamp, nextId } from './util.js';
import { play } from './sound.js';

// Degrees from first to last notch: 2 notches sit top-left/top-right, 3 span left-top-right, 4+ use 270.
const sweepFor = (n) => (n <= 2 ? 90 : n === 3 ? 180 : 270);

export function createKnob({ label, options, value = options[0].value, onChange = () => {}, size = 160 }) {
  const n = options.length;
  const SWEEP = sweepFor(n);
  const angleOf = (i) => (n === 1 ? 0 : -SWEEP / 2 + (SWEEP * i) / (n - 1));
  let index = Math.max(0, options.findIndex((o) => o.value === value));
  const id = nextId('knob');

  const VB_H = n <= 3 ? 170 : 185; // room for labels; knob centre is at (100, 100)
  const svg = el('svg:svg', { viewBox: `-80 0 360 ${VB_H}`, width: size * 1.8, height: (size * 1.8 * VB_H) / 360, 'aria-hidden': 'true', class: 'oc-knob-svg' });
  // Notch LEDs and labels around the knob.
  const leds = options.map((o, i) => {
    const a = ((angleOf(i) - 90) * Math.PI) / 180;
    const led = el('svg:circle', { cx: 100 + 66 * Math.cos(a), cy: 100 + 66 * Math.sin(a), r: 4.5, class: 'oc-knob-led' });
    const lx = 100 + 86 * Math.cos(a);
    const ly = 100 + 86 * Math.sin(a) + 4;
    const anchor = Math.abs(Math.cos(a)) < 0.3 ? 'middle' : Math.cos(a) > 0 ? 'start' : 'end';
    const text = el('svg:text', { x: lx, y: ly, 'text-anchor': anchor, class: `oc-knob-label${o.disabled ? ' is-disabled' : ''}`, 'data-index': i }, o.disabled ? `${o.label} 🔒` : o.label);
    svg.append(led, text);
    return led;
  });
  const body = el('svg:g', { class: 'oc-knob-body' },
    el('svg:circle', { cx: 100, cy: 100, r: 52, class: 'oc-knob-cap' }),
    el('svg:circle', { cx: 100, cy: 100, r: 40, class: 'oc-knob-face' }),
    el('svg:rect', { x: 96, y: 52, width: 8, height: 26, rx: 4, class: 'oc-knob-pointer' }));
  svg.append(el('svg:circle', { cx: 100, cy: 100, r: 58, class: 'oc-knob-bezel' }), body);

  const dial = el('div', {
    class: 'oc-knob-dial', role: 'slider', tabindex: 0, id,
    'aria-label': label, 'aria-valuemin': 0, 'aria-valuemax': n - 1,
  }, svg);
  const root = el('div', { class: 'oc-knob' }, dial, el('div', { class: 'oc-caption' }, label));

  function render() {
    body.style.transform = `rotate(${angleOf(index)}deg)`;
    leds.forEach((led, i) => led.classList.toggle('is-on', i === index));
    dial.setAttribute('aria-valuenow', index);
    dial.setAttribute('aria-valuetext', options[index].label);
  }
  function choose(i, fire = true) {
    i = clamp(i, 0, n - 1);
    if (options[i].disabled) {
      play('beep');
      dial.classList.remove('is-denied');
      void dial.offsetWidth;
      dial.classList.add('is-denied');
      return;
    }
    if (i === index) return;
    index = i;
    render();
    play('click');
    if (fire) onChange(options[i].value, options[i]);
  }
  const step = (dir) => {
    let i = index + dir;
    while (i >= 0 && i < n && options[i].disabled) i += dir;
    if (i >= 0 && i < n) choose(i);
    else play('beep');
  };

  dial.addEventListener('keydown', (e) => {
    const map = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 };
    if (map[e.key]) { e.preventDefault(); step(map[e.key]); }
    if (e.key === 'Home') { e.preventDefault(); choose(0); }
    if (e.key === 'End') { e.preventDefault(); choose(n - 1); }
  });

  // Tap a label to jump there.
  svg.addEventListener('click', (e) => {
    const t = e.target.closest('[data-index]');
    if (t) choose(Number(t.dataset.index));
  });

  // Drag: snap to the notch nearest the pointer's angle.
  const nearest = (e) => {
    const r = svg.getBoundingClientRect();
    const cx = r.left + (180 / 360) * r.width;
    const cy = r.top + (100 / VB_H) * r.height;
    const deg = (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI + 90;
    const norm = ((deg + 540) % 360) - 180; // -180..180, 0 = up
    let best = 0;
    for (let i = 1; i < n; i++) if (Math.abs(angleOf(i) - norm) < Math.abs(angleOf(best) - norm)) best = i;
    return best;
  };
  let dragging = false;
  dial.addEventListener('pointerdown', (e) => {
    if (e.target.closest('[data-index]')) return;
    dragging = true;
    dial.setPointerCapture(e.pointerId);
    dial.classList.add('is-grabbed');
  });
  dial.addEventListener('pointermove', (e) => { if (dragging) choose(nearest(e)); });
  const stop = () => { dragging = false; dial.classList.remove('is-grabbed'); };
  dial.addEventListener('pointerup', stop);
  dial.addEventListener('pointercancel', stop);

  render();
  return {
    el: root,
    get: () => options[index].value,
    set: (v) => { const i = options.findIndex((o) => o.value === v); if (i >= 0) { index = i; render(); } },
  };
}
