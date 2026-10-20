import type { BranchDef, BranchId, DomainDef, DomainId, Grant, TechNode } from '../core/research/types';

/** Column order is chosen so crossovers sit between neighbouring branches. */
export const BRANCHES: readonly BranchDef[] = [
  { id: 'organic', name: 'Organic', color: '#7bd88f' },
  { id: 'technological', name: 'Technological', color: '#5ec8ff' },
  { id: 'utilitarian', name: 'Utilitarian', color: '#f2b45a' },
  { id: 'geometric', name: 'Geometric', color: '#c792ea' },
  { id: 'aesthetic', name: 'Aesthetic', color: '#ff8fa3' },
];

export const DOMAINS: readonly DomainDef[] = [
  { id: 'hulls', name: 'Hulls & Drives', blurb: 'Chassis, propulsion and capital ships.' },
  { id: 'weapons', name: 'Weapons', blurb: 'Long range, short range, barrage and siege.' },
  { id: 'defense', name: 'Defense', blurb: 'Armour, shields, point defence and repair.' },
  { id: 'industry', name: 'Industry & Mining', blurb: 'Mining ships for every resource, refining and production.' },
  { id: 'society', name: 'Society', blurb: 'Trade, politics and religion.' },
  { id: 'intel', name: 'Intelligence', blurb: 'Espionage, recon, suppression and capturing ships.' },
  { id: 'colonies', name: 'Colonies & Ground War', blurb: 'Biomes, colony ships and planetary assault.' },
];

/** Shards needed per tier: 1/10, 1/50, 1/100, 1/250, 1/500. */
const SHARDS = [0, 10, 50, 100, 250, 500];

// Grant shorthands
const trait = (id: string): Grant => ({ kind: 'trait', id });
const style = (id: string): Grant => ({ kind: 'style', id });
const ship = (id: string): Grant => ({ kind: 'chassis', id });
const part = (id: string): Grant => ({ kind: 'part', id });
const biome = (id: string): Grant => ({ kind: 'biome', id });
const bonus = (stat: string, amount: number): Grant => ({ kind: 'bonus', stat, amount });

/** [id, name, tier, grants, description, extra] — `requires` defaults to the previous entry in the chain. */
type Row = [string, string, number, Grant[], string, Partial<TechNode>?];

const ROOTS: Record<BranchId, string> = {
  organic: 'o-grown-hulls', technological: 't-alloys', utilitarian: 'u-modular', geometric: 'g-prism', aesthetic: 'a-heritage',
};

