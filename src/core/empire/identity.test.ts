import { describe, expect, it } from 'vitest';
import { HERALDRY } from '../../content/heraldry';
import { cleanIdentity, randomFlag, suggestIdentity } from './Identity';
import { Rng } from '../rng/Rng';

describe('empire identity', () => {
  it('suggests the same identity for the same player and seed', () => {
    const a = suggestIdentity(1337, 'Ruben', 'Zarsen III', HERALDRY);
    expect(suggestIdentity(1337, 'Ruben', 'Zarsen III', HERALDRY)).toEqual(a);
    expect(a.ruler).toBe('Ruben');
    expect(a.capital).toBe('Zarsen III');
    expect(a.flag.colors[0]).toBe(a.color);
    expect(HERALDRY.colors).toContain(a.color);
  });

  it('random flags only use known parts and colours', () => {
    const rng = new Rng(7);
    for (let i = 0; i < 50; i++) {
      const f = randomFlag(rng, HERALDRY);
      expect(HERALDRY.fields.some((x) => x.id === f.field)).toBe(true);
      expect(HERALDRY.emblems.some((x) => x.id === f.emblem)).toBe(true);
      for (const c of f.colors) expect(HERALDRY.flagColors).toContain(c);
    }
  });

  it('cleans untrusted identities: text, colours and flag parts', () => {
    const id = cleanIdentity({
      name: '  <b>Solar\n  Dominion</b>  ', ruler: 'R'.repeat(80), title: 'Emperor', capital: 'Zarsen',
      color: 'red; background:url(x)', flag: { field: 'cross" onload="x', emblem: 'star', colors: ['#FFFFFF', 'javascript:1', '#123456'] },
    }, HERALDRY)!;
    expect(id.name).toBe('b Solar Dominion /b');
    expect(id.ruler.length).toBe(40);
    expect(id.color).toBe(HERALDRY.colors[0]);
    expect(id.flag.field).toBe(HERALDRY.fields[0].id);
    expect(id.flag.emblem).toBe('star');
    expect(id.flag.colors).toEqual(['#ffffff', '#0b1220', '#123456']);
  });

  it('is not an identity without a name', () => {
    expect(cleanIdentity({ name: '   ' }, HERALDRY)).toBeNull();
    expect(cleanIdentity(null, HERALDRY)).toBeNull();
    expect(cleanIdentity('Solar', HERALDRY)).toBeNull();
  });
});
