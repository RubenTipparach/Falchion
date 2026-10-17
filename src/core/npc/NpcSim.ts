import type { GalaxyModel } from '../galaxy/GalaxyModel';
import { Hex, hexDistance } from '../hex/Hex';
import { Rng, hashSeed } from '../rng/Rng';
import type { SharedWorld } from '../world/SharedWorld';
import { buildEvery, garrisonHulls, npcById, RAID_RANGE, raiderHulls, shipsFor, type NpcDef } from './NpcCatalog';
import type { NpcFleet, NpcRaid, NpcState } from './types';
import { FRIENDLY, HOSTILE, STANDING, standingOf } from './Reputation';

/**
 * The NPC empires' year: pure and deterministic (seeded by NPC id and year), so the server and a
 * guest's browser get the same answer. Only discovered NPCs are stepped. Raiders strike the
 * empires that know them; what happens when they arrive is resolved by the empire they hit
 * (it has the fleets and colonies), from the raids returned here.
 */

/** What raiders can strike of one empire: its colony systems and its fleets on station. */
export interface RaidTargets {
  readonly player: string;
  readonly targets: ReadonlyArray<{ readonly hex: Hex; readonly what: 'colony' | 'fleet' }>;
}

/** Most years caught up in one go (a server that was down does not replay days of raids). */
const MAX_CATCH_UP = 30;

const totalShips = (f: { ships: readonly { count: number }[] }) => f.ships.reduce((n, s) => n + s.count, 0);

/** Years an NPC fleet needs from `from` to `to` (one light year a year). */
export const npcTravel = (f: Pick<NpcFleet, 'from' | 'to'>): number => hexDistance(f.from, f.to);
export const npcArrival = (f: NpcFleet): number => f.depart + npcTravel(f);

/** Step every discovered NPC to year `to`. Returns the new world and the raids that struck. */
export function stepNpcs(world: SharedWorld, to: number, galaxy: GalaxyModel, players: readonly RaidTargets[]): { world: SharedWorld; raids: NpcRaid[] } {
  if (to <= world.tick) return { world, raids: [] };
  const raids: NpcRaid[] = [];
  const npcs: Record<string, NpcState> = { ...world.npcs };
  for (let year = Math.max(world.tick + 1, to - MAX_CATCH_UP + 1); year <= to; year++) {
    for (const id of Object.keys(npcs).sort()) {
      const def = npcById(galaxy, id);
      if (!def) continue;
      npcs[id] = stepOne(npcs[id], def, year, players, raids);
    }
  }
  return { world: { ...world, tick: to, npcs }, raids };
}

function stepOne(state: NpcState, def: NpcDef, year: number, players: readonly RaidTargets[], raids: NpcRaid[]): NpcState {
  const rng = new Rng(hashSeed(def.id, 'year', year));
  let s = state;
  const holdsHome = s.colonies.some((c) => c.starId === def.home.id && !c.capturedBy);
  // Build and reinforce, while it still holds its home.
  if (holdsHome && year - s.lastBuilt >= buildEvery(def)) {
    const fleets = [...s.fleets];
    let built = s.built;
    if (fleets.length < def.tier + 1) {
      built++;
      fleets.push({ id: `${def.id}/${built}`, name: `${def.name} Raiders ${roman(built)}`, ships: shipsFor(def, raiderHulls(def), rng), mission: 'home', from: def.home.hex, to: def.home.hex, depart: year });
    }
    const colonies = s.colonies.map((c) => {
      if (c.capturedBy) return c;
      const want = garrisonHulls(def, c.starId);
      const have = totalShips({ ships: c.garrison });
      return have >= want ? c : { ...c, garrison: merge(c.garrison, shipsFor(def, Math.min(2, want - have), rng)) };
    });
    s = { ...s, fleets, colonies, built, lastBuilt: year };
  }
  // Standing drifts back toward the faction's disposition.
  const disposition = def.archetype.disposition;
  if (s.knownBy.length && year % STANDING.driftEvery === 0) {
    const standing: Record<string, number> = {};
    for (const p of s.knownBy) {
      const now = standingOf(s, p, disposition);
      standing[p] = now + Math.sign(disposition - now) * Math.min(STANDING.drift, Math.abs(disposition - now));
    }
    s = { ...s, standing };
  }
  // Friends are left alone; the hostile make it come sooner.
  const enemies = s.knownBy.filter((p) => standingOf(s, p, disposition) < FRIENDLY);
  const fury = enemies.some((p) => standingOf(s, p, disposition) <= HOSTILE) ? 1.5 : 1;
  const fleets = s.fleets.filter((f) => totalShips(f) > 0).map((f): NpcFleet => {
    if (f.mission === 'home') {
      if (!holdsHome || !enemies.length || !rng.chance(def.archetype.aggression * fury)) return f;
      const target = pickTarget(def, enemies, players, rng);
      return target ? { ...f, mission: 'raid', from: def.home.hex, to: target.hex, depart: year, target: target.player } : f;
    }
    if (npcArrival(f) > year) return f;
    if (f.mission === 'raid') {
      raids.push({ kind: 'raid', npc: def.id, fleet: f.id, player: f.target!, at: f.to, ships: f.ships, year });
      return { ...f, mission: 'return', from: f.to, to: def.home.hex, depart: year, target: undefined };
    }
    return { ...f, mission: 'home', from: def.home.hex, to: def.home.hex, depart: year };
  });
  return { ...s, fleets };
}

/** A target within reach of home among the empires that know this NPC: one of the nearest few. */
function pickTarget(def: NpcDef, knownBy: readonly string[], players: readonly RaidTargets[], rng: Rng): { hex: Hex; player: string } | null {
  const options = players.filter((p) => knownBy.includes(p.player))
    .flatMap((p) => p.targets.map((t) => ({ hex: t.hex, player: p.player, d: hexDistance(t.hex, def.home.hex) })))
    .filter((t) => t.d > 0 && t.d <= RAID_RANGE)
    .sort((a, b) => a.d - b.d || a.player.localeCompare(b.player) || a.hex.q - b.hex.q || a.hex.r - b.hex.r);
  return options.length ? rng.pick(options.slice(0, 3)) : null;
}

function merge(a: readonly { classId: string; count: number }[], b: readonly { classId: string; count: number }[]) {
  const m = new Map(a.map((x) => [x.classId, x.count]));
  for (const x of b) m.set(x.classId, (m.get(x.classId) ?? 0) + x.count);
  return [...m].map(([classId, count]) => ({ classId, count }));
}

function roman(n: number): string {
  const r: Array<[number, string]> = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let out = '';
  for (const [v, s] of r) while (n >= v) { out += s; n -= v; }
  return out;
}
