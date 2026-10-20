import type { Effects } from './society';
import type { GovernorFocus } from './governor';

/**
 * The court (change missions-and-court): the six seats of an empire's administration, what an
 * advisor in each brings a level, their traits, and the names they are drawn from. Data only:
 * the rules are src/core/empire/Court.ts and the decisions EmpireSim.delegate.
 */
export type Seat = 'steward' | 'chancellor' | 'admiral' | 'science' | 'prelate' | 'spymaster';

export interface TraitDef {
  readonly id: string;
  readonly name: string;
  readonly blurb: string;
  /** Added to the seat's bonus, per level. */
  readonly perLevel: Effects;
  /** The Steward's building focus with this trait (when delegated). */
  readonly focus?: GovernorFocus;
}

export interface SeatDef {
  readonly id: Seat;
  readonly name: string;
  /** What the seat looks after. */
  readonly domain: string;
  /** What the advisor does when their decisions are delegated. */
  readonly decides: string;
  /** Bonus per level, whatever the trait. */
  readonly perLevel: Effects;
  readonly traits: readonly TraitDef[];
  readonly icon: string;
}

export const SEATS: readonly SeatDef[] = [
  {
    id: 'steward', name: 'Steward', domain: 'Economy and building', icon: 'build',
    decides: 'Starts the best building for their focus wherever a colony has room and credits allow.',
    perLevel: { income: { credits: 3 } },
    traits: [
      { id: 'frugal', name: 'Frugal', blurb: 'Counts every credit.', perLevel: { income: { credits: 3 } }, focus: 'wealth' },
      { id: 'industrious', name: 'Industrious', blurb: 'Mines and manufactories first.', perLevel: { miningPct: 2 }, focus: 'industry' },
      { id: 'provident', name: 'Provident', blurb: 'Granaries and growth.', perLevel: { income: { food: 1 } }, focus: 'growth' },
    ],
  },
  {
    id: 'chancellor', name: 'Chancellor', domain: 'Diplomacy and politics', icon: 'empire',
    decides: 'Accepts quests you can afford and sends tribute to factions turning hostile.',
    perLevel: { income: { influence: 1 } },
    traits: [
      { id: 'silver-tongued', name: 'Silver-tongued', blurb: 'Every envoy comes home with more.', perLevel: { income: { influence: 1 } } },
      { id: 'mercantile', name: 'Mercantile', blurb: 'Treaties that open markets.', perLevel: { tradePct: 2 } },
      { id: 'popular', name: 'Popular', blurb: 'The merchant houses love them.', perLevel: { approval: { merchants: 2 } } },
    ],
  },
  {
    id: 'admiral', name: 'Admiral', domain: 'Fleets and defence', icon: 'battle',
    decides: 'Sends badly damaged fleets that are idle away from a repair yard home to repair.',
    perLevel: { approval: { militarists: 2 } },
    traits: [
      { id: 'veteran', name: 'Veteran', blurb: 'The fleet trusts them.', perLevel: { approval: { militarists: 2 } } },
      { id: 'quartermaster', name: 'Quartermaster', blurb: 'Supply and salvage.', perLevel: { income: { metals: 1 } } },
      { id: 'raider', name: 'Raider', blurb: 'Prizes taken, prizes sold.', perLevel: { income: { credits: 2 } } },
    ],
  },
  {
    id: 'science', name: 'Science Minister', domain: 'Research', icon: 'research',
    decides: 'Keeps a research focus set, choosing the next technology when none is.',
    perLevel: { science: 1 },
    traits: [
      { id: 'brilliant', name: 'Brilliant', blurb: 'Insight upon insight.', perLevel: { science: 1 } },
      { id: 'practical', name: 'Practical', blurb: 'Research that pays.', perLevel: { income: { crystals: 1 } } },
      { id: 'revered', name: 'Revered', blurb: 'The scientists follow them anywhere.', perLevel: { approval: { scientists: 2 } } },
    ],
  },
  {
    id: 'prelate', name: 'Prelate', domain: 'Faith and culture', icon: 'research',
    decides: 'Sends missionaries to known empires while there is room for more.',
    perLevel: { income: { faith: 1 } },
    traits: [
      { id: 'zealous', name: 'Zealous', blurb: 'The faith spreads faster.', perLevel: { spread: 1 } },
      { id: 'beloved', name: 'Beloved', blurb: 'The faithful are content.', perLevel: { approval: { faithful: 2 } } },
      { id: 'patron', name: 'Patron of the Arts', blurb: 'Culture that wins friends abroad.', perLevel: { income: { influence: 1 } } },
    ],
  },
  {
    id: 'spymaster', name: 'Spymaster', domain: 'Espionage', icon: 'search',
    decides: 'Keeps every spy network you can run planted in a known empire.',
    perLevel: { science: 1 },
    traits: [
      { id: 'shadow', name: 'Shadow', blurb: 'Secrets stolen quietly.', perLevel: { science: 1 } },
      { id: 'informant', name: 'Informant', blurb: 'Ears in every market.', perLevel: { tradePct: 1 } },
      { id: 'ruthless', name: 'Ruthless', blurb: 'Feared, and so obeyed.', perLevel: { income: { influence: 1 } } },
    ],
  },
];

export const SEAT_BY_ID: Readonly<Record<Seat, SeatDef>> = Object.fromEntries(SEATS.map((s) => [s.id, s])) as Record<Seat, SeatDef>;

/** What the ruler brings a level. */
export const LEADER_PER_LEVEL: Effects = {
  income: { influence: 1 },
  approval: { industrialists: 1, scientists: 1, militarists: 1, faithful: 1, merchants: 1 },
};

export const ADVISOR_NAMES = {
  first: ['Ada', 'Bastian', 'Cira', 'Doran', 'Elsa', 'Fenwick', 'Galen', 'Hesper', 'Ilya', 'Jorun', 'Kael', 'Liora', 'Maren', 'Nils', 'Orla', 'Pell', 'Quill', 'Rhea', 'Soren', 'Tamsin', 'Ulric', 'Vesna', 'Wren', 'Xan', 'Yara', 'Zev'],
  last: ['Ashby', 'Brightwater', 'Corvane', 'Dray', 'Ellory', 'Falke', 'Grail', 'Harrow', 'Ingle', 'Jessup', 'Kestrel', 'Lowe', 'Marchetti', 'Nightingale', 'Okonkwo', 'Pryce', 'Quarry', 'Rook', 'Sato', 'Thorne', 'Umber', 'Vance', 'Wilder', 'Yoshida'],
} as const;

/** Influence it costs to seek a new candidate for a seat. */
export const SEEK_COST = 40;
