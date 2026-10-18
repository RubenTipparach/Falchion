import type { GameState } from '../app/GameState';
import type { Store } from '../app/Store';
import { RESOURCES, type Resource } from '../content/resources';
import type { LedgerEntry, TurnReport } from '../core/economy/Economy';
import { h, fmt } from './dom';
import { icon, resourceIcon } from './icons';

/** What the ledger reads from the game: next year's economy (a pure forecast) and storage caps. */
export interface LedgerSource {
  forecast(): TurnReport;
  caps(): Partial<Record<Resource, number>>;
}

/** The heading adjustments go under (stability, famine, a full or empty store). */
const ADJUSTMENTS = 'Adjustments';

/**
 * Where a resource comes from and where it goes (change resource-ledger): opened from a resource
 * in the top bar. Income and costs come from the yearly economy itself, item by item; recent
 * one-off changes (purchases, sales, loot, plunder) from the save's flow log.
 */
export class ResourceLedger {
  private readonly el = h('div', { class: 'ledger', role: 'dialog', hidden: true });
  private resource: Resource | null = null;
  private anchor: HTMLElement | null = null;

  constructor(private readonly store: Store<GameState>, private readonly source: LedgerSource) {
    document.body.append(this.el);
    store.subscribe((s, prev) => {
      if (this.resource && (s.empire.materials !== prev.empire.materials || s.turn !== prev.turn || s.economy !== prev.economy || s.flows !== prev.flows)) this.render();
    });
    document.addEventListener('pointerdown', (e) => {
      if (!this.resource) return;
      const t = e.target as Node;
      if (!this.el.contains(t) && !this.anchor?.contains(t)) this.close();
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.close(); });
    window.addEventListener('resize', () => this.place());
  }

  /** Open the ledger for a resource under the element clicked, or close it if it is already open. */
  toggle(r: Resource, anchor: HTMLElement): void {
    if (this.resource === r) return this.close();
    this.resource = r;
    this.anchor = anchor;
    this.el.hidden = false;
    this.render();
    this.place();
  }

  close(): void {
    this.resource = null;
    this.anchor = null;
    this.el.hidden = true;
  }

  private place(): void {
    if (!this.anchor || this.el.hidden) return;
    // On a phone the ledger is a sheet along the bottom (CSS); on a wide screen it hangs under the resource.
    if (window.innerWidth <= 720) { this.el.style.left = ''; this.el.style.top = ''; return; }
    const a = this.anchor.getBoundingClientRect();
    const w = this.el.offsetWidth || 340;
    this.el.style.left = `${Math.max(8, Math.min(window.innerWidth - w - 8, a.left + a.width / 2 - w / 2))}px`;
    this.el.style.top = `${a.bottom + 6}px`;
  }

