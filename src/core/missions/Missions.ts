import type { Seat } from '../../content/advisors';
import type { Resource } from '../../content/resources';
import { Rng, hashSeed } from '../rng/Rng';

/**
 * Missions (change missions-and-court): objectives read from the empire's state, so progress is
 * live and the server agrees, with rewards when they are met. Story missions are content
 * (src/content/missions.ts); quests from NPC factions are generated here from the faction, the
 * player and the period, the same in the browser and on the server.
 */
export type ObjectiveKind =
  | 'survey' | 'colonies' | 'buildings' | 'miners' | 'warships' | 'research' | 'stock' | 'income'
  | 'contacts' | 'standing' | 'depots' | 'visit' | 'deliver' | 'megastructures' | 'leader';

export interface Objective {
  readonly kind: ObjectiveKind;
  /** How many (or how much) it takes. */
  readonly n: number;
  /** What it says on the card. */
  readonly text: string;
  /** survey: only planets of this type ('megastructure' for any megastructure). */
  readonly biome?: string;
  /** survey: only planets at least this far from home (ly). */
  readonly far?: number;
  /** buildings: only this building. */
  readonly id?: string;
  /** stock, income, deliver: the resource. */
  readonly resource?: Resource;
  /** visit: the star a fleet must be on station at (its id, "q,r"). */
  readonly star?: string;
  /** standing: with this faction (else the best standing with any). */
  readonly npc?: string;
  /** megastructures: count different types only. */
  readonly distinct?: boolean;
}

export interface Reward {
  readonly materials?: Partial<Record<Resource, number>>;
  /** Experience for the ruler, and for the advisor in the mission's seat. */
  readonly leaderXp?: number;
  readonly advisorXp?: number;
  /** Research shards toward the current focus. */
  readonly shards?: number;
  /** A new candidate for this seat. */
  readonly candidate?: Seat;
  /** Standing with the quest's faction. */
  readonly standing?: number;
  /** A trade accord with the quest's faction: +tradePct for this many years. */
  readonly accord?: { readonly tradePct: number; readonly years: number };
}

export type Trigger =
  | { readonly kind: 'start' }
  | { readonly kind: 'surveyed'; readonly biome: string }
  | { readonly kind: 'contact' };

export interface MissionDef {
  readonly id: string;
  /** Story chapter (1, 2, 3...); 0 for a faction's quest. */
  readonly chapter: number;
  readonly title: string;
  /** Who gives it: a seat of your court, the council, or a faction (quests). */
  readonly giver: Seat | 'council' | 'faction';
  readonly briefing: string;
  /** What is said when it is done. */
  readonly epilogue?: string;
  readonly objectives: readonly Objective[];
  readonly rewards: Reward;
  /** Story missions that must be done first. */
  readonly requires?: readonly string[];
  /** What brings it in (default: the missions it requires being done). */
  readonly trigger?: Trigger;
}

/** A faction's quest: a mission with its faction, made for one player and period. */
export interface QuestDef extends MissionDef {
  readonly npc: string;
  readonly npcName: string;
  /** Year the offer lapses unless accepted. */
  readonly offerEnds: number;
}

export interface ActiveMission {
  readonly id: string;
  readonly started: number;
  /** Year it lapses unfinished (quests). */
  readonly expires?: number;
  /** For counting objectives that start from where the empire was (quests): the value at the start. */
  readonly base?: readonly number[];
  /** A quest carries its own definition. */
  readonly quest?: QuestDef;
}

export interface MissionsState {
  readonly active: readonly ActiveMission[];
  /** Story missions done. */
  readonly done: readonly string[];
  /** Quests offered and not yet taken. */
  readonly offers: readonly QuestDef[];
  /** Quests completed, all time. */
  readonly questsDone: number;
  /** Most recent first: what was done (story and quests) and when. */
  readonly record: ReadonlyArray<{ readonly turn: number; readonly title: string; readonly chapter: number }>;
  /** Timed bonuses from quests (trade accords). */
  readonly accords: ReadonlyArray<{ readonly name: string; readonly effects: { readonly tradePct: number }; readonly until: number }>;
  /** Quest ids turned down (a faction does not ask the same favour twice). */
  readonly declined?: readonly string[];
  /** Quest ids already offered (accepted, lapsed or done): not offered again. */
  readonly taken?: readonly string[];
}

export const NEW_MISSIONS: MissionsState = { active: [], done: [], offers: [], questsDone: 0, record: [], accords: [] };

/** What objectives are measured against: a snapshot of the empire, made by the simulation. */
export interface MissionView {
  readonly turn: number;
  readonly surveyed: number;
  /** Surveyed planets by type, and how far each was from home (ly). */
  readonly surveyedOf: Readonly<Record<string, number>>;
  readonly surveyedDistances: readonly number[];
  readonly megaTypes: readonly string[];
  readonly colonies: number;
  readonly buildings: Readonly<Record<string, number>>;
  readonly miners: number;
  readonly warships: number;
  readonly researched: number;
  readonly stock: Readonly<Partial<Record<Resource, number>>>;
  readonly income: Readonly<Partial<Record<Resource, number>>>;
  readonly contacts: number;
  readonly standings: Readonly<Record<string, number>>;
  readonly depots: number;
  /** Stars where one of your fleets is on station. */
  readonly stationed: readonly string[];
  readonly leaderLevel: number;
}

