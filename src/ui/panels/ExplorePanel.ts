import type { GameState } from '../../app/GameState';
import type { Store } from '../../app/Store';
import type { Card } from '../../core/encounters/types';
import type { Planet } from '../../core/galaxy/Planets';
import type { StarSystem } from '../../core/galaxy/GalaxyModel';
import type { TechTree } from '../../core/research/TechTree';
import { BIOMES } from '../../content/biomes';
import { ENCOUNTER_KINDS } from '../../content/encounters';
import { Drawer } from '../Drawer';
import type { GameActions } from '../GameActions';
import { clear, fmt, h } from '../dom';

const KIND_ICON: Record<string, string> = { trade: '⚖', battle: '⚔', relations: '🕊', anomaly: '🌀', derelict: '🛰' };

/** Explore planets of the selected system; encounters award loot crates of cards. */
export class ExplorePanel extends Drawer {
  private readonly collected = new Set<string>();

  constructor(private readonly store: Store<GameState>, private readonly actions: GameActions, private readonly planetsOf: (s: StarSystem) => Planet[], private readonly tree: TechTree) {
    super('explore', 'Exploration', 'Visit planets for trade, battle, relations, anomalies and derelicts. Success yields loot crates of cards.');
    store.subscribe((s, prev) => {
      if ((s.selected !== prev.selected || s.explored !== prev.explored || s.empire !== prev.empire) && this.opened) this.render();
    });
  }

  protected onOpen(): void {
    this.render();
  }

  private render(): void {
    const s = this.store.state;
    const star = s.selected ?? s.home;
    clear(this.body);
    this.body.append(h('p', { class: 'muted' }, `System: `, h('b', {}, star.name), star.id === s.home.id ? ' (home)' : '', ' — select another star on the map to explore it.'));
    const planets = this.planetsOf(star);
    if (!planets.length) this.body.append(h('p', {}, 'No planets in this system.'));
    for (const p of planets) this.body.append(this.planetCard(p));
    this.body.append(this.inventory());
  }

  private planetCard(p: Planet): HTMLElement {
    const result = this.store.state.explored[p.id];
    const biome = BIOMES.find((b) => b.id === p.biome)!;
    const card = h('div', { class: 'planet-card' },
      h('div', { class: 'pc-head' },
        h('span', { class: 'planet big', style: `--c:${biome.color}` }),
        h('div', {}, h('b', {}, p.name), h('div', { class: 'muted small' }, `${biome.name} · size ${p.size}`)),
        !result ? h('button', { class: 'btn primary', onclick: () => this.actions.explore(p) }, 'Explore') : null));
    if (result) {
      const kind = ENCOUNTER_KINDS.find((k) => k.id === result.kind)!;
      card.append(
        h('div', { class: `encounter ${result.success ? 'ok' : 'bad'}` },
          h('div', { class: 'enc-kind' }, KIND_ICON[kind.id] ?? '?', ' ', kind.name, h('span', { class: 'muted small' }, ` · ${Math.round(result.successChance * 100)}% chance`)),
          h('p', {}, result.narrative),
          result.success ? h('p', { class: 'green' }, 'Success!') : h('p', { class: 'red' }, `Failure — ${result.cost?.description} (−${result.cost?.fleetPower} fleet power)`)));
      if (result.crate) card.append(this.crateView(p.id, result.crate.tier, result.crate.cards));
    }
    return card;
  }

  private crateView(planetId: string, tier: string, cards: readonly Card[]): HTMLElement {
    const opened = this.collected.has(planetId);
    if (!opened) {
      return h('button', { class: `crate ${tier}`, onclick: () => { this.collected.add(planetId); this.actions.collectCrate(planetId); this.render(); } },
        h('span', { class: 'crate-icon' }, '📦'), `Open ${tier} loot crate (${cards.length} cards)`);
    }
    return h('div', { class: 'cards' }, ...cards.map((c, i) => h('div', { class: `card ${c.rarity}`, style: `animation-delay:${i * 90}ms` },
      h('span', { class: 'card-rarity' }, c.rarity), h('span', { class: 'card-icon' }, cardIcon(c)), h('span', { class: 'card-text' }, this.cardText(c)))));
  }

  private cardText(c: Card): string {
    switch (c.type) {
      case 'shards': return `${c.amount} shards · ${this.tree.node(c.nodeId).name}`;
      case 'chassis': return `Chassis: ${c.id}`;
      case 'part': return `Part: ${c.id}`;
      case 'materials': return `${fmt(c.amount)} ${c.material}`;
    }
  }

  private inventory(): HTMLElement {
    const e = this.store.state.empire;
    return h('div', { class: 'inventory' }, h('h4', {}, 'Hangar'),
      h('p', { class: 'small' }, h('b', {}, 'Chassis: '), e.chassis.length ? e.chassis.join(', ') : '—'),
      h('p', { class: 'small' }, h('b', {}, 'Parts: '), e.parts.length ? e.parts.join(', ') : '—'));
  }
}

function cardIcon(c: Card): string {
  return c.type === 'shards' ? '🧩' : c.type === 'chassis' ? '🚀' : c.type === 'part' ? '⚙' : '⛏';
}
