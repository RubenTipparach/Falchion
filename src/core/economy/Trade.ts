import type { Squadron } from '../combat/Combat';

/**
 * Trade goods: colonies make them, freighters carry them to another world and sell them for
 * credits. The farther the market from where the goods were loaded, the better the price, so a
 * long run pays about as well per year as a short one; foreign markets pay more than your own.
 */

/** Who a market belongs to. */
export type MarketKind = 'own' | 'player' | 'npc';

/** A world freighters can sell goods at. */
export interface Market {
  readonly starId: string;
  readonly name: string;
  readonly kind: MarketKind;
}

/** Goods one Bulk Freighter carries (before research). */
export const CARGO_PER_FREIGHTER = 50;
export const FREIGHTER = 'bulk-freighter';

/** Markets farther than this pay no more: the price stops growing. */
export const MAX_TRADE_DISTANCE = 400;

const KIND_MULT: Readonly<Record<MarketKind, number>> = { own: 1, npc: 1.25, player: 1.5 };

/** Goods a group of ships can carry. `cargoBonus`: extra goods per freighter from research. */
export function cargoCapacity(ships: readonly Squadron[], cargoBonus = 0): number {
  const n = ships.find((s) => s.classId === FREIGHTER)?.count ?? 0;
  return n * (CARGO_PER_FREIGHTER + cargoBonus);
}

/** Credits for one good carried `distance` ly to a market. */
export function goodsPrice(distance: number, kind: MarketKind, tradePct = 0): number {
  return (2 + 0.5 * Math.min(MAX_TRADE_DISTANCE, Math.max(0, distance))) * KIND_MULT[kind] * (1 + tradePct / 100);
}

/** Credits for a whole cargo. */
export function saleValue(goods: number, distance: number, kind: MarketKind, tradePct = 0): number {
  return Math.round(goods * goodsPrice(distance, kind, tradePct));
}