const TREE: Record<DomainId, Record<BranchId, Row[]>> = {
  hulls: {
    organic: [
      ['o-grown-hulls', 'Grown Hulls', 1, [bonus('hull', 1)], 'Ships are cultured, not built.', { requires: [] }],
      ['o-spore-drive', 'Spore Drive', 2, [style('organic'), part('spore-drive'), bonus('speed', 1)], 'Mycelial propulsion between stars. Unlocks the Organic ship style.'],
      ['o-regeneration', 'Regenerative Tissue', 2, [trait('regeneration')], 'Hulls heal between battles.', { requires: ['o-grown-hulls'] }],
      ['o-neural-lattice', 'Neural Lattice', 3, [trait('neural')], 'A nervous system spanning the hull.', { requires: ['o-spore-drive'] }],
      ['o-leviathan', 'Leviathan Gestation', 5, [ship('leviathan')], 'Capital-class living ships.', { requires: ['x-hive-mind'] }],
    ],
    technological: [
      ['t-alloys', 'Composite Alloys', 1, [bonus('hull', 1)], 'Light, rigid hull frames.', { requires: [] }],
      ['t-fusion', 'Fusion Torches', 2, [style('technological'), part('fusion-torch'), bonus('speed', 1)], 'Faster sublight and jump spool. Unlocks the Technological ship style.'],
      ['t-warp-lanes', 'Warp Lane Theory', 3, [bonus('speed', 1)], 'Charted lanes shorten long hauls.'],
      ['t-capital-spines', 'Capital Spines', 4, [bonus('hull', 2)], 'Keel structures for ships a kilometre long.'],
      ['t-dreadnought', 'Dreadnought Program', 5, [ship('dreadnought')], 'A spine of lances wrapped in armour.'],
    ],
    utilitarian: [
      ['u-modular', 'Modular Frames', 1, [ship('prospector')], 'Bolt-together hulls; unlocks the Prospector Skiff.', { requires: [] }],
      ['u-slipways', 'Orbital Slipways', 2, [style('utilitarian'), bonus('build', 10)], 'Ships cost 10% less to build. Unlocks the Utilitarian ship style.'],
      ['u-shipyards', 'Mobile Shipyards', 3, [part('fabricator')], 'Build ships far from home.'],
      ['u-heavy-haulage', 'Heavy Haulage', 3, [style('industrial'), bonus('hull', 1)], 'Towing tugs and refinery haulers built to last, not to look at. Unlocks the Industrial ship style.', { requires: ['u-slipways'] }],
      ['u-titan-frames', 'Titan Frames', 4, [bonus('hull', 2)], 'Oversized frames for oversized jobs.', { requires: ['u-shipyards'] }],
    ],
    geometric: [
      ['g-prism', 'Prismatic Frames', 1, [bonus('hull', 1)], 'Pure-form hulls with no wasted volume.', { requires: [] }],
      ['g-tessellation', 'Tessellated Armour', 2, [style('geometric'), trait('armor')], 'Interlocking tiles spread impacts. Unlocks the Simple Geometry ship style.'],
      ['g-gyroscopic', 'Gyroscopic Cores', 2, [bonus('speed', 1)], 'Spinning cores that never lose heading.', { requires: ['g-prism'] }],
      ['g-sphere', 'Spherical Doctrine', 3, [bonus('hull', 2)], 'Maximum volume, minimum surface.', { requires: ['g-tessellation'], exclusiveGroup: 'geo-form' }],
      ['g-spike', 'Spike Doctrine', 3, [bonus('short', 2)], 'Every surface is a blade.', { requires: ['g-tessellation'], exclusiveGroup: 'geo-form' }],
      ['g-ellipsoid', 'Ellipsoid Doctrine', 3, [bonus('hull', 1)], 'Analog of Spherical Doctrine.', { requires: ['g-tessellation'], analogOf: 'g-sphere' }],
      ['g-shard-hulls', 'Shard Doctrine', 3, [bonus('short', 1)], 'Analog of Spike Doctrine.', { requires: ['g-tessellation'], analogOf: 'g-spike' }],
      ['g-monolith', 'Monoliths', 5, [ship('monolith')], 'Silent, enormous siege forms.', { requires: ['x-sacred-geometry'] }],
    ],
    aesthetic: [
      ['a-heritage', 'Heritage Shipwrights', 1, [bonus('hull', 1)], 'Elegant lines from a proud tradition.', { requires: [] }],
      ['a-ornament', 'Ornamental Plating', 2, [style('classic'), trait('ornate'), bonus('influence', 1)], 'Gilded trim that inspires awe. Unlocks the Classic ship style.'],
      ['a-sail-yachts', 'Solar Sail Yachts', 2, [bonus('speed', 1)], 'Light sails for long, graceful voyages.', { requires: ['a-heritage'] }],
      ['a-grand-halls', 'Grand Halls', 3, [bonus('morale', 5)], 'Crews fight harder aboard beautiful ships.', { requires: ['a-ornament'] }],
      ['a-flagship', 'Grand Flagships', 5, [ship('flagship')], 'The pride of an empire.', { requires: ['x-sacred-geometry'] }],
    ],
  },
  weapons: {
    organic: [
      ['o-acid-spitters', 'Acid Spitters', 1, [part('acid-spitter')], 'Corrosive glands on every hull.'],
      ['o-ramming-carapace', 'Ramming Carapace', 2, [ship('brawler')], 'Unlocks the Carapace Brawler (short range).'],
      ['o-symbiosis', 'Symbiotic Crews', 3, [bonus('repair', 5)], 'Crew and ship share one metabolism.', { exclusiveGroup: 'organic-doctrine' }],
      ['o-predator', 'Predator Instinct', 3, [bonus('short', 3)], 'Ships hunt like living things.', { requires: ['o-ramming-carapace'], exclusiveGroup: 'organic-doctrine' }],
      ['o-parasitic', 'Parasitic Crews', 3, [bonus('capture', 2)], 'Analog of Symbiotic Crews.', { requires: ['o-ramming-carapace'], analogOf: 'o-symbiosis' }],
      ['o-scavenger', 'Scavenger Instinct', 3, [bonus('salvage', 2)], 'Analog of Predator Instinct.', { requires: ['o-ramming-carapace'], analogOf: 'o-predator' }],
      ['o-brood-pods', 'Brood Pods', 4, [bonus('barrage', 3)], 'Living munitions that hunt their targets.', { requires: ['o-ramming-carapace'] }],
      ['o-bio-plasma', 'Bio-plasma Lances', 5, [bonus('short', 4)], 'Superheated organic plasma at point blank.'],
    ],
    technological: [
      ['t-lasers', 'Phased Lances', 2, [ship('lancer')], 'Unlocks the Lancer (long range).', { requires: ['t-alloys'] }],
      ['t-smart-munitions', 'Smart Munitions', 3, [ship('missile-barge')], 'Unlocks the Missile Barge (barrage).'],
      ['t-particle-spears', 'Particle Spears', 4, [bonus('long', 3)], 'Relativistic beams that ignore distance.'],
      ['t-swarm-drones', 'Swarm Drones', 5, [trait('drones'), bonus('barrage', 4)], 'Clouds of drones guard every hull.', { requires: ['x-hive-mind'] }],
    ],
    utilitarian: [
      ['u-salvo-racks', 'Salvo Racks', 1, [bonus('barrage', 1)], 'Cheap rocket racks on everything.'],
      ['u-mass-drivers', 'Mass Drivers', 2, [ship('railgun-monitor')], 'Unlocks the Railgun Monitor (long range).'],
      ['u-siege-batteries', 'Siege Batteries', 3, [bonus('siege', 3)], 'Heavy guns tuned for planetary targets.'],
      ['u-overcharged-capacitors', 'Overcharged Capacitors', 4, [bonus('long', 2)], 'Fire faster, replace more often.'],
    ],
    geometric: [
      ['g-focusing-prisms', 'Focusing Prisms', 2, [bonus('long', 2)], 'Crystal optics tighten every beam.'],
      ['g-kinetic-bombardment', 'Kinetic Bombardment', 3, [ship('bombard')], 'Unlocks the Kinetic Bombard (siege).'],
      ['g-shatter-lances', 'Shatter Lances', 4, [bonus('siege', 3)], 'Resonance that cracks shields.'],
      ['g-planet-cracker', 'Planet Cracker', 5, [ship('planet-cracker')], 'Unlocks the Planet Cracker (siege).'],
    ],
    aesthetic: [
      ['a-duelist-tradition', 'Duelist Tradition', 1, [ship('interceptor')], 'Unlocks the Duelist Interceptor (short range).'],
      ['a-honor-guard', 'Honor Guard', 2, [bonus('short', 2)], 'Elite pilots trained from childhood.'],
      ['a-war-hymns', 'War Hymns', 3, [bonus('morale', 5)], 'Fleets that sing fight as one.'],
      ['a-grand-battery', 'Grand Battery', 4, [bonus('long', 2)], 'Ceremonial guns that are not only ceremonial.'],
    ],
  },
  defense: {
    organic: [
      ['o-chitin-plates', 'Chitin Plates', 1, [bonus('hull', 1)], 'Layered shell grown over the hull.'],
      ['o-mender-hulls', 'Mender Hulls', 2, [ship('repair-tender')], 'Unlocks the Mender (repair support).'],
      ['o-ablative-ichor', 'Ablative Ichor', 3, [bonus('hull', 2)], 'Hulls bleed instead of breaking.'],
      ['o-adaptive-immunity', 'Adaptive Immunity', 4, [bonus('adapt', 10)], 'Each round, take less damage from the doctrine that hurt you most.'],
    ],
    technological: [
      ['t-point-defense', 'Point Defence Grid', 2, [bonus('suppression', 2)], 'Shoots down incoming missiles.', { requires: ['t-alloys'] }],
      ['t-shields', 'Deflector Shields', 3, [trait('shields'), bonus('hull', 2)], 'Energy bubbles absorb fire.', { exclusiveGroup: 'tech-defense' }],
      ['t-armor', 'Ablative Armour', 3, [trait('armor'), bonus('hull', 2)], 'Plates burn away under fire.', { requires: ['t-point-defense'], exclusiveGroup: 'tech-defense' }],
      ['t-flux-screens', 'Flux Screens', 3, [trait('shields'), bonus('hull', 1)], 'Analog of Deflector Shields.', { requires: ['t-point-defense'], analogOf: 't-shields' }],
      ['t-reactive-plating', 'Reactive Plating', 3, [trait('armor'), bonus('hull', 1)], 'Analog of Ablative Armour.', { requires: ['t-point-defense'], analogOf: 't-armor' }],
      ['t-phase-cloak', 'Phase Cloak', 4, [part('cloak-field')], 'Vanish between volleys.', { requires: ['t-point-defense'] }],
    ],
    utilitarian: [
      ['u-bulkheads', 'Redundant Bulkheads', 1, [bonus('hull', 1)], 'Seal it and keep flying.'],
      ['u-flak-screens', 'Flak Screens', 2, [ship('flak-picket')], 'Unlocks the Flak Picket (suppression).'],
      ['u-damage-control', 'Damage Control', 3, [bonus('repair', 5)], 'Crews patch hulls mid-battle.'],
    ],
    geometric: [
      ['g-lattice-shields', 'Lattice Shields', 2, [trait('shields')], 'Crystal-grid shield projectors.'],
      ['g-refraction-armor', 'Refraction Armour', 3, [bonus('vsLong', 15)], 'Takes 15% less long-range damage.'],
      ['g-null-fields', 'Null Fields', 4, [bonus('vsBarrage', 15)], 'Takes 15% less barrage damage.'],
    ],
    aesthetic: [
      ['a-ceremonial-guard', 'Ceremonial Guard', 1, [bonus('planetDefense', 10)], 'Every world keeps a guard of honour.'],
      ['a-aegis-cathedrals', 'Aegis Cathedrals', 3, [bonus('planetDefense', 25)], 'Shield domes over the holy cities.'],
    ],
  },
  industry: {
    organic: [
      ['o-bio-refineries', 'Bio-refineries', 1, [bonus('mining', 1)], 'Bacteria that digest ore.'],
      ['o-ice-grazers', 'Ice Grazers', 2, [ship('ice-cutter')], 'Unlocks the Ice Grazer (mines gases, faster).'],
      ['o-living-foundries', 'Living Foundries', 3, [bonus('build', 10)], 'Hulls that grow their own parts.'],
      ['o-void-trawlers', 'Void Trawlers', 4, [ship('void-trawler')], 'Unlocks the Void Trawler (mines dark matter).'],
    ],
    technological: [
      ['t-automation', 'Automation', 1, [bonus('credits', 5)], 'Robot crews cut costs.'],
      ['t-regolith-refinery', 'Regolith Refinery', 2, [ship('regolith-dredge')], 'Unlocks the Regolith Dredge (mines rare earths).'],
      ['t-fusion-forges', 'Fusion Forges', 3, [bonus('mining', 1)], 'Smelting at stellar temperatures.'],
      ['t-nanofabrication', 'Nanofabrication', 4, [bonus('build', 15)], 'Assemble anything from feedstock.'],
    ],
    utilitarian: [
      ['u-mining', 'Deep-core Mining', 1, [bonus('mining', 1)], 'Every mining ship yields more.'],
      ['u-gas-scoops', 'Gas Scoops', 2, [ship('gas-harvester')], 'Unlocks the Gas Harvester (mines gases).'],
      ['u-ore-processing', 'Ore Processing', 3, [bonus('mining', 1)], 'Refine before you haul.'],
      ['u-strip-mining', 'Strip Mining', 4, [bonus('mining', 2), bonus('stability', -5)], 'Huge yields, unhappy colonists.', { exclusiveGroup: 'util-mining' }],
      ['u-sustainable-mining', 'Sustainable Mining', 4, [bonus('mining', 1), bonus('stability', 5)], 'Smaller yields, happier colonists.', { requires: ['u-ore-processing'], exclusiveGroup: 'util-mining' }],
    ],
    geometric: [
      ['g-fractal-lattice', 'Fractal Lattices', 1, [trait('fractal')], 'Self-similar crystal growth.'],
      ['g-resonant-drills', 'Resonant Drills', 2, [ship('crystal-driller')], 'Unlocks the Resonant Driller (mines crystals).'],
      ['g-crystal-growth', 'Crystal Growth Vats', 3, [bonus('crystals', 3)], 'Grow crystals instead of mining them.'],
      ['g-harmonic-refining', 'Harmonic Refining', 4, [bonus('mining', 1)], 'Separate ores by resonance.'],
    ],
    aesthetic: [
      ['a-artisan-guilds', 'Artisan Guilds', 1, [bonus('credits', 5)], 'Fine goods fetch fine prices.'],
      ['a-luxury-goods', 'Luxury Goods', 2, [bonus('trade', 15)], 'Trade goods sell for 15% more.'],
      ['a-jewel-cutting', 'Jewel Cutting', 3, [bonus('crystals', 2)], 'Crystals become heirlooms.'],
      ['a-patronage', 'Patronage', 4, [bonus('influence', 3)], 'Fund the arts, buy the senate.'],
    ],
  },
  society: {
    organic: [
      ['o-pheromone-diplomacy', 'Pheromone Diplomacy', 1, [bonus('influence', 1)], 'Envoys who smell trustworthy.'],
      ['o-communal-mind', 'Communal Mind', 2, [{ kind: 'part', id: 'gov:hive' }], 'Unlocks the Hive Consensus government.'],
      ['o-spore-missions', 'Spore Missions', 3, [{ kind: 'part', id: 'faith' }, bonus('spread', 2)], 'Faith carried on the stellar wind.'],
      ['o-gestalt-council', 'Gestalt Council', 4, [bonus('stability', 10)], 'One will, many voices.'],
    ],
    technological: [
      ['t-market-algorithms', 'Market Algorithms', 1, [bonus('trade', 10)], 'Trade goods sell for 10% more.'],
      ['t-technocracy', 'Technocracy', 2, [{ kind: 'part', id: 'gov:directorate' }], 'Unlocks the Directorate government.'],
      ['t-media-networks', 'Media Networks', 3, [bonus('influence', 2)], 'Shape opinion across the stars.'],
      ['t-ai-governors', 'AI Governors', 4, [bonus('science', 5)], 'Machine administrators free up scientists.'],
    ],
    utilitarian: [
      ['u-logistics', 'Container Logistics', 1, [ship('bulk-freighter')], 'Unlocks the Bulk Freighter (carries trade goods).'],
      ['u-free-ports', 'Free Ports', 2, [bonus('cargo', 10), bonus('trade', 10)], 'Freighters carry 10 more goods, and sell them for 10% more.'],
      ['u-corporate-charters', 'Corporate Charters', 3, [{ kind: 'part', id: 'gov:corporate' }], 'Unlocks the Corporate Syndicate government.'],
      ['u-trade-federation', 'Trade Federation', 4, [bonus('cargo', 20)], 'Freighters carry 20 more goods.'],
    ],
    geometric: [
      ['g-axiomatic-law', 'Axiomatic Law', 1, [bonus('stability', 5)], 'Laws derived like theorems.'],
      ['g-harmony-of-spheres', 'Harmony of the Spheres', 2, [{ kind: 'part', id: 'faith' }, bonus('faith', 2)], 'A mathematical faith.'],
      ['g-meritocracy', 'Meritocracy', 3, [bonus('science', 3)], 'Rule by the provably able.'],
      ['g-perfect-state', 'The Perfect State', 4, [bonus('policies', 1)], 'One more policy slot.'],
    ],
    aesthetic: [
      ['a-diplomacy', 'Diplomatic Corps', 1, [bonus('influence', 2)], 'Envoys on every flagship.'],
      ['a-republic', 'Stellar Republic', 2, [{ kind: 'part', id: 'gov:republic' }], 'Unlocks the Republic government.'],
      ['a-cathedral', 'Cathedral Ships', 2, [{ kind: 'part', id: 'faith' }, { kind: 'part', id: 'gov:theocracy' }, bonus('faith', 2)], 'Unlocks founding a faith and the Theocracy government.', { requires: ['a-diplomacy'] }],
      ['a-missionaries', 'Missionary Orders', 3, [bonus('spread', 3)], 'Faith spreads faster to other empires.', { requires: ['a-cathedral'] }],
      ['a-pilgrim-routes', 'Pilgrim Routes', 4, [bonus('trade', 10), bonus('faith', 2)], 'Pilgrims ride your freighters.'],
    ],
  },
  intel: {
    organic: [
      ['o-mimic-pheromones', 'Mimic Pheromones', 1, [bonus('spies', 1)], 'Agents who smell like the locals.'],
      ['o-parasite-boarders', 'Parasite Boarders', 3, [ship('boarding-corvette')], 'Unlocks the Parasite Boarder (capture).'],
      ['o-hive-infiltrators', 'Hive Infiltrators', 4, [bonus('espionage', 3)], 'Spies that join the enemy’s mind.'],
    ],
    technological: [
      ['t-long-range-sensors', 'Long-range Sensors', 1, [ship('pathfinder')], 'Unlocks the Pathfinder Scout.'],
      ['t-electronic-warfare', 'Electronic Warfare', 2, [ship('jammer')], 'Unlocks the Jammer Frigate (suppression).'],
      ['t-deep-space-telescopes', 'Deep-space Telescopes', 3, [bonus('observation', 3)], 'Observe distant empires’ technology.'],
      ['t-quantum-decryption', 'Quantum Decryption', 4, [bonus('espionage', 3)], 'No secret survives.'],
      ['t-distributed-ai', 'Distributed AI', 3, [bonus('accuracy', 10)], 'Fleet-wide targeting intelligence.', { requires: ['t-long-range-sensors'] }],
    ],
    utilitarian: [
      ['u-salvage', 'Salvage Rigs', 1, [trait('salvage')], 'Cranes and claws for wrecks.'],
      ['u-tractor-beams', 'Tractor Beams', 2, [ship('tractor-tender')], 'Unlocks the Tractor Tender (capture).'],
      ['u-reverse-engineering', 'Reverse Engineering', 3, [bonus('salvage', 3)], 'More shards from every captured hull.'],
    ],
    geometric: [
      ['g-interferometry', 'Interferometry', 2, [bonus('observation', 2)], 'Telescope arrays light-years wide.'],
      ['g-cipher-lattices', 'Cipher Lattices', 3, [bonus('counterIntel', 20)], 'Unbreakable codes.'],
    ],
    aesthetic: [
      ['a-court-intrigue', 'Court Intrigue', 1, [bonus('spies', 1)], 'Every banquet is an operation.'],
      ['a-cultural-attaches', 'Cultural Attachés', 2, [bonus('espionage', 2)], 'Diplomats who listen carefully.'],
      ['a-grand-spymaster', 'Grand Spymaster', 4, [bonus('spies', 2)], 'Two more spy networks.'],
    ],
  },
  colonies: {
    organic: [
      ['o-swamp-adaptation', 'Swamp Adaptation', 1, [biome('toxic')], 'Settle toxic worlds.'],
      ['o-terraforming-spores', 'Terraforming Spores', 2, [biome('jungle')], 'Seed jungles on barren rock.'],
      ['o-biome-shaping', 'Biome Shaping', 3, [biome('ocean')], 'Fill whole basins with living seas.'],
    ],
    technological: [
      ['t-habitat-domes', 'Habitat Domes', 1, [biome('barren')], 'Settle airless worlds.'],
      ['t-cryo-habitats', 'Cryo Habitats', 2, [biome('ice')], 'Settle frozen moons.'],
      ['t-ground-mechs', 'Ground Mechs', 3, [bonus('troops', 25)], 'Assault troops fight 25% harder.'],
    ],
    utilitarian: [
      ['u-mining-colonies', 'Mining Colonies', 1, [biome('volcanic')], 'Settle volcanic worlds for their ores.'],
      ['u-orbital-drop-pods', 'Orbital Drop Pods', 2, [ship('drop-ship')], 'Unlocks the Drop Ship (planetary assault).'],
      ['u-colony-arks', 'Colony Arks', 3, [ship('colony-ark'), biome('desert')], 'Unlocks the Colony Ark.'],
    ],
    geometric: [
      ['g-arcology', 'Arcologies', 2, [bonus('credits', 5)], 'Cities as single machines.'],
      ['g-geodesic-shields', 'Geodesic Shields', 3, [bonus('planetDefense', 20)], 'Planetary shield lattices.'],
      ['g-gas-platforms', 'Gas Platforms', 3, [biome('gas')], 'Floating cities on gas giants.', { requires: ['g-arcology'] }],
    ],
    aesthetic: [
      ['a-colonial-charters', 'Colonial Charters', 1, [bonus('influence', 1)], 'Colonies with rights stay loyal.'],
      ['a-garden-worlds', 'Garden Worlds', 2, [biome('terran')], 'Settle temperate worlds.'],
      ['a-legion-carriers', 'Legion Carriers', 4, [ship('assault-carrier')], 'Unlocks the Legion Carrier (planetary assault).'],
    ],
  },
};

