/**
 * Diplomacy between players: every pair of players is neutral (by default), at war, or allied.
 * War is declared by one side and starts a year later; peace and alliances are proposed by one
 * side and agreed by the other; either ally may break an alliance. Pure: relations are plain data
 * in the shared world (src/core/world/SharedWorld.ts), changed only through `applyDiplomacy`.
 * As in Civilization, two empires can deal with each other only once they have met: a fleet or
 * world of one came within CONTACT_RANGE of a fleet or world of the other (first contact).
 */
export type RelationStatus = 'neutral' | 'war' | 'alliance';

export type DiplomaticAction = 'declare-war' | 'propose-peace' | 'propose-alliance' | 'accept' | 'decline' | 'withdraw' | 'break-alliance';

export const DIPLOMATIC_ACTIONS: readonly DiplomaticAction[] = ['declare-war', 'propose-peace', 'propose-alliance', 'accept', 'decline', 'withdraw', 'break-alliance'];

export interface Proposal {
  readonly from: string;
  readonly kind: 'peace' | 'alliance';
  /** World time it was made. */
  readonly at: number;
}

export interface Relation {
  readonly status: RelationStatus;
  /** World time the status takes effect (a war a year after it is declared). */
  readonly since: number;
  /** The last change: who made it and when (for news). */
  readonly by?: string;
  readonly at?: number;
  readonly action?: DiplomaticAction;
  readonly proposal?: Proposal;
}

/** Years between a declaration of war and the first shot. */
export const WAR_NOTICE = 1;

export const NEUTRAL: Relation = { status: 'neutral', since: 0 };

/** The key of a pair of players, the same whichever is named first. */
export const pairKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** Hexes within which a fleet or world of one empire meets one of another's: first contact. */
export const CONTACT_RANGE = 2;

/** First contacts: pairKey → the world time the two empires met. */
export type Contacts = Readonly<Record<string, number>>;

/**
 * Whether two players have met. A pair that already had dealings (a relation on record from
 * before first contact existed) counts as met.
 */
export function haveMet(contacts: Contacts | undefined, relations: Readonly<Record<string, Relation>> | undefined, a: string, b: string): boolean {
  if (a === b) return false;
  const key = pairKey(a, b);
  return contacts?.[key] !== undefined || relations?.[key] !== undefined;
}

export function relationOf(relations: Readonly<Record<string, Relation>> | undefined, a: string, b: string): Relation {
  return relations?.[pairKey(a, b)] ?? NEUTRAL;
}

/** At war at world time `t` (the declaration's notice has run out). */
export function atWar(relations: Readonly<Record<string, Relation>> | undefined, a: string, b: string, t: number): boolean {
  const r = relationOf(relations, a, b);
  return a !== b && r.status === 'war' && t >= r.since;
}

export function allied(relations: Readonly<Record<string, Relation>> | undefined, a: string, b: string): boolean {
  return a !== b && relationOf(relations, a, b).status === 'alliance';
}

/**
 * The relation after `by` takes `action` toward the other player at world time `at`, or null when
 * the action is not open to them now (e.g. accepting their own proposal, or proposing peace when
 * not at war).
 */
export function applyDiplomacy(r: Relation, by: string, action: DiplomaticAction, at: number): Relation | null {
  const stamp = { by, at, action };
  switch (action) {
    case 'declare-war':
      return r.status === 'war' ? null : { status: 'war', since: at + WAR_NOTICE, ...stamp };
    case 'propose-peace':
      return r.status === 'war' && !r.proposal ? { ...r, ...stamp, proposal: { from: by, kind: 'peace', at } } : null;
    case 'propose-alliance':
      return r.status === 'neutral' && !r.proposal ? { ...r, ...stamp, proposal: { from: by, kind: 'alliance', at } } : null;
    case 'accept':
      if (!r.proposal || r.proposal.from === by) return null;
      return { status: r.proposal.kind === 'peace' ? 'neutral' : 'alliance', since: at, ...stamp };
    case 'decline':
      return r.proposal && r.proposal.from !== by ? { ...withoutProposal(r), ...stamp } : null;
    case 'withdraw':
      return r.proposal && r.proposal.from === by ? { ...withoutProposal(r), ...stamp } : null;
    case 'break-alliance':
      return r.status === 'alliance' ? { status: 'neutral', since: at, ...stamp } : null;
  }
}

function withoutProposal(r: Relation): Relation {
  const { proposal: _p, ...rest } = r;
  return rest;
}

/** What `me` can do toward the other player right now. */
export function actionsFor(r: Relation, me: string): DiplomaticAction[] {
  return DIPLOMATIC_ACTIONS.filter((a) => applyDiplomacy(r, me, a, 0) !== null);
}

/** One line of news for the player who did not make the change (null when there is nothing to tell). */
export function newsOf(r: Relation, them: string): string | null {
  switch (r.action) {
    case 'declare-war': return `${them} has declared war on you: hostilities begin within a year`;
    case 'propose-peace': return `${them} proposes peace: accept or decline in Empire › Relations`;
    case 'propose-alliance': return `${them} proposes an alliance: accept or decline in Empire › Relations`;
    case 'accept': return r.status === 'alliance' ? `${them} accepted your alliance: their systems are friendly to your fleets` : `${them} accepted peace: the war is over`;
    case 'decline': return `${them} declined your proposal`;
    case 'withdraw': return `${them} withdrew their proposal`;
    case 'break-alliance': return `${them} has broken your alliance`;
    default: return null;
  }
}

/** Where an empire is: its worlds and its fleets (on station or under way) this year. */
export interface Presence {
  readonly player: string;
  readonly hexes: ReadonlyArray<{ readonly q: number; readonly r: number }>;
}

/**
 * The pairs of players meeting for the first time: a hex of one within CONTACT_RANGE of a hex of
 * the other, and not met before. Each pair once, in a stable order, with where they met.
 */
export function firstContacts(presence: readonly Presence[], contacts: Contacts | undefined, relations: Readonly<Record<string, Relation>> | undefined): Array<{ a: string; b: string; at: { q: number; r: number } }> {
  const byHex = new Map<string, Set<string>>();
  for (const p of presence) {
    for (const h of p.hexes) {
      const k = `${h.q},${h.r}`;
      let s = byHex.get(k);
      if (!s) byHex.set(k, (s = new Set()));
      s.add(p.player);
    }
  }
  const found = new Map<string, { a: string; b: string; at: { q: number; r: number } }>();
  const players = [...presence].sort((x, y) => (x.player < y.player ? -1 : x.player > y.player ? 1 : 0));
  for (const p of players) {
    for (const h of p.hexes) {
      for (let dq = -CONTACT_RANGE; dq <= CONTACT_RANGE; dq++) {
        for (let dr = Math.max(-CONTACT_RANGE, -dq - CONTACT_RANGE); dr <= Math.min(CONTACT_RANGE, -dq + CONTACT_RANGE); dr++) {
          for (const other of byHex.get(`${h.q + dq},${h.r + dr}`) ?? []) {
            if (other === p.player) continue;
            const key = pairKey(p.player, other);
            if (found.has(key) || haveMet(contacts, relations, p.player, other)) continue;
            const [a, b] = p.player < other ? [p.player, other] : [other, p.player];
            found.set(key, { a, b, at: { q: h.q, r: h.r } });
          }
        }
      }
    }
  }
  return [...found.values()];
}
