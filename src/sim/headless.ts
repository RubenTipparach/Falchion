import { DEFAULT_LOOT_TABLES } from '../content/lootTables';
import { HERALDRY } from '../content/heraldry';
import { BUILDINGS, STORAGE } from '../content/buildings';
import { upkeepOf } from '../content/logistics';
import { SHARD_SOURCES } from '../content/shardSources';
import { SHIP_CLASSES } from '../content/shipClasses';
import { GOVERNMENTS, POLICIES, TENETS } from '../content/society';
import { ALIEN_TECH, TECH_NODES } from '../content/techTree';
import type { EconomyTables } from '../core/economy/Economy';
import { cleanIdentity } from '../core/empire/Identity';
import { EncounterResolver } from '../core/encounters/Encounters';
import { GalaxyModel } from '../core/galaxy/GalaxyModel';
import { TechTree } from '../core/research/TechTree';
import type { GameState } from '../app/GameState';
import { SaveGame, savedHome, upgradeSave, type SavedGame } from '../app/SaveGame';
import { colorFor, isFleetMovement, publicEmpire, type PublicEmpire } from '../app/ServerSync';
import { Store } from '../app/Store';
import { createWorld } from '../app/World';
import { EmpireSim, snapshotLink, type ContactForce, type OtherEmpire, type SimDeps } from './EmpireSim';
import { atWar } from '../core/diplomacy/Diplomacy';
import { applyEffects, EMPTY_WORLD, validWorld, type SharedEffect, type SharedWorld } from '../core/world/SharedWorld';

/** The server applies empires' changes to the shared world with the same rules. */
export { applyEffects, EMPTY_WORLD, validWorld };
import { CommandError, decodeArgs, type Command } from './commands';
import { allPlayerMarkets, marketsFor, type TradingEmpire } from '../core/economy/PlayerMarkets';
import type { Market } from '../core/economy/Trade';
import { stepNpcs, type RaidTargets } from '../core/npc/NpcSim';
import type { NpcRaid } from '../core/npc/types';
import { hexAt, type FleetMovement } from '../core/fleet/Fleet';
import { attacks, isStationed, nextRound, startsFight, type Encounter, type ForeignFleet } from '../core/fleet/Presence';
import { hexEquals, type Hex } from '../core/hex/Hex';
import { hashSeed } from '../core/rng/Rng';
import { resolveRound } from '../core/combat/Combat';

/**
 * The game rules without a browser: the server runs this to keep every empire going while its
 * owner is away (production, research, construction, travel, auto-explore, resupply), with
 * exactly the rules the client runs (EmpireSim). Built for Node by `npm run build:sim` into
 * server/sim/ (see vite.sim.config.ts); server/simTicker.mjs drives it once a world year.
 */

// The galaxy, tech tree and loot tables are the same for every empire: build them once.
let shared: { galaxy: GalaxyModel; tree: TechTree; encounters: EncounterResolver } | null = null;
function tables() {
  if (!shared) {
    const galaxy = new GalaxyModel();
    const tree = new TechTree(TECH_NODES, SHARD_SOURCES);
    shared = { galaxy, tree, encounters: new EncounterResolver(DEFAULT_LOOT_TABLES, tree) };
  }
  return shared;
}

/** Whether a stored save belongs to this galaxy and save format. */
export function validSave(save: unknown): save is SavedGame {
  return new SaveGame(tables().galaxy.params.seed, null).valid(save);
}

export type { Command };

export interface Advanced {
  /** The save after the years were played (same format the client stores). */
  readonly save: Record<string, unknown>;
  /** What the empire changed in the shared world (fields mined, NPCs found), for the server to apply. */
  readonly effects: readonly SharedEffect[];
  /** What other players may see of the empire now (fleets, colonies, identity). */
  readonly public: PublicEmpire;
  /** World years played. */
  readonly years: number;
}

