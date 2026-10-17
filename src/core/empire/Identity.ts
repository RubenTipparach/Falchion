import { Rng, hashSeed } from '../rng/Rng';

/** An empire's flag: a field pattern in two colours with an emblem on top. */
export interface Flag {
  readonly field: string;
  readonly emblem: string;
  /** Field colours [main, second] and the emblem colour, as #rrggbb. */
  readonly colors: readonly [string, string, string];
}

/** How an empire presents itself: chosen once when it is founded, editable later. */
export interface EmpireIdentity {
  readonly name: string;
  readonly ruler: string;
  readonly title: string;
  readonly capital: string;
  /** Map colour for territory, fleets and labels, as #rrggbb. */
  readonly color: string;
  readonly flag: Flag;
}

/** What the founding screen chooses from (src/content/heraldry.ts). */
export interface HeraldryTables {
  readonly colors: readonly string[];
  readonly flagColors: readonly string[];
  readonly fields: ReadonlyArray<{ readonly id: string }>;
  readonly emblems: ReadonlyArray<{ readonly id: string }>;
  readonly titles: readonly string[];
  readonly adjectives: readonly string[];
  readonly nouns: readonly string[];
}

export const NAME_MAX = 40;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const PART_ID = /^[a-z][a-z-]{0,23}$/;

/** A random flag; the same seed always gives the same flag. */
export function randomFlag(rng: Rng, t: HeraldryTables, color?: string): Flag {
  const main = color ?? rng.pick(t.colors);
  const dark = t.flagColors.filter((c) => !t.colors.includes(c));
  const second = rng.chance(0.6) ? rng.pick(dark) : rng.pick(t.flagColors.filter((c) => c !== main));
  const emblem = rng.pick(t.emblems.filter((e) => e.id !== 'none')).id;
  const emblemColor = rng.pick(t.flagColors.filter((c) => c !== main && c !== second));
  return { field: rng.pick(t.fields).id, emblem, colors: [main, second, emblemColor] };
}

export function randomEmpireName(rng: Rng, t: HeraldryTables): string {
  return `${rng.pick(t.adjectives)} ${rng.pick(t.nouns)}`;
}

/** A complete starting identity, seeded by the player so it is stable until they change it. */
export function suggestIdentity(seed: number, player: string, capital: string, t: HeraldryTables): EmpireIdentity {
  const rng = new Rng(hashSeed(seed, 'identity', player));
  const color = rng.pick(t.colors);
  return { name: randomEmpireName(rng, t), ruler: player, title: rng.pick(t.titles), capital, color, flag: randomFlag(rng, t, color) };
}

/** Single-line text: no control characters or angle brackets, collapsed spaces, bounded. */
export function cleanText(s: unknown, max = NAME_MAX): string {
  return String(s ?? '').replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

/**
 * Validate an identity from a save or another player; unknown flag parts fall back to the
 * first entry so an old or tampered save still draws. Null when it is not an identity at all.
 */
export function cleanIdentity(raw: unknown, t: HeraldryTables): EmpireIdentity | null {
  const r = raw as Partial<EmpireIdentity> | null;
  if (!r || typeof r !== 'object') return null;
  const name = cleanText(r.name);
  if (!name) return null;
  const color = typeof r.color === 'string' && HEX_COLOR.test(r.color) ? r.color.toLowerCase() : t.colors[0];
  return {
    name,
    ruler: cleanText(r.ruler) || 'Unknown',
    title: cleanText(r.title, 24) || t.titles[0],
    capital: cleanText(r.capital) || 'Capital',
    color,
    flag: cleanFlag(r.flag, t, color),
  };
}

export function cleanFlag(raw: unknown, t: HeraldryTables, color: string): Flag {
  const f = raw as Partial<Flag> | null;
  const known = (id: unknown, list: ReadonlyArray<{ readonly id: string }>) =>
    typeof id === 'string' && PART_ID.test(id) && list.some((x) => x.id === id) ? id : list[0].id;
  const c = Array.isArray(f?.colors) ? f!.colors : [];
  const col = (i: number, fallback: string) => (typeof c[i] === 'string' && HEX_COLOR.test(c[i]) ? c[i].toLowerCase() : fallback);
  return { field: known(f?.field, t.fields), emblem: known(f?.emblem, t.emblems), colors: [col(0, color), col(1, '#10121c'), col(2, '#ffffff')] };
}
