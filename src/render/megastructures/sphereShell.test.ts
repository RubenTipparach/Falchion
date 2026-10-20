import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SHELL_ANCHOR, SHELL_DETAIL, SHELL_MISSING, shellCell, shellKept } from './sphereShell';

describe('Dyson sphere plates', () => {
  // three.js's own shell: every triangle's centre is one plate, each plate once.
  const geo = new THREE.IcosahedronGeometry(1, SHELL_DETAIL);
  const pos = geo.getAttribute('position');
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const cells: string[] = [];
  for (let k = 0; k < pos.count; k += 3) {
    a.fromBufferAttribute(pos, k); b.fromBufferAttribute(pos, k + 1); c.fromBufferAttribute(pos, k + 2);
    const cell = shellCell(a.add(b).add(c).normalize());
    cells.push(`${cell.face}:${cell.i}:${cell.j}:${cell.up}`);
  }

  it('finds every triangle of the geometry its own plate', () => {
    expect(cells.length).toBe(20 * (SHELL_DETAIL + 1) ** 2);
    expect(new Set(cells).size).toBe(cells.length);
  });

  it('leaves out about the share it should, never the landing site', () => {
    const missing = cells.filter((key) => {
      const [face, i, j, up] = key.split(':').map(Number);
      return !shellKept({ face, i, j, up }, 12345);
    }).length;
    expect(missing / cells.length).toBeGreaterThan(SHELL_MISSING * 0.5);
    expect(missing / cells.length).toBeLessThan(SHELL_MISSING * 1.6);
    for (let seed = 0; seed < 50; seed++) expect(shellKept(SHELL_ANCHOR, seed)).toBe(true);
  });
});
