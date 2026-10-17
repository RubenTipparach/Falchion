import { h, fmt } from './dom';

/** Light years with sensible precision below 1 ly. */
const ly = (v: number): string => (v >= 10 ? fmt(v) : v >= 1 ? v.toFixed(1).replace(/\.0$/, '') : String(Number(v.toPrecision(1))));

const ZOOM_MARKS: Array<[string, number]> = [['Planet', 0.05], ['System', 0.45], ['Hex', 40], ['Sector', 1_500], ['Galaxy', 80_000]];
/** Where the Surface mark sits on the ladder (the surface itself depends on the planet). */
const SURFACE_MARK = 0.003;

/** Astrogation readout: hovered hex, scale ruler, zoom ladder and contact banner. */
export class Hud {
  readonly el: HTMLElement;
  readonly ladder: HTMLElement;
  readonly banner = h('div', { class: 'contact-banner', hidden: true });
  private readonly hover = h('div', { class: 'hud-hover' }, 'Hover the chart for coordinates');
  private readonly mode = h('span', { class: 'hud-mode' });
  private readonly rulerBar = h('span', { class: 'ruler-bar' });
  private readonly rulerLabel = h('span', { class: 'ruler-label' });
  private readonly width = h('span', { class: 'hud-width' });
  private readonly thumb = h('span', { class: 'ladder-thumb' });

  private readonly rulerEl: HTMLElement;

  /** `onSurface`: the ladder's Surface mark (land on the focused planet). */
  constructor(private readonly zoomRange: { min: number; max: number }, onZoomTo: (altitude: number) => void, onSurface?: () => void) {
    this.rulerEl = h('div', { class: 'ruler' }, this.rulerBar, this.rulerLabel);
    this.el = h('div', { class: 'hud' },
      h('div', { class: 'hud-panel frame' },
        h('div', { class: 'hud-row' }, this.mode, this.width),
        this.rulerEl,
        this.hover),
      h('div', { class: 'hud-help' }, 'Scroll zoom · Drag pan · Right-drag tilt · G toggle view · 1 year = 1 minute'));
    const track = h('div', { class: 'ladder-track' }, this.thumb);
    for (const [label, alt] of ZOOM_MARKS) {
      track.append(h('button', { class: 'ladder-mark', style: `top:${this.pos(alt) * 100}%`, onclick: () => onZoomTo(alt) }, h('span', {}, label)));
    }
    if (onSurface) track.append(h('button', { class: 'ladder-mark', style: `top:${this.pos(SURFACE_MARK) * 100}%`, title: 'Land on the focused planet', onclick: () => onSurface() }, h('span', {}, 'Surface')));
    this.ladder = h('div', { class: 'ladder', 'aria-label': 'Zoom' }, h('span', { class: 'ladder-cap' }, onSurface ? 'Ground' : '0.03 ly'), track, h('span', { class: 'ladder-cap' }, '70k ly'));
  }

  setHover(text: string): void {
    this.hover.textContent = text;
  }

  /** `pxPerLy` = screen pixels per light year at the focus. */
  setScale(widthLy: number, pxPerLy: number, mode: string, altitude: number): void {
    this.mode.textContent = mode;
    this.width.textContent = `${ly(widthLy)} ly across`;
    this.rulerEl.hidden = false;
    // Pick a 1/2/5 × 10^k ruler that is 60–150 px long.
    const target = 110 / pxPerLy;
    const p = Math.pow(10, Math.floor(Math.log10(target)));
    const nice = [1, 2, 5, 10].map((m) => m * p).reduce((best, v) => (Math.abs(v - target) < Math.abs(best - target) ? v : best));
    this.rulerBar.style.width = `${Math.round(nice * pxPerLy)}px`;
    this.rulerLabel.textContent = `${ly(nice)} ly`;
    this.thumb.style.top = `${this.pos(altitude) * 100}%`;
  }

  /** On a planet's surface: altitude above the ground instead of the ly ruler. */
  setSurface(altitudeKm: number, altitude: number): void {
    this.mode.textContent = 'Surface view';
    this.width.textContent = `${altitudeKm >= 1000 ? `${(altitudeKm / 1000).toFixed(1)}k` : altitudeKm.toFixed(altitudeKm < 10 ? 1 : 0)} km up`;
    this.rulerEl.hidden = true;
    this.thumb.style.top = `${this.pos(altitude) * 100}%`;
  }

  setContact(text: string | null): void {
    this.banner.hidden = !text;
    this.banner.textContent = text ?? '';
  }

  private pos(alt: number): number {
    const { min, max } = this.zoomRange;
    return Math.min(1, Math.max(0, Math.log(alt / min) / Math.log(max / min)));
  }
}
