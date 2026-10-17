import type { ShipClassDef } from '../../content/shipClasses';
import { BAND_MULT, bandOf, type Band } from '../../core/combat/Combat';
import { afterRound, shipHealths, shipValue, type BattleRecord } from '../../core/combat/BattleRecord';
import { Rng, hashSeed } from '../../core/rng/Rng';

/**
 * The battle view's script: one round at sea turned into scheduled events (who fires at whom and
 * when, kill shots so every loss has a visible cause, boarding pods, repair beams, jamming) and
 * each ship's health over the round. Pure and seeded: no three.js, no clock, no Math.random. The
 * renderer places ships and draws the events as a function of the time `t` (seconds into the
 * round, 0 to `R`).
 */

export type Vec3 = readonly [number, number, number];

/** How each class fires on screen. */
export const WEAPON: Readonly<Record<string, string>> = {
  lancer: 'lance', dreadnought: 'heavylance', 'railgun-monitor': 'rail', 'missile-barge': 'missile', 'swarm-carrier': 'drones',
  interceptor: 'bolt', brawler: 'heavybolt', leviathan: 'plasma', jammer: 'pulse', 'flak-picket': 'flak', 'boarding-corvette': 'boarder',
  'tractor-tender': 'boarder', 'repair-tender': 'repair', bombard: 'rail', 'planet-cracker': 'heavylance', 'drop-ship': 'bolt', 'assault-carrier': 'bolt',
  monolith: 'heavylance', flagship: 'heavylance', 'survey-cutter': 'bolt', pathfinder: 'bolt',
};
const weaponOf = (classId: string): string => WEAPON[classId] ?? 'bolt';

/** Formation rank by doctrine: brawlers in front, menders at the back. */
const RANK: Readonly<Record<string, number>> = { short: 0, capture: 1, long: 2, barrage: 3, siege: 3, suppression: 4, assault: 4, support: 5, civilian: 5 };

/** Effect colours, by name (the renderer maps them to RGB). */
export type FxColor = 'long' | 'short' | 'barrage' | 'siege' | 'sup' | 'cap' | 'support';

export interface ScriptShip {
  readonly i: number;
  readonly side: 0 | 1;
  readonly classId: string;
  readonly def: ShipClassDef;
  /** Place in its fleet's formation (fleet-local: x across, y up, z back from the front). */
  readonly slot: Vec3;
  /** Phase for idle motion. */
  readonly ph: number;
  /** Destroyed at this time (Infinity: survives the round). */
  death: number;
  /** Boarded at this time by `capBy` (Infinity: not boarded). */
  cap: number;
  capBy: 0 | 1 | -1;
  /** Crippled (venting) from this time until boarded. */
  crip: number;
  /** Health at the start and at the end of the round (0 to 1). */
  h0: number;
  h1: number;
  /** Order among the ships its captor took (for their place at the back). */
  capIdx: number;
  /** Hits that land on it: [time, weight, event index]. */
  readonly hits: Array<readonly [number, number, number]>;
  readonly heals: number[];
  hpTotal: number;
}

export type EventKind = 'beam' | 'slug' | 'missile' | 'drones' | 'bolt' | 'plasma' | 'pulse' | 'pod' | 'repair' | 'jam';

export interface ScriptEvent {
  readonly k: EventKind;
  /** Firing ship and target (indices into ships, -1 for none). */
  readonly s: number;
  readonly d: number;
  readonly t0: number;
  /** Flight or beam time, seconds. */
  readonly f: number;
  /** How long after t0 it is drawn. */
  readonly span: number;
  readonly side: 0 | 1;
  /** Aim point on the target, as a unit vector (scaled by the target's size). */
  readonly off: Vec3 | null;
  readonly c?: FxColor;
  readonly w?: number;
  readonly kill?: boolean;
  /** Bolts: whether it reaches (out of range it fades at `fall` of the way). */
  readonly reach?: boolean;
  readonly fall?: number;
  readonly speed?: number;
  /** Bolts of a kill shot land exactly at this time. */
  readonly exact?: number;
  /** Missiles: shot down at this fraction of the flight (0 = not), by this picket. */
  readonly icpt?: number;
  readonly picket?: number;
  readonly k1?: Vec3;
  readonly k2?: Vec3;
  readonly seedj?: number;
  /** Boarding pods: clamp until this time; landing point (unit vector). */
  readonly until?: number;
  readonly off2?: Vec3;
  /** Jamming: how much it dims the side's fire. */
  readonly amt?: number;
}

