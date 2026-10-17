import type { Store } from '../app/Store';
import type { GameState } from '../app/GameState';
import type { GameActions, PanelId } from './GameActions';
import { h, fmt } from './dom';
import { icon, IconName, resourceIcon } from './icons';
import type { WorldClock } from '../app/WorldClock';
import type { PlayerIdentity } from '../app/identity';
import type { Resource } from '../content/resources';
import { flagEl } from '../render/flag';

export class TopBar {
  readonly el: HTMLElement;
  private readonly stats = h('div', { class: 'stats' });
  private readonly turnNum = h('span', { class: 'turn-num' });
  private readonly clockEl = h('div', { class: 'year-clock' });
  private readonly ring = h('span', { class: 'year-ring' });
  private readonly countdown = h('span', { class: 'year-next mono' });
  private lastLeft = -1;
  private readonly viewBtn: HTMLButtonElement;
  private readonly viewLabel = h('span', {}, 'Galaxy');
  private readonly tabs: Record<PanelId, HTMLButtonElement>;
  private readonly lootBadge = h('span', { class: 'badge', hidden: true });
  private readonly empireBtn: HTMLButtonElement;

  constructor(store: Store<GameState>, actions: GameActions, identity: PlayerIdentity, private readonly clock: WorldClock, private readonly caps: () => Partial<Record<Resource, number>>) {
    const skip = import.meta.env.DEV ? h('button', { class: 'chip', title: 'Development only: advance one year now', onclick: () => actions.skipYear() }, '+1 yr') : '';
    this.clockEl.title = clock.source === 'server' ? 'World clock from the Falchion server: one year passes every minute for everyone' : 'Offline world clock (no server here): one year passes every minute';
    this.clockEl.append(this.ring, h('span', { class: 'year-meta' }, h('span', { class: 'year-src' }, clock.source === 'server' ? '● LIVE' : '○ LOCAL'), this.countdown), skip);
    this.viewLabel.className = 'tab-label';
    this.viewBtn = h('button', { class: 'tab', title: 'Toggle hex / galaxy view (G)', onclick: () => actions.toggleView() }, icon('galaxy'), this.viewLabel);
    const tab = (id: PanelId, label: string, ic: IconName) =>
      h('button', { class: 'tab', title: label, 'aria-label': label, onclick: () => actions.openPanel(id) }, icon(ic), h('span', { class: 'tab-label' }, label));
    this.tabs = { shipyard: tab('shipyard', 'Shipyard', 'shipyard'), research: tab('research', 'Research', 'research'), empire: tab('empire', 'Empire', 'empire'), war: tab('war', 'War Room', 'battle'), explore: tab('explore', 'Explore', 'explore'), fleets: tab('fleets', 'Fleets', 'fleet') };
    this.tabs.explore.append(this.lootBadge);
    this.empireBtn = h('button', { class: 'empire-chip', title: 'Your empire: click to change its name, colours and flag', onclick: () => actions.editEmpire() });
    this.el = h('header', { class: 'topbar' },
      h('div', { class: 'brand' }, icon('logo'), h('span', { class: 'wordmark' }, 'Falchion')),
      this.empireBtn,
      this.stats,
      h('div', { class: 'turn' },
        h('div', { class: 'turn-dial' }, h('span', { class: 'turn-label' }, 'Year'), this.turnNum),
        this.clockEl),
      h('nav', { class: 'tabs' }, this.viewBtn, this.tabs.shipyard, this.tabs.research, this.tabs.empire, this.tabs.fleets, this.tabs.explore, this.tabs.war),
      h('div', { class: 'identity', title: identity.provider === 'discord' ? 'Signed in with Discord: your empire is saved on the server' : 'Guest: your empire is saved in this browser only' },
        identity.avatar ? h('img', { class: 'avatar', src: identity.avatar, alt: '' }) : h('span', { class: 'avatar' }, identity.displayName.slice(0, 1)),
        h('span', { class: 'who' }, h('b', {}, identity.displayName),
          identity.provider === 'discord'
            ? h('span', {}, identity.admin ? h('a', { class: 'signout', href: './admin', title: 'Admin portal' }, 'Admin · ') : '', h('a', { class: 'signout', href: './auth/logout' }, 'Discord · sign out'))
            : h('small', {}, 'Guest · this browser'))));
    store.subscribe((s, prev) => {
      if (s.empire !== prev.empire || s.economy.colonies !== prev.economy.colonies) this.renderStats(s);
      if (s.turn !== prev.turn) this.renderTurn(s.turn);
      if (s.explored !== prev.explored || s.openedCrates !== prev.openedCrates) this.renderLoot(s);
      if (s.identity !== prev.identity) this.renderEmpire(s);
    });
    this.renderEmpire(store.state);
    this.renderStats(store.state);
    this.renderTurn(store.state.turn);
    const tickClock = () => this.renderClock();
    tickClock();
    setInterval(tickClock, 250);
  }

