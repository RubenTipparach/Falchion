import { h } from './dom';

/** Right-hand drawer chrome shared by all panels. Subclasses render into `body`. */
export abstract class Drawer {
  readonly el: HTMLElement;
  protected readonly body: HTMLElement;
  private isOpen = false;

  constructor(readonly id: string, title: string, subtitle: string, wide = false) {
    this.body = h('div', { class: 'drawer-body' });
    this.el = h('aside', { class: `drawer ${wide ? 'wide' : ''}`, 'data-panel': id },
      h('header', { class: 'drawer-head' },
        h('div', {}, h('h2', {}, title), h('p', {}, subtitle)),
        h('button', { class: 'icon-btn', title: 'Close', onclick: () => this.close() }, '✕')),
      this.body);
  }

  get opened(): boolean {
    return this.isOpen;
  }

  open(): void {
    this.isOpen = true;
    this.el.classList.add('open');
    this.onOpen();
  }

  close(): void {
    this.isOpen = false;
    this.el.classList.remove('open');
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  protected onOpen(): void {}
}
