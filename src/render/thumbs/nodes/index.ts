import type * as THREE from 'three';
import { DEFENSE_NODE_PROPS } from './defense';
import { HULLS_NODE_PROPS } from './hulls';
import { INDUSTRY_NODE_PROPS } from './industry';
import { INTEL_COLONIES_NODE_PROPS } from './intelColonies';
import { SOCIETY_NODE_PROPS } from './society';
import { WEAPONS_NODE_PROPS } from './weapons';

/** Each research node's own prop, by node id (nodes that unlock a ship, style or biome show that instead). */
export const NODE_PROPS: Readonly<Record<string, () => THREE.Group>> = {
  ...HULLS_NODE_PROPS, ...WEAPONS_NODE_PROPS, ...DEFENSE_NODE_PROPS, ...INDUSTRY_NODE_PROPS, ...SOCIETY_NODE_PROPS, ...INTEL_COLONIES_NODE_PROPS,
};

/** The file that owns a domain's node props (for messages and the coverage test). */
export const NODE_PROP_FILES: Readonly<Record<string, string>> = {
  hulls: 'nodes/hulls.ts', weapons: 'nodes/weapons.ts', defense: 'nodes/defense.ts', industry: 'nodes/industry.ts',
  society: 'nodes/society.ts', intel: 'nodes/intelColonies.ts', colonies: 'nodes/intelColonies.ts',
};
