import type { GameState } from '../app/GameState';
import type { Store } from '../app/Store';
import { h } from './dom';

/** Newest-first feed of what happened: arrivals, research, battles. */
export class Dispatches {
  readonly el = h('section', { class: 'dispatches frame', 'aria-label': 'Dispatches' });
  private collapsed = false;

  constructor(store: Store<GameState>) {
    store.subscribe((s, prev) => { if (s.dispatches !== prev.dispatches) this.render(s); });
    this.render(store.state);
  }

  private render(s: GameState): void {
    const items = s.dispatches.slice(0, 7);
    this.el.replaceChildren(
      h('button', { class: 'disp-head', onclick: () => { this.collapsed = !this.collapsed; this.render(s); } },
        h('span', { class: 'eyebrow' }, 'Dispatches'), h('span', { class: 'muted small' }, this.collapsed ? 'Show' : 'Hide')),
      ...(this.collapsed ? [] : items.length
        ? items.map((d) => h('div', { class: `disp ${d.tone ?? ''}` }, h('span', { class: 'disp-turn mono' }, `Y${d.turn}`), h('span', {}, d.text)))
        : [h('p', { class: 'muted small' }, 'Set a research focus and send out your fleets: a year passes every minute.')]),
    );
  }
}
