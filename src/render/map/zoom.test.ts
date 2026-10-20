import { describe, expect, it } from 'vitest';
import { DEFAULT_ZOOM, ZoomModel, fade } from './ZoomModel';

describe('ZoomModel', () => {
  it('one step scales altitude by the same factor at any altitude', () => {
    const near = new ZoomModel(DEFAULT_ZOOM, 20);
    const far = new ZoomModel(DEFAULT_ZOOM, 20_000);
    const before = [near.targetAltitude, far.targetAltitude];
    near.wheel(100);
    far.wheel(100);
    expect(near.targetAltitude / before[0]).toBeCloseTo(far.targetAltitude / before[1], 8);
  });

  it('clamps to limits', () => {
    const z = new ZoomModel();
    z.wheel(1e6);
    expect(z.targetAltitude).toBeCloseTo(DEFAULT_ZOOM.maxAltitude);
    z.wheel(-1e7);
    expect(z.targetAltitude).toBeCloseTo(DEFAULT_ZOOM.minAltitude);
  });

  it('toggle switches between hex and galaxy presets', () => {
    const z = new ZoomModel();
    expect(z.isGalaxyMode).toBe(false);
    z.toggle();
    expect(z.isGalaxyMode).toBe(true);
    z.toggle();
    expect(z.targetAltitude).toBeCloseTo(DEFAULT_ZOOM.hexPreset);
  });

  it('a floor lets the zoom go below the minimum', () => {
    const z = new ZoomModel();
    z.setFloor(0.001);
    z.setTargetAltitude(0.002);
    expect(z.targetAltitude).toBeCloseTo(0.002, 8);
    z.wheel(-1e7);
    expect(z.targetAltitude).toBeCloseTo(0.001, 8);
    expect(z.floor).toBeCloseTo(0.001, 8);
    // Lifting the floor eases the view back up to the map's minimum.
    z.setFloor(null);
    expect(z.targetAltitude).toBeCloseTo(DEFAULT_ZOOM.minAltitude, 8);
    expect(z.floor).toBeCloseTo(DEFAULT_ZOOM.minAltitude, 8);
  });

  it('fade is 1 below full and 0 above zero', () => {
    expect(fade(10, 100, 200)).toBe(1);
    expect(fade(300, 100, 200)).toBe(0);
    expect(fade(150, 100, 200)).toBeCloseTo(0.5);
  });
});
