import type { GameState } from '../../app/GameState';
import type { Store } from '../../app/Store';
import { isSurveyClass, isWarship, specOf } from '../../content/logistics';
import { SHIP_CLASSES } from '../../content/shipClasses';
import type { Squadron } from '../../core/combat/Combat';
import { capacity } from '../../core/fleet/Logistics';
import { MINE_REACH, minedBy } from '../../core/fleet/AutoMine';
import { formatDuration } from '../../core/time/WorldTime';
import { CLOCK } from '../../app/WorldClock';
import type { StarSystem } from '../../core/galaxy/GalaxyModel';
import { Drawer } from '../Drawer';
import type { FleetGroup, GameActions, GameQueries } from '../GameActions';
import { clear, h } from '../dom';
import { icon } from '../icons';
import { locateButton, shipsText, storesView } from '../widgets';

const classOf = (id: string) => SHIP_CLASSES.find((c) => c.id === id)!;

/** Every group of ships: where it is, its supply and hull, and orders. */
export class FleetsPanel extends Drawer {
  private picked: Record<string, number> = {};

  constructor(private readonly store: Store<GameState>, private readonly actions: GameActions, private readonly q: GameQueries) {
    super('fleets', 'Fleets', 'Ships act only where they are. Supply is spent exploring and refills in friendly systems. Damage stays with your ships until they repair: fully at a shipyard world, faster at a colony than at an outpost, and Menders patch it anywhere.', true);
    store.subscribe((s, prev) => {
      if (this.opened && (s.fleets !== prev.fleets || s.loadouts !== prev.loadouts || s.turn !== prev.turn || s.selected !== prev.selected || s.economy.roster !== prev.economy.roster || s.dockSpent !== prev.dockSpent || s.construction !== prev.construction)) this.render();
    });
  }

  protected onOpen(): void {
    this.picked = {};
    this.render();
  }

  private render(): void {
    const s = this.store.state;
    const target = s.selected && s.selected.id !== s.home.id ? s.selected : null;
    const groups = this.q.groups();
    clear(this.body);
    this.body.append(this.formFleet(groups[0], target));
    for (const g of groups.slice(1)) this.body.append(this.card(g, target));
    if (groups.length === 1) this.body.append(h('p', { class: 'muted' }, 'No fleets deployed.'));
  }

  private where(g: FleetGroup): string {
    const name = g.star?.name ?? 'deep space';
    if (g.id === 'dock') return `Docked at ${name}`;
    return g.stationed ? `On station at ${name}` : `En route to ${name} · ETA ${formatDuration(g.eta, CLOCK)}`;
  }

  private card(g: FleetGroup, target: StarSystem | null): HTMLElement {
    const s = this.store.state;
    const atHome = g.stationed && g.star?.id === s.home.id;
    return h('section', { class: 'group-card' },
      h('header', {}, icon('fleet'), h('h4', {}, g.name),
        g.friendly ? h('span', { class: 'tag good', title: (g.hull ?? 1) < 1 ? 'Refills supply and repairs every year' : 'Refills supply every year' }, (g.hull ?? 1) < 1 ? 'REPAIRING' : 'RESUPPLYING') : null,
        locateButton(`Locate ${g.name}`, (closeUp) => this.actions.focusFleet(g.id, closeUp))),
      h('div', { class: 'where' }, this.where(g)),
      h('div', { class: 'small' }, shipsText(g.ships)),
      storesView(g),
      g.capacity.supply && g.stores.supply === 0 ? h('div', { class: 'notice warn' }, 'Out of supply: cannot explore. Return home or reach a friendly system to resupply.') : null,
      h('div', { class: 'row orders' }, h('span', { class: 'small muted' }, 'Standing orders:'),
        this.order(g, 'autoExplore', 'Auto-explore', 'Survey unexplored planets wherever it is on station'),
        this.order(g, 'autoReturn', 'Return to resupply', 'Head home when it can explore nothing more here'),
        minedBy(g.ships, (id) => classOf(id).mines).length ? this.order(g, 'autoMine', 'Auto-mine', `When its fields run dry, move on to the nearest field with rocks left (within ${MINE_REACH} ly)`) : null),
      h('div', { class: 'row' },
        target && target.id !== g.star?.id ? h('button', { class: 'btn primary', onclick: () => this.actions.moveFleet(g.id, target) }, icon('fleet'), ` Send to ${target.name}`) : null,
        !atHome ? h('button', { class: 'btn', onclick: () => this.actions.returnHome(g.id) }, icon('home'), ' Return home') : null,
        atHome ? h('button', { class: 'btn', onclick: () => this.actions.dockFleet(g.id) }, 'Dock (merge into home dock)') : null));
  }

  private order(g: FleetGroup, key: 'autoExplore' | 'autoReturn' | 'autoMine', label: string, title: string): HTMLElement {
    const on = !!g.orders?.[key];
    return h('button', { class: `chip ${on ? 'active' : ''}`, title, 'aria-pressed': String(on), onclick: () => this.actions.setOrders(g.id, { ...g.orders, [key]: !on }) }, on ? `✓ ${label}` : label);
  }

  private formFleet(dock: FleetGroup, target: StarSystem | null): HTMLElement {
    const ships = dock.ships;
    const chosen = (): Squadron[] => Object.entries(this.picked).filter(([, n]) => n > 0).map(([classId, count]) => ({ classId, count }));
    const preview = h('div', {});
    const updatePreview = () => {
      clear(preview);
      const c = capacity(chosen(), specOf);
      preview.append(h('div', { class: 'small muted' }, chosen().length ? `New fleet carries ${c.supply} supply.` : 'Pick ships to launch.'));
    };
    const preset = (label: string, pick: (id: string) => boolean) => h('button', { class: 'chip', onclick: () => { this.picked = Object.fromEntries(ships.filter((x) => pick(x.classId)).map((x) => [x.classId, x.count])); this.render(); } }, label);
    const sliders = ships.map((x) => {
      const input = h('input', { type: 'range', min: 0, max: x.count, step: 1, value: this.picked[x.classId] ?? 0 }) as HTMLInputElement;
      const out = h('output', {}, String(this.picked[x.classId] ?? 0));
      input.addEventListener('input', () => { this.picked[x.classId] = Number(input.value); out.textContent = input.value; updatePreview(); });
      return h('label', { class: 'slider' }, h('span', { title: classOf(x.classId).blurb }, classOf(x.classId).name), input, out);
    });
    updatePreview();
    return h('section', { class: 'group-card' },
      h('header', {}, icon('home'), h('h4', {}, dock.name), h('span', { class: 'tag good' }, 'RESUPPLYING'), locateButton('Locate home', (closeUp) => this.actions.focusFleet('dock', closeUp))),
      h('div', { class: 'where' }, `${this.where(dock)} · ${shipsText(ships)}`),
      storesView(dock),
      h('h4', {}, 'Form a fleet'),
      ships.length ? h('div', { class: 'row' },
        preset('Survey ships', (id) => isSurveyClass(classOf(id))),
        preset('Warships', (id) => isWarship(classOf(id))),
        preset('Colony & construction', (id) => id === 'colony-ark' || id === 'construction-tender'),
        preset('Miners', (id) => !!classOf(id).mines)) : null,
      ...sliders,
      preview,
      target
        ? h('button', { class: 'btn primary wide', onclick: () => { const c = chosen(); if (c.length) { this.actions.formFleet(c, target); this.picked = {}; } } }, icon('fleet'), ` Launch to ${target.name}`)
        : h('div', { class: 'notice' }, 'Select a destination star on the map, then launch.'));
  }
}
