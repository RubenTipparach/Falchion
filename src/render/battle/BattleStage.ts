import * as THREE from 'three';
import type { ShipDesign } from '../../core/ships/ShipDesign';
import { Rng, hashSeed } from '../../core/rng/Rng';
import type { ShipFactory } from '../ships/ShipFactory';
import { BattleFx, COL, mix3, rgb, WHITE, type RGB } from './BattleFx';
import { sideAt, sstep, type BattleScript, type ScriptEvent, type ScriptShip, type Vec3 } from './BattleScript';
import { ShipBatches } from './ShipBatches';

/** One fleet as the stage draws it. */
export interface StageSide {
  readonly name: string;
  readonly empire: string;
  /** Empire colour (labels, health bar frames, shockwaves). */
  readonly color: string;
  /** The class's ship design in this empire's style and colours. */
  design(classId: string): ShipDesign;
}

/** What happens once the round is over: which fleets break off and which give chase. */
export interface StageEnding {
  readonly flee: readonly [boolean, boolean];
  readonly chase: readonly [boolean, boolean];
}

export const NO_ENDING: StageEnding = { flee: [false, false], chase: [false, false] };

/** A ship on the stage this frame. */
export interface StageShip {
  readonly s: ScriptShip;
  readonly cur: THREE.Vector3;
  readonly q: THREE.Quaternion;
  readonly fwd: THREE.Vector3;
  /** Radius and length on the stage. */
  readonly r: number;
  readonly len: number;
  visible: boolean;
  deathPos: THREE.Vector3 | null;
  capPos: THREE.Vector3 | null;
  capQ: THREE.Quaternion | null;
  readonly keys: readonly [string, string];
  readonly chunks: ReadonlyArray<{ v: THREE.Vector3; axis: THREE.Vector3; w: number; s: THREE.Vector3; c: RGB }>;
  readonly fb: readonly THREE.Vector3[];
  readonly sparks: ReadonlyArray<{ d: THREE.Vector3; v: number }>;
}

const SHIP_SCALE = 1.7;
/** Distance between the fleets as the range closes: by round (fractional), long → medium → short. */
const SEP_KEYS: ReadonlyArray<readonly [number, number]> = [[0, 148], [2, 122], [2.08, 84], [4, 74], [4.08, 44], [12, 36], [1e6, 36]];
/** Their brawlers press ahead of their line as the fleets close. */
const PUSH_KEYS: ReadonlyArray<readonly [number, number]> = [[2, 0], [2.08, 5], [4, 6], [4.08, 13], [1e6, 13]];
const SUN = new THREE.Vector3(0.62, 0.42, 0.66).normalize();

