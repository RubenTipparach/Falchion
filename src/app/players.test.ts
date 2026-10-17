import { describe, expect, it } from 'vitest';
import { planMovement } from '../core/fleet/Fleet';
import { GalaxyPlayers, isOtherPlayer } from './GalaxyPlayers';
import type { GameState } from './GameState';
import { isFleetMovement, notableChange, othersOnMap, pushDelay, PUSH_GAP_MS, URGENT_PUSH_GAP_MS, type OtherPlayer } from './ServerSync';

const A = '111111111111111111';
const B = '222222222222222222';
const player = (id: string, updatedAt: number, extra: Partial<OtherPlayer> = {}): OtherPlayer => ({
  id, name: `P${id.slice(0, 1)}`, avatar: null, updatedAt, color: '#ff8800', home: { q: 1, r: 2 }, colonies: [], fleets: [], ...extra,
});

describe('save pushes', () => {
  it('waits out the gap since the last push: 10 s, or 2.5 s for news', () => {
    expect(pushDelay(100_000, 0, false)).toBe(0);
    expect(pushDelay(100_000, 99_000, false)).toBe(PUSH_GAP_MS - 1_000);
    expect(pushDelay(100_000, 99_000, true)).toBe(URGENT_PUSH_GAP_MS - 1_000);
    expect(pushDelay(100_000, 97_500, true)).toBe(0);
  });

  it('treats move orders, new colonies, depots and founding as news, not the passing years', () => {
    const fleet = { id: 'scout-1', name: 'Scout', owner: 'Me', color: '#fff', movement: planMovement({ q: 0, r: 0 }, { q: 3, r: 0 }, 1, 1), design: {} };
    const npc = { ...fleet, id: 'nova-1', owner: 'Nova Collective' };
    const base = { playerName: 'Me', identity: null, depots: [], economy: { colonies: [{ starId: '0,0' }] }, fleets: [fleet, npc], turn: 1 } as unknown as GameState;
    expect(notableChange(base, { ...base, turn: 2, economy: { ...base.economy } } as GameState)).toBe(false);
    expect(notableChange(base, { ...base, economy: { colonies: [{ starId: '0,0' }] } } as unknown as GameState)).toBe(false);
    const moved = { ...fleet, movement: planMovement({ q: 1, r: 0 }, { q: 9, r: 9 }, 2, 1) };
    expect(notableChange(base, { ...base, fleets: [moved, npc] } as unknown as GameState)).toBe(true);
    expect(notableChange(base, { ...base, fleets: [fleet, { ...npc, movement: moved.movement }] } as unknown as GameState)).toBe(false); // not yours
    expect(notableChange(base, { ...base, fleets: [npc] } as unknown as GameState)).toBe(true); // docked
    expect(notableChange(base, { ...base, economy: { colonies: [{ starId: '0,0' }, { starId: '4,4' }] } } as unknown as GameState)).toBe(true);
    expect(notableChange(base, { ...base, depots: ['4,4'] } as unknown as GameState)).toBe(true);
    expect(notableChange(base, { ...base, identity: { name: 'Solar Union' } } as unknown as GameState)).toBe(true);
  });
});

describe('other players on the map', () => {
  it('validates fleet movements from other players', () => {
    expect(isFleetMovement(planMovement({ q: 0, r: 0 }, { q: 2, r: 1 }, 5, 1))).toBe(true);
    expect(isFleetMovement(null)).toBe(false);
    expect(isFleetMovement({ route: [], departTurn: 1, speed: 1 })).toBe(false);
    expect(isFleetMovement({ route: [{ q: 0, r: 0.5 }], departTurn: 1, speed: 1 })).toBe(false);
    expect(isFleetMovement({ route: [{ q: 0, r: 0 }], departTurn: 1, speed: 0 })).toBe(false);
  });

  it('labels claims with the player id (clickable markers) and prefixes fleet ids', () => {
    const m = planMovement({ q: 1, r: 2 }, { q: 4, r: 2 }, 3, 1);
    const { fleets, claims } = othersOnMap([player(A, 1, { fleets: [{ id: 'scout-1', name: 'Scout', movement: m, design: {} as never }, { id: 'bad', name: 'Bad', movement: { route: 'x' } as never, design: {} as never }] })]);
    expect(claims.map((c) => [c.id, c.kind])).toEqual([[A, 'other-player']]);
    expect(fleets.map((f) => [f.id, f.name, f.owner])).toEqual([[`${A}:scout-1`, `Scout · P1`, 'P1']]);
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
