import type { Hex } from '../core/hex/Hex';
import type { TerritoryClaim } from '../render/map/TerritoryLayer';
import type { FleetView } from '../render/map/FleetLayer';
import type { GameState } from './GameState';
import type { SavedGame } from './SaveGame';

/** What other players may see of an empire (the server keeps only this public). */
export interface PublicEmpire {
  readonly color: string;
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

/** Colours for other empires; gold is yours. */
const PALETTE = ['#4fd1ff', '#c792ea', '#6ee7a8', '#ff8fa3', '#7fd3e6', '#ffd166', '#a98bff', '#f29bc9'];

export function colorFor(id: string): string {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

/** The public part of your empire, sent with each save. */
export function publicEmpire(s: GameState, color: string): PublicEmpire {
  const colonies = s.economy.colonies.map((c) => c.starId).filter((x): x is string => !!x)
    .map((id) => { const [q, r] = id.split(',').map(Number); return { q, r }; });
  return {
    color,
    home: s.home.hex,
    colonies,
    fleets: s.fleets.filter((f) => f.owner === s.playerName).map((f) => ({ id: f.id, name: f.name, movement: f.movement, design: f.design })),
  };
}

/** Other players as map fleets and territory. */
export function othersOnMap(players: readonly OtherPlayer[]): { fleets: FleetView[]; claims: TerritoryClaim[] } {
  const fleets: FleetView[] = [];
  const claims: TerritoryClaim[] = [];
  for (const p of players) {
    const color = p.color && p.color !== '#e6b450' ? p.color : colorFor(p.id);
    if (p.home) claims.push({ name: p.name, color, kind: 'other-player', home: p.home, colonies: [{ hex: p.home, radius: 5 }, ...p.colonies.map((hex) => ({ hex, radius: 3 }))] });
    for (const f of p.fleets) if (f.movement?.route?.length) fleets.push({ ...f, id: `${p.id}:${f.id}`, name: `${f.name} · ${p.name}`, owner: p.name, color });
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
