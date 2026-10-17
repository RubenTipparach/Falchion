import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { GameState } from '../../app/GameState';
import type { Store } from '../../app/Store';
import { RESOURCES, Resource } from '../../content/resources';
import { DOCTRINES, SHIP_CLASSES, ShipClassDef, ShipRole } from '../../content/shipClasses';
import { canAfford } from '../../core/economy/Economy';
import type { TechTree } from '../../core/research/TechTree';
import { DESIGN_LIMITS, ShipDesign, decodeDesign, encodeDesign } from '../../core/ships/ShipDesign';
import type { ShipFactory, ShipGeneratorRegistry, ShipTraitRegistry } from '../../render/ships/ShipFactory';
import type { ShipModel } from '../../render/ships/ShipKit';
import { Drawer } from '../Drawer';
import type { GameActions, GameQueries } from '../GameActions';
import { logisticsOf } from '../../content/logistics';
import { clear, fmt, h } from '../dom';
import { icon } from '../icons';

const PALETTES: Array<[string, string, string]> = [
  ['#b8c4d6', '#3a4a63', '#4fd1ff'], ['#e8e2d0', '#7a2e2e', '#ffb347'], ['#2b2f3a', '#11131a', '#ff3b6b'],
  ['#9fd8b0', '#2f5d48', '#d6ff6b'], ['#f2f2f2', '#c9a227', '#7ad7ff'], ['#7b5ea7', '#2a1e3d', '#ff9bf0'],
];

const ROLE_ORDER: Array<[ShipRole, string]> = [['mining', 'Mining'], ['logistics', 'Logistics'], ['combat', 'Combat'], ['capital', 'Capital ships']];

export interface ShipyardQueries {
  isUnlocked(c: ShipClassDef): boolean;
  designFor(classId: string): ShipDesign;
  effectiveDesign(classId?: string): ShipDesign;
  unlockedTraits(): string[];
  buildDiscount(): number;
}

