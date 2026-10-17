/**
 * Diplomacy between players: every pair of players is neutral (by default), at war, or allied.
 * War is declared by one side and starts a year later; peace and alliances are proposed by one
 * side and agreed by the other; either ally may break an alliance. Pure: relations are plain data
 * in the shared world (src/core/world/SharedWorld.ts), changed only through `applyDiplomacy`.
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
