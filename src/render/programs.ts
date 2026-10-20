import * as THREE from 'three';

/** three.js's program wrapper, as far as it is used here. */
export interface ThreeProgram {
  readonly program: WebGLProgram;
  getUniforms(): unknown;
  getAttributes(): unknown;
}

/**
 * Do now what three.js does the first time it draws with each program: check its log and read
 * back its uniforms and attributes, each a round trip to the GPU process that waits for it.
 */
export function primePrograms(programs: Iterable<ThreeProgram | undefined>): void {
  for (const p of programs) {
    try { p?.getUniforms(); p?.getAttributes(); } catch { /* drawn and checked on first use instead */ }
  }
}

/** The programs `root`'s materials were compiled to, for primePrograms. */
export function programsOf(renderer: THREE.WebGLRenderer, root: THREE.Object3D): ThreeProgram[] {
  const props = renderer.properties as unknown as { get(m: THREE.Material): { currentProgram?: ThreeProgram } };
  const out = new Set<ThreeProgram>();
  root.traverse((o) => {
    const m = (o as THREE.Mesh).material;
    if (!m) return;
    for (const mat of Array.isArray(m) ? m : [m]) {
      const p = props.get(mat).currentProgram;
      if (p) out.add(p);
    }
  });
  return [...out];
}
