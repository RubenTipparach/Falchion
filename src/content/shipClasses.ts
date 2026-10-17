import type { Mineral, Resource } from './resources';

/** Combat doctrine: how a ship fights. Drives the battle resolver's counters. */
export type Doctrine = 'long' | 'short' | 'barrage' | 'siege' | 'suppression' | 'capture' | 'assault' | 'support' | 'civilian';
export type ShipRole = 'mining' | 'logistics' | 'combat' | 'capital';

export interface ShipClassDef {
  readonly id: string;
  readonly name: string;
  readonly role: ShipRole;
  readonly doctrine: Doctrine;
  /** Resource this class mines each turn. */
  readonly mines?: Mineral;
  /** How fast it mines, relative to a Prospector (default 1). */
  readonly rate?: number;
  readonly hull: number;
  readonly attack: number;
  /** Ground troops carried (assault). */
  readonly troops?: number;
  readonly cost: Partial<Record<Resource, number>>;
  /** Tech node that unlocks it; undefined = available from the start. */
  readonly unlock?: string;
  /** Procgen defaults so the class reads at a glance. */
  readonly look: { readonly style: string; readonly length: number; readonly bulk: number; readonly engines: number; readonly weapons: number };
  readonly blurb: string;
}

const L = (style: string, length: number, bulk: number, engines: number, weapons: number) => ({ style, length, bulk, engines, weapons });

