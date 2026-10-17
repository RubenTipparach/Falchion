import { SHIP_STYLES } from '../../content/shipStyles';
import type { GameState } from '../../app/GameState';
import type { Store } from '../../app/Store';
import { sciencePerTurn, EconomyTables } from '../../core/economy/Economy';
import type { TechTree } from '../../core/research/TechTree';
import type { Availability, BranchDef, DomainDef, DomainId, Grant, TechNode } from '../../core/research/types';
import { SHARD_SOURCES } from '../../content/shardSources';
import { SHIP_CLASSES } from '../../content/shipClasses';
import { Drawer } from '../Drawer';
import type { GameActions } from '../GameActions';
import { clear, h } from '../dom';

const SLOT = 104; // px per half-column
const NODE_W = 94;
const NODE_H = 58;
const ROW_H = 70;
const TOP = 40;

interface Placed { node: TechNode; x: number; y: number }

const STATUS_LABEL: Record<Availability, string> = {
  researched: 'Researched', researchable: 'Ready to research', available: 'Collecting shards',
  unavailable: 'Prerequisites unmet', locked: 'Locked',
};

/** Seven research areas × five branches, crossovers between branches, shard progress and a yearly focus. */
export class ResearchPanel extends Drawer {
  private readonly tabs = h('div', { class: 'seg' });
  private readonly summary = h('div', { class: 'research-summary' });
  private readonly canvas = h('div', { class: 'tree-canvas' });
  private readonly scroll = h('div', { class: 'tree-scroll' }, this.canvas);
  private readonly detail = h('div', { class: 'tree-detail' });
  private domain: DomainId | 'overview' = 'overview';
  private selected = 'x-hive-mind';
  private readonly layouts = new Map<DomainId, { placed: Placed[]; height: number }>();

  constructor(
    private readonly store: Store<GameState>,
    private readonly actions: GameActions,
    private readonly tree: TechTree,
    private readonly branches: readonly BranchDef[],
    private readonly domains: readonly DomainDef[],
    private readonly tables: EconomyTables,
  ) {
    super('research', 'Research', `${tree.nodes.length} technologies in seven areas. Shards come from science, exploration, espionage, reverse engineering and observation.`, true);
    for (const d of domains) this.layouts.set(d.id, this.computeLayout(d.id));
    this.body.append(this.summary, this.tabs, this.scroll, this.detail);
    store.subscribe((s, prev) => {
      if ((s.empire.research !== prev.empire.research || s.economy !== prev.economy) && this.opened) this.render();
    });
  }

  protected onOpen(): void {
    this.render();
  }

  /** Open on one technology: its area, selected, scrolled into view (e.g. what a locked item needs). */
  focusNode(nodeId: string): void {
    const node = this.tree.nodes.find((n) => n.id === nodeId);
    if (!node) return;
    this.selected = node.id;
    this.domain = node.domain;
    if (!this.opened) this.open();
    else this.render();
    this.canvas.querySelector('.tnode.selected')?.scrollIntoView({ block: 'center', inline: 'center' });
  }

  private computeLayout(domain: DomainId): { placed: Placed[]; height: number } {
    const nodes = this.tree.nodes.filter((n) => n.domain === domain);
    const col = new Map(this.branches.map((b, i) => [b.id, i]));
    const tiers = [...new Set(nodes.map((n) => n.tier))].sort((a, b) => a - b);
    const placed: Placed[] = [];
    let y = TOP;
    for (const tier of tiers) {
      const inTier = nodes.filter((n) => n.tier === tier);
      let rows = 1;
      for (const b of this.branches) {
        const cell = inTier.filter((n) => n.branch === b.id && !n.crossover);
        rows = Math.max(rows, Math.ceil(cell.length / 2));
        cell.forEach((n, i) => {
          const c = col.get(b.id)!;
          const x = cell.length === 1 ? c * 2 * SLOT + SLOT * 0.5 : (c * 2 + (i % 2)) * SLOT;
          placed.push({ node: n, x: x + 5, y: y + Math.floor(i / 2) * ROW_H });
        });
      }
      for (const n of inTier.filter((n) => n.crossover)) {
        const idx = n.crossover!.map((b) => col.get(b)!);
        const boundary = (Math.min(...idx) + Math.max(...idx) + 1) * SLOT;
        placed.push({ node: n, x: boundary - NODE_W / 2 + 5, y });
      }
      y += rows * ROW_H + 14;
    }
    return { placed, height: y };
  }

