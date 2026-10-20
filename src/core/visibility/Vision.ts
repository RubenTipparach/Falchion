import { hexAt, planMovement, routeIndexAt, type FleetMovement } from '../fleet/Fleet';
import { hexKey, hexSpiral, type Hex } from '../hex/Hex';
import type { StarSystem } from '../galaxy/GalaxyModel';
import type { Relation } from '../diplomacy/Diplomacy';

/**
 * What a player can see of the galaxy (change admin-snapshots-and-fog). Pure: vision is derived
 * from an empire's save, never stored apart from the systems its ships have been in (`visited`).
 * The rules of the game never read it; it decides what the map draws and what the server sends.
 *
 * - **explored**: the home system, every colony's system, every supply depot, every system with a
 *   surveyed planet, every system a ship of the empire has passed through or stopped in, and the
 *   system each of its fleets is in now.
 * - **sighted**: stars within SIGHT_RANGE of an explored system or of a fleet, and inside the
 *   empire's territory (HOME_SIGHT of home, COLONY_SIGHT of a colony).
 *
 * Allies share vision. A star is then shown as explored, sighted, fogged (neither, with systems
 * shown) or hidden (neither, with the server's hide-systems flag on). A megastructure is seen only
 * in an explored system: anywhere else it is an ordinary star.
 */

/** Light years around an explored system or a fleet within which stars are sighted. */
export const SIGHT_RANGE = 2;
/** Light years of the home system's territory, all of it sighted. */
export const HOME_SIGHT = 5;
/** Light years around a colony system, all of it sighted. */
export const COLONY_SIGHT = 3;
/** Another empire's fleet is sent to a player only within this many light years of a system the player sees. */
export const FLEET_SIGHT = 3;
/** Most visited systems a save keeps (the oldest go first). */
export const MAX_VISITED = 20_000;

export type Sight = 'explored' | 'sighted' | 'fogged' | 'hidden';

/** What vision is derived from: an empire's holdings, survey, travels and fleets now. */
export interface VisionInput {
  readonly home?: Hex | null;
  readonly colonyStars?: readonly string[];
  readonly depots?: readonly string[];
  /** Planet ids surveyed (`<starId>/<index>`). */
  readonly surveyedPlanets?: readonly string[];
  /** Star ids a ship of the empire has been in. */
  readonly visited?: readonly string[];
  /** Where the empire's fleets are now. */
  readonly fleetHexes?: readonly Hex[];
}

/** One empire's vision: star ids, sorted (plain data: the server sends it to allies). */
export interface Vision {
  readonly explored: readonly string[];
  readonly sighted: readonly string[];
}

export const NO_VISION: Vision = { explored: [], sighted: [] };

/** Several visions together (your own and your allies'): sighted never repeats an explored star. */
export interface VisionSets {
  readonly explored: ReadonlySet<string>;
  readonly sighted: ReadonlySet<string>;
}

/** The star in a hex, if any (the galaxy's starAt). */
export type StarLookup = (h: Hex) => { readonly id: string } | null;

/** The star a planet id belongs to (`3,-4/2` -> `3,-4`). */
export function starIdOfPlanet(planetId: string): string {
  const i = planetId.lastIndexOf('/');
  return i < 0 ? planetId : planetId.slice(0, i);
}

/** The hex of a star id (`q,r`), or null when it is not one. */
export function hexOfStarId(id: string): Hex | null {
  const m = /^(-?\d+),(-?\d+)$/.exec(id);
  return m ? { q: Number(m[1]), r: Number(m[2]) } : null;
}

/** An empire's vision. `starAt` is the galaxy's lookup (called once per hex at most). */
export function visionOf(input: VisionInput, starAt: StarLookup): Vision {
  const explored = new Set<string>();
  const add = (id: string | undefined | null) => { if (id && hexOfStarId(id)) explored.add(id); };
  if (input.home) add(hexKey(input.home));
  for (const id of input.colonyStars ?? []) add(id);
  for (const id of input.depots ?? []) add(id);
  for (const id of input.surveyedPlanets ?? []) add(starIdOfPlanet(id));
  for (const id of input.visited ?? []) add(id);
  const memo = new Map<string, boolean>();
  const isStar = (h: Hex): boolean => {
    const k = hexKey(h);
    let v = memo.get(k);
    if (v === undefined) memo.set(k, (v = !!starAt(h)));
    return v;
  };
  // A fleet in a system has explored it.
  for (const h of input.fleetHexes ?? []) if (isStar(h)) add(hexKey(h));
  const sighted = new Set<string>();
  const look = (center: Hex, radius: number) => {
    for (const h of hexSpiral(center, radius)) {
      const k = hexKey(h);
      if (!explored.has(k) && !sighted.has(k) && isStar(h)) sighted.add(k);
    }
  };
  for (const id of [...explored]) look(hexOfStarId(id)!, SIGHT_RANGE);
  for (const h of input.fleetHexes ?? []) look(h, SIGHT_RANGE);
  if (input.home) look(input.home, HOME_SIGHT);
  for (const id of input.colonyStars ?? []) { const h = hexOfStarId(id); if (h) look(h, COLONY_SIGHT); }
  return { explored: [...explored].sort(), sighted: [...sighted].sort() };
}

