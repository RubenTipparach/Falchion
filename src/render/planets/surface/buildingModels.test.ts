import { describe, expect, it } from 'vitest';
import { BUILDINGS } from '../../../content/buildings';
import { orientation } from '../../geometry/orientation';
import { BUILDING_MODELS, capitolModel } from './BuildingModels';

describe('surface building models', () => {
  it('every building has a model that faces outward', () => {
    for (const b of BUILDINGS) {
      const build = BUILDING_MODELS[b.id];
      expect(build, `model for ${b.id}`).toBeTypeOf('function');
      const m = build();
      expect(m.geo.getAttribute('position').count).toBeGreaterThan(0);
      expect(m.geo.getAttribute('aEmit')).toBeDefined();
      expect(orientation(m.geo).outward, b.id).toBeGreaterThan(0);
      expect(m.top).toBeGreaterThan(0);
      if (m.ring) expect(orientation(m.ring).outward).toBeGreaterThan(0);
    }
    expect(orientation(capitolModel().geo).outward).toBeGreaterThan(0);
    expect(BUILDING_MODELS.manufactory().stacks?.length).toBeGreaterThan(0);
    expect(BUILDING_MODELS.shipyard().ring).toBeDefined();
  });
});
