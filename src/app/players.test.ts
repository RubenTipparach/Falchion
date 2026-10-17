import { describe, expect, it } from 'vitest';
import { planMovement } from '../core/fleet/Fleet';
import { GalaxyPlayers, isOtherPlayer } from './GalaxyPlayers';
import { fleetStance, isFleetMovement, othersOnMap, type OtherPlayer } from './ServerSync';

const A = '111111111111111111';
const B = '222222222222222222';
const player = (id: string, updatedAt: number, extra: Partial<OtherPlayer> = {}): OtherPlayer => ({
  id, name: `P${id.slice(0, 1)}`, avatar: null, updatedAt, color: '#ff8800', home: { q: 1, r: 2 }, colonies: [], fleets: [], ...extra,
});

describe('other players on the map', () => {
  it('validates fleet movements from other players', () => {
    expect(isFleetMovement(planMovement({ q: 0, r: 0 }, { q: 2, r: 1 }, 5, 1))).toBe(true);
    expect(isFleetMovement(null)).toBe(false);
    expect(isFleetMovement({ route: [], departTurn: 1, speed: 1 })).toBe(false);
    expect(isFleetMovement({ route: [{ q: 0, r: 0.5 }], departTurn: 1, speed: 1 })).toBe(false);
    expect(isFleetMovement({ route: [{ q: 0, r: 0 }], departTurn: 1, speed: 0 })).toBe(false);
    // Redirected between ticks: a fractional departure from an exact point.
    expect(isFleetMovement(planMovement({ q: 0, r: 0 }, { q: 2, r: 1 }, 5.4, 1, { x: 0.2, z: -0.1 }))).toBe(true);
    expect(isFleetMovement({ route: [{ q: 0, r: 0 }], departTurn: 1, speed: 1, from: { x: Number.NaN, z: 0 } })).toBe(false);
    expect(isFleetMovement({ route: [{ q: 0, r: 0 }], departTurn: -1, speed: 1 })).toBe(false);
  });

  it('shows whether another player\'s fleet is armed and aggressive', () => {
    const m = planMovement({ q: 1, r: 2 }, { q: 4, r: 2 }, 3, 1);
    const { fleets } = othersOnMap([player(A, 1, { fleets: [{ id: 'war', name: 'War', movement: m, design: {} as never, armed: true, stance: 'aggressive' }, { id: 'guard', name: 'Guard', movement: m, design: {} as never, armed: true }] })]);
    expect(fleets.map((f) => f.status)).toEqual(['Aggressive warfleet', 'Warfleet']);
    expect(fleetStance({ armed: false, stance: 'aggressive' })).toBeUndefined();
    expect(fleetStance({})).toBeUndefined();
  });

  it('labels claims with the player id (clickable markers) and prefixes fleet ids', () => {
    const m = planMovement({ q: 1, r: 2 }, { q: 4, r: 2 }, 3, 1);
    const { fleets, claims } = othersOnMap([player(A, 1, { fleets: [{ id: 'scout-1', name: 'Scout', movement: m, design: {} as never, armed: false }, { id: 'bad', name: 'Bad', movement: { route: 'x' } as never, design: {} as never, armed: false }] })]);
    expect(claims.map((c) => [c.id, c.kind])).toEqual([[A, 'other-player']]);
    expect(fleets.map((f) => [f.id, f.name, f.owner])).toEqual([[`${A}:scout-1`, `Scout · P1`, 'P1']]);
  });

  it('lists the battles other players\' fleets are in, with their round record checked', () => {
    const m = planMovement({ q: 1, r: 2 }, { q: 1, r: 2 }, 3, 1);
    const view = { round: 2, before: [{ ships: [{ classId: 'lancer', count: 3 }] }, { ships: [{ classId: 'brawler', count: 2 }] }], lostBy: [{}, { brawler: 1 }], takenBy: [{}, {}], by: [{ long: 50 }, {}], jam: [1, 1], flak: [0, 0], hull: [{ lancer: 40 }, { brawler: 90 }], wounds: [{}, {}], start: [300, 400] };
    const { battles } = othersOnMap([player(A, 1, { fleets: [
      { id: 'war', name: 'War', movement: m, design: {} as never, armed: true, battle: { foe: 'p2:f', tick: 7, round: 2, foeName: 'Raiders', foeEmpire: 'Vossk', view: view as never }, chase: 'p2:f' },
      { id: 'odd', name: 'Odd', movement: m, design: {} as never, armed: true, battle: { foe: 'p2:g', tick: 7, view: { round: 'x' } as never } },
    ] })]);
    expect(battles.map((b) => [b.fleet, b.foe, b.round, b.foeName, b.chase])).toEqual([[`${A}:war`, 'p2:f', 2, 'Raiders', 'p2:f'], [`${A}:odd`, 'p2:g', 1, 'a fleet', undefined]]);
    expect(battles[0].view?.before[0].ships).toEqual([{ classId: 'lancer', count: 3 }]);
    expect(battles[1].view).toBeNull();
  });
});

describe('galaxy players model', () => {
  it('merges polls and live pushes, skipping you and malformed players', () => {
    const g = new GalaxyPlayers(B);
    const changes: string[] = [];
    g.onChange((what) => changes.push(what));
    g.setPlayers([player(A, 10), player(B, 10), { id: '../x' }]);
    expect(g.others.map((p) => p.id)).toEqual([A]);
    g.upsert(player(A, 20, { home: { q: 9, r: 9 } }));
    expect(g.others[0].home).toEqual({ q: 9, r: 9 });
    g.upsert(player(A, 15)); // older than what we have: ignored
    g.upsert(player(B, 30)); // yourself: ignored
    g.setPlayers([player(A, 12)]); // a stale poll keeps the live copy
    expect(g.others[0].updatedAt).toBe(20);
    expect(changes).toEqual(['players', 'players', 'players']);
    expect(isOtherPlayer({ ...player(A, 1), fleets: 'no' })).toBe(false);
  });

  it('tracks who is online and reports only newly streamed activity as fresh', () => {
    const g = new GalaxyPlayers(B);
    const fresh: string[][] = [];
    g.onChange((what, f) => { if (what === 'activity') fresh.push(f.map((e) => e.id)); });
    g.setOnline([{ id: A, name: 'PA', avatar: null }]);
    expect(g.isOnline(A)).toBe(true);
    expect(g.isOnline(B)).toBe(false);
    const ev = (id: string, at: number) => ({ id, at, player: { id: A, name: 'PA' }, empire: null, kind: 'survey', text: 'finished surveying Karon' });
    g.addActivity([ev('a', 1), ev('b', 2)], false);
    g.addActivity([ev('b', 2), ev('c', 3)], true);
    expect(fresh).toEqual([[], ['c']]);
    expect(g.activity.map((e) => e.id)).toEqual(['c', 'b', 'a']);
  });
});
