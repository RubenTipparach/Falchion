import type { Squadron } from '../core/combat/Combat';
import type { LogisticsSpec } from '../core/fleet/Logistics';
import { SHIP_CLASSES, type ShipClassDef } from './shipClasses';

/** Supply per ship: survey hulls are purpose-built to explore. */
const SUPPLY_OVERRIDES: Readonly<Record<string, number>> = { 'survey-cutter': 12, pathfinder: 8, 'colony-ark': 6 };
const SUPPLY_BY_ROLE = { mining: 2, logistics: 3, combat: 2, capital: 4 } as const;

export function logisticsOf(c: ShipClassDef): LogisticsSpec {
  return { supply: SUPPLY_OVERRIDES[c.id] ?? SUPPLY_BY_ROLE[c.role] };
}

/**
 * Hull points a fleet on station repairs on each damaged ship class per year, by what the system
 * has: a shipyard world repairs fully, other colonies quickly, outposts (supply depots) and
 * allies' worlds slowly.
 */
export const REPAIR = { shipyard: Infinity, colony: 40, depot: 15, ally: 15 } as const;
export type RepairSite = keyof typeof REPAIR;

const SPECS = new Map(SHIP_CLASSES.map((c) => [c.id, logisticsOf(c)]));
export const specOf = (classId: string): LogisticsSpec | undefined => SPECS.get(classId);

/** Ships that explore well enough to form a survey group. */
export const isSurveyClass = (c: ShipClassDef): boolean => (SUPPLY_OVERRIDES[c.id] ?? 0) >= 8;
export const isWarship = (c: ShipClassDef): boolean => (c.role === 'combat' || c.role === 'capital') && c.attack > 0;
const WARSHIP_IDS = new Set(SHIP_CLASSES.filter(isWarship).map((c) => c.id));

/** The warships in a squadron list: what a fleet fights with. */
export const warshipsOf = (ships: readonly Squadron[]): Squadron[] => ships.filter((x) => x.count > 0 && WARSHIP_IDS.has(x.classId));
export const hasWarships = (ships: readonly Squadron[]): boolean => warshipsOf(ships).length > 0;

/** Years (minutes) a hull takes at a shipyard: bigger, costlier hulls take longer. */
export function buildYears(c: ShipClassDef): number {
  const total = Object.values(c.cost).reduce((a, n) => a + (n ?? 0), 0);
  return Math.max(1, Math.round(total / 100));
}

/** Credits per year to keep a ship in service. */
export function upkeepOf(c: ShipClassDef): number {
  return c.role === 'capital' ? 8 : c.role === 'combat' ? 2 : 1;
}
