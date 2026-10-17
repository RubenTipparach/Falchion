import type { Squadron } from '../core/combat/Combat';
import type { LogisticsSpec } from '../core/fleet/Logistics';
import { SHIP_CLASSES, type Doctrine, type ShipClassDef } from './shipClasses';

/** Ammunition per armed ship, by doctrine. Barrage burns through magazines fastest. */
const AMMO: Readonly<Record<Doctrine, { ammo: number; use: number }>> = {
  long: { ammo: 6, use: 2 },
  short: { ammo: 6, use: 2 },
  barrage: { ammo: 6, use: 3 },
  siege: { ammo: 8, use: 2 },
  suppression: { ammo: 6, use: 2 },
  capture: { ammo: 4, use: 2 },
  assault: { ammo: 4, use: 2 },
  support: { ammo: 4, use: 2 },
  civilian: { ammo: 0, use: 0 },
};

/** Supply per ship: survey hulls are purpose-built to explore. */
const SUPPLY_OVERRIDES: Readonly<Record<string, number>> = { 'survey-cutter': 12, pathfinder: 8, 'colony-ark': 6 };
const SUPPLY_BY_ROLE = { mining: 2, logistics: 3, combat: 2, capital: 4 } as const;

export function logisticsOf(c: ShipClassDef): LogisticsSpec {
  const armed = c.attack > 0 && c.role !== 'logistics' && c.role !== 'mining';
  const a = armed ? AMMO[c.doctrine] : { ammo: 0, use: 0 };
  const scale = c.role === 'capital' ? 2 : 1;
  return {
    supply: SUPPLY_OVERRIDES[c.id] ?? SUPPLY_BY_ROLE[c.role],
    ammo: a.ammo * scale,
    ammoUse: a.use * scale,
    ammoRegen: armed ? scale : 0,
  };
}

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