  private render(): void {
    const r = this.resource;
    if (!r) return;
    const s = this.store.state;
    const def = RESOURCES.find((x) => x.id === r)!;
    const stock = s.empire.materials[r];
    const cap = this.source.caps()[r];
    const report = this.source.forecast();
    const items = (report.ledger ?? []).filter((e) => e.r === r);
    const net = items.reduce((n, e) => n + e.n, 0);
    const income = items.filter((e) => e.n > 0 && e.group !== ADJUSTMENTS);
    const costs = items.filter((e) => e.n < 0 && e.group !== ADJUSTMENTS);
    const adjust = items.filter((e) => e.group === ADJUSTMENTS);
    const flows = (s.flows ?? []).filter((f) => f.r === r).slice(0, 8);
    // Keep groups the player opened or closed as they were when the ledger refreshes (every year).
    const was = new Map([...this.el.querySelectorAll<HTMLDetailsElement>('details[data-group]')].map((d) => [d.dataset.group!, d.open]));
    const section = (title: string, es: readonly LedgerEntry[], tone: string) => sectionOf(title, es, tone, (g, dflt) => was.get(`${title}/${g}`) ?? dflt);
    const full = cap !== undefined && stock >= cap;
    // A year passes every minute: how long until the store fills or runs dry at this rate.
    const eta = net > 0 && cap !== undefined && !full ? `full in ${Math.ceil((cap - stock) / net)} yr` : net < 0 && stock > 0 ? `empty in ${Math.ceil(stock / -net)} yr` : '';
    this.el.replaceChildren(
      h('header', { class: 'ledger-head' },
        resourceIcon(r, 20),
        h('div', {},
          h('b', {}, def.name),
          h('div', { class: 'small muted' }, `${fmt(stock)}${cap !== undefined ? ` of ${fmt(cap)} storage` : ''}`, full ? h('span', { class: 'red' }, ' · full: income is lost') : '')),
        h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: () => this.close() }, icon('close'))),
      h('div', { class: `ledger-net ${net > 0 ? 'up' : net < 0 ? 'down' : ''}` },
        h('span', {}, 'Each year'), h('b', { class: 'mono' }, `${net > 0 ? '+' : ''}${fmt(net)}`), eta ? h('small', { class: 'muted' }, eta) : ''),
      section('Income', income, 'up'),
      section('Costs', costs, 'down'),
      section('Adjustments', adjust, ''),
      !income.length && !costs.length ? h('p', { class: 'small muted' }, `Nothing makes or uses ${def.name.toLowerCase()} each year yet. ${def.source}.`) : '',
      flows.length ? h('section', { class: 'ledger-sec' },
        h('h5', {}, 'Recent'),
        h('ul', { class: 'ledger-list' }, ...flows.map((f) => h('li', {},
          h('span', { class: 'ledger-label' }, h('small', { class: 'muted' }, `Y${f.turn} `), f.what),
          h('span', { class: `mono ${f.n > 0 ? 'green' : 'red'}` }, `${f.n > 0 ? '+' : ''}${fmt(f.n)}`))))) : '',
      h('p', { class: 'ledger-foot small muted' }, 'Forecast for next year from your colonies, ships and policies now.'),
    );
  }
}

/** Items grouped under their headings, biggest first, each with a subtotal. */
function sectionOf(title: string, items: readonly LedgerEntry[], tone: string, isOpen: (group: string, dflt: boolean) => boolean): HTMLElement | string {
  if (!items.length) return '';
  const groups = new Map<string, LedgerEntry[]>();
  for (const e of items) groups.set(e.group, [...(groups.get(e.group) ?? []), e]);
  const total = (es: readonly LedgerEntry[]) => es.reduce((n, e) => n + e.n, 0);
  const sorted = [...groups.entries()].sort((a, b) => Math.abs(total(b[1])) - Math.abs(total(a[1])));
  const sign = (n: number) => `${n > 0 ? '+' : ''}${fmt(n)}`;
  return h('section', { class: 'ledger-sec' },
    h('h5', {}, title, h('span', { class: `mono ${tone === 'up' ? 'green' : tone === 'down' ? 'red' : ''}` }, sign(total(items)))),
    ...sorted.map(([group, es]) => {
      // A group with one item that says the same as its heading is one line.
      const lone = es.length === 1 && (es[0].label === group || title === 'Adjustments');
      return lone
        ? h('div', { class: 'ledger-row' }, h('span', { class: 'ledger-label' }, es[0].label), h('span', { class: 'mono' }, sign(es[0].n)))
        : h('details', { class: 'ledger-group', 'data-group': `${title}/${group}`, open: isOpen(group, sorted.length <= 3) },
          h('summary', {}, h('span', { class: 'ledger-label' }, group), h('span', { class: 'mono' }, sign(total(es)))),
          h('ul', { class: 'ledger-list' }, ...merge(es).map((e) => h('li', {}, h('span', { class: 'ledger-label' }, e.label), h('span', { class: 'mono' }, sign(e.n))))));
    }));
}

/** Items with the same label under one heading are added together (two farms: one line). */
function merge(es: readonly LedgerEntry[]): LedgerEntry[] {
  const out = new Map<string, LedgerEntry>();
  for (const e of es) {
    const had = out.get(e.label);
    out.set(e.label, had ? { ...had, n: had.n + e.n } : e);
  }
  return [...out.values()];
}
