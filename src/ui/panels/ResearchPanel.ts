import type { GameState } from '../../app/GameState';
import type { Store } from '../../app/Store';
import type { TechTree } from '../../core/research/TechTree';
import type { Availability, BranchDef, Grant, TechNode } from '../../core/research/types';
import { SHARD_SOURCES } from '../../content/shardSources';
import { Drawer } from '../Drawer';
import type { GameActions } from '../GameActions';
import { clear, h } from '../dom';

const SLOT = 108; // px per half-column
const NODE_W = 96;
const ROW_H = 70;
const TOP = 40;

interface Placed { node: TechNode; x: number; y: number }

const STATUS_LABEL: Record<Availability, string> = {
  researched: 'Researched', researchable: 'Ready to research', available: 'Collecting shards',
  unavailable: 'Prerequisites unmet', locked: 'Locked',
};

/** Branching tech tree: five columns, crossovers between them, shard progress per node. */
export class ResearchPanel extends Drawer {
  private readonly canvas = h('div', { class: 'tree-canvas' });
  private readonly detail = h('div', { class: 'tree-detail' });
  private selected = 'x-hive-mind';
  private readonly layout: Placed[];
  private readonly height: number;

  constructor(private readonly store: Store<GameState>, private readonly actions: GameActions, private readonly tree: TechTree, private readonly branches: readonly BranchDef[]) {
    super('research', 'Research', 'Collect shards from science, exploration, espionage, salvage and observation. Exclusive picks lock siblings but open analogs; crossovers bridge trees.', true);
    [this.layout, this.height] = this.computeLayout();
    this.body.append(h('div', { class: 'tree-scroll' }, this.canvas), this.detail);
    store.subscribe((s, prev) => { if (s.empire.research !== prev.empire.research && this.opened) this.render(); });
  }

  protected onOpen(): void {
    this.render();
  }

  private computeLayout(): [Placed[], number] {
    const col = new Map(this.branches.map((b, i) => [b.id, i]));
    const tiers = [...new Set(this.tree.nodes.map((n) => n.tier))].sort((a, b) => a - b);
    const placed: Placed[] = [];
    let y = TOP;
    for (const tier of tiers) {
      const inTier = this.tree.nodes.filter((n) => n.tier === tier);
      let rows = 1;
      for (const b of this.branches) {
        const cell = inTier.filter((n) => n.branch === b.id && !n.crossover);
        rows = Math.max(rows, Math.ceil(cell.length / 2));
        cell.forEach((n, i) => {
          const c = col.get(b.id)!;
          const single = cell.length === 1;
          const x = single ? c * 2 * SLOT + SLOT * 0.5 : (c * 2 + (i % 2)) * SLOT;
          placed.push({ node: n, x: x + 6, y: y + Math.floor(i / 2) * ROW_H });
        });
      }
      for (const n of inTier.filter((n) => n.crossover)) {
        const idx = n.crossover!.map((b) => col.get(b)!);
        const boundary = (Math.min(...idx) + Math.max(...idx) + 1) * SLOT;
        placed.push({ node: n, x: boundary - NODE_W / 2 + 6, y });
      }
      y += rows * ROW_H + 18;
    }
    return [placed, y];
  }

