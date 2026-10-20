import type { Resource } from './resources';

export type FactionId = 'industrialists' | 'scientists' | 'militarists' | 'faithful' | 'merchants';

export const FACTIONS: ReadonlyArray<{ id: FactionId; name: string; wants: string }> = [
  { id: 'industrialists', name: 'Industrialists', wants: 'mining and shipbuilding' },
  { id: 'scientists', name: 'Scientists', wants: 'research funding' },
  { id: 'militarists', name: 'Militarists', wants: 'warships and victories' },
  { id: 'faithful', name: 'The Faithful', wants: 'temples and missionaries' },
  { id: 'merchants', name: 'Merchant Houses', wants: 'open trade' },
];

/** Per-turn effects, applied by the economy resolver. Percentages are whole numbers. */
export interface Effects {
  readonly income?: Partial<Record<Resource, number>>;
  readonly tradePct?: number;
  readonly miningPct?: number;
  readonly science?: number;
  readonly spread?: number;
  readonly approval?: Partial<Record<FactionId, number>>;
}

export interface GovernmentDef {
  readonly id: string;
  readonly name: string;
  /** Grant id (`gov:<id>`) that unlocks it; undefined = always available. */
  readonly unlock?: string;
  readonly blurb: string;
  readonly effects: Effects;
}

export const GOVERNMENTS: readonly GovernmentDef[] = [
  { id: 'council', name: 'Provisional Council', blurb: 'A cautious coalition. No strengths, no enemies.', effects: { income: { influence: 2 } } },
  { id: 'republic', name: 'Stellar Republic', unlock: 'gov:republic', blurb: 'Elected senates; trade and influence flourish.', effects: { income: { influence: 4 }, tradePct: 15, approval: { merchants: 10, militarists: -5 } } },
  { id: 'directorate', name: 'Directorate', unlock: 'gov:directorate', blurb: 'Technocrats allocate everything by model.', effects: { science: 6, approval: { scientists: 15, faithful: -10 } } },
  { id: 'hive', name: 'Hive Consensus', unlock: 'gov:hive', blurb: 'One shared will. Production without dissent.', effects: { miningPct: 20, income: { influence: 1 }, approval: { industrialists: 10, merchants: -10 } } },
  { id: 'corporate', name: 'Corporate Syndicate', unlock: 'gov:corporate', blurb: 'The board answers to shareholders.', effects: { income: { credits: 25 }, miningPct: 10, approval: { merchants: 15, faithful: -10 } } },
  { id: 'theocracy', name: 'Theocracy', unlock: 'gov:theocracy', blurb: 'The faith rules; missionaries travel far.', effects: { income: { faith: 5, influence: 2 }, spread: 3, approval: { faithful: 20, scientists: -15 } } },
];

export interface PolicyDef {
  readonly id: string;
  readonly name: string;
  readonly blurb: string;
  readonly effects: Effects;
}

export const POLICIES: readonly PolicyDef[] = [
  { id: 'free-trade', name: 'Free Trade', blurb: '+25% trade income.', effects: { tradePct: 25, approval: { merchants: 10, industrialists: -5 } } },
  { id: 'war-economy', name: 'War Economy', blurb: '+20% mining.', effects: { miningPct: 20, approval: { militarists: 15, merchants: -10 } } },
  { id: 'research-grants', name: 'Research Grants', blurb: '+5 science per turn for 15 credits.', effects: { science: 5, income: { credits: -15 }, approval: { scientists: 15 } } },
  { id: 'state-faith', name: 'State Faith', blurb: '+4 faith, faster conversion.', effects: { income: { faith: 4 }, spread: 2, approval: { faithful: 15, scientists: -10 } } },
  { id: 'open-borders', name: 'Open Borders', blurb: '+3 influence, +10% trade.', effects: { income: { influence: 3 }, tradePct: 10, approval: { militarists: -10, merchants: 5 } } },
  { id: 'conscription', name: 'Conscription', blurb: 'Ships cost no upkeep.', effects: { approval: { militarists: 10, industrialists: -5, merchants: -5 } } },
];

export const TENETS: ReadonlyArray<{ id: string; name: string; blurb: string; effects: Effects }> = [
  { id: 'star-pilgrims', name: 'Star Pilgrims', blurb: 'Pilgrims ride the trade lanes: +10% trade.', effects: { tradePct: 10 } },
  { id: 'machine-saints', name: 'Machine Saints', blurb: 'Prayer as computation: +3 science.', effects: { science: 3 } },
  { id: 'void-ascetics', name: 'Void Ascetics', blurb: 'Monks in the dark: +2 crystals.', effects: { income: { crystals: 2 } } },
  { id: 'harmony', name: 'Harmony of Spheres', blurb: 'Order above all: +3 influence.', effects: { income: { influence: 3 } } },
  { id: 'brood-mother', name: 'The Brood Mother', blurb: 'All life is one family: +10% mining.', effects: { miningPct: 10 } },
  { id: 'iron-covenant', name: 'Iron Covenant', blurb: 'Faith that fights: +2 faith, militarists approve.', effects: { income: { faith: 2 }, approval: { militarists: 10 } } },
];
