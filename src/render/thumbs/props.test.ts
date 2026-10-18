import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
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
import { thumbSubject, type ThumbContext, type ThumbKind } from './subjects';

const { factory } = createDefaultShipFactory();
const byId = new Map(SHIP_CLASSES.map((c) => [c.id, c]));
const ctx: ThumbContext = { factory, design: (id) => classDesign(DEFAULT_DESIGN, byId.get(id)!) };

const ALL: [ThumbKind, readonly { id: string }[]][] = [
  ['resource', RESOURCES], ['event', ENCOUNTER_KINDS], ['building', [...BUILDINGS, { id: 'capitol' }]], ['ship', SHIP_CLASSES], ['research', TECH_NODES],
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
      if (kind === 'ship') continue; // ShipFactory has its own orientation test
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

  it('keys a ship thumbnail by its design, so a redesign renders again', () => {
    const a = thumbSubject('ship', 'lancer', ctx)!.key;
    const b = thumbSubject('ship', 'lancer', { factory, design: (id) => classDesign({ ...DEFAULT_DESIGN, style: 'organic' }, byId.get(id)!) })!.key;
    expect(a).not.toBe(b);
  });
});
