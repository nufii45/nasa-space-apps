export const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

let uid = 0;
export const nextId = (prefix) => `${prefix}-${++uid}`;

// Build an element: el('div', { class: 'x', onclick: fn }, child, 'text')
export function el(tag, attrs = {}, ...children) {
  const node = tag.startsWith('svg:')
    ? document.createElementNS('http://www.w3.org/2000/svg', tag.slice(4))
    : document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'text') node.textContent = v;
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null) node.append(c);
  return node;
}

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