/**
 * Play an empire's save forward to world year `toTurn`. `player` is its owner (Discord id and
 * name: the name owns the fleets). Null when the save is invalid or already up to date. A long
 * absence is caught up as the client would (the most recent week in full). `others`: every
 * empire as other players see it (the server's public views): their worlds are markets.
 */
export function advanceSave(save: unknown, player: Player, toTurn: number, world: SharedWorld = EMPTY_WORLD, raids: readonly NpcRaid[] = [], others: readonly TradingEmpire[] = []): Advanced | null {
  // Up to date already (an order caught it up), but raided: still resolve the raids.
  if (!validSave(save) || !Number.isInteger(toTurn) || (save.turn >= toTurn && !raids.length)) return null;
  const { deps, store, link } = runtime(save, player, world, others);
  const from = store.state.turn;
  const sim = new EmpireSim(deps);
  sim.advanceTo(toTurn);
  // NPC raiders that reached this empire this year (stepWorld found them).
  sim.resolveRaids(raids);
  sim.retimeFleets();
  return { ...result(store.state, player), effects: link.effects, years: store.state.turn - from };
}

export interface Applied extends Omit<Advanced, 'years'> {
  readonly ok: boolean;
  /** Why the command was refused (the save is then unchanged apart from catching up). */
  readonly error?: string;
}

/**
 * Apply one player command to an empire on the server: catch the empire up to the world year,
 * decode and validate the command against it, run it with the game's rules, and return the
 * resulting save (the truth the client adopts). `worldTime` is the current world time in years
 * (fractional); `clientTime` is when the player gave the order, honoured within a few seconds
 * so a fleet sets off from where the player saw it. `others`: as for advanceSave.
 */
export function applyCommand(save: unknown, player: Player, worldTime: number, command: unknown, clientTime?: number, world: SharedWorld = EMPTY_WORLD, others: readonly TradingEmpire[] = []): Applied | null {
  if (!validSave(save) || !Number.isFinite(worldTime)) return null;
  const { deps, store, link } = runtime(save, player, world, others);
  const at = typeof clientTime === 'number' && Number.isFinite(clientTime) ? Math.min(worldTime, Math.max(worldTime - ORDER_SLACK_YEARS, clientTime)) : worldTime;
  const sim = new ServerSim(deps, at);
  sim.advanceTo(Math.floor(worldTime));
  sim.retimeFleets();
  try {
    const { name, args } = decodeArgs(command, sim);
    // An empire is founded once; later identity changes are edits.
    if (name === 'setIdentity' && store.state.identity) args[1] = false;
    (sim[name] as (...a: unknown[]) => unknown)(...args);
    return { ...result(store.state, player), effects: link.effects, ok: true };
  } catch (err) {
    const error = err instanceof CommandError ? err.message : `command failed: ${(err as Error)?.message ?? err}`;
    return { ...result(store.state, player), effects: link.effects, ok: false, error };
  }
}

/** What other players may see of an empire, as the server keeps it (server/index.mjs publicView). */
export interface PublicRecord {
  readonly home?: Hex | null;
  readonly colonies?: readonly Hex[];
  readonly fleets?: ReadonlyArray<{ readonly id?: string; readonly movement?: FleetMovement; readonly armed?: boolean; readonly stance?: string; readonly battle?: { readonly foe?: string; readonly tick?: number }; readonly chase?: string }>;
}

/** Two fleets of different players that meet at sea and fight (at most one per fleet per year). */
export interface Contact {
  readonly a: FleetRef;
  readonly b: FleetRef;
  readonly hex: Hex;
}

export interface FleetRef {
  readonly player: string;
  readonly fleet: string;
}

/** Both empires' saves and public views after a battle at sea. */
export interface ContactResult {
  readonly saveA: Record<string, unknown>;
  readonly publicA: PublicEmpire;
  readonly saveB: Record<string, unknown>;
  readonly publicB: PublicEmpire;
}

