import type { Squadron } from '../combat/Combat';
import type { Hex } from '../hex/Hex';

/** What an NPC raider fleet is doing: waiting at home, out raiding, or coming back. */
export type NpcMission = 'home' | 'raid' | 'return';

/**
 * A raider fleet of an active NPC. Its movement is a straight run from `from` to `to` that set
 * off in year `depart` at one light year a year (the route is rebuilt from these when needed).
 */
export interface NpcFleet {
  readonly id: string;
  readonly name: string;
  readonly ships: readonly Squadron[];
  readonly mission: NpcMission;
  readonly from: Hex;
  readonly to: Hex;
  readonly depart: number;
  /** The empire (player id) it is raiding. */
  readonly target?: string;
}

/** An NPC world: its garrison, and who took it if it fell. */
export interface NpcColonyState {
  readonly starId: string;
  readonly garrison: readonly Squadron[];
  /** Player id that captured it: it is then theirs, not the NPC's. */
  readonly capturedBy?: string;
}

/** A discovered (active) NPC empire. Who it is comes from the catalogue (src/core/npc/NpcCatalog.ts). */
export interface NpcState {
  readonly id: string;
  readonly discoveredAt: number;
  /** Players who know it: its raiders go after them. */
  readonly knownBy: readonly string[];
  readonly fleets: readonly NpcFleet[];
  readonly colonies: readonly NpcColonyState[];
  /** Year it last built a raider fleet or reinforced its worlds. */
  readonly lastBuilt: number;
  /** Raider fleets built so far (their numbering). */
  readonly built: number;
}

/** Something an NPC did to a player this year, for the player's empire to resolve. */
export interface NpcRaid {
  readonly kind: 'raid';
  readonly npc: string;
  readonly fleet: string;
  readonly player: string;
  /** Where the raiders struck: a colony system or a fleet's position. */
  readonly at: Hex;
  readonly ships: readonly Squadron[];
  readonly year: number;
}
