import { describe, expect, it } from 'vitest';
import { SHARD_SOURCES } from './shardSources';
import { SHIP_CLASSES } from './shipClasses';
import { ALIEN_TECH, TECH_NODES } from './techTree';
import { TechTree } from '../core/research/TechTree';

describe('big tech tree', () => {
  const tree = new TechTree(TECH_NODES, SHARD_SOURCES);
  it('is structurally valid', () => expect(tree.validate()).toEqual([]));
  it('is large', () => expect(TECH_NODES.length).toBeGreaterThan(140));
  it('has unique ids', () => expect(new Set(TECH_NODES.map((n) => n.id)).size).toBe(TECH_NODES.length));
  it('every ship class unlock exists and grants it', () => {
    for (const c of SHIP_CLASSES) if (c.unlock) expect(tree.node(c.unlock).grants.some((g) => g.kind === 'chassis' && g.id === c.id), c.id).toBe(true);
    expect(SHIP_CLASSES.length).toBeGreaterThanOrEqual(25);
  });
  it('alien tech refers to real nodes', () => {
    for (const ids of Object.values(ALIEN_TECH)) ids.forEach((id) => expect(() => tree.node(id)).not.toThrow());
  });
});
