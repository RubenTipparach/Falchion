import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { HEX_SIZE, Hex, hexKey, hexSpiral, hexToWorld } from '../../core/hex/Hex';
import type { Flag } from '../../core/empire/Identity';
import { flagSvg } from '../flag';
import type { MapLayer, ViewState } from './MapLayer';
import { fade, fadeIn } from './ZoomModel';

export interface TerritoryClaim {
  /** Another player's id: their marker can be clicked (see onMarkerClick). */
  readonly id?: string;
  readonly name: string;
  readonly color: string;
  readonly kind: 'player' | 'other-player' | 'alien';
  readonly home: Hex;
  readonly colonies: ReadonlyArray<{ readonly hex: Hex; readonly radius: number }>;
  /** Shown on the name marker instead of the colour dot (validated flag parts only). */
  readonly flag?: Flag;
}

/** One set of claims drawn as hex fills and name markers. */
interface ClaimSet {
  readonly group: THREE.Group;
  readonly fills: THREE.Group;
  readonly markers: CSS2DObject[];
  readonly materials: THREE.MeshBasicMaterial[];
}

const HEX_GEO = new THREE.CircleGeometry(HEX_SIZE * 0.96, 6).rotateX(-Math.PI / 2);

/**
 * Filled hex territory for each empire, plus an always-visible name marker.
 * Fixed claims are drawn once; your own empire (setOwn), other players' claims (setDynamic)
 * and the NPC empires you know (setNpcs) are replaced whenever they change.
 */
export class TerritoryLayer implements MapLayer {
  readonly object3d = new THREE.Group();
  private readonly fixed: ClaimSet;
  private dynamic: ClaimSet | null = null;
  private npcs: ClaimSet | null = null;
  private own: ClaimSet | null = null;
  /** Called when the name marker of a claim with an id (another player) is clicked. */
  onMarkerClick: ((claim: TerritoryClaim) => void) | null = null;

  constructor(claims: readonly TerritoryClaim[]) {
    this.fixed = this.build(claims);
    this.object3d.add(this.fixed.group);
  }

  /** Replace the live claims (other players in the shared galaxy). */
  setDynamic(claims: readonly TerritoryClaim[]): void {
    this.dynamic = this.replace(this.dynamic, claims);
  }

  /** Replace the NPC empires' claims (the ones you know). */
  setNpcs(claims: readonly TerritoryClaim[]): void {
    this.npcs = this.replace(this.npcs, claims);
  }

  /** Replace your own empire's claim (it grows with colonies and takes your colours). */
  setOwn(claim: TerritoryClaim): void {
    this.own = this.replace(this.own, [claim]);
  }

  private replace(old: ClaimSet | null, claims: readonly TerritoryClaim[]): ClaimSet {
    if (old) {
      this.object3d.remove(old.group);
      this.release(old);
    }
    const set = this.build(claims);
    this.object3d.add(set.group);
    return set;
  }

  private build(claims: readonly TerritoryClaim[]): ClaimSet {
    const set: ClaimSet = { group: new THREE.Group(), fills: new THREE.Group(), markers: [], materials: [] };
    const m = new THREE.Matrix4();
    for (const claim of claims) {
      const cells = new Map<string, Hex>();
      for (const c of claim.colonies) for (const h of hexSpiral(c.hex, c.radius)) cells.set(hexKey(h), h);
      const mat = new THREE.MeshBasicMaterial({ color: claim.color, transparent: true, opacity: 0.2, depthWrite: false });
      set.materials.push(mat);
      const mesh = new THREE.InstancedMesh(HEX_GEO, mat, cells.size);
      [...cells.values()].forEach((h, i) => {
        const p = hexToWorld(h);
        mesh.setMatrixAt(i, m.makeTranslation(p.x, -0.01, p.z));
      });
      mesh.renderOrder = 0;
      set.fills.add(mesh);

      const el = document.createElement('div');
      el.className = `empire-marker ${claim.kind}`;
      const dot = document.createElement('span');
      if (claim.flag) {
        dot.className = 'flag-wrap';
        dot.innerHTML = flagSvg(claim.flag, 18); // built only from validated parts and #rrggbb colours
      } else {
        dot.className = 'dot';
        dot.style.background = claim.color;
      }
      el.append(dot, document.createTextNode(claim.name)); // player names are untrusted: no innerHTML
      if (claim.id) {
        el.classList.add('clickable');
        el.title = `${claim.name}: show in Players`;
        el.addEventListener('pointerdown', (e) => e.stopPropagation()); // a click here is not a map drag
        el.addEventListener('click', (e) => { e.stopPropagation(); this.onMarkerClick?.(claim); });
      }
      const marker = new CSS2DObject(el);
      const hp = hexToWorld(claim.home);
      marker.position.set(hp.x, 0, hp.z);
      set.markers.push(marker);
      set.group.add(marker);
    }
    set.group.add(set.fills);
    return set;
  }

  private release(set: ClaimSet): void {
    set.materials.forEach((mat) => mat.dispose());
    set.markers.forEach((mk) => mk.element.remove());
  }

  update(view: ViewState): void {
    const opacity = fade(view.visibleWidth, 600, 1_500) * fadeIn(view.visibleWidth, 4, 9);
    const showMarkers = view.visibleWidth > 80;
    for (const set of [this.fixed, this.own, this.dynamic]) {
      if (!set) continue;
      set.fills.visible = opacity > 0.01;
      set.materials.forEach((mat) => (mat.opacity = 0.2 * opacity));
      set.markers.forEach((mk) => (mk.visible = showMarkers));
    }
  }

  dispose(): void {
    this.release(this.fixed);
    if (this.dynamic) this.release(this.dynamic);
    if (this.own) this.release(this.own);
  }
}