  private render(): void {
    const state = this.store.state.empire.research;
    clear(this.canvas);
    this.canvas.style.width = `${this.branches.length * 2 * SLOT + 12}px`;
    this.canvas.style.height = `${this.height}px`;
    const pos = new Map(this.layout.map((p) => [p.node.id, p]));

    this.branches.forEach((b, i) => {
      this.canvas.append(h('div', { class: 'branch-head', style: `left:${i * 2 * SLOT}px;width:${2 * SLOT}px;color:${b.color};border-color:${b.color}` }, b.name));
    });

    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('class', 'tree-links');
    svg.setAttribute('width', this.canvas.style.width);
    svg.setAttribute('height', String(this.height));
    const link = (from: string, to: string, cls: string) => {
      const a = pos.get(from), b = pos.get(to);
      if (!a || !b) return;
      const x1 = a.x + NODE_W / 2, y1 = a.y + 58, x2 = b.x + NODE_W / 2, y2 = b.y;
      const path = document.createElementNS(svgNS, 'path');
      const my = (y1 + y2) / 2;
      path.setAttribute('d', cls === 'analog' ? `M${a.x + NODE_W},${a.y + 29} L${b.x},${b.y + 29}` : `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`);
      const done = state.researched.includes(from);
      path.setAttribute('class', `${cls} ${done ? 'done' : ''}`);
      svg.append(path);
    };
    for (const { node } of this.layout) {
      node.requires.forEach((r) => link(r, node.id, 'req'));
      node.requiresAny?.forEach((r) => link(r, node.id, 'any'));
      if (node.analogOf) link(node.analogOf, node.id, 'analog');
    }
    this.canvas.append(svg);

    for (const { node, x, y } of this.layout) {
      const status = this.tree.availability(state, node.id);
      const branch = this.branches.find((b) => b.id === node.branch)!;
      const shards = this.tree.shardsOf(state, node.id);
      const el = h('button', {
        class: `tnode ${status} ${node.crossover ? 'crossover' : ''} ${node.analogOf ? 'analog' : ''} ${this.selected === node.id ? 'selected' : ''}`,
        style: `left:${x}px;top:${y}px;width:${NODE_W}px;--branch:${branch.color}`,
        title: `${node.name} — ${STATUS_LABEL[status]}`,
        onclick: () => { this.selected = node.id; this.render(); },
      },
      h('span', { class: 'tname' }, node.crossover ? '⇄ ' : node.exclusiveGroup ? '◆ ' : node.analogOf ? '≈ ' : '', node.name),
      h('span', { class: 'tbar' }, h('i', { style: `width:${Math.round(this.tree.progress(state, node.id) * 100)}%` })),
      h('span', { class: 'tshards' }, status === 'researched' ? '✓' : status === 'locked' ? '🔒' : `${shards}/${node.shards}`));
      this.canvas.append(el);
    }
    this.renderDetail();
  }

  private renderDetail(): void {
    const state = this.store.state.empire.research;
    const node = this.tree.node(this.selected);
    const status = this.tree.availability(state, node.id);
    const branch = this.branches.find((b) => b.id === node.branch)!;
    const names = (ids: readonly string[]) => ids.map((id) => this.tree.node(id).name).join(', ');
    clear(this.detail);
    this.detail.append(
      h('div', { class: 'td-head' },
        h('h3', { style: `color:${branch.color}` }, node.name),
        h('span', { class: `pill ${status}` }, STATUS_LABEL[status])),
      h('p', {}, node.description),
      h('ul', { class: 'td-facts' },
        h('li', {}, `Branch: ${node.crossover ? node.crossover.map((b) => this.branches.find((x) => x.id === b)!.name).join(' ⇄ ') : branch.name} · Tier ${node.tier}`),
        node.requires.length ? h('li', {}, `Requires: ${names(node.requires)}`) : null,
        node.requiresAny?.length ? h('li', {}, `Requires any of: ${names(node.requiresAny)}`) : null,
        node.exclusiveGroup ? h('li', {}, `Exclusive with: ${names(this.tree.nodes.filter((n) => n.exclusiveGroup === node.exclusiveGroup && n.id !== node.id).map((n) => n.id))}`) : null,
        node.analogOf ? h('li', {}, `Analog of ${this.tree.node(node.analogOf).name} — opens if that node gets locked`) : null,
        h('li', {}, `Grants: ${node.grants.map(grantText).join(', ')}`)),
      h('div', { class: 'td-shards' },
        h('span', {}, `Shards ${this.tree.shardsOf(state, node.id)} / ${node.shards}`),
        ...SHARD_SOURCES.filter((s) => s.id !== 'loot').map((src) => {
          const amount = Math.max(1, Math.round(node.shards / 10));
          const ok = this.tree.canReceive(state, node.id, src.id) && this.tree.shardsOf(state, node.id) < node.shards;
          return h('button', {
            class: 'chip', disabled: !ok,
            title: src.reachesUnconnected ? `${src.name} can reach unconnected nodes` : `${src.name} only reaches connected nodes`,
            onclick: () => this.actions.grantShards(node.id, src.id, amount),
          }, `+${amount} ${src.name}`);
        })),
      h('button', { class: 'btn primary', disabled: status !== 'researchable', onclick: () => this.actions.research(node.id) }, status === 'researched' ? 'Researched ✓' : 'Research'),
    );
  }
}

function grantText(g: Grant): string {
  switch (g.kind) {
    case 'trait': return `ship trait “${g.id}”`;
    case 'chassis': return `chassis ${g.id}`;
    case 'part': return `part ${g.id}`;
    case 'biome': return `biome ${g.id}`;
    case 'bonus': return `+${g.amount} ${g.stat}`;
  }
}