/**
 * The NPC empires' year on the server: step every discovered NPC to `tick`, with every empire's
 * colonies and fleets on station as what their raiders can strike. Returns the new world and the
 * raids, which each struck empire resolves when it plays its year (advanceSave).
 */
export function stepWorld(world: unknown, tick: number, players: ReadonlyArray<{ readonly id: string; readonly public?: PublicRecord | null }>): { world: SharedWorld; raids: NpcRaid[] } {
  const w = validWorld(world) ? world : EMPTY_WORLD;
  const isHex = (h: unknown): h is Hex => !!h && Number.isInteger((h as Hex).q) && Number.isInteger((h as Hex).r);
  const targets: RaidTargets[] = players.map((p) => {
    const pub = p.public ?? {};
    const colonies = [pub.home, ...(pub.colonies ?? [])].filter(isHex);
    const fleets = (pub.fleets ?? []).map((f) => f.movement).filter((m): m is FleetMovement => !!m && Array.isArray(m.route) && m.route.length > 0 && isStationed(m, tick)).map((m) => hexAt(m, tick));
    return { player: p.id, targets: [...colonies.map((hex) => ({ hex, what: 'colony' as const })), ...fleets.map((hex) => ({ hex, what: 'fleet' as const }))] };
  });
  return stepNpcs(w, tick, tables().galaxy, targets);
}

/**
 * The fleets of different players that meet at sea in `tick`, from the stored public views: both
 * on station on the same hex, and at least one aggressive and armed. A fleet is in one contact at most.
 */
export function findContacts(players: ReadonlyArray<{ readonly id: string; readonly public?: PublicRecord | null }>, tick: number, world?: SharedWorld | null): Contact[] {
  const relations = validWorld(world) ? world.relations : undefined;
  const fleets = stationedFleets(players, tick);
  const used = new Set<string>();
  const out: Contact[] = [];
  for (let i = 0; i < fleets.length; i++) {
    const a = fleets[i];
    if (used.has(a.key)) continue;
    for (let j = i + 1; j < fleets.length; j++) {
      const b = fleets[j];
      if (used.has(b.key) || b.player === a.player || !hexEquals(a.at, b.at) || !startsFight(a, b) || !atWar(relations, a.player, b.player, tick)) continue;
      used.add(a.key);
      used.add(b.key);
      out.push({ a: { player: a.player, fleet: a.fleet }, b: { player: b.player, fleet: b.fleet }, hex: a.at });
      break;
    }
  }
  return out;
}

/** A chasing fleet that has caught its quarry: they are on the same hex this year. */
export interface Pursuit extends Contact {
  readonly pursuit: true;
}

/**
 * Chases that end in a fight in `tick`: a fleet with warships chasing another player's fleet
 * (its `chase` order) is on the same hex as it, whether either is under way or on station. `a` is
 * the chaser, `b` the quarry. Fleets already in a contact this year are left out.
 */
export function findPursuits(players: ReadonlyArray<{ readonly id: string; readonly public?: PublicRecord | null }>, tick: number, busy: readonly Contact[] = [], world?: SharedWorld | null): Pursuit[] {
  const relations = validWorld(world) ? world.relations : undefined;
  const fleets = new Map<string, { player: string; fleet: string; movement: FleetMovement; armed: boolean; chase?: string }>();
  for (const p of players) {
    for (const f of (p.public?.fleets ?? []).slice(0, 50)) {
      if (typeof f?.id !== 'string' || !isFleetMovement(f.movement)) continue;
      fleets.set(`${p.id}:${f.id}`, { player: p.id, fleet: f.id, movement: f.movement, armed: f.armed === true, chase: typeof f.chase === 'string' ? f.chase : undefined });
    }
  }
  const used = new Set(busy.flatMap((c) => [`${c.a.player}:${c.a.fleet}`, `${c.b.player}:${c.b.fleet}`]));
  const out: Pursuit[] = [];
  for (const key of [...fleets.keys()].sort()) {
    const p = fleets.get(key)!;
    const q = p.chase ? fleets.get(p.chase) : undefined;
    if (!q || !p.armed || q.player === p.player || used.has(key) || used.has(p.chase!) || !atWar(relations, p.player, q.player, tick)) continue;
    const at = hexAt(p.movement, tick);
    if (!hexEquals(at, hexAt(q.movement, tick))) continue;
    used.add(key);
    used.add(p.chase!);
    out.push({ a: { player: p.player, fleet: p.fleet }, b: { player: q.player, fleet: q.fleet }, hex: at, pursuit: true });
  }
  return out;
}

