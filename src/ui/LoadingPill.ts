import { h } from './dom';

/**
 * A small progress pill at the bottom of the screen (change surface-perf): what is being prepared
 * and how far along it is. Shown while planet shaders compile up front and while a planet's
 * close-up is built; hidden otherwise.
 */
export class LoadingPill {
  readonly el: HTMLElement;
  private readonly label = h('span', { class: 'lp-label' });
  private readonly fill = h('i');

  constructor() {
    this.el = h('div', { class: 'loading-pill', role: 'status', 'aria-live': 'polite', hidden: true }, this.label, h('span', { class: 'lp-bar' }, this.fill));
  }

  /** Show `text`, with a bar at `fraction` (0..1), or a moving bar when it is unknown (null). Null text hides it. */
  set(text: string | null, fraction: number | null = null): void {
    this.el.hidden = text === null;
    if (text === null) return;
    if (this.label.textContent !== text) this.label.textContent = text;
    this.el.classList.toggle('indeterminate', fraction === null);
    this.fill.style.width = fraction === null ? '' : `${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%`;
  }
}
