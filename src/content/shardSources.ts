import type { ShardSourceDef } from '../core/research/types';

/** Add a new way to earn shards by adding an entry here. */
export const SHARD_SOURCES: readonly ShardSourceDef[] = [
  { id: 'science', name: 'Science facilities', reachesUnconnected: false },
  { id: 'exploration', name: 'Exploration', reachesUnconnected: false },
  { id: 'espionage', name: 'Espionage', reachesUnconnected: true },
  { id: 'reverse-engineering', name: 'Reverse engineering', reachesUnconnected: true },
  { id: 'observation', name: 'Distant observation', reachesUnconnected: true },
  { id: 'loot', name: 'Loot crates', reachesUnconnected: true },
  { id: 'missions', name: 'Missions', reachesUnconnected: false },
];
