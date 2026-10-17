import type { AssaultResult, BattleResult, Squadron } from '../core/combat/Combat';
import type { Planet } from '../core/galaxy/Planets';
import type { Haul } from '../core/encounters/PlanetCache';
import type { StarSystem } from '../core/galaxy/GalaxyModel';
import type { ShipDesign } from '../core/ships/ShipDesign';

import type { Capacity, Stores } from '../core/fleet/Logistics';
import type { Colony } from '../core/economy/Economy';

export type PanelId = 'shipyard' | 'research' | 'empire' | 'war' | 'explore' | 'fleets';

/** A group of the player's ships in one place: the home dock or a deployed fleet. */
export interface FleetGroup {
  /** 'dock' for the home dock, else the fleet id. */
  readonly id: string;
  readonly name: string;
  readonly ships: readonly Squadron[];
  readonly stores: Stores;
  readonly capacity: Capacity;
  /** Star the group is at or heading to. */
  readonly star: StarSystem | null;
  /** On station (arrived), so it can act there. */
  readonly stationed: boolean;
  /** Turns until arrival (0 when on station). */
  readonly eta: number;
  readonly friendly: boolean;
}

/** Read-only game queries the panels use (implemented by the app layer). */
export interface GameQueries {
  groups(): FleetGroup[];
  /** Groups on station at a star (the dock counts at home). */
  groupsAt(star: StarSystem): FleetGroup[];
  colonyAt(planetId: string): Colony | undefined;
  /** Ship-building yards: colonies with a shipyard. */
  yards(): Colony[];
  /** Star a War Room target sits at. */
  targetStar(targetId: string): StarSystem;
  /** Is one of our ships inside this empire's space? */
  reached(empire: string): boolean;
  isFriendly(star: StarSystem): boolean;
  starById(id: string): StarSystem | null;
  isOwned(star: StarSystem): boolean;
  /** One-time resource caches waiting on newly explored planets of a system. */
  pendingCaches(star: StarSystem): Array<{ planet: Planet; cache: Haul }>;
  cacheOf(planet: Planet): Haul;
  planetById(id: string): Planet | null;
}

export type CombatOutcome =
  | { readonly kind: 'fleet'; readonly result: BattleResult; readonly summary: string }
  | { readonly kind: 'planet'; readonly result: AssaultResult; readonly summary: string };

/** Commands the UI can issue. Implemented by the app layer (Dependency Inversion). */
export interface GameActions {
  toggleView(): void;
  zoomTo(altitude: number): void;
  flyTo(star: StarSystem, closeUp?: boolean): void;
  select(star: StarSystem | null): void;
  /** Fly into a system and follow one of its planets (null = back to the system). */
  focusPlanet(star: StarSystem, planet: Planet | null): void;
  /** Form a new fleet from docked ships and send it to a star. */
  formFleet(ships: Squadron[], to: StarSystem, name?: string): void;
  /** Send a deployed fleet to a star (straight line from where it is now). */
  moveFleet(fleetId: string, to: StarSystem): void;
  returnHome(fleetId: string): void;
  /** Merge a fleet at home back into the dock. */
  dockFleet(fleetId: string): void;
  focusFleet(fleetId: string): void;
  /** Settle an explored planet with a Colony Ark on station. */
  settle(planet: Planet): void;
  /** Build a supply depot with a Construction Tender on station. */
  buildDepot(star: StarSystem): void;
  /** Construct a building on one of your colonies. */
  build(planetId: string, buildingId: string): void;
  explore(planet: Planet): void;
  collectCrate(planetId: string): void;
  /** Explore every unexplored planet in a system. */
  exploreAll(star: StarSystem): void;
  /** Open every unopened loot crate. */
  collectAllLoot(): void;
  /** Open every crate and collect the resource caches of newly explored planets in a system. */
  collectResources(star: StarSystem): Haul | null;
  research(nodeId: string): void;
  setFocus(nodeId: string | null): void;
  grantShards(nodeId: string, sourceId: string, amount: number): void;
  selectClass(classId: string): void;
  setDesign(design: ShipDesign): void;
  /** Build a ship at a shipyard colony (default: the capital). */
  buildShip(classId: string, yardPlanetId?: string): void;
  toggleTrait(traitId: string): void;
  setGovernment(id: string): void;
  togglePolicy(id: string): void;
  toggleRoute(partnerId: string): void;
  foundFaith(name: string, tenets: string[]): void;
  toggleMission(empire: string): void;
  toggleSpy(empire: string): void;
  /** Fight with ships from a group on station at the target. */
  engage(targetId: string, ships: Squadron[], groupId: string): CombatOutcome | null;
  endTurn(): void;
  openPanel(id: PanelId): void;
}
