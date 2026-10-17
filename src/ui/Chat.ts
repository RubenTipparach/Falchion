import {
  findMentions, findPlaces, matchTerms, mentionQuery, suggestPeople, threadOf,
  type ChatMessage, type ChatPlace, type ChatUser, type Term,
} from '../core/chat/ChatText';
import { Drawer } from './Drawer';
import { h } from './dom';
import { icon } from './icons';

export type SendResult = { readonly ok: true; readonly message: ChatMessage } | { readonly ok: false; readonly error: string };

/** Where messages go (implemented by the app layer over the server's chat API). */
export interface ChatBackend {
  send(to: string, text: string, mentions: string[], places: ChatPlace[]): Promise<SendResult>;
}

/** What the chat needs from the game. */
export interface ChatContext {
  /** The signed-in player; null for guests, who cannot chat. */
  readonly me: ChatUser | null;
  /** Where a guest signs in, or null when this server has no sign-in. */
  readonly signInUrl: string | null;
  /** Locations this player knows (for links when sending and reading). */
  knownPlaces(): ChatPlace[];
  /** A player's home star, if known. */
  homeOf(playerId: string): ChatPlace | null;
  /** Fly the camera to a place and select it. */
  teleport(place: ChatPlace): void;
}

type Link =
  | { readonly kind: 'place'; readonly place: ChatPlace }
  | { readonly kind: 'mention'; readonly id: string }
  | { readonly kind: 'player'; readonly id: string };

interface Thread {
  readonly id: string;
  messages: ChatMessage[];
  unread: number;
  /** Has a DM or a mention of you that is unread. */
  hot: boolean;
}

const KEEP = 300;
const time = (at: number) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/**
 * Comms drawer: global chat and direct messages, who is online, @mention autocomplete, and
 * location links (names of known stars and planets fly the camera there). All user text is
 * put in the page as text nodes, never as HTML.
 */
export class ChatPanel extends Drawer {
  readonly tab: HTMLButtonElement;
  private readonly badge = h('span', { class: 'badge', hidden: true });
  private readonly threadsEl = h('div', { class: 'chat-threads seg', role: 'tablist' });
  private readonly listEl = h('div', { class: 'chat-list', role: 'log', 'aria-live': 'polite' });
  private readonly peopleEl = h('div', { class: 'chat-people' });
  private readonly input = h('input', { class: 'chat-input', maxlength: 500, autocomplete: 'off', 'aria-label': 'Message' });
  private readonly suggestEl = h('ul', { class: 'chat-suggest', role: 'listbox', hidden: true });
  private readonly statusEl = h('div', { class: 'chat-status small muted' });
  private readonly threads = new Map<string, Thread>();
  private readonly seen = new Set<string>();
  private readonly names = new Map<string, string>();
  private active = 'global';
  private online: ChatUser[] = [];
  private players: ChatUser[] = [];
  private picked: ChatUser[] = [];
  private suggestions: ChatUser[] = [];
  private choice = 0;
  private live = false;
  private firstLoad = true;
  private peopleOpen = true;
  private sending = false;

  constructor(private readonly ctx: ChatContext, private readonly backend: ChatBackend | null) {
    super('chat', 'Comms', 'Global chat and direct messages. Names of stars and planets you know become links that fly you there; @name pings a player, on Discord if they are away.');
    this.tab = h('button', { class: 'tab', title: 'Chat with other commanders', onclick: () => this.toggle() }, icon('chat'), h('span', {}, 'Chat'), this.badge);
    this.el.classList.add('chat-drawer');
    this.body.classList.add('chat-body');
    this.onChange((open) => {
      this.tab.classList.toggle('active', open);
      if (open) { this.markRead(); this.scrollToEnd(); if (this.ctx.me) this.input.focus({ preventScroll: true }); }
    });
    if (!ctx.me || !backend) { this.renderGuest(); return; }
    this.threads.set('global', { id: 'global', messages: [], unread: 0, hot: false });
    this.input.addEventListener('input', () => this.updateSuggest());
    this.input.addEventListener('keydown', (e) => this.onKey(e));
    this.input.addEventListener('blur', () => setTimeout(() => this.hideSuggest(), 150));
    const form = h('form', { class: 'chat-compose', onsubmit: (e: Event) => { e.preventDefault(); void this.send(); } },
      this.suggestEl, this.input, h('button', { class: 'btn primary', type: 'submit' }, 'Send'));
    this.body.append(this.peopleEl, this.threadsEl, this.listEl, form, this.statusEl);
    this.renderPeople();
    this.renderThreads();
    this.renderList();
    this.setStatus(false);
  }