const CROSSOVERS: TechNode[] = [
  { id: 'x-hive-mind', name: 'Hive Mind', branch: 'organic', domain: 'hulls', tier: 4, shards: 500, requires: [],
    requiresAny: ['o-neural-lattice', 't-distributed-ai'], crossover: ['organic', 'technological'],
    grants: [trait('hive-mind'), ship('swarm-carrier')], description: 'Living and machine minds merge. Unlocks the Brood Carrier and both branches’ capitals.' },
  { id: 'x-gravitic-artillery', name: 'Gravitic Artillery', branch: 'technological', domain: 'weapons', tier: 4, shards: 250, requires: [],
    requiresAny: ['t-smart-munitions', 'u-siege-batteries'], crossover: ['technological', 'utilitarian'],
    grants: [bonus('long', 2), bonus('siege', 2)], description: 'Gravity wells as weapons: long range and siege.' },
  { id: 'x-reclamation', name: 'Nanite Reclamation', branch: 'technological', domain: 'defense', tier: 4, shards: 250, requires: [],
    requiresAny: ['t-shields', 't-armor', 't-flux-screens', 't-reactive-plating', 'u-damage-control'], crossover: ['technological', 'utilitarian'],
    grants: [trait('salvage'), bonus('repair', 5), bonus('capture', 2)], description: 'Nanites strip wrecks for parts and tech fragments.' },
  { id: 'x-singularity-taps', name: 'Singularity Taps', branch: 'geometric', domain: 'industry', tier: 4, shards: 250, requires: [],
    requiresAny: ['t-fusion-forges', 'g-crystal-growth'], crossover: ['technological', 'geometric'],
    grants: [ship('exotic-siphon')], description: 'Unlocks the Singularity Siphon (mines exotic matter).' },
  { id: 'x-galactic-bazaar', name: 'Galactic Bazaar', branch: 'utilitarian', domain: 'society', tier: 4, shards: 250, requires: [],
    requiresAny: ['t-market-algorithms', 'u-free-ports'], crossover: ['technological', 'utilitarian'],
    grants: [bonus('trade', 20), bonus('cargo', 10)], description: 'A market spanning every empire you trade with.' },
  { id: 'x-sacred-geometry', name: 'Sacred Geometry', branch: 'geometric', domain: 'hulls', tier: 4, shards: 500, requires: [],
    requiresAny: ['g-fractal-lattice', 'a-cathedral'], crossover: ['geometric', 'aesthetic'],
    grants: [trait('fractal'), trait('ornate')], description: 'Form as faith. Opens the Monolith and the Grand Flagship.' },
  { id: 'x-shadow-network', name: 'Shadow Network', branch: 'utilitarian', domain: 'intel', tier: 4, shards: 250, requires: [],
    requiresAny: ['u-reverse-engineering', 'g-cipher-lattices'], crossover: ['utilitarian', 'geometric'],
    grants: [bonus('spies', 1), bonus('espionage', 3)], description: 'Smugglers and codebreakers working as one.' },
  { id: 'x-combined-arms', name: 'Combined Arms Doctrine', branch: 'aesthetic', domain: 'colonies', tier: 4, shards: 250, requires: [],
    requiresAny: ['g-geodesic-shields', 'a-garden-worlds'], crossover: ['geometric', 'aesthetic'],
    grants: [bonus('troops', 25), bonus('siege', 2)], description: 'Bombardment and landings planned as one operation.' },
  { id: 'x-symbiotic-trade', name: 'Symbiotic Trade', branch: 'organic', domain: 'society', tier: 4, shards: 250, requires: [],
    requiresAny: ['o-communal-mind', 't-media-networks'], crossover: ['organic', 'technological'],
    grants: [bonus('trade', 10), bonus('influence', 2)], description: 'Markets that behave like ecosystems.' },
];

