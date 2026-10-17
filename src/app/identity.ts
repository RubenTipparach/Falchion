/** Who the player is. Discord OAuth / Embedded App SDK will implement this (change mmo-core-systems). */
export interface PlayerIdentity {
  readonly id: string;
  readonly displayName: string;
  readonly provider: 'discord' | 'mock';
}

export interface IdentityProvider {
  signIn(): Promise<PlayerIdentity>;
}

/** Local stand-in until Discord sign-in is built. */
export class MockDiscordIdentityProvider implements IdentityProvider {
  async signIn(): Promise<PlayerIdentity> {
    return { id: 'mock-0001', displayName: 'Commander', provider: 'mock' };
  }
}