interface StationedFleet extends Encounter {
  readonly key: string;
  readonly player: string;
  readonly fleet: string;
  readonly at: Hex;
}

/** Every fleet the public views show on station at `tick`, in a fixed order. */
function stationedFleets(players: ReadonlyArray<{ readonly id: string; readonly public?: PublicRecord | null }>, tick: number): StationedFleet[] {
  const out: StationedFleet[] = [];
  for (const p of players) {
    for (const f of (p.public?.fleets ?? []).slice(0, 50)) {
      if (typeof f?.id !== 'string' || !isFleetMovement(f.movement) || !isStationed(f.movement, tick)) continue;
      out.push({ key: `${p.id}\u0001${f.id}`, player: p.id, fleet: f.id, at: hexAt(f.movement, tick), aggressive: f.stance === 'aggressive', armed: f.armed === true });
    }
  }
  return out.sort((x, y) => (x.key < y.key ? -1 : x.key > y.key ? 1 : 0));
}

/**
 * A battle at sea between two players' fleets on the same hex in `tick`. The aggressor fights as
 * side 0 (when both attack, the fleet whose owner and id sort first). Each empire's save records
 * its own side. Null when either empire has not played exactly to `tick` (the battle belongs to
 * that year), the fleets are not both on station on one hex, or neither attacks.
 */
export function resolveContact(saveA: unknown, playerA: Player, fleetIdA: string, saveB: unknown, playerB: Player, fleetIdB: string, tick: number, world?: SharedWorld | null): ContactResult | null {
  if (!validSave(saveA) || !validSave(saveB) || playerA.id === playerB.id || !Number.isInteger(tick)) return null;
  if (!atWar(validWorld(world) ? world.relations : undefined, playerA.id, playerB.id, tick)) return null;
  if (saveA.turn !== tick || saveB.turn !== tick) return null;
  const a = runtime(saveA, playerA, EMPTY_WORLD, []);
  const b = runtime(saveB, playerB, EMPTY_WORLD, []);
  const simA = new EmpireSim(a.deps);
  const simB = new EmpireSim(b.deps);
  const forceA = simA.contactForce(fleetIdA, tick);
  const forceB = simB.contactForce(fleetIdB, tick);
  if (!forceA || !forceB || !hexEquals(forceA.at, forceB.at) || !startsFight(forceA, forceB)) return null;
  // Fleet ids are only unique within an empire: order (and seed) by owner and fleet together.
  const keyA = `${playerA.id}:${fleetIdA}`, keyB = `${playerB.id}:${fleetIdB}`;
  const aFirst = attacks(forceA) !== attacks(forceB) ? attacks(forceA) : keyA < keyB;
  const [first, second] = aFirst ? [forceA, forceB] : [forceB, forceA];
  // Same seed whichever empire asks: both fleets (in order) and the year.
  const [lo, hi] = keyA < keyB ? [keyA, keyB] : [keyB, keyA];
  // One round a year: the battle goes on from where last year's round left it (the range closes).
  const round = Math.max(nextRound(forceA.battle, keyB, tick), nextRound(forceB.battle, keyA, tick));
  const battle = resolveRound(first.side, second.side, SHIP_CLASSES, hashSeed(tables().galaxy.params.seed, lo, hi, tick), round);
  simA.applyContact(forceA, foeOf(forceB, keyB), battle, aFirst ? 0 : 1, round, tick);
  simB.applyContact(forceB, foeOf(forceA, keyA), battle, aFirst ? 1 : 0, round, tick);
  const outA = result(a.store.state, playerA);
  const outB = result(b.store.state, playerB);
  return { saveA: outA.save, publicA: outA.public, saveB: outB.save, publicB: outB.public };
}

