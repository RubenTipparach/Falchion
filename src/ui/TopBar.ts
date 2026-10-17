import type { Store } from '../app/Store';
import type { GameState } from '../app/GameState';
import { formatDate } from '../app/GameState';
import type { GameActions } from './GameActions';
import { h, fmt } from './dom';

const SPEEDS: Array<[string, number]> = [['❚❚', 0], ['1d/s', 1], ['30d/s', 30], ['1y/s', 365]];

export class TopBar {
  readonly el: HTMLElement;
  private readonly resources = h('div', { class: 'resources' });
  private readonly date = h('span', { class: 'date' });
  private readonly speedBtns: HTMLButtonElement[];
  private readonly viewBtn: HTMLButtonElement;

  constructor(store: Store<GameState>, actions: GameActions, identityName: string) {
    this.speedBtns = SPEEDS.map(([label, s]) => h('button', { class: 'chip', onclick: () => actions.setSpeed(s) }, label));
    this.viewBtn = h('button', { class: 'btn primary', title: 'Toggle hex / galaxy view (G)', onclick: () => actions.toggleView() }, '⬡ Galaxy view');
    this.el = h('header', { class: 'topbar' },
      h('div', { class: 'brand' }, h('span', { class: 'logo' }, '⟋'), 'FALCHION', h('span', { class: 'tag' }, 'mockup')),
      this.resources,
      h('div', { class: 'clock' }, this.date, ...this.speedBtns),
      h('nav', { class: 'nav' },
        this.viewBtn,
        h('button', { class: 'btn', onclick: () => actions.openPanel('shipyard') }, '🛠 Shipyard'),
        h('button', { class: 'btn', onclick: () => actions.openPanel('research') }, '🧬 Research'),
        h('button', { class: 'btn', onclick: () => actions.openPanel('explore') }, '🪐 Explore')),
      h('div', { class: 'identity', title: 'Discord sign-in is mocked in this build' }, h('span', { class: 'discord' }, '◉'), identityName));
    store.subscribe((s, prev) => {
      if (s.empire !== prev.empire) this.renderResources(s);
      if (s.speed !== prev.speed) this.renderSpeed(s.speed);
    });
    this.renderResources(store.state);
    this.renderSpeed(store.state.speed);
  }

  setDay(day: number): void {
    this.date.textContent = formatDate(day);
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

  private renderSpeed(speed: number): void {
    this.speedBtns.forEach((b, i) => b.classList.toggle('active', SPEEDS[i][1] === speed));
  }
}
