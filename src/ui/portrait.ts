import { Rng, hashSeed } from '../core/rng/Rng';

/**
 * A face for a person of the court (change missions-and-court), drawn as SVG from their id: the same
 * person always looks the same, on every device. Mostly humans of every complexion, now and then
 * someone from further out (green, blue or grey skin, crests, antennae, no ears). The uniform's
 * colour is the seat they hold.
 */

const SKIN = ['#f3d2b8', '#e8b896', '#d29a73', '#b67a52', '#8d5a3a', '#6a4129', '#4a2d1d', '#f0c9a0'];
const ALIEN_SKIN = ['#8fb98a', '#6fa7b8', '#9a9fb8', '#b88fb0', '#c9b27a'];
const HAIR = ['#1c1410', '#3a2618', '#6a4426', '#a8743c', '#d8b26a', '#e8e0d0', '#8a8a8a', '#7a2e1e', '#3a3f6a'];
const EYES = ['#3a2a1a', '#4a6a3a', '#3a5a8a', '#6a4a2a', '#5a5a5a', '#2a8a8a'];

export interface PortraitOptions {
  /** Width and height in pixels. */
  readonly size?: number;
  /** The uniform's colour (the seat's). */
  readonly uniform?: string;
}

export function portrait(id: string, o: PortraitOptions = {}): SVGSVGElement {
  const r = new Rng(hashSeed(id, 'portrait'));
  const pick = <T,>(xs: readonly T[]): T => xs[r.int(0, xs.length - 1)];
  const size = o.size ?? 56;
  const uniform = o.uniform ?? '#3b4f7a';
  const alien = r.chance(0.18);
  const skin = alien ? pick(ALIEN_SKIN) : pick(SKIN);
  const shade = mix(skin, '#000000', 0.22);
  const hair = alien && r.chance(0.5) ? null : pick(HAIR);
  const faceW = r.range(15, 19), faceH = r.range(19, 23), jaw = r.range(0.75, 1.0);
  const cx = 50, cy = 46;
  const eyeY = cy - faceH * 0.08, eyeDx = faceW * r.range(0.36, 0.44), eyeR = r.range(1.9, 2.6);
  const iris = alien && r.chance(0.5) ? pick(['#d8c040', '#e05a3a', '#60d0e0']) : pick(EYES);
  const brow = r.range(-0.25, 0.25);
  const smile = r.range(-0.6, 1);
  const parts: string[] = [];

  parts.push(`<defs><radialGradient id="bg" cx="50%" cy="35%" r="75%"><stop offset="0" stop-color="${mix(uniform, '#ffffff', 0.18)}"/><stop offset="1" stop-color="#0a0f1c"/></radialGradient>`
    + `<clipPath id="frame"><circle cx="50" cy="50" r="48"/></clipPath></defs>`);
  parts.push(`<circle cx="50" cy="50" r="48" fill="url(#bg)"/>`);
  const body: string[] = [];
  // Long hair falls behind the shoulders.
  const style = hair ? r.int(0, 6) : -1;
  if (hair && style === 4) body.push(`<path d="M${cx - faceW - 3} ${cy - 4} Q${cx - faceW - 6} ${cy + 30} ${cx - faceW + 2} ${cy + 34} L${cx + faceW - 2} ${cy + 34} Q${cx + faceW + 6} ${cy + 30} ${cx + faceW + 3} ${cy - 4} Z" fill="${hair}"/>`);
  // Shoulders and uniform, a collar and a seat badge.
  body.push(`<path d="M8 104 Q10 74 34 70 L66 70 Q90 74 92 104 Z" fill="${uniform}"/>`);
  body.push(`<path d="M34 70 L50 86 L66 70 L60 69 L50 78 L40 69 Z" fill="${mix(uniform, '#000000', 0.35)}"/>`);
  body.push(`<circle cx="${r.chance(0.5) ? 30 : 70}" cy="84" r="3" fill="#e6c36a"/>`);
  // Neck.
  body.push(`<path d="M${cx - 6} ${cy + faceH * 0.7} L${cx - 7} 72 L${cx + 7} 72 L${cx + 6} ${cy + faceH * 0.7} Z" fill="${shade}"/>`);
  // Ears (pointed on some, none on others).
  const ears = alien ? r.int(0, 2) : 0;
  if (ears === 0) for (const s of [-1, 1]) body.push(`<ellipse cx="${cx + s * faceW}" cy="${eyeY + 3}" rx="3" ry="5" fill="${shade}"/>`);
  if (ears === 1) for (const s of [-1, 1]) body.push(`<path d="M${cx + s * (faceW - 1)} ${eyeY} L${cx + s * (faceW + 9)} ${eyeY - 9} L${cx + s * (faceW - 1)} ${eyeY + 8} Z" fill="${shade}"/>`);
  // Antennae.
  if (alien && r.chance(0.3)) for (const s of [-1, 1]) body.push(`<path d="M${cx + s * 5} ${cy - faceH + 2} Q${cx + s * 10} ${cy - faceH - 10} ${cx + s * 15} ${cy - faceH - 14}" stroke="${shade}" stroke-width="1.6" fill="none"/><circle cx="${cx + s * 15}" cy="${cy - faceH - 14}" r="2.2" fill="${iris}"/>`);
  // The face: an egg, its jaw narrower or squarer.
  body.push(`<path d="M${cx - faceW} ${cy - 2} C${cx - faceW} ${cy - faceH * 1.25} ${cx + faceW} ${cy - faceH * 1.25} ${cx + faceW} ${cy - 2} C${cx + faceW} ${cy + faceH * 0.6} ${cx + faceW * jaw * 0.6} ${cy + faceH} ${cx} ${cy + faceH} C${cx - faceW * jaw * 0.6} ${cy + faceH} ${cx - faceW} ${cy + faceH * 0.6} ${cx - faceW} ${cy - 2} Z" fill="${skin}"/>`);
  // A crest of ridges, or freckles and spots.
  if (alien && r.chance(0.4)) for (let i = 0; i < 3; i++) body.push(`<path d="M${cx - 8 + i * 8} ${cy - faceH * 0.95} q2 -4 4 0" stroke="${shade}" stroke-width="1.4" fill="none"/>`);
  if (r.chance(0.2)) for (let i = 0; i < 7; i++) body.push(`<circle cx="${cx + r.range(-faceW * 0.6, faceW * 0.6)}" cy="${eyeY + r.range(4, 9)}" r="${r.range(0.4, 0.8)}" fill="${shade}"/>`);
  // Hair on top: cropped, parted, swept, a bun, long, a crest, curls.
  if (hair) {
    const top = cy - faceH * 1.02;
    if (style === 0) body.push(`<path d="M${cx - faceW} ${cy - 4} C${cx - faceW} ${top - 6} ${cx + faceW} ${top - 6} ${cx + faceW} ${cy - 4} C${cx + faceW * 0.7} ${top + 6} ${cx - faceW * 0.7} ${top + 6} ${cx - faceW} ${cy - 4} Z" fill="${hair}"/>`);
    if (style === 1 || style === 4) body.push(`<path d="M${cx - faceW - 1} ${cy + 2} C${cx - faceW - 3} ${top - 8} ${cx + faceW + 3} ${top - 8} ${cx + faceW + 1} ${cy + 2} C${cx + faceW - 2} ${top + 4} ${cx - 2} ${top + 10} ${cx - faceW * 0.4} ${top + 4} C${cx - faceW * 0.7} ${top + 8} ${cx - faceW} ${cy - 6} ${cx - faceW - 1} ${cy + 2} Z" fill="${hair}"/>`);
    if (style === 2) body.push(`<path d="M${cx - faceW} ${cy - 2} C${cx - faceW - 2} ${top - 10} ${cx + faceW + 8} ${top - 8} ${cx + faceW + 2} ${cy - 6} C${cx + faceW * 0.4} ${top + 2} ${cx - faceW * 0.6} ${top + 8} ${cx - faceW} ${cy - 2} Z" fill="${hair}"/>`);
    if (style === 3) body.push(`<path d="M${cx - faceW} ${cy - 4} C${cx - faceW} ${top - 6} ${cx + faceW} ${top - 6} ${cx + faceW} ${cy - 4} C${cx + faceW * 0.7} ${top + 5} ${cx - faceW * 0.7} ${top + 5} ${cx - faceW} ${cy - 4} Z" fill="${hair}"/><circle cx="${cx}" cy="${top - 6}" r="7" fill="${hair}"/>`);
    if (style === 5) body.push(`<path d="M${cx - 7} ${top + 6} C${cx - 8} ${top - 8} ${cx - 3} ${top - 13} ${cx} ${top - 13} C${cx + 3} ${top - 13} ${cx + 8} ${top - 8} ${cx + 7} ${top + 6} Z" fill="${hair}"/>`);
    if (style === 6) for (let i = 0; i < 9; i++) { const a = Math.PI * (0.05 + (0.9 * i) / 8); body.push(`<circle cx="${cx - Math.cos(a) * faceW}" cy="${cy - 6 - Math.sin(a) * faceH * 0.95}" r="5.5" fill="${hair}"/>`); }
  }
  // Eyes, brows, nose and mouth.
  for (const s of [-1, 1]) {
    const ex = cx + s * eyeDx;
    body.push(`<ellipse cx="${ex}" cy="${eyeY}" rx="${eyeR + 1}" ry="${eyeR * 0.75}" fill="#f4f1ea"/><circle cx="${ex}" cy="${eyeY}" r="${eyeR * 0.62}" fill="${iris}"/><circle cx="${ex}" cy="${eyeY}" r="${eyeR * 0.28}" fill="#0b0b10"/>`);
    body.push(`<path d="M${ex - 3.5} ${eyeY - 4.2 - s * brow * 2} L${ex + 3.5} ${eyeY - 4.2 + s * brow * 2}" stroke="${hair ?? shade}" stroke-width="1.5" stroke-linecap="round"/>`);
  }
  body.push(`<path d="M${cx} ${eyeY + 2} L${cx - 1.8} ${eyeY + 8.5} L${cx + 1.2} ${eyeY + 9}" stroke="${shade}" stroke-width="1.1" fill="none" stroke-linecap="round"/>`);
  const my = eyeY + 14;
  body.push(`<path d="M${cx - 5} ${my} Q${cx} ${my + smile * 3.5} ${cx + 5} ${my}" stroke="${mix(skin, '#5a1e1e', 0.55)}" stroke-width="1.4" fill="none" stroke-linecap="round"/>`);
  // A beard or moustache, glasses, a cybernetic eye, a scar.
  if (hair && !alien && r.chance(0.25)) {
    if (r.chance(0.5)) body.push(`<path d="M${cx - faceW * 0.85} ${cy + 2} C${cx - faceW * 0.8} ${cy + faceH * 1.1} ${cx + faceW * 0.8} ${cy + faceH * 1.1} ${cx + faceW * 0.85} ${cy + 2} C${cx + 6} ${my + 2} ${cx - 6} ${my + 2} ${cx - faceW * 0.85} ${cy + 2} Z" fill="${hair}" opacity="0.92"/>`);
    else body.push(`<path d="M${cx - 6} ${my - 1.5} Q${cx} ${my - 4} ${cx + 6} ${my - 1.5}" stroke="${hair}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`);
  }
  const extra = r.next();
  if (extra < 0.15) for (const s of [-1, 1]) body.push(`<circle cx="${cx + s * eyeDx}" cy="${eyeY}" r="${eyeR + 2.2}" fill="none" stroke="#c8c8d0" stroke-width="1"/>`);
  else if (extra < 0.25) body.push(`<circle cx="${cx + eyeDx}" cy="${eyeY}" r="${eyeR + 2}" fill="#202430" stroke="#9aa4b8" stroke-width="1"/><circle cx="${cx + eyeDx}" cy="${eyeY}" r="1.4" fill="#ff5a4a"/>`);
  else if (extra < 0.33) body.push(`<path d="M${cx - eyeDx - 3} ${eyeY - 7} L${cx - eyeDx + 2} ${eyeY + 6}" stroke="${mix(skin, '#8a3a3a', 0.6)}" stroke-width="1"/>`);
  parts.push(`<g clip-path="url(#frame)"><g transform="translate(50 58) scale(1.18) translate(-50 -58)">${body.join('')}</g></g>`);
  parts.push(`<circle cx="50" cy="50" r="48" fill="none" stroke="${mix(uniform, '#ffffff', 0.35)}" stroke-width="2"/>`);

  // Gradient and clip ids must be unique in the page.
  const uid = `p${(hashSeed(id, 'uid') >>> 0).toString(36)}`;
  const html = parts.join('').replace(/id="(bg|frame)"/g, `id="${uid}-$1"`).replace(/url\(#(bg|frame)\)/g, `url(#${uid}-$1)`);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('class', 'portrait');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = html;
  return svg;
}

function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const c = (s: number) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return `#${((c(16) << 16) | (c(8) << 8) | c(0)).toString(16).padStart(6, '0')}`;
}