  // ── Inputs from the app ──

  /** Add messages (live or history); duplicates are ignored. */
  receive(list: readonly ChatMessage[], backfill = false): void {
    const me = this.ctx.me?.id;
    if (!me) return;
    let append: ChatMessage[] | null = [];
    for (const m of [...list].sort((a, b) => a.at - b.at)) {
      if (this.seen.has(m.id)) continue;
      this.seen.add(m.id);
      this.names.set(m.from.id, m.from.name);
      const t = this.thread(threadOf(m, me));
      let i = t.messages.length;
      while (i > 0 && t.messages[i - 1].at > m.at) i--;
      t.messages.splice(i, 0, m);
      if (t.messages.length > KEEP) t.messages.shift();
      const visible = this.opened && t.id === this.active;
      if (!visible && m.from.id !== me && !(backfill && this.firstLoad)) {
        t.unread++;
        if (t.id !== 'global' || m.mentions.includes(me)) t.hot = true;
      }
      if (t.id === this.active) {
        if (append && i === t.messages.length - 1) append.push(m);
        else append = null;
      }
    }
    if (backfill) this.firstLoad = false;
    if (append === null) this.renderList();
    else if (append.length) this.appendMessages(append);
    this.renderThreads();
    this.renderBadge();
  }

  setOnline(list: readonly ChatUser[]): void {
    this.online = [...list];
    for (const u of list) this.names.set(u.id, u.name);
    this.renderPeople();
    this.renderThreads();
  }

  /** Every known player (for autocomplete and DMs), from /api/players. */
  setPlayers(list: readonly ChatUser[]): void {
    this.players = [...list];
    for (const u of list) if (!this.names.has(u.id)) this.names.set(u.id, u.name);
    this.renderPeople();
    this.renderThreads();
    if (this.opened) this.renderList(); // their names now link to their homes
  }

  setStatus(live: boolean): void {
    this.live = live;
    this.statusEl.classList.remove('warn');
    this.statusEl.textContent = live
      ? 'Enter to send · @ to mention a player · names of places you know become links'
      : 'Connecting to comms…';
  }

  /** Open (or start) a direct-message thread with a player. */
  openThread(id: string): void {
    if (!this.ctx.me) return;
    if (id !== 'global') this.thread(id);
    this.active = id;
    this.picked = [];
    if (!this.opened) this.open();
    this.markRead();
    this.renderThreads();
    this.renderList();
    this.input.focus({ preventScroll: true });
  }

  // ── Threads, people, messages ──

  private thread(id: string): Thread {
    let t = this.threads.get(id);
    if (!t) this.threads.set(id, (t = { id, messages: [], unread: 0, hot: false }));
    return t;
  }

  private nameOf(id: string): string {
    if (id === this.ctx.me?.id) return this.ctx.me.name;
    return this.online.find((u) => u.id === id)?.name ?? this.players.find((u) => u.id === id)?.name ?? this.names.get(id) ?? 'Commander';
  }

  /** Everyone chat knows: you, online players, then all players (each once). */
  private people(): ChatUser[] {
    const out = new Map<string, ChatUser>();
    for (const u of [...(this.ctx.me ? [this.ctx.me] : []), ...this.online, ...this.players]) if (!out.has(u.id)) out.set(u.id, u);
    return [...out.values()];
  }

