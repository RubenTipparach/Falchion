import { h } from './dom';

/**
 * Commodity prices over time on the exchange (change holds-and-market-history): one line per
 * exchange, a legend, labels at the lines' ends, and a crosshair that reads every exchange's price
 * at the year under the pointer. Plain SVG, sized by its container.
 */

export interface PriceLine {
  readonly id: string;
  readonly name: string;
  readonly points: ReadonlyArray<{ readonly year: number; readonly price: number }>;
}

/** Series colours, in order (validated together on the panel's dark surface). */
export const SERIES = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300'] as const;
/** At most this many exchanges on the chart at once. */
export const MAX_LINES = SERIES.length;

const NS = 'http://www.w3.org/2000/svg';
function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}, ...children: Array<SVGElement | string>): SVGElementTagNameMap[K] {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  for (const c of children) el.append(c);
  return el;
}

/** "now", "30 min ago", "6 h ago": a year back from now in world time (a year is a minute). */
export function agoLabel(years: number): string {
  const y = Math.round(years);
  if (y <= 0) return 'now';
  if (y < 120) return `${y} min ago`;
  const hours = y / 60;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} h ago`;
}

/** Round, readable ticks covering [lo, hi]. */
function ticks(lo: number, hi: number, count = 4): number[] {
  const span = Math.max(hi - lo, 1e-6);
  const raw = span / count;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-6; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

const W = 420, H = 200, M = { left: 36, right: 92, top: 10, bottom: 22 };

/** The chart: lines keyed by exchange, `now` the current year (the last point of each line). */
export function marketChart(lines: readonly PriceLine[], now: number, resourceName: string): HTMLElement {
  const shown = lines.slice(0, MAX_LINES).filter((l) => l.points.length > 1);
  const root = h('div', { class: 'market-chart' });
  if (!shown.length) return root;
  const first = shown[0].points;
  const x0 = first[0].year, x1 = first[first.length - 1].year;
  const all = shown.flatMap((l) => l.points.map((p) => p.price));
  let lo = Math.min(...all), hi = Math.max(...all);
  const pad = (hi - lo) * 0.08 || hi * 0.05 || 1;
  lo = Math.max(0, lo - pad); hi += pad;
  const yTicks = ticks(lo, hi);
  lo = Math.min(lo, yTicks[0]); hi = Math.max(hi, yTicks[yTicks.length - 1]);
  const px = (year: number) => M.left + ((year - x0) / Math.max(1e-6, x1 - x0)) * (W - M.left - M.right);
  const py = (price: number) => M.top + (1 - (price - lo) / Math.max(1e-6, hi - lo)) * (H - M.top - M.bottom);

  const plot = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'mc-svg', role: 'img', 'aria-label': `${resourceName} price over the last ${agoLabel(now - x0).replace(' ago', '')} on ${shown.map((l) => l.name).join(', ')}` });
  // Recessive grid and axis labels.
  for (const v of yTicks) {
    plot.append(svg('line', { x1: M.left, x2: W - M.right, y1: py(v), y2: py(v), class: 'mc-grid' }));
    plot.append(svg('text', { x: M.left - 6, y: py(v) + 4, class: 'mc-axis', 'text-anchor': 'end' }, v.toFixed(v < 10 ? 2 : 1)));
  }
  for (const f of [0, 0.5, 1]) {
    const year = x0 + (x1 - x0) * f;
    plot.append(svg('text', { x: px(year), y: H - 6, class: 'mc-axis', 'text-anchor': f === 0 ? 'start' : f === 1 ? 'end' : 'middle' }, agoLabel(now - year)));
  }
  // The lines, and the exchanges' names at their ends (nudged apart where they would overlap).
  shown.forEach((l, i) => {
    const d = l.points.map((p, k) => `${k ? 'L' : 'M'}${px(p.year).toFixed(1)},${py(p.price).toFixed(1)}`).join('');
    plot.append(svg('path', { d, class: 'mc-line', stroke: SERIES[i] }));
  });
  if (shown.length <= 4) {
    const ends = shown.map((l, i) => ({ i, y: py(l.points[l.points.length - 1].price), name: l.name }))
      .sort((a, b) => a.y - b.y);
    for (let k = 1; k < ends.length; k++) ends[k].y = Math.max(ends[k].y, ends[k - 1].y + 13);
    for (const e of ends) {
      plot.append(svg('line', { x1: W - M.right + 4, x2: W - M.right + 12, y1: e.y, y2: e.y, stroke: SERIES[e.i], class: 'mc-key' }));
      plot.append(svg('text', { x: W - M.right + 15, y: e.y + 4, class: 'mc-end' }, e.name.length > 13 ? `${e.name.slice(0, 12)}…` : e.name));
    }
  }
  // Crosshair: a hairline and a dot on each line at the nearest year, and a readout of them all.
  const hair = svg('line', { y1: M.top, y2: H - M.bottom, class: 'mc-hair', visibility: 'hidden' });
  const dots = shown.map((_, i) => svg('circle', { r: 4, fill: SERIES[i], class: 'mc-dot', visibility: 'hidden' }));
  plot.append(hair, ...dots);
  const hit = svg('rect', { x: M.left, y: M.top, width: W - M.left - M.right, height: H - M.top - M.bottom, class: 'mc-hit' });
  plot.append(hit);
  const tip = h('div', { class: 'mc-tip', hidden: true });
  const show = (clientX: number) => {
    const box = plot.getBoundingClientRect();
    const x = ((clientX - box.left) / Math.max(1, box.width)) * W;
    const k = Math.max(0, Math.min(first.length - 1, Math.round(((x - M.left) / (W - M.left - M.right)) * (first.length - 1))));
    const year = first[k].year;
    hair.setAttribute('x1', String(px(year))); hair.setAttribute('x2', String(px(year)));
    hair.setAttribute('visibility', 'visible');
    shown.forEach((l, i) => {
      const p = l.points[Math.min(k, l.points.length - 1)];
      dots[i].setAttribute('cx', String(px(p.year))); dots[i].setAttribute('cy', String(py(p.price)));
      dots[i].setAttribute('visibility', 'visible');
    });
    tip.replaceChildren(h('div', { class: 'mc-tip-when' }, agoLabel(now - year)),
      ...shown.map((l, i) => h('div', { class: 'mc-tip-row' }, h('i', { style: `background:${SERIES[i]}` }), h('span', {}, l.name), h('b', { class: 'mono' }, l.points[Math.min(k, l.points.length - 1)].price.toFixed(2)))));
    tip.hidden = false;
    const left = ((px(year) / W) * box.width);
    tip.style.left = `${Math.min(Math.max(0, left + 12), box.width - 170)}px`;
  };
  const hide = () => { hair.setAttribute('visibility', 'hidden'); for (const d of dots) d.setAttribute('visibility', 'hidden'); tip.hidden = true; };
  hit.addEventListener('pointermove', (e) => show(e.clientX));
  hit.addEventListener('pointerdown', (e) => show(e.clientX));
  hit.addEventListener('pointerleave', hide);

  // The legend (always, for two lines or more), then the plot; and the same numbers as a table.
  const legend = shown.length > 1 ? h('div', { class: 'mc-legend' }, ...shown.map((l, i) => h('span', {}, h('i', { style: `background:${SERIES[i]}` }), l.name))) : null;
  const rows = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * (first.length - 1)));
  const table = h('details', { class: 'mc-table' }, h('summary', { class: 'small muted' }, 'Show as a table'),
    h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'When'), ...shown.map((l) => h('th', {}, l.name)))),
      h('tbody', {}, ...rows.map((k) => h('tr', {}, h('td', {}, agoLabel(now - first[k].year)), ...shown.map((l) => h('td', { class: 'mono' }, l.points[Math.min(k, l.points.length - 1)].price.toFixed(2))))))));
  root.append(...(legend ? [legend] : []), h('div', { class: 'mc-plot' }, plot, tip), table);
  if (lines.length > shown.length) root.append(h('p', { class: 'small muted' }, `${lines.length - shown.length} more exchange${lines.length - shown.length === 1 ? '' : 's'} not drawn: pick one above to see it here.`));
  return root;
}

/** A small trend line for a table row, and its change over the span (a fraction). */
export function sparkline(points: ReadonlyArray<{ readonly price: number }>): { el: SVGSVGElement; change: number } {
  const w = 72, hgt = 20;
  const prices = points.map((p) => p.price);
  const lo = Math.min(...prices), hi = Math.max(...prices);
  const d = prices.map((p, k) => `${k ? 'L' : 'M'}${((k / Math.max(1, prices.length - 1)) * w).toFixed(1)},${(2 + (1 - (p - lo) / Math.max(1e-6, hi - lo)) * (hgt - 4)).toFixed(1)}`).join('');
  const el = svg('svg', { viewBox: `0 0 ${w} ${hgt}`, class: 'mc-spark', 'aria-hidden': 'true' }, svg('path', { d }));
  const change = prices.length > 1 && prices[0] > 0 ? prices[prices.length - 1] / prices[0] - 1 : 0;
  return { el, change };
}
