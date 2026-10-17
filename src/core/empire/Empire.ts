import type { Resource } from '../../content/resources';
import { START_RESOURCES } from '../../content/resources';
import type { ResearchState } from '../research/types';
import { EMPTY_RESEARCH } from '../research/types';

export type Material = Resource;

export interface EmpireState {
  readonly name: string;
  readonly research: ResearchState;
  /** The stockpile: minerals and currencies. */
  readonly materials: Readonly<Record<Resource, number>>;
  /** Extra ship classes and parts obtained from loot (research unlocks are derived). */
  readonly chassis: readonly string[];
  readonly parts: readonly string[];
  /** Abstract combat strength used by encounter resolution. */
  readonly fleetPower: number;
}

export function newEmpire(name: string): EmpireState {
  return { name, research: EMPTY_RESEARCH, materials: { ...START_RESOURCES }, chassis: [], parts: [], fleetPower: 10 };
}
