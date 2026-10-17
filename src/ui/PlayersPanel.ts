import type { Flag } from '../core/empire/Identity';
import { splitOnPlace, type ActivityEvent, type ActivityPlace } from '../core/social/Activity';
import { relativeTime, type RosterKey } from '../core/social/Roster';
import { flagEl } from '../render/flag';
import { Drawer } from './Drawer';
import { fmt, h } from './dom';
import { icon } from './icons';
import { locateButton } from './widgets';

/** One fleet in an empire's card. `id` is the fleet's map id (prefixed for other players). */
export interface PlayerFleetRow {
  readonly id: string;
  readonly name: string;
  /** "On station at X" or "To X · ETA 3 min". */
  readonly where: string;
}

/** One empire in the roster, ready to show. */
export interface PlayerRow extends RosterKey {
  readonly discordName: string;
  readonly avatar: string | null;
  readonly color: string;
  readonly flag: Flag | null;
  readonly ruler: string;
  readonly title: string;
  readonly colonies: number;
  readonly fleets: readonly PlayerFleetRow[];
  /** Light years from your home to theirs (null when unknown). */
  readonly distance: number | null;
  readonly homeName: string | null;
  /** Your relation with them when not plain neutral: 'At war', 'War declared', 'Ally', 'Proposal', or 'Not met' before first contact. */
  readonly relation?: string;
}

/** What the Players panel needs from the game (implemented by the app layer). */
export interface PlayersContext {
  readonly signedIn: boolean;
  /** Where a guest signs in, or null when this server has no sign-in. */
  readonly signInUrl: string | null;
  /** Every empire, sorted (you first, online next, then by last seen). */
  rows(): readonly PlayerRow[];
  /** Galaxy activity, newest first. */
  activity(): readonly ActivityEvent[];
  /** A player's empire flag and colour as known now (for feed entries logged before they had one). */
  empireOf(playerId: string): { readonly flag: Flag | null; readonly color: string } | null;
  now(): number;
  locateHome(playerId: string, closeUp: boolean): void;
  locateFleet(fleetId: string, closeUp: boolean): void;
  message(playerId: string): void;
  teleport(place: ActivityPlace): void;
}

type View = 'empires' | 'galaxy';

const KIND_LABEL: Readonly<Record<ActivityEvent['kind'], string>> = {
  found: 'Founded', colony: 'Colony', depot: 'Depot', battle: 'Battle', survey: 'Survey', diplomacy: 'Diplomacy', online: 'Online', offline: 'Offline',
};

/** A flag, or a dot in the empire's colour before it has one. */
function emblem(flag: Flag | null, color: string, width: number): HTMLElement {
  return flag ? flagEl(flag, width) : h('span', { class: 'player-dot', style: `background:${color}` });
}

/**
 * Players drawer: every empire in the galaxy (flag, name, ruler, who is online, colonies,
 * fleets, last seen, distance) with locate, DM and fleet lists, plus a live Galaxy feed of
 * everyone's news. All player text is put in the page as text nodes.
 */
export class PlayersPanel extends Drawer {
  readonly tab: HTMLButtonElement;
  private readonly badge = h('span', { class: 'badge', hidden: true });
  private readonly seg = h('div', { class: 'seg', role: 'tablist' });
  private readonly list = h('div', { class: 'players-list' });
  private view: View = 'empires';
  private readonly expanded = new Set<string>();
  private unseen = 0;
  private flash: string | null = null;
  /** What the list and tabs show now: unchanged data is not redrawn, so a click is never lost to a redraw. */
  private shown = { seg: '', list: '' };

  constructor(private readonly ctx: PlayersContext) {
    super('players', 'Players', 'Every empire in the galaxy and what its commanders are doing. Locate a home or a fleet, or send a direct message.');
    this.tab = h('button', { class: 'tab', title: 'Players: every empire in the galaxy', 'aria-label': 'Players', onclick: () => this.toggle() },
      icon('players'), h('span', { class: 'tab-label' }, 'Players'), this.badge);
    this.el.classList.add('players-drawer');
    this.onChange((open) => { this.tab.classList.toggle('active', open); if (open && this.view === 'galaxy') this.markSeen(); });
    if (!ctx.signedIn) {
      this.body.append(h('div', { class: 'card chat-guest' },
        h('h4', {}, 'Galaxy offline'),
        h('p', {}, 'Sign in with Discord to see the other empires in the galaxy, who is online and what they are doing.'),
        ctx.signInUrl ? h('a', { class: 'btn discord', href: ctx.signInUrl }, 'Sign in with Discord') : h('p', { class: 'muted small' }, 'Needs the Falchion server (play at falchion.fly.dev).')));
      return;
    }
    this.body.append(this.seg, this.list);
    // Relative times stay current while the drawer is open.
    setInterval(() => { if (this.opened) this.render(); }, 30_000);
  }

