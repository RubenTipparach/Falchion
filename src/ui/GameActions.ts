import type { AssaultResult, BattleResult, Damage, PlanetTarget, Squadron } from '../core/combat/Combat';
import type { RepairSite } from '../content/logistics';
import type { Planet } from '../core/galaxy/Planets';
import type { Collected, Haul } from '../core/encounters/PlanetCache';
import type { StarSystem } from '../core/galaxy/GalaxyModel';
import type { ShipDesign } from '../core/ships/ShipDesign';

import type { Capacity, Stores } from '../core/fleet/Logistics';
import type { FleetView } from '../render/map/FleetLayer';
import type { Colony } from '../core/economy/Economy';
import type { Job } from '../core/construction/Construction';
import type { FleetBattle, FleetOrders } from '../core/fleet/Presence';
import type { Resource } from '../content/resources';
import type { Market } from '../core/economy/Trade';
import type { DiplomacyView, FieldReport } from '../sim/EmpireSim';
import type { DiplomaticAction } from '../core/diplomacy/Diplomacy';

export type PanelId = 'shipyard' | 'research' | 'empire' | 'war' | 'explore' | 'fleets';

/** A group of the player's ships in one place: the home dock or a deployed fleet. */
export interface FleetGroup {
  /** 'dock' for the home dock, else the fleet id. */
  readonly id: string;
  readonly name: string;
  readonly ships: readonly Squadron[];
  readonly stores: Stores;
  readonly capacity: Capacity;
  /** Damage its ships carry (hull points per class), and its hull integrity 0..1. */
  readonly damage?: Damage;
  readonly hull?: number;
  /** Where it is, it repairs: 'shipyard' fully, 'colony' fast, 'depot' or 'ally' slowly. */
  readonly repair?: RepairSite | null;
  /** Star the group is at or heading to. */
  readonly star: StarSystem | null;
  /** On station (arrived), so it can act there. */
  readonly stationed: boolean;
  /** Years (minutes) until arrival (0 when on station). */
  readonly eta: number;
  readonly friendly: boolean;
  readonly orders?: FleetOrders;
  /** A battle at sea it is in (another player's fleet), if one is going on. */
  readonly battle?: FleetBattle;
  /** Trade goods aboard, and where they were loaded. */
  readonly cargo?: number;
  readonly cargoFrom?: string;
}

/** What the fleet card shows about any fleet, yours or not. */
export interface FleetInfo {
  readonly fleet: FleetView;
  /** Your group (ships, supply, damage, orders); null for other empires' fleets. */
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
  /** Buildings with no research gate, or whose research is done. */
  isBuildingUnlocked(buildingId: string): boolean;
  /** Ship-building yards: colonies with a shipyard. */
  yards(): Colony[];
  /** Star a War Room target sits at. */
  targetStar(targetId: string): StarSystem;
  /** NPC worlds of the empires you know, to attack from the War Room. */
  warTargets(): WarTarget[];
  /** Every player you have met with your relation, any proposal and what you can do. */
  diplomacyView(): DiplomacyView[];
  /** How many other players you have not met yet (no dealings before first contact). */
  unmetEmpires(): number;
  /** The NPC factions you know and where you stand with each (the Relations tab). */
  factions(): FactionView[];
  /** Empires you know: for missionaries and spies. */
  knownEmpires(): Array<{ name: string; tech: readonly string[] }>;
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
  /** A system's asteroid fields: what each holds now and when it is full again. */
  fieldReport(star: StarSystem): FieldReport[];
  /** Worlds that buy trade goods. */
  markets(): Market[];
  marketAt(star: StarSystem): Market | null;
  /** Goods a group of ships can carry. */
  cargoCapacity(ships: readonly Squadron[]): number;
  /** What a cargo loaded at `from` sells for at a market. */
  saleValue(goods: number, from: StarSystem, market: Market): number;
  /** Storage caps for each resource. */
  caps(): Partial<Record<Resource, number>>;
}

/** A known NPC faction as the Relations tab shows it. */
export interface FactionView {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly blurb: string;
  readonly tier: number;
  readonly home: StarSystem;
  readonly worlds: number;
  readonly fleets: number;
  /** Your standing with it, −100 to +100, and where it drifts back to. */
  readonly standing: number;
  readonly disposition: number;
}

/** An NPC world the War Room can attack. */
export interface WarTarget {
  /** `${npcId}@${starId}`. */
  readonly id: string;
  readonly npc: string;
  /** The NPC empire's name. */
  readonly owner: string;
  readonly color: string;
  readonly star: StarSystem;
  readonly kind: 'planet';
  readonly name: string;
  readonly blurb: string;
  readonly tier: number;
  /** Technologies a conquest yields fragments of. */
  readonly tech: readonly string[];
  /** Its raider fleets at home, defending alongside the garrison. */
  readonly docked: readonly string[];
  readonly planet: PlanetTarget;
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
  /** Descend to a rocky planet's surface: its capital or main city (a camera move, not an order). */
  land(star: StarSystem, planet: Planet): void;
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
  /** A diplomatic step toward another player: declare war, propose or answer peace and alliances. */
  diplomacy(playerId: string, action: DiplomaticAction): void;
  /** Chase another player's fleet (`${ownerId}:${fleetId}`) with one of yours; null stops. */
  chase(fleetId: string, target: string | null): void;
  /** Break off a battle: the fleet heads at once for the nearest friendly system. */
  retreat(fleetId: string): void;
  /** Standing orders a fleet follows on its own. */
  setOrders(fleetId: string, orders: FleetOrders): void;
  /** Settle an explored planet with a Colony Ark on station. */
  settle(planet: Planet): void;
  /** Build a supply depot with a Construction Tender on station. */
  buildDepot(star: StarSystem): void;
  /** Construct a building on one of your colonies. */
  build(planetId: string, buildingId: string): void;
  /** Open the research tree on a technology (what a locked ship or building needs). */
  openResearch(nodeId: string): void;
  explore(planet: Planet): void;
  collectCrate(planetId: string): Collected | null;
  /** Explore every unexplored planet in a system. */
  exploreAll(star: StarSystem): void;
  /** Open every unopened loot crate. */
  collectAllLoot(): void;
  /** Open every crate and collect the resource caches of newly explored planets in a system. */
  /** Collect one explored planet's resource cache and loot crate. */
  collectPlanet(planet: Planet): Collected | null;
  /** Share a hotlink to a star system or one of its planets: the share sheet on phones, else the clipboard. */
  shareLink(star: StarSystem, planet?: Planet | null): Promise<'shared' | 'copied' | 'failed'>;
  collectResources(star: StarSystem): Collected | null;
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
  /** Fill a fleet's freighters with trade goods (at one of your colony systems). */
  loadGoods(fleetId: string): void;
  /** Sell a fleet's trade goods at the market it is at. */
  sellGoods(fleetId: string): void;
  /** Pay a known NPC faction tribute for better standing. */
  sendTribute(npcId: string): void;
  /** Start a trade run to a market with a fleet ('dock': the docked freighters), or stop one (null). */
  tradeRun(groupId: string, to: StarSystem | null): void;
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
