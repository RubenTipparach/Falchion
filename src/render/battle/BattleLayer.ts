import * as THREE from 'three';
import type { ShipClassDef } from '../../content/shipClasses';
import { BAND_MULT, type Band } from '../../core/combat/Combat';
import type { BattleRecord } from '../../core/combat/BattleRecord';
import { Rng, hashSeed } from '../../core/rng/Rng';
import type { MapLayer, ViewState } from '../map/MapLayer';
import type { ShipFactory } from '../ships/ShipFactory';
import { buildScript, fleetMeter, health, outcome, sideAt, sstep, type BattleEnd, type BattleScript, type Meter } from './BattleScript';
import { BattleRig } from './BattleRig';
import { BattleStage, type StageEnding, type StageSide } from './BattleStage';

/** One fleet of a battle to watch. */
export interface BattleSide extends StageSide {
  /** The fleet as `${ownerId}:${fleetId}`. */
  readonly key: string;
}

/** A battle to watch: its latest round and both fleets (side 0 is the fleet it was opened from). */
export interface BattleTarget {
  /** Stable id of the battle (both fleets). */
  readonly key: string;
  /** World year the round was fought. */
  readonly tick: number;
  readonly record: BattleRecord;
  readonly sides: readonly [BattleSide, BattleSide];
  /** Side 0 is one of your fleets (its id): you can order it to retreat. */
  readonly fleetId: string | null;
  /** Where it is fought (a system's name, or deep space). */
  readonly place: string;
}

/** What the view needs from the game. */
export interface BattleHost {
  /** World time in years, fractional (the world clock). */
  worldTime(): number;
  /** Who is breaking off and who gives chase, as the game knows it now. */
  ending(target: BattleTarget): StageEnding;
  readonly lite: boolean;
}

/** A health bar over a ship, in screen pixels. */
export interface HealthBar {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly health: number;
  readonly big: boolean;
  readonly crippled: boolean;
  readonly color: string;
  readonly title: string;
}

/** A label over the battle: a fleet's name, or a callout as a ship is destroyed or boarded. */
export interface ScreenTag {
  readonly id: string;
  readonly kind: 'fleet' | 'call';
  readonly x: number;
  readonly y: number;
  readonly color: string;
  readonly text: string;
  readonly sub?: string;
  readonly opacity: number;
}

/** Everything the battle HUD shows this frame. */
export interface BattleFrame {
  readonly round: number;
  readonly band: Band;
  /** Seconds to the next round, while the battle goes on. */
  readonly nextIn: number | null;
  /** fighting: the round plays; waiting: it is over and the next is due; over: the battle has ended. */
  readonly state: 'fighting' | 'waiting' | 'over';
  readonly end: BattleEnd;
  readonly names: readonly [string, string];
  readonly empires: readonly [string, string];
  readonly colors: readonly [string, string];
  readonly meter: Meter | null;
  readonly bars: readonly HealthBar[];
  readonly tags: readonly ScreenTag[];
  /** What is going on: a bold lead and a sentence. */
  readonly caption: readonly [string, string];
  readonly fleetId: string | null;
  readonly place: string;
  readonly breakingOff: boolean;
}

/** Seconds a round lasts: one world year is one real minute. */
const ROUND_SECONDS = 60;

/**
 * The battle view (src/render/battle): a layer in the map's LayerStack that, while open, covers
 * the map with a battle at sea drawn in its own scene and camera. It replays the battle's latest
 * round across the world year it was fought in, then the next one when the server's state brings
 * it. The HUD (src/ui/BattleHud) reads each frame through `onFrame` and steers the camera.
 */
