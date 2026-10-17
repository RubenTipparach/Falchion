import type { OtherEmpire } from '../sim/EmpireSim';
import { cleanIdentity, type EmpireIdentity } from '../core/empire/Identity';
import type { FleetMovement } from '../core/fleet/Fleet';
import type { Hex } from '../core/hex/Hex';
import { HERALDRY } from '../content/heraldry';
import { hasWarships } from '../content/logistics';
import type { TerritoryClaim } from '../render/map/TerritoryLayer';
import type { FleetView } from '../render/map/FleetLayer';
import type { GameState } from './GameState';
import type { SavedGame } from './SaveGame';
import { COLONY_RADIUS, HOME_RADIUS } from './World';

/** What other players may see of an empire (the server keeps only this public). */
export interface PublicEmpire {
  readonly color: string;
  /** Name, ruler and flag chosen on the founding screen (absent before founding). */
  readonly empire?: Pick<EmpireIdentity, 'name' | 'ruler' | 'title' | 'capital' | 'flag'>;
  readonly home: Hex;
  readonly colonies: readonly Hex[];
  /**
   * `armed`: has warships. `stance`: 'aggressive' when it attacks the fleets it meets at sea (absent
   * = passive). `battle`: the fleet it last fought at sea (`${ownerId}:${fleetId}`) and the year, so
   * the server can tell a fleet that breaks off from one that pursues.
   */
  readonly fleets: ReadonlyArray<Pick<FleetView, 'id' | 'name' | 'movement' | 'design'> & { readonly armed: boolean; readonly stance?: 'aggressive'; readonly battle?: { readonly foe: string; readonly tick: number }; readonly chase?: string; readonly damage?: Readonly<Record<string, number>> }>;
}

/** Another player in the shared galaxy, as /api/players returns them (and the live stream pushes them). */
export interface OtherPlayer extends PublicEmpire {
  readonly id: string;
  readonly name: string;
  readonly avatar: string | null;
  /** Wall-clock ms of their last save. */
  readonly updatedAt?: number;
}

const isHex = (h: unknown): h is Hex => !!h && Number.isInteger((h as Hex).q) && Number.isInteger((h as Hex).r);

/**
 * Another player's fleet movement is untrusted input: integer hexes and speed, a bounded route, a
 * departure time (fractional when redirected between ticks) and, if given, a finite start point.
 */
export function isFleetMovement(m: unknown): m is FleetMovement {
  const x = m as FleetMovement | null;
  const from = x?.from;
  return !!x && Array.isArray(x.route) && x.route.length > 0 && x.route.length <= 100_000 && x.route.every(isHex)
    && Number.isFinite(x.departTurn) && x.departTurn >= 0 && Number.isInteger(x.speed) && x.speed >= 1
    && (from === undefined || (!!from && Number.isFinite(from.x) && Number.isFinite(from.z)));
}

/** Fallback colours for players who have not founded their empire yet. */
const PALETTE = ['#4fd1ff', '#c792ea', '#6ee7a8', '#ff8fa3', '#7fd3e6', '#ffd166', '#a98bff', '#f29bc9'];