  setGalaxyMode(on: boolean): void {
    this.viewLabel.textContent = on ? 'Hex' : 'Galaxy';
    this.viewBtn.firstElementChild!.replaceWith(icon(on ? 'hex' : 'galaxy'));
  }

  /** A tab that manages its own drawer (e.g. Chat), added after the game tabs. */
  addTab(tab: HTMLElement): void {
    this.el.querySelector('nav.tabs')?.append(tab);
  }

  setActivePanel(id: PanelId | null): void {
    (Object.keys(this.tabs) as PanelId[]).forEach((k) => this.tabs[k].classList.toggle('active', k === id));
  }

  private renderEmpire(s: GameState): void {
    const id = s.identity;
    this.empireBtn.hidden = !id;
    if (!id) return;
    this.empireBtn.style.setProperty('--empire', id.color);
    this.empireBtn.replaceChildren(flagEl(id.flag, 30), h('span', { class: 'empire-name' }, id.name));
  }

  private renderLoot(s: GameState): void {
    const n = Object.entries(s.explored).filter(([id, r]) => r.crate && !s.openedCrates.includes(id)).length;
    this.lootBadge.hidden = n === 0;
    this.lootBadge.textContent = String(n);
    this.lootBadge.title = `${n} unopened loot crate${n === 1 ? '' : 's'}`;
  }

  /** Countdown to the next year (the next server tick). */
  private renderClock(): void {
    const f = this.clock.fraction();
    const left = Math.ceil((1 - f) * this.clock.config.msPerTick / 1000);
    this.ring.style.setProperty('--p', String(f));
    if (left === this.lastLeft) return;
    this.lastLeft = left;
    this.countdown.textContent = `next ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  }

  private renderTurn(turn: number): void {
    this.turnNum.textContent = turn.toLocaleString('en-US');
    this.turnNum.classList.remove('tick');
    void this.turnNum.offsetWidth;
    this.turnNum.classList.add('tick');
  }

  private renderStats(s: GameState): void {
    const m = s.empire.materials;
    const caps = this.caps();
    const items: Array<[string, Resource]> = [['Credits', 'credits'], ['Influence', 'influence'], ['Food', 'food'], ['Metals', 'metals'], ['Volatiles', 'volatiles'], ['Crystals', 'crystals'], ['Exotics', 'exotics']];
    this.stats.replaceChildren(...items.map(([label, r]) => {
      const cap = caps[r];
      const full = cap !== undefined && m[r] >= cap;
      return h('div', { class: `stat ${full ? 'full' : ''}`, title: cap !== undefined ? `${label}: ${fmt(m[r])} of ${fmt(cap)} storage${full ? ' (full: income is lost)' : ''}` : label, 'aria-label': `${label} ${fmt(m[r])}` },
        resourceIcon(r, 18), h('span', { class: 'stat-value' }, fmt(m[r])));
    }));
  }
}
