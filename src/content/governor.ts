import type { Resource } from './resources';

/**
 * The empire governor's foci (change empire-governor): how much each kind of output is worth to
 * each, for choosing buildings, and which research bonuses each looks for.
 */
export type GovernorFocus = 'balanced' | 'science' | 'growth' | 'industry' | 'wealth';

export interface FocusDef {
  readonly name: string;
  readonly blurb: string;
  /** Worth of one unit a year of each resource, and of one science shard a year. */
  readonly weights: Readonly<Partial<Record<Resource, number>>> & { readonly science: number };
  /** Research bonuses (stat names) it looks for first. */
  readonly stats: readonly string[];
}

export const FOCI: Readonly<Record<GovernorFocus, FocusDef>> = {
  balanced: { name: 'Balanced', blurb: 'A bit of everything.', weights: { credits: 1, food: 1.5, goods: 1.5, metals: 1, gases: 1, crystals: 2, influence: 2, faith: 1, science: 3 }, stats: ['science', 'credits', 'mining', 'trade'] },
  science: { name: 'Science', blurb: 'Research labs and the technology that speeds research.', weights: { credits: 0.5, food: 0.5, goods: 0.5, metals: 0.4, gases: 0.4, crystals: 1.5, influence: 1, faith: 0.5, science: 8 }, stats: ['science', 'espionage', 'observation'] },
  growth: { name: 'Growth', blurb: 'Food for bigger populations, and the stability to keep them.', weights: { credits: 0.6, food: 5, goods: 0.6, metals: 0.4, gases: 0.4, crystals: 0.6, influence: 1, faith: 1, science: 1 }, stats: ['stability', 'influence', 'build'] },
  industry: { name: 'Industry', blurb: 'Mines and manufactories: metals, gases, crystals and goods.', weights: { credits: 0.5, food: 0.8, goods: 2, metals: 2.5, gases: 2.5, crystals: 4, influence: 0.5, faith: 0.2, science: 1 }, stats: ['mining', 'build', 'cargo', 'crystals'] },
  wealth: { name: 'Wealth', blurb: 'Credits from trade hubs and trade goods, and influence.', weights: { credits: 2.5, food: 0.6, goods: 2, metals: 0.4, gases: 0.4, crystals: 1, influence: 3, faith: 0.5, science: 1 }, stats: ['credits', 'trade', 'influence', 'cargo'] },
};

/** Food income a year below which the governor builds food first, whatever its focus. */
export const FOOD_FLOOR = 2;
/** Credits the governor keeps in hand unless told otherwise. */
export const DEFAULT_RESERVE = 300;
