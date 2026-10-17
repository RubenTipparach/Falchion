import type { ResearchState } from '../research/types';
import { EMPTY_RESEARCH } from '../research/types';

export type Material = 'metals' | 'crystals' | 'exotics' | 'credits';

export interface EmpireState {
  readonly name: string;
  readonly research: ResearchState;
  readonly materials: Readonly<Record<Material, number>>;
  readonly chassis: readonly string[];
  readonly parts: readonly string[];
  /** Abstract combat strength used by encounter resolution. */
  readonly fleetPower: number;
}

export function newEmpire(name: string): EmpireState {
  return {
    name,
    research: EMPTY_RESEARCH,
    materials: { metals: 200, crystals: 50, exotics: 0, credits: 500 },
    chassis: [],
    parts: [],
    fleetPower: 10,
  };
}
