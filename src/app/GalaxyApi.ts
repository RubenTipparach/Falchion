import type { ActivityPlace, ReportKind } from '../core/social/Activity';

/** Recent galaxy activity, newest first (signed-in players only; unvalidated). */
export async function fetchActivity(): Promise<unknown[]> {
  try {
    const res = await fetch('./api/activity', { credentials: 'same-origin', cache: 'no-store' });
    const body: unknown = res.ok ? await res.json() : [];
    return Array.isArray(body) ? body : [];
  } catch {
    return [];
  }
}

/**
 * Tell the galaxy about your own news (founding, colonies, depots, battles, surveyed systems).
 * The server rate-limits it, logs it in the activity feed and posts battles, colonies and depots
 * to the Discord channel. Fire and forget.
 */
export function reportActivity(kind: ReportKind, text: string, place?: ActivityPlace): void {
  void fetch('./api/events', {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, text, place }),
  }).catch(() => { /* offline: the news stays local */ });
}
