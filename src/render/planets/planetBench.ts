import * as THREE from 'three';
import { PLANET_LOOKS } from '../../content/planetLooks';
import { hashSeed } from '../../core/rng/Rng';
import { surfaceLookOf } from '../../core/surface/Terrain';
import { FULL_QUALITY, SurfaceTerrain } from './surface/SurfaceTerrain';
import { Flora } from './surface/Flora';
import { rnd } from './surface/floraCells';

/**
 * Surface frame-time bench (tools/planets/bench.html, `npm run planets:bench`): for each planet
 * type, the close-up's frame time at the audit's close and ground poses, with and without flora,
 * and how long the globe takes to bake. Each frame is waited on (a one-pixel read), so the time is
 * the GPU's as well as the CPU's. Headless Chromium draws on the CPU (SwiftShader): compare runs
 * with each other, not with a real GPU. Results land on `window.BENCH`.
 */
const SUN = new THREE.Vector3(1, 0.25, 0.35).normalize();
const FRAMES = 6;

export async function planetBench(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const ids = (params.get('ids') ?? 'terran,jungle,bones,barren').split(',');
  const px = Number(params.get('px')) || 640;
  const renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.setPixelRatio(1);
  renderer.setSize(px, Math.round(px * 0.6), false);
  document.body.append(renderer.domElement);
  const gl = renderer.getContext();
  const pixel = new Uint8Array(4);
  const camera = new THREE.PerspectiveCamera(45, 1 / 0.6, 0.01, 100);
  const out: Record<string, Record<string, number>> = { hash: { mismatches: hashParity(renderer) } };
  for (const id of ids) {
    const look = surfaceLookOf(PLANET_LOOKS[id] ?? PLANET_LOOKS.barren, hashSeed(`audit:${id}`, 'surface'));
    const t0 = performance.now();
    const terrain = new SurfaceTerrain(look, [], FULL_QUALITY, null);
    let longest = 0;
    for (;;) {
      const a = performance.now();
      const done = terrain.bakeStep();
      longest = Math.max(longest, performance.now() - a);
      if (done) break;
      await new Promise((r) => setTimeout(r, 0));
    }
    const bake = performance.now() - t0;
    const flora = new Flora(id, terrain, false);
    const scene = new THREE.Scene();
    scene.add(terrain.group, flora.group);
    const ground = (d: THREE.Vector3) => terrain.surfaceRadius(d.clone().normalize());
    const Q = SUN.clone().multiplyScalar(0.57).add(new THREE.Vector3(0, 0.15, 1).projectOnPlane(SUN).normalize().multiplyScalar(0.82)).normalize();
    const tQ = SUN.clone().negate().projectOnPlane(Q).normalize();
    const rq = ground(Q);
    const time = async (height: number, ahead: number, withFlora: boolean): Promise<number> => {
      const cam = Q.clone().multiplyScalar(rq + height);
      const a = Q.clone().add(tQ.clone().multiplyScalar(ahead)).normalize();
      const target = a.clone().multiplyScalar(ground(a));
      camera.position.copy(cam);
      camera.up.copy(Q);
      camera.lookAt(target);
      camera.near = Math.max(0.00004, Math.min(height * 0.2, 0.5));
      camera.far = Math.sqrt(Math.max(cam.lengthSq() - 1, 0)) + 1.3;
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      const d = cam.distanceTo(target);
      const times: number[] = [];
      for (let i = 0; i < FRAMES; i++) {
        terrain.update({ cam: camera.position, focus: target, d, alt: height, sun: SUN, time: i * 0.1, fade: 1 });
        flora.update(withFlora ? d : 99, renderer);
        const s = performance.now();
        renderer.render(scene, camera);
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        times.push(performance.now() - s);
        await new Promise((r) => setTimeout(r, 0));
      }
      times.sort((x, y) => x - y);
      return Math.round(times[times.length >> 1]);
    };
    out[id] = {
      bakeMs: Math.round(bake), longestBakeStepMs: Math.round(longest),
      closeFlora: await time(0.006, 0.05, true), closeBare: await time(0.006, 0.05, false),
      groundFlora: await time(0.0012, 0.008, true), groundBare: await time(0.0012, 0.008, false),
    };
    console.log(id, JSON.stringify(out[id]));
    flora.dispose();
    terrain.dispose();
  }
  (window as unknown as { BENCH: unknown }).BENCH = out;
}

/** The flora hash on the GPU against floraCells.rnd on the CPU, over 16x16 cells with negative ones: how many differ. */
function hashParity(renderer: THREE.WebGLRenderer): number {
  const target = new THREE.WebGLRenderTarget(16, 16, { type: THREE.FloatType, depthBuffer: false });
  const mat = new THREE.ShaderMaterial({
    vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `
uvec3 pcg3(uvec3 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  v ^= v >> 16u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  return v;
}
float rnd(uvec3 k, uint i) { return float(pcg3(k + uvec3(i * 7919u, i * 104729u, i * 31u)).x & 0xffffffu) / 16777216.0; }
void main() {
  vec2 c = floor(gl_FragCoord.xy) - 8.0 + vec2(1200.0, -2300.0);
  uvec3 key = uvec3(ivec3(int(c.x), int(c.y), 3 * 977 + 11));
  gl_FragColor = vec4(rnd(key, 1u), rnd(key, 4u), rnd(key, 6u), 1.0);
}`,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  quad.frustumCulled = false;
  renderer.setRenderTarget(target);
  renderer.render(quad, new THREE.Camera());
  const px = new Float32Array(16 * 16 * 4);
  renderer.readRenderTargetPixels(target, 0, 0, 16, 16, px);
  renderer.setRenderTarget(null);
  let bad = 0;
  for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) {
    const cx = i - 8 + 1200, cy = j - 8 - 2300, o = (j * 16 + i) * 4;
    const want = [1, 4, 6].map((r) => rnd(cx >>> 0, cy >>> 0, 3 * 977 + 11, r));
    if (want.some((w, k) => Math.abs(w - px[o + k]) > 1e-6)) bad++;
  }
  target.dispose(); mat.dispose(); quad.geometry.dispose();
  return bad;
}
