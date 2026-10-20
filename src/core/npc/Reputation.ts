import type { NpcState } from './types';

/**
 * Reputation: where each player stands with each NPC faction, from −100 to +100. It starts at the
 * faction's disposition and drifts back toward it a point every five years; trade and tribute raise it,
 * fighting lowers it. Friendly factions leave you alone; hostile ones come more often.
 */
export type Tier = 'hostile' | 'unfriendly' | 'neutral' | 'cordial' | 'allied';

export const TIERS: ReadonlyArray<{ readonly id: Tier; readonly name: string; readonly min: number; readonly color: string; readonly blurb: string }> = [
  { id: 'allied', name: 'Allied', min: 50, color: '#7cff9b', blurb: 'Never raids you; their markets pay their best prices.' },
  { id: 'cordial', name: 'Cordial', min: 10, color: '#9be29b', blurb: 'Does not raid you; pays well for your goods.' },
  { id: 'neutral', name: 'Neutral', min: -10, color: '#c9d1dc', blurb: 'Raids now and then.' },
  { id: 'unfriendly', name: 'Unfriendly', min: -50, color: '#ffb347', blurb: 'Raids you when it can.' },
  { id: 'hostile', name: 'Hostile', min: -101, color: '#ff5d5d', blurb: 'Raids you half again as often.' },
];

/** Standing at which a faction stops raiding you, and below which it raids more. */
export const FRIENDLY = 10;
export const HOSTILE = -50;

export const clampStanding = (n: number): number => Math.max(-100, Math.min(100, Math.round(n)));

export function tierOf(standing: number): (typeof TIERS)[number] {
  return TIERS.find((t) => standing >= t.min) ?? TIERS[TIERS.length - 1];
}

/** A player's standing with a faction (its disposition if it has not been recorded). */
export function standingOf(npc: NpcState, player: string, disposition: number): number {
  return npc.standing?.[player] ?? disposition;
}

/** How much more a faction's markets pay for your goods: −25% when hostile to +50% when allied. */
export function marketFactor(standing: number): number {
  return standing >= 0 ? 1 + standing / 200 : 1 + standing / 400;
}

/** Standing changes (per event). */
export const STANDING = {
  /** Selling goods at their world: per 25 goods, up to `tradeMax` a sale. */
  perGoods: 1 / 25,
  tradeMax: 4,
  /** Tribute: what it costs and what it buys. */
  tribute: 8,
  tributeCost: { credits: 200, influence: 10 },
  /** Fighting their raiders (whoever wins). */
  repel: -3,
  /** Assaulting one of their worlds, and taking it. */
  assault: -20,
  capture: -25,
  /** Drift back toward their disposition: a point every `driftEvery` years. */
  drift: 1,
  driftEvery: 5,
} as const;
