import type { Store } from '../app/Store';
import type { GameState } from '../app/GameState';
import { formatTurn } from '../app/GameState';
import type { GameActions } from './GameActions';
import { h, fmt } from './dom';

export class TopBar {
  readonly el: HTMLElement;
  private readonly resources = h('div', { class: 'resources' });
  private readonly turnLabel = h('span', { class: 'date' });
  private readonly endTurnBtn: HTMLButtonElement;
  private readonly viewBtn: HTMLButtonElement;

  constructor(store: Store<GameState>, actions: GameActions, identityName: string) {
    this.endTurnBtn = h('button', { class: 'btn end-turn', title: 'End turn (Enter)', onclick: () => actions.endTurn() }, 'End Turn ▶');
    this.viewBtn = h('button', { class: 'btn primary', title: 'Toggle hex / galaxy view (G)', onclick: () => actions.toggleView() }, '⬡ Galaxy view');
    this.el = h('header', { class: 'topbar' },
      h('div', { class: 'brand' }, h('span', { class: 'logo' }, '⟋'), 'FALCHION', h('span', { class: 'tag' }, 'mockup')),
      this.resources,
      h('div', { class: 'clock' }, this.turnLabel, this.endTurnBtn),
      h('nav', { class: 'nav' },
        this.viewBtn,
        h('button', { class: 'btn', onclick: () => actions.openPanel('shipyard') }, '🛠 Shipyard'),
        h('button', { class: 'btn', onclick: () => actions.openPanel('research') }, '🧬 Research'),
        h('button', { class: 'btn', onclick: () => actions.openPanel('explore') }, '🪐 Explore')),
      h('div', { class: 'identity', title: 'Discord sign-in is mocked in this build' }, h('span', { class: 'discord' }, '◉'), identityName));
    store.subscribe((s, prev) => {
      if (s.empire !== prev.empire) this.renderResources(s);
      if (s.turn !== prev.turn) this.renderTurn(s.turn);
      if (s.contact !== prev.contact) this.endTurnBtn.classList.toggle('lockstep', !!s.contact);
    });
    this.renderResources(store.state);
    this.renderTurn(store.state.turn);
  }

  private renderTurn(turn: number): void {
    this.turnLabel.textContent = formatTurn(turn);
  }

  setGalaxyMode(on: boolean): void {
    this.viewBtn.textContent = on ? '⬡ Hex view' : '◎ Galaxy view';
  }

  private renderResources(s: GameState): void {
    const m = s.empire.materials;
    this.resources.innerHTML = '';
    const items: Array<[string, string, number]> = [['⛏', 'Metals', m.metals], ['💎', 'Crystals', m.crystals], ['✶', 'Exotics', m.exotics], ['¤', 'Credits', m.credits], ['⚔', 'Fleet power', s.empire.fleetPower]];
    for (const [icon, name, v] of items) this.resources.append(h('span', { class: 'res', title: name }, icon, ' ', fmt(v)));
  }
}