  private markRead(): void {
    const t = this.threads.get(this.active);
    if (!t || !this.opened) return;
    t.unread = 0;
    t.hot = false;
    this.renderThreads();
    this.renderBadge();
  }

  private renderBadge(): void {
    const all = [...this.threads.values()];
    const n = all.reduce((s, t) => s + t.unread, 0);
    this.badge.hidden = n === 0;
    this.badge.textContent = n > 99 ? '99+' : String(n);
    this.badge.classList.toggle('hot', all.some((t) => t.hot && t.unread > 0));
    this.badge.title = `${n} unread message${n === 1 ? '' : 's'}`;
  }

  private renderThreads(): void {
    if (!this.ctx.me) return;
    const last = (t: Thread) => t.messages[t.messages.length - 1]?.at ?? Number.MAX_SAFE_INTEGER;
    const dms = [...this.threads.values()].filter((t) => t.id !== 'global').sort((a, b) => last(b) - last(a));
    const chip = (t: Thread, label: string, online: boolean | null) =>
      h('button', { class: `seg-btn chat-thread ${t.id === this.active ? 'active' : ''}`, role: 'tab', 'aria-selected': t.id === this.active ? 'true' : 'false', onclick: () => this.openThread(t.id) },
        online === null ? icon('galaxy') : h('span', { class: `chat-dot ${online ? 'on' : ''}` }),
        h('span', {}, label),
        t.unread ? h('span', { class: `badge ${t.hot ? 'hot' : ''}` }, String(t.unread)) : '');
    this.threadsEl.replaceChildren(chip(this.thread('global'), 'Global', null),
      ...dms.map((t) => chip(t, this.nameOf(t.id), this.online.some((u) => u.id === t.id))));
    const name = this.active === 'global' ? 'everyone' : this.nameOf(this.active);
    this.input.placeholder = this.active === 'global' ? 'Message everyone…' : `Message ${name} privately…`;
  }