export interface BattleScript {
  readonly record: BattleRecord;
  readonly band: Band;
  /** Seconds the round lasts on screen. */
  readonly R: number;
  readonly ships: readonly ScriptShip[];
  /** Sorted by start time. */
  readonly events: readonly ScriptEvent[];
  /** Strength at the battle's start (the meter's 100%) for each side. */
  readonly start: readonly [number, number];
}

const unit = (rng: Rng): Vec3 => {
  const z = rng.range(-1, 1), a = rng.range(0, Math.PI * 2), r = Math.sqrt(1 - z * z);
  return [r * Math.cos(a), z, r * Math.sin(a)];
};
const scale = (v: Vec3, k: number): Vec3 => [v[0] * k, v[1] * k, v[2] * k];
const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
export const sstep = (a: number, b: number, x: number): number => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function shuffle<T>(arr: T[], rng: Rng): T[] {
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rng.next() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return arr;
}

/** Ranks by doctrine, capitals in the middle of their rank. */
function formation(classIds: readonly string[], classes: ReadonlyMap<string, ShipClassDef>, rng: Rng, spacing: number): Array<{ classId: string; slot: Vec3 }> {
  const ranks = new Map<number, string[]>();
  for (const id of classIds) {
    const r = RANK[classes.get(id)!.doctrine] ?? 5;
    if (!ranks.has(r)) ranks.set(r, []);
    ranks.get(r)!.push(id);
  }
  const out: Array<{ classId: string; slot: Vec3 }> = [];
  [...ranks.keys()].sort((a, b) => a - b).forEach((k, ri) => {
    const ids = ranks.get(k)!.sort((a, b) => Number(classes.get(b)!.role === 'capital') - Number(classes.get(a)!.role === 'capital'));
    const n = ids.length, mid = (n - 1) / 2;
    const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid) || a - b);
    ids.forEach((id, j) => {
      const i = order[j];
      out.push({ classId: id, slot: [(i - mid) * spacing + rng.range(-1.2, 1.2), ((i % 2 ? 2.5 : -2) * spacing) / 10 + (ri % 2 ? 3 : 0) + rng.range(-1, 1), -ri * spacing * 0.95 + rng.range(-1.5, 1.5)] });
    });
  });
  return out;
}

export interface ScriptOptions {
  readonly seed: number;
  /** Seconds the round lasts on screen (a world year: 60). */
  readonly R?: number;
  /** Space between ships in a rank. */
  readonly spacing?: number;
}

/** Weight of each kind of hit in a ship's health. */
const HIT_W: Readonly<Partial<Record<EventKind, number>>> = { beam: 1, slug: 0.5, missile: 0.7, drones: 0.4, bolt: 0.3, plasma: 1.2 };

