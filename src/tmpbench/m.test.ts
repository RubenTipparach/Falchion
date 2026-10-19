import { it } from 'vitest';
import { GalaxyModel } from '../core/galaxy/GalaxyModel';
it('m', () => {
  const g = new GalaxyModel();
  const t = performance.now();
  const sites = g.megastructures();
  const counts: Record<string, number> = {};
  for (const s of sites) counts[s.type] = (counts[s.type] ?? 0) + 1;
  console.log('MEGA', sites.length, (performance.now() - t).toFixed(0) + 'ms', JSON.stringify(counts));
});
