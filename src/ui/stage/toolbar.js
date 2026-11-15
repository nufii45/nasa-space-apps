// Stage toolbar: rotate left/right, zoom out/in with the current zoom shown, and an info
// button that explains the controls. An ARIA toolbar: one Tab stop, arrow keys move between
// buttons (roving tabindex). Buttons at a limit use aria-disabled so focus never gets lost.
// createToolbar({ onRotate(dir), onZoom(dir), signal }) -> { el, set({ zoom, canOut, canIn }) }
import { el, nextId } from '../console/util.js';

const icon = (d) => el('svg:svg', { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'aria-hidden': 'true', focusable: 'false' }, el('svg:path', { d }));

export function createToolbar({ onRotate, onZoom, signal }) {
  const on = (t, type, fn) => t.addEventListener(type, fn, { signal });
  const tool = (label, d, fn) => {
    const b = el('button', { type: 'button', class: 'st-tool', 'aria-label': label, tabindex: -1 }, icon(d));
    on(b, 'click', () => { if (b.getAttribute('aria-disabled') !== 'true') fn(); });
    return b;
  };
  const left = tool('Rotate left', 'M4 12a8 8 0 1 0 3-6.2M4 4v4h4', () => onRotate(-1));
  const right = tool('Rotate right', 'M20 12a8 8 0 1 1-3-6.2M20 4v4h-4', () => onRotate(1));
  const out = tool('Zoom out', 'M5 12h14', () => onZoom(-1));
  const zin = tool('Zoom in', 'M5 12h14M12 5v14', () => onZoom(1));
  const zoomText = el('span', { class: 'st-zoom', 'aria-hidden': 'true' }, '100%');
  const info = el('div', { class: 'st-info', id: nextId('st-info'), hidden: true },
    el('p', {}, el('strong', {}, 'Turn: '), 'the round arrows show the base from another side.'),
    el('p', {}, el('strong', {}, 'Zoom: '), 'minus and plus, from 75% to 150%.'),
    el('p', {}, el('strong', {}, 'Move: '), 'drag the picture.'),
    el('p', {}, el('strong', {}, 'Keyboard: '), 'Tab to a station, Enter picks it, arrow keys jump between stations, ? opens its help.'));
  const help = tool('How the stage works', 'M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0M12 11v6M12 7.5v.5', () => show(info.hidden));
  help.setAttribute('aria-expanded', 'false');
  help.setAttribute('aria-controls', info.id);
  function show(open) {
    info.hidden = !open;
    help.setAttribute('aria-expanded', String(open));
  }

  const sep = () => el('span', { class: 'st-sep', 'aria-hidden': 'true' });
  const bar = el('div', { class: 'st-bar', role: 'toolbar', 'aria-label': 'Stage controls' }, left, right, sep(), out, zoomText, zin, sep(), help);
  const tools = [left, right, out, zin, help];
  left.tabIndex = 0;
  on(bar, 'keydown', (e) => {
    if (e.key === 'Escape' && !info.hidden) { show(false); return help.focus(); }
    const i = tools.indexOf(e.target);
    const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tools.length - 1 }[e.key];
    if (i < 0 || next === undefined) return;
    e.preventDefault();
    const t = tools[(next + tools.length) % tools.length];
    for (const b of tools) b.tabIndex = b === t ? 0 : -1;
    t.focus();
  });
  on(bar, 'focusin', (e) => { if (tools.includes(e.target)) for (const b of tools) b.tabIndex = b === e.target ? 0 : -1; });

  return {
    el: el('div', { class: 'st-controls' }, info, bar),
    set({ zoom, canOut, canIn }) {
      zoomText.textContent = `${Math.round(zoom * 100)}%`;
      out.setAttribute('aria-disabled', String(!canOut));
      zin.setAttribute('aria-disabled', String(!canIn));
    },
  };
}
