import { CAPITAL_START_POP } from '../core/economy/Population';
import { specOf } from '../content/logistics';
import type { Squadron } from '../core/combat/Combat';
import type { Colony } from '../core/economy/Economy';
import { newEmpire } from '../core/empire/Empire';
import { planMovement } from '../core/fleet/Fleet';
import { fullStores } from '../core/fleet/Logistics';
import type { Loadout } from '../core/fleet/Presence';
import type { GalaxyModel } from '../core/galaxy/GalaxyModel';
import { planetsOf, type Planet } from '../core/galaxy/Planets';
import { hexAdd, hexDistance } from '../core/hex/Hex';
import type { TechTree } from '../core/research/TechTree';
import { DEFAULT_DESIGN } from '../core/ships/ShipDesign';
import type { FleetView } from '../render/map/FleetLayer';
import type { GameState } from '../app/GameState';
import type { World } from '../app/World';

export interface NewEmpireDeps {
  readonly galaxy: GalaxyModel;
  readonly tree: TechTree;
  readonly world: World;
  readonly playerName: string;
  /** World year the empire starts in. */
  readonly t0: number;
}

/**
 * A new empire: a few roots researched, one star system settled on three of its worlds (the
 * capital with a shipyard), and a small fleet. Pure: the client starts players with it and lays
 * saves over it; the server and tests build empires the same way.
 */
export function newEmpireState({ galaxy, tree, world, playerName, t0 }: NewEmpireDeps): GameState {
  // Starting position: a young empire with a few roots researched and a small fleet.
  let research = newEmpire(playerName).research;
  for (const id of ['t-alloys', 'u-modular', 'a-heritage', 'a-duelist-tradition', 'o-grown-hulls', 'u-logistics']) {
    research = tree.research(tree.grantShards(research, id, 'science', tree.node(id).shards), id);
  }
  research = tree.grantShards(research, 't-lasers', 'science', 50);
  research = tree.grantShards(research, 'u-mining', 'science', 4);
  research = tree.grantShards(research, 'a-diplomacy', 'observation', 3);
  const empire = { ...newEmpire(playerName), research };

  // Colonies are real planets: an empire starts with one star system, settled on three of its worlds (the capital has a shipyard).
  const homePlanets = planetsOf(world.home, galaxy.params.seed);
  const colonyOf = (p: Planet, buildings: string[], capital = false): Colony =>
    ({ name: capital ? `${p.name} (capital)` : p.name, biome: p.biome, planetId: p.id, starId: p.starId, size: p.size, capital, buildings, pop: capital ? CAPITAL_START_POP : 1 });
  // Capital on the most habitable world; gas giants cannot be settled.
  const HABITABLE = ['terran', 'ocean', 'jungle', 'desert', 'ice', 'barren', 'volcanic', 'toxic'];
  const settleable = homePlanets.filter((p) => p.biome !== 'gas')
    .sort((a, b) => HABITABLE.indexOf(a.biome) - HABITABLE.indexOf(b.biome) || b.size - a.size);
  const colonies: Colony[] = [
    ...settleable.slice(0, 1).map((p) => colonyOf(p, ['shipyard', 'farm', 'trade-hub'], true)),
    ...settleable.slice(1, 3).map((p) => colonyOf(p, ['mine'])),
  ];
  const start = initialFleets(galaxy, world, playerName, t0);
  const houseDesign = { ...DEFAULT_DESIGN, colors: { primary: '#c8d0dc', secondary: '#2b3448', accent: '#ffb547' } };

  return {
    turn: t0, empire,
    economy: {
      roster: start.roster, government: 'council', policies: [],
      faith: null, spyNetworks: [], focus: 't-fusion', colonies,
    },
    designs: { prospector: { ...houseDesign, name: 'Prospector Skiff', style: 'utilitarian', seed: 4, length: 0.8, bulk: 0.8, engines: 2, weapons: 0 } },
    shipyardClass: 'prospector', hiddenTraits: [], home: world.home,
    selected: null, selectedFleet: null, selectedPlanet: null, explored: {}, openedCrates: [], collectedCaches: [], fleets: start.fleets, loadouts: start.loadouts, dockSpent: { supply: 0 }, depots: [], construction: [], playerName: playerName,
    lastReport: null, engaged: [], identity: null,
    dispatches: [{ turn: t0, text: 'Welcome, Commander. One year passes every minute. Survey Group Alpha is on station nearby: explore its planets and collect what you find. Ships need supply to explore, which refills in friendly systems, where damaged ships also repair.' }],
  };
}

function initialFleets(galaxy: GalaxyModel, world: World, player: string, t0: number) {
  const home = world.home.hex;
  const near = (dq: number, dr: number) => galaxy.nearestStar(hexAdd(home, { q: dq, r: dr }), 10) ?? world.home;
  const target = near(22, -9);
  const survey = near(5, -3);
  const house = (name: string, seed: number, style = DEFAULT_DESIGN.style) => ({ ...DEFAULT_DESIGN, name, style, seed, colors: { primary: '#c8d0dc', secondary: '#2b3448', accent: '#ffb547' } });
  // A strike group is on patrol nearby, arriving shortly.
  const patrol = near(-8, 6);
  const fleets: FleetView[] = [
    { id: 'scout-1', name: 'Scout Wing I', owner: player, color: '#e6b450', movement: planMovement(home, target.hex, t0 - 2, 1), design: house('Scout', 7, 'technological') },
    { id: 'survey-1', name: 'Survey Group Alpha', owner: player, color: '#e6b450', movement: planMovement(home, survey.hex, t0 - 6, 1), design: house('Survey', 9, 'technological') },
    { id: 'strike-1', name: '1st Strike Group', owner: player, color: '#e6b450', movement: planMovement(home, patrol.hex, Math.max(0, t0 + 3 - hexDistance(home, patrol.hex)), 1), design: house('Strike', 21, 'classic') },
  ];
  const loadout = (ships: Squadron[], supply?: number): Loadout => ({ ships, ...fullStores(ships, specOf), ...(supply === undefined ? {} : { supply }) });
  const loadouts: Record<string, Loadout> = {
    'scout-1': loadout([{ classId: 'pathfinder', count: 2 }]),
    'survey-1': { ...loadout([{ classId: 'survey-cutter', count: 2 }], 15), orders: { autoReturn: true } },
    'strike-1': loadout([{ classId: 'lancer', count: 6 }, { classId: 'railgun-monitor', count: 2 }, { classId: 'interceptor', count: 2 }]),
  };
  // Roster = every ship owned: deployed fleets plus the home dock.
  const roster: Record<string, number> = { prospector: 3, 'ice-cutter': 1, 'bulk-freighter': 1, interceptor: 2, 'survey-cutter': 1, 'colony-ark': 1, 'construction-tender': 1 };
  for (const l of Object.values(loadouts)) for (const x of l.ships) roster[x.classId] = (roster[x.classId] ?? 0) + x.count;
  return { fleets, loadouts, roster };
}

