import type { Squadron } from '../combat/Combat';
import { fieldLeft, type AsteroidField, type FieldState } from '../galaxy/Asteroids';
import type { NpcState } from '../npc/types';
import { clampStanding } from '../npc/Reputation';
import { applyDiplomacy, NEUTRAL, pairKey, type DiplomaticAction, type Relation } from '../diplomacy/Diplomacy';

/**
 * The state the whole galaxy shares: the NPC empires that have been discovered and the asteroid
 * fields that have been mined. Everything else is implied (an untouched field is full, an
 * undiscovered NPC is dormant), so it stays small. The server holds it and runs it; a guest's
 * browser keeps its own. Empires change it only through `SharedEffect`s their simulation
 * emits, applied in order by `applyEffects`.
 */
export interface SharedWorld {
  /** World year the NPCs were last stepped to. */
  readonly tick: number;
  readonly npcs: Readonly<Record<string, NpcState>>;
  readonly asteroids: Readonly<Record<string, FieldState>>;
  /** Relations between players (pairKey), when not neutral or with a proposal open. */
  readonly relations?: Readonly<Record<string, Relation>>;
}

export const EMPTY_WORLD: SharedWorld = { tick: 0, npcs: {}, asteroids: {} };

/** Whether stored data is a shared world (anything else is treated as a fresh one). */
export function validWorld(w: unknown): w is SharedWorld {
  const x = w as SharedWorld | null;
  return !!x && typeof x === 'object' && Number.isFinite(x.tick) && !!x.npcs && typeof x.npcs === 'object' && !!x.asteroids && typeof x.asteroids === 'object';
}

export type SharedEffect =
  /** Ships mined `amount` from a field in `year`. */
  | { readonly kind: 'mined'; readonly field: AsteroidField; readonly amount: number; readonly year: number }
  /** A player found an NPC (activating it if nobody had). `npc` is the state to start it with. */
  | { readonly kind: 'discover'; readonly npc: NpcState; readonly by: string }
  /** An NPC fleet after a battle a player started: its survivors (none: destroyed). */
  | { readonly kind: 'npcFleet'; readonly npc: string; readonly fleet: string; readonly ships: readonly Squadron[] }
  /** An NPC world after an assault: its garrison now, and who took it if it fell. */
  | { readonly kind: 'npcColony'; readonly npc: string; readonly star: string; readonly garrison: readonly Squadron[]; readonly capturedBy?: string }
  /** A player's standing with an NPC changed by `delta` (clamped to ±100). `base`: where it starts if unrecorded. */
  | { readonly kind: 'standing'; readonly npc: string; readonly player: string; readonly delta: number; readonly base: number }
  /** A player's diplomatic action toward another (ignored when not open to them). */
  | { readonly kind: 'diplomacy'; readonly by: string; readonly other: string; readonly action: DiplomaticAction; readonly at: number }
  /** The NPC empires after a year of their own (stepped by whoever runs them: the server, or a guest's browser). */
  | { readonly kind: 'npcStep'; readonly npcs: Readonly<Record<string, NpcState>>; readonly tick: number };

/** The world after some effects, in order. Pure. */
export function applyEffects(world: SharedWorld, effects: readonly SharedEffect[]): SharedWorld {
  let npcs = world.npcs;
  let asteroids = world.asteroids;
  let tick = world.tick;
  let relations = world.relations;
  for (const e of effects) {
    switch (e.kind) {
      case 'mined': {
        const left = fieldLeft(e.field, asteroids[e.field.id], e.year);
        asteroids = { ...asteroids, [e.field.id]: { left: Math.max(0, left - e.amount), at: e.year } };
        break;
      }
      case 'discover': {
        const known = npcs[e.npc.id];
        npcs = known
          ? (known.knownBy.includes(e.by) ? npcs : { ...npcs, [known.id]: { ...known, knownBy: [...known.knownBy, e.by] } })
          : { ...npcs, [e.npc.id]: { ...e.npc, knownBy: [e.by] } };
        break;
      }
      case 'npcFleet': {
        const n = npcs[e.npc];
        if (!n) break;
        const ships = e.ships.filter((s) => s.count > 0);
        const fleets = ships.length ? n.fleets.map((f) => (f.id === e.fleet ? { ...f, ships } : f)) : n.fleets.filter((f) => f.id !== e.fleet);
        npcs = { ...npcs, [e.npc]: { ...n, fleets } };
        break;
      }
      case 'standing': {
        const n = npcs[e.npc];
        if (!n) break;
        const now = clampStanding((n.standing?.[e.player] ?? e.base) + e.delta);
        npcs = { ...npcs, [e.npc]: { ...n, standing: { ...n.standing, [e.player]: now } } };
        break;
      }
      case 'diplomacy': {
        if (e.by === e.other) break;
        const key = pairKey(e.by, e.other);
        const next = applyDiplomacy(relations?.[key] ?? NEUTRAL, e.by, e.action, e.at);
        if (next) relations = { ...relations, [key]: next };
        break;
      }
      case 'npcStep': {
        npcs = e.npcs;
        tick = e.tick;
        break;
      }
      case 'npcColony': {
        const n = npcs[e.npc];
        if (!n) break;
        const colonies = n.colonies.map((c) => (c.starId === e.star ? { ...c, garrison: e.garrison, ...(e.capturedBy ? { capturedBy: e.capturedBy } : {}) } : c));
        npcs = { ...npcs, [e.npc]: { ...n, colonies } };
        break;
      }
    }
  }
  if (npcs === world.npcs && asteroids === world.asteroids && tick === world.tick && relations === world.relations) return world;
  return { ...world, tick, npcs, asteroids, ...(relations ? { relations } : {}) };
}
