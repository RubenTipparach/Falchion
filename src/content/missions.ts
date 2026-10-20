import type { MissionDef } from '../core/missions/Missions';

/**
 * The story (change missions-and-court), in chapters. Chapter I teaches the game a step at a time;
 * chapter II is found by exploring strange worlds; chapter III follows the megastructures to the
 * galaxy's heart. Each mission's objectives are read from the empire (src/core/missions).
 * A mission begins when the missions it `requires` are done, or when its `trigger` is met.
 */
export const CHAPTERS: Readonly<Record<number, { readonly name: string; readonly blurb: string }>> = {
  1: { name: 'First Light', blurb: 'A young empire learns to stand: survey, mine, research, settle, trade and defend.' },
  2: { name: 'Whispers', blurb: 'Choirs that sing to no one, machines that died mid-thought, worlds of bones. Someone was here before.' },
  3: { name: 'The Builders', blurb: 'They took stars apart to build their wonders, then vanished toward the galaxy\'s heart.' },
};

export const MISSIONS: readonly MissionDef[] = [
  // ── Chapter I: First Light (the tutorial) ──
  {
    id: 'know-your-home', chapter: 1, giver: 'council', title: 'Know Your Home', trigger: { kind: 'start' },
    briefing: 'Before an empire can reach for the stars it must know its own. Send the survey group to the planets of your home system (open a system and press Explore, or let the Survey Group explore on its own).',
    epilogue: 'The charts of home are drawn. Every world surveyed is worth knowing: some hide caches and crates.',
    objectives: [{ kind: 'survey', n: 3, text: 'Survey 3 planets' }],
    rewards: { materials: { credits: 150 }, leaderXp: 60 },
  },
  {
    id: 'ore-and-ice', chapter: 1, giver: 'steward', title: 'Ore and Ice', requires: ['know-your-home'],
    briefing: 'Shipyards eat metal. Mining ships work the asteroid fields of the system they are in: build more in the Shipyard, or click a belt to send miners to it.',
    epilogue: 'The miners are at work. Fields run dry and refill over a day: spread your miners wide.',
    objectives: [{ kind: 'miners', n: 6, text: 'Have 6 mining ships' }],
    rewards: { materials: { metals: 120, gases: 40 }, leaderXp: 70, candidate: 'steward' },
  },
  {
    id: 'lights-in-the-dark', chapter: 1, giver: 'science', title: 'Lights in the Dark', requires: ['know-your-home'],
    briefing: 'Research is shards of insight gathered into technologies. Set a research focus and let the labs work, or research a node when its shards are full.',
    epilogue: 'Every technology opens others. A Science Minister will keep the work going while you look elsewhere.',
    objectives: [{ kind: 'research', n: 3, text: 'Research 3 technologies' }],
    rewards: { shards: 60, leaderXp: 70, candidate: 'science' },
  },
  {
    id: 'a-second-hearth', chapter: 1, giver: 'steward', title: 'A Second Hearth', requires: ['ore-and-ice'],
    briefing: 'An empire grows by its colonies. Survey a world worth having, then send a Colony Ark to settle it.',
    epilogue: 'A new world raises your flag. Colonies grow, build and pay their way.',
    objectives: [{ kind: 'colonies', n: 4, text: 'Hold 4 colonies' }],
    rewards: { materials: { credits: 250, food: 40 }, leaderXp: 90 },
  },
  {
    id: 'house-of-learning', chapter: 1, giver: 'science', title: 'A House of Learning', requires: ['lights-in-the-dark'],
    briefing: 'Build a Research Lab on one of your colonies: open a colony on its planet card and build.',
    epilogue: 'The lab is open. More labs, more insight.',
    objectives: [{ kind: 'buildings', id: 'lab', n: 1, text: 'Build a Research Lab' }],
    rewards: { shards: 80, materials: { crystals: 30 }, leaderXp: 80 },
  },
  {
    id: 'lines-of-supply', chapter: 1, giver: 'admiral', title: 'Lines of Supply', requires: ['a-second-hearth'],
    briefing: 'Fleets run on supply, which refills only in friendly systems. A Construction Tender can build a supply depot in any system it is on station at.',
    epilogue: 'The depot stands. Your fleets can reach further now.',
    objectives: [{ kind: 'depots', n: 1, text: 'Build a supply depot' }],
    rewards: { materials: { metals: 100, credits: 150 }, leaderXp: 90, candidate: 'admiral' },
  },
  {
    id: 'not-alone', chapter: 1, giver: 'council', title: 'Not Alone', requires: ['know-your-home'],
    briefing: 'Other empires share these stars. Find one: send a fleet out until it comes within reach of another\'s worlds or ships.',
    epilogue: 'First contact. They may trade, they may raid. A Chancellor will speak for you.',
    objectives: [{ kind: 'contacts', n: 1, text: 'Meet another empire' }],
    rewards: { materials: { influence: 30 }, leaderXp: 80, candidate: 'chancellor' },
  },
  {
    id: 'the-merchant-road', chapter: 1, giver: 'chancellor', title: 'The Merchant Road', requires: ['not-alone'],
    briefing: 'Goodwill opens markets. Trade with a faction, pay it tribute or do what it asks of you until it counts you a friend.',
    epilogue: 'They call you friend. Their markets pay better, and their raiders look elsewhere.',
    objectives: [{ kind: 'standing', n: 10, text: 'Reach Cordial standing with any faction' }],
    rewards: { materials: { credits: 300, influence: 30 }, leaderXp: 120 },
  },
  {
    id: 'a-fleet-in-being', chapter: 1, giver: 'admiral', title: 'A Fleet in Being', requires: ['lines-of-supply'],
    briefing: 'The galaxy respects strength. Build warships in the Shipyard until you have a fleet worth the name.',
    epilogue: 'A fleet that exists keeps the peace by existing.',
    objectives: [{ kind: 'warships', n: 6, text: 'Have 6 warships' }],
    rewards: { materials: { metals: 150 }, leaderXp: 120 },
  },
  {
    id: 'first-light', chapter: 1, giver: 'council', title: 'First Light', requires: ['house-of-learning', 'a-fleet-in-being', 'the-merchant-road'],
    briefing: 'Your empire stands on its own feet. The council asks one more thing: chart the space beyond your borders, far from home.',
    epilogue: 'Far out, the surveyors heard something. A song, on no channel anyone uses.',
    objectives: [{ kind: 'survey', far: 120, n: 3, text: 'Survey 3 planets 120 ly or more from home' }, { kind: 'leader', n: 3, text: 'Your ruler reaches level 3' }],
    rewards: { materials: { credits: 400, influence: 40 }, shards: 100, leaderXp: 200, candidate: 'prelate' },
  },

  // ── Chapter II: Whispers (found by exploring) ──
  {
    id: 'the-choir-sings', chapter: 2, giver: 'prelate', title: 'The Choir Sings', trigger: { kind: 'surveyed', biome: 'choir' },
    briefing: 'A choir world: its circuits still pulse, broadcasting the same fragments over and over. There will be more of them. Find them and listen.',
    epilogue: 'Together the broadcasts form a pattern: coordinates, and a warning nobody can read yet.',
    objectives: [{ kind: 'survey', biome: 'choir', n: 3, text: 'Survey 3 choir worlds' }],
    rewards: { materials: { faith: 60, influence: 30 }, shards: 120, leaderXp: 220, advisorXp: 120, candidate: 'prelate' },
  },
  {
    id: 'rust-and-memory', chapter: 2, giver: 'science', title: 'Rust and Memory', trigger: { kind: 'surveyed', biome: 'deadtech' },
    briefing: 'A dead machine world. Its builders stopped mid-thought. Survey more of them: somewhere their archives may have survived.',
    epilogue: 'The archives speak of masters who left: "they took the stars apart, and then they went home".',
    objectives: [{ kind: 'survey', biome: 'deadtech', n: 2, text: 'Survey 2 dead machine worlds' }, { kind: 'research', n: 10, text: 'Research 10 technologies' }],
    rewards: { materials: { metals: 200, crystals: 60 }, shards: 150, leaderXp: 220, advisorXp: 120, candidate: 'spymaster' },
  },
  {
    id: 'bones-of-giants', chapter: 2, giver: 'admiral', title: 'Bones of Giants', trigger: { kind: 'surveyed', biome: 'bones' },
    briefing: 'A world of bones. Whatever killed them was thorough. Survey more such graveyards: learn what happened, before it happens again.',
    epilogue: 'The dead faced away from their sky. They were not attacked; they were abandoned.',
    objectives: [{ kind: 'survey', biome: 'bones', n: 3, text: 'Survey 3 bone worlds' }, { kind: 'warships', n: 10, text: 'Have 10 warships' }],
    rewards: { materials: { metals: 250, influence: 30 }, leaderXp: 220, advisorXp: 120 },
  },
  {
    id: 'envoys', chapter: 2, giver: 'chancellor', title: 'Envoys', trigger: { kind: 'contact' }, requires: ['not-alone'],
    briefing: 'Your neighbours have heard the same songs. Win their trust: friends trade their secrets.',
    epilogue: 'An ally tells you what their elders say of the Builders, and where their wonders stand.',
    objectives: [{ kind: 'contacts', n: 2, text: 'Know 2 factions' }, { kind: 'standing', n: 50, text: 'Reach Allied standing with any faction' }],
    rewards: { materials: { influence: 80, faith: 30 }, leaderXp: 260, advisorXp: 150 },
  },
  {
    id: 'the-pattern', chapter: 2, giver: 'council', title: 'The Pattern', requires: ['the-choir-sings', 'rust-and-memory'],
    briefing: 'The choirs, the machines and the bones are one story. The council wants the whole map of it: chart far and settle widely.',
    epilogue: 'The pattern points at the wonders. Wherever a star stands alone with its works, the Builders were there.',
    objectives: [{ kind: 'survey', n: 60, text: 'Survey 60 planets' }, { kind: 'colonies', n: 7, text: 'Hold 7 colonies' }],
    rewards: { materials: { credits: 800, crystals: 100 }, shards: 200, leaderXp: 400 },
  },

  // ── Chapter III: The Builders ──
  {
    id: 'first-wonder', chapter: 3, giver: 'science', title: 'First Wonder', requires: ['the-pattern'],
    briefing: 'Somewhere near, a star stands alone with a wonder round it: nothing else left in its system. Find one (search Megastructures) and survey it.',
    epilogue: 'Up close it is still working, after all this time. It was built to wait.',
    objectives: [{ kind: 'megastructures', n: 1, text: 'Survey a megastructure' }],
    rewards: { materials: { crystals: 150, influence: 60 }, shards: 250, leaderXp: 450, advisorXp: 200 },
  },
  {
    id: 'the-architects-hand', chapter: 3, giver: 'science', title: 'The Architect\'s Hand', requires: ['first-wonder'],
    briefing: 'Each kind of wonder is a different answer to the same question. Survey three different kinds to understand what they were asking.',
    epilogue: 'They were all engines of one sort or another, pointed at the galaxy\'s heart.',
    objectives: [{ kind: 'megastructures', distinct: true, n: 3, text: 'Survey 3 different kinds of megastructure' }],
    rewards: { materials: { crystals: 250, credits: 1000 }, shards: 400, leaderXp: 600, advisorXp: 250 },
  },
  {
    id: 'heirs', chapter: 3, giver: 'council', title: 'Heirs', requires: ['the-architects-hand'],
    briefing: 'To follow the Builders you must be what they were: an empire of many worlds, a ruler of renown and a friend to its neighbours.',
    epilogue: 'The galaxy knows your name. The way to the heart lies open.',
    objectives: [{ kind: 'colonies', n: 12, text: 'Hold 12 colonies' }, { kind: 'leader', n: 10, text: 'Your ruler reaches level 10' }, { kind: 'standing', n: 50, text: 'Allied with a faction' }],
    rewards: { materials: { influence: 200, faith: 100 }, leaderXp: 800 },
  },
  {
    id: 'the-maw', chapter: 3, giver: 'admiral', title: 'The Maw', requires: ['heirs'],
    briefing: 'Every wonder points at the supermassive black hole at the centre of the galaxy. Send a fleet there: whatever the Builders went home to, it is waiting.',
    epilogue: 'At the edge of the Maw, a signal. Not a warning this time: an invitation.',
    objectives: [{ kind: 'visit', star: '0,0', n: 1, text: 'A fleet on station at The Maw' }],
    rewards: { materials: { crystals: 500, influence: 300, faith: 200 }, shards: 800, leaderXp: 1500, advisorXp: 500 },
  },
];

export const MISSION_BY_ID: Readonly<Record<string, MissionDef>> = Object.fromEntries(MISSIONS.map((m) => [m.id, m]));