  protected onOpen(): void {
    this.render();
  }

  /** Data changed: redraw if open. */
  refresh(): void {
    if (this.opened) this.render();
  }

  /** New live events from other players: counted on the tab until the feed is seen. */
  noteActivity(fresh: readonly ActivityEvent[]): void {
    if (!fresh.length) return;
    if (this.opened && this.view === 'galaxy') return this.render();
    this.unseen += fresh.length;
    this.renderBadge();
    this.refresh();
  }

  /** The feed is visible right now (new entries need no toast). */
  get feedVisible(): boolean {
    return this.opened && this.view === 'galaxy';
  }

  /** Open on an empire: its card expanded, scrolled into view and highlighted. */
  show(playerId: string): void {
    if (!this.ctx.signedIn) return void this.open();
    this.view = 'empires';
    this.expanded.add(playerId);
    this.flash = playerId;
    if (this.opened) this.render();
    else this.open();
    const card = this.list.querySelector<HTMLElement>(`[data-player="${CSS.escape(playerId)}"]`);
    card?.scrollIntoView({ block: 'center' });
    setTimeout(() => { this.flash = null; card?.classList.remove('flash'); }, 1_600);
  }

  private setView(v: View): void {
    this.view = v;
    if (v === 'galaxy') this.markSeen();
    this.render();
  }

  private markSeen(): void {
    this.unseen = 0;
    this.renderBadge();
  }

  private renderBadge(): void {
    this.badge.hidden = this.unseen === 0;
    this.badge.textContent = this.unseen > 9 ? '9+' : String(this.unseen);
    this.badge.title = `${this.unseen} new in the galaxy feed`;
  }

  private render(): void {
    if (!this.ctx.signedIn) return;
    const rows = this.ctx.rows();
    const online = rows.filter((r) => r.online).length;
    const btn = (v: View, label: string) => h('button', { class: `seg-btn ${this.view === v ? 'active' : ''}`, role: 'tab', 'aria-selected': this.view === v ? 'true' : 'false', onclick: () => this.setView(v) }, label);
    this.swap(this.seg, 'seg', [
      btn('empires', `Empires · ${rows.length}`),
      btn('galaxy', 'Galaxy feed'),
      h('span', { class: 'players-online small muted' }, h('span', { class: 'chat-dot on' }), ` ${online} online`)]);
    const scroll = this.list.scrollTop;
    this.swap(this.list, 'list', this.view === 'empires' ? this.empires(rows) : this.feed());
    this.list.scrollTop = scroll;
  }

  /** Replace a container's children only when the new ones would look different. */
  private swap(el: HTMLElement, key: keyof PlayersPanel['shown'], next: HTMLElement[]): void {
    const html = next.map((n) => n.outerHTML).join('');
    if (html === this.shown[key] && el.childElementCount === next.length) return;
    this.shown[key] = html;
    el.replaceChildren(...next);
  }

  // ── Empires ──

  private empires(rows: readonly PlayerRow[]): HTMLElement[] {
    return rows.length ? rows.map((r) => this.card(r)) : [h('p', { class: 'muted small' }, 'No other empires yet. Invite your friends!')];
  }