/** Build the script of a round. Same record and seed: the same script. */
export function buildScript(record: BattleRecord, classes: ReadonlyMap<string, ShipClassDef>, opts: ScriptOptions): BattleScript {
  const R = opts.R ?? 60;
  const spacing = opts.spacing ?? 13;
  const band = bandOf(record.round);
  const fRng = new Rng(hashSeed(opts.seed, 'formation'));
  const ships: ScriptShip[] = [];
  for (const s of [0, 1] as const) {
    const ids = record.before[s].ships.filter((x) => classes.has(x.classId)).flatMap((x) => Array.from({ length: x.count }, () => x.classId));
    for (const f of formation(ids, classes, fRng, spacing)) {
      ships.push({
        i: ships.length, side: s, classId: f.classId, def: classes.get(f.classId)!, slot: f.slot, ph: fRng.range(0, 6.28),
        death: Infinity, cap: Infinity, capBy: -1, crip: Infinity, h0: 1, h1: 1, capIdx: 0, hits: [], heals: [], hpTotal: 0,
      });
    }
  }
  const rng = new Rng(hashSeed(opts.seed, 'show'));
  // Health going in and coming out of the round, from the damage the rules carry; who dies, who is taken.
  for (const s of [0, 1] as const) {
    for (const sq of record.before[s].ships) {
      const mine = ships.filter((x) => x.side === s && x.classId === sq.classId);
      if (!mine.length) continue;
      const hull = record.hull[s][sq.classId] ?? mine[0].def.hull;
      const h0 = shipHealths(mine.length, hull, record.before[s].damage?.[sq.classId] ?? 0);
      // Most damaged first, ties in a seeded order.
      const order = shuffle(mine.map((_, j) => j), rng).sort((a, b) => h0[a] - h0[b]);
      order.forEach((j, n) => { mine[j].h0 = h0[n]; });
      const ranked = order.map((j) => mine[j]);
      const lost = Math.min(ranked.length, record.lostBy[s][sq.classId] ?? 0);
      const taken = Math.min(ranked.length - lost, record.takenBy[s][sq.classId] ?? 0);
      ranked.slice(0, lost).forEach((sh) => { sh.death = R * (0.3 + 0.55 * rng.next()); });
      ranked.slice(lost, lost + taken).forEach((sh) => { sh.cap = R * (0.62 + 0.2 * rng.next()); sh.capBy = s === 0 ? 1 : 0; sh.crip = R * 0.1; sh.h1 = 0.22; });
      const rest = ranked.slice(lost + taken);
      const h1 = shipHealths(rest.length, hull, record.wounds[s][sq.classId] ?? 0);
      rest.forEach((sh, n) => { sh.h1 = h1[n]; });
    }
  }
  const capIdx = [0, 0];
  for (const sh of ships) if (sh.cap < Infinity) sh.capIdx = capIdx[sh.capBy]++;

  const events: ScriptEvent[] = [];
  const fights = (x: ScriptShip, t: number) => t < x.death && t < x.cap;
  const pickTarget = (o: 0 | 1, t: number): ScriptShip | null => {
    const pool = ships.filter((x) => x.side === o && fights(x, t));
    return pool.length ? pool[Math.floor(rng.next() * pool.length)] : null;
  };
  const ev = (k: EventKind, s: ScriptShip | null, d: ScriptShip | null, t0: number, f: number, extra: Partial<ScriptEvent> & { tail?: number; side?: 0 | 1 } = {}) => {
    const { tail, ...rest } = extra;
    events.push({ k, s: s ? s.i : -1, d: d ? d.i : -1, t0, f, span: f + (tail ?? 0.5), side: s ? s.side : extra.side ?? 0, off: d ? unit(rng) : null, ...rest });
  };
  // Shots per ship scale with the round's length (the mockup's six-second round is the unit).
  const vol = R / 6;

  const fire = (sh: ScriptShip) => {
    const s = sh.side, o = (1 - s) as 0 | 1, bm = BAND_MULT[sh.def.doctrine][band];
    const end = Math.min(sh.death, sh.cap, R) - 0.15, start = 0.2;
    if (end - start < 0.4) return;
    const at = () => start + rng.next() * (end - start);
    const w = weaponOf(sh.classId);
    const reachChance = clamp(bm / 1.7 + 0.12, 0.15, 1);
    if (w === 'lance' || w === 'heavylance') {
      const n = Math.max(1, Math.round((w === 'lance' ? 2.2 : 4.5) * bm * vol));
      const c: FxColor = sh.def.doctrine === 'siege' ? 'siege' : 'long';
      for (let i = 0; i < n; i++) { const t0 = at(), d = pickTarget(o, t0 + 0.3); if (d) ev('beam', sh, d, t0, 0.55, { w: w === 'lance' ? 0.38 : 0.85, c }); }
    } else if (w === 'rail') {
      const n = Math.max(1, Math.round(3 * bm * vol));
      const c: FxColor = sh.def.doctrine === 'siege' ? 'siege' : 'long';
      for (let i = 0; i < n; i++) { const t0 = at(), d = pickTarget(o, t0 + 0.3); if (d) for (let j = 0; j < 2; j++) ev('slug', sh, d, t0 + j * 0.12, 0.28, { w: 0.3, c }); }
    } else if (w === 'missile' || w === 'drones') {
      const salvos = Math.max(2, Math.round(2 * vol * 0.5)), per = w === 'missile' ? 5 : 7;
      for (let i = 0; i < salvos; i++) {
        const t0 = start + ((i + rng.range(0, 0.5)) * (end - start)) / salvos;
        for (let j = 0; j < per; j++) {
          const f = rng.range(1.7, 2.4), d = pickTarget(o, t0 + f);
          if (!d) continue;
          const icpt = rng.chance(record.flak[s]) ? rng.range(0.55, 0.82) : 0;
          const picket = icpt ? ships.find((x) => x.side === o && (x.classId === 'flak-picket' || x.classId === 'jammer') && fights(x, t0 + f * icpt) && rng.chance(0.7)) : undefined;
          ev(w, sh, d, t0 + j * 0.09, f, { c: 'barrage', icpt, picket: picket ? picket.i : -1, tail: 0.7, k1: [rng.range(-8, 8), rng.range(4, 12), 0], k2: scale(unit(rng), rng.range(6, 14)), seedj: rng.next() * 10 });
        }
      }
    } else if (w === 'bolt' || w === 'heavybolt' || w === 'plasma' || w === 'flak' || w === 'boarder') {
      const n = w === 'flak' ? Math.round(3 * vol) : w === 'boarder' ? Math.round(2 * vol) : Math.max(2, Math.round((w === 'bolt' ? 7 : 6) * (0.5 + bm * 0.5) * vol));
      const c: FxColor = w === 'flak' ? 'sup' : w === 'boarder' ? 'cap' : 'short';
      for (let i = 0; i < n; i++) {
        const t0 = at(), d = pickTarget(o, t0 + 0.4);
        if (!d) continue;
        const ok = rng.chance(reachChance);
        const burst = w === 'plasma' ? 1 : w === 'heavybolt' ? 2 : 3;
        for (let j = 0; j < burst; j++) ev(w === 'plasma' ? 'plasma' : 'bolt', sh, d, t0 + j * 0.09, 0, { c, w: w === 'heavybolt' ? 0.55 : w === 'flak' ? 0.2 : 0.3, reach: ok, fall: rng.range(0.3, 0.5), speed: w === 'plasma' ? 55 : 85, tail: 2.8 });
      }
    } else if (w === 'pulse') {
      const n = Math.max(2, Math.round(2 * vol * 0.5));
      for (let i = 0; i < n; i++) ev('pulse', sh, null, start + (i * (end - start)) / n + rng.range(0, 0.6), 1.4, { tail: 0 });
    } else if (w === 'repair') {
      const n = Math.max(2, Math.round(2 * vol * 0.5));
      for (let i = 0; i < n; i++) {
        const t0 = at();
        const pool = ships.filter((x) => x.side === s && x !== sh && fights(x, t0 + 1.6));
        if (pool.length) ev('repair', sh, pool[Math.floor(rng.next() * pool.length)], t0, 1.6, { tail: 0 });
      }
    }
  };
  for (const s of [0, 1] as const) for (const sh of ships) if (sh.side === s && sh.def.attack > 0 && fights(sh, 0)) fire(sh);
  for (const s of [0, 1] as const) if (record.jam[s] < 0.999) ev('jam', null, null, 0, R, { side: s, amt: 1 - record.jam[s], tail: 0 });

  // Every loss has a visible cause: the doctrine that did most of the damage this round fires the last shot.
  const killShot = (v: ScriptShip) => {
    const o = v.side === 0 ? 1 : 0, td = v.death;
    const by = record.by[o];
    const shooters = ships.filter((x) => x.side === o && x.def.attack > 0 && fights(x, td - 2.2) && weaponOf(x.classId) !== 'repair' && weaponOf(x.classId) !== 'pulse');
    if (!shooters.length) return;
    const weights = shooters.map((x) => (by[x.def.doctrine] || 0.5) / Math.max(1, shooters.filter((y) => y.def.doctrine === x.def.doctrine).length));
    let r = rng.next() * weights.reduce((a, b) => a + b, 0), s = shooters[0];
    for (let i = 0; i < shooters.length; i++) { r -= weights[i]; if (r <= 0) { s = shooters[i]; break; } }
    const w = weaponOf(s.classId);
    const siege = s.def.doctrine === 'siege';
    if (w === 'lance' || w === 'heavylance') ev('beam', s, v, td - 0.42, 0.62, { w: w === 'lance' ? 0.42 : 0.95, c: siege ? 'siege' : 'long', kill: true });
    else if (w === 'rail') for (let j = 0; j < 3; j++) ev('slug', s, v, td - 0.28 - j * 0.12, 0.28, { w: 0.34, c: siege ? 'siege' : 'long', kill: true });
    else if (w === 'missile' || w === 'drones') for (let j = 0; j < 3; j++) { const f = 1.9 + j * 0.1; ev(w, s, v, td - f, f, { c: 'barrage', icpt: 0, picket: -1, tail: 0.7, k1: [rng.range(-8, 8), rng.range(4, 12), 0], k2: scale(unit(rng), rng.range(5, 10)), seedj: rng.next() * 10, kill: true }); }
    else for (let j = 0; j < 4; j++) ev(w === 'plasma' ? 'plasma' : 'bolt', s, v, td - 2.6 - j * 0.1, 0, { c: w === 'boarder' ? 'cap' : w === 'flak' ? 'sup' : 'short', w: 0.45, reach: true, speed: 90, kill: true, exact: td - j * 0.1, tail: 3 });
  };
  const boarding = (v: ScriptShip) => {
    const o = v.capBy as 0 | 1, tc = v.cap;
    let boarders = ships.filter((x) => x.side === o && x.def.doctrine === 'capture' && fights(x, tc - 2.5));
    if (!boarders.length) boarders = ships.filter((x) => x.side === o && fights(x, tc - 2.5));
    if (!boarders.length) return;
    const b = boarders[Math.floor(rng.next() * boarders.length)];
    for (let j = 0; j < 3; j++) ev('pod', b, v, tc - 2.3 - j * 0.16, 1.35, { tail: 0, until: tc, off2: unit(rng) });
  };
  for (const sh of ships) {
    if (sh.death < Infinity) killShot(sh);
    if (sh.cap < Infinity) boarding(sh);
  }
  events.sort((a, b) => a.t0 - b.t0);
  prepHealth(ships, events, R);
  return { record, band, R, ships, events, start: [record.start[0], record.start[1]] };
}