/** The value an objective measures, now. */
export function measure(o: Objective, v: MissionView): number {
  switch (o.kind) {
    case 'survey':
      if (o.biome) return v.surveyedOf[o.biome] ?? 0;
      if (o.far) return v.surveyedDistances.filter((d) => d >= o.far!).length;
      return v.surveyed;
    case 'colonies': return v.colonies;
    case 'buildings': return o.id ? v.buildings[o.id] ?? 0 : Object.values(v.buildings).reduce((a, b) => a + b, 0);
    case 'miners': return v.miners;
    case 'warships': return v.warships;
    case 'research': return v.researched;
    case 'stock':
    case 'deliver': return Math.floor(v.stock[o.resource!] ?? 0);
    case 'income': return Math.floor(v.income[o.resource!] ?? 0);
    case 'contacts': return v.contacts;
    case 'standing': return o.npc ? v.standings[o.npc] ?? -100 : Math.max(-100, ...Object.values(v.standings));
    case 'depots': return v.depots;
    case 'visit': return o.star && v.stationed.includes(o.star) ? 1 : 0;
    case 'megastructures': return o.distinct ? v.megaTypes.length : v.surveyedOf.megastructure ?? 0;
    case 'leader': return v.leaderLevel;
  }
}

/** Objectives that count from where the empire stood when the mission began (quests only). */
const COUNTS = new Set<ObjectiveKind>(['survey', 'megastructures']);

export interface ObjectiveProgress {
  readonly objective: Objective;
  readonly have: number;
  readonly need: number;
  readonly done: boolean;
}

/** Each objective's progress, and whether the mission is complete. */
export function progressOf(def: MissionDef, active: ActiveMission | undefined, v: MissionView): { objectives: ObjectiveProgress[]; complete: boolean } {
  const objectives = def.objectives.map((o, i) => {
    const base = active?.base?.[i] ?? 0;
    const have = Math.max(0, measure(o, v) - (COUNTS.has(o.kind) ? base : 0));
    return { objective: o, have: Math.min(have, o.n), need: o.n, done: have >= o.n };
  });
  return { objectives, complete: objectives.every((x) => x.done) };
}

/** Where counting objectives start from, at the moment a mission begins. */
export const baseOf = (def: MissionDef, v: MissionView): number[] => def.objectives.map((o) => (COUNTS.has(o.kind) ? measure(o, v) : 0));

/** Story missions that should begin now: requirements done and their trigger met. */
export function unlocked(story: readonly MissionDef[], m: MissionsState, v: MissionView): MissionDef[] {
  const busy = new Set([...m.done, ...m.active.map((a) => a.id)]);
  return story.filter((d) => {
    if (busy.has(d.id)) return false;
    if (d.requires?.some((r) => !m.done.includes(r))) return false;
    const t = d.trigger;
    if (!t) return !!d.requires?.length;
    if (t.kind === 'start') return true;
    if (t.kind === 'contact') return v.contacts > 0;
    return (v.surveyedOf[t.biome] ?? 0) > 0;
  });
}

// ── Faction quests ────────────────────────────────────────────────────

/** A faction may offer one quest each period of this many years. */
export const QUEST_PERIOD = 60;
/** An accepted quest must be done within this many years. */
export const QUEST_YEARS = 150;
/** Most offers waiting at once. */
export const MAX_OFFERS = 3;

/** What the generator needs to know about a faction. */
export interface QuestGiver {
  readonly id: string;
  readonly name: string;
  readonly archetype: string;
  readonly tier: number;
  readonly standing: number;
  /** Its home star (id and name). */
  readonly home: { readonly id: string; readonly name: string };
}

type Template = (g: QuestGiver, rng: Rng) => Pick<MissionDef, 'title' | 'briefing' | 'objectives'> & { readonly rewards: Reward };

const amount = (rng: Rng, lo: number, hi: number, tier: number) => Math.round((lo + rng.next() * (hi - lo)) * (0.7 + tier * 0.3) / 5) * 5;