  private render(): void {
    const s = this.store.state;
    const state = s.empire.research;
    const focus = s.economy.focus ? this.tree.node(s.economy.focus) : null;
    const science = sciencePerTurn({ ...s.economy, stock: s.empire.materials }, this.tables, state);
    this.summary.replaceChildren(
      h('div', { class: 'kv' }, h('span', {}, 'Researched'), h('b', {}, `${state.researched.length} / ${this.tree.nodes.length}`)),
      h('div', { class: 'kv' }, h('span', {}, 'Science'), h('b', {}, `+${science} shards / yr`)),
      h('div', { class: 'kv grow' }, h('span', {}, 'Focus'), h('b', {}, focus ? focus.name : 'None — pick a node and press Set focus')),
    );
    this.tabs.replaceChildren(
      this.tabButton('overview', 'Overview'),
      ...this.domains.map((d) => this.tabButton(d.id, d.name)),
    );
    clear(this.canvas);
    if (this.domain === 'overview') this.renderOverview();
    else this.renderDomain(this.domain);
    this.renderDetail();
  }

  private tabButton(id: DomainId | 'overview', label: string): HTMLButtonElement {
    return h('button', { class: `seg-btn ${this.domain === id ? 'active' : ''}`, onclick: () => { this.domain = id; this.render(); this.scroll.scrollTop = 0; } }, label);
  }

  private renderOverview(): void {
    const state = this.store.state.empire.research;
    this.canvas.style.width = '';
    this.canvas.style.height = '';
    const grid = h('div', { class: 'overview-grid', style: `grid-template-columns: 170px repeat(${this.branches.length}, 1fr)` },
      h('span', {}), ...this.branches.map((b) => h('span', { class: 'ov-head', style: `color:${b.color}` }, b.name)));
    for (const d of this.domains) {
      grid.append(h('button', { class: 'ov-domain', onclick: () => { this.domain = d.id; this.render(); } }, h('b', {}, d.name), h('small', {}, d.blurb)));
      for (const b of this.branches) {
        const nodes = this.tree.nodes.filter((n) => n.domain === d.id && n.branch === b.id);
        const done = nodes.filter((n) => state.researched.includes(n.id)).length;
        const ready = nodes.filter((n) => this.tree.availability(state, n.id) === 'researchable').length;
        grid.append(h('button', { class: 'ov-cell', style: `--branch:${b.color}`, onclick: () => { this.domain = d.id; this.render(); } },
          h('span', { class: 'ov-count' }, `${done}/${nodes.length}`),
          h('span', { class: 'tbar' }, h('i', { style: `width:${nodes.length ? (done / nodes.length) * 100 : 0}%` })),
          ready ? h('span', { class: 'ov-ready' }, `${ready} ready`) : null));
      }
    }
    this.canvas.append(grid);
  }

