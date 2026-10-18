import type { GameState } from '../../app/GameState';
import type { Store } from '../../app/Store';
import type { Card } from '../../core/encounters/types';
import type { Planet } from '../../core/galaxy/Planets';
import type { StarSystem } from '../../core/galaxy/GalaxyModel';
import type { TechTree } from '../../core/research/TechTree';
import { BIOMES } from '../../content/biomes';
import { ENCOUNTER_KINDS } from '../../content/encounters';
import { SHIP_CLASSES } from '../../content/shipClasses';
import { RESOURCES } from '../../content/resources';
import { Drawer } from '../Drawer';
import type { FleetGroup, GameActions, GameQueries } from '../GameActions';
import { exploreCost } from '../../core/fleet/Logistics';
import { countOf } from '../../core/fleet/Presence';
import { locateButton, storesView } from '../widgets';
import { clear, fmt, h } from '../dom';
import { collectWithFx } from '../collectFx';
import { icon, IconName } from '../icons';
import { thumb } from '../thumbs';



/** Explore planets of the selected system; encounters award loot crates of cards. */
export class ExplorePanel extends Drawer {
  constructor(private readonly store: Store<GameState>, private readonly actions: GameActions, private readonly q: GameQueries, private readonly planetsOf: (s: StarSystem) => Planet[], private readonly tree: TechTree, private readonly thumb: (p: Planet) => string) {
    super('explore', 'Exploration', 'Ships on station spend supply to survey planets: trade, battle, relations, anomalies and derelicts. Success yields loot crates and a one-time resource cache.');
    store.subscribe((s, prev) => {
      if ((s.selected !== prev.selected || s.explored !== prev.explored || s.empire !== prev.empire || s.openedCrates !== prev.openedCrates || s.collectedCaches !== prev.collectedCaches || s.loadouts !== prev.loadouts || s.turn !== prev.turn || s.economy.colonies !== prev.economy.colonies) && this.opened) this.render();
    });
  }

  protected onOpen(): void {
    this.render();
  }