export const SHIP_CLASSES: readonly ShipClassDef[] = [
  // ── Mining (one per mineral) ──────────────────────────────────
  { id: 'prospector', name: 'Prospector Skiff', role: 'mining', doctrine: 'civilian', mines: 'metals', hull: 20, attack: 0, cost: { credits: 60, metals: 40 }, look: L('utilitarian', 0.8, 0.8, 2, 0), blurb: 'Cracks asteroids for metals.' },
  { id: 'gas-harvester', name: 'Gas Harvester', role: 'mining', doctrine: 'civilian', mines: 'gases', hull: 30, attack: 0, cost: { credits: 90, metals: 60 }, unlock: 'u-gas-scoops', look: L('utilitarian', 1.2, 1.4, 3, 0), blurb: 'Skims gas clouds and giants for gases.' },
  { id: 'ice-cutter', name: 'Ice Grazer', role: 'mining', doctrine: 'civilian', mines: 'gases', rate: 1.2, hull: 35, attack: 0, cost: { credits: 70, metals: 40, gases: 10 }, unlock: 'o-ice-grazers', look: L('organic', 1.1, 1.2, 2, 0), blurb: 'A living hull that grazes comets and gas clouds (20% faster).' },
  { id: 'crystal-driller', name: 'Resonant Driller', role: 'mining', doctrine: 'civilian', mines: 'crystals', hull: 30, attack: 0, cost: { credits: 110, metals: 60 }, unlock: 'g-resonant-drills', look: L('geometric', 1, 1, 2, 0), blurb: 'Shatters crystal seams with tuned harmonics.' },
  { id: 'regolith-dredge', name: 'Regolith Dredge', role: 'mining', doctrine: 'civilian', mines: 'metals', rate: 1.5, hull: 45, attack: 0, cost: { credits: 120, metals: 90 }, unlock: 't-regolith-refinery', look: L('technological', 1.3, 1.5, 2, 0), blurb: 'Swallows whole asteroids and sieves them for metals (50% faster).' },
  { id: 'exotic-siphon', name: 'Singularity Siphon', role: 'mining', doctrine: 'civilian', mines: 'crystals', rate: 1.6, hull: 40, attack: 0, cost: { credits: 220, metals: 80, crystals: 40 }, unlock: 'x-singularity-taps', look: L('geometric', 1.4, 1.1, 3, 0), blurb: 'Shatters crystal fields with focused gravity (60% faster).' },
  { id: 'void-trawler', name: 'Void Trawler', role: 'mining', doctrine: 'civilian', mines: 'gases', rate: 2, hull: 60, attack: 0, cost: { credits: 260, gases: 60, crystals: 20 }, unlock: 'o-void-trawlers', look: L('organic', 1.8, 1.3, 3, 0), blurb: 'Trawls whole gas clouds at once (twice as fast).' },
  // ── Logistics ─────────────────────────────────────────────────
  { id: 'bulk-freighter', name: 'Bulk Freighter', role: 'logistics', doctrine: 'civilian', hull: 40, attack: 0, cost: { credits: 80, metals: 50 }, unlock: 'u-logistics', look: L('utilitarian', 1.6, 1.2, 2, 0), blurb: 'Carries 50 trade goods to sell on other worlds.' },
  { id: 'survey-cutter', name: 'Survey Cutter', role: 'logistics', doctrine: 'support', hull: 25, attack: 1, cost: { credits: 70, metals: 30 }, look: L('technological', 0.9, 0.7, 2, 0), blurb: 'Deep holds of supply: explores many worlds before heading home.' },
  { id: 'construction-tender', name: 'Construction Tender', role: 'logistics', doctrine: 'civilian', hull: 45, attack: 0, cost: { credits: 120, metals: 80 }, look: L('utilitarian', 1.2, 1.3, 2, 0), blurb: 'Builds a supply depot where it stops: a friendly port to resupply and rearm.' },
  { id: 'pathfinder', name: 'Pathfinder Scout', role: 'logistics', doctrine: 'support', hull: 15, attack: 1, cost: { credits: 50, metals: 20 }, unlock: 't-long-range-sensors', look: L('technological', 0.7, 0.6, 2, 1), blurb: 'Fast recon with long-range sensors.' },
  { id: 'colony-ark', name: 'Colony Ark', role: 'logistics', doctrine: 'civilian', hull: 80, attack: 0, cost: { credits: 300, metals: 150, gases: 60 }, unlock: 'u-colony-arks', look: L('utilitarian', 2, 1.6, 4, 0), blurb: 'Founds a colony on an unlocked biome.' },
  // ── Combat: long range ────────────────────────────────────────
  { id: 'lancer', name: 'Lancer', role: 'combat', doctrine: 'long', hull: 40, attack: 9, cost: { credits: 120, metals: 70, crystals: 15 }, unlock: 't-lasers', look: L('technological', 1.5, 0.8, 2, 2), blurb: 'Phased lances that strike from extreme range.' },
  { id: 'railgun-monitor', name: 'Railgun Monitor', role: 'combat', doctrine: 'long', hull: 70, attack: 11, cost: { credits: 150, metals: 120 }, unlock: 'u-mass-drivers', look: L('utilitarian', 1.8, 1.2, 2, 2), blurb: 'A spinal mass driver bolted to an engine.' },
  // ── Combat: short range ───────────────────────────────────────
  { id: 'interceptor', name: 'Duelist Interceptor', role: 'combat', doctrine: 'short', hull: 25, attack: 8, cost: { credits: 70, metals: 40 }, unlock: 'a-duelist-tradition', look: L('classic', 0.7, 0.7, 2, 2), blurb: 'Closes fast and fights knife-close.' },
  { id: 'brawler', name: 'Carapace Brawler', role: 'combat', doctrine: 'short', hull: 90, attack: 12, cost: { credits: 140, metals: 80, gases: 20 }, unlock: 'o-ramming-carapace', look: L('organic', 1.3, 1.6, 3, 4), blurb: 'Armoured ram that tears ships apart up close.' },
  // ── Combat: barrage ───────────────────────────────────────────
  { id: 'missile-barge', name: 'Missile Barge', role: 'combat', doctrine: 'barrage', hull: 50, attack: 12, cost: { credits: 140, metals: 70, gases: 30 }, unlock: 't-smart-munitions', look: L('technological', 1.4, 1.4, 2, 6), blurb: 'Saturates the enemy with smart missiles.' },
  { id: 'swarm-carrier', name: 'Brood Carrier', role: 'combat', doctrine: 'barrage', hull: 80, attack: 13, cost: { credits: 200, metals: 80, gases: 40 }, unlock: 'x-hive-mind', look: L('organic', 1.7, 1.5, 3, 2), blurb: 'Launches clouds of hive-linked drones.' },
  // ── Combat: siege ─────────────────────────────────────────────
  { id: 'bombard', name: 'Kinetic Bombard', role: 'combat', doctrine: 'siege', hull: 70, attack: 8, cost: { credits: 170, metals: 130 }, unlock: 'g-kinetic-bombardment', look: L('geometric', 1.5, 1.3, 2, 2), blurb: 'Drops tungsten rods on planetary defences.' },
  { id: 'planet-cracker', name: 'Planet Cracker', role: 'combat', doctrine: 'siege', hull: 160, attack: 14, cost: { credits: 420, metals: 260, crystals: 40 }, unlock: 'g-planet-cracker', look: L('geometric', 2, 1.8, 4, 3), blurb: 'A siege engine that breaks planetary shields.' },
  // ── Combat: suppression ───────────────────────────────────────
  { id: 'jammer', name: 'Jammer Frigate', role: 'combat', doctrine: 'suppression', hull: 35, attack: 3, cost: { credits: 110, metals: 40, crystals: 20 }, unlock: 't-electronic-warfare', look: L('technological', 1, 0.8, 2, 1), blurb: 'Blinds targeting and scrambles missiles.' },
  { id: 'flak-picket', name: 'Flak Picket', role: 'combat', doctrine: 'suppression', hull: 50, attack: 4, cost: { credits: 90, metals: 70 }, unlock: 'u-flak-screens', look: L('utilitarian', 1, 1.1, 2, 5), blurb: 'Point defence that shreds barrages.' },
  // ── Combat: capture ───────────────────────────────────────────
  { id: 'boarding-corvette', name: 'Parasite Boarder', role: 'combat', doctrine: 'capture', hull: 35, attack: 3, troops: 4, cost: { credits: 120, metals: 40, gases: 20 }, unlock: 'o-parasite-boarders', look: L('organic', 0.9, 0.9, 2, 1), blurb: 'Latches onto crippled hulls and takes them.' },
  { id: 'tractor-tender', name: 'Tractor Tender', role: 'combat', doctrine: 'capture', hull: 55, attack: 2, cost: { credits: 130, metals: 80 }, unlock: 'u-tractor-beams', look: L('utilitarian', 1.3, 1.2, 2, 0), blurb: 'Tows disabled ships home for reverse engineering.' },
  // ── Combat: planetary assault ─────────────────────────────────
  { id: 'drop-ship', name: 'Drop Ship', role: 'combat', doctrine: 'assault', hull: 40, attack: 2, troops: 12, cost: { credits: 110, metals: 60 }, unlock: 'u-orbital-drop-pods', look: L('utilitarian', 1.1, 1.3, 2, 1), blurb: 'Carries a regiment down to a planet.' },
  { id: 'assault-carrier', name: 'Legion Carrier', role: 'combat', doctrine: 'assault', hull: 110, attack: 6, troops: 30, cost: { credits: 280, metals: 150, crystals: 20 }, unlock: 'a-legion-carriers', look: L('classic', 1.8, 1.5, 3, 3), blurb: 'Lands legions and covers them from orbit.' },
  // ── Support ───────────────────────────────────────────────────
  { id: 'repair-tender', name: 'Mender', role: 'combat', doctrine: 'support', hull: 50, attack: 1, cost: { credits: 120, metals: 50, gases: 20 }, unlock: 'o-mender-hulls', look: L('organic', 1.1, 1.2, 2, 0), blurb: 'Heals friendly hulls between rounds.' },
  // ── Capital ships ─────────────────────────────────────────────
  { id: 'dreadnought', name: 'Dreadnought', role: 'capital', doctrine: 'long', hull: 320, attack: 30, cost: { credits: 600, metals: 400, crystals: 120 }, unlock: 't-dreadnought', look: L('technological', 2, 2, 5, 8), blurb: 'A spine of lances wrapped in armour.' },
  { id: 'leviathan', name: 'Leviathan', role: 'capital', doctrine: 'short', hull: 380, attack: 28, cost: { credits: 600, metals: 250, gases: 120, crystals: 40 }, unlock: 'o-leviathan', look: L('organic', 2, 2, 4, 6), blurb: 'A capital-class living ship.' },
  { id: 'monolith', name: 'Monolith', role: 'capital', doctrine: 'siege', hull: 420, attack: 22, cost: { credits: 650, metals: 380, crystals: 120 }, unlock: 'g-monolith', look: L('geometric', 2, 2, 4, 4), blurb: 'A silent siege fortress.' },
  { id: 'flagship', name: 'Grand Flagship', role: 'capital', doctrine: 'support', hull: 300, attack: 18, cost: { credits: 700, metals: 300, crystals: 60, influence: 40 }, unlock: 'a-flagship', look: L('classic', 2, 1.7, 5, 6), blurb: 'Boosts the whole fleet’s damage and morale.' },
];

