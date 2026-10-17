import type { EmpireState, Material } from '../empire/Empire';
import type { Planet } from '../galaxy/Planets';
import type { TechTree } from '../research/TechTree';
import { Rng, hashSeed } from '../rng/Rng';
import type { Card, EncounterKindDef, EncounterResult, LootCrate, Rarity } from './types';

export interface LootTables {
  readonly kinds: readonly EncounterKindDef[];
  readonly species: readonly string[];
  readonly rarityWeights: ReadonlyArray<readonly [Rarity, number]>;
  readonly rarityMultiplier: Readonly<Record<Rarity, number>>;
  readonly chassis: readonly string[];
  readonly parts: readonly string[];
}

const MATERIALS: readonly Material[] = ['metals', 'crystals', 'volatiles', 'ice', 'rareEarths', 'exotics', 'credits'];
const RARITY_ORDER: readonly Rarity[] = ['common', 'rare', 'epic', 'legendary'];

/** Deterministic encounter resolution: (seed, planet, empire) -> result. Pure. */
export class EncounterResolver {
  constructor(private readonly tables: LootTables, private readonly tree: TechTree) {}

  resolve(galaxySeed: number, planet: Planet, empire: EmpireState): EncounterResult {
    const rng = new Rng(hashSeed(galaxySeed, 'encounter', planet.id));
    const kind = rng.weighted(this.tables.kinds.map((k) => [k, k.weight] as const));
    const alien = rng.pick(this.tables.species);
    const narrative = rng.pick(kind.flavour).replace('{alien}', alien).replace('{planet}', planet.name);

    const successChance = clamp(kind.baseSuccess + (empire.fleetPower - kind.difficulty) * kind.powerScaling, 0.05, 0.95);
    const success = rng.fork('outcome').next() < successChance;

    if (!success) {
      return {
        planetId: planet.id, kind: kind.id, success, successChance, narrative, crate: null,
        cost: { fleetPower: Math.max(1, Math.round(kind.difficulty / 4)), description: kind.failureCost.replace('{alien}', alien) },
      };
    }
    return { planetId: planet.id, kind: kind.id, success, successChance, narrative, cost: null, crate: this.rollCrate(rng.fork('crate'), kind, empire) };
  }

  private rollCrate(rng: Rng, kind: EncounterKindDef, empire: EmpireState): LootCrate {
    const n = rng.int(kind.cardsOnSuccess[0], kind.cardsOnSuccess[1]);
    const cards = Array.from({ length: n }, (_, i) => this.rollCard(rng.fork(i), kind, empire));
    const tier = cards.reduce<Rarity>((best, c) => (RARITY_ORDER.indexOf(c.rarity) > RARITY_ORDER.indexOf(best) ? c.rarity : best), 'common');
    return { tier, cards };
  }

  private rollCard(rng: Rng, kind: EncounterKindDef, empire: EmpireState): Card {
    const rarity = rng.weighted(this.tables.rarityWeights);
    const mult = this.tables.rarityMultiplier[rarity];
    const type = rng.weighted(Object.entries(kind.cardWeights) as Array<[Card['type'], number]>);
    switch (type) {
      case 'shards': {
        // Loot can carry shards of any unresearched node, even in other branches.
        const candidates = this.tree.nodes.filter((n) => !empire.research.researched.includes(n.id)).map((n) => n.id).sort();
        if (candidates.length === 0) return { type: 'materials', rarity, material: 'credits', amount: 100 * mult };
        return { type: 'shards', rarity, nodeId: rng.pick(candidates), amount: rng.int(2, 6) * mult };
      }
      case 'chassis':
        return { type: 'chassis', rarity, id: rng.pick(this.tables.chassis) };
      case 'part':
        return { type: 'part', rarity, id: rng.pick(this.tables.parts) };
      case 'materials':
        return { type: 'materials', rarity, material: rng.pick(MATERIALS), amount: rng.int(20, 60) * mult };
    }
  }
}

/** Applies a crate's cards to an empire. Pure. */
export function applyCrate(empire: EmpireState, crate: LootCrate, tree: TechTree): EmpireState {
  return crate.cards.reduce((e, card) => applyCard(e, card, tree), empire);
}

export function applyCard(e: EmpireState, card: Card, tree: TechTree): EmpireState {
  switch (card.type) {
    case 'shards':
      return { ...e, research: tree.grantShards(e.research, card.nodeId, 'loot', card.amount) };
    case 'chassis':
      return e.chassis.includes(card.id) ? e : { ...e, chassis: [...e.chassis, card.id] };
    case 'part':
      return e.parts.includes(card.id) ? e : { ...e, parts: [...e.parts, card.id] };
    case 'materials':
      return { ...e, materials: { ...e.materials, [card.material]: e.materials[card.material] + card.amount } };
  }
}

export function applyCost(e: EmpireState, result: EncounterResult): EmpireState {
  return result.cost ? { ...e, fleetPower: Math.max(1, e.fleetPower - result.cost.fleetPower) } : e;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