  private render(): void {
    const s = this.store.state;
    const star = s.selected ?? s.home;
    clear(this.body);
    const planets = this.planetsOf(star);
    const unexplored = planets.filter((p) => !s.explored[p.id] && !this.q.colonyAt(p.id));
    const unopened = Object.entries(s.explored).filter(([id, r]) => r.crate && !s.openedCrates.includes(id)).length;
    const caches = this.q.pendingCaches(star);
    const haul = caches.reduce<Record<string, number>>((acc, c) => { for (const [r, n] of Object.entries(c.cache)) acc[r] = (acc[r] ?? 0) + n!; return acc; }, {});
    const haulText = Object.entries(haul).map(([r, n]) => `${fmt(n)} ${RESOURCES.find((x) => x.id === r)?.short ?? r}`).join(' · ');
    const groups = this.q.groupsAt(star);
    const supply = groups.reduce((n, g) => n + g.stores.supply, 0);
    const need = unexplored.reduce((n, p) => n + exploreCost(p), 0);
    this.body.append(
      h('div', { class: 'row-between' },
        h('p', { class: 'muted' }, `System: `, h('b', {}, star.name), star.id === s.home.id ? ' (home)' : '', ' — select another star on the map to explore it.'),
        locateButton(`Locate ${star.name}`, (closeUp) => this.actions.flyTo(star, closeUp))),
      groups.length
        ? h('div', {}, ...groups.map((g) => h('div', { class: 'group-card' }, h('header', {}, icon('fleet'), h('h4', {}, g.name), locateButton(`Locate ${g.name}`, (closeUp) => this.actions.focusFleet(g.id, closeUp))), storesView(g))))
        : h('div', { class: 'notice warn' }, `No ships on station in ${star.name}. Exploring needs a ship here with supply; survey ships carry the most.`,
          h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => { this.actions.select(star); this.actions.openPanel('fleets'); } }, icon('fleet'), ' Send a fleet here'))),
      h('div', { class: 'loot-bar' },
        h('button', { class: 'btn', disabled: !unexplored.length || !supply, title: `Needs ${need} supply in total`, onclick: () => this.actions.exploreAll(star) }, icon('explore'),
          unexplored.length ? ` Explore all ${unexplored.length} (${need} supply)` : ' All planets explored'),
        // Collecting happens on each planet below; this gathers every world here at once.
        caches.length + unopened > 1 ? h('button', { class: 'btn', title: haulText, onclick: (e: Event) => collectWithFx(e.currentTarget as Element, () => this.actions.collectResources(star)) }, icon('crate'), ' Collect all') : ''),
      caches.length ? h('p', { class: 'small haul' }, 'Waiting: ', haulText, unopened ? ` · ${unopened} crate${unopened > 1 ? 's' : ''}` : '') : '',
    );
    if (!planets.length) this.body.append(h('p', {}, 'No planets in this system.'));
    for (const p of planets) this.body.append(this.planetCard(star, p, groups));
    this.body.append(this.inventory());
  }

  private planetCard(star: StarSystem, p: Planet, groups: FleetGroup[]): HTMLElement {
    const s = this.store.state;
    const result = s.explored[p.id];
    const biome = BIOMES.find((b) => b.id === p.biome)!;
    const colony = this.q.colonyAt(p.id);
    const cost = exploreCost(p);
    const canExplore = groups.some((g) => g.stores.supply >= cost);
    const ark = groups.some((g) => countOf(g.ships, 'colony-ark') > 0);
    const card = h('div', { class: 'planet-card' },
      h('div', { class: 'pc-head' },
        h('img', { class: 'planet-thumb', src: this.thumb(p), alt: `${p.name}, ${biome.name}` }),
        h('div', {}, h('b', {}, p.name), colony ? h('span', { class: 'tag good' }, 'COLONY') : null, h('div', { class: 'muted small' }, `${biome.name} · size ${p.size}`)),
        locateButton(`Zoom to ${p.name}`, () => this.actions.focusPlanet(star, p)),
        !result && !colony ? h('button', { class: 'btn primary', disabled: !canExplore, title: canExplore ? '' : 'Needs a ship on station with enough supply', onclick: () => this.actions.explore(p) }, `Explore · ${cost}`, icon('supply')) : null,
        this.collectButton(star, p)));
    if (result) {
      const kind = ENCOUNTER_KINDS.find((k) => k.id === result.kind)!;
      card.append(
        h('div', { class: `encounter ${result.success ? 'ok' : 'bad'}` },
          h('div', { class: 'enc-kind' }, thumb('event', kind.id, 44), ' ', kind.name, h('span', { class: 'muted small' }, ` · ${Math.round(result.successChance * 100)}% chance`)),
          h('p', {}, result.narrative),
          result.success ? h('p', { class: 'green' }, 'Success!') : h('p', { class: 'red' }, `Failure — ${result.cost?.description} (−${result.cost?.fleetPower} fleet power)`)));
      if (result.crate) card.append(this.crateView(p.id, result.crate.tier, result.crate.cards));
      if (!colony && p.biome !== 'gas') {
        card.append(h('div', { class: 'row' }, h('button', { class: 'btn', disabled: !ark, title: ark ? 'Uses one Colony Ark' : 'Needs a Colony Ark on station here', onclick: () => this.actions.settle(p) }, icon('build'), ark ? ' Settle colony' : ' Settle (needs a Colony Ark here)')));
      }
    }
    return card;
  }

  /** Collect on the planet that holds something: its resource cache and/or loot crate. */
  private collectButton(star: StarSystem, p: Planet): HTMLElement | null {
    const s = this.store.state;
    const cache = this.q.pendingCaches(star).find((c) => c.planet.id === p.id)?.cache;
    const crate = !!s.explored[p.id]?.crate && !s.openedCrates.includes(p.id);
    if (!cache && !crate) return null;
    const what = [
      ...Object.entries(cache ?? {}).map(([r, n]) => `+${fmt(n!)} ${RESOURCES.find((x) => x.id === r)?.short ?? r}`),
      ...(crate ? [`${s.explored[p.id].crate!.tier} crate`] : []),
    ].join(' · ');
    return h('button', { class: 'btn primary collect', title: `Collect ${what}`, onclick: (e: Event) => collectWithFx(e.currentTarget as Element, () => this.actions.collectPlanet(p)) }, icon('crate'), ' Collect');
  }

  private crateView(planetId: string, tier: string, cards: readonly Card[]): HTMLElement {
    const opened = this.store.state.openedCrates.includes(planetId);
    if (!opened) {
      // Unopened: the planet's Collect button opens it.
      return h('div', { class: `crate ${tier} closed` }, icon('crate'), `${tier} loot crate (${cards.length} cards) · Collect to open`);
    }
    return h('div', { class: 'cards' }, ...cards.map((c, i) => h('div', { class: `card ${c.rarity}`, style: `animation-delay:${i * 90}ms` },
      h('span', { class: 'card-rarity' }, c.rarity), h('span', { class: 'card-icon' }, cardThumb(c) ?? icon(cardIcon(c))), h('span', { class: 'card-text' }, this.cardText(c)))));
  }

  private cardText(c: Card): string {
    switch (c.type) {
      case 'shards': return `${c.amount} shards · ${this.tree.node(c.nodeId).name}`;
      case 'chassis': return `Ship class: ${SHIP_CLASSES.find((x) => x.id === c.id)?.name ?? c.id}`;
      case 'part': return `Part: ${c.id}`;
      case 'materials': return `${fmt(c.amount)} ${RESOURCES.find((r) => r.id === c.material)?.name.toLowerCase() ?? c.material}`;
    }
  }

  private inventory(): HTMLElement {
    const e = this.store.state.empire;
    return h('div', { class: 'inventory' }, h('h4', {}, 'Hangar'),
      h('p', { class: 'small' }, h('b', {}, 'Ship blueprints: '), e.chassis.length ? e.chassis.map((id) => SHIP_CLASSES.find((x) => x.id === id)?.name ?? id).join(', ') : '—'),
      h('p', { class: 'small' }, h('b', {}, 'Parts: '), e.parts.length ? e.parts.join(', ') : '—'));
  }
}

/** A rendered picture for a card that has one: the material, the ship class, the part. */
function cardThumb(c: Card): HTMLElement | null {
  if (c.type === 'materials') return thumb('resource', c.material, 40);
  if (c.type === 'chassis') return thumb('ship', c.id, 40);
  return null;
}

function cardIcon(c: Card): IconName {
  return c.type === 'shards' ? 'shard' : c.type === 'chassis' ? 'chassis' : c.type === 'part' ? 'part' : 'materials';
}
