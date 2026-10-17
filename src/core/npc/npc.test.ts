import { describe, expect, it } from 'vitest';
import { GalaxyModel } from '../galaxy/GalaxyModel';
import { hexDistance } from '../hex/Hex';
import { applyEffects, EMPTY_WORLD } from '../world/SharedWorld';
import { allGridNpcs, gridNpcsNear, initialNpcState, npcById, RAID_RANGE, spawnNpcs } from './NpcCatalog';
import { npcArrival, stepNpcs } from './NpcSim';

const galaxy = new GalaxyModel();
const home = { q: -14697, r: 20078 };

describe('the NPC catalogue', () => {
  it('holds a few hundred NPCs across the galaxy, stronger toward the core', () => {
    const all = allGridNpcs(galaxy);
    expect(all.length).toBeGreaterThan(150);
    expect(all.length).toBeLessThan(600);
    const r = (d: (typeof all)[number]) => Math.hypot(d.home.position.x, d.home.position.z);
    const inner = all.filter((d) => r(d) < 10_000), outer = all.filter((d) => r(d) > 25_000);
    const avg = (xs: typeof all) => xs.reduce((n, d) => n + d.tier, 0) / Math.max(1, xs.length);
    expect(avg(inner)).toBeGreaterThan(avg(outer));
  });

  it('puts two or three NPCs 25–100 ly from every home, the same every time', () => {
    const a = spawnNpcs(galaxy, home), b = spawnNpcs(galaxy, home);
    expect(a.map((d) => d.id)).toEqual(b.map((d) => d.id));
    expect(a.length).toBeGreaterThanOrEqual(2);
    expect(a.length).toBeLessThanOrEqual(3);
    for (const d of a) {
      const dist = hexDistance(d.home.hex, home);
      expect(dist).toBeGreaterThan(8);
      expect(dist).toBeLessThan(110);
      expect(d.spawn).toBe(true);
      expect(d.tier).toBeLessThanOrEqual(2);
    }
  });

  it('regenerates any NPC from its id alone', () => {
    const spawn = spawnNpcs(galaxy, home)[0];
    expect(npcById(galaxy, spawn.id)).toEqual(spawn);
    const grid = allGridNpcs(galaxy)[10];
    expect(npcById(galaxy, grid.id)).toEqual(grid);
    expect(gridNpcsNear(galaxy, grid.home.hex, 5).map((d) => d.id)).toContain(grid.id);
    expect(npcById(galaxy, 'nonsense')).toBeNull();
  });
});

describe('NPC empires once discovered', () => {
  const def = spawnNpcs(galaxy, home)[0];
  const discovered = (year: number) => applyEffects(EMPTY_WORLD, [{ kind: 'discover', npc: initialNpcState(def, year), by: 'p1' }]);

  it('only discovered NPCs are simulated', () => {
    const r = stepNpcs(EMPTY_WORLD, 100, galaxy, [{ player: 'p1', targets: [{ hex: home, what: 'colony' }] }]);
    expect(r.world.npcs).toEqual({});
    expect(r.raids).toEqual([]);
  });

  it('raid the empires that know them, strike, and go home; the same way every time', () => {
    const start = { ...discovered(1_000), tick: 1_000 };
    const players = [{ player: 'p1', targets: [{ hex: home, what: 'colony' as const }] }];
    const run = () => {
      let w = start;
      const raids = [];
      for (let y = 1_001; y <= 1_400; y++) {
        const r = stepNpcs(w, y, galaxy, players);
        w = r.world;
        raids.push(...r.raids);
      }
      return { w, raids };
    };
    const a = run(), b = run();
    expect(a).toEqual(b);
    expect(a.raids.length).toBeGreaterThan(0);
    const raid = a.raids[0];
    expect(raid.player).toBe('p1');
    expect(raid.at).toEqual(home);
    expect(raid.ships.length).toBeGreaterThan(0);
    expect(hexDistance(def.home.hex, home)).toBeLessThanOrEqual(RAID_RANGE);
    // More raiders get built over time, up to tier + 1 fleets.
    expect(a.w.npcs[def.id].fleets.length).toBeGreaterThan(1);
    expect(a.w.npcs[def.id].fleets.length).toBeLessThanOrEqual(def.tier + 1);
    for (const f of a.w.npcs[def.id].fleets) expect(npcArrival(f)).toBeGreaterThanOrEqual(f.depart);
  });

  it('leave empires that do not know them alone', () => {
    const r = stepNpcs({ ...discovered(1_000), tick: 1_000 }, 1_300, galaxy, [{ player: 'stranger', targets: [{ hex: home, what: 'colony' }] }]);
    expect(r.raids).toEqual([]);
  });
});
