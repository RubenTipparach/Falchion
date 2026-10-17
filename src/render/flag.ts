import type { Flag } from '../core/empire/Identity';

/**
 * An empire flag as SVG markup (3:2). Every part comes from a fixed table and every colour
 * is checked against #rrggbb, so the markup is safe to insert even for another player's flag.
 */
const HEX = /^#[0-9a-f]{6}$/i;

const FIELDS: Record<string, (a: string, b: string) => string> = {
  solid: (a) => `<rect width="60" height="40" fill="${a}"/>`,
  bicolor: (a, b) => `<rect width="60" height="40" fill="${a}"/><rect x="30" width="30" height="40" fill="${b}"/>`,
  fess: (a, b) => `<rect width="60" height="40" fill="${a}"/><rect y="20" width="60" height="20" fill="${b}"/>`,
  cross: (a, b) => `<rect width="60" height="40" fill="${a}"/><rect x="25" width="10" height="40" fill="${b}"/><rect y="15" width="60" height="10" fill="${b}"/>`,
  saltire: (a, b) => `<rect width="60" height="40" fill="${a}"/><path d="M0 0L60 40M60 0L0 40" stroke="${b}" stroke-width="8"/>`,
  chevron: (a, b) => `<rect width="60" height="40" fill="${a}"/><path d="M0 0L26 20L0 40Z" fill="${b}"/>`,
  bend: (a, b) => `<rect width="60" height="40" fill="${a}"/><path d="M0 34L48 0H60V6L12 40H0Z" fill="${b}"/>`,
  border: (a, b) => `<rect width="60" height="40" fill="${b}"/><rect x="5" y="5" width="50" height="30" fill="${a}"/>`,
  quartered: (a, b) => `<rect width="60" height="40" fill="${a}"/><rect x="30" width="30" height="20" fill="${b}"/><rect y="20" width="30" height="20" fill="${b}"/>`,
  stripes: (a, b) => `<rect width="60" height="40" fill="${a}"/>${[0, 16, 32].map((y) => `<rect y="${y}" width="60" height="8" fill="${b}"/>`).join('')}`,
  canton: (a, b) => `<rect width="60" height="40" fill="${a}"/><rect width="26" height="18" fill="${b}"/>`,
  ring: (a, b) => `<rect width="60" height="40" fill="${a}"/><ellipse cx="30" cy="20" rx="24" ry="11" fill="none" stroke="${b}" stroke-width="3" transform="rotate(-18 30 20)"/>`,
};

const star = (r: number, inner: number, n = 5) => Array.from({ length: n * 2 }, (_, i) => {
  const a = -Math.PI / 2 + (i * Math.PI) / n;
  const d = i % 2 ? inner : r;
  return `${(30 + Math.cos(a) * d).toFixed(2)},${(20 + Math.sin(a) * d).toFixed(2)}`;
}).join(' ');

const EMBLEMS: Record<string, (c: string, field: string) => string> = {
  none: () => '',
  star: (c) => `<polygon points="${star(9, 3.8)}" fill="${c}"/>`,
  sun: (c) => `<circle cx="30" cy="20" r="5" fill="${c}"/><polygon points="${star(10, 5.6, 8)}" fill="${c}" opacity="0.85"/>`,
  crescent: (c) => `<path d="M33 11a9 9 0 1 0 0 18a7 7 0 1 1 0-18Z" fill="${c}"/>`,
  planet: (c) => `<circle cx="30" cy="20" r="5.5" fill="${c}"/><ellipse cx="30" cy="20" rx="11" ry="3.2" fill="none" stroke="${c}" stroke-width="1.6" transform="rotate(-20 30 20)"/>`,
  comet: (c) => `<circle cx="35" cy="16" r="4" fill="${c}"/><path d="M32 13L18 27L22 28L24 31L37 19Z" fill="${c}" opacity="0.7"/>`,
  diamond: (c) => `<polygon points="30,9 37,20 30,31 23,20" fill="${c}"/>`,
  eye: (c, f) => `<path d="M17 20Q30 8 43 20Q30 32 17 20Z" fill="${c}"/><circle cx="30" cy="20" r="3.6" fill="${f}"/>`,
  crown: (c) => `<path d="M20 27V15L25 20L30 12L35 20L40 15V27Z" fill="${c}"/>`,
  blade: (c) => `<path d="M24 31L22 29L36 12Q40 9 42 8Q41 12 38 15L26 30Z" fill="${c}"/><path d="M20 26L28 33" stroke="${c}" stroke-width="2.4"/>`,
  atom: (c) => `${[0, 60, 120].map((r) => `<ellipse cx="30" cy="20" rx="11" ry="4" fill="none" stroke="${c}" stroke-width="1.4" transform="rotate(${r} 30 20)"/>`).join('')}<circle cx="30" cy="20" r="2.4" fill="${c}"/>`,
  triad: (c) => `<circle cx="30" cy="13" r="4" fill="${c}"/><circle cx="23.5" cy="25" r="4" fill="${c}"/><circle cx="36.5" cy="25" r="4" fill="${c}"/>`,
};

export function flagSvg(flag: Flag, width = 36): string {
  const col = (c: string, fallback: string) => (HEX.test(c) ? c : fallback);
  const [a, b, e] = [col(flag.colors[0], '#e6b450'), col(flag.colors[1], '#0b1220'), col(flag.colors[2], '#f8fafc')];
  const field = (FIELDS[flag.field] ?? FIELDS.solid)(a, b);
  const emblem = (EMBLEMS[flag.emblem] ?? EMBLEMS.none)(e, a);
  return `<svg class="flag" width="${width}" height="${Math.round((width * 2) / 3)}" viewBox="0 0 60 40" aria-hidden="true">${field}${emblem}<rect width="60" height="40" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="1"/></svg>`;
}

/** A flag as a DOM element. */
export function flagEl(flag: Flag, width = 36): HTMLElement {
  const span = document.createElement('span');
  span.className = 'flag-wrap';
  span.innerHTML = flagSvg(flag, width);
  return span;
}
