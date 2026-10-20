import type { Band } from '../core/combat/Combat';
import type { BattleFrame, HealthBar, ScreenTag } from '../render/battle/BattleLayer';
import { h } from './dom';
import { icon } from './icons';

/** What the HUD may do (implemented by the app). */
export interface BattleHudActions {
  leave(): void;
  retreat(fleetId: string): void;
  /** Play the replay on screen again from its first round. */
  replayAgain(): void;
}

/** The battle view's camera, as the HUD's input surface steers it. */
export interface BattleControls {
  drag(dx: number, dy: number, pan: boolean): void;
  zoom(k: number): void;
}

const BAND_LABEL: Readonly<Record<Band, string>> = { long: 'Long range', medium: 'Medium range', short: 'Knife-fight range' };
const BAND_COLOR: Readonly<Record<Band, string>> = { long: '#7fd3e6', medium: '#e6b450', short: '#ff9f6b' };
const fmtClock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const phone = typeof matchMedia === 'function' ? matchMedia('(max-width: 720px)') : null;

/**
 * The battle view's HUD: a fleet strength meter top centre (a tug-of-war of each side's share of
 * its starting strength, with a verdict and trend), a health bar over every ship, fleet labels and
 * callouts, and a dock with the round, the range band, the countdown to the next round, Retreat
 * (your own fleet) and Back. Under it, the surface that turns, pans and zooms the camera.
 */
export class BattleHud {
  readonly el = h('section', { class: 'battle-view', 'aria-label': 'Battle view', hidden: true });
  private readonly input = h('div', { class: 'bv-input', 'aria-label': 'Battle view: drag to turn the camera, scroll or pinch to zoom' });
  private readonly layer = h('div', { class: 'bv-tags' });
  private readonly meter = h('div', { class: 'bv-strength', role: 'img' });
  private readonly nameA = h('span', { class: 'st-name' });
  private readonly nameB = h('span', { class: 'st-name b' });
  private readonly verdict = h('span', { class: 'st-verdict' });
  private readonly pctA = h('b', { class: 'st-pct' });
  private readonly pctB = h('b', { class: 'st-pct b' });
  private readonly roundText = h('b', {});
  private readonly nextText = h('span', {});
  private readonly phase = h('span', { class: 'bv-phase' });
  private readonly retreatBtn = h('button', { class: 'btn danger bv-retreat', type: 'button' }, 'Retreat');
  private readonly againBtn = h('button', { class: 'btn bv-again', type: 'button', title: 'Play the battle again from its first round', hidden: true }, icon('play'), ' Replay again');
  private readonly caption = h('p', { class: 'bv-caption' });
  private readonly tags = new Map<string, HTMLElement>();
  private readonly cache = new Map<HTMLElement, string>();
  private fleetId: string | null = null;
  private lastMeter = '';

  constructor(private readonly actions: BattleHudActions, private readonly controls: BattleControls) {
    this.meter.append(
      h('div', { class: 'st-row' }, this.nameA, h('span', { class: 'st-mid' }, h('span', { class: 'st-title' }, 'Fleet strength'), this.verdict), this.nameB),
      h('div', { class: 'st-row bar' }, this.pctA, h('div', { class: 'st-bar' }, h('i', { class: 'a' }), h('i', { class: 'b' }), h('em', {})), this.pctB),
    );
    this.retreatBtn.addEventListener('click', () => { if (this.fleetId) this.actions.retreat(this.fleetId); });
    this.againBtn.addEventListener('click', () => this.actions.replayAgain());
    const back = h('button', { class: 'btn bv-back', type: 'button', title: 'Back to the map (Esc)', 'aria-label': 'Back to the map', onclick: () => this.actions.leave() }, icon('close'), h('span', { class: 'bv-label' }, 'Back'));
    const dock = h('div', { class: 'bv-dock' },
      h('div', { class: 'bv-row' }, back, h('div', { class: 'bv-clock' }, this.roundText, this.nextText), this.phase, this.retreatBtn, this.againBtn),
      this.caption);
    this.el.append(this.input, this.layer, this.meter, dock);
    this.bindInput();
  }

