import type { ShipClassDef } from '../../content/shipClasses';
import { hashSeed } from '../rng/Rng';
import { normalizeDesign, type ShipDesign } from './ShipDesign';

/** The trait that marks each doctrine's role on a hull (weapons, pods, menders' arms...). */
export const ROLE_TRAIT: Partial<Record<string, string>> = {
  long: 'role-long', short: 'role-short', barrage: 'role-barrage', siege: 'role-siege', suppression: 'role-suppression',
  capture: 'role-capture', assault: 'role-assault', support: 'role-support',
};

/**
 * A ship class in another empire's look: its style, colours and research traits from one of
 * their designs, the class's own proportions and role. (Their per-class designs are private.)
 */
export function classDesign(base: ShipDesign, c: ShipClassDef): ShipDesign {
  const traits = base.traits.filter((t) => !t.startsWith('role-'));
  const role = c.mines ? 'role-mining' : ROLE_TRAIT[c.doctrine];
  if (role) traits.push(role);
  if (c.role === 'capital') traits.push('role-capital');
  return normalizeDesign({
    ...base, name: c.name, seed: hashSeed(base.seed, c.id) % 100_000,
    length: c.look.length, bulk: c.look.bulk, engines: c.look.engines, weapons: c.look.weapons, traits,
  });
}