  private renderDomain(domain: DomainId): void {
    const state = this.store.state.empire.research;
    const focus = this.store.state.economy.focus;
    const { placed, height } = this.layouts.get(domain)!;
    const width = this.branches.length * 2 * SLOT + 10;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    const pos = new Map(placed.map((p) => [p.node.id, p]));
    this.branches.forEach((b, i) => {
      this.canvas.append(h('div', { class: 'branch-head', style: `left:${i * 2 * SLOT}px;width:${2 * SLOT}px;color:${b.color};border-color:${b.color}` }, b.name));
    });
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('class', 'tree-links');
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));
    const link = (from: string, to: string, cls: string) => {
      const a = pos.get(from), b = pos.get(to);
      if (!a || !b) return;
      const path = document.createElementNS(svgNS, 'path');
      if (cls === 'analog') path.setAttribute('d', `M${a.x + NODE_W},${a.y + NODE_H / 2} L${b.x},${b.y + NODE_H / 2}`);
      else {
        const x1 = a.x + NODE_W / 2, y1 = a.y + NODE_H, x2 = b.x + NODE_W / 2, y2 = b.y, my = (y1 + y2) / 2;
        path.setAttribute('d', `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`);
      }
      path.setAttribute('class', `${cls} ${state.researched.includes(from) ? 'done' : ''}`);
      svg.append(path);
    };
    for (const { node } of placed) {
      node.requires.forEach((r) => link(r, node.id, 'req'));
      node.requiresAny?.forEach((r) => link(r, node.id, 'any'));
      if (node.analogOf) link(node.analogOf, node.id, 'analog');
    }
    this.canvas.append(svg);

    for (const { node, x, y } of placed) {
      const status = this.tree.availability(state, node.id);
      const branch = this.branches.find((b) => b.id === node.branch)!;
      const shards = this.tree.shardsOf(state, node.id);
      const unlocksShip = node.grants.some((g) => g.kind === 'chassis');
      const external = [...node.requires, ...(node.requiresAny ?? [])].some((r) => !pos.has(r));
      this.canvas.append(h('button', {
        class: `tnode ${status} ${node.crossover ? 'crossover' : ''} ${node.analogOf ? 'analog' : ''} ${this.selected === node.id ? 'selected' : ''} ${focus === node.id ? 'focus' : ''}`,
        style: `left:${x}px;top:${y}px;width:${NODE_W}px;--branch:${branch.color}`,
        title: `${node.name} — ${STATUS_LABEL[status]}`,
        onclick: () => { this.selected = node.id; this.render(); },
      },
      h('span', { class: 'tname' }, node.crossover ? '⇄ ' : node.exclusiveGroup ? '◆ ' : node.analogOf ? '≈ ' : '', node.name),
      h('span', { class: 'tbar' }, h('i', { style: `width:${Math.round(this.tree.progress(state, node.id) * 100)}%` })),
      h('span', { class: 'tshards' },
        h('span', {}, status === 'researched' ? 'Done' : status === 'locked' ? 'Locked' : `${shards}/${node.shards}`),
        h('span', { class: 'tflags' }, unlocksShip ? h('span', { class: 'flag ship', title: 'Unlocks a ship class' }, 'SHIP') : null, external ? h('span', { class: 'flag ext', title: 'Needs a technology from another area' }, '↗') : null))));
    }
  }

  private renderDetail(): void {
    const s = this.store.state;
    const state = s.empire.research;
    const node = this.tree.node(this.selected);
    const status = this.tree.availability(state, node.id);
    const branch = this.branches.find((b) => b.id === node.branch)!;
    const domainName = (id: string) => this.domains.find((d) => d.id === this.tree.node(id).domain)!.name;
    const names = (ids: readonly string[]) => ids.map((id) => `${this.tree.node(id).name}${this.tree.node(id).domain !== node.domain ? ` (${domainName(id)})` : ''}`).join(', ');
    const isFocus = s.economy.focus === node.id;
    clear(this.detail);
    this.detail.append(
      h('div', { class: 'td-head' },
        h('h3', { style: `color:${branch.color}` }, node.name),
        h('span', { class: `pill ${status}` }, STATUS_LABEL[status]),
        h('span', { class: 'muted small' }, `${this.domains.find((d) => d.id === node.domain)!.name} · ${node.crossover ? node.crossover.map((b) => this.branches.find((x) => x.id === b)!.name).join(' ⇄ ') : branch.name} · Tier ${node.tier}`)),
      h('p', {}, node.description),
      h('ul', { class: 'td-facts' },
        node.requires.length ? h('li', {}, `Requires: ${names(node.requires)}`) : null,
        node.requiresAny?.length ? h('li', {}, `Requires any of: ${names(node.requiresAny)}`) : null,
        node.exclusiveGroup ? h('li', {}, `Exclusive with: ${names(this.tree.nodes.filter((n) => n.exclusiveGroup === node.exclusiveGroup && n.id !== node.id).map((n) => n.id))}`) : null,
        node.analogOf ? h('li', {}, `Analog of ${this.tree.node(node.analogOf).name}: opens only if that node gets locked`) : null,
        h('li', {}, `Grants: ${node.grants.map(grantText).join(', ')}`)),
      h('div', { class: 'td-shards' },
        h('span', { class: 'mono' }, `${this.tree.shardsOf(state, node.id)} / ${node.shards} shards`),
        // Free shards: a development aid only (the server refuses them).
        ...SHARD_SOURCES.filter((src) => import.meta.env.DEV && src.id !== 'loot' && src.id !== 'science').map((src) => {
          const amount = Math.max(1, Math.round(node.shards / 10));
          const ok = this.tree.canReceive(state, node.id, src.id) && this.tree.shardsOf(state, node.id) < node.shards;
          return h('button', { class: 'chip', disabled: !ok, title: src.reachesUnconnected ? `${src.name} can reach unconnected nodes` : `${src.name} only reaches connected nodes`, onclick: () => this.actions.grantShards(node.id, src.id, amount) }, `+${amount} ${src.name}`);
        })),
      h('div', { class: 'row' },
        h('button', { class: 'btn primary', disabled: status !== 'researchable', onclick: () => this.actions.research(node.id) }, status === 'researched' ? 'Researched' : 'Research'),
        h('button', { class: `btn ${isFocus ? 'on' : ''}`, disabled: status === 'researched' || status === 'locked', onclick: () => this.actions.setFocus(isFocus ? null : node.id) }, isFocus ? 'Focused — science flows here each year' : 'Set focus')),
    );
  }
}

function grantText(g: Grant): string {
  switch (g.kind) {
    case 'trait': return `ship trait “${g.id}”`;
    case 'style': return `ship style “${SHIP_STYLES.find((x) => x.id === g.id)?.name ?? g.id}”`;
    case 'chassis': return `ship class ${SHIP_CLASSES.find((c) => c.id === g.id)?.name ?? g.id}`;
    case 'part': return g.id.startsWith('gov:') ? `government option` : g.id === 'faith' ? 'founding a faith' : `part ${g.id}`;
    case 'biome': return `colonise ${g.id} worlds`;
    case 'bonus': return `${g.amount > 0 ? '+' : ''}${g.amount} ${g.stat}`;
  }
}
