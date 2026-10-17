import * as THREE from 'three';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { LayerStack, ViewState } from './MapLayer';
import { MapCameraController } from './MapCameraController';
import { ZoomModel } from './ZoomModel';

export interface MapViewOptions {
  readonly container: HTMLElement;
  readonly galaxyRadius: number;
  readonly onClick: (world: THREE.Vector3, ray: THREE.Raycaster) => void;
  readonly onHover: (world: THREE.Vector3 | null, ray: THREE.Raycaster) => void;
  /** Right-click without dragging (RTS move order). */
  readonly onRightClick?: (world: THREE.Vector3, ray: THREE.Raycaster) => void;
  readonly onFrame?: (view: ViewState, dt: number) => void;
  /** Phones and tablets: lighter rendering (see the constructor). */
  readonly lite?: boolean;
}

/** Owns the renderer, scene, camera and layer stack; runs the frame loop. */
export class MapView {
  readonly scene = new THREE.Scene();
  /** Everything in absolute galaxy coordinates hangs here, offset by -origin (floating origin). */
  readonly world = new THREE.Group();
  readonly camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
  readonly layers: LayerStack;
  readonly controller: MapCameraController;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly labelRenderer = new CSS2DRenderer();
  private readonly clock = new THREE.Clock();
  private lastView: ViewState | null = null;

  constructor(private readonly opts: MapViewOptions) {
    // stencil: the selected ship masks itself so its outline is drawn only around its silhouette.
    // Phones (lite): no kept drawing buffer, and at most 1.5 device pixels per CSS pixel.
    const lite = opts.lite ?? false;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: !lite, stencil: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(lite ? 1.5 : 2, window.devicePixelRatio));
    this.renderer.setClearColor('#03060d');
    opts.container.appendChild(this.renderer.domElement);
    this.labelRenderer.domElement.className = 'label-layer';
    opts.container.appendChild(this.labelRenderer.domElement);

    this.scene.add(new THREE.AmbientLight('#8899bb', 1.2));
    const sun = new THREE.DirectionalLight('#ffffff', 2.2);
    sun.position.set(1, 2, 1.5);
    this.scene.add(sun);

    this.scene.add(this.world);
    this.layers = new LayerStack(this.world);
    this.controller = new MapCameraController(
      this.camera, this.renderer.domElement, new ZoomModel(), opts.galaxyRadius, opts.onClick, opts.onHover,
      (origin) => {
        this.world.position.set(-origin.x, 0, -origin.z);
        this.world.updateMatrixWorld(true);
      },
    );
    this.controller.onRightClick = opts.onRightClick ?? null;
    window.addEventListener('resize', this.resize);
    this.resize();
  }

  get canvas(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  viewportWidth(): number {
    return this.opts.container.clientWidth;
  }

  get view(): ViewState | null {
    return this.lastView;
  }

  start(): void {
    this.renderer.setAnimationLoop(this.frame);
  }

  private readonly frame = (): void => {
    const dt = Math.min(0.1, this.clock.getDelta());
    this.controller.update(dt);
    const view: ViewState = {
      camera: this.camera,
      altitude: this.controller.zoom.altitude,
      focus: { x: this.controller.focus.x, z: this.controller.focus.y },
      visibleWidth: this.controller.visibleWidth(),
      galaxyMode: this.controller.zoom.isGalaxyMode,
      viewportHeight: this.renderer.domElement.clientHeight * this.renderer.getPixelRatio(),
      time: this.clock.elapsedTime,
      origin: { x: this.controller.origin.x, z: this.controller.origin.z },
    };
    this.lastView = view;
    this.layers.update(view);
    this.controller.refollow();
    this.opts.onFrame?.(view, dt);
    this.layers.prerender(this.renderer, this.camera);
    this.renderer.render(this.scene, this.camera);
    this.labelRenderer.render(this.scene, this.camera);
  };

  private readonly resize = (): void => {
    const { clientWidth: w, clientHeight: h } = this.opts.container;
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.labelRenderer.setSize(w, h);
  };
}