/**
 * A chaser (A) that has caught the fleet it chases (B): the next round of their battle is fought
 * where they meet, under way or not. Null when either empire is not at `tick`, either fleet is
 * gone, A is not chasing B or cannot attack, or they are not on the same hex.
 */
export function resolvePursuit(saveA: unknown, playerA: Player, fleetIdA: string, saveB: unknown, playerB: Player, fleetIdB: string, tick: number, world?: SharedWorld | null): ContactResult | null {
  if (!validSave(saveA) || !validSave(saveB) || playerA.id === playerB.id || !Number.isInteger(tick)) return null;
  if (!atWar(validWorld(world) ? world.relations : undefined, playerA.id, playerB.id, tick)) return null;
  if (saveA.turn !== tick || saveB.turn !== tick) return null;
  const a = runtime(saveA, playerA, EMPTY_WORLD, []);
  const b = runtime(saveB, playerB, EMPTY_WORLD, []);
  const simA = new EmpireSim(a.deps);
  const simB = new EmpireSim(b.deps);
  const keyA = `${playerA.id}:${fleetIdA}`, keyB = `${playerB.id}:${fleetIdB}`;
  if (saveA.loadouts[fleetIdA]?.orders?.chase !== keyB) return null;
  const chaser = simA.contactForce(fleetIdA, tick, true);
  const quarry = simB.contactForce(fleetIdB, tick, true);
  if (!chaser || !quarry || !chaser.armed || !hexEquals(chaser.at, quarry.at)) return null;
  const [lo, hi] = keyA < keyB ? [keyA, keyB] : [keyB, keyA];
  const round = Math.max(nextRound(chaser.battle, keyB, tick), nextRound(quarry.battle, keyA, tick));
  const battle = resolveRound(chaser.side, quarry.side, SHIP_CLASSES, hashSeed(tables().galaxy.params.seed, lo, hi, tick, 'chase'), round);
  simA.applyContact(chaser, foeOf(quarry, keyB), battle, 0, round, tick);
  simB.applyContact(quarry, foeOf(chaser, keyA), battle, 1, round, tick, !isStationed(saveB.fleets.find((f) => f.id === fleetIdB)!.movement, tick));
  const outA = result(a.store.state, playerA);
  const outB = result(b.store.state, playerB);
  return { saveA: outA.save, publicA: outA.public, saveB: outB.save, publicB: outB.public };
}

const foeOf = (f: ContactForce, key: string) => ({ key, fleetName: f.fleetName, empire: f.empire, ships: f.ships });

/** How far back (in years) a player's order may be dated: a few seconds of latency. */
const ORDER_SLACK_YEARS = 5 / 60;

type Player = { readonly id: string; readonly name: string };

/** The simulation at a fixed moment: orders between ticks take effect from then. */
class ServerSim extends EmpireSim {
  constructor(deps: SimDeps, private readonly time: number) {
    super(deps);
  }

  protected override now(): number {
    return Math.max(this.state.turn, this.time);
  }
}

// Every empire in a tick plays against the same list of others: read their worlds once.
let marketsMemo: { others: readonly TradingEmpire[]; all: Market[] } | null = null;
function marketsOf(others: readonly TradingEmpire[], playerId: string): Market[] {
  if (!Array.isArray(others) || !others.length) return [];
  if (marketsMemo?.others !== others) marketsMemo = { others, all: allPlayerMarkets(tables().galaxy, others) };
  return marketsFor(marketsMemo.all, playerId);
}

