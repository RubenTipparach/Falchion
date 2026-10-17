/** Who the player is: a Discord account (via the Falchion server) or a local guest. */
export interface PlayerIdentity {
  readonly id: string;
  readonly displayName: string;
  readonly provider: 'discord' | 'guest';
  readonly avatar?: string | null;
  /** On the server's ADMIN_DISCORD_ID allowlist: sees the Admin link. */
  readonly admin?: boolean;
}

export interface IdentityProvider {
  signIn(): Promise<PlayerIdentity>;
}

/** What the server says about the current visitor. */
export interface SessionProbe {
  /** A Falchion server answered (false on static hosting or offline). */
  readonly server: boolean;
  /** Discord sign-in is configured on that server. */
  readonly authEnabled: boolean;
  readonly user: PlayerIdentity | null;
}

/** Guest: plays in this browser only. Keeps the original id so existing saves still load. */
export const GUEST: PlayerIdentity = { id: 'mock-0001', displayName: 'Commander', provider: 'guest' };

/** Ask the Falchion server who is signed in (cookie session from Discord OAuth). */
export async function probeSession(): Promise<SessionProbe> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2500);
    const res = await fetch('./api/me', { credentials: 'same-origin', cache: 'no-store', signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.headers.get('content-type')?.includes('json')) return { server: false, authEnabled: false, user: null };
    const body = await res.json();
    if (res.ok) return { server: true, authEnabled: true, user: { id: String(body.id), displayName: body.name, provider: 'discord', avatar: body.avatar ?? null, admin: !!body.admin } };
    return { server: true, authEnabled: !!body.authEnabled, user: null };
  } catch {
    return { server: false, authEnabled: false, user: null };
  }
}