/** When each hit lands, by kind (kill-shot bolts land at their exact time). */
export function landsAt(e: ScriptEvent): number {
  return e.k === 'beam' ? e.t0 + e.f * 0.3 : e.k === 'bolt' || e.k === 'plasma' ? e.exact ?? e.t0 + 0.35 : e.t0 + e.f;
}

function prepHealth(ships: ScriptShip[], events: readonly ScriptEvent[], R: number): void {
  events.forEach((e, idx) => {
    if (e.d < 0) return;
    const d = ships[e.d];
    if (e.k === 'repair') { d.heals.push(e.t0 + e.f); return; }
    const w0 = HIT_W[e.k];
    if (!w0) return;
    if ((e.k === 'missile' || e.k === 'drones') && e.icpt) return;
    if ((e.k === 'bolt' || e.k === 'plasma') && !e.reach) return;
    const w = w0 * (e.k === 'beam' && (e.w ?? 0) > 0.6 ? 2 : e.k === 'bolt' && (e.w ?? 0) >= 0.45 ? 1.6 : 1);
    d.hits.push([landsAt(e), w, idx]);
  });
  for (const sh of ships) {
    sh.hits.sort((a, b) => a[0] - b[0]);
    sh.heals.sort((a, b) => a - b);
    const end = Math.min(sh.death, sh.cap, R);
    sh.hpTotal = sh.hits.reduce((s, h) => s + (h[0] <= end ? h[1] : 0), 0);
  }
}