export const DOCTRINES: Readonly<Record<Doctrine, { name: string; color: string; summary: string; strong: string; weak: string }>> = {
  long: { name: 'Long range', color: '#7fd3e6', summary: 'Hits hardest while the fleets are far apart.', strong: 'Siege and slow fleets', weak: 'Short range once they close' },
  short: { name: 'Short range', color: '#ff9f6b', summary: 'Weak at range, devastating once fleets close.', strong: 'Long range after round 4', weak: 'Barrage while closing' },
  barrage: { name: 'Barrage', color: '#ffd166', summary: 'Steady damage at every range.', strong: 'Short range closing in', weak: 'Suppression (flak, jamming)' },
  siege: { name: 'Siege', color: '#c792ea', summary: 'Weak against ships, triple damage against planets.', strong: 'Planetary defences', weak: 'Long range' },
  suppression: { name: 'Suppression', color: '#9fe3ff', summary: 'Little damage, but cuts enemy barrage and accuracy.', strong: 'Barrage', weak: 'Short range' },
  capture: { name: 'Capture', color: '#6ee7a8', summary: 'Boards crippled ships; captured hulls give tech shards.', strong: 'Damaged, suppressed fleets', weak: 'Healthy fleets' },
  assault: { name: 'Assault', color: '#ff7a7a', summary: 'Lands troops once planetary defences fall.', strong: 'Bombarded planets', weak: 'Ships in space' },
  support: { name: 'Support', color: '#a98bff', summary: 'Repairs, recon and fleet-wide bonuses.', strong: 'Long battles', weak: 'Being targeted' },
  civilian: { name: 'Civilian', color: '#8592ad', summary: 'Does not fight.', strong: '—', weak: 'Everything' },
};
