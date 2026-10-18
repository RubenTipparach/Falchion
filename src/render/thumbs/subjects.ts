import * as THREE from 'three';
import { BRANCHES, TECH_NODES } from '../../content/techTree';
import { PLANET_LOOKS } from '../../content/planetLooks';
import type { Resource } from '../../content/resources';
import { encodeDesign, normalizeDesign, type ShipDesign } from '../../core/ships/ShipDesign';
import { hashSeed } from '../../core/rng/Rng';
import type { ShipFactory } from '../ships/ShipFactory';
import { createPlanetMaterial } from '../planets/PlanetMaterial';
import { BUILDING_MODELS, capitolModel, type BuildingModel } from '../planets/surface/BuildingModels';
import { DOMAIN_PROPS, EVENT_PROPS, PART_PROPS, RESOURCE_PROPS, STAT_PROPS } from './props';
import { mat, prism, Prop } from './propKit';

export type ThumbKind = 'ship' | 'building' | 'resource' | 'event' | 'research';

/** What a thumbnail shows: a cache key (changes when the picture would) and how to build it. */
export interface ThumbSubject {
  readonly key: string;
  build(): THREE.Object3D;
}

/** What the subjects need from the game: the player's design for a class. */
export interface ThumbContext {
  readonly factory: ShipFactory;
  design(classId: string): ShipDesign;
}

type SubjectFn = (id: string, ctx: ThumbContext) => ThumbSubject | null;

/** One builder per kind (Open/Closed: a new kind is a new entry). */
export const THUMB_SUBJECTS: Readonly<Record<ThumbKind, SubjectFn>> = {
  ship: (id, ctx) => shipSubject(`ship:${id}`, ctx.design(id), ctx),
  building: (id) => {
    const builder = id === 'capitol' ? capitolModel : BUILDING_MODELS[id];
    return builder ? { key: `building:${id}`, build: () => onTile(buildingObject(builder())) } : null;
  },
  resource: (id) => {
    const b = RESOURCE_PROPS[id as Resource];
    return b ? { key: `resource:${id}`, build: b } : null;
  },
  event: (id) => {
    const b = EVENT_PROPS[id];
    return b ? { key: `event:${id}`, build: b } : null;
  },
  research: (id, ctx) => researchSubject(id, ctx),
};

/** A thumbnail subject, or null for an id the kind does not know. */
export function thumbSubject(kind: ThumbKind, id: string, ctx: ThumbContext): ThumbSubject | null {
  return THUMB_SUBJECTS[kind](id, ctx);
}

function shipSubject(prefix: string, design: ShipDesign, ctx: ThumbContext, plinth?: string): ThumbSubject {
  return {
    key: `${prefix}:${encodeDesign(design)}`,
    build: () => {
      const model = ctx.factory.create(design);
      model.animate(2);
      // Nose to the left, about 60 degrees across the line of sight, banked to show the top deck:
      // the hull's length and its plan both read.
      const bank = new THREE.Group(), g = new THREE.Group();
      model.group.rotation.z = -0.45;
      bank.add(model.group);
      bank.rotation.y = -0.4;
      g.add(bank);
      return plinth ? onPlinth(g, plinth) : g;
    },
  };
}

/**
 * A research node's picture comes from what it grants: a chassis is that ship, a style or trait a
 * ship in it, a part the part, a biome the planet, anything else its domain's emblem. It stands on
 * a plinth in its branch's colour.
 */
