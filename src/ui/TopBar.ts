import type { Store } from '../app/Store';
import type { GameState } from '../app/GameState';
import type { GameActions, PanelId } from './GameActions';
import { h, fmt } from './dom';
import { icon, IconName } from './icons';

export class TopBar {
  readonly el: HTMLElement;
  private readonly stats = h('div', { class: 'stats' });
  private readonly turnNum = h('span', { class: 'turn-num' });
  private readonly endTurnBtn: HTMLButtonElement;
  private readonly viewBtn: HTMLButtonElement;
  private readonly viewLabel = h('span', {}, 'Galaxy');
  private readonly tabs: Record<PanelId, HTMLButtonElement>;
  private readonly lootBadge = h('span', { class: 'badge', hidden: true });

  constructor(store: Store<GameState>, actions: GameActions, identityName: string) {
    this.endTurnBtn = h('button', { class: 'end-turn', title: 'End turn (Enter)', onclick: () => actions.endTurn() },
      h('span', {}, 'End turn'), icon('endTurn'));
    this.viewBtn = h('button', { class: 'tab', title: 'Toggle hex / galaxy view (G)', onclick: () => actions.toggleView() }, icon('galaxy'), this.viewLabel);
    const tab = (id: PanelId, label: string, ic: IconName) =>
      h('button', { class: 'tab', onclick: () => actions.openPanel(id) }, icon(ic), h('span', {}, label));
    this.tabs = { shipyard: tab('shipyard', 'Shipyard', 'shipyard'), research: tab('research', 'Research', 'research'), empire: tab('empire', 'Empire', 'empire'), war: tab('war', 'War Room', 'battle'), explore: tab('explore', 'Explore', 'explore'), fleets: tab('fleets', 'Fleets', 'fleet') };
    this.tabs.explore.append(this.lootBadge);
    this.el = h('header', { class: 'topbar' },
      h('div', { class: 'brand' }, icon('logo'), h('span', { class: 'wordmark' }, 'Falchion')),
      this.stats,
      h('div', { class: 'turn' },
        h('div', { class: 'turn-dial' }, h('span', { class: 'turn-label' }, 'Turn'), this.turnNum),
        this.endTurnBtn),
      h('nav', { class: 'tabs' }, this.viewBtn, this.tabs.shipyard, this.tabs.research, this.tabs.empire, this.tabs.fleets, this.tabs.explore, this.tabs.war),
      h('div', { class: 'identity', title: 'Discord sign-in is mocked in this preview' },
        h('span', { class: 'avatar' }, identityName.slice(0, 1)),
        h('span', { class: 'who' }, h('b', {}, identityName), h('small', {}, 'Discord · preview'))));
    store.subscribe((s, prev) => {
      if (s.empire !== prev.empire) this.renderStats(s);
      if (s.turn !== prev.turn) this.renderTurn(s.turn);
      if (s.contact !== prev.contact) this.endTurnBtn.classList.toggle('lockstep', !!s.contact);
      if (s.explored !== prev.explored || s.openedCrates !== prev.openedCrates) this.renderLoot(s);
    });
    this.renderStats(store.state);
    this.renderTurn(store.state.turn);
  }

  setGalaxyMode(on: boolean): void {
    this.viewLabel.textContent = on ? 'Hex' : 'Galaxy';
    this.viewBtn.firstElementChild!.replaceWith(icon(on ? 'hex' : 'galaxy'));
  }

  setActivePanel(id: PanelId | null): void {
    (Object.keys(this.tabs) as PanelId[]).forEach((k) => this.tabs[k].classList.toggle('active', k === id));
  }

  private renderLoot(s: GameState): void {
    const n = Object.entries(s.explored).filter(([id, r]) => r.crate && !s.openedCrates.includes(id)).length;
    this.lootBadge.hidden = n === 0;
    this.lootBadge.textContent = String(n);
    this.lootBadge.title = `${n} unopened loot crate${n === 1 ? '' : 's'}`;
  }

  private renderTurn(turn: number): void {
    this.turnNum.textContent = String(turn).padStart(4, '0');
    this.turnNum.classList.remove('tick');
    void this.turnNum.offsetWidth;
    this.turnNum.classList.add('tick');
  }

  private renderStats(s: GameState): void {
    const m = s.empire.materials;
    const items: Array<[string, number]> = [['Credits', m.credits], ['Influence', m.influence], ['Faith', m.faith], ['Metals', m.metals], ['Volatiles', m.volatiles], ['Crystals', m.crystals], ['Exotics', m.exotics]];
    this.stats.replaceChildren(...items.map(([label, v]) => h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, label), h('span', { class: 'stat-value' }, fmt(v)))));
  }
}
