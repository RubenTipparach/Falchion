import { describe, expect, it } from 'vitest';
import { findMentions, findPlaces, matchTerms, mentionQuery, suggestPeople, threadOf } from './ChatText';

const vela = { name: 'Vela', q: 1, r: 2 };
const velaII = { name: 'Vela II', q: 1, r: 2 };
const orrin = { name: 'Orrin Prime', q: -5, r: 9 };

describe('chat location links', () => {
  it('finds known places case-insensitively on whole words, longest first', () => {
    expect(findPlaces('meet at vela ii, then ORRIN PRIME', [vela, velaII, orrin])).toEqual([velaII, orrin]);
    expect(findPlaces('Velaris is not Vela', [vela])).toEqual([vela]);
    expect(findPlaces('Velaris', [vela])).toEqual([]);
  });

  it('splits text into plain runs and names without losing characters', () => {
    const text = 'Fleet to Vela, now! vela again';
    const segs = matchTerms(text, [{ name: 'Vela', value: 'v' }]);
    expect(segs.map((s) => s.text).join('')).toBe(text);
    expect(segs.filter((s) => s.kind === 'term').map((s) => s.text)).toEqual(['Vela', 'vela']);
  });

  it('never overlaps names and ignores very short ones', () => {
    const segs = matchTerms('Vela II rises', [{ name: 'Vela', value: 1 }, { name: 'Vela II', value: 2 }, { name: 'II', value: 3 }]);
    expect(segs.filter((s) => s.kind === 'term').map((s) => (s.kind === 'term' ? s.value : 0))).toEqual([2]);
  });

  it('keeps each place once and caps the list', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ name: `Star${i}x`, q: i, r: 0 }));
    expect(findPlaces(many.map((p) => p.name).join(' '), many)).toHaveLength(10);
    expect(findPlaces('Vela vela VELA', [vela])).toEqual([vela]);
  });

  it('handles regex characters and non-ASCII names literally', () => {
    expect(findPlaces('go to (A.b)* now', [{ name: '(A.b)*', q: 0, r: 0 }])).toHaveLength(1);
    expect(findPlaces('Ærøskøbing!', [{ name: 'ærøskøbing', q: 0, r: 0 }])).toHaveLength(1);
  });
});

describe('chat mentions', () => {
  const people = [{ id: '1', name: 'Ruben' }, { id: '2', name: 'Friend' }, { id: '3', name: 'Ruben Two' }];

  it('finds @Name of known people, longest name first', () => {
    expect(findMentions('hi @ruben and @Friend', people)).toEqual(['1', '2']);
    expect(findMentions('@Ruben Two look', people)).toEqual(['3']);
    expect(findMentions('Ruben without at', people)).toEqual([]);
    expect(findMentions('mail@Ruben', people)).toEqual(['1']);
  });

  it('reads the @query before the caret for autocomplete', () => {
    expect(mentionQuery('hello @ru', 9)).toEqual({ start: 6, query: 'ru' });
    expect(mentionQuery('hello @', 7)).toEqual({ start: 6, query: '' });
    expect(mentionQuery('mail a@b', 8)).toBeNull();
    expect(mentionQuery('no mention', 10)).toBeNull();
    expect(mentionQuery('@ x', 3)).toBeNull();
  });

  it('files a message under global or the other player of a DM', () => {
    const u = (id: string) => ({ id, name: id, avatar: null });
    expect(threadOf({ from: u('1'), to: 'global' }, '1')).toBe('global');
    expect(threadOf({ from: u('1'), to: '2' }, '1')).toBe('2');
    expect(threadOf({ from: u('2'), to: '1' }, '1')).toBe('2');
  });

  it('suggests people by prefix, then by substring', () => {
    expect(suggestPeople('ru', people).map((p) => p.id)).toEqual(['1', '3']);
    expect(suggestPeople('end', people).map((p) => p.id)).toEqual(['2']);
    expect(suggestPeople('', people)).toHaveLength(3);
  });
});
