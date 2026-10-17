import { describe, expect, it } from 'vitest';
import { linkPreview, placeLink, withPreview } from './links.mjs';

describe('hotlink previews', () => {
  it('names a star system, a planet, deep space and a player', () => {
    expect(linkPreview('/system/-14697,20078/Norka_II').title).toBe('Norka II · Falchion');
    expect(linkPreview('/system/-14697,20078/Norka_II/planet/2').title).toBe('Norka II · planet 2 · Falchion');
    expect(linkPreview('/system/1,2').title).toBe('A star system · Falchion');
    expect(linkPreview('/hex/1,2').title).toBe('Deep space · Falchion');
    expect(linkPreview('/player/123456789012345678').title).toBe('A commander · Falchion');
  });

  it('is not a preview for other paths', () => {
    for (const p of ['/', '/admin', '/system/abc', '/hex/1', '/player/x', '/assets/index.js']) expect(linkPreview(p)).toBeNull();
  });

  it('escapes what the path carries', () => {
    const p = linkPreview('/system/1,2/%22%3E%3Cscript%3Ealert(1)%3C%2Fscript%3E');
    const html = withPreview('<html><head><title>Falchion</title></head></html>', p, 'https://falchion.fly.dev/system/1,2/x');
    expect(html).not.toContain('<script>');
    expect(html).toContain('og:title');
    expect(html.match(/<title>/g)).toHaveLength(1);
  });

  it('links places in Discord posts without unfurling them', () => {
    expect(placeLink('https://falchion.fly.dev/', { name: 'Karon Minor', q: -3, r: 7 })).toBe('<https://falchion.fly.dev/system/-3,7/Karon_Minor>');
    expect(placeLink('https://falchion.fly.dev', { name: 'x', q: 1.5, r: 0 })).toBe('');
    expect(placeLink('https://falchion.fly.dev', null)).toBe('');
  });
});
