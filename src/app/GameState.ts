import type { EconomyState, Flow, TurnReport } from '../core/economy/Economy';
import type { EmpireState } from '../core/empire/Empire';
import type { EmpireIdentity } from '../core/empire/Identity';
import type { EncounterResult } from '../core/encounters/types';
import type { StarSystem } from '../core/galaxy/GalaxyModel';
import type { Planet } from '../core/galaxy/Planets';
import type { Stores } from '../core/fleet/Logistics';
import type { Loadout } from '../core/fleet/Presence';
import type { BattleLogEntry } from '../core/combat/BattleLog';
import type { Job } from '../core/construction/Construction';
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
  /** Fleet the camera is following (its card replaces the star card). */
  readonly selectedFleet: string | null;
  /** Planet the camera is following in system view. */
  readonly selectedPlanet: Planet | null;
  /** The asteroid field whose card is open (view state: not saved). */
  readonly selectedField?: string | null;
  readonly explored: Readonly<Record<string, EncounterResult>>;
  /** Planet ids whose loot crate has been opened. */
  readonly openedCrates: readonly string[];
  /** Planet ids whose one-time resource cache has been collected. */
  readonly collectedCaches: readonly string[];
  readonly fleets: readonly FleetView[];
  /** Ships, supply and damage of each of the player's deployed fleets (by fleet id). */
  readonly loadouts: Readonly<Record<string, Loadout>>;
  /** Supply the home dock has used this turn (it refills every turn). */
  readonly dockSpent: Stores;
  /** Ships and buildings under construction. */
  readonly construction: readonly Job[];
  /** Stars with a supply depot: friendly ports for resupply. */
  readonly depots: readonly string[];
  readonly playerName: string;
  /** Name, ruler, capital, colour and flag; null until the empire is founded on the founding screen. */
  readonly identity: EmpireIdentity | null;
  readonly lastReport: TurnReport | null;
  /** Newest first. */
  readonly dispatches: ReadonlyArray<{ readonly turn: number; readonly text: string; readonly tone?: 'good' | 'bad' }>;
  /** War Room targets already engaged this turn. */
  readonly engaged: readonly string[];
  /** Reputation history for the chart: standing with each known NPC faction, sampled every few years. */
  readonly relations?: Relations;
  /** Raids on our worlds and fleets, battles at sea and our assaults, newest first (War Room › Battle log). */
  readonly battleLog?: readonly BattleLogEntry[];
  /** One-off changes to the stores (purchases, sales, loot, plunder), newest first: the resource ledger. */
  readonly flows?: readonly Flow[];
}

export interface Relations {
  /** Years of the samples (shared by every faction's series). */
  readonly years: readonly number[];
  /** Faction id -> standing at each sampled year (null before it was met). */
  readonly series: Readonly<Record<string, ReadonlyArray<number | null>>>;
}

export function formatTurn(turn: number): string {
  return `Turn ${turn.toLocaleString('en-US')}`;
}
