import { describe, expect, it } from 'vitest';
import { SEATS } from '../../content/advisors';
import { MISSIONS, MISSION_BY_ID } from '../../content/missions';
import { NEW_COURT, addXp, appoint, courtBoons, drawCandidate, openSeats, withCandidate, xpToNext } from '../empire/Court';
import { NEW_MISSIONS, baseOf, measure, progressOf, questOffer, unlocked, type MissionView, type QuestGiver } from './Missions';

const view = (o: Partial<MissionView> = {}): MissionView => ({
  turn: 3000, surveyed: 0, surveyedOf: {}, surveyedDistances: [], megaTypes: [], colonies: 3, buildings: { shipyard: 1, farm: 1, mine: 2 },
  miners: 4, warships: 2, researched: 0, stock: {}, income: {}, contacts: 0, standings: {}, depots: 0, stationed: [], leaderLevel: 1, ...o,
});

describe('missions (change missions-and-court)', () => {
  it('starts the story with the first tutorial mission, and opens the next ones as each is done', () => {
    expect(unlocked(MISSIONS, NEW_MISSIONS, view()).map((m) => m.id)).toEqual(['know-your-home']);
    const after = unlocked(MISSIONS, { ...NEW_MISSIONS, done: ['know-your-home'] }, view()).map((m) => m.id);
    expect(after).toEqual(expect.arrayContaining(['ore-and-ice', 'lights-in-the-dark', 'not-alone']));
    expect(after).not.toContain('a-second-hearth');
  });

  it('uncovers missions by exploring and by meeting others', () => {
    const ids = unlocked(MISSIONS, NEW_MISSIONS, view({ surveyedOf: { choir: 1, bones: 1 } })).map((m) => m.id);
    expect(ids).toEqual(expect.arrayContaining(['the-choir-sings', 'bones-of-giants']));
    expect(unlocked(MISSIONS, { ...NEW_MISSIONS, done: ['not-alone'] }, view({ contacts: 1 })).map((m) => m.id)).toContain('envoys');
  });

  it('reads progress from the empire, live', () => {
    const def = MISSION_BY_ID['know-your-home'];
    expect(progressOf(def, undefined, view({ surveyed: 2 })).complete).toBe(false);
    const p = progressOf(def, undefined, view({ surveyed: 5 }));
    expect(p.complete).toBe(true);
    expect(p.objectives[0].have).toBe(3); // capped at what it needs
    expect(measure({ kind: 'survey', far: 100, n: 1, text: '' }, view({ surveyedDistances: [20, 150, 300] }))).toBe(2);
    expect(measure({ kind: 'standing', n: 10, text: '' }, view({ standings: { a: -20, b: 15 } }))).toBe(15);
    expect(measure({ kind: 'visit', star: '0,0', n: 1, text: '' }, view({ stationed: ['0,0'] }))).toBe(1);
  });

  it('counts a quest\'s surveys from when it began', () => {
    const def = { ...MISSION_BY_ID['know-your-home'], objectives: [{ kind: 'survey' as const, n: 3, text: '' }] };
    const base = baseOf(def, view({ surveyed: 40 }));
    expect(progressOf(def, { id: 'x', started: 0, base }, view({ surveyed: 42 })).complete).toBe(false);
    expect(progressOf(def, { id: 'x', started: 0, base }, view({ surveyed: 43 })).complete).toBe(true);
  });

  it('every story mission can be reached and its rewards name real seats', () => {
    const ids = new Set(MISSIONS.map((m) => m.id));
    for (const m of MISSIONS) {
      for (const r of m.requires ?? []) expect(ids.has(r), `${m.id} requires ${r}`).toBe(true);
      expect(m.requires?.length || m.trigger, m.id).toBeTruthy();
      if (m.rewards.candidate) expect(SEATS.some((s) => s.id === m.rewards.candidate)).toBe(true);
      expect(m.objectives.length, m.id).toBeGreaterThan(0);
    }
  });
});

describe('faction quests', () => {
  const giver = (standing: number, archetype = 'grey'): QuestGiver => ({ id: 'npc-7', name: 'Grey Syndicate', archetype, tier: 2, standing, home: { id: '12,-4', name: 'Velor' } });

  it('are the same for everyone asking, change by period, and come more often to friends', () => {
    expect(questOffer(giver(30), 'p1', 3000)).toEqual(questOffer(giver(30), 'p1', 3010));
    const count = (standing: number) => Array.from({ length: 300 }, (_, i) => questOffer(giver(standing), `p${i}`, 3000)).filter(Boolean).length;
    expect(count(60)).toBeGreaterThan(count(-60) * 2);
  });

  it('reward standing, influence and faith, and lapse at the end of their period', () => {
    for (let i = 0; i < 200; i++) {
      for (const a of ['vossk', 'krell', 'ithari', 'morrow', 'seraph', 'grey']) {
        const q = questOffer(giver(40, a), `p${i}`, 3000 + i * 61);
        if (!q) continue;
        expect(q.rewards.standing).toBeGreaterThan(0);
        expect(q.rewards.materials?.influence).toBeGreaterThan(0);
        expect(q.rewards.materials?.faith).toBeGreaterThan(0);
        expect(q.offerEnds).toBeGreaterThan(3000 + i * 61);
        expect(q.objectives.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('the court', () => {
  it('levels the ruler and advisors from experience', () => {
    const { next, gained } = addXp({ level: 1, xp: 0 }, xpToNext(1, true) + xpToNext(2, true) + 5, 20, true);
    expect([next.level, next.xp, gained]).toEqual([3, 5, 2]);
    expect(addXp({ level: 10, xp: 0 }, 99_999, 10).next.level).toBe(10);
  });

  it('opens seats as the ruler rises, and appoints candidates into them', () => {
    expect([1, 2, 3, 5, 7, 9, 20].map(openSeats)).toEqual([2, 2, 3, 4, 5, 6, 6]);
    let court = NEW_COURT;
    for (const seat of ['steward', 'science', 'admiral'] as const) court = withCandidate(court, drawCandidate(42, seat, court.drawn));
    let r = appoint(court, court.candidates[0].id);
    expect('court' in r).toBe(true);
    court = (r as { court: typeof court }).court;
    r = appoint(court, court.candidates[0].id);
    court = (r as { court: typeof court }).court;
    expect(Object.keys(court.seats)).toHaveLength(2);
    // A third seat waits for the ruler's level 3.
    expect('error' in appoint(court, court.candidates[0].id)).toBe(true);
    court = { ...court, leader: { level: 3, xp: 0 } };
    expect('court' in appoint(court, court.candidates[0].id)).toBe(true);
  });

  it('draws the same candidate from the same seed', () => {
    expect(drawCandidate(7, 'prelate', 3)).toEqual(drawCandidate(7, 'prelate', 3));
    expect(drawCandidate(7, 'prelate', 3).seat).toBe('prelate');
  });

  it('turns the ruler and advisors into boons that grow with their level', () => {
    const steward = { ...drawCandidate(1, 'steward', 0), level: 4 };
    const boons = courtBoons({ ...NEW_COURT, leader: { level: 5, xp: 0 }, seats: { steward } }, 'Empress Ada');
    expect(boons[0].effects.income?.influence).toBe(5);
    expect(boons.slice(1).some((b) => (b.effects.income?.credits ?? 0) >= 12)).toBe(true);
  });
});
