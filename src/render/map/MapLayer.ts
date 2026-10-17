import type * as THREE from 'three';

/** Everything a layer needs to decide what to draw this frame. */
export interface ViewState {
  readonly camera: THREE.PerspectiveCamera;
  readonly altitude: number;
  readonly focus: { readonly x: number; readonly z: number };
  /** Approximate world width (ly) visible at the focus. */
  readonly visibleWidth: number;
  readonly galaxyMode: boolean;
  readonly viewportHeight: number;
  readonly time: number;
  /** Floating origin: absolute galaxy position the scene is rendered relative to. */
  readonly origin: { readonly x: number; readonly z: number };
}

/** A self-contained map overlay. Layers choose their own visibility from ViewState. */
export interface MapLayer {
  readonly object3d: THREE.Object3D;
  update(view: ViewState): void;
  /** Optional offscreen work before the frame is drawn (e.g. a low-resolution pass). */
  prerender?(renderer: THREE.WebGLRenderer, camera: THREE.Camera): void;
  dispose(): void;
}

export class LayerStack {
  private readonly layers: MapLayer[] = [];

  constructor(private readonly root: THREE.Object3D) {}

  add<T extends MapLayer>(layer: T): T {
    this.layers.push(layer);
    this.root.add(layer.object3d);
    return layer;
  }

  update(view: ViewState): void {
    for (const l of this.layers) l.update(view);
  }

  prerender(renderer: THREE.WebGLRenderer, camera: THREE.Camera): void {
    for (const l of this.layers) l.prerender?.(renderer, camera);
  }

  dispose(): void {
    for (const l of this.layers) {
      this.root.remove(l.object3d);
      l.dispose();
    }
    this.layers.length = 0;
  }
}
