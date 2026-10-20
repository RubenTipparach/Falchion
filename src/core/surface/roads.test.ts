import { describe, expect, it } from 'vitest';
import { PLANET_LOOKS } from '../../content/planetLooks';
import { hashSeed } from '../rng/Rng';
import { nightLights } from './NightLights';
import { MAX_BRIDGE, ROAD_STEP, Road, polylineLength, resample, roadNetwork, treeDistance } from './Roads';
import { SettlementInput, SurfaceLayout, surfaceLayout } from './SurfaceLayout';
import { Vec3, distance, isLand, normalize, rawHeight, surfaceLookOf } from './Terrain';

const lookOf = (id: string, biome: string) => surfaceLookOf(PLANET_LOOKS[biome], hashSeed(id, 'surface'));
const big: SettlementInput = { owner: 'own', name: 'Ricasso', capital: true, size: 5, buildings: ['farm', 'mine', 'lab', 'warehouse', 'trade-hub'], pop: 12 };
const WORLDS = [['12,4/0', 'terran'], ['5,9/1', 'ocean'], ['8,2/0', 'jungle'], ['7,7/0', 'desert'], ['9,9/1', 'toxic']] as const;
const layouts = new Map<string, { look: ReturnType<typeof lookOf>; layout: SurfaceLayout }>();
const layoutOf = (id: string, biome: string) => {
  if (!layouts.has(id)) {
    const look = lookOf(id, biome);
    layouts.set(id, { look, layout: surfaceLayout(id, look, big) });
  }
  return layouts.get(id)!;
};

/** Which settlements can be reached from `from` along the roads. */
function reachable(n: number, roads: readonly Road[], from: number): Set<number> {
  const seen = new Set([from]);
  const stack = [from];
  while (stack.length) {
    const u = stack.pop()!;
    for (const r of roads) {
      const v = r.from === u ? r.to : r.to === u ? r.from : -1;
      if (v >= 0 && !seen.has(v)) { seen.add(v); stack.push(v); }
    }
  }
  expect([...seen].every((i) => i < n)).toBe(true);
  return seen;
}

