import { describe, expect, it } from 'vitest';
import type { GameState } from './GameState';
import { SaveGame } from './SaveGame';
import { Store } from './Store';

class MemoryStorage implements Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  private readonly data = new Map<string, string>();
  getItem(k: string) { return this.data.get(k) ?? null; }
  setItem(k: string, v: string) { this.data.set(k, v); }
  removeItem(k: string) { this.data.delete(k); }
}

const state = { turn: 412, dispatches: [], selected: { id: 'transient' }, explored: { 'a/1': { success: true } } } as unknown as GameState;

describe('save game', () => {
  it('round-trips the persistent fields only', () => {
    const save = new SaveGame(7, new MemoryStorage() as unknown as Storage);
    save.save(state);
    const loaded = save.load()!;
    expect(loaded.turn).toBe(412);
    expect(loaded.explored).toEqual({ 'a/1': { success: true } });
    expect('selected' in loaded).toBe(false);
  });

  it('ignores saves from another galaxy and survives missing storage', () => {
    const storage = new MemoryStorage() as unknown as Storage;
    new SaveGame(7, storage).save(state);
    expect(new SaveGame(8, storage).load()).toBeNull();
    expect(new SaveGame(7, null).load()).toBeNull();
    const save = new SaveGame(7, storage);
    save.clear();
    expect(save.load()).toBeNull();
  });
});

describe('abandoning an empire', () => {
  it('writes nothing after stop, so a reset cannot be undone by a late save', () => {
    const storage = new MemoryStorage() as unknown as Storage;
    const save = new SaveGame(7, storage);
    save.save(state);
    save.stop();
    save.clear();
    save.save(state);
    expect(save.load()).toBeNull();
  });
});

describe('store batching', () => {
  it('notifies once for many updates', () => {
    const store = new Store({ n: 0 });
    const seen: Array<[number, number]> = [];
    store.subscribe((s, prev) => seen.push([prev.n, s.n]));
    store.batch(() => { for (let i = 0; i < 100; i++) store.update((s) => ({ n: s.n + 1 })); });
    expect(seen).toEqual([[0, 100]]);
  });
});