export class BattleLayer implements MapLayer {
  readonly object3d = new THREE.Group();
  /** Called after each frame is drawn, with what the HUD shows. */
  onFrame: ((frame: BattleFrame | null) => void) | null = null;
  private target: BattleTarget | null = null;
  private stage: BattleStage | null = null;
  private script: BattleScript | null = null;
  private readonly rig = new BattleRig();
  private readonly camera = new THREE.PerspectiveCamera(42, 1, 0.5, 5000);
  private readonly skyCam = new THREE.PerspectiveCamera(42, 1, 1, 3000);
  private sky: THREE.Scene | null = null;
  private env: THREE.Texture | null = null;
  private lastTime = -1;
  private dt = 0;
  private readonly classes: ReadonlyMap<string, ShipClassDef>;
  private readonly reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  private readonly _v = new THREE.Vector3();
  private readonly _w = new THREE.Vector3();

  constructor(private readonly factory: ShipFactory, classes: readonly ShipClassDef[], private readonly host: BattleHost) {
    this.classes = new Map(classes.map((c) => [c.id, c]));
  }

  get isOpen(): boolean {
    return this.target !== null;
  }

  get current(): BattleTarget | null {
    return this.target;
  }

  /** Open the view on a battle (or show its newest round when it is the one open). */
  open(target: BattleTarget): void {
    const fresh = !this.target || this.target.key !== target.key;
    this.setTarget(target);
    if (fresh) {
      this.place(0);
      this.rig.reset();
    }
  }

  /** The battle's state from the game: a new round replaces the one on stage. */
  setTarget(target: BattleTarget): void {
    const same = this.target && this.target.key === target.key && this.target.tick === target.tick && this.target.record.round === target.record.round;
    this.target = target;
    if (same && this.stage) return;
    this.stage?.dispose();
    this.stage = new BattleStage(this.factory);
    if (this.env) this.stage.scene.environment = this.env;
    const seed = hashSeed(target.key, target.tick, target.record.round);
    // Wider spacing: every ship is a wing of four hulls (BattleStage WING).
    this.script = buildScript(target.record, this.classes, { seed, R: ROUND_SECONDS, spacing: 22 });
    this.stage.setScript(this.script, target.sides, seed);
  }

  close(): void {
    this.target = null;
    this.script = null;
    this.stage?.dispose();
    this.stage = null;
    this.onFrame?.(null);
  }

  /** Camera controls for the HUD's input surface. */
  readonly controls = {
    drag: (dx: number, dy: number, pan: boolean) => this.rig.drag(dx, dy, pan, this.camera),
    zoom: (k: number) => this.rig.zoomBy(k),
    reset: () => this.rig.reset(),
  };

  covers(): boolean {
    return this.target !== null;
  }

  update(view: ViewState): void {
    this.dt = this.lastTime < 0 ? 0 : Math.min(0.1, Math.max(0, view.time - this.lastTime));
    this.lastTime = view.time;
  }

  /** Seconds into the round on stage. */
  private time(): number {
    return this.target ? Math.max(0, (this.host.worldTime() - this.target.tick) * ROUND_SECONDS) : 0;
  }

  /** Follow the fleets: their centroid, pulled back as they stand apart. */
  private place(dt: number): void {
    const stage = this.stage, t = this.time();
    if (!stage) return;
    const c = stage.centroid(this._v);
    const fled = stage.retreatAge(t);
    if (c && fled !== null) {
      const mine = stage.centroid(this._w, (x) => sideAt(x.s, t) === 0);
      if (mine) c.lerp(mine, sstep(0, 4, fled) * 0.35);
    }
    if (c) dt > 0 ? this.rig.follow.lerp(c, Math.min(1, dt * 5)) : this.rig.follow.copy(c);
    // Portrait screens stand a little further back, so both fleets fit across.
    const portrait = this.camera.aspect < 1 ? 1.3 : 1;
    this.rig.base = (Math.min(270, Math.max(115, stage.sep(t) * 1.1 + 72)) + (fled !== null ? Math.min(90, (fled < 0.8 ? 0 : 1.8 * (fled - 0.8) ** 2) * 0.35) : 0)) * portrait;
  }

