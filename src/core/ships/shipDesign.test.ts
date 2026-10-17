import { describe, expect, it } from 'vitest';
import { DEFAULT_DESIGN, decodeDesign, encodeDesign, normalizeDesign } from './ShipDesign';

describe('ShipDesign', () => {
  it('round-trips through a share code', () => {
    const d = normalizeDesign({ ...DEFAULT_DESIGN, name: 'Ström ✦', style: 'organic', seed: 987654, length: 1.4, traits: ['hive-mind', 'shields'] });
    expect(decodeDesign(encodeDesign(d))).toEqual(d);
  });

  it('clamps out-of-range values', () => {
    const d = normalizeDesign({ ...DEFAULT_DESIGN, engines: 99, length: 0.1, weapons: -3 });
    expect(d.engines).toBe(6);
    expect(d.length).toBe(0.5);
    expect(d.weapons).toBe(0);
  });

  it('rejects garbage codes', () => {
    expect(() => decodeDesign('bm90LWEtZGVzaWdu')).toThrow();
  });
});