/** The side a ship fights for at `t` (boarded ships fight for their captors). */
export const sideAt = (sh: ScriptShip, t: number): 0 | 1 => (t >= sh.cap ? (sh.capBy as 0 | 1) : sh.side);

/**
 * A ship's health at `t`: from its health going into the round to its health coming out, as the
 * hits land. A ship the rules destroy runs down to nothing as it dies; one that is boarded is
 * crippled (below 30%) when the pods land.
 */
export function health(sh: ScriptShip, t: number, R: number): number {
  if (t >= sh.death) return 0;
  let cum = 0;
  for (const h of sh.hits) { if (h[0] > t) break; cum += h[1]; }
  const k = sh.hpTotal >= 0.5 ? Math.min(1, cum / sh.hpTotal) : sstep(0, Math.min(sh.death, sh.cap, R), t);
  if (sh.death < Infinity) return Math.max(0.04, sh.h0 - (sh.h0 - 0.04) * Math.max(k, sstep(sh.death - 2.5, sh.death, t)));
  if (sh.cap < Infinity) {
    if (t >= sh.cap) return sh.h1;
    return sh.h0 - (sh.h0 - sh.h1) * Math.max(k, sstep(sh.crip, sh.cap, t));
  }
  // Survivors: menders' beams show as the climb back when the round ends healthier than it began.
  if (t >= R) return sh.h1;
  const h = sh.h0 + (sh.h1 - sh.h0) * (sh.h1 >= sh.h0 ? sstep(0, R, t) : k);
  return clamp(h, 0.04, 1);
}

