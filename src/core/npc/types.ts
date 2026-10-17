import type { Squadron } from '../combat/Combat';
import type { FleetMovement } from '../fleet/Fleet';

/** What an NPC raider fleet is doing. */
export type NpcMission = 'home' | 'raid' | 'return';

export interface NpcFleet {
  readonly id: string;
  readonly name: string;
  readonly ships: readonly Squadron[];
  readonly movement: FleetMovement;
  readonly mission: NpcMission;
  /** The empire (player id) it is raiding. */
  readonly target?: string;
}

/** An NPC world: its garrison, and whether a player has taken it. */
export interface NpcColonyState {
  readonly starId: string;
  readonly garrison: readonly Squadron[];
  /** Player id that captured it (it is then theirs, not the NPC's). */
  readonly capturedBy?: string;
}

/** A discovered (active) NPC empire. Its identity comes from the catalogue (src/core/npc/NpcCatalog.ts). */
export interface NpcState {
  readonly id: string;
  readonly discoveredAt: number;
  /** Players who know it: its raiders go after them. */
  readonly knownBy: readonly string[];
  readonly fleets: readonly NpcFleet[];
  readonly colonies: readonly NpcColonyState[];
  /** Year it last built a raider fleet. */
  readonly lastBuilt: number;
  /** Raider fleets built so far (names and ids). */
  readonly built: number;
}
