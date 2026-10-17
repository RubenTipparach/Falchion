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