/** A save as live simulation state, with its world, the shared world it plays in and the other players' markets. */
/** Other players' empires (names and worlds) from their public views: diplomacy and allied systems. */
function otherEmpiresOf(others: readonly TradingEmpire[], playerId: string): OtherEmpire[] {
  const isHex = (h: unknown): h is Hex => !!h && Number.isInteger((h as Hex).q) && Number.isInteger((h as Hex).r);
  return (Array.isArray(others) ? others : []).filter((o) => o && o.id !== playerId).map((o) => ({
    id: o.id,
    name: typeof o.empire?.name === 'string' ? o.empire.name : typeof o.name === 'string' ? o.name : 'Unknown',
    home: isHex(o.home) ? o.home : null,
    colonies: (Array.isArray(o.colonies) ? o.colonies : []).filter(isHex).slice(0, 200),
  }));
}

/** Other players' fleets by `${ownerId}:${fleetId}`, from their public views (for chases). */
function foreignFleets(others: readonly TradingEmpire[], playerId: string): Map<string, ForeignFleet> {
  const out = new Map<string, ForeignFleet>();
  for (const o of Array.isArray(others) ? others : []) {
    if (!o || o.id === playerId) continue;
    const pub = o as TradingEmpire & { fleets?: ReadonlyArray<{ id?: unknown; name?: unknown; movement?: unknown }> };
    const empire = typeof o.empire?.name === 'string' ? o.empire.name : typeof o.name === 'string' ? o.name : 'Unknown';
    for (const f of (Array.isArray(pub.fleets) ? pub.fleets : []).slice(0, 50)) {
      if (typeof f?.id === 'string' && isFleetMovement(f.movement)) out.set(`${o.id}:${f.id}`, { name: typeof f.name === 'string' ? f.name : 'Fleet', empire, movement: f.movement });
    }
  }
  return out;
}

function runtime(saved: SavedGame, player: Player, shared: SharedWorld, others: readonly TradingEmpire[]): { deps: SimDeps; store: Store<GameState>; link: ReturnType<typeof snapshotLink> } {
  const save = upgradeSave(saved);
  const { galaxy, tree, encounters } = tables();
  const world = createWorld(galaxy, player.id, savedHome(save));
  const economy: EconomyTables = {
    tree, classes: SHIP_CLASSES, governments: GOVERNMENTS, policies: POLICIES, tenets: TENETS,
    alienTech: ALIEN_TECH, buildings: BUILDINGS, storage: STORAGE, upkeepOf,
  };
  // Fleets belong to the name they were formed under; fall back to the account name.
  const owner = save.fleets.find((f) => save.loadouts[f.id])?.owner ?? player.name;
  const state: GameState = {
    ...save,
    home: world.home,
    identity: cleanIdentity(save.identity, HERALDRY),
    selected: null, selectedFleet: null, selectedPlanet: null,
    playerName: owner,
  };
  const store = new Store<GameState>(state);
  const link = snapshotLink(validWorld(shared) ? shared : EMPTY_WORLD);
  const markets = marketsOf(others, player.id);
  const fleets = foreignFleets(others, player.id);
  const empires = otherEmpiresOf(others, player.id);
  return { deps: { store, galaxy, tree, encounters, world, economy, shared: link, playerId: player.id, markets: () => markets, foreignFleet: (key) => fleets.get(key) ?? null, otherEmpires: () => empires }, store, link };
}

function result(state: GameState, player: Player): { save: Record<string, unknown>; public: PublicEmpire } {
  const snapshot = new SaveGame(tables().galaxy.params.seed, null).snapshot(state);
  delete snapshot.tab; // written by the server, not a browser tab
  return { save: snapshot, public: publicEmpire(state, colorFor(player.id)) };
}