/** Side s's fighting strength at t: hull and guns of every ship still fighting for it, by health. */
export function strength(script: BattleScript, s: 0 | 1, t: number): number {
  let v = 0;
  for (const sh of script.ships) {
    if (t >= sh.death || sideAt(sh, t) !== s) continue;
    v += shipValue(sh.def) * health(sh, t, script.R);
  }
  return v;
}

export type Verdict = readonly [string, 'good' | 'bad' | 'even'];

/** How the battle stands for the watched fleet (side 0) once the round is over and no new one came. */
export type BattleEnd = 'victory' | 'defeat' | 'broke-off' | 'pursued' | null;

export interface Meter {
  readonly pct: readonly [number, number];
  /** Side 0's share of both sides' strength. */
  readonly share: number;
  readonly verdict: Verdict;
  /** Change of share since the round began. */
  readonly trend: number;
}

/** The fleet strength meter: each side's share of its starting strength, a verdict and the trend. */
export function fleetMeter(script: BattleScript, t: number, end: BattleEnd): Meter | null {
  const tf = Math.min(Math.max(t, 0), script.R);
  const a = strength(script, 0, tf), b = strength(script, 1, tf);
  if (a + b <= 0) return null;
  const a0 = Math.max(1, script.start[0]), b0 = Math.max(1, script.start[1]);
  const share = a / (a + b);
  const pa = strength(script, 0, 0), pb = strength(script, 1, 0);
  const trend = pa + pb > 0 ? share - pa / (pa + pb) : 0;
  let verdict: Verdict = b <= 0 ? ['Victory', 'good'] : a <= 0 ? ['Defeat', 'bad'] : share > 0.58 ? ['Winning', 'good'] : share < 0.42 ? ['Losing', 'bad'] : ['Even fight', 'even'];
  if (end === 'victory') verdict = ['Victory', 'good'];
  else if (end === 'defeat') verdict = ['Defeat', 'bad'];
  else if (end === 'broke-off') verdict = ['Broke off', 'even'];
  else if (end === 'pursued') verdict = ['Pursued', 'bad'];
  return { pct: [Math.min(1, a / a0), Math.min(1, b / b0)], share, verdict, trend: end ? 0 : trend };
}

/** How the round left the battle: victory or defeat when one side has no ships left (null: it goes on). */
export function outcome(record: BattleRecord, classes: ReadonlyMap<string, ShipClassDef>): BattleEnd {
  const after = afterRound(record);
  const alive = (i: 0 | 1) => Object.entries(after[i]).some(([id, n]) => n > 0 && classes.has(id));
  if (alive(0) && !alive(1)) return 'victory';
  if (alive(1) && !alive(0)) return 'defeat';
  return null;
}
