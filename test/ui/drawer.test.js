// @vitest-environment jsdom
// Info drawer (src/ui/console/infoDrawer.js): side drawer / bottom sheet, closing, focus, tabs.
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInfoDrawer } from '../../src/ui/console/infoDrawer.js';
import { jobCard } from '../../src/ui/jobInfo.js';
import { JOBS } from '../../src/sim/constants.js';

const CSS = readFileSync(resolve(import.meta.dirname, '../../src/ui/console/console.css'), 'utf8');
const CARD = {
  title: 'Water Wall pump',
  tabs: [{ label: 'What it does', body: 'Moves water.' }, { label: 'Numbers', body: '<b>2</b> power' }, { label: 'Third', body: 'Three.' }],
  source: { label: 'NASA', url: 'https://www.nasa.gov/' },
};

let wide; let listeners;
beforeEach(() => {
  // jsdom 31 has <dialog> but no showModal()/close(), and no matchMedia.
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  wide = true; listeners = [];
  window.matchMedia = (q) => ({
    media: q,
    get matches() { return /min-width: 700px/.test(q) ? wide : false; },
    addEventListener: (_, fn) => listeners.push(fn),
    removeEventListener() {},
  });
  document.body.innerHTML = '<button id="opener">?</button><button id="other">other</button>';
});

function setup(card = CARD) {
  const drawer = createInfoDrawer();
  document.body.append(drawer.el);
  const opener = document.getElementById('opener');
  opener.focus();
  drawer.open(card);
  return { drawer, d: drawer.el, opener };
}
const tabs = (d) => [...d.querySelectorAll('[role="tab"]')];
const panel = (d) => d.querySelector('[role="tabpanel"]');
const isOpen = (d) => d.hasAttribute('open');

describe('info drawer', () => {
  it('opens with the title and first tab, and ✕ closes it and returns focus to the opener', () => {
    const { d, opener } = setup();
    expect(isOpen(d)).toBe(true);
    expect(d.querySelector('h2').textContent).toBe('Water Wall pump');
    expect(panel(d).textContent).toBe('Moves water.');
    expect(d.querySelector('.oc-drawer-source a').getAttribute('href')).toBe('https://www.nasa.gov/');
    d.querySelector('.oc-drawer-tab').focus();
    d.querySelector('button[aria-label="Close"]').click();
    expect(isOpen(d)).toBe(false);
    expect(document.activeElement).toBe(opener);
  });

  it('Esc closes it and returns focus to the opener', () => {
    const { d, opener } = setup();
    tabs(d)[0].focus();
    tabs(d)[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(isOpen(d)).toBe(false);
    expect(document.activeElement).toBe(opener);
  });

  it('a click on the backdrop closes it; a click inside does not', () => {
    const { d, opener } = setup();
    panel(d).click();
    expect(isOpen(d)).toBe(true);
    d.click(); // clicks on ::backdrop target the dialog itself
    expect(isOpen(d)).toBe(false);
    expect(document.activeElement).toBe(opener);
  });

  it('reopening while open keeps the first opener; a removed opener is not focused', () => {
    const { drawer, d, opener } = setup();
    document.getElementById('other').focus();
    drawer.open(CARD);
    drawer.close();
    expect(document.activeElement).toBe(opener);
    opener.focus();
    drawer.open(CARD);
    opener.remove(); // the screen changed under the drawer
    expect(() => drawer.close()).not.toThrow();
    expect(isOpen(d)).toBe(false);
  });

  it('tabs switch by click and by arrow keys, with roving tabindex', () => {
    const { d } = setup();
    tabs(d)[1].click();
    expect(tabs(d).map((t) => t.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false']);
    expect(panel(d).textContent).toBe('<b>2</b> power');
    expect(panel(d).querySelector('b')).toBeNull(); // text, never HTML
    expect(panel(d).getAttribute('aria-labelledby')).toBe(tabs(d)[1].id);
    const key = (k) => d.querySelector('[role="tablist"]').dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
    key('ArrowRight');
    expect(document.activeElement).toBe(tabs(d)[2]);
    expect(panel(d).textContent).toBe('Three.');
    key('ArrowRight'); // wraps
    expect(document.activeElement).toBe(tabs(d)[0]);
    key('ArrowLeft');
    expect(document.activeElement).toBe(tabs(d)[2]);
    expect(tabs(d).map((t) => t.tabIndex)).toEqual([-1, -1, 0]);
  });

  it('the header and ✕ sit outside the scrolling panel; only the panel scrolls', () => {
    const { d } = setup();
    const head = d.querySelector('.oc-drawer-head');
    expect(head.parentElement).toBe(d);
    expect(head.contains(d.querySelector('h2'))).toBe(true);
    expect(head.contains(d.querySelector('button[aria-label="Close"]'))).toBe(true);
    expect(panel(d).contains(head)).toBe(false);
    expect([...d.children].indexOf(head)).toBeLessThan([...d.children].indexOf(panel(d)));
    const rule = (sel) => CSS.match(new RegExp(`\\n${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`))?.[1] ?? '';
    expect(rule('.oc-drawer')).toMatch(/overflow: hidden/);
    expect(rule('.oc-drawer-panel')).toMatch(/overflow-y: auto/);
    for (const sel of ['.oc-drawer-head', '.oc-drawer-tabs', '.oc-drawer-source', '.oc-drawer-handle']) expect(rule(sel)).toMatch(/flex: none/);
  });

  it('is a side drawer at 700 px and wider and a bottom sheet with a handle below that', () => {
    const { d } = setup();
    expect(d.dataset.layout).toBe('side');
    wide = false; listeners.forEach((fn) => fn());
    expect(d.dataset.layout).toBe('sheet');
    expect(d.querySelector('.oc-drawer-handle').getAttribute('aria-hidden')).toBe('true');
    wide = true; listeners.forEach((fn) => fn());
    expect(d.dataset.layout).toBe('side');
    expect(CSS).toMatch(/\.oc-drawer\[data-layout='side'\] \{[^}]*width: 400px/);
    expect(CSS).toMatch(/\.oc-drawer\[data-layout='sheet'\] \{[^}]*max-height: 85dvh/);
  });

  it('starts as a bottom sheet on a narrow screen', () => {
    wide = false;
    expect(setup().d.dataset.layout).toBe('sheet');
  });
});

describe('job help cards', () => {
  it.each(Object.keys(JOBS))('%s has the tabs "What it does" and "Numbers" and says radiation, never sunburn', (id) => {
    const { d } = setup(jobCard(id));
    expect(tabs(d).map((t) => t.textContent)).toEqual(['What it does', 'Numbers']);
    const text = tabs(d).map((t) => { t.click(); return panel(d).textContent; }).join(' ');
    expect(text).not.toMatch(/sunburn/i);
  });
});
