import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { GameState } from '../../app/GameState';
import type { Store } from '../../app/Store';
import { DESIGN_LIMITS, ShipDesign, decodeDesign, encodeDesign } from '../../core/ships/ShipDesign';
import type { ShipFactory, ShipGeneratorRegistry, ShipTraitRegistry } from '../../render/ships/ShipFactory';
import type { ShipModel } from '../../render/ships/ShipKit';
import { Drawer } from '../Drawer';
import type { GameActions } from '../GameActions';
import { clear, h } from '../dom';

const PALETTES: Array<[string, string, string]> = [
  ['#b8c4d6', '#3a4a63', '#4fd1ff'], ['#e8e2d0', '#7a2e2e', '#ffb347'], ['#2b2f3a', '#11131a', '#ff3b6b'],
  ['#9fd8b0', '#2f5d48', '#d6ff6b'], ['#f2f2f2', '#c9a227', '#7ad7ff'], ['#7b5ea7', '#2a1e3d', '#ff9bf0'],
];

/** Simple ship designer: style, seed, proportions, palette, parts; live 3D preview. */
export class ShipyardPanel extends Drawer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
  private readonly controls: OrbitControls;
  private readonly controlsEl = h('div', { class: 'ship-controls' });
  private model: ShipModel | null = null;
  private shownKey = '';
  private readonly clock = new THREE.Clock();

  constructor(
    private readonly store: Store<GameState>,
    private readonly actions: GameActions,
    private readonly factory: ShipFactory,
    private readonly styles: ShipGeneratorRegistry,
    private readonly traits: ShipTraitRegistry,
    private readonly unlockedTraits: () => string[],
    private readonly effectiveDesign: () => ShipDesign,
  ) {
    super('shipyard', 'Shipyard', 'Every ship is procedurally generated from a tiny design code.');
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    const canvasWrap = h('div', { class: 'ship-preview' });
    canvasWrap.append(this.renderer.domElement);
    this.body.append(canvasWrap, this.controlsEl);
    this.scene.add(new THREE.HemisphereLight('#cfe3ff', '#20242e', 1.6));
    const key = new THREE.DirectionalLight('#ffffff', 2.5);
    key.position.set(4, 6, 3);
    const rim = new THREE.DirectionalLight('#6fa8ff', 1.5);
    rim.position.set(-4, 2, -5);
    this.scene.add(key, rim);
    const grid = new THREE.PolarGridHelper(6, 12, 6, 64, '#1d3352', '#132238');
    grid.position.y = -1.6;
    this.scene.add(grid);
    this.camera.position.set(6, 3.5, 6);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 1.2;
    this.controls.enableDamping = true;
    store.subscribe((s, prev) => {
      if (s.design !== prev.design || s.empire.research !== prev.empire.research || s.hiddenTraits !== prev.hiddenTraits) {
        this.refreshModel();
        // Don't rebuild controls under an active slider/colour drag.
        const active = document.activeElement;
        const editing = active instanceof HTMLInputElement && this.controlsEl.contains(active) && (active.type === 'range' || active.type === 'color');
        if (this.opened && !editing) this.renderControls();
      }
    });
    this.renderer.setAnimationLoop(() => this.frame());
  }

  protected onOpen(): void {
    this.renderControls();
    this.refreshModel();
  }

  private frame(): void {
    if (!this.opened) return;
    const wrap = this.renderer.domElement.parentElement!;
    const w = wrap.clientWidth, hgt = wrap.clientHeight;
    if (this.renderer.domElement.width !== Math.floor(w * this.renderer.getPixelRatio())) {
      this.renderer.setSize(w, hgt);
      this.camera.aspect = w / hgt;
      this.camera.updateProjectionMatrix();
    }
    this.controls.update();
    this.model?.animate(this.clock.getElapsedTime());
    this.renderer.render(this.scene, this.camera);
  }

  private refreshModel(): void {
    const design = this.effectiveDesign();
    const key = encodeDesign(design);
    if (key === this.shownKey) return;
    this.shownKey = key;
    if (this.model) {
      this.scene.remove(this.model.group);
      this.model.dispose();
    }
    this.model = this.factory.create(design);
    this.scene.add(this.model.group);
    // Frame the ship: keep the view direction, set distance from its size.
    const sphere = new THREE.Box3().setFromObject(this.model.group).getBoundingSphere(new THREE.Sphere());
    this.controls.target.copy(sphere.center);
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    this.camera.position.copy(sphere.center).addScaledVector(dir, sphere.radius * 2.6);
  }

  private set(patch: Partial<ShipDesign>): void {
    this.actions.setDesign({ ...this.store.state.design, ...patch });
  }

  private renderControls(): void {
    const d = this.store.state.design;
    clear(this.controlsEl);
    const styleBtns = this.styles.list().map((s) =>
      h('button', { class: `style-btn ${s.id === d.style ? 'active' : ''}`, title: s.description, onclick: () => this.set({ style: s.id }) }, s.name));
    const slider = (label: string, key: 'length' | 'bulk' | 'engines' | 'weapons', step: number) => {
      const [min, max] = DESIGN_LIMITS[key];
      const input = h('input', { type: 'range', min, max, step, value: d[key] }) as HTMLInputElement;
      const out = h('output', {}, String(d[key]));
      input.addEventListener('input', () => {
        out.textContent = input.value;
        this.set({ [key]: Number(input.value) } as Partial<ShipDesign>);
      });
      return h('label', { class: 'slider' }, h('span', {}, label), input, out);
    };
    const color = (label: string, key: 'primary' | 'secondary' | 'accent') => {
      const input = h('input', { type: 'color', value: d.colors[key] }) as HTMLInputElement;
      input.addEventListener('input', () => this.set({ colors: { ...this.store.state.design.colors, [key]: input.value } }));
      return h('label', { class: 'swatch' }, input, h('span', {}, label));
    };
    const unlocked = this.unlockedTraits();
    const traitChips = this.traits.list().map((t) => {
      const has = unlocked.includes(t.id);
      const on = has && !this.store.state.hiddenTraits.includes(t.id);
      return h('button', {
        class: `trait ${has ? (on ? 'on' : 'off') : 'locked'}`, disabled: !has,
        title: has ? 'Toggle this researched trait on your ships' : 'Unlock through research',
        onclick: () => this.actions.toggleTrait(t.id),
      }, has ? '' : '🔒 ', t.name);
    });
    const code = h('input', { class: 'code', value: encodeDesign(d), spellcheck: false }) as HTMLInputElement;
    this.controlsEl.append(
      h('h4', {}, 'Style'), h('div', { class: 'style-grid' }, ...styleBtns),
      h('div', { class: 'row' },
        h('label', { class: 'name' }, h('span', {}, 'Name'), (() => {
          const i = h('input', { value: d.name, maxlength: 24 }) as HTMLInputElement;
          i.addEventListener('change', () => this.set({ name: i.value || 'Unnamed' }));
          return i;
        })()),
        h('button', { class: 'btn primary', onclick: () => this.set({ seed: (Math.random() * 2 ** 31) >>> 0 }) }, '🎲 Randomise'),
        h('span', { class: 'muted small' }, `seed ${d.seed}`)),
      h('h4', {}, 'Shape'), slider('Length', 'length', 0.05), slider('Bulk', 'bulk', 0.05), slider('Engines', 'engines', 1), slider('Weapons', 'weapons', 1),
      h('h4', {}, 'Colours'),
      h('div', { class: 'row' }, color('Primary', 'primary'), color('Secondary', 'secondary'), color('Accent', 'accent')),
      h('div', { class: 'palettes' }, ...PALETTES.map(([p, s, a]) =>
        h('button', { class: 'palette', style: `background:linear-gradient(90deg,${p} 0 50%,${s} 50% 80%,${a} 80%)`, onclick: () => this.set({ colors: { primary: p, secondary: s, accent: a } }) }))),
      h('h4', {}, 'Research traits ', h('span', { class: 'muted small' }, '— ships evolve as you research')),
      h('div', { class: 'traits' }, ...traitChips),
      h('h4', {}, 'Share code'),
      h('div', { class: 'row' }, code,
        h('button', { class: 'btn', onclick: () => navigator.clipboard?.writeText(code.value) }, 'Copy'),
        h('button', { class: 'btn', onclick: () => {
          try { this.actions.setDesign(decodeDesign(code.value)); } catch { code.classList.add('invalid'); }
        } }, 'Load')),
    );
  }
}