  overlay(renderer: THREE.WebGLRenderer): void {
    const target = this.target, stage = this.stage, script = this.script;
    if (!target || !stage || !script) return;
    const w = renderer.domElement.clientWidth || 1, h = renderer.domElement.clientHeight || 1;
    this.camera.aspect = w / h;
    // Portrait screens: widen the lens so both fleets still fit across.
    this.camera.fov = w < h ? Math.min((2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(21)) / (w / h)) * 180) / Math.PI, 72) : 42;
    this.camera.updateProjectionMatrix();
    this.skyCam.aspect = this.camera.aspect;
    this.skyCam.fov = this.camera.fov;
    this.skyCam.updateProjectionMatrix();
    if (!this.env) {
      this.env = makeEnv(renderer);
      stage.scene.environment = this.env;
    }
    const t = this.time();
    const ending = this.host.ending(target);
    stage.update(t, ending);
    this.place(this.dt);
    this.rig.place(this.camera, this.dt, !this.reduceMotion);
    stage.fx.glow.mat.uniforms.uScale.value = (h * renderer.getPixelRatio()) / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)));

    const autoClear = renderer.autoClear, tone = renderer.toneMapping, exposure = renderer.toneMappingExposure;
    renderer.autoClear = false;
    renderer.setClearColor('#05080f', 1);
    renderer.clear(true, true, true);
    this.skyCam.quaternion.copy(this.camera.quaternion);
    renderer.render(this.ensureSky(), this.skyCam);
    renderer.clearDepth();
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.render(stage.scene, this.camera);
    renderer.toneMapping = tone;
    renderer.toneMappingExposure = exposure;
    renderer.autoClear = autoClear;
    renderer.setClearColor('#03060d', 1);
    this.onFrame?.(this.frame(target, stage, script, t, ending, w, h));
  }

  // ── What the HUD shows ────────────────────────────────────────────

  private frame(target: BattleTarget, stage: BattleStage, sc: BattleScript, t: number, ending: StageEnding, w: number, h: number): BattleFrame {
    const R = sc.R;
    const decided = outcome(target.record, this.classes);
    const leaving = ending.flee[0] || ending.flee[1];
    let end: BattleEnd = null;
    if (t >= R) end = decided ?? (leaving ? (ending.flee[0] && ending.chase[1] ? 'pursued' : 'broke-off') : null);
    const state: BattleFrame['state'] = end ? 'over' : t >= R ? 'waiting' : 'fighting';
    const names = [target.sides[0].name, target.sides[1].name] as const;
    const colors = [target.sides[0].color, target.sides[1].color] as const;
    const project = (p: THREE.Vector3) => {
      this._v.copy(p).project(this.camera);
      const behind = this._v.z > 1 || this._v.z < -1;
      return { x: (this._v.x * 0.5 + 0.5) * w, y: (-this._v.y * 0.5 + 0.5) * h, behind };
    };
    const bars: HealthBar[] = [];
    for (const sh of stage.ships) {
      if (!sh.visible) continue;
      const hp = health(sh.s, Math.min(t, R), R);
      this._w.copy(sh.cur);
      this._w.y += sh.r * 1.6 + 2.2; // above the whole wing
      const p = project(this._w);
      if (p.behind || p.x < -20 || p.x > w + 20 || p.y < -20 || p.y > h + 20) continue;
      const side = sideAt(sh.s, t);
      bars.push({ id: `hp${sh.s.i}`, x: p.x, y: p.y, health: hp, big: sh.s.def.role === 'capital' || sh.r > 7, crippled: t >= sh.s.crip && t < sh.s.cap, color: colors[side], title: `${sh.s.def.name}: ${Math.round(hp * 100)}%` });
    }
    const tags: ScreenTag[] = [];
    for (const s of [0, 1] as const) {
      const c = stage.centroid(new THREE.Vector3(), (x) => sideAt(x.s, t) === s);
      if (!c) continue;
      c.y += 16;
      const p = project(c);
      const n = stage.ships.filter((x) => x.visible && sideAt(x.s, t) === s).length;
      if (!p.behind) tags.push({ id: `fleet${s}`, kind: 'fleet', x: p.x, y: p.y, color: colors[s], text: names[s], sub: `${target.sides[s].empire} · ${n} ship${n === 1 ? '' : 's'}`, opacity: 1 });
    }
    for (const sh of stage.ships) {
      for (const [at, text, color, pos] of [
        [sh.s.death, `${sh.s.def.name} destroyed`, colors[sh.s.side], () => stage.deathPosOf(sh)],
        [sh.s.cap, `${sh.s.def.name} boarded`, '#6ee7a8', () => sh.cur],
      ] as const) {
        const a = t - at;
        if (!(a >= 0 && a <= 2.4)) continue;
        const p = project(pos());
        if (p.behind) continue;
        tags.push({ id: `c${sh.s.i}-${text}`, kind: 'call', x: p.x, y: p.y - 18 - a * 12, color, text, opacity: Math.min(1, a * 5) * (1 - sstep(1.8, 2.4, a)) });
      }
    }
    const meter = fleetMeter(sc, t, end);
    return {
      round: target.record.round, band: sc.band, nextIn: state === 'fighting' ? Math.max(0, R - t) : null, state, end, names, colors,
      empires: [target.sides[0].empire, target.sides[1].empire], meter, bars, tags, caption: this.caption(target, sc, end, state, ending),
      fleetId: target.fleetId, place: target.place, breakingOff: ending.flee[0],
    };
  }

  private caption(target: BattleTarget, sc: BattleScript, end: BattleEnd, state: BattleFrame['state'], ending: StageEnding): readonly [string, string] {
    const r = target.record, [a, b] = [target.sides[0].name, target.sides[1].name];
    const round = r.round;
    if (end === 'victory') return ['Victory.', `${a} destroyed ${b} at ${target.place} in round ${round}.`];
    if (end === 'defeat') return [`${a} was destroyed`, `by ${b} of ${target.sides[1].empire} at ${target.place} in round ${round}.`];
    if (end === 'pursued') return ['Breaking off: pursued.', `${b} is faster and gives chase. Overtaken next year, the battle goes on.`];
    if (end === 'broke-off') return [ending.flee[0] ? `${a} broke off.` : `${b} broke off.`, 'The fleets part: the battle ends here unless a faster fleet gives chase.'];
    if (state === 'waiting') return ['Next round.', 'The fleets close for the next round: it is fought as the world year turns.'];
    const pct = (x: number) => `${Math.round(x * 100)}%`;
    if (sc.band === 'long') {
      const jam = r.jam[1] < 0.999 ? ` ${a}'s jammers fog ${b}'s targeting (−${pct(1 - r.jam[1])} to its fire).` : r.jam[0] < 0.999 ? ` ${b}'s jammers fog ${a}'s targeting (−${pct(1 - r.jam[0])}).` : '';
      return [`Long range, round ${round}.`, `Lances and railguns hit at ×${BAND_MULT.long.long.toFixed(1)}; brawlers fire at ×${BAND_MULT.short.long.toFixed(1)}, so most of their bolts fade out before they land.${jam}`];
    }
    if (sc.band === 'medium') {
      const flak = r.flak[0] > 0 ? ` ${b}'s flak shoots down ${pct(r.flak[0])} of ${a}'s barrage.` : r.flak[1] > 0 ? ` ${a}'s flak shoots down ${pct(r.flak[1])} of ${b}'s barrage.` : '';
      const next = round === 4 && target.fleetId && !ending.flee[0] ? ' Next year is knife-fight range: retreat now to keep what is left.' : '';
      return [`Medium range, round ${round}.`, `Missiles hit at ×1.0 everywhere; boarders latch onto crippled hulls.${flak}${next}`];
    }
    return [`Knife-fight range, round ${round}.`, `Brawlers and leviathans hit at ×${BAND_MULT.short.short.toFixed(1)} while lances drop to ×${BAND_MULT.long.short.toFixed(1)}.${ending.flee[0] ? ' Breaking off after this round.' : ''}`];
  }

  // ── Plumbing ──────────────────────────────────────────────────────

  /** Deep space behind the battle: stars and a few nebula veils, turned with the camera only. */
  private ensureSky(): THREE.Scene {
    if (this.sky) return this.sky;
    const s = new THREE.Scene();
    const rng = new Rng(hashSeed('battle-sky'));
    const N = this.host.lite ? 1800 : 3200, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
    const tints = [[0.62, 0.77, 1], [1, 1, 1], [1, 0.95, 0.84], [1, 0.82, 0.63], [1, 0.69, 0.54]];
    for (let i = 0; i < N; i++) {
      const z = rng.range(-1, 1), a = rng.range(0, Math.PI * 2), r = Math.sqrt(1 - z * z);
      pos.set([r * Math.cos(a) * 1000, z * 1000, r * Math.sin(a) * 1000], i * 3);
      const tint = tints[Math.floor(Math.pow(rng.next(), 1.6) * tints.length)], b = 0.35 + 0.65 * Math.pow(rng.next(), 3);
      col.set([tint[0] * b, tint[1] * b, tint[2] * b], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const stars = new THREE.Points(g, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    stars.frustumCulled = false;
    s.add(stars);
    const veils: Array<[number, [number, number, number], number]> = [[214, [-0.5, 0.25, -0.8], 900], [262, [0.8, -0.1, -0.4], 760], [338, [0.2, 0.6, 0.75], 620], [196, [-0.6, -0.5, 0.5], 700]];
    veils.forEach(([hue, d, size], i) => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: veil(hue, hashSeed('veil', i)), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.5 }));
      sp.position.set(d[0], d[1], d[2]).normalize().multiplyScalar(900);
      sp.scale.setScalar(size);
      s.add(sp);
    });
    this.sky = s;
    return s;
  }

  dispose(): void {
    this.close();
    if (this.sky) {
      this.sky.traverse((o) => {
        if (o instanceof THREE.Points || o instanceof THREE.Sprite) {
          o.geometry.dispose();
          const m = o.material as THREE.PointsMaterial | THREE.SpriteMaterial;
          m.map?.dispose();
          m.dispose();
        }
      });
      this.sky = null;
    }
    this.env?.dispose();
    this.env = null;
  }
}

