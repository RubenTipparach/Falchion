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
import { SaveGame, savedHome, type SavedGame } from '../app/SaveGame';
import { colorFor, publicEmpire, type PublicEmpire } from '../app/ServerSync';
import { Store } from '../app/Store';
import { createWorld, tradePartners } from '../app/World';
import { EmpireSim } from './EmpireSim';

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

export interface Advanced {
  /** The save after the years were played (same format the client stores). */
  readonly save: Record<string, unknown>;
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
export function advanceSave(save: unknown, player: { readonly id: string; readonly name: string }, toTurn: number): Advanced | null {
  if (!validSave(save) || !Number.isInteger(toTurn) || save.turn >= toTurn) return null;
  const { galaxy, tree, encounters } = tables();
  const world = createWorld(galaxy, player.id, savedHome(save));
  const economy: EconomyTables = {
    tree, classes: SHIP_CLASSES, governments: GOVERNMENTS, policies: POLICIES, tenets: TENETS,
    partners: tradePartners(world, world.home), alienTech: ALIEN_TECH, buildings: BUILDINGS, storage: STORAGE, upkeepOf,
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
  const from = state.turn;
  new EmpireSim({ store, galaxy, tree, encounters, world, economy }).advanceTo(toTurn);
  const after = store.state;
  const snapshot = new SaveGame(galaxy.params.seed, null).snapshot(after);
  delete snapshot.tab; // written by the server, not a browser tab
  return { save: snapshot, public: publicEmpire(after, colorFor(player.id)), years: after.turn - from };
}
