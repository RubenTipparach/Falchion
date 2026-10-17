import type { Flag } from '../core/empire/Identity';
import { flagEl } from '../render/flag';
import { h } from './dom';

export interface Toast {
  /** Who it is about: their empire's colour and flag, and name. */
  readonly color: string;
  readonly flag: Flag | null;
  readonly who: string;
  /** The rest of the line, as text or text with links. */
  readonly body: ReadonlyArray<Node | string>;
  /** Clicking the toast (outside its links). */
  readonly onClick?: () => void;
}

/** Short-lived notices at the bottom of the map (e.g. other players' news); at most three at a time. */
export class Toasts {
  readonly el = h('div', { class: 'toasts', 'aria-live': 'polite' });

  show(t: Toast, ms = 7_000): void {
    const item = h('div', { class: 'toast frame', style: `--empire:${t.color}`, role: 'status' },
      t.flag ? flagEl(t.flag, 24) : h('span', { class: 'player-dot', style: `background:${t.color}` }),
      h('div', {}, h('b', { style: `color:${t.color}` }, t.who), ' ', ...t.body));
    if (t.onClick) {
      item.classList.add('clickable');
      item.addEventListener('click', (e) => { if (!(e.target as HTMLElement).closest('button')) t.onClick?.(); });
    }
    this.el.prepend(item);
    while (this.el.children.length > 3) this.el.lastElementChild?.remove();
    setTimeout(() => { item.classList.add('leaving'); setTimeout(() => item.remove(), 400); }, ms);
  }
}
