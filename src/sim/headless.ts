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
import { colorFor, publicEmpire, type PublicEmpire } from '../app/ServerSync';
import { Store } from '../app/Store';
import { createWorld } from '../app/World';
import { EmpireSim, snapshotLink, type SimDeps } from './EmpireSim';
import { applyEffects, EMPTY_WORLD, validWorld, type SharedEffect, type SharedWorld } from '../core/world/SharedWorld';

/** The server applies empires' changes to the shared world with the same rules. */
export { applyEffects, EMPTY_WORLD, validWorld };
import { CommandError, decodeArgs, type Command } from './commands';

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
 * absence is caught up as the client would (the most recent week in full).
 */
export function advanceSave(save: unknown, player: Player, toTurn: number, world: SharedWorld = EMPTY_WORLD): Advanced | null {
  if (!validSave(save) || !Number.isInteger(toTurn) || save.turn >= toTurn) return null;
  const { deps, store, link } = runtime(save, player, world);
  const from = store.state.turn;
  const sim = new EmpireSim(deps);
  sim.advanceTo(toTurn);
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
 * so a fleet sets off from where the player saw it.
 */
export function applyCommand(save: unknown, player: Player, worldTime: number, command: unknown, clientTime?: number, world: SharedWorld = EMPTY_WORLD): Applied | null {
  if (!validSave(save) || !Number.isFinite(worldTime)) return null;
  const { deps, store, link } = runtime(save, player, world);
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

/** A save as live simulation state, with its world and the shared world it plays in. */
function runtime(saved: SavedGame, player: Player, shared: SharedWorld): { deps: SimDeps; store: Store<GameState>; link: ReturnType<typeof snapshotLink> } {
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
  return { deps: { store, galaxy, tree, encounters, world, economy, shared: link }, store, link };
}

function result(state: GameState, player: Player): { save: Record<string, unknown>; public: PublicEmpire } {
  const snapshot = new SaveGame(tables().galaxy.params.seed, null).snapshot(state);
  delete snapshot.tab; // written by the server, not a browser tab
  return { save: snapshot, public: publicEmpire(state, colorFor(player.id)) };
}
