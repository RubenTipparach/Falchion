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
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: !lite, stencil: true, ...(lite ? { powerPreference: 'high-performance' as const } : {}) });
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

  /** Pixels of the view's bottom edge covered by a panel (a phone's bottom sheet), read each frame. */
  private bottomInset: (() => number) | null = null;
  private insetShown = 0;

  /**
   * Keep what the camera looks at centred in the part of the screen a panel leaves open: the
   * projection's centre moves up by half the covered height (an off-axis view, so nothing is
   * scaled and picking still lines up).
   */
  setBottomInset(fn: (() => number) | null): void {
    this.bottomInset = fn;
  }

  private applyInset(dt: number): void {
    const want = this.bottomInset?.() ?? 0;
    if (Math.abs(want - this.insetShown) < 0.5 && (want !== 0 || this.insetShown === 0)) return;
    this.insetShown += (want - this.insetShown) * Math.min(1, dt * 10);
    if (Math.abs(want - this.insetShown) < 0.5) this.insetShown = want;
    this.offsetCamera();
  }

  private offsetCamera(): void {
    const { clientWidth: w, clientHeight: h } = this.opts.container;
    if (this.insetShown < 0.5) this.camera.clearViewOffset();
    else this.camera.setViewOffset(w, h, 0, this.insetShown / 2, w, h);
  }

  private readonly frame = (): void => {
    const dt = Math.min(0.1, this.clock.getDelta());
    this.applyInset(dt);
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
    // A close-up that drives the view (a planet's surface) puts the map camera at its viewpoint.
    this.layers.poseCamera(this.camera);
    this.opts.onFrame?.(view, dt);
    // A layer whose own view fills the screen (a planet's surface) replaces the map: skip drawing it, hide its labels.
    const covered = this.layers.covered();
    if (!covered) {
      this.layers.prerender(this.renderer, this.camera);
      this.renderer.render(this.scene, this.camera);
    }
    this.world.visible = !covered;
    this.labelRenderer.render(this.scene, this.camera);
    this.world.visible = true;
    this.layers.overlay(this.renderer, this.labelRenderer, this.camera);
  };

  private readonly resize = (): void => {
    const { clientWidth: w, clientHeight: h } = this.opts.container;
    this.camera.aspect = w / Math.max(1, h);
    this.offsetCamera();
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.labelRenderer.setSize(w, h);
  };
}
