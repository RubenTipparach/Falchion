import type { Planet } from '../core/galaxy/Planets';
import type { StarSystem } from '../core/galaxy/GalaxyModel';
import type { ShipDesign } from '../core/ships/ShipDesign';

/** Commands the UI can issue. Implemented by the app layer (Dependency Inversion). */
export interface GameActions {
  toggleView(): void;
  flyTo(star: StarSystem, closeUp?: boolean): void;
  select(star: StarSystem | null): void;
  sendFleet(to: StarSystem): void;
  explore(planet: Planet): void;
  collectCrate(planetId: string): void;
  research(nodeId: string): void;
  grantShards(nodeId: string, sourceId: string, amount: number): void;
  setDesign(design: ShipDesign): void;
  toggleTrait(traitId: string): void;
  endTurn(): void;
  openPanel(id: PanelId): void;
}

export type PanelId = 'shipyard' | 'research' | 'explore';
