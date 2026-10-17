import { describe, expect, it } from 'vitest';
import { GalaxyModel } from '../galaxy/GalaxyModel';
import { applyEffects, EMPTY_WORLD } from '../world/SharedWorld';
import { initialNpcState, spawnNpcs } from './NpcCatalog';
import { stepNpcs } from './NpcSim';
import { marketFactor, standingOf, tierOf } from './Reputation';

const galaxy = new GalaxyModel();
const home = { q: -14697, r: 20078 };

describe('reputation', () => {
  it('reads as tiers and sets market prices', () => {
    expect(tierOf(-80).name).toBe('Hostile');
    expect(tierOf(-30).name).toBe('Unfriendly');
    expect(tierOf(0).name).toBe('Neutral');
    expect(tierOf(30).name).toBe('Cordial');
    expect(tierOf(60).name).toBe('Allied');
    expect(marketFactor(100)).toBe(1.5);
    expect(marketFactor(0)).toBe(1);
    expect(marketFactor(-100)).toBe(0.75);
  });

  const def = spawnNpcs(galaxy, home)[0];
  const base = def.archetype.disposition;
  const met = (standing: number) => applyEffects(EMPTY_WORLD, [
    { kind: 'discover', npc: initialNpcState(def, 1_000), by: 'p1' },
    { kind: 'standing', npc: def.id, player: 'p1', delta: standing - base, base },
  ]);

  it('is clamped, and drifts a point every five years back toward the faction’s nature', () => {
    const w = applyEffects(met(base), [{ kind: 'standing', npc: def.id, player: 'p1', delta: 500, base }]);
    expect(standingOf(w.npcs[def.id], 'p1', base)).toBe(100);
    const later = stepNpcs({ ...met(base + 20), tick: 1_000 }, 1_025, galaxy, []).world;
    expect(standingOf(later.npcs[def.id], 'p1', base)).toBe(base + 15);
  });

  it('friendly factions do not raid you; hostile ones do', () => {
    const players = [{ player: 'p1', targets: [{ hex: home, what: 'colony' as const }] }];
    const run = (standing: number) => {
      let w = { ...met(standing), tick: 1_000 };
      let raids = 0;
      for (let y = 1_001; y <= 1_150; y++) {
        // Hold the standing where it is (no drift) to compare.
        w = applyEffects(w, [{ kind: 'standing', npc: def.id, player: 'p1', delta: standing - standingOf(w.npcs[def.id], 'p1', base), base }]);
        const r = stepNpcs(w, y, galaxy, players);
        w = r.world;
        raids += r.raids.length;
      }
      return raids;
    };
    expect(run(40)).toBe(0);
    expect(run(-80)).toBeGreaterThan(0);
  });
});
