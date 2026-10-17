import { cleanIdentity, type EmpireIdentity } from '../core/empire/Identity';
import type { Hex } from '../core/hex/Hex';
import { HERALDRY } from '../content/heraldry';
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
  readonly fleets: ReadonlyArray<Pick<FleetView, 'id' | 'name' | 'movement' | 'design'>>;
}

/** Another player in the shared galaxy, as /api/players returns them. */
export interface OtherPlayer extends PublicEmpire {
  readonly id: string;
  readonly name: string;
  readonly avatar: string | null;
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
    fleets: s.fleets.filter((f) => f.owner === s.playerName).map((f) => ({ id: f.id, name: f.name, movement: f.movement, design: f.design })),
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

/** Other players as map fleets and territory, labelled with their empire's name and flag. */
export function othersOnMap(players: readonly OtherPlayer[]): { fleets: FleetView[]; claims: TerritoryClaim[] } {
  const fleets: FleetView[] = [];
  const claims: TerritoryClaim[] = [];
  for (const p of players) {
    // Another player's identity is untrusted input: validate it like a save.
    const id = p.empire ? cleanIdentity({ ...p.empire, color: p.color }, HERALDRY) : null;
    const color = id?.color ?? colorFor(p.id);
    const name = id?.name ?? p.name;
    if (p.home) claims.push({ name, color, kind: 'other-player', home: p.home, flag: id?.flag, colonies: [{ hex: p.home, radius: HOME_RADIUS }, ...p.colonies.map((hex) => ({ hex, radius: COLONY_RADIUS }))] });
    for (const f of p.fleets) if (f.movement?.route?.length) fleets.push({ ...f, id: `${p.id}:${f.id}`, name: `${f.name} · ${name}`, owner: name, color });
  }
  return { fleets, claims };
}

/** Saves for a signed-in player live on the server, so they follow them between devices. */
export class ServerSaves {
  private lastPush = 0;
  private pending: ReturnType<typeof setTimeout> | null = null;
  private latest: string | null = null;

  async load(): Promise<SavedGame | null> {
    try {
      const res = await fetch('./api/save', { credentials: 'same-origin', cache: 'no-store' });
      return res.ok ? ((await res.json()) as SavedGame) : null;
    } catch {
      return null;
    }
  }

  /** Push at most every 10 s (the latest state wins). */
  push(save: object, pub: PublicEmpire): void {
    this.latest = JSON.stringify({ save, public: pub });
    if (this.pending) clearTimeout(this.pending);
    const wait = Math.max(0, 10_000 - (Date.now() - this.lastPush));
    this.pending = setTimeout(() => this.send(false), wait);
  }

  /**
   * Send a waiting push now: when the page is closing or reloading, or after a change that
   * must reach other devices at once. keepalive lets the request finish after the page goes.
   */
  flush(): void {
    if (this.pending) this.send(true);
  }

  private send(keepalive: boolean): void {
    if (this.pending) clearTimeout(this.pending);
    this.pending = null;
    const body = this.latest;
    if (!body) return;
    this.lastPush = Date.now();
    // Browsers cap keepalive bodies at 64 KB; a larger save goes as a normal request.
    fetch('./api/save', { method: 'PUT', credentials: 'same-origin', keepalive: keepalive && body.length < 60_000, headers: { 'Content-Type': 'application/json' }, body })
      .catch(() => { /* offline: the local save still has it; the next push retries */ });
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