function keyed(keys: ReadonlyArray<readonly [number, number]>, x: number): number {
  if (x <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) if (x <= keys[i][0]) return keys[i - 1][1] + (keys[i][1] - keys[i - 1][1]) * sstep(keys[i - 1][0], keys[i][0], x);
  return keys[keys.length - 1][1];
}
const v3 = (v: Vec3, out = new THREE.Vector3()) => out.set(v[0], v[1], v[2]);
const unit = (rng: Rng) => { const z = rng.range(-1, 1), a = rng.range(0, Math.PI * 2), r = Math.sqrt(1 - z * z); return new THREE.Vector3(r * Math.cos(a), z, r * Math.sin(a)); };
const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
function bez(out: THREE.Vector3, p0: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3, p3: THREE.Vector3, u: number): THREE.Vector3 {
  const a = (1 - u) ** 3, b = 3 * (1 - u) ** 2 * u, c = 3 * (1 - u) * u * u, d = u ** 3;
  return out.set(p0.x * a + p1.x * b + p2.x * c + p3.x * d, p0.y * a + p1.y * b + p2.y * c + p3.y * d, p0.z * a + p1.z * b + p2.z * c + p3.z * d);
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _p = new THREE.Vector3(), _r = new THREE.Vector3(), _s = new THREE.Vector3();
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _e = new THREE.Euler();
const FW = new THREE.Vector3(0, 0, 1);

/** Per event, things worked out once: the launch point and the aim offsets at stage scale. */
interface EventState { p0: THREE.Vector3 | null; fw0: THREE.Vector3 | null; }

/**
 * The battle on stage: both fleets in formation with the game's ship meshes, the range closing by
 * band, and every shot, hit, boarding and loss of the round's script, drawn as a pure function of
 * the time `t` (seconds into the round). Effects take four draw calls in all.
 */
export class BattleStage {
  readonly scene = new THREE.Scene();
  readonly fx = new BattleFx();
  readonly ships: StageShip[] = [];
  private readonly batches: ShipBatches;
  private script: BattleScript | null = null;
  private sides: readonly [StageSide, StageSide] | null = null;
  private sideRgb: [RGB, RGB] = [WHITE, WHITE];
  private shieldRgb: [RGB, RGB] = [WHITE, WHITE];
  private evState: EventState[] = [];
  private readonly flash = new Map<StageShip, number>();
  private readonly jamNow = [0, 0];
  private ending: StageEnding = NO_ENDING;
  /** Seconds since the battle's first round began: idle motion carries on across rounds. */
  private base = 0;

  constructor(factory: ShipFactory) {
    this.batches = new ShipBatches(factory);
    const key = new THREE.DirectionalLight('#fff0dc', 2.4);
    key.position.copy(SUN).multiplyScalar(100);
    const rim = new THREE.DirectionalLight('#6f9cff', 0.9);
    rim.position.set(-70, 20, -60);
    this.scene.add(key, rim, new THREE.HemisphereLight('#3a4f78', '#07090f', 0.55), this.batches.group, this.fx.group);
  }

  get current(): BattleScript | null {
    return this.script;
  }

  /** The fleets on stage. */
  get look(): readonly [StageSide, StageSide] | null {
    return this.sides;
  }

  /** Put a round's script on stage (the fleets as they went into it). */
  setScript(script: BattleScript, sides: readonly [StageSide, StageSide], seed: number): void {
    this.script = script;
    this.sides = sides;
    this.sideRgb = [rgb(sides[0].color), rgb(sides[1].color)];
    this.shieldRgb = [mix3(this.sideRgb[0], WHITE, 0.35), mix3(this.sideRgb[1], WHITE, 0.35)];
    this.base = (script.record.round - 1) * script.R;
    this.ships.length = 0;
    // Room in each batch: a side's own ships of a class, plus those it takes from the other side.
    const need = new Map<string, number>();
    for (const sh of script.ships) {
      for (const owner of [sh.side, sh.capBy]) {
        if (owner < 0) continue;
        const k = `${owner}|${sh.classId}`;
        need.set(k, (need.get(k) ?? 0) + 1);
      }
    }
    const sizes = new Map<string, { radius: number; length: number }>();
    for (const [k, n] of need) {
      const [owner, classId] = k.split('|');
      sizes.set(k, this.batches.ensure(`${k}|${designKey(sides[Number(owner)].design(classId))}`, sides[Number(owner)].design(classId), n + 2));
    }
    const rng = new Rng(hashSeed(seed, 'stage'));
    for (const s of script.ships) {
      const own = `${s.side}|${s.classId}`;
      const size = sizes.get(own)!;
      const r = size.radius * 0.9 * SHIP_SCALE;
      const design = sides[s.side].design(s.classId);
      const hull: RGB[] = [rgb(design.colors.primary), rgb(design.colors.secondary)];
      const n = Math.min(12, 5 + Math.round(r * 0.8));
      const keyOf = (owner: number) => (owner < 0 ? '' : `${owner}|${s.classId}|${designKey(sides[owner].design(s.classId))}`);
      this.ships.push({
        s, cur: new THREE.Vector3(), q: new THREE.Quaternion(), fwd: new THREE.Vector3(0, 0, 1), r, len: size.length * SHIP_SCALE, visible: true,
        deathPos: null, capPos: null, capQ: null, keys: [keyOf(s.side), keyOf(s.capBy)],
        chunks: Array.from({ length: n }, (_, j) => ({
          v: unit(rng).multiplyScalar(rng.range(1, 3.4) * (0.5 + r * 0.05)), axis: unit(rng), w: rng.range(-2.5, 2.5),
          s: new THREE.Vector3(rng.range(0.06, 0.17), rng.range(0.04, 0.11), rng.range(0.07, 0.22)).multiplyScalar(r), c: hull[j % 3 === 0 ? 1 : 0],
        })),
        fb: Array.from({ length: 6 }, () => unit(rng).multiplyScalar(r * rng.range(0.2, 0.7))),
        sparks: Array.from({ length: 22 }, () => ({ d: unit(rng), v: rng.range(6, 22) })),
      });
    }
    this.evState = script.events.map(() => ({ p0: null, fw0: null }));
  }

  /** Distance between the fleets at `t`. */
  sep(t: number): number {
    const sc = this.script;
    return sc ? keyed(SEP_KEYS, sc.record.round - 1 + Math.min(t, sc.R * 3) / sc.R) : 120;
  }

  private flee(u: number): number { return u < 0.8 ? 0 : 1.8 * (u - 0.8) ** 2; }
  private chase(u: number): number { return u < 1.6 ? 0 : 2.05 * (u - 1.6) ** 2; }

  /** Seconds since one side broke off (null: nobody has). */
  retreatAge(t: number): number | null {
    const sc = this.script;
    // Capped: the fleets part, and the view holds there until the next round (or the battle's end).
    return sc && (this.ending.flee[0] || this.ending.flee[1]) && t > sc.R ? Math.min(t - sc.R, 14) : null;
  }

  private place(side: 0 | 1, slot: Vec3, ph: number, doctrine: string, t: number, pos: THREE.Vector3, quat: THREE.Quaternion): void {
    const f = side === 0 ? 1 : -1, T = t + this.base;
    let z = (-f * this.sep(t)) / 2 + f * slot[2];
    if (side === 1 && doctrine === 'short') z += f * keyed(PUSH_KEYS, (this.script?.record.round ?? 1) - 1 + t / (this.script?.R ?? 60));
    let x = slot[0] * f + Math.sin(T * 0.37 + ph * 3) * 0.6;
    const y = slot[1] + Math.sin(T * 0.61 + ph) * 0.7;
    let yaw = (f > 0 ? 0 : Math.PI) + Math.sin(T * 0.3 + ph) * 0.05, roll = Math.sin(T * 0.5 + ph * 2) * 0.07;
    const u = this.retreatAge(t);
    if (u !== null) {
      // Breaking off: turn for home and run; a faster enemy gives chase.
      if (this.ending.flee[side]) { const turn = sstep(0, 2.4, u); yaw += Math.PI * turn; roll += Math.sin(Math.PI * turn) * 0.55; z -= f * this.flee(u); x *= 1 - 0.25 * sstep(2, 7, u); }
      else if (this.ending.chase[side]) { z += f * this.chase(u); x *= 1 - 0.3 * sstep(2, 8, u); }
    }
    pos.set(x, y, z);
    _e.set(0, yaw, roll, 'YXZ');
    quat.setFromEuler(_e);
  }

  /** Where a boarded ship ends up: behind its captors' line. */
  private rear(sh: StageShip, t: number, pos: THREE.Vector3, quat: THREE.Quaternion): void {
    const k = sh.s.capIdx;
    this.place(sh.s.capBy as 0 | 1, [(k % 2 ? 1 : -1) * (8 + k * 5), 7 + (k % 3) * 2, -40 - k * 4], sh.s.ph, 'support', t, pos, quat);
  }

  private posOf(sh: StageShip, t: number, pos: THREE.Vector3, quat: THREE.Quaternion): void {
    if (t >= sh.s.cap) {
      if (!sh.capPos) { sh.capPos = new THREE.Vector3(); sh.capQ = new THREE.Quaternion(); this.place(sh.s.side, sh.s.slot, sh.s.ph, sh.s.def.doctrine, sh.s.cap, sh.capPos, sh.capQ); }
      this.rear(sh, t, _r, _qb);
      pos.lerpVectors(sh.capPos, _r, sstep(sh.s.cap + 0.4, sh.s.cap + 6.5, t));
      quat.slerpQuaternions(sh.capQ!, _qb, sstep(sh.s.cap + 0.4, sh.s.cap + 3, t));
      return;
    }
    this.place(sh.s.side, sh.s.slot, sh.s.ph, sh.s.def.doctrine, t, pos, quat);
  }

  deathPosOf(sh: StageShip): THREE.Vector3 {
    if (!sh.deathPos) { sh.deathPos = new THREE.Vector3(); this.posOf(sh, sh.s.death, sh.deathPos, _qa); }
    return sh.deathPos;
  }

  private muzzle(sh: StageShip, out: THREE.Vector3): THREE.Vector3 { return out.copy(sh.cur).addScaledVector(sh.fwd, sh.len * 0.42); }

  private launchPos(e: ScriptEvent, st: EventState): THREE.Vector3 {
    if (!st.p0) {
      const s = this.ships[e.s];
      st.p0 = new THREE.Vector3();
      this.posOf(s, e.t0, st.p0, _qa);
      st.fw0 = FW.clone().applyQuaternion(_qa);
      st.p0.addScaledVector(st.fw0, s.len * 0.42);
    }
    return st.p0;
  }

  private tgt(e: ScriptEvent, out: THREE.Vector3): THREE.Vector3 {
    const d = this.ships[e.d];
    out.copy(d.cur);
    if (e.off) out.x += e.off[0] * d.r * 0.35, out.y += e.off[1] * d.r * 0.35, out.z += e.off[2] * d.r * 0.35;
    return out;
  }

  private hit(sh: StageShip, a: number): void { if (a > (this.flash.get(sh) ?? 0)) this.flash.set(sh, a); }

  /** Draw the stage at `t`. */
  update(t: number, ending: StageEnding = NO_ENDING): void {
    const sc = this.script;
    this.fx.begin();
    this.batches.begin();
    this.ending = ending;
    if (!sc) { this.fx.end(); this.batches.end(); return; }
    this.flash.clear();
    for (const sh of this.ships) {
      this.posOf(sh, t, sh.cur, sh.q);
      sh.fwd.copy(FW).applyQuaternion(sh.q);
      sh.visible = t < sh.s.death;
      if (sh.visible) this.batches.add(t >= sh.s.cap ? sh.keys[1] : sh.keys[0], sh.cur, sh.q, SHIP_SCALE);
      this.shipFx(sh, t);
    }
    this.jamNow[0] = this.jamNow[1] = 0;
    for (const e of sc.events) if (e.k === 'jam' && t >= e.t0 && t < e.t0 + e.f) this.jamNow[e.side] = Math.max(this.jamNow[e.side], (e.amt ?? 0) * sstep(e.t0, e.t0 + 0.8, t) * (1 - sstep(e.t0 + e.f - 0.6, e.t0 + e.f, t)));
    for (const s of [0, 1] as const) if (this.jamNow[s] > 0.001) this.haze(s, t);
    // Events are sorted by start; anything still in flight started at most a few seconds ago.
    const evs = sc.events;
    for (let i = 0; i < evs.length; i++) {
      const e = evs[i];
      if (e.t0 > t) break;
      if (t > e.t0 + e.span || e.k === 'jam') continue;
      this.draw(e, this.evState[i], t);
    }
    for (const [sh, a] of this.flash) if (sh.visible) this.fx.shield.add(sh.cur, sh.q, _s.setScalar(sh.r * 1.18), this.shieldRgb[sideAt(sh.s, t)], a * 0.38);
    this.fx.end();
    this.batches.end();
  }

  private shipFx(sh: StageShip, t: number): void {
    const G = this.fx.glow, s = sh.s;
    if (t >= s.death) {
      // Death: flash, fireballs, a shockwave in the empire's colour, sparks, then wreckage that keeps drifting.
      const dt = t - s.death, p = this.deathPosOf(sh), r = sh.r, col = this.sideRgb[sideAt(s, s.death)];
      if (dt < 0.7) { const k = dt / 0.7; G.add(p, COL.flash, (1 - k) * 1.6, r * (3 + 7 * k)); }
      if (dt < 1.8) { const k = dt / 1.8; for (const o of sh.fb) G.add(_p.copy(o).multiplyScalar(1 + k * 1.6).add(p), mix3(COL.fire, COL.bad, k), (1 - k) ** 2 * 1.3, r * (1.1 + k * 1.8)); }
      if (dt < 1.2) { const k = dt / 1.2; G.add(p, col, (1 - k) * 0.9, r * (2 + k * 9), 1); }
      if (dt > 0.25 && dt < 0.7) G.add(_p.copy(sh.fb[1]).multiplyScalar(1.8).add(p), COL.flak, (0.7 - dt) * 3, r * 2);
      if (dt < 2) for (const sp of sh.sparks) G.add(_p.copy(sp.d).multiplyScalar(r * 0.8 + dt * sp.v).add(p), COL.flak, (1 - dt / 2) * 0.9, 0.32);
      const drift = 1.4 * (1 - Math.exp(-dt * 1.6)) + 0.06 * dt;
      for (const c of sh.chunks) {
        _p.copy(c.v).multiplyScalar(drift).add(p);
        _qa.setFromAxisAngle(c.axis, c.w * dt + c.w);
        this.fx.debris.add(_p, _qa, c.s, c.c, 0.65);
        if (dt < 5) G.add(_p, COL.fire, (1 - dt / 5) * 0.55, c.s.x * 2.4);
      }
      return;
    }
    // Crippled before boarding: venting sparks and fires.
    if (t >= s.crip && t < s.cap + 0.4) {
      for (let j = 0; j < 4; j++) {
        const f = Math.sin(t * 13 + j * 2.1 + s.ph) * 0.5 + 0.5;
        G.add(_p.copy(sh.fb[j]).multiplyScalar(0.8).add(sh.cur), j % 2 ? COL.fire : COL.flak, f * 0.8, sh.r * 0.35);
      }
    }
    if (t >= s.cap && t < s.cap + 1.4) { const k = (t - s.cap) / 1.4; G.add(sh.cur, COL.cap, (1 - k) * 1.1, sh.r * (1.5 + k * 5), 1); G.add(sh.cur, COL.cap, (1 - k) * 0.7, sh.r * 2.5); }
  }

  /** Jamming haze around the side whose fire is jammed, with flickering static. */
  private haze(side: 0 | 1, t: number): void {
    const amt = this.jamNow[side], G = this.fx.glow;
    for (const sh of this.ships) {
      if (!sh.visible || sideAt(sh.s, t) !== side) continue;
      for (let j = 0; j < 2; j++) {
        const a = t * 0.35 + sh.s.ph + j * 3.1;
        _p.set(Math.cos(a) * sh.r * 1.1, Math.sin(a * 1.3) * sh.r * 0.5, Math.sin(a) * sh.r * 1.1).add(sh.cur);
        G.add(_p, COL.sup, Math.min(0.32, amt * 3.2), sh.r * 4.2, 2);
      }
      const flick = Math.floor(t * 9 + sh.s.ph * 10);
      if ((Math.imul(flick, 2654435761) >>> 0) % 5 === 0) G.add(_p.copy(sh.fb[((flick % 6) + 6) % 6]).add(sh.cur), COL.sup, Math.min(1, amt * 9), 1.1);
    }
  }

  private draw(e: ScriptEvent, st: EventState, t: number): void {
    const G = this.fx.glow, B = this.fx.beam;
    const jam = this.jamNow[e.side] || 0;
    const ja = jam > 0 ? 1 - jam * 2.2 * (0.6 + 0.4 * Math.sin(t * 31 + e.t0 * 7)) : 1;
    const c: RGB = e.c ? COL[e.c] : COL.short;
    const S = e.s >= 0 ? this.ships[e.s] : null, D = e.d >= 0 ? this.ships[e.d] : null;
    switch (e.k) {
      case 'beam': {
        const u = (t - e.t0) / e.f;
        if (u > 1 || !S || !D) return;
        const a = sstep(0, 0.1, u) * (1 - sstep(0.72, 1, u)) * ja;
        this.muzzle(S, _a); this.tgt(e, _b);
        const w = e.w ?? 0.4;
        B.add(_a, _b, c, a * 0.95, w);
        G.add(_a, c, a, w * 4); G.add(_b, c, a * 1.1, w * 8); G.add(_b, WHITE, a * 0.7, w * 2.5);
        if (u > 0.08) this.hit(D, a);
        return;
      }
      case 'slug': {
        if (!S || !D) return;
        const u = (t - e.t0) / e.f, w = e.w ?? 0.3;
        this.muzzle(S, _a); this.tgt(e, _b);
        if (u <= 1) {
          _p.lerpVectors(_a, _b, u); _r.lerpVectors(_a, _b, Math.max(0, u - 0.22));
          B.add(_r, _p, c, ja, w, 0, 1); G.add(_p, WHITE, 0.9 * ja, w * 4);
          if (u < 0.2) G.add(_a, c, (1 - u / 0.2) * ja, 3.2);
        } else { const k = (t - e.t0 - e.f) / 0.32; if (k < 1) { G.add(_b, c, (1 - k) * 1.2, 3 + k * 4); G.add(_b, WHITE, (1 - k) * 0.8, 1.4); this.hit(D, 1 - k); } }
        return;
      }
      case 'missile': case 'drones': {
        if (!S || !D) return;
        const u = (t - e.t0) / e.f, p0 = this.launchPos(e, st);
        this.tgt(e, _b);
        _a.copy(st.fw0!).multiplyScalar(14).add(v3(e.k1 ?? [0, 0, 0], _p)).add(p0);
        _r.copy(_b).add(v3(e.k2 ?? [0, 0, 0], _p));
        const stop = e.icpt || 1;
        if (u < stop) {
          const uu = Math.pow(Math.max(0, u), 1.25);
          if (e.k === 'drones') {
            for (let j = 0; j < 5; j++) {
              bez(_p, p0, _a, _r, _b, clamp(uu - j * 0.025, 0, 1));
              _p.x += Math.sin(t * 9 + j * 1.7 + (e.seedj ?? 0)) * 1.3; _p.y += Math.cos(t * 7 + j * 2.3 + (e.seedj ?? 0)) * 1.1;
              G.add(_p, mix3(COL.barrage, COL.cap, 0.35), 0.9 * ja, 0.75);
            }
          } else {
            const prev = bez(new THREE.Vector3(), p0, _a, _r, _b, uu);
            G.add(prev, COL.barrage, ja, 1.5); G.add(prev, WHITE, 0.9 * ja, 0.55);
            for (let i = 1; i < 7; i++) {
              const ua = uu - i * 0.03;
              if (ua < 0) break;
              bez(_p, p0, _a, _r, _b, ua);
              B.add(_p, prev, mix3(COL.barrage, COL.fire, i / 7), (1 - i / 7) * 0.75 * ja, 0.32, 1, 1);
              prev.copy(_p);
            }
          }
          // Point defence reaching for it.
          const picket = e.picket !== undefined && e.picket >= 0 ? this.ships[e.picket] : null;
          if (e.icpt && picket && u > stop - 0.18) {
            const hitAt = bez(new THREE.Vector3(), p0, _a, _r, _b, Math.pow(stop, 1.25));
            const m = this.muzzle(picket, new THREE.Vector3());
            const k = (u - (stop - 0.18)) / 0.18;
            for (let j = 0; j < 2; j++) { _r.lerpVectors(m, hitAt, clamp(k + j * 0.18 - 0.1, 0, 1)); _p.lerpVectors(m, hitAt, clamp(k + j * 0.18, 0, 1)); B.add(_r, _p, COL.sup, 0.9, 0.18); }
          }
        } else if (e.icpt) {
          const k = (t - e.t0 - e.f * stop) / 0.5;
          if (k < 1) { bez(_p, p0, _a, _r, _b, Math.pow(stop, 1.25)); G.add(_p, COL.flak, (1 - k) * 1.2, 2 + k * 4); G.add(_p, COL.flak, (1 - k) * 0.7, 1 + k * 8, 1); }
        } else {
          const k = (t - e.t0 - e.f) / 0.6;
          if (k < 1) { G.add(_b, COL.fire, (1 - k) * 1.3, 3 + k * 5); G.add(_b, WHITE, 1 - k, 1.8); G.add(_b, COL.barrage, (1 - k) * 0.6, 2 + k * 9, 1); this.hit(D, 1 - k); }
        }
        return;
      }
      case 'bolt': case 'plasma': {
        if (!S || !D) return;
        this.muzzle(S, _a); this.tgt(e, _b);
        const dist = Math.max(0.01, _a.distanceTo(_b));
        const f = Math.max(0.18, dist / (e.speed ?? 85));
        const t0 = e.exact !== undefined ? e.exact - f : e.t0;
        const u = (t - t0) / f;
        if (u < 0) return;
        const end = e.reach ? 1 : e.fall ?? 0.4;
        const w = e.w ?? 0.3;
        if (u <= end) {
          const a = ja * (e.reach ? 1 : 1 - sstep(end * 0.55, end, u));
          _p.lerpVectors(_a, _b, u);
          if (e.k === 'plasma') { G.add(_p, c, a * 1.1, 3.4); G.add(_p, WHITE, a * 0.8, 1.2); _r.lerpVectors(_a, _b, Math.max(0, u - 0.08)); B.add(_r, _p, c, a * 0.6, 1.2, 0, 1); }
          else { _r.lerpVectors(_a, _b, Math.max(0, u - Math.min(0.35, 4 / dist))); B.add(_r, _p, c, a, w, 0, 1); G.add(_p, c, a * 0.7, w * 4); }
        } else if (e.reach) {
          const k = (t - t0 - f) / 0.3;
          if (k < 1) { G.add(_b, c, (1 - k) * 1.1, e.k === 'plasma' ? 5 + k * 5 : 2.2); this.hit(D, (1 - k) * 0.8); }
        }
        return;
      }
      case 'pulse': {
        const k = (t - e.t0) / e.f;
        if (k > 1 || !S || !S.visible) return;
        G.add(S.cur, COL.sup, (1 - k) * 0.75, 4 + k * 46, 1);
        G.add(S.cur, COL.sup, (1 - k) * 0.6, 3.5);
        return;
      }
      case 'pod': {
        if (!S || !D) return;
        const u = (t - e.t0) / e.f, p0 = this.launchPos(e, st);
        const o2 = e.off2 ?? [0, 1, 0];
        _b.copy(D.cur).add(_p.set(o2[0], o2[1], o2[2]).multiplyScalar(D.r * 0.55));
        if (u <= 1) {
          _p.lerpVectors(p0, _b, u); _p.y += Math.sin(Math.PI * u) * 5;
          G.add(_p, COL.cap, 1, 1.1); G.add(_p, WHITE, 0.7, 0.4);
          for (let i = 1; i < 4; i++) { const ua = Math.max(0, u - i * 0.05); _r.lerpVectors(p0, _b, ua); _r.y += Math.sin(Math.PI * ua) * 5; G.add(_r, COL.cap, 0.5 * (1 - i / 4), 0.7); }
        } else if (t < (e.until ?? 0)) G.add(_b, COL.cap, 0.55 + 0.45 * Math.sin(t * 14 + e.t0 * 3), 1.2);
        return;
      }
      case 'repair': {
        if (!S || !D) return;
        const u = (t - e.t0) / e.f;
        if (u > 1 || !D.visible || !S.visible) return;
        const a = Math.sin(Math.PI * u);
        B.add(S.cur, D.cur, COL.support, a * 0.4, 0.3);
        G.add(D.cur, COL.support, a * 0.3, D.r * 3.6);
        for (let j = 0; j < 6; j++) {
          const ang = t * 2.4 + j * 1.047, h = (t * 0.7 + j / 6) % 1;
          _p.set(Math.cos(ang) * D.r * 0.9, (h - 0.35) * D.r * 1.8, Math.sin(ang) * D.r * 0.9).add(D.cur);
          G.add(_p, COL.support, a * (1 - h) * 1.1, 0.75);
        }
        return;
      }
      default:
    }
  }

  /** Centre of the visible ships (optionally only some), or null. */
  centroid(out: THREE.Vector3, filter?: (sh: StageShip) => boolean): THREE.Vector3 | null {
    out.set(0, 0, 0);
    let n = 0;
    for (const sh of this.ships) if (sh.visible && (!filter || filter(sh))) { out.add(sh.cur); n++; }
    return n ? out.multiplyScalar(1 / n) : null;
  }

  dispose(): void {
    this.batches.dispose();
    this.fx.dispose();
    this.ships.length = 0;
    this.script = null;
  }
}

/** Designs repeat across classes and rounds: build each look once. */
function designKey(d: ShipDesign): string {
  return [d.style, d.seed, d.length, d.bulk, d.engines, d.weapons, d.colors.primary, d.colors.secondary, d.colors.accent, d.traits.join(','), (d.blend ?? []).join(',')].join(':');
}
