import type { AssaultResult, BattleResult, Squadron } from '../core/combat/Combat';
import type { Planet } from '../core/galaxy/Planets';
import type { Haul } from '../core/encounters/PlanetCache';
import type { StarSystem } from '../core/galaxy/GalaxyModel';
import type { ShipDesign } from '../core/ships/ShipDesign';

import type { Capacity, Stores } from '../core/fleet/Logistics';
import type { FleetView } from '../render/map/FleetLayer';
import type { Colony } from '../core/economy/Economy';
import type { Job } from '../core/construction/Construction';
import type { FleetOrders } from '../core/fleet/Presence';
import type { Resource } from '../content/resources';

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
  /** Years (minutes) until arrival (0 when on station). */
  readonly eta: number;
  readonly friendly: boolean;
  readonly orders?: FleetOrders;
}

/** What the fleet card shows about any fleet, yours or not. */
export interface FleetInfo {
  readonly fleet: FleetView;
  /** Your group (ships, supply, ammunition, orders); null for other empires' fleets. */
  readonly group: FleetGroup | null;
  /** Star it is on station at, if any. */
  readonly at: StarSystem | null;
  readonly dest: StarSystem | null;
  /** Years (minutes) to arrival. */
  readonly eta: number;
  readonly mine: boolean;
  /** Auto-explore: the next systems this fleet will survey (up to 3). */
  readonly plan: readonly StarSystem[];
  /** Auto-explore: the planet it is surveying this year. */
  readonly surveying: Planet | null;
}

/** Read-only game queries the panels use (implemented by the app layer). */
export interface GameQueries {
  /** How much of a system has been surveyed: explored or settled planets out of all. */
  surveyProgress(star: StarSystem): { done: number; total: number };
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
  fleetInfo(fleetId: string): FleetInfo | null;
  /** Construction queued at a site (planet id), or everywhere. */
  jobs(site?: string): Job[];
  /** Storage caps for each resource. */
  caps(): Partial<Record<Resource, number>>;
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
  /** Select and centre on a fleet; closeUp also zooms in to the ship. */
  focusFleet(fleetId: string, closeUp?: boolean): void;
  /** Open the founding screen to change the empire's name, colours and flag. */
  editEmpire(): void;
  /** Select a fleet and follow its ship with the camera; null clears. */
  selectFleet(fleetId: string | null): void;
  /** Standing orders a fleet follows on its own. */
  setOrders(fleetId: string, orders: FleetOrders): void;
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
  /** Development aid: advance one year now. */
  skipYear(): void;
  /** Abandon the saved empire and start again. */
  resetEmpire(): void;
  openPanel(id: PanelId): void;
}
