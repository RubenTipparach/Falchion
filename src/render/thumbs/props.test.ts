import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BIOMES } from '../../content/biomes';
import { BUILDINGS } from '../../content/buildings';
import { ENCOUNTER_KINDS, LOOT_PARTS } from '../../content/encounters';
import { RESOURCES, type Resource } from '../../content/resources';
import { SHIP_CLASSES } from '../../content/shipClasses';
import { DOMAINS, TECH_NODES } from '../../content/techTree';
import { classDesign } from '../../core/ships/ClassDesign';
import { DEFAULT_DESIGN } from '../../core/ships/ShipDesign';
import { isSolid, orientation } from '../geometry/orientation';
import { createDefaultShipFactory } from '../ships/defaultRegistries';
import { DOMAIN_PROPS, PART_PROPS, RESOURCE_PROPS } from './props';
import { BUILDING_ART } from './buildings/art';
import { NODE_PROP_FILES, NODE_PROPS } from './nodes';
import { SHIP_ART, SHIP_ART_FILES, SHIP_ART_GROUPS } from './ships';
import { showsUnlock, thumbSubject, type ThumbContext, type ThumbKind } from './subjects';

const { factory } = createDefaultShipFactory();
const byId = new Map(SHIP_CLASSES.map((c) => [c.id, c]));
const ctx: ThumbContext = { factory, design: (id) => classDesign(DEFAULT_DESIGN, byId.get(id)!) };

const ALL: [ThumbKind, readonly { id: string }[]][] = [
  ['resource', RESOURCES], ['event', ENCOUNTER_KINDS], ['planet', BIOMES], ['building', [...BUILDINGS, { id: 'capitol' }]], ['ship', SHIP_CLASSES], ['research', TECH_NODES],
];

describe('thumbnails', () => {
  it('has a subject for every resource, encounter kind, building, ship class and research node', () => {
    for (const [kind, items] of ALL) for (const it of items) expect(thumbSubject(kind, it.id, ctx), `${kind} ${it.id}`).not.toBeNull();
    for (const d of DOMAINS) expect(DOMAIN_PROPS[d.id], d.id).toBeDefined();
    const parts = new Set([...LOOT_PARTS, ...TECH_NODES.flatMap((n) => n.grants.filter((g) => g.kind === 'part').map((g) => (g as { id: string }).id))]);
    // Parts with a namespace (gov:hive) are unlocks, not hardware: their node shows the domain emblem.
    for (const p of [...parts].filter((x) => !x.includes(':'))) expect(PART_PROPS[p] ?? RESOURCE_PROPS[p as Resource], p).toBeDefined();
  });

  it('builds every prop with its solid parts facing outward', () => {
    for (const [kind, items] of ALL) {
      for (const it of items) {
        const obj = thumbSubject(kind, it.id, ctx)!.build();
        let solids = 0;
        obj.traverse((o) => {
          if (!(o instanceof THREE.Mesh) || !isSolid(o) || o.material instanceof THREE.ShaderMaterial) return;
          if (kind === 'building' && o.geometry.getAttribute('aEmit')) return; // the surface models' own test covers them
          solids++;
          expect(orientation(o.geometry).outward, `${kind} ${it.id}`).toBeGreaterThan(0);
        });
        expect(solids + 1, `${kind} ${it.id} has parts`).toBeGreaterThan(0);
      }
    }
  });
});

describe('research node props', () => {
  // One test per domain, so a missing prop names the file that owns it.
  for (const d of DOMAINS) {
    it(`gives every ${d.id} node its own prop (${NODE_PROP_FILES[d.id]})`, () => {
      const missing = TECH_NODES.filter((n) => n.domain === d.id && !showsUnlock(n) && !NODE_PROPS[n.id]).map((n) => n.id);
      expect(missing).toEqual([]);
    });
  }

  it('has props only for real nodes that show a prop', () => {
    const ids = new Map(TECH_NODES.map((n) => [n.id, n]));
    for (const id of Object.keys(NODE_PROPS)) {
      expect(ids.has(id), `${id} is not a research node`).toBe(true);
      expect(showsUnlock(ids.get(id)!), `${id} shows its unlock, not a prop`).toBe(false);
    }
  });
});

describe('ship and building art', () => {
  for (const [group, ids] of Object.entries(SHIP_ART_GROUPS)) {
    it(`gives every ${group} ship class its art (${SHIP_ART_FILES[group]})`, () => {
      expect(ids.filter((id) => !SHIP_ART[id])).toEqual([]);
    });
  }

  it('covers every ship class in exactly one art group', () => {
    const all = Object.values(SHIP_ART_GROUPS).flat();
    expect([...all].sort()).toEqual(SHIP_CLASSES.map((c) => c.id).sort());
    for (const id of Object.keys(SHIP_ART)) expect(all, `${id} is not a ship class`).toContain(id);
  });

  it('gives every building and the capitol its art (buildings/art.ts)', () => {
    expect([...BUILDINGS.map((b) => b.id), 'capitol'].filter((id) => !BUILDING_ART[id])).toEqual([]);
  });

  it('paints ship art in the design colours, so a recolour renders again', () => {
    const a = thumbSubject('ship', 'lancer', ctx)!.key;
    const b = thumbSubject('ship', 'lancer', { factory, design: (id) => classDesign({ ...DEFAULT_DESIGN, colors: { primary: '#ff0000', secondary: '#00ff00', accent: '#0000ff' } }, byId.get(id)!) })!.key;
    expect(a).not.toBe(b);
  });
});
