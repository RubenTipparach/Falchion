import { COMMERCE } from '../../content/commerce';
import type { Resource } from '../../content/resources';
import { cleanCompanies, fleetValue, sharePrice, type Company, type PublicCompany } from './Companies';
import { cleanTariff, type Pressure } from './Exchange';

/**
 * An empire's commerce (change commerce), kept in its save: the tariffs it charges, its trading's
 * pressure on each exchange, the companies it chartered, and the shares it holds elsewhere.
 */
export interface CommerceState {
  /** Percent other players pay to trade on your exchange or sell goods at your worlds. */
  readonly tariff: number;
  /** A different tariff for some players (by player id). */
  readonly tariffs?: Readonly<Record<string, number>>;
  readonly pressure?: Pressure;
  readonly companies: readonly Company[];
  /**
   * Shares held in companies not your own: `npc:<corporation id>` for NPC corporations,
   * `player:<owner>:<company id>` for other players' companies.
   */
  readonly portfolio?: Readonly<Record<string, number>>;
  /** Companies chartered so far (their ids). */
  readonly chartered?: number;
}

export const NO_COMMERCE: CommerceState = { tariff: 10, companies: [] };

/** The tariff an empire charges one player. */
export const tariffFor = (c: Pick<CommerceState, 'tariff' | 'tariffs'>, player: string): number => c.tariffs?.[player] ?? c.tariff;

/** What other empires see of an empire's commerce: its tariffs and its companies. */
export interface PublicCommerce {
  readonly tariff: number;
  readonly tariffs?: Readonly<Record<string, number>>;
  readonly companies: readonly PublicCompany[];
}

/** Another empire's published commerce, made safe (untrusted input). */
export function cleanCommerce(raw: unknown): PublicCommerce {
  const c = raw as { tariff?: unknown; tariffs?: unknown; companies?: unknown } | null;
  const tariffs: Record<string, number> = {};
  if (c?.tariffs && typeof c.tariffs === 'object') {
    for (const [id, n] of Object.entries(c.tariffs as Record<string, unknown>).slice(0, 200)) if (/^[\w-]{1,40}$/.test(id)) tariffs[id] = cleanTariff(n);
  }
  return { tariff: c && 'tariff' in c ? cleanTariff(c.tariff) : NO_COMMERCE.tariff, ...(Object.keys(tariffs).length ? { tariffs } : {}), companies: cleanCompanies(c?.companies) };
}

/** Portfolio keys. */
export const corpKey = (corpId: string): string => `npc:${corpId}`;
export const playerCompanyKey = (owner: string, companyId: string): string => `player:${owner}:${companyId}`;
/** A company's key in the shared world's stakes: `${owner}:${companyId}`. */
export const stakeKey = (owner: string, companyId: string): string => `${owner}:${companyId}`;

/** Most shares one trade may move. */
export const MAX_SHARE_TRADE = COMMERCE.maxCorpShares;

/** What an empire publishes of its commerce: its tariffs, and its companies priced from their fleets. */
export function publicCommerceOf(
  c: CommerceState,
  loadouts: Readonly<Record<string, { readonly ships: ReadonlyArray<{ readonly classId: string; readonly count: number }> }>>,
  costOf: (classId: string) => Readonly<Partial<Record<Resource, number>>> | undefined,
): PublicCommerce {
  return {
    tariff: c.tariff, ...(c.tariffs && Object.keys(c.tariffs).length ? { tariffs: c.tariffs } : {}),
    companies: c.companies.map((x) => {
      const ships = loadouts[x.fleetId]?.ships ?? [];
      return { id: x.id, name: x.name, kind: x.kind, shares: x.shares, held: x.held, price: sharePrice(x, fleetValue(ships, costOf)), dividend: x.dividend, ships: ships.reduce((n, s) => n + s.count, 0) };
    }),
  };
}