  private card(r: PlayerRow): HTMLElement {
    const now = this.ctx.now();
    const open = this.expanded.has(r.id);
    const ruler = [r.title, r.ruler].filter(Boolean).join(' ');
    const seen = r.online ? 'online now' : `seen ${relativeTime(r.lastSeen, now)}`;
    const facts = [
      `${r.colonies} ${r.colonies === 1 ? 'colony system' : 'colony systems'}`,
      `${r.fleets.length} ${r.fleets.length === 1 ? 'fleet' : 'fleets'}`,
      r.you ? 'your home' : r.distance === null ? 'distance unknown' : `${fmt(r.distance)} ly away`,
      seen,
    ];
    const toggle = () => { if (open) this.expanded.delete(r.id); else this.expanded.add(r.id); this.render(); };
    return h('section', { class: `player-card ${r.you ? 'you' : ''} ${r.online ? 'on' : ''} ${this.flash === r.id ? 'flash' : ''}`, 'data-player': r.id, style: `--empire:${r.color}` },
      h('header', {},
        emblem(r.flag, r.color, 36),
        h('div', { class: 'player-id' },
          h('div', { class: 'player-name' }, h('b', {}, r.empireName), r.you ? h('small', { class: 'tag' }, 'YOU') : '',
            r.relation ? h('small', { class: `tag relation ${r.relation === 'Ally' ? 'ally' : r.relation === 'Proposal' ? 'proposal' : r.relation === 'Not met' ? 'unmet' : 'war'}`, title: r.relation === 'Not met' ? 'No dealings before first contact: bring a fleet near their space' : 'Diplomacy: Empire › Relations' }, r.relation.toUpperCase()) : ''),
          h('div', { class: 'small muted' }, ruler ? `${ruler} · ` : '', h('span', { class: 'player-discord' }, r.discordName))),
        h('span', { class: `chat-dot ${r.online ? 'on' : ''}`, title: r.online ? 'In the game now' : 'Away' }),
        r.homeName ? locateButton(`Fly to ${r.you ? 'your' : `the ${r.empireName}'s`} home, ${r.homeName}`, (closeUp) => this.ctx.locateHome(r.id, closeUp)) : '',
        r.you ? '' : h('button', { class: 'chip', title: `Message ${r.discordName} privately`, onclick: () => this.ctx.message(r.id) }, 'DM')),
      h('div', { class: 'player-facts small' }, ...facts.map((f) => h('span', {}, f))),
      r.fleets.length
        ? h('button', { class: 'player-expand small', 'aria-expanded': open ? 'true' : 'false', onclick: toggle }, open ? '▾ Hide fleets' : `▸ Show ${r.fleets.length === 1 ? 'fleet' : 'fleets'}`)
        : '',
      open && r.fleets.length ? h('ul', { class: 'plain player-fleets' }, ...r.fleets.map((f) =>
        h('li', {}, icon('fleet'), h('div', {}, h('b', {}, f.name), h('div', { class: 'small muted' }, f.where)),
          locateButton(`Locate ${f.name}`, (closeUp) => this.ctx.locateFleet(f.id, closeUp))))) : '');
  }

  // ── Galaxy feed ──

  private feed(): HTMLElement[] {
    const events = this.ctx.activity();
    const now = this.ctx.now();
    return events.length
      ? [h('ol', { class: 'plain feed' }, ...events.map((e) => this.entry(e, now)))]
      : [h('p', { class: 'muted small' }, 'Nothing has happened yet. Found colonies, survey systems and win battles: the whole galaxy hears about it here.')];
  }

  private entry(e: ActivityEvent, now: number): HTMLElement {
    const current = this.ctx.empireOf(e.player.id);
    const color = e.empire?.color ?? current?.color ?? 'var(--chart)';
    const who = e.empire?.name || e.player.name;
    return h('li', { class: `feed-entry ${e.kind}` },
      emblem(current?.flag ?? null, color, 24),
      h('div', { class: 'feed-body' },
        h('div', {},
          h('button', { class: 'feed-who', style: `color:${color}`, title: `${e.player.name}: show in the empire list`, onclick: () => this.show(e.player.id) }, who),
          ' ', ...activityText(e, (p) => this.ctx.teleport(p))),
        h('div', { class: 'feed-meta small muted' },
          h('span', { class: 'feed-kind' }, KIND_LABEL[e.kind]),
          h('time', { datetime: new Date(e.at).toISOString(), title: new Date(e.at).toLocaleString() }, relativeTime(e.at, now)))));
  }
}

/** An event's text with its place name as a link that flies the camera there (text nodes only). */
export function activityText(e: ActivityEvent, teleport: (p: ActivityPlace) => void): Array<Node | string> {
  const parts = splitOnPlace(e);
  if (!parts || !e.place) return [e.text];
  const place = e.place;
  return [parts.before, h('button', { class: 'chat-link place', title: `Fly to ${place.name}`, onclick: () => teleport(place) }, parts.name), parts.after];
}