export function colorFor(id: string): string {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

/** The public part of your empire, sent with each save. */
export function publicEmpire(s: GameState, color: string): PublicEmpire {
  const colonies = colonyHexes(s);
  const id = s.identity;
  return {
    color: id?.color ?? color,
    empire: id ? { name: id.name, ruler: id.ruler, title: id.title, capital: id.capital, flag: id.flag } : undefined,
    home: s.home.hex,
    colonies,
    fleets: s.fleets.filter((f) => f.owner === s.playerName).map((f) => {
      const l = s.loadouts[f.id];
      const battle = l?.battle ? { battle: { foe: l.battle.foe, tick: l.battle.tick } } : {};
      const chase = l?.orders?.chase ? { chase: l.orders.chase } : {};
      // The damage its ships carry: other players see it in the battle view.
      const damage = l?.damage ? { damage: l.damage } : {};
      return { id: f.id, name: f.name, movement: f.movement, design: f.design, armed: hasWarships(l?.ships ?? []), stance: l?.orders?.stance, ...battle, ...chase, ...damage };
    }),
  };
}

/** Star hexes of a state's colonies (each settled system once). */
function colonyHexes(s: GameState): Hex[] {
  const ids = [...new Set(s.economy.colonies.map((c) => c.starId).filter((x): x is string => !!x))];
  return ids.map((id) => { const [q, r] = id.split(',').map(Number); return { q, r }; });
}

/** Your own territory: the home system plus every system you have settled, in your colours. */
export function ownClaim(s: GameState): TerritoryClaim {
  const id = s.identity;
  const others = colonyHexes(s).filter((h) => h.q !== s.home.hex.q || h.r !== s.home.hex.r);
  return {
    name: id?.name ?? 'Your Empire', color: id?.color ?? '#e6b450', kind: 'player', home: s.home.hex, flag: id?.flag,
    colonies: [{ hex: s.home.hex, radius: HOME_RADIUS }, ...others.map((hex) => ({ hex, radius: COLONY_RADIUS }))],
  };
}

/** What another player's fleet shows of its stance: an aggressive warfleet attacks yours at sea. */
export function fleetStance(f: { readonly armed?: unknown; readonly stance?: unknown }): string | undefined {
  if (f.armed !== true) return undefined;
  return f.stance === 'aggressive' ? 'Aggressive warfleet' : 'Warfleet';
}

/** Other players as map fleets and territory, labelled with their empire's name and flag. */
export function othersOnMap(players: readonly OtherPlayer[]): { fleets: FleetView[]; claims: TerritoryClaim[] } {
  const fleets: FleetView[] = [];
  const claims: TerritoryClaim[] = [];
  for (const p of players) {
    // Another player's identity is untrusted input: validate it like a save.
    const id = p.empire ? cleanIdentity({ ...p.empire, color: p.color }, HERALDRY) : null;
    const color = id?.color ?? colorFor(p.id);
    const name = id?.name ?? p.name;
    if (isHex(p.home)) claims.push({ id: p.id, name, color, kind: 'other-player', home: p.home, flag: id?.flag, colonies: [{ hex: p.home, radius: HOME_RADIUS }, ...(p.colonies ?? []).filter(isHex).map((hex) => ({ hex, radius: COLONY_RADIUS }))] });
    for (const f of p.fleets ?? []) if (isFleetMovement(f.movement)) fleets.push({ ...f, id: `${p.id}:${f.id}`, name: `${f.name} · ${name}`, owner: name, color, status: fleetStance(f) });
  }
  return { fleets, claims };
}

/** Other players as diplomacy sees them: id, empire name, colour and worlds (untrusted input, checked). */
export function empiresOf(players: readonly OtherPlayer[]): OtherEmpire[] {
  return players.map((p) => {
    const id = p.empire ? cleanIdentity({ ...p.empire, color: p.color }, HERALDRY) : null;
    return { id: p.id, name: id?.name ?? p.name, color: id?.color ?? colorFor(p.id), home: isHex(p.home) ? p.home : null, colonies: (p.colonies ?? []).filter(isHex) };
  });
}

/** Routine saves reach the server at most every 10 s; news other players should see, every 2.5 s. */
/** A signed-in player's empire as the server holds (and runs) it, and the other players. */
export class ServerSaves {
  async load(): Promise<SavedGame | null> {
    try {
      const res = await fetch('./api/save', { credentials: 'same-origin', cache: 'no-store' });
      return res.ok ? ((await res.json()) as SavedGame) : null;
    } catch {
      return null;
    }
  }

  /**
   * Start a new empire on the server: the one save it ever takes from this browser. After that
   * the server runs the empire. `existing`: the server already had one (founded on another device).
   */
  async create(save: object, pub: PublicEmpire): Promise<{ created: boolean; existing?: SavedGame }> {
    try {
      const res = await fetch('./api/save', { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ save, public: pub }) });
      if (res.ok) return { created: true };
      const body = (await res.json().catch(() => ({}))) as { save?: SavedGame };
      return { created: false, existing: res.status === 409 ? body.save : undefined };
    } catch {
      return { created: false };
    }
  }

  async players(): Promise<OtherPlayer[]> {
    try {
      const res = await fetch('./api/players', { credentials: 'same-origin', cache: 'no-store' });
      return res.ok ? ((await res.json()) as OtherPlayer[]) : [];
    } catch {
      return [];
    }
  }
}
