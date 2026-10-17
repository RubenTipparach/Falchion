import clockConfig from '../../server/clock.json';
import { ClockConfig, tickAt, tickFraction, tickStartMs } from '../core/time/WorldTime';

/**
 * The world clock the client follows. When served by the Falchion server the
 * server is authoritative: it pushes each tick over Server-Sent Events and the
 * client corrects for clock skew. Elsewhere (GitHub Pages, the artifact) the
 * same wall-clock schedule runs locally, so every client agrees on the year.
 */
export interface WorldClock {
  readonly config: ClockConfig;
  readonly source: 'server' | 'local';
  /** Server-corrected wall-clock ms. */
  now(): number;
  tick(): number;
  /** Fraction of the current year elapsed, in [0, 1). */
  fraction(): number;
  /** Calls back with the new tick whenever the world advances. */
  onTick(fn: (tick: number) => void): void;
  /** Calls back once when the server reports a different build than this page loaded with. */
  onNewVersion(fn: (version: string) => void): void;
}

export const CLOCK: ClockConfig = clockConfig;

class Clock implements WorldClock {
  private readonly listeners = new Set<(tick: number) => void>();
  private readonly versionListeners = new Set<(version: string) => void>();
  private last: number;
  private newVersionSeen = false;

  constructor(readonly config: ClockConfig, readonly source: 'server' | 'local', private offsetMs = 0, private readonly version: string | null = null) {
    this.last = this.tick();
    this.scheduleLocal();
  }

  now(): number { return Date.now() + this.offsetMs; }
  tick(): number { return tickAt(this.now(), this.config); }
  fraction(): number { return tickFraction(this.now(), this.config); }
  onTick(fn: (tick: number) => void): void { this.listeners.add(fn); }
  onNewVersion(fn: (version: string) => void): void { this.versionListeners.add(fn); }

  /** Server-pushed tick (also corrects skew, and notices a redeployed server). */
  serverTick(tick: number, serverNow: number, version?: string): void {
    if (this.version && version && version !== this.version && !this.newVersionSeen) {
      this.newVersionSeen = true;
      this.versionListeners.forEach((l) => l(version));
    }
    // Small skew changes are slewed in so moving ships don't hop once a minute.
    const offset = serverNow - Date.now();
    this.offsetMs = Math.abs(offset - this.offsetMs) > 1000 ? offset : this.offsetMs + (offset - this.offsetMs) * 0.2;
    this.advance(tick);
  }

  private advance(tick: number): void {
    if (tick <= this.last) return;
    this.last = tick;
    this.listeners.forEach((l) => l(tick));
  }

  /** Local schedule: a backstop when connected, the clock itself when not. */
  private scheduleLocal(): void {
    const next = tickStartMs(this.tick() + 1, this.config);
    // When the server is authoritative, give its push a moment to arrive first.
    const grace = this.source === 'server' ? 1500 : 0;
    setTimeout(() => { this.advance(this.tick()); this.scheduleLocal(); }, Math.max(5, next - this.now() + grace));
  }
}

/** Connect to the server clock if there is one; otherwise run locally. */
export async function connectWorldClock(): Promise<WorldClock> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2500);
    const res = await fetch('./api/clock', { cache: 'no-store', signal: ctrl.signal });
    clearTimeout(timer);
    const info = res.ok && res.headers.get('content-type')?.includes('json') ? await res.json() : null;
    if (info && info.msPerTick === CLOCK.msPerTick && info.epochMs === CLOCK.epochMs) {
      const clock = new Clock(CLOCK, 'server', info.serverNow - Date.now(), typeof info.version === 'string' ? info.version : null);
      if (typeof EventSource !== 'undefined') {
        const listen = () => {
          const es = new EventSource('./api/ticks');
          es.addEventListener('tick', (e) => {
            const d = JSON.parse((e as MessageEvent).data);
            clock.serverTick(d.tick, d.serverNow, d.version);
          });
          // The browser retries dropped connections itself, but gives up on an error response:
          // reopen then. The local backstop keeps the year moving meanwhile.
          es.onerror = () => { if (es.readyState === EventSource.CLOSED) setTimeout(listen, 10_000); };
        };
        listen();
      }
      return clock;
    }
  } catch {
    // No server (static hosting or offline): fall through to the local clock.
  }
  return new Clock(CLOCK, 'local');
}