  /** Draw this frame (null: the view is closed). */
  render(f: BattleFrame | null): void {
    document.body.classList.toggle('battle-open', !!f);
    if (!f) {
      if (!this.el.hidden) this.el.hidden = true;
      this.syncTags([]);
      this.lastMeter = '';
      return;
    }
    if (this.el.hidden) this.el.hidden = false;
    this.fleetId = f.fleetId;
    this.renderMeter(f);
    this.syncTags([...f.bars.map((b) => this.barItem(b)), ...f.tags.map((t) => this.tagItem(t))]);
    const rp = f.replay;
    this.text(this.roundText, rp ? `Replay · Y${rp.year} <em>· round ${rp.round} of ${rp.of}</em>`
      : f.end === 'broke-off' ? `Broke off <em>· after round ${f.round}</em>` : f.end === 'pursued' ? `Breaking off <em>· round ${f.round}</em>`
      : f.state === 'over' ? `Battle over <em>· round ${f.round}</em>` : `Round ${f.round} <em>of ∞</em>`);
    this.againBtn.hidden = !rp;
    this.text(this.nextText, rp ? (f.state === 'over' ? (f.end === 'victory' ? `${esc(f.names[1])} was destroyed` : f.end === 'defeat' ? `${esc(f.names[0])} was destroyed` : 'end of the record') : f.state === 'waiting' ? 'next round…' : `round ${f.round} of the battle`)
      : f.state === 'fighting' && f.nextIn !== null ? `next round in <b>${fmtClock(f.nextIn)}</b><span class="bv-sub"> · one round a year</span>`
      : f.state === 'waiting' ? 'next round as the year turns' : f.end === 'victory' ? `${esc(f.names[1])} was destroyed` : f.end === 'defeat' ? `${esc(f.names[0])} was destroyed` : f.end === 'pursued' ? `pursued: ${esc(f.names[1])} catches up next year` : 'the fleets have parted');
    const phase = f.state === 'over' ? (f.end === 'victory' ? 'Won' : f.end === 'defeat' ? 'Lost' : f.end === 'pursued' ? 'Pursuit' : rp ? 'End' : 'Retreat') : BAND_LABEL[f.band];
    // Phones show the band without "range", so the countdown keeps its room.
    this.text(this.phase, f.state === 'over' ? phase : `${phase.replace(' range', '')}<span class="bv-sub"> range</span>`);
    this.phase.style.color = f.state === 'over' ? (f.end === 'victory' ? '#6ee7a8' : '#ff5d5d') : BAND_COLOR[f.band];
    this.retreatBtn.hidden = !f.fleetId || f.state === 'over';
    this.retreatBtn.disabled = f.breakingOff;
    const label = f.breakingOff ? 'Breaking off' : 'Retreat';
    if (this.retreatBtn.textContent !== label) this.retreatBtn.textContent = label;
    this.text(this.caption, `<b>${esc(f.caption[0])}</b> ${esc(f.caption[1])}`);
  }

  private renderMeter(f: BattleFrame): void {
    const m = f.meter;
    if (!m) { this.meter.hidden = true; this.lastMeter = ''; return; }
    this.meter.hidden = false;
    const arrow = m.trend > 0.02 ? '<i class="up" aria-hidden="true">▲</i>' : m.trend < -0.02 ? '<i class="down" aria-hidden="true">▼</i>' : '';
    const labels = [`${Math.round(m.pct[0] * 100)}%`, `${Math.round(m.pct[1] * 100)}%`];
    const key = [...f.names, ...f.colors, ...labels, m.verdict[0], arrow, Math.round(m.share * 400)].join('|');
    if (key === this.lastMeter) return;
    this.lastMeter = key;
    this.meter.style.setProperty('--a', f.colors[0]);
    this.meter.style.setProperty('--b', f.colors[1]);
    this.meter.style.setProperty('--share', `${(m.share * 100).toFixed(2)}%`);
    this.meter.setAttribute('aria-label', `Fleet strength: ${f.names[0]} ${labels[0]}, ${f.names[1]} ${labels[1]}. ${m.verdict[0]}${m.trend > 0.02 ? ', gaining' : m.trend < -0.02 ? ', falling back' : ''}`);
    this.nameA.textContent = f.names[0];
    this.nameB.textContent = f.names[1];
    this.pctA.textContent = labels[0];
    this.pctB.textContent = labels[1];
    this.verdict.innerHTML = `${arrow}${esc(m.verdict[0])}`;
    this.verdict.className = `st-verdict ${m.verdict[1]}`;
  }