const TEMPLATES: Readonly<Record<string, Template>> = {
  metals: (g, rng) => {
    const n = amount(rng, 80, 200, g.tier);
    return { title: `Ore for the ${g.name}`, briefing: `The ${g.name} are short of metals for their shipyards and ask for ${n}. They will remember who helped.`,
      objectives: [{ kind: 'deliver', resource: 'metals', n, text: `Hand over ${n} metals` }], rewards: { standing: 12, materials: { influence: 20, credits: n } } };
  },
  crystals: (g, rng) => {
    const n = amount(rng, 25, 70, g.tier);
    return { title: `Crystals for the ${g.name}`, briefing: `Their lenses and lattices want crystals: ${n} of them. Their scientists offer what they know in return.`,
      objectives: [{ kind: 'deliver', resource: 'crystals', n, text: `Hand over ${n} crystals` }], rewards: { standing: 14, shards: 40, materials: { influence: 25 } } };
  },
  goods: (g, rng) => {
    const n = amount(rng, 40, 120, g.tier);
    return { title: `A cargo for the ${g.name}`, briefing: `The ${g.name}'s markets are hungry for your trade goods. Send ${n}, and their merchants will open their doors to yours.`,
      objectives: [{ kind: 'deliver', resource: 'goods', n, text: `Hand over ${n} trade goods` }], rewards: { standing: 12, materials: { influence: 20 }, accord: { tradePct: 10, years: 120 } } };
  },
  faith: (g, rng) => {
    const n = amount(rng, 20, 60, g.tier);
    return { title: `Offerings to the ${g.name}`, briefing: `The ${g.name} hold a great festival and ask your temples for ${n} faith in offerings. Shared rites make old enemies kin.`,
      objectives: [{ kind: 'deliver', resource: 'faith', n, text: `Offer ${n} faith` }], rewards: { standing: 16, materials: { influence: 30, faith: Math.round(n * 1.5) } } };
  },
  credits: (g, rng) => {
    const n = amount(rng, 250, 700, g.tier);
    return { title: `Protection from the ${g.name}`, briefing: `The ${g.name} suggest that ${n} credits would keep their raiders busy elsewhere. Pirates keep their bargains, mostly.`,
      objectives: [{ kind: 'deliver', resource: 'credits', n, text: `Pay ${n} credits` }], rewards: { standing: 20, materials: { influence: 10 } } };
  },
  survey: (g, rng) => {
    const n = 4 + Math.floor(rng.next() * 6) + g.tier;
    return { title: `Charts for the ${g.name}`, briefing: `The ${g.name} would trade for star charts: survey ${n} more planets and share what you find.`,
      objectives: [{ kind: 'survey', n, text: `Survey ${n} more planets` }], rewards: { standing: 10, shards: 30, materials: { influence: 15, credits: 150 } } };
  },
  visit: (g) => ({ title: `An embassy to ${g.home.name}`, briefing: `The ${g.name} invite an embassy. Send any fleet to their home at ${g.home.name}, to show the flag and talk.`,
    objectives: [{ kind: 'visit', star: g.home.id, n: 1, text: `A fleet on station at ${g.home.name}` }], rewards: { standing: 15, materials: { influence: 40, faith: 10 }, candidate: 'chancellor' } }),
};

/** Which quests each kind of faction asks for, by weight. */
const BY_ARCHETYPE: Readonly<Record<string, ReadonlyArray<readonly [string, number]>>> = {
  vossk: [['metals', 4], ['visit', 1], ['credits', 1]],
  krell: [['metals', 2], ['crystals', 2], ['survey', 1]],
  ithari: [['crystals', 3], ['survey', 2], ['visit', 1]],
  morrow: [['credits', 4], ['goods', 2]],
  seraph: [['faith', 4], ['visit', 2], ['goods', 1]],
  grey: [['goods', 4], ['metals', 1], ['crystals', 1]],
};

/** Chance a faction offers a quest in a period, by standing: rarely when hostile, often when allied. */
export const offerChance = (standing: number): number => Math.max(0.1, Math.min(0.75, 0.35 + standing / 160));

/**
 * The quest a faction offers a player in the period holding `year`, or null (no offer this
 * period). The same for everyone asking: it depends only on its arguments.
 */
export function questOffer(g: QuestGiver, player: string, year: number): QuestDef | null {
  const period = Math.floor(year / QUEST_PERIOD);
  const rng = new Rng(hashSeed(g.id, player, period, 'quest'));
  if (rng.next() >= offerChance(g.standing)) return null;
  const kinds = BY_ARCHETYPE[g.archetype] ?? [['metals', 1], ['survey', 1]];
  const kind = rng.weighted(kinds);
  const t = TEMPLATES[kind](g, rng);
  // Envoys from friendly factions sometimes join your court; their friends speak well of you.
  const extra: Reward = g.standing >= 10 && !t.rewards.candidate && rng.chance(0.2) ? { candidate: 'chancellor' } : {};
  // Every quest done is politics and culture too: influence, and faith from the shared rites.
  const materials = { influence: 15, ...t.rewards.materials, faith: (t.rewards.materials?.faith ?? 0) + 8 + g.tier * 2 };
  return {
    id: `q:${g.id}:${period}`, chapter: 0, giver: 'faction', npc: g.id, npcName: g.name,
    title: t.title, briefing: t.briefing, objectives: t.objectives,
    rewards: { leaderXp: 40 + g.tier * 10, advisorXp: 30, ...t.rewards, ...extra, materials },
    offerEnds: (period + 1) * QUEST_PERIOD,
  };
}
