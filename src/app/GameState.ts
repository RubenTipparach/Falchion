import type { EconomyState, TurnReport } from '../core/economy/Economy';
import type { EmpireState } from '../core/empire/Empire';
import type { EncounterResult } from '../core/encounters/types';
import type { StarSystem } from '../core/galaxy/GalaxyModel';
import type { Planet } from '../core/galaxy/Planets';
import type { Stores } from '../core/fleet/Logistics';
import type { Loadout } from '../core/fleet/Presence';
import type { ShipDesign } from '../core/ships/ShipDesign';
import type { FleetView } from '../render/map/FleetLayer';

/** Policy side of the economy; the stockpile lives on the empire. */
export type EconomySettings = Omit<EconomyState, 'stock'>;

export interface GameState {
  /** Current world turn. Fleets move a whole number of hexes per turn. */
  readonly turn: number;
  readonly empire: EmpireState;
  readonly economy: EconomySettings;
  /** One design per ship class; the shipyard edits the selected one. */
  readonly designs: Readonly<Record<string, ShipDesign>>;
  readonly shipyardClass: string;
  /** Research traits the player chose to hide on their ships. */
  readonly hiddenTraits: readonly string[];
  readonly home: StarSystem;
  readonly selected: StarSystem | null;
  /** Planet the camera is following in system view. */
  readonly selectedPlanet: Planet | null;
  readonly explored: Readonly<Record<string, EncounterResult>>;
  /** Planet ids whose loot crate has been opened. */
  readonly openedCrates: readonly string[];
  /** Planet ids whose one-time resource cache has been collected. */
  readonly collectedCaches: readonly string[];
  readonly fleets: readonly FleetView[];
  /** Ships, supply and ammunition of each of the player's deployed fleets (by fleet id). */
  readonly loadouts: Readonly<Record<string, Loadout>>;
  /** Supply and ammunition the home dock has used this turn (it refills every turn). */
  readonly dockSpent: Stores;
  /** Stars with a supply depot: friendly ports for resupply. */
  readonly depots: readonly string[];
  readonly contact: string | null;
  readonly playerName: string;
  readonly lastReport: TurnReport | null;
  /** Newest first. */
  readonly dispatches: ReadonlyArray<{ readonly turn: number; readonly text: string; readonly tone?: 'good' | 'bad' }>;
  /** War Room targets already engaged this turn. */
  readonly engaged: readonly string[];
}

export function formatTurn(turn: number): string {
  return `Turn ${turn.toLocaleString('en-US')}`;
}
