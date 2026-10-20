import * as THREE from 'three';

/**
 * The one thumbnail studio (the `thumbnails` skill): an offscreen renderer with a fixed
 * three-quarter camera and a key, fill and rim light, framing any model by its bounds. Pictures
 * are cached as data URLs; requests for new ones are rendered a few per frame.
 */
export class ThumbStudio {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(30, 1, 0.01, 100);
  private readonly cache = new Map<string, string>();
  private readonly queue = new Map<string, { build: () => THREE.Object3D; done: Array<(url: string) => void> }>();
  private scheduled = false;
  /** From the front right, about 25 degrees above the horizon. */
  static readonly VIEW = new THREE.Vector3(0.62, 0.48, 0.78).normalize();

  constructor(px = 160, private readonly perFrameMs = 10) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(px, px, false);
    this.renderer.setClearColor(0x000000, 0);
    this.scene.add(new THREE.HemisphereLight('#cfe3ff', '#1a1d26', 1.4));
    const key = new THREE.DirectionalLight('#fff4e0', 2.8);
    key.position.set(-3, 6, 5);
    const rim = new THREE.DirectionalLight('#6fc8ff', 2.0);
    rim.position.set(2, 3, -6);
    const fill = new THREE.DirectionalLight('#ffd9b0', 0.6);
    fill.position.set(6, 1, 2);
    this.scene.add(key, rim, fill);
  }

  /** The cached picture for a key, if it has been rendered. */
  cached(key: string): string | undefined {
    return this.cache.get(key);
  }

  /** The picture now if cached; otherwise queue it and call `done` when it is rendered. */
  request(key: string, build: () => THREE.Object3D, done: (url: string) => void): string | undefined {
    const hit = this.cache.get(key);
    if (hit) return hit;
    const q = this.queue.get(key);
    if (q) q.done.push(done);
    else this.queue.set(key, { build, done: [done] });
    this.schedule();
    return undefined;
  }

  /** Render a model now and return its picture (used by the queue and the contact sheet). */
  render(object: THREE.Object3D): string {
    this.scene.add(object);
    object.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(object);
    const center = box.getCenter(new THREE.Vector3());
    this.frame(box, center);
    this.renderer.render(this.scene, this.camera);
    const url = this.renderer.domElement.toDataURL('image/png');
    this.scene.remove(object);
    dispose(object);
    return url;
  }

  /**
   * Fit a box in the lens from the studio's direction: the tightest distance at which every
   * corner is inside the frame (a long hull fills the tile instead of a sphere around it).
   */
  private frame(box: THREE.Box3, center: THREE.Vector3): void {
    const view = ThumbStudio.VIEW;
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), view).normalize();
    const up = new THREE.Vector3().crossVectors(view, right);
    const t = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * 0.9;
    let dist = 1e-6, depth = 1e-6;
    const c = new THREE.Vector3();
    for (let i = 0; i < 8; i++) {
      c.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).sub(center);
      const z = c.dot(view);
      dist = Math.max(dist, Math.abs(c.dot(right)) / t + z, Math.abs(c.dot(up)) / t + z);
      depth = Math.max(depth, c.length());
    }
    this.camera.position.copy(center).addScaledVector(view, dist);
    this.camera.near = Math.max(dist - depth * 1.2, dist * 0.01);
    this.camera.far = dist + depth * 1.2;
    this.camera.lookAt(center);
    this.camera.updateProjectionMatrix();
  }

  private schedule(): void {
    if (this.scheduled) return;
    this.scheduled = true;
    requestAnimationFrame(() => this.drain());
  }

  private drain(): void {
    this.scheduled = false;
    const start = performance.now();
    for (const [key, job] of this.queue) {
      this.queue.delete(key);
      let url = '';
      try {
        url = this.render(job.build());
      } catch (err) {
        console.warn('thumbnail failed', key, err);
      }
      this.cache.set(key, url);
      for (const d of job.done) d(url);
      if (performance.now() - start > this.perFrameMs) break;
    }
    if (this.queue.size) this.schedule();
  }
}

function dispose(root: THREE.Object3D): void {
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    o.geometry.dispose();
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose();
  });
}