function researchSubject(id: string, ctx: ThumbContext): ThumbSubject | null {
  const node = TECH_NODES.find((n) => n.id === id);
  if (!node) return null;
  const color = BRANCHES.find((b) => b.id === node.branch)?.color ?? '#5ec8ff';
  const g = node.grants.find((x) => x.kind === 'chassis') ?? node.grants.find((x) => x.kind === 'style') ?? node.grants.find((x) => x.kind === 'trait')
    ?? node.grants.find((x) => x.kind === 'part' && partProp(x.id)) ?? node.grants.find((x) => x.kind === 'biome');
  const key = `research:${id}`;
  if (g?.kind === 'chassis') return shipSubject(key, ctx.design(g.id), ctx, color);
  if (g?.kind === 'style' || g?.kind === 'trait') {
    const base = ctx.design('lancer');
    const design = normalizeDesign(g.kind === 'style' ? { ...base, style: g.id, blend: [] } : { ...base, traits: [...base.traits, g.id] });
    return shipSubject(key, design, ctx, color);
  }
  if (g?.kind === 'part') return { key, build: () => onPlinth(partProp(g.id)!(), color) };
  if (g?.kind === 'biome') return { key, build: () => onPlinth(planet(g.id, id), color) };
  const stat = node.grants.map((x) => (x.kind === 'bonus' ? STAT_PROPS[x.stat] : undefined)).find(Boolean);
  if (stat) return { key, build: () => onPlinth(stat(), color) };
  const emblem = DOMAIN_PROPS[node.domain];
  return emblem ? { key, build: () => onPlinth(emblem(), color) } : null;
}

/** A part's prop: ship hardware, or the resource it unlocks (founding a faith shows faith). */
const partProp = (id: string) => PART_PROPS[id] ?? RESOURCE_PROPS[id as Resource];

/** Stand a subject on a hexagonal plinth with a glowing rim, sized to it. */
function onPlinth(subject: THREE.Object3D, color: string): THREE.Group {
  const box = new THREE.Box3().setFromObject(subject);
  const size = box.getSize(new THREE.Vector3());
  const r = Math.max(size.x, size.z) * 0.5, h = r * 0.16;
  const hex = (rad: number) => Array.from({ length: 6 }, (_, i) => [Math.cos((i / 6) * Math.PI * 2) * rad, Math.sin((i / 6) * Math.PI * 2) * rad] as [number, number]);
  const p = new Prop();
  p.add(prism(hex(r), h), mat('#1c2330'), { rx: -Math.PI / 2, y: -h / 2 });
  p.add(prism(hex(r * 1.04), h * 0.3), mat(color, 'emissive'), { rx: -Math.PI / 2, y: -h * 0.65 });
  p.add(prism(hex(r * 0.82), h * 0.2), mat('#2a3444'), { rx: -Math.PI / 2, y: h * 0.05 });
  const g = new THREE.Group();
  subject.position.y += h * 0.15 - box.min.y + r * 0.06;
  subject.position.x -= (box.min.x + box.max.x) / 2;
  subject.position.z -= (box.min.z + box.max.z) / 2;
  g.add(p.group, subject);
  return g;
}

/** A building on a round tile of ground, as it stands on the surface. */
function onTile(subject: THREE.Object3D): THREE.Group {
  const box = new THREE.Box3().setFromObject(subject);
  const size = box.getSize(new THREE.Vector3());
  const r = Math.max(size.x, size.z) * 0.56, h = r * 0.1;
  const tile = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.04, h, 24), mat('#46523e', 'matte'));
  tile.position.y = box.min.y - h / 2 + h * 0.02;
  const g = new THREE.Group();
  g.add(tile, subject);
  return g;
}

/**
 * The planet view's building model with a lit material: vertex colours, and the emission codes
 * (aEmit) as a glow, since a thumbnail has no night side.
 */
function buildingObject(m: BuildingModel): THREE.Group {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.7, metalness: 0.15 });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute float aEmit;\nvarying float vEmit;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEmit = aEmit;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vEmit;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vColor.rgb * (vEmit > 1.5 ? 1.1 : vEmit > 0.5 ? 0.35 : 0.0);');
  };
  const g = new THREE.Group();
  g.add(new THREE.Mesh(m.geo, material));
  if (m.ring) g.add(new THREE.Mesh(m.ring, material));
  return g;
}

/** A planet of a biome in the system view's shader, lit from the studio's key side. */
function planet(biome: string, seed: string): THREE.Mesh {
  const look = PLANET_LOOKS[biome] ?? PLANET_LOOKS.barren;
  const material = createPlanetMaterial(look, hashSeed(seed, 'surface'));
  material.uniforms.uStarPos.value.set(-6, 4, 2);
  material.uniforms.uTime.value = 5;
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.5, 48, 32), material);
  sphere.position.y = 0.5;
  return sphere;
}