/** A soft studio light for metal hulls: a deep-space gradient, one warm star and a cool rim. */
function makeEnv(renderer: THREE.WebGLRenderer): THREE.Texture {
  const s = new THREE.Scene();
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: { uSun: { value: new THREE.Vector3(0.62, 0.42, 0.66).normalize() } },
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 uSun; varying vec3 vD;
      void main(){ vec3 d = normalize(vD); float h = d.y * 0.5 + 0.5;
        vec3 c = mix(vec3(0.012, 0.016, 0.03), vec3(0.09, 0.12, 0.19), h);
        c += vec3(1.0, 0.9, 0.74) * pow(max(dot(d, uSun), 0.0), 28.0) * 7.0;
        c += vec3(0.22, 0.42, 0.95) * pow(max(dot(d, normalize(vec3(-0.7, 0.1, -0.5))), 0.0), 6.0) * 1.1;
        gl_FragColor = vec4(c, 1.0); }`,
  });
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(10, 48, 24), m);
  s.add(sphere);
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(s, 0).texture;
  pm.dispose();
  sphere.geometry.dispose();
  m.dispose();
  return tex;
}

/** A soft cloud painted once on a canvas. */
function veil(hue: number, seed: number): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d')!;
  const r = new Rng(seed);
  for (let i = 0; i < 26; i++) {
    const cx = 128 + r.range(-70, 70), cy = 128 + r.range(-50, 50), rad = r.range(30, 95);
    const gr = x.createRadialGradient(cx, cy, 0, cx, cy, rad);
    gr.addColorStop(0, `hsla(${hue + r.range(-18, 18)}, 70%, 55%, ${r.range(0.05, 0.13)})`);
    gr.addColorStop(1, 'hsla(0,0%,0%,0)');
    x.fillStyle = gr;
    x.fillRect(0, 0, 256, 256);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
