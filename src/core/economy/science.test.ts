import { describe, expect, it } from 'vitest';
import { BUILDINGS } from '../../content/buildings';
import { START_RESOURCES } from '../../content/resources';
import { SHARD_SOURCES } from '../../content/shardSources';
import { SHIP_CLASSES } from '../../content/shipClasses';
import { GOVERNMENTS, POLICIES, TENETS } from '../../content/society';
import { TECH_NODES } from '../../content/techTree';
import { TechTree } from '../research/TechTree';
import { EMPTY_RESEARCH, type ResearchState } from '../research/types';
import { resolveTurn, sciencePerTurn, type EconomyState, type EconomyTables } from './Economy';

const tree = new TechTree(TECH_NODES, SHARD_SOURCES);
const tables: EconomyTables = { tree, classes: SHIP_CLASSES, governments: GOVERNMENTS, policies: POLICIES, tenets: TENETS, alienTech: {}, buildings: BUILDINGS };
const econ = (focus: string | null): EconomyState => ({ stock: START_RESOURCES, roster: {}, government: 'council', policies: [], faith: null, spyNetworks: [], focus, colonies: [] });
const done = (...ids: string[]): ResearchState => ({ ...EMPTY_RESEARCH, researched: ids });

describe('science toward a focus', () => {
  it('goes to the next unfinished step when the focus cannot take shards yet (the owner\'s Colony Arks)', () => {
    // Colony Arks needs Orbital Drop Pods first: science goes there instead of being lost.
    const focus = 'u-colony-arks';
    const pods = tree.node(focus).requires[0];
    const research = done(...tree.node(pods).requires);
    expect(tree.canReceive(research, focus, 'science')).toBe(false);
    expect(tree.scienceTarget(research, focus)).toBe(pods);
    const r = resolveTurn(econ(focus), research, 1, tables);
    expect(tree.shardsOf(r.research, pods)).toBe(sciencePerTurn(econ(focus), tables, research));
    expect(r.report.lines.some((l) => l.includes('on the way to'))).toBe(true);
  });

  it('carries what a nearly full node cannot hold on to the next step, and full nodes research themselves', () => {
    const focus = 'u-colony-arks';
    const pods = tree.node(focus).requires[0];
    const base = done(...tree.node(pods).requires);
    // Pods one shard short: it fills, researches itself, and the rest flows into Colony Arks.
    const research = { ...base, shards: { [pods]: tree.node(pods).shards - 1 } };
    const r = resolveTurn(econ(focus), research, 1, tables);
    expect(r.research.researched).toContain(pods);
    expect(tree.shardsOf(r.research, focus)).toBe(sciencePerTurn(econ(focus), tables, research) - 1);
  });

  it('clears a finished focus and asks for a new one; leaves exclusive choices to the player', () => {
    const exclusive = TECH_NODES.find((n) => n.exclusiveGroup && !n.requires.length && !n.requiresAny?.length) ?? TECH_NODES.find((n) => n.exclusiveGroup)!;
    const ready = { ...done(...exclusive.requires), shards: { [exclusive.id]: exclusive.shards } };
    expect(tree.autoResearchable(ready)).not.toContain(exclusive.id);
    const plain = TECH_NODES.find((n) => !n.exclusiveGroup && !n.analogOf && !n.requires.length && !n.requiresAny?.length)!;
    const r = resolveTurn(econ(plain.id), { ...EMPTY_RESEARCH, shards: { [plain.id]: plain.shards - 1 } }, 1, tables);
    expect(r.research.researched).toContain(plain.id);
    expect(r.economy.focus).toBeNull();
    expect(r.report.lines.some((l) => l.includes('pick a new research focus'))).toBe(true);
  });
});
