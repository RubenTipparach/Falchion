import { describe, expect, it } from 'vitest';
import { clientKey, createCached, createConnectionCap, createRateLimiter } from './throttle.mjs';

describe('rate limits, caches and stream caps', () => {
  it('lets a burst through, then the refill rate, per key', () => {
    let t = 0;
    const lim = createRateLimiter({ capacity: 3, perSecond: 1, now: () => t });
    expect([lim.take('a'), lim.take('a'), lim.take('a')]).toEqual([0, 0, 0]);
    expect(lim.take('a')).toBe(1); // a second until the next one
    expect(lim.take('b')).toBe(0); // another client is not affected
    t += 1000;
    expect(lim.take('a')).toBe(0);
    expect(lim.take('a')).toBeGreaterThan(0);
    t += 60_000;
    expect([lim.take('a'), lim.take('a'), lim.take('a'), lim.take('a')]).toEqual([0, 0, 0, 1]); // never more than the bucket
  });

  it('forgets old clients past its key limit', () => {
    const lim = createRateLimiter({ capacity: 1, perSecond: 1, maxKeys: 100 });
    for (let i = 0; i < 1000; i++) lim.take(`k${i}`);
    expect(lim.size).toBeLessThanOrEqual(100);
  });

  it('computes a value once per window, shared by callers arriving together, and again after invalidate', async () => {
    let t = 0, calls = 0;
    const c = createCached({ ttlMs: 5000, now: () => t, compute: async () => ++calls });
    const [a, b] = await Promise.all([c.get(), c.get()]);
    expect([a, b, calls]).toEqual([1, 1, 1]);
    t += 4000;
    expect(await c.get()).toBe(1);
    t += 2000;
    expect(await c.get()).toBe(2);
    c.invalidate();
    expect(await c.get()).toBe(3);
  });

  it('does not keep a failure', async () => {
    let fail = true;
    const c = createCached({ ttlMs: 60_000, compute: async () => { if (fail) throw new Error('db'); return 'ok'; } });
    await expect(c.get()).rejects.toThrow('db');
    fail = false;
    expect(await c.get()).toBe('ok');
  });

  it('caps open streams per client and frees them as they close', () => {
    const cap = createConnectionCap(2);
    const r1 = cap.claim('a'), r2 = cap.claim('a');
    expect(cap.claim('a')).toBeNull();
    expect(cap.claim('b')).not.toBeNull();
    r1();
    r1(); // twice is once
    expect(cap.claim('a')).not.toBeNull();
    expect(cap.claim('a')).toBeNull();
    r2();
  });

  it('keys a request by player, else by address', () => {
    const req = (headers, ip = '10.0.0.9') => ({ headers, socket: { remoteAddress: ip } });
    expect(clientKey(req({}), { id: '42' })).toBe('u:42');
    expect(clientKey(req({ 'fly-client-ip': '1.2.3.4' }), null)).toBe('ip:1.2.3.4');
    expect(clientKey(req({ 'x-forwarded-for': '5.6.7.8, 10.0.0.1' }), null)).toBe('ip:5.6.7.8');
    expect(clientKey(req({}), null)).toBe('ip:10.0.0.9');
  });
});
