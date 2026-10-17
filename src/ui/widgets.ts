import type { Squadron } from '../core/combat/Combat';
import { BUILDINGS, BuildingDef, slotsOf } from '../content/buildings';
import { RESOURCES, Resource } from '../content/resources';
import { SHIP_CLASSES } from '../content/shipClasses';
import { Colony, colonyYield, EconomyTables } from '../core/economy/Economy';
import type { FleetGroup } from './GameActions';
import { h } from './dom';
import { icon } from './icons';

const nameOf = (id: string) => SHIP_CLASSES.find((c) => c.id === id)?.name ?? id;

/** Small icon button that flies the camera somewhere. */
export function locateButton(title: string, onclick: () => void): HTMLElement {
  return h('button', { class: 'icon-btn locate', title, 'aria-label': title, onclick: (e: Event) => { e.stopPropagation(); onclick(); } }, icon('locate'));
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
export function colonyView(c: Colony, stock: Readonly<Record<Resource, number>>, build: (buildingId: string) => void, tables: EconomyTables): HTMLElement {
  const have = c.buildings ?? [];
  const slots = slotsOf(c.size ?? 3, c.capital);
  const y = colonyYield(c, tables);
  const out = Object.entries(y.income).filter(([, n]) => n).map(([r, n]) => `${n! > 0 ? '+' : ''}${n} ${RESOURCES.find((x) => x.id === r)?.short ?? r}`);
  if (y.science) out.push(`+${y.science} SCI`);
  const costText = (b: BuildingDef) => Object.entries(b.cost).map(([r, n]) => `${n} ${RESOURCES.find((x) => x.id === r)?.short ?? r}`).join(' ');
  const affordable = (b: BuildingDef) => Object.entries(b.cost).every(([r, n]) => stock[r as Resource] >= n!);
  const free = slots - have.length;
  return h('div', { class: 'colony' },
    h('div', { class: 'small' }, h('b', {}, 'Output '), out.join('  ') || '—', h('span', { class: 'muted' }, ' / turn')),
    h('div', { class: 'buildings' },
      ...have.map((id) => h('span', { class: 'building', title: BUILDINGS.find((b) => b.id === id)?.blurb ?? '' }, BUILDINGS.find((b) => b.id === id)?.name ?? id)),
      ...Array.from({ length: Math.max(0, free) }, () => h('span', { class: 'building empty' }, 'Empty slot'))),
    free > 0 ? h('div', { class: 'build-menu' }, ...BUILDINGS.filter((b) => !(b.unique && have.includes(b.id))).map((b) =>
      h('button', { class: 'btn', disabled: !affordable(b), title: b.blurb, onclick: () => build(b.id) }, icon('build'), ` ${b.name}`, h('small', {}, `${costText(b)} · ${b.blurb}`)))) : h('p', { class: 'small muted' }, 'All building slots used.'));
}
