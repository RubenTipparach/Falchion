import { h, fmt } from './dom';

/** Bottom-left readout: hovered hex, its address and the current view scale. */
export class Hud {
  readonly el: HTMLElement;
  private readonly hover = h('div', { class: 'hud-hover' }, 'Hover the map');
  private readonly scale = h('div', { class: 'hud-scale' });
  private readonly contact = h('div', { class: 'contact-banner hidden' });

  constructor() {
    this.el = h('div', { class: 'hud' }, this.contact, this.hover, this.scale,
      h('div', { class: 'hud-help' }, 'Scroll: zoom · Drag: pan · Right-drag: rotate/tilt · G: toggle view · Click star: select'));
  }

  setHover(text: string): void {
    this.hover.textContent = text;
  }

  setScale(widthLy: number, mode: string): void {
    this.scale.innerHTML = `<b>${mode}</b> · view ${fmt(widthLy)} ly across · 1 hex = 1 ly`;
  }

  setContact(text: string | null): void {
    this.contact.classList.toggle('hidden', !text);
    this.contact.textContent = text ?? '';
  }
}