function build(): TechNode[] {
  const out: TechNode[] = [];
  for (const [domain, branches] of Object.entries(TREE) as Array<[DomainId, Record<BranchId, Row[]>]>) {
    for (const [branch, rows] of Object.entries(branches) as Array<[BranchId, Row[]]>) {
      let prev: string | null = domain === 'hulls' ? null : ROOTS[branch];
      for (const [id, name, tier, grants, description, extra] of rows) {
        const requires = extra?.requires ?? (prev ? [prev] : []);
        out.push({ id, name, branch, domain, tier, shards: SHARDS[tier], requires, grants, description, ...extra, ...(extra?.requires ? {} : { requires }) });
        // Exclusive/analog side-entries don't advance the chain.
        if (!extra?.exclusiveGroup && !extra?.analogOf) prev = id;
      }
    }
  }
  return [...out, ...CROSSOVERS];
}

export const TECH_NODES: readonly TechNode[] = build();

/** Technology alien empires field — the targets of espionage and reverse engineering. */
export const ALIEN_TECH: Readonly<Record<string, readonly string[]>> = {
  'Vossk Hegemony': ['o-ramming-carapace', 'o-brood-pods', 'o-bio-plasma', 'o-ablative-ichor', 'o-parasite-boarders', 'x-hive-mind', 'o-void-trawlers'],
  'Krell Swarm': ['t-smart-munitions', 'x-hive-mind', 't-swarm-drones', 'g-null-fields', 'u-flak-screens', 't-phase-cloak', 'x-singularity-taps'],
};