/** Ship classes, building, and the procedural designer. */
export class ShipyardPanel extends Drawer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
  private readonly controls: OrbitControls;
  private readonly classesEl = h('div', { class: 'class-list' });
  private readonly infoEl = h('div', { class: 'class-info' });
  private readonly controlsEl = h('div', { class: 'ship-controls' });
  private model: ShipModel | null = null;
  private shownKey = '';
  private readonly clock = new THREE.Clock();
  private yard: string | undefined;

  constructor(
    private readonly store: Store<GameState>,
    private readonly actions: GameActions,
    private readonly game: GameQueries,
    private readonly factory: ShipFactory,
    private readonly styles: ShipGeneratorRegistry,
    private readonly traits: ShipTraitRegistry,
    private readonly tree: TechTree,
    private readonly q: ShipyardQueries,
  ) {
    super('shipyard', 'Shipyard', `${SHIP_CLASSES.length} ship classes. Every hull is generated from a short design code; research and role change how it looks.`, true);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    const preview = h('div', { class: 'ship-preview' });
    preview.append(this.renderer.domElement);
    this.body.append(h('div', { class: 'yard' }, this.classesEl, h('div', { class: 'yard-main' }, preview, this.infoEl, this.controlsEl)));
    this.scene.add(new THREE.HemisphereLight('#cfe3ff', '#1a1d26', 1.5));
    const key = new THREE.DirectionalLight('#fff4e0', 2.6);
    key.position.set(4, 6, 3);
    const rim = new THREE.DirectionalLight('#6fc8ff', 1.6);
    rim.position.set(-5, 2, -5);
    this.scene.add(key, rim);
    const grid = new THREE.PolarGridHelper(6, 16, 5, 64, '#24456a', '#142a44');
    grid.position.y = -1.6;
    this.scene.add(grid);
    this.camera.position.set(6, 3.2, 6);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 1.1;
    this.controls.enableDamping = true;
    store.subscribe((s, prev) => {
      if (!this.opened) return;
      if (s.designs !== prev.designs || s.shipyardClass !== prev.shipyardClass || s.empire.research !== prev.empire.research || s.hiddenTraits !== prev.hiddenTraits) this.refreshModel();
      if (s.shipyardClass !== prev.shipyardClass || s.empire !== prev.empire || s.economy.roster !== prev.economy.roster) { this.renderClasses(); this.renderInfo(); }
      const active = document.activeElement;
      const editing = active instanceof HTMLInputElement && this.controlsEl.contains(active) && (active.type === 'range' || active.type === 'color');
      if ((s.designs !== prev.designs || s.shipyardClass !== prev.shipyardClass || s.empire.research !== prev.empire.research || s.hiddenTraits !== prev.hiddenTraits) && !editing) this.renderControls();
    });
    this.renderer.setAnimationLoop(() => this.frame());
  }

  protected onOpen(): void {
    this.renderClasses();
    this.renderInfo();
    this.renderControls();
    this.refreshModel();
  }

  private frame(): void {
    if (!this.opened) return;
    const wrap = this.renderer.domElement.parentElement!;
    const w = wrap.clientWidth, hgt = wrap.clientHeight;
    if (w && this.renderer.domElement.width !== Math.floor(w * this.renderer.getPixelRatio())) {
      this.renderer.setSize(w, hgt);
      this.camera.aspect = w / hgt;
      this.camera.updateProjectionMatrix();
    }
    this.controls.update();
    this.model?.animate(this.clock.getElapsedTime());
    this.renderer.render(this.scene, this.camera);
  }

  private refreshModel(): void {
    const design = this.q.effectiveDesign();
    const key = encodeDesign(design);
    if (key === this.shownKey) return;
    this.shownKey = key;
    if (this.model) {
      this.scene.remove(this.model.group);
      this.model.dispose();
    }
    this.model = this.factory.create(design);
    this.scene.add(this.model.group);
    const sphere = new THREE.Box3().setFromObject(this.model.group).getBoundingSphere(new THREE.Sphere());
    this.controls.target.copy(sphere.center);
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    this.camera.position.copy(sphere.center).addScaledVector(dir, sphere.radius * 2.5);
  }

  private renderClasses(): void {
    const s = this.store.state;
    clear(this.classesEl);
    for (const [role, label] of ROLE_ORDER) {
      this.classesEl.append(h('h4', {}, label));
      for (const c of SHIP_CLASSES.filter((x) => x.role === role)) {
        const unlocked = this.q.isUnlocked(c);
        const n = s.economy.roster[c.id] ?? 0;
        this.classesEl.append(h('button', {
          class: `class-btn ${s.shipyardClass === c.id ? 'active' : ''} ${unlocked ? '' : 'locked'}`,
          style: `--doc:${DOCTRINES[c.doctrine].color}`,
          onclick: () => this.actions.selectClass(c.id),
        },
        h('span', { class: 'doc-dot' }),
        h('span', { class: 'cname' }, c.name),
        h('span', { class: 'ccount' }, unlocked ? (n ? `×${n}` : '') : icon('lock'))));
      }
    }
  }

  private renderInfo(): void {
    const s = this.store.state;
    const c = SHIP_CLASSES.find((x) => x.id === s.shipyardClass)!;
    const unlocked = this.q.isUnlocked(c);
    const discount = this.q.buildDiscount();
    const affordable = canAfford(s.empire.materials, c.cost, discount);
    const doc = DOCTRINES[c.doctrine];
    const costRow = Object.entries(c.cost).map(([r, n]) => {
      const def = RESOURCES.find((x) => x.id === r)!;
      const need = Math.ceil(n! * (1 - discount / 100));
      const short = s.empire.materials[r as Resource] < need;
      return h('span', { class: `cost ${short ? 'short' : ''}`, title: def.name }, h('i', { style: `background:${def.color}` }), `${fmt(need)} ${def.short}`);
    });
    clear(this.infoEl);
    this.infoEl.append(
      h('div', { class: 'ci-head' },
        h('div', {}, h('span', { class: 'eyebrow', style: `color:${doc.color}` }, c.mines ? `Mining · ${RESOURCES.find((r) => r.id === c.mines)!.name}` : doc.name), h('h3', {}, c.name)),
        h('span', { class: 'roster' }, `In service: ${s.economy.roster[c.id] ?? 0}`)),
      h('p', { class: 'muted' }, c.blurb, ' ', c.doctrine !== 'civilian' ? doc.summary : ''),
      h('div', { class: 'stat-row' },
        stat('Hull', c.hull), stat('Attack', c.attack), stat('Speed', `${c.speed} ly/turn`),
        c.troops ? stat('Troops', c.troops) : null,
        c.mines ? stat('Mines', `+${3} ${RESOURCES.find((r) => r.id === c.mines)!.short}/turn`) : null,
        stat('Supply', logisticsOf(c).supply), logisticsOf(c).ammo ? stat('Ammo', `${logisticsOf(c).ammo} (${logisticsOf(c).ammoUse}/battle)`) : null),
      c.doctrine !== 'civilian' && c.doctrine !== 'support' ? h('p', { class: 'small matchup' }, h('b', {}, 'Strong vs '), doc.strong, h('b', {}, '  ·  Weak vs '), doc.weak) : '',
      h('div', { class: 'build-row' },
        h('div', { class: 'costs' }, ...costRow, discount ? h('span', { class: 'muted small' }, `−${discount}% from research`) : null),
        unlocked
          ? h('div', { class: 'build-at' }, this.yardSelect(),
            h('button', { class: 'btn primary', disabled: !affordable || !this.game.yards().length, onclick: () => this.actions.buildShip(c.id, this.yard) }, affordable ? 'Build' : 'Not enough resources'))
          : h('span', { class: 'locked-note' }, icon('lock'), ` Research ${c.unlock ? this.tree.node(c.unlock).name : ''}`)),
    );
  }

  /** Ships are built at a colony with an Orbital Shipyard and start in that system. */
  private yardSelect(): HTMLElement {
    const yards = this.game.yards();
    if (!yards.length) return h('span', { class: 'small warn' }, 'No shipyard: build one on a colony');
    if (!yards.some((y) => y.planetId === this.yard)) this.yard = (yards.find((y) => y.capital) ?? yards[0]).planetId;
    const sel = h('select', { 'aria-label': 'Shipyard', title: 'Shipyard to build at' }, ...yards.map((y) => h('option', { value: y.planetId ?? '', selected: y.planetId === this.yard }, `at ${y.name}`))) as HTMLSelectElement;
    sel.addEventListener('change', () => { this.yard = sel.value; });
    return sel;
  }

  private set(patch: Partial<ShipDesign>): void {
    this.actions.setDesign({ ...this.q.designFor(this.store.state.shipyardClass), ...patch });
  }

  private renderControls(): void {
    const d = this.q.designFor(this.store.state.shipyardClass);
    clear(this.controlsEl);
    const styleBtns = this.styles.list().map((s) =>
      h('button', { class: `style-btn ${s.id === d.style ? 'active' : ''}`, title: s.description, onclick: () => this.set({ style: s.id }) }, s.name));
    const slider = (label: string, key: 'length' | 'bulk' | 'engines' | 'weapons', step: number) => {
      const [min, max] = DESIGN_LIMITS[key];
      const input = h('input', { type: 'range', min, max, step, value: d[key], id: `ship-${key}` }) as HTMLInputElement;
      const out = h('output', {}, String(d[key]));
      input.addEventListener('input', () => {
        out.textContent = input.value;
        this.set({ [key]: Number(input.value) } as Partial<ShipDesign>);
      });
      return h('label', { class: 'slider' }, h('span', {}, label), input, out);
    };
    const color = (label: string, key: 'primary' | 'secondary' | 'accent') => {
      const input = h('input', { type: 'color', value: d.colors[key], id: `ship-color-${key}` }) as HTMLInputElement;
      input.addEventListener('input', () => this.set({ colors: { ...this.q.designFor(this.store.state.shipyardClass).colors, [key]: input.value } }));
      return h('label', { class: 'swatch' }, input, h('span', {}, label));
    };
    const unlocked = this.q.unlockedTraits();
    const traitChips = this.traits.list().filter((t) => !t.id.startsWith('role-')).map((t) => {
      const has = unlocked.includes(t.id);
      const on = has && !this.store.state.hiddenTraits.includes(t.id);
      return h('button', { class: `trait ${has ? (on ? 'on' : 'off') : 'locked'}`, disabled: !has, title: has ? 'Show or hide this researched trait' : 'Unlock through research', onclick: () => this.actions.toggleTrait(t.id) }, t.name);
    });
    const code = h('input', { class: 'code', value: encodeDesign(d), spellcheck: false, id: 'ship-code', 'aria-label': 'Design code' }) as HTMLInputElement;
    this.controlsEl.append(
      h('div', { class: 'ctl-group' }, h('h4', {}, 'Style'), h('div', { class: 'style-grid' }, ...styleBtns)),
      h('div', { class: 'ctl-group' }, h('h4', {}, 'Shape'),
        h('div', { class: 'row' }, h('span', { class: 'muted small mono' }, `seed ${d.seed}`), h('button', { class: 'btn', onclick: () => this.set({ seed: (Math.random() * 2 ** 31) >>> 0 }) }, icon('dice'), ' Randomise')),
        slider('Length', 'length', 0.05), slider('Bulk', 'bulk', 0.05), slider('Engines', 'engines', 1), slider('Weapons', 'weapons', 1)),
      h('div', { class: 'ctl-group' }, h('h4', {}, 'Colours'),
        h('div', { class: 'row' }, color('Primary', 'primary'), color('Secondary', 'secondary'), color('Accent', 'accent')),
        h('div', { class: 'palettes' }, ...PALETTES.map(([p, s, a]) =>
          h('button', { class: 'palette', 'aria-label': 'Apply palette', style: `background:linear-gradient(90deg,${p} 0 50%,${s} 50% 80%,${a} 80%)`, onclick: () => this.set({ colors: { primary: p, secondary: s, accent: a } }) })))),
      h('div', { class: 'ctl-group' }, h('h4', {}, 'Research traits'), h('div', { class: 'traits' }, ...traitChips)),
      h('div', { class: 'ctl-group' }, h('h4', {}, 'Share code'),
        h('div', { class: 'row' }, code,
          h('button', { class: 'btn', onclick: () => { navigator.clipboard?.writeText(code.value).catch(() => code.select()); } }, icon('copy'), ' Copy'),
          h('button', { class: 'btn', onclick: () => { try { this.actions.setDesign(decodeDesign(code.value)); } catch { code.classList.add('invalid'); } } }, 'Load'))),
    );
  }
}

function stat(label: string, value: string | number): HTMLElement {
  return h('div', { class: 'stat-box' }, h('span', {}, label), h('b', {}, String(value)));
}
