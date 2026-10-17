import { h } from './dom';
import { icon } from './icons';

/** Right-hand drawer chrome shared by all panels. Subclasses render into `body`. */
export abstract class Drawer {
  readonly el: HTMLElement;
  protected readonly body: HTMLElement;
  private isOpen = false;
  private readonly listeners = new Set<(open: boolean) => void>();

  constructor(readonly id: string, title: string, subtitle: string, wide = false) {
    this.body = h('div', { class: 'drawer-body' });
    this.el = h('aside', { class: `drawer frame ${wide ? 'wide' : ''}`, 'data-panel': id, 'aria-label': title },
      h('header', { class: 'drawer-head' },
        h('div', {}, h('span', { class: 'eyebrow' }, 'Command'), h('h2', {}, title), h('p', {}, subtitle)),
        h('button', { class: 'icon-btn', title: 'Close', 'aria-label': 'Close', onclick: () => this.close() }, icon('close'))),
      this.body);
  }

  get opened(): boolean {
    return this.isOpen;
  }

  onChange(fn: (open: boolean) => void): void {
    this.listeners.add(fn);
  }

  open(): void {
    this.isOpen = true;
    this.el.classList.add('open');
    this.onOpen();
    this.listeners.forEach((l) => l(true));
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.el.classList.remove('open');
    this.listeners.forEach((l) => l(false));
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  protected onOpen(): void {}
}
