// Info drawer: a datasheet card that slides up from the console, with tabs.
// const drawer = createInfoDrawer(); document.body.append(drawer.el);
// drawer.open({ title, tabs: [{ label: 'Overview', body: 'text or Node' }, ...], source: { label, url } })
import { el, nextId } from './util.js';
import { play } from './sound.js';

export function createInfoDrawer() {
  const titleId = nextId('drawer-title');
  const heading = el('h2', { id: titleId, class: 'oc-drawer-title' });
  const tablist = el('div', { role: 'tablist', class: 'oc-drawer-tabs' });
  const panel = el('div', { role: 'tabpanel', class: 'oc-drawer-panel', tabindex: 0 });
  const source = el('p', { class: 'oc-drawer-source' });
  const closeBtn = el('button', { type: 'button', class: 'oc-drawer-close', 'aria-label': 'Close' }, '✕');
  const dialog = el('dialog', { class: 'oc-drawer', 'aria-labelledby': titleId },
    el('div', { class: 'oc-drawer-head' }, heading, closeBtn), tablist, panel, source);

  let tabs = [];
  function select(i, focus = false) {
    [...tablist.children].forEach((b, j) => {
      b.setAttribute('aria-selected', i === j);
      b.tabIndex = i === j ? 0 : -1;
    });
    const body = tabs[i].body;
    panel.replaceChildren(typeof body === 'string' ? el('p', {}, body) : body);
    panel.setAttribute('aria-labelledby', tablist.children[i].id);
    if (focus) tablist.children[i].focus();
  }
  tablist.addEventListener('keydown', (e) => {
    const cur = [...tablist.children].findIndex((b) => b.getAttribute('aria-selected') === 'true');
    if (e.key === 'ArrowRight') select((cur + 1) % tabs.length, true);
    if (e.key === 'ArrowLeft') select((cur - 1 + tabs.length) % tabs.length, true);
  });

  function open({ title, tabs: t, source: src = null }) {
    tabs = t;
    heading.textContent = title;
    tablist.replaceChildren(...tabs.map((tab, i) => el('button', {
      type: 'button', role: 'tab', id: nextId('tab'), class: 'oc-drawer-tab',
      onclick: () => { play('click'); select(i); },
    }, tab.label)));
    select(0);
    source.replaceChildren(...(src ? ['Source: ', src.url ? el('a', { href: src.url, target: '_blank', rel: 'noopener' }, src.label) : src.label] : []));
    play('whirr');
    if (!dialog.open) dialog.showModal?.() ?? dialog.setAttribute('open', '');
  }
  const close = () => dialog.open && dialog.close();
  closeBtn.addEventListener('click', close);
  dialog.addEventListener('click', (e) => { if (e.target === dialog) close(); }); // tap the backdrop
  return { el: dialog, open, close };
}
