import { HERALDRY } from '../content/heraldry';
import { cleanIdentity } from '../core/empire/Identity';
import type { Command } from '../sim/commands';
import type { GameState } from './GameState';
import { savedFields, type SavedGame } from './SaveGame';
import type { Store } from './Store';

/**
 * The server runs this empire; the browser shows it. Each order is applied here at once (so the
 * game answers instantly) and sent to the server as a command, one at a time and in order. Once
 * every order sent has been answered, the browser adopts the server's empire: what the server
 * decided is the truth. Each world year the server also pushes the empire's new state; if that
 * push does not arrive, the state is fetched.
 */
export class ServerAuthority {
  private queue: Promise<void> = Promise.resolve();
  private pending = 0;
  /** The newest server state seen while orders were still in flight. */
  private latest: SavedGame | null = null;
  private expectTimer: ReturnType<typeof setTimeout> | null = null;
  private active: boolean;

  constructor(
    private readonly store: Store<GameState>,
    /** Whether the server already holds this empire (else it is created on founding). */
    active: boolean,
    /** Tell the player something (a refused order). */
    private readonly notify: (text: string) => void,
    private readonly fetchImpl: typeof fetch = (...a) => fetch(...a),
  ) {
    this.active = active;
  }

  /** True once the server holds the empire: orders go to it and its state is the truth. */
  get running(): boolean {
    return this.active;
  }

  /** The server now holds the empire (it was just created there). */
  activate(): void {
    this.active = true;
  }

  /** Send an order (already applied locally). `time`: when the player gave it, in world years. */
  send(command: Command, time: number): void {
    if (!this.active) return;
    this.pending++;
    this.queue = this.queue.then(async () => {
      try {
        const res = await this.fetchImpl('./api/command', {
          method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command, time }),
        });
        const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; save?: SavedGame };
        if (body.save) this.latest = body.save;
        if (body.ok === false && body.error) this.notify(`The server refused that order: ${body.error}`);
      } catch {
        // Offline: the next answer, push or fetch brings the server's state back.
      }
    }).finally(() => {
      this.pending--;
      if (this.pending === 0 && this.latest) this.adopt(this.latest);
    });
  }

  /** The server pushed this year's state. While orders are in flight, their answers win. */
  onServerState(save: SavedGame | undefined): void {
    if (!this.active || !save) return;
    if (this.expectTimer) { clearTimeout(this.expectTimer); this.expectTimer = null; }
    if (this.pending > 0) { this.latest = save; return; }
    this.adopt(save);
  }

  /** A world year began: if no push brings it within a few seconds, fetch the server's state. */
  expectTick(tick: number): void {
    if (!this.active) return;
    if (this.expectTimer) clearTimeout(this.expectTimer);
    this.expectTimer = setTimeout(() => {
      this.expectTimer = null;
      if (this.store.state.turn >= tick || this.pending > 0) return;
      void this.refresh();
    }, 6_000);
  }

  /** Fetch and adopt the server's empire now. */
  async refresh(): Promise<void> {
    try {
      const res = await this.fetchImpl('./api/save', { credentials: 'same-origin', cache: 'no-store' });
      if (res.ok && this.pending === 0) this.adopt((await res.json()) as SavedGame);
    } catch {
      // Offline: try again next year.
    }
  }

  /** Make the server's empire the one shown; what is selected and focused stays. */
  adopt(save: SavedGame): void {
    if (!save || !Number.isInteger(save.turn)) return;
    this.latest = null;
    const patch = savedFields(save);
    this.store.update((s) => {
      const fleets = (patch.fleets ?? s.fleets);
      return {
        ...patch,
        home: s.home,
        identity: cleanIdentity(save.identity, HERALDRY),
        selectedFleet: s.selectedFleet && fleets.some((f) => f.id === s.selectedFleet) ? s.selectedFleet : null,
      };
    });
  }
}
