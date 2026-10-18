import type * as THREE from 'three';
import type { ShipColors } from '../../../core/ships/ShipDesign';

/** A ship class's thumbnail model, painted in an empire's colours (primary hull, secondary detail, accent glow). */
export type ShipArt = (colors: ShipColors) => THREE.Group;
