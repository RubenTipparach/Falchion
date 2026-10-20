// Chat text: find known names (locations, players) in a message so they can be linked.
// Pure and deterministic: no DOM, no network. Shared by the sender (to attach places)
// and the reader (to linkify what they recognise).

/** A location a chat message can link to: a star or planet, by the hex of its star. */
export interface ChatPlace {
  readonly name: string;
  readonly q: number;
  readonly r: number;
}

/** Someone who can be @mentioned. */
export interface ChatPerson {
  readonly id: string;
  readonly name: string;
}

/** A signed-in player as chat shows them. */
export interface ChatUser {
  readonly id: string;
  readonly name: string;
  readonly avatar: string | null;
}

/** One chat message, as the server stores and sends it. `to` is 'global' or a player id (a DM). */
export interface ChatMessage {
  readonly id: string;
  readonly at: number;
  readonly from: ChatUser;
  readonly to: string;
  readonly text: string;
  readonly mentions: readonly string[];
  readonly places: readonly ChatPlace[];
}

/** The thread a message belongs to for `me`: 'global', or the other player's id. */
export function threadOf(m: Pick<ChatMessage, 'from' | 'to'>, me: string): string {
  if (m.to === 'global') return 'global';
  return m.from.id === me ? m.to : m.from.id;
}

/** A name to look for in text, with what it stands for. */
export interface Term<T> {
  readonly name: string;
  readonly value: T;
}

export type Segment<T> =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'term'; readonly text: string; readonly value: T };

/** Names shorter than this are never linked (too many false matches). */
export const MIN_NAME = 3;

const WORD = /[\p{L}\p{N}_]/u;
const isWord = (ch: string | undefined): boolean => !!ch && WORD.test(ch);

/** Lower-case one UTF-16 unit at a time so indices line up with the original text. */
function fold(s: string): string {
  let out = '';
  for (const ch of s) {
    const lc = ch.toLowerCase();
    out += lc.length === ch.length ? lc : ch;
  }
  return out;
}

/**
 * Split text into plain runs and known names. Case-insensitive, whole words only (a name
 * edge that is a letter or digit must not touch another letter or digit), longest names
 * first, never overlapping. On equal length the earlier term in the list wins.
 */
export function matchTerms<T>(text: string, terms: ReadonlyArray<Term<T>>): Segment<T>[] {
  const hay = fold(text);
  const ordered = terms
    .map((t, i) => ({ t, i, needle: fold(t.name.trim()) }))
    .filter((x) => x.needle.replace(/^@/, '').length >= MIN_NAME)
    .sort((a, b) => b.needle.length - a.needle.length || a.i - b.i);
  const taken: Array<{ start: number; end: number; value: T }> = [];
  const free = (s: number, e: number) => taken.every((x) => e <= x.start || s >= x.end);
  const seen = new Set<string>();
  for (const { t, needle } of ordered) {
    if (seen.has(needle)) continue; // first term with a given name wins
    seen.add(needle);
    for (let at = hay.indexOf(needle); at >= 0; at = hay.indexOf(needle, at + 1)) {
      const end = at + needle.length;
      if (isWord(needle[0]) && isWord(text[at - 1])) continue;
      if (isWord(needle[needle.length - 1]) && isWord(text[end])) continue;
      if (!free(at, end)) continue;
      taken.push({ start: at, end, value: t.value });
    }
  }
  taken.sort((a, b) => a.start - b.start);
  const out: Segment<T>[] = [];
  let pos = 0;
  for (const m of taken) {
    if (m.start > pos) out.push({ kind: 'text', text: text.slice(pos, m.start) });
    out.push({ kind: 'term', text: text.slice(m.start, m.end), value: m.value });
    pos = m.end;
  }
  if (pos < text.length) out.push({ kind: 'text', text: text.slice(pos) });
  return out;
}

/** Places named in a message, in order of first appearance, each once (at most `max`). */
export function findPlaces(text: string, places: readonly ChatPlace[], max = 10): ChatPlace[] {
  const out: ChatPlace[] = [];
  for (const s of matchTerms(text, places.map((p) => ({ name: p.name, value: p })))) {
    if (s.kind === 'term' && !out.some((p) => p.name === s.value.name && p.q === s.value.q && p.r === s.value.r)) out.push(s.value);
  }
  return out.slice(0, max);
}

/**
 * Who a message @mentions: every `@Name` of a known person in the text. People earlier in
 * the list win a shared name (pass the ones picked from autocomplete first).
 */
export function findMentions(text: string, people: readonly ChatPerson[], max = 10): string[] {
  const out: string[] = [];
  for (const s of matchTerms(text, people.map((p) => ({ name: `@${p.name}`, value: p.id })))) {
    if (s.kind === 'term' && !out.includes(s.value)) out.push(s.value);
  }
  return out.slice(0, max);
}

/**
 * The `@query` being typed just before the caret, for autocomplete: where the `@` is and
 * what follows it. Null when the caret is not inside a mention.
 */
export function mentionQuery(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const at = before.lastIndexOf('@');
  if (at < 0 || isWord(before[at - 1])) return null;
  const query = before.slice(at + 1);
  if (query.length > 32 || /[@\n]/.test(query) || /^\s/.test(query)) return null;
  return { start: at, query };
}

/** People whose name starts with (then contains) the query, best first. */
export function suggestPeople<P extends ChatPerson>(query: string, people: readonly P[], max = 6): P[] {
  const q = fold(query.trim());
  const starts = people.filter((p) => fold(p.name).startsWith(q));
  const contains = people.filter((p) => !starts.includes(p) && q && fold(p.name).includes(q));
  return [...starts, ...contains].slice(0, max);
}