  private barItem(b: HealthBar): Item {
    const narrow = phone?.matches ?? false;
    return {
      id: b.id, x: b.x, y: b.y, html: '<i></i>', title: b.title, color: b.color, anchor: 'bottom',
      cls: `tag hp${b.health < 0.3 ? ' low' : b.health < 0.6 ? ' mid' : ''}${b.crippled ? ' crip' : ''}`,
      vars: { '--h': b.health.toFixed(3), '--w': `${b.big ? (narrow ? 28 : 38) : narrow ? 16 : 22}px` }, opacity: 1,
    };
  }

  private tagItem(t: ScreenTag): Item {
    return t.kind === 'fleet'
      ? { id: t.id, x: t.x, y: t.y, html: `${esc(t.text)} <small>${esc(t.sub ?? '')}</small>`, cls: 'tag fleet', color: t.color, anchor: 'bottom', opacity: t.opacity }
      : { id: t.id, x: t.x, y: t.y, html: esc(t.text), cls: 'tag call', color: t.color, anchor: 'bottom', opacity: t.opacity };
  }

  /** Labels over the canvas, kept by id so they move rather than flicker. */
  private syncTags(items: readonly Item[]): void {
    const seen = new Set<string>();
    for (const it of items) {
      seen.add(it.id);
      let el = this.tags.get(it.id);
      if (!el) { el = h('div', {}); this.layer.append(el); this.tags.set(it.id, el); }
      if (el.className !== it.cls) el.className = it.cls;
      this.text(el, it.html);
      el.style.setProperty('--c', it.color);
      if (it.vars) for (const [k, v] of Object.entries(it.vars)) el.style.setProperty(k, v);
      if (it.title && el.title !== it.title) el.title = it.title;
      el.style.opacity = String(it.opacity);
      el.style.transform = `translate(${it.x.toFixed(1)}px, ${it.y.toFixed(1)}px) translate(-50%, -100%)`;
    }
    for (const [id, el] of this.tags) if (!seen.has(id)) { el.remove(); this.tags.delete(id); this.cache.delete(el); }
  }

  private text(el: HTMLElement, html: string): void {
    if (this.cache.get(el) === html) return;
    this.cache.set(el, html);
    el.innerHTML = html;
  }

  /** Drag to turn (right-drag or shift to pan), wheel or pinch to zoom. Two fingers only zoom: they never pan. */
  private bindInput(): void {
    const el = this.input;
    const pointers = new Map<number, { x: number; y: number; pan: boolean }>();
    let pinch: { d: number } | null = null;
    el.addEventListener('pointerdown', (e) => {
      try { el.setPointerCapture(e.pointerId); } catch { /* not capturable (already gone): still tracked */ }
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, pan: e.button === 2 || e.shiftKey });
      el.classList.add('dragging');
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) };
      }
    });
    el.addEventListener('pointermove', (e) => {
      const p = pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (pointers.size >= 2 && pinch) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d > 0 && pinch.d > 0) this.controls.zoom(pinch.d / d);
        pinch = { d };
        return;
      }
      this.controls.drag(dx, dy, p.pan);
    });
    const end = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      if (!pointers.size) el.classList.remove('dragging');
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('wheel', (e) => { e.preventDefault(); this.controls.zoom(Math.exp(e.deltaY * 0.0011)); }, { passive: false });
  }
}

interface Item {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly html: string;
  readonly cls: string;
  readonly color: string;
  readonly anchor: 'bottom';
  readonly opacity: number;
  readonly title?: string;
  readonly vars?: Readonly<Record<string, string>>;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