/** The save fields vision reads (a SavedGame or a GameState has them all). */
export interface VisionSave {
  readonly turn: number;
  readonly home?: { readonly hex?: Hex } | null;
  readonly economy?: { readonly colonies?: ReadonlyArray<{ readonly starId?: string }> };
  readonly depots?: readonly string[];
  readonly explored?: Readonly<Record<string, unknown>>;
  readonly visited?: readonly string[];
  readonly fleets?: ReadonlyArray<{ readonly id: string; readonly movement: FleetMovement }>;
  readonly loadouts?: Readonly<Record<string, unknown>>;
}

/** What vision is derived from in a save: only the empire's own fleets (those with a loadout) count. */
export function visionInputOf(save: VisionSave): VisionInput {
  const h = save.home?.hex;
  return {
    home: h && Number.isInteger(h.q) && Number.isInteger(h.r) ? { q: h.q, r: h.r } : null,
    colonyStars: (save.economy?.colonies ?? []).map((c) => c.starId).filter((x): x is string => typeof x === 'string'),
    depots: save.depots ?? [],
    surveyedPlanets: Object.keys(save.explored ?? {}),
    visited: save.visited ?? [],
    fleetHexes: (save.fleets ?? []).filter((f) => save.loadouts?.[f.id] && validMovement(f.movement)).map((f) => hexAt(f.movement, save.turn)),
  };
}

/** Visions put together (your own and your allies'). */
export function visionSets(visions: readonly Vision[]): VisionSets {
  const explored = new Set<string>();
  for (const v of visions) for (const id of v.explored) explored.add(id);
  const sighted = new Set<string>();
  for (const v of visions) for (const id of v.sighted) if (!explored.has(id)) sighted.add(id);
  return { explored, sighted };
}

/** Every star a player sees (explored or sighted). */
export function visibleStars(sets: VisionSets): Set<string> {
  return new Set([...sets.explored, ...sets.sighted]);
}

/** How a star shows to a player: `hideSystems` is the server's flag. */
export function sightOf(starId: string, sets: VisionSets, hideSystems: boolean): Sight {
  if (sets.explored.has(starId)) return 'explored';
  if (sets.sighted.has(starId)) return 'sighted';
  return hideSystems ? 'hidden' : 'fogged';
}

/** A megastructure shows only in a system the player (or an ally) has explored. */
export function megastructureSeen(starId: string, sets: VisionSets): boolean {
  return sets.explored.has(starId);
}

/**
 * A star as the player knows it: a megastructure system not yet explored is an ordinary star with
 * no worlds (its structure is its only world, and its planets are generated from the star).
 */
export function maskStar(star: StarSystem, sets: VisionSets): StarSystem {
  if (!star.megastructure || megastructureSeen(star.id, sets)) return star;
  const { megastructure: _m, ...plain } = star;
  return { ...plain, planetCount: 0 };
}

/** The player's view of the galaxy, for everything they pick or read on the map. */
export interface StarLens {
  /** Changes whenever what the player sees changes. */
  readonly version: number;
  readonly hideSystems: boolean;
  sight(star: Pick<StarSystem, 'id'>): Sight;
  /** The star as the player knows it, or null when it is hidden. */
  see(star: StarSystem): StarSystem | null;
  megastructureSeen(starId: string): boolean;
}

/** A lens over vision sets. */
export function lensOf(sets: VisionSets, hideSystems: boolean, version = 0): StarLens {
  return {
    version, hideSystems,
    sight: (star) => sightOf(star.id, sets, hideSystems),
    see: (star) => (sightOf(star.id, sets, hideSystems) === 'hidden' ? null : maskStar(star, sets)),
    megastructureSeen: (id) => megastructureSeen(id, sets),
  };
}

/** A lens that sees everything (no vision rules: tests, tools). */
export const ALL_SEEING: StarLens = { version: 0, hideSystems: false, sight: () => 'explored', see: (s) => s, megastructureSeen: () => true };

/** The route hexes a fleet covered between two years (both ends included). */
export function visitedAlong(m: FleetMovement, fromTurn: number, toTurn: number): Hex[] {
  if (!validMovement(m)) return [];
  const a = routeIndexAt(m, fromTurn), b = routeIndexAt(m, toTurn);
  return m.route.slice(Math.min(a, b), Math.max(a, b) + 1);
}

