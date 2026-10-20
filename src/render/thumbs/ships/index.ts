import { CIVIL_SHIP_ART } from './civil';
import { LINE_A_SHIP_ART } from './lineA';
import { LINE_B_SHIP_ART } from './lineB';
import type { ShipArt } from './types';

export type { ShipArt };

/** Each ship class's thumbnail art by class id (a class without art shows the generated ship). */
export const SHIP_ART: Readonly<Record<string, ShipArt>> = { ...CIVIL_SHIP_ART, ...LINE_A_SHIP_ART, ...LINE_B_SHIP_ART };

/** Which file owns each group's art (for the coverage test's messages). */
export const SHIP_ART_FILES: Readonly<Record<string, string>> = {
  civil: 'ships/civil.ts', lineA: 'ships/lineA.ts', lineB: 'ships/lineB.ts',
};

/** The classes each art file covers. */
export const SHIP_ART_GROUPS: Readonly<Record<string, readonly string[]>> = {
  civil: ['prospector', 'gas-harvester', 'ice-cutter', 'crystal-driller', 'regolith-dredge', 'exotic-siphon', 'void-trawler', 'bulk-freighter', 'survey-cutter', 'construction-tender', 'pathfinder', 'colony-ark'],
  lineA: ['lancer', 'railgun-monitor', 'interceptor', 'brawler', 'missile-barge', 'swarm-carrier', 'bombard', 'planet-cracker'],
  lineB: ['jammer', 'flak-picket', 'boarding-corvette', 'tractor-tender', 'drop-ship', 'assault-carrier', 'repair-tender', 'dreadnought', 'leviathan', 'monolith', 'flagship'],
};
