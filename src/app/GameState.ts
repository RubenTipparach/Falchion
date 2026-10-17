import type { EmpireState } from '../core/empire/Empire';
import type { EncounterResult } from '../core/encounters/types';
import type { StarSystem } from '../core/galaxy/GalaxyModel';
import type { ShipDesign } from '../core/ships/ShipDesign';
import type { FleetView } from '../render/map/FleetLayer';

export interface GameState {
  /** Current world turn. Fleets move a whole number of hexes per turn. */
  readonly turn: number;
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

export function formatTurn(turn: number): string {
  return `Turn ${turn.toLocaleString('en-US')}`;
}
