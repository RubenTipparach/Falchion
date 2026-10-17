import type { EmpireState } from '../core/empire/Empire';
import type { EncounterResult } from '../core/encounters/types';
import type { StarSystem } from '../core/galaxy/GalaxyModel';
import type { ShipDesign } from '../core/ships/ShipDesign';
import type { FleetView } from '../render/map/FleetLayer';

export interface GameState {
  readonly day: number;
  /** Game days per real second (0 = paused). */
  readonly speed: number;
  readonly empire: EmpireState;
  readonly design: ShipDesign;
  /** Research traits the player chose to show on their ships. */
  readonly hiddenTraits: readonly string[];
  readonly home: StarSystem;
  readonly selected: StarSystem | null;
  readonly explored: Readonly<Record<string, EncounterResult>>;
  readonly fleets: readonly FleetView[];
  readonly contact: string | null;
  readonly playerName: string;
  readonly log: readonly string[];
}

export const START_YEAR = 3047;

export function formatDate(day: number): string {
  const year = START_YEAR + Math.floor(day / 365);
  return `GY ${year} · day ${Math.floor(day % 365) + 1}`;
}