  private renderPeople(): void {
    if (!this.ctx.me) return;
    const me = this.ctx.me.id;
    const onIds = new Set(this.online.map((u) => u.id));
    const others = this.players.filter((p) => !onIds.has(p.id) && p.id !== me).sort((a, b) => a.name.localeCompare(b.name));
    const online = [...this.online].sort((a, b) => (a.id === me ? -1 : b.id === me ? 1 : a.name.localeCompare(b.name)));
    const row = (u: ChatUser, on: boolean) => {
      const home = this.ctx.homeOf(u.id);
      const self = u.id === me;
      return h('li', { class: `chat-person ${on ? 'on' : ''}` },
        h('span', { class: `chat-dot ${on ? 'on' : ''}`, title: on ? 'In the game now' : 'Away (mentions reach them on Discord)' }),
        u.avatar ? h('img', { class: 'avatar small', src: u.avatar, alt: '' }) : h('span', { class: 'avatar small' }, u.name.slice(0, 1)),
        self ? h('span', { class: 'chat-person-name' }, u.name, h('small', { class: 'muted' }, ' (you)'))
          : h('button', { class: 'chat-person-name', title: `Message ${u.name}`, onclick: () => this.openThread(u.id) }, u.name),
        home ? h('button', { class: 'icon-btn', title: `Fly to ${self ? 'your' : `${u.name}'s`} home, ${home.name}`, 'aria-label': `Fly to ${u.name}'s home`, onclick: () => this.ctx.teleport(home) }, icon('locate')) : '',
        self ? '' : h('button', { class: 'chip', onclick: () => this.openThread(u.id) }, 'DM'));
    };
    const list = h('ul', { class: 'plain chat-people-list' }, ...online.map((u) => row(u, true)), ...others.map((u) => row(u, false)));
    list.classList.toggle('hidden', !this.peopleOpen);
    this.peopleEl.replaceChildren(
      h('button', { class: 'chat-people-head', 'aria-expanded': this.peopleOpen ? 'true' : 'false', onclick: () => { this.peopleOpen = !this.peopleOpen; this.renderPeople(); } },
        h('span', { class: 'eyebrow' }, `Online · ${this.online.length}`),
        h('span', { class: 'muted small' }, this.peopleOpen ? 'Hide' : `Show${others.length ? ` (+${others.length} away)` : ''}`)),
      list);
  }

  private renderList(): void {
    if (!this.ctx.me) return;
    const t = this.thread(this.active);
    const known = this.ctx.knownPlaces();
    this.listEl.replaceChildren(...(t.messages.length
      ? t.messages.map((m) => this.messageEl(m, known))
      : [h('p', { class: 'muted small chat-empty' }, this.active === 'global'
        ? 'No messages yet. Say hello to the galaxy.'
        : `Direct messages with ${this.nameOf(this.active)} are private to the two of you.`)]));
    this.scrollToEnd();
  }

  private appendMessages(list: ChatMessage[]): void {
    const atEnd = this.listEl.scrollHeight - this.listEl.scrollTop - this.listEl.clientHeight < 80;
    this.listEl.querySelector('.chat-empty')?.remove();
    const known = this.ctx.knownPlaces();
    this.listEl.append(...list.map((m) => this.messageEl(m, known)));
    if (atEnd || list.some((m) => m.from.id === this.ctx.me?.id)) this.scrollToEnd();
  }

  private scrollToEnd(): void {
    this.listEl.scrollTop = this.listEl.scrollHeight;
  }

  private messageEl(m: ChatMessage, known: readonly ChatPlace[]): HTMLElement {
    const me = this.ctx.me!.id;
    const home = this.ctx.homeOf(m.from.id);
    const who = home
      ? h('button', { class: 'chat-name', title: `Fly to ${m.from.name}'s home, ${home.name}`, onclick: () => this.ctx.teleport(home) }, m.from.name)
      : h('span', { class: 'chat-name' }, m.from.name);
    const when = h('time', { class: 'mono', datetime: new Date(m.at).toISOString(), title: new Date(m.at).toLocaleString() }, time(m.at));
    const reply = m.from.id !== me && m.to === 'global'
      ? h('button', { class: 'chat-reply', title: `Message ${m.from.name} privately`, onclick: () => this.openThread(m.from.id) }, 'DM') : '';
    return h('div', { class: `chat-msg ${m.from.id === me ? 'mine' : ''} ${m.mentions.includes(me) ? 'for-me' : ''}`, 'data-id': m.id },
      h('div', { class: 'chat-meta' }, who, when, reply),
      h('div', { class: 'chat-text' }, ...this.segments(m, known)));
  }

  /** The message text with mentions, places and player names as links (text nodes only). */
  private segments(m: ChatMessage, known: readonly ChatPlace[]): Array<Node | string> {
    const me = this.ctx.me!.id;
    const people = this.people();
    const terms: Term<Link>[] = [
      ...m.mentions.map((id) => ({ name: `@${this.nameOf(id)}`, value: { kind: 'mention', id } as Link })),
      ...people.map((p) => ({ name: `@${p.name}`, value: { kind: 'mention', id: p.id } as Link })),
      ...m.places.map((place) => ({ name: place.name, value: { kind: 'place', place } as Link })),
      ...known.map((place) => ({ name: place.name, value: { kind: 'place', place } as Link })),
      ...people.filter((p) => this.ctx.homeOf(p.id)).map((p) => ({ name: p.name, value: { kind: 'player', id: p.id } as Link })),
    ];
    return matchTerms(m.text, terms).map((s) => {
      if (s.kind === 'text') return s.text;
      const v = s.value;
      if (v.kind === 'place') {
        return h('button', { class: 'chat-link place', title: `Fly to ${v.place.name}`, onclick: () => this.ctx.teleport(v.place) }, s.text);
      }
      const home = this.ctx.homeOf(v.id);
      const go = home ? () => this.ctx.teleport(home) : undefined;
      const title = home ? `Fly to ${this.nameOf(v.id)}'s home, ${home.name}` : this.nameOf(v.id);
      if (v.kind === 'mention') return h(home ? 'button' : 'span', { class: `chat-mention ${v.id === me ? 'me' : ''}`, title, onclick: go }, s.text);
      return h('button', { class: 'chat-link player', title, onclick: go }, s.text);
    });
  }

  // ── Composer ──

  private async send(): Promise<void> {
    const me = this.ctx.me;
    const text = this.input.value.trim();
    if (!me || !this.backend || !text || this.sending) return;
    const people = [...this.picked, ...this.people()].filter((p) => p.id !== me.id);
    const mentions = findMentions(text, people);
    const places = findPlaces(text, this.ctx.knownPlaces());
    this.sending = true;
    const r = await this.backend.send(this.active, text, mentions, places);
    this.sending = false;
    if (r.ok) {
      this.input.value = '';
      this.picked = [];
      this.hideSuggest();
      this.receive([r.message]);
      this.setStatus(this.live);
    } else {
      this.statusEl.textContent = r.error;
      this.statusEl.classList.add('warn');
    }
  }

  private updateSuggest(): void {
    const me = this.ctx.me?.id;
    const q = mentionQuery(this.input.value, this.input.selectionStart ?? this.input.value.length);
    if (!q || !me) return this.hideSuggest();
    const onIds = new Set(this.online.map((u) => u.id));
    const pool = [...this.online.filter((u) => u.id !== me), ...this.players.filter((p) => p.id !== me && !onIds.has(p.id))];
    this.suggestions = suggestPeople(q.query, pool);
    if (!this.suggestions.length) return this.hideSuggest();
    this.choice = Math.min(this.choice, this.suggestions.length - 1);
    this.suggestEl.replaceChildren(...this.suggestions.map((u, i) =>
      h('li', { class: `chat-suggestion ${i === this.choice ? 'active' : ''}`, role: 'option', 'aria-selected': i === this.choice ? 'true' : 'false',
        onmousedown: (e: Event) => { e.preventDefault(); this.accept(u); } },
        h('span', { class: `chat-dot ${onIds.has(u.id) ? 'on' : ''}` }), h('span', {}, u.name), onIds.has(u.id) ? h('small', { class: 'muted' }, 'online') : '')));
    this.suggestEl.hidden = false;
  }

  private hideSuggest(): void {
    this.suggestEl.hidden = true;
    this.suggestions = [];
    this.choice = 0;
  }

  /** Replace the `@query` being typed with `@Name ` and remember who was picked. */
  private accept(u: ChatUser): void {
    const caret = this.input.selectionStart ?? this.input.value.length;
    const q = mentionQuery(this.input.value, caret);
    if (!q) return;
    const v = this.input.value;
    const insert = `@${u.name} `;
    this.input.value = v.slice(0, q.start) + insert + v.slice(caret);
    const pos = q.start + insert.length;
    this.input.setSelectionRange(pos, pos);
    if (!this.picked.some((p) => p.id === u.id)) this.picked.unshift(u);
    this.hideSuggest();
    this.input.focus();
  }

  private onKey(e: KeyboardEvent): void {
    e.stopPropagation(); // typing here never drives the map shortcuts
    if (this.suggestEl.hidden || !this.suggestions.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = this.suggestions.length;
      this.choice = (this.choice + (e.key === 'ArrowDown' ? 1 : n - 1)) % n;
      this.updateSuggest();
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      this.accept(this.suggestions[this.choice]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      this.hideSuggest();
    }
  }

  private renderGuest(): void {
    this.body.replaceChildren(h('div', { class: 'card chat-guest' },
      h('h4', {}, 'Comms offline'),
      h('p', {}, 'Sign in with Discord to chat with other commanders, send direct messages and share locations.'),
      this.ctx.signInUrl ? h('a', { class: 'btn discord', href: this.ctx.signInUrl }, 'Sign in with Discord') : h('p', { class: 'muted small' }, 'Chat needs the Falchion server (play at falchion.fly.dev).')));
  }
}
