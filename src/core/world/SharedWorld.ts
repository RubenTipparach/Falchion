import type { Squadron } from '../combat/Combat';
import { fieldLeft, type AsteroidField, type FieldState } from '../galaxy/Asteroids';
import type { NpcState } from '../npc/types';
import { clampStanding } from '../npc/Reputation';
import { applyDiplomacy, haveMet, NEUTRAL, pairKey, type Contacts, type DiplomaticAction, type Relation } from '../diplomacy/Diplomacy';

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
  /** Pairs of players that have met (first contact), with when. */
  readonly contacts?: Contacts;
  /** Shares other players hold in a player's companies: company key (`${owner}:${companyId}`) -> holder -> shares. */
  readonly stakes?: Readonly<Record<string, Readonly<Record<string, number>>>>;
  /** Credits owed to a player (tariffs, dividends), by what for: collected in their next year. */
  readonly payouts?: Readonly<Record<string, Readonly<Record<string, number>>>>;
}

/** Most separate payout lines kept for one player (the rest are added to "Other"). */
const MAX_PAYOUT_LINES = 40;

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
  /** Two players met for the first time at world time `at` (ignored if they already had). */
  | { readonly kind: 'contact'; readonly a: string; readonly b: string; readonly at: number }
  /** A player's diplomatic action toward another (ignored when not open to them, or before they met). */
  | { readonly kind: 'diplomacy'; readonly by: string; readonly other: string; readonly action: DiplomaticAction; readonly at: number }
  /** The NPC empires after a year of their own (stepped by whoever runs them: the server, or a guest's browser). */
  | { readonly kind: 'npcStep'; readonly npcs: Readonly<Record<string, NpcState>>; readonly tick: number }
  /** A player bought (positive) or sold shares of another player's company (`${owner}:${companyId}`). */
  | { readonly kind: 'stake'; readonly company: string; readonly player: string; readonly delta: number }
  /** Credits owed to a player: a tariff or a dividend, collected in their next year. */
  | { readonly kind: 'payout'; readonly to: string; readonly label: string; readonly credits: number }
  /** A player collected what it was owed (exactly these amounts: what arrived since stays owed). */
  | { readonly kind: 'claim'; readonly player: string; readonly amounts: Readonly<Record<string, number>> };

/** The world after some effects, in order. Pure. */
export function applyEffects(world: SharedWorld, effects: readonly SharedEffect[]): SharedWorld {
  let npcs = world.npcs;
  let asteroids = world.asteroids;
  let tick = world.tick;
  let relations = world.relations;
  let contacts = world.contacts;
  let stakes = world.stakes;
  let payouts = world.payouts;
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
        if (!haveMet(contacts, relations, e.by, e.other)) break;
        const key = pairKey(e.by, e.other);
        const next = applyDiplomacy(relations?.[key] ?? NEUTRAL, e.by, e.action, e.at);
        if (next) relations = { ...relations, [key]: next };
        break;
      }
      case 'contact': {
        if (e.a === e.b || haveMet(contacts, relations, e.a, e.b)) break;
        contacts = { ...contacts, [pairKey(e.a, e.b)]: e.at };
        break;
      }
      case 'npcStep': {
        npcs = e.npcs;
        tick = e.tick;
        break;
      }
      case 'stake': {
        const holders = { ...stakes?.[e.company] };
        const n = Math.max(0, Math.round((holders[e.player] ?? 0) + e.delta));
        if (n) holders[e.player] = n;
        else delete holders[e.player];
        const next = { ...stakes };
        if (Object.keys(holders).length) next[e.company] = holders;
        else delete next[e.company];
        stakes = next;
        break;
      }
      case 'payout': {
        if (!(e.credits > 0) || !Number.isFinite(e.credits)) break;
        const owed = { ...payouts?.[e.to] };
        const label = e.label in owed || Object.keys(owed).length < MAX_PAYOUT_LINES ? e.label : 'Other';
        owed[label] = Math.round(((owed[label] ?? 0) + e.credits) * 100) / 100;
        payouts = { ...payouts, [e.to]: owed };
        break;
      }
      case 'claim': {
        const owed = { ...payouts?.[e.player] };
        for (const [label, n] of Object.entries(e.amounts)) {
          const left = Math.round(((owed[label] ?? 0) - n) * 100) / 100;
          if (left > 0) owed[label] = left;
          else delete owed[label];
        }
        const next = { ...payouts };
        if (Object.keys(owed).length) next[e.player] = owed;
        else delete next[e.player];
        payouts = next;
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
  if (npcs === world.npcs && asteroids === world.asteroids && tick === world.tick && relations === world.relations && contacts === world.contacts && stakes === world.stakes && payouts === world.payouts) return world;
  return { ...world, tick, npcs, asteroids, ...(relations ? { relations } : {}), ...(contacts ? { contacts } : {}), ...(stakes ? { stakes } : {}), ...(payouts ? { payouts } : {}) };
}
