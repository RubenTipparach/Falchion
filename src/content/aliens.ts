import type { PlanetTarget, Side } from '../core/combat/Combat';

export interface AlienTarget {
  readonly id: string;
  readonly owner: string;
  readonly kind: 'fleet' | 'planet';
  readonly name: string;
  readonly blurb: string;
  /** Where it sits, as a fraction of the way from your home to its owner's home. */
  readonly reach: number;
  readonly fleet?: Side;
  readonly planet?: PlanetTarget;
}

const vosskBonuses = { short: 3, capture: 2, hull: 1 };
const krellBonuses = { barrage: 3, suppression: 2 };

export const ALIEN_TARGETS: readonly AlienTarget[] = [
  { id: 'vossk-raiders', reach: 0.15, owner: 'Vossk Hegemony', kind: 'fleet', name: 'Vossk Raider Pack', blurb: 'Brawlers and boarders. Keep them at range.',
    fleet: { name: 'Vossk Raiders', bonuses: vosskBonuses, ships: [{ classId: 'brawler', count: 4 }, { classId: 'boarding-corvette', count: 2 }, { classId: 'interceptor', count: 3 }] } },
  { id: 'krell-swarm', reach: 0.06, owner: 'Krell Swarm', kind: 'fleet', name: 'Krell Missile Swarm', blurb: 'Massed barrage behind jammers. Bring flak.',
    fleet: { name: 'Krell Swarm', bonuses: krellBonuses, ships: [{ classId: 'missile-barge', count: 6 }, { classId: 'swarm-carrier', count: 2 }, { classId: 'jammer', count: 1 }] } },
  { id: 'vossk-outpost', reach: 0.45, owner: 'Vossk Hegemony', kind: 'planet', name: 'Ixal Outpost', blurb: 'A Vossk mining world. Light garrison.',
    planet: { name: 'Ixal Outpost', defense: 260, troops: 30, garrison: { name: 'Ixal Guard', bonuses: vosskBonuses, ships: [{ classId: 'brawler', count: 2 }] } } },
  { id: 'krell-hive', reach: 0.12, owner: 'Krell Swarm', kind: 'planet', name: 'Krell Brood World', blurb: 'Fortified hive world. Siege ships required.',
    planet: { name: 'Krell Brood World', defense: 900, troops: 80, garrison: { name: 'Brood Guard', bonuses: krellBonuses, ships: [{ classId: 'missile-barge', count: 4 }, { classId: 'flak-picket', count: 3 }] } } },
];
