import { h } from './dom';

/** Stick travel (px) from the centre to full deflection. */
const REACH = 30;
/** Below this share of full deflection the stick does nothing (a thumb never rests exactly centred). */
const DEAD = 0.12;
/**
 * Turn speed at full deflection, in drag pixels a second: the views turn by drags (a right-drag
 * on a desktop), so the stick feeds them a steady drag. About a full turn in four seconds on the map.
 */
const SPEED = 320;

/**
 * A small on-screen joystick for touch screens (change mobile-orbit): hold it and push to orbit the
 * camera round whatever it looks at (left and right turn the heading, up and down tilt the view),
 * on the map, the star system, a planet's close-up and the battle view alike. Touch has no
 * right-drag and two fingers only zoom, so this is the one way to turn the view on a phone.
 * Response is gentle near the centre and quick at the rim (deflection squared).
 */
export class OrbitStick {
  readonly el: HTMLElement;
  private readonly knob = h('span', { class: 'orbit-knob' });
  private held: { id: number; cx: number; cy: number } | null = null;
  private vx = 0;
  private vy = 0;
  private frame = 0;
  private last = 0;

  /** `orbit(dx, dy)` turns the current view as a drag of (dx, dy) pixels with the turning button would. */
  constructor(private readonly orbit: (dx: number, dy: number) => void) {
    this.el = h('div', { class: 'orbit-stick', role: 'slider', 'aria-label': 'Orbit the camera: hold and push', title: 'Orbit: hold and push' },
      h('span', { class: 'orbit-ring' }), this.knob);
    this.el.addEventListener('pointerdown', this.down);
    this.el.addEventListener('pointermove', this.move);
    this.el.addEventListener('pointerup', this.up);
    this.el.addEventListener('pointercancel', this.up);
    this.el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** Keep clear of a bottom sheet: sit `px` higher than the bottom bar. */
  lift(px: number): void {
    this.el.style.setProperty('--stick-lift', `${Math.round(px)}px`);
  }

  private readonly down = (e: PointerEvent): void => {
    if (this.held) return;
    e.preventDefault();
    e.stopPropagation();
    try { this.el.setPointerCapture(e.pointerId); } catch { /* already gone */ }
    const r = this.el.getBoundingClientRect();
    this.held = { id: e.pointerId, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
    this.el.classList.add('held');
    this.aim(e.clientX, e.clientY);
    this.last = performance.now();
    this.frame = requestAnimationFrame(this.tick);
  };

  private readonly move = (e: PointerEvent): void => {
    if (this.held?.id !== e.pointerId) return;
    e.preventDefault();
    this.aim(e.clientX, e.clientY);
  };

  private readonly up = (e: PointerEvent): void => {
    if (this.held?.id !== e.pointerId) return;
    this.held = null;
    this.vx = this.vy = 0;
    cancelAnimationFrame(this.frame);
    this.el.classList.remove('held');
    this.knob.style.transform = '';
  };

  private aim(x: number, y: number): void {
    const held = this.held!;
    let dx = x - held.cx, dy = y - held.cy;
    const d = Math.hypot(dx, dy);
    if (d > REACH) { dx *= REACH / d; dy *= REACH / d; }
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const k = Math.min(d, REACH) / REACH;
    // Squared response past the dead zone, along the push.
    const s = k <= DEAD ? 0 : ((k - DEAD) / (1 - DEAD)) ** 2 / Math.max(k, 1e-6);
    this.vx = (dx / REACH) * s;
    this.vy = (dy / REACH) * s;
  }

  private readonly tick = (now: number): void => {
    if (!this.held) return;
    const dt = Math.min((now - this.last) / 1000, 0.05);
    this.last = now;
    // Push right to swing round to the right (the opposite of grabbing and dragging the scene);
    // push up to raise the view toward the horizon, as dragging up does.
    if (this.vx || this.vy) this.orbit(-this.vx * SPEED * dt, this.vy * SPEED * dt);
    this.frame = requestAnimationFrame(this.tick);
  };
}
