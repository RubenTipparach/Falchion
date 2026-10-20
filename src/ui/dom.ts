type Attrs = Record<string, string | number | boolean | EventListener | undefined>;
type Child = Node | string | null | undefined | false;

/** Tiny DOM builder: h('div', { class: 'x', onclick: fn }, 'text', child). */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = String(v);
    else if (k === 'html') el.innerHTML = String(v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

export function clear(el: HTMLElement): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

/**
 * Run a rebuild of `el`'s contents without moving any scrolled box round it: emptying it first
 * shrinks them for a moment and the browser clamps their scroll, which made lists jump on a click.
 */
export function keepScroll(el: HTMLElement, rebuild: () => void): void {
  const saved: Array<[HTMLElement, number]> = [];
  for (let p: HTMLElement | null = el; p; p = p.parentElement) if (p.scrollTop) saved.push([p, p.scrollTop]);
  rebuild();
  for (const [p, top] of saved) p.scrollTop = top;
}

export const fmt = (n: number): string => Math.round(n).toLocaleString('en-US');

/** A touch screen is the main input (phones, tablets): hints say tap and long-press, not click. */
export const touchFirst = (): boolean => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
