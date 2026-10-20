import type { Hex } from '../core/hex/Hex';

/**
 * Shareable addresses inside the game, so a star system can be hotlinked:
 *
 *   /system/-14697,20078/Norka_II           a star system (the name is for people and link previews)
 *   /system/-14697,20078/Norka_II/planet/2  one of its planets (1 = innermost)
 *   /hex/-14700,20080                       a spot in deep space
 *   /player/123456789012345678              a player (opens them in the Players drawer)
 *   /                                       the game as you left it
 */
export type Route =
  | { readonly kind: 'home' }
  | { readonly kind: 'system'; readonly hex: Hex; readonly name?: string; readonly planet?: number }
  | { readonly kind: 'hex'; readonly hex: Hex }
  | { readonly kind: 'player'; readonly id: string };

/** Hex coordinates stay inside the galaxy's range; anything else is not a link. */
const COORD_LIMIT = 1_000_000;
const HEX = /^(-?\d{1,7}),(-?\d{1,7})$/;

function parseHex(s: string | undefined): Hex | null {
  const m = HEX.exec(s ?? '');
  if (!m) return null;
  const q = Number(m[1]), r = Number(m[2]);
  return Math.abs(q) <= COORD_LIMIT && Math.abs(r) <= COORD_LIMIT ? { q, r } : null;
}

/** A name in a path: spaces as underscores, the rest percent-encoded. */
export const nameSlug = (name: string): string => encodeURIComponent(name.trim().replace(/\s+/g, '_'));

/** The name a slug was made from (best effort: links typed by hand may not round-trip). */
export function slugName(slug: string): string {
  try {
    return decodeURIComponent(slug).replace(/_/g, ' ').trim().slice(0, 60);
  } catch {
    return '';
  }
}

/** Read a path. Unknown or malformed paths are `home`, so a bad link still opens the game. */
export function parseRoute(pathname: string): Route {
  const parts = pathname.split('/').filter(Boolean);
  const [kind, coords] = parts;
  if (kind === 'system') {
    const hex = parseHex(coords);
    if (!hex) return { kind: 'home' };
    let rest = parts.slice(2);
    const name = rest[0] && rest[0] !== 'planet' ? slugName(rest[0]) : undefined;
    if (name !== undefined) rest = rest.slice(1);
    const planet = rest[0] === 'planet' && /^\d{1,2}$/.test(rest[1] ?? '') ? Number(rest[1]) : undefined;
    return { kind: 'system', hex, ...(name ? { name } : {}), ...(planet && planet >= 1 ? { planet } : {}) };
  }
  if (kind === 'hex') {
    const hex = parseHex(coords);
    return hex ? { kind: 'hex', hex } : { kind: 'home' };
  }
  if (kind === 'player' && /^\d{5,25}$/.test(coords ?? '')) return { kind: 'player', id: coords };
  return { kind: 'home' };
}

/** The address of a star system, or of one of its planets (`planetIndex` from 0). */
export function systemRoute(star: { readonly hex: Hex; readonly name: string } | null, planetIndex: number | null = null): Route {
  if (!star) return { kind: 'home' };
  return { kind: 'system', hex: star.hex, name: star.name, ...(planetIndex !== null ? { planet: planetIndex + 1 } : {}) };
}

/** The path for a route (the inverse of `parseRoute`). */
export function routePath(r: Route): string {
  switch (r.kind) {
    case 'home': return '/';
    case 'hex': return `/hex/${r.hex.q},${r.hex.r}`;
    case 'player': return `/player/${r.id}`;
    case 'system': {
      const name = r.name ? `/${nameSlug(r.name)}` : '';
      return `/system/${r.hex.q},${r.hex.r}${name}${r.planet ? `/planet/${r.planet}` : ''}`;
    }
  }
}