describe('road network', () => {
  it('roads are deterministic', () => {
    const { look, layout } = layoutOf('12,4/0', 'terran');
    expect(roadNetwork(look, layout.settlements, 99)).toEqual(roadNetwork(look, layout.settlements, 99));
    expect(surfaceLayout('12,4/0', look, big).roads).toEqual(layout.roads);
    expect(layout.roads.length).toBeGreaterThan(0);
  });

  it('every settlement on the main city\'s land is reachable', () => {
    for (const [id, biome] of WORLDS) {
      const { look, layout } = layoutOf(id, biome);
      const n = layout.settlements.length;
      const linked = reachable(n, layout.roads, 0);
      // A settlement left off the network sits across open water from every other one.
      for (let i = 0; i < n; i++) {
        if (linked.has(i)) continue;
        const s = layout.settlements[i];
        for (const j of linked) {
          const o = layout.settlements[j];
          let wet = 0;
          for (let k = 1; k < 20; k++) {
            const t = k / 20;
            const d = normalize([s.dir[0] + (o.dir[0] - s.dir[0]) * t, s.dir[1] + (o.dir[1] - s.dir[1]) * t, s.dir[2] + (o.dir[2] - s.dir[2]) * t]);
            if (!isLand(look, rawHeight(look, ...d, 5))) wet++;
          }
          expect(wet).toBeGreaterThan(0);
        }
      }
      // Trunk roads form a forest: never more than n - 1 of them, and no road joins a pair twice.
      expect(layout.roads.filter((r) => r.trunk).length).toBeLessThanOrEqual(n - 1);
      expect(new Set(layout.roads.map((r) => `${r.from}:${r.to}`)).size).toBe(layout.roads.length);
    }
    // A dry world has no water in the way: every settlement is on the network.
    const desert = layoutOf('7,7/0', 'desert').layout;
    expect(reachable(desert.settlements.length, desert.roads, 0).size).toBe(desert.settlements.length);
  });

  it('roads mostly run over land and bridge only short straits', () => {
    for (const [id, biome] of WORLDS) {
      const { layout } = layoutOf(id, biome);
      for (const r of layout.roads) {
        const wet = r.bridge.filter(Boolean).length;
        expect(wet / r.bridge.length).toBeLessThan(0.5);
        let run = 0, longest = 0;
        for (const b of r.bridge) { run = b ? run + 1 : 0; longest = Math.max(longest, run); }
        // The router's grid and the drawn road sample the coast differently: allow a little slack.
        expect(longest * ROAD_STEP).toBeLessThan(MAX_BRIDGE * 2);
      }
    }
  });

  it('roads run from the edge of one settlement to the edge of the other', () => {
    const { layout } = layoutOf('8,2/0', 'jungle');
    for (const r of layout.roads) {
      const a = layout.settlements[r.from], b = layout.settlements[r.to];
      const p0 = r.path[0], p1 = r.path[r.path.length - 1];
      expect(distance(p0, a.dir)).toBeLessThan(a.radius * 1.2);
      expect(distance(p1, b.dir)).toBeLessThan(b.radius * 1.2);
      expect(distance(p0, a.dir)).toBeGreaterThan(a.radius * 0.5);
      // Evenly spaced points on the unit sphere.
      for (let i = 1; i < r.path.length; i++) expect(distance(r.path[i - 1], r.path[i])).toBeLessThan(ROAD_STEP * 1.6);
      for (const p of r.path) expect(Math.hypot(...p)).toBeCloseTo(1, 9);
      expect(r.bridge.length).toBe(r.path.length);
    }
  });

  it('extra links shorten detours', () => {
    const { layout } = layoutOf('12,4/0', 'terran');
    const extras = layout.roads.filter((r) => !r.trunk);
    const trunks = layout.roads.filter((r) => r.trunk);
    const adj = layout.settlements.map(() => [] as Array<{ to: number; len: number }>);
    for (const r of trunks) {
      const len = polylineLength(r.path);
      adj[r.from].push({ to: r.to, len });
      adj[r.to].push({ to: r.from, len });
    }
    for (const r of extras) {
      const a = layout.settlements[r.from], b = layout.settlements[r.to];
      expect(treeDistance(adj, r.from, r.to)).toBeGreaterThan(distance(a.dir, b.dir) * 1.5);
    }
    expect(extras.length).toBeLessThanOrEqual(Math.max(1, Math.round(layout.settlements.length / 5)));
  });

  it('unsettled and single-city worlds have no roads', () => {
    const look = lookOf('4,4/3', 'barren');
    expect(surfaceLayout('4,4/3', look, null).roads).toEqual([]);
    expect(surfaceLayout('2,5/0', lookOf('2,5/0', 'jungle'), { owner: 'foreign', name: 'Krell', capital: false, size: 3, buildings: [], pop: 1 }).roads).toEqual([]);
  });

  it('resample keeps the ends and spaces points evenly', () => {
    const pts: Vec3[] = [[1, 0, 0], normalize([1, 0.05, 0]), normalize([1, 0.05, 0.05])];
    const out = resample(pts, 0.01);
    expect(out[0]).toEqual(pts[0]);
    expect(out[out.length - 1]).toEqual(pts[2]);
    for (let i = 1; i < out.length; i++) expect(distance(out[i - 1], out[i])).toBeLessThan(0.0125);
  });
});

describe('night lights', () => {
  it('lights follow the settlements and roads', () => {
    const { layout } = layoutOf('12,4/0', 'terran');
    const spots = nightLights(layout);
    expect(spots.length).toBeGreaterThan(layout.settlements.length);
    // One glow per settlement, at its centre, brighter for bigger places.
    layout.settlements.forEach((s, i) => expect(spots[i].dir).toEqual(s.dir));
    expect(spots[0].power).toBeGreaterThan(spots[layout.settlements.length - 1].power);
    // Every other spot lies on a road.
    const roadPts = layout.roads.flatMap((r) => r.path);
    for (const s of spots.slice(layout.settlements.length)) expect(roadPts.some((p) => p === s.dir)).toBe(true);
    for (const s of spots) expect(s.power).toBeLessThanOrEqual(1);
    expect(nightLights({ settlements: [], roads: [] })).toEqual([]);
  });
});
