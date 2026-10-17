import { describe, expect, it } from 'vitest';
import { hex, worldToHex } from '../hex/Hex';
import { addressOf, formatAddress } from './GalacticAddress';

describe('galactic address', () => {
  it('core hex is in the core ring', () => {
    const a = addressOf(hex(0, 0));
    expect(a.ring).toBe(0);
    expect(formatAddress(a)).toContain('Core');
  });

  it('12,000 ly in the first quadrant is Alpha, ring 2', () => {
    const a = addressOf(worldToHex(12_000 * Math.cos(0.5), -12_000 * Math.sin(0.5)));
    expect(a.quadrant).toBe('Alpha');
    expect(a.ring).toBe(2);
    expect(a.cell).toBeGreaterThanOrEqual(0);
    expect(a.cell).toBeLessThan(a.cellsInRing);
  });

  it('assigns the four quadrants by angle', () => {
    const at = (deg: number) => {
      const t = (deg * Math.PI) / 180;
      return addressOf(worldToHex(9_000 * Math.cos(t), -9_000 * Math.sin(t))).quadrant;
    };
    expect([at(45), at(135), at(225), at(315)]).toEqual(['Alpha', 'Beta', 'Gamma', 'Delta']);
  });
});
