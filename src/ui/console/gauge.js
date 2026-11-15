// Analog needle gauge.
// createGauge({ label, max, value, unit, low }) -> { el, set(value) }
// `low`: at or below this value the gauge turns amber (with a "LOW" word, not colour alone).
import { el, clamp } from './util.js';

export function createGauge({ label, displayLabel = label, max = 10, value = 0, low = null, icon = '' }) {
  const ticks = [];
  for (let i = 0; i <= 10; i++) {
    const a = ((-90 + i * 18 - 90) * Math.PI) / 180;
    const r1 = i % 5 === 0 ? 62 : 67;
    ticks.push(el('svg:line', { x1: 80 + r1 * Math.cos(a), y1: 84 + r1 * Math.sin(a), x2: 80 + 74 * Math.cos(a), y2: 84 + 74 * Math.sin(a), class: 'oc-gauge-tick' }));
  }
  let lowArc = null;
  if (low != null && low > 0) {
    const end = ((-180 + (180 * low) / max) * Math.PI) / 180;
    lowArc = el('svg:path', { d: `M ${80 - 74} 84 A 74 74 0 0 1 ${80 + 74 * Math.cos(end)} ${84 + 74 * Math.sin(end)}`, class: 'oc-gauge-low-zone' });
  }
  const needle = el('svg:g', { class: 'oc-gauge-needle' },
    el('svg:path', { d: 'M 77 84 L 80 22 L 83 84 Z', class: 'oc-gauge-needle-shape' }),
    el('svg:circle', { cx: 80, cy: 84, r: 7, class: 'oc-gauge-hub' }));
  const svg = el('svg:svg', { viewBox: '0 0 160 100', class: 'oc-gauge-svg', 'aria-hidden': 'true' },
    el('svg:path', { d: 'M 6 84 A 74 74 0 0 1 154 84', class: 'oc-gauge-arc' }), lowArc, ...ticks, needle);
  const readout = el('span', { class: 'oc-gauge-readout' });
  const flag = el('span', { class: 'oc-gauge-flag' });
  const root = el('div', { class: 'oc-gauge', role: 'meter', 'aria-label': label, 'aria-valuemin': 0, 'aria-valuemax': max },
    svg, el('div', { class: 'oc-gauge-foot' }, el('span', { class: 'oc-caption' }, `${icon ? icon + ' ' : ''}${displayLabel}`), readout, flag));

  function set(v) {
    value = clamp(v, 0, max);
    needle.style.transform = `rotate(${-90 + (180 * value) / max}deg)`;
    readout.textContent = `${value}/${max}`;
    root.setAttribute('aria-valuenow', value);
    const isLow = low != null && value <= low;
    root.classList.toggle('is-low', isLow);
    flag.textContent = isLow ? 'LOW' : '';
    root.setAttribute('aria-valuetext', `${value} of ${max}${isLow ? ', low' : ''}`);
  }
  set(value);
  return { el: root, set, get: () => value };
}