/** `visited` with new star ids added at the end (unchanged, the same array, when none are new); the oldest go past `cap`. */
export function addVisited(visited: readonly string[] | undefined, ids: Iterable<string>, cap = MAX_VISITED, known?: ReadonlySet<string>): readonly string[] {
  // `known`: the ids already in `visited`, when the caller keeps them as a set.
  const have = new Set<string>();
  const seen = known ?? new Set(visited ?? []);
  const fresh: string[] = [];
  for (const id of ids) if (!seen.has(id) && !have.has(id)) { have.add(id); fresh.push(id); }
  if (!fresh.length) return visited ?? [];
  const out = [...(visited ?? []), ...fresh];
  return out.length > cap ? out.slice(out.length - cap) : out;
}

/** The players allied with `me` (they share vision), sorted. */
export function alliesOf(relations: Readonly<Record<string, Relation>> | undefined, me: string): string[] {
  const out: string[] = [];
  for (const [key, r] of Object.entries(relations ?? {})) {
    if (r?.status !== 'alliance') continue;
    const [a, b] = key.split('|');
    if (a === me && b) out.push(b);
    else if (b === me && a) out.push(a);
  }
  return out.sort();
}

// ── What the server sends a player while systems are hidden ─────────────

/** Whether a hex is within `range` of a star the player sees. */
export function nearVisible(h: Hex, visible: ReadonlySet<string>, range = FLEET_SIGHT): boolean {
  for (const x of hexSpiral(h, range)) if (visible.has(hexKey(x))) return true;
  return false;
}

/** Another empire's public view, as the server keeps it. */
export interface PublicLike {
  readonly home?: Hex | null;
  readonly colonies?: readonly Hex[];
  readonly fleets?: ReadonlyArray<{ readonly movement?: unknown }>;
}

/**
 * Another empire's public view with only what the player can see: its home and colonies in
 * systems the player sees, and its fleets within FLEET_SIGHT of one at world year `tick`.
 */
export function filterPublicView<T extends PublicLike>(view: T, visible: ReadonlySet<string>, tick: number): T {
  const sees = (h: Hex | null | undefined): h is Hex => !!h && Number.isInteger(h.q) && Number.isInteger(h.r) && visible.has(hexKey(h));
  return {
    ...view,
    home: sees(view.home) ? view.home : null,
    colonies: (view.colonies ?? []).filter(sees),
    fleets: (view.fleets ?? []).filter((f) => validMovement(f.movement) && nearVisible(hexAt(f.movement, tick), visible)),
  };
}

/** The NPC parts of the shared world, as filterWorld reads them. */
export interface NpcWorldLike {
  readonly npcs: Readonly<Record<string, {
    readonly knownBy: readonly string[];
    readonly colonies: ReadonlyArray<{ readonly starId: string }>;
    readonly fleets: ReadonlyArray<{ readonly from: Hex; readonly to: Hex; readonly depart: number }>;
  }>>;
}

/**
 * The shared world with only the NPC empires a player has met, and of those only the worlds in
 * systems the player sees and the fleets within FLEET_SIGHT of one at `tick`. Asteroid fields,
 * relations and the rest are kept.
 */
export function filterWorld<W extends NpcWorldLike>(world: W, viewer: string, visible: ReadonlySet<string>, tick: number): W {
  const npcs: Record<string, W['npcs'][string]> = {};
  for (const id of Object.keys(world.npcs).sort()) {
    const n = world.npcs[id];
    if (!n.knownBy.includes(viewer)) continue;
    npcs[id] = {
      ...n,
      colonies: n.colonies.filter((c) => visible.has(c.starId)),
      fleets: n.fleets.filter((f) => {
        const m = npcMovement(f);
        return !!m && nearVisible(hexAt(m, tick), visible);
      }),
    } as unknown as W['npcs'][string];
  }
  return { ...world, npcs };
}

/** An NPC fleet's run as a movement (one light year a year), or null when it is malformed. */
function npcMovement(f: { readonly from: Hex; readonly to: Hex; readonly depart: number }): FleetMovement | null {
  try {
    return planMovement(f.from, f.to, Math.max(0, f.depart), 1);
  } catch {
    return null;
  }
}

/** A movement good enough to read a position from (other empires' data is untrusted). */
function validMovement(m: unknown): m is FleetMovement {
  const x = m as FleetMovement | null;
  return !!x && Array.isArray(x.route) && x.route.length > 0 && x.route.every((h) => Number.isInteger(h?.q) && Number.isInteger(h?.r))
    && Number.isFinite(x.departTurn) && Number.isInteger(x.speed) && x.speed >= 1;
}
