import { DECLINE_PER_POP, growthNeeded, popCap, populationOf } from '../core/economy/Population';
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
import { thumb } from './thumbs';
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

const REPAIR_TEXT = { shipyard: 'repairs fully each year at the shipyard', colony: 'repairing at the colony', depot: 'repairing slowly at the outpost', ally: "repairing slowly at an ally's world" } as const;

/** Supply and hull gauges for a group: supply is spent exploring, hull is lost in battle and repaired in friendly systems. */
export function storesView(g: Pick<FleetGroup, 'stores' | 'capacity' | 'hull' | 'repair'>): HTMLElement {
  const supply = g.stores.supply, max = g.capacity.supply;
  const hull = Math.round((g.hull ?? 1) * 100);
  return h('div', { class: 'gauges' },
    h('div', { class: `gauge supply ${max && supply / max < 0.25 ? 'low' : ''}`, title: `Supply (spent exploring): ${supply} of ${max}` },
      icon('supply'), h('span', { class: 'track' }, h('i', { style: `width:${max ? (supply / max) * 100 : 0}%` })), h('span', { class: 'mono' }, `${supply}/${max}`)),
    h('div', { class: `gauge hull ${hull < 30 ? 'low' : hull < 60 ? 'mid' : ''}`, title: `Hull integrity: ${hull}%${hull < 100 && g.repair ? `, ${REPAIR_TEXT[g.repair]}` : hull < 100 ? '. Repairs in a friendly system (Menders patch it anywhere)' : ''}` },
      icon('hull'), h('span', { class: 'track' }, h('i', { style: `width:${hull}%` })), h('span', { class: 'mono' }, `${hull}%`)));
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

/**
 * A colony's output, buildings and build menu. `locate`, when given, adds a locate button to each
 * building that flies the camera to its model on the planet's surface.
 */
export function colonyView(c: Colony, stock: Readonly<Record<Resource, number>>, build: (buildingId: string) => void, tables: EconomyTables, queued: readonly Job[] = [], turn = 0, gates?: BuildGates, locate?: (buildingId: string) => void): HTMLElement {
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
    populationView(c, y.income.food ?? 0),
    h('div', { class: 'small' }, h('b', {}, 'Output '), out.join('  ') || '—', h('span', { class: 'muted' }, ' / yr')),
    h('div', { class: 'buildings' },
      ...have.map((id) => {
        const name = BUILDINGS.find((b) => b.id === id)?.name ?? id;
        return h('span', { class: 'building', title: BUILDINGS.find((b) => b.id === id)?.blurb ?? '' },
          thumb('building', id, 28), h('span', { class: 'building-name' }, name),
          locate ? locateButton(`Show the ${name} on the surface`, () => locate(id)) : '');
      }),
      ...pending.map((j) => h('span', { class: 'building pending', title: j.startTurn > turn ? 'Queued' : 'Under construction' }, `⏳ ${BUILDINGS.find((b) => b.id === j.item)?.name ?? j.item} · ${formatDuration(j.doneTurn - turn, CLOCK)}`)),
      ...Array.from({ length: Math.max(0, free) }, () => h('span', { class: 'building empty' }, 'Empty slot'))),
    free > 0 ? h('div', { class: 'build-menu' }, ...BUILDINGS.filter((b) => !(b.unique && (have.includes(b.id) || pending.some((j) => j.item === b.id)))).map((b) =>
      gates && b.unlock && !gates.unlocked(b.id)
        // Locked: the button leads to the research it needs.
        ? h('button', { class: 'btn locked-build', title: `Needs research: ${gates.nodeName(b.unlock)}. Open it in the research tree.`, onclick: () => gates.openResearch(b.unlock!) },
          icon('lock'), ` ${b.name}`, h('small', {}, `Research ${gates.nodeName(b.unlock)} → · ${b.blurb}`))
        : h('button', { class: 'btn', disabled: !affordable(b), title: b.blurb, onclick: () => build(b.id) }, thumb('building', b.id, 30), ` ${b.name}`, h('small', {}, `${costText(b)} · ${formatDuration(b.years, CLOCK)} · ${b.blurb}`)))) : h('p', { class: 'small muted' }, 'All building slots used.'));
}

/** A colony's population, its own food balance and how close it is to growing (or shrinking). */
function populationView(c: Colony, food: number): HTMLElement {
  const pop = populationOf(c), growth = c.growth ?? 0, cap = popCap(c);
  const need = growthNeeded(pop), floor = DECLINE_PER_POP * pop;
  const full = pop >= cap;
  const state = full ? `At its limit (${cap} for a world this size)`
    : food > 0 ? `Growing: ${Math.max(0, growth)} / ${need} food to population ${pop + 1}`
    : growth < 0 ? `Starving: ${-growth} / ${floor} short. It loses population if the empire runs out of food`
    : food < 0 ? 'Fed from the empire\'s stores: it will not grow until it makes its own surplus'
    : 'Not growing: it needs a food surplus of its own';
  const pct = full ? 100 : growth >= 0 ? (Math.max(0, growth) / need) * 100 : (-growth / floor) * 100;
  return h('div', { class: 'pop-line' },
    h('div', { class: 'row-between small' },
      h('span', {}, h('b', {}, `Population ${pop}`), h('span', { class: 'muted' }, ` · ${pop} ${pop === 1 ? 'city' : 'cities'}`)),
      h('span', { class: food > 0 ? 'green' : food < 0 ? 'red' : 'muted', title: 'Food this world makes minus what its population eats (2 each)' }, `${food > 0 ? '+' : ''}${food} food here`)),
    h('div', { class: `gauge pop ${growth < 0 ? 'low' : ''}`, title: state }, h('span', { class: 'track' }, h('i', { style: `width:${Math.min(100, pct)}%` }))),
    h('div', { class: 'small muted' }, state));
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

/**
 * Colony arks: colonists aboard (one colony's worth per ark), and Embark where a colony of yours can
 * spare people. Arks are not used up by settling; they come back for more (change commerce).
 */
export function colonistsView(g: FleetGroup, embark: () => void): HTMLElement | null {
  if (g.colonists === undefined || g.id === 'dock') return null;
  const arks = g.ships.find((x) => x.classId === 'colony-ark')?.count ?? 0;
  const room = arks - g.colonists;
  return h('div', { class: 'row colonists' },
    h('span', { class: 'small' }, `Colonists aboard: ${g.colonists} of ${arks}`),
    !g.company && room > 0 && g.stationed && g.friendly ? h('button', { class: 'chip', title: 'Load colonists from your colony here (only from a colony at its colonist floor or above; it loses one per ark)', onclick: embark }, 'Embark colonists') : null);
}
