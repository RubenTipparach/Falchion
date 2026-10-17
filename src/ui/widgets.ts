import type { Squadron } from '../core/combat/Combat';
import { BUILDINGS, BuildingDef, slotsOf } from '../content/buildings';
import { RESOURCES, Resource } from '../content/resources';
import { SHIP_CLASSES } from '../content/shipClasses';
import { Colony, colonyYield, EconomyTables } from '../core/economy/Economy';
import type { Job } from '../core/construction/Construction';
import { formatDuration } from '../core/time/WorldTime';
import { CLOCK } from '../app/WorldClock';
import type { FleetGroup } from './GameActions';
import { fmt, h } from './dom';
import { icon, resourceIcon } from './icons';
import type { Card, LootCrate } from '../core/encounters/types';

const nameOf = (id: string) => SHIP_CLASSES.find((c) => c.id === id)?.name ?? id;

/**
 * Small icon button that moves the camera to something: a click centres on it without
 * zooming all the way in; a double-click (or double-tap) also dives in close.
 */
export function locateButton(title: string, go: (closeUp: boolean) => void): HTMLElement {
  const label = `${title} (double-click to zoom in)`;
  return h('button', { class: 'icon-btn locate', title: label, 'aria-label': label,
    onclick: (e: Event) => { e.stopPropagation(); go(false); },
    ondblclick: (e: Event) => { e.stopPropagation(); go(true); } }, icon('locate'));
}

/** Supply and ammunition gauges for a group. */
export function storesView(g: Pick<FleetGroup, 'stores' | 'capacity'>): HTMLElement {
  const bar = (kind: 'supply' | 'ammo', have: number, max: number) =>
    h('div', { class: `gauge ${kind} ${max && have / max < 0.25 ? 'low' : ''}`, title: `${kind === 'supply' ? 'Supply (spent exploring)' : 'Ammunition (spent in battle)'}: ${have} of ${max}` },
      icon(kind), h('span', { class: 'track' }, h('i', { style: `width:${max ? (have / max) * 100 : 0}%` })), h('span', { class: 'mono' }, `${have}/${max}`));
  return h('div', { class: 'gauges' }, bar('supply', g.stores.supply, g.capacity.supply), g.capacity.ammo ? bar('ammo', g.stores.ammo, g.capacity.ammo) : null);
}

export function shipsText(ships: readonly Squadron[]): string {
  return ships.length ? ships.map((s) => `${s.count} × ${nameOf(s.classId)}`).join(', ') : 'No ships';
}

/** A colony's buildings, free slots and a build menu. */
/** Research gates for the build menu: whether a building is unlocked, and a way to the research it needs. */
export interface BuildGates {
  unlocked(buildingId: string): boolean;
  openResearch(nodeId: string): void;
  nodeName(nodeId: string): string;
}

export function colonyView(c: Colony, stock: Readonly<Record<Resource, number>>, build: (buildingId: string) => void, tables: EconomyTables, queued: readonly Job[] = [], turn = 0, gates?: BuildGates): HTMLElement {
  const have = c.buildings ?? [];
  const pending = queued.filter((j) => j.kind === 'building');
  const slots = slotsOf(c.size ?? 3, c.capital);
  const y = colonyYield(c, tables);
  const out = Object.entries(y.income).filter(([, n]) => n).map(([r, n]) => `${n! > 0 ? '+' : ''}${n} ${RESOURCES.find((x) => x.id === r)?.short ?? r}`);
  if (y.science) out.push(`+${y.science} SCI`);
  const costText = (b: BuildingDef) => Object.entries(b.cost).map(([r, n]) => `${n} ${RESOURCES.find((x) => x.id === r)?.short ?? r}`).join(' ');
  const affordable = (b: BuildingDef) => Object.entries(b.cost).every(([r, n]) => stock[r as Resource] >= n!);
  const free = slots - have.length - pending.length;
  return h('div', { class: 'colony' },
    h('div', { class: 'small' }, h('b', {}, 'Output '), out.join('  ') || '—', h('span', { class: 'muted' }, ' / yr')),
    h('div', { class: 'buildings' },
      ...have.map((id) => h('span', { class: 'building', title: BUILDINGS.find((b) => b.id === id)?.blurb ?? '' }, BUILDINGS.find((b) => b.id === id)?.name ?? id)),
      ...pending.map((j) => h('span', { class: 'building pending', title: j.startTurn > turn ? 'Queued' : 'Under construction' }, `⏳ ${BUILDINGS.find((b) => b.id === j.item)?.name ?? j.item} · ${formatDuration(j.doneTurn - turn, CLOCK)}`)),
      ...Array.from({ length: Math.max(0, free) }, () => h('span', { class: 'building empty' }, 'Empty slot'))),
    free > 0 ? h('div', { class: 'build-menu' }, ...BUILDINGS.filter((b) => !(b.unique && (have.includes(b.id) || pending.some((j) => j.item === b.id)))).map((b) =>
      gates && b.unlock && !gates.unlocked(b.id)
        // Locked: the button leads to the research it needs.
        ? h('button', { class: 'btn locked-build', title: `Needs research: ${gates.nodeName(b.unlock)}. Open it in the research tree.`, onclick: () => gates.openResearch(b.unlock!) },
          icon('lock'), ` ${b.name}`, h('small', {}, `Research ${gates.nodeName(b.unlock)} → · ${b.blurb}`))
        : h('button', { class: 'btn', disabled: !affordable(b), title: b.blurb, onclick: () => build(b.id) }, icon('build'), ` ${b.name}`, h('small', {}, `${costText(b)} · ${formatDuration(b.years, CLOCK)} · ${b.blurb}`)))) : h('p', { class: 'small muted' }, 'All building slots used.'));
}

/** Resources as icon + amount chips, e.g. what a planet's cache holds. */
export function haulView(haul: Partial<Record<Resource, number>>): HTMLElement {
  const items = Object.entries(haul).filter(([, n]) => n) as Array<[Resource, number]>;
  return h('span', { class: 'haul-chips' }, ...(items.length
    ? items.map(([r, n]) => h('span', { class: 'haul-chip', title: RESOURCES.find((x) => x.id === r)?.name ?? r }, resourceIcon(r, 14), `+${fmt(n)} ${RESOURCES.find((x) => x.id === r)?.short ?? r}`))
    : ['—']));
}

/** A loot crate in one line: its tier and size until opened, then what it gave. */
export function crateLine(crate: LootCrate, opened: boolean): string {
  if (!opened) return `${crate.tier} crate · ${crate.cards.length} card${crate.cards.length === 1 ? '' : 's'} · Collect to open`;
  const count = (t: Card['type']) => crate.cards.filter((c) => c.type === t).length;
  const parts = [
    count('shards') ? `${count('shards')} research shard card${count('shards') > 1 ? 's' : ''}` : '',
    count('chassis') ? `${count('chassis')} ship blueprint${count('chassis') > 1 ? 's' : ''}` : '',
    count('part') ? `${count('part')} part${count('part') > 1 ? 's' : ''}` : '',
    count('materials') ? `${count('materials')} material card${count('materials') > 1 ? 's' : ''}` : '',
  ].filter(Boolean);
  return `${crate.tier} crate opened · ${parts.join(', ')}`;
}
