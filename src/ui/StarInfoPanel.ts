import type { GameState } from '../app/GameState';
import type { Store } from '../app/Store';
import type { StarSystem } from '../core/galaxy/GalaxyModel';
import { SPECTRAL_COLORS } from '../core/galaxy/GalaxyModel';
import type { Planet } from '../core/galaxy/Planets';
import { BIOMES } from '../content/biomes';
import type { GameActions } from './GameActions';
import { clear, fmt, h } from './dom';

export interface StarDetails {
  readonly address: string;
  readonly distanceFromHome: number;
  readonly travel: string;
  readonly speed: number;
  readonly planets: readonly Planet[];
  readonly owner: string | null;
}

/** Card describing the selected star system. */
export class StarInfoPanel {
  readonly el = h('section', { class: 'star-card hidden' });

  constructor(store: Store<GameState>, private readonly actions: GameActions, private readonly describe: (s: StarSystem) => StarDetails) {
    store.subscribe((s, prev) => {
      if (s.selected !== prev.selected || s.explored !== prev.explored || s.empire !== prev.empire) this.render(s);
    });
  }

  private render(s: GameState): void {
    const star = s.selected;
    this.el.classList.toggle('hidden', !star);
    clear(this.el);
    if (!star) return;
    const d = this.describe(star);
    const isHome = star.id === s.home.id;
    this.el.append(
      h('header', {},
        h('span', { class: 'star-dot', style: `background:${SPECTRAL_COLORS[star.spectral]}` }),
        h('div', {}, h('h3', {}, star.name, isHome ? h('span', { class: 'pill green' }, 'HOME') : null),
          h('p', { class: 'muted' }, `Class ${star.spectral} star · ${star.planetCount} planets${d.owner ? ` · ${d.owner}` : ''}`)),
        h('button', { class: 'icon-btn', onclick: () => this.actions.select(null) }, '✕')),
      h('dl', {},
        h('dt', {}, 'Address'), h('dd', {}, d.address),
        h('dt', {}, 'From home'), h('dd', {}, `${fmt(d.distanceFromHome)} ly`),
        h('dt', {}, 'Travel time'), h('dd', {}, `${d.travel} at ${d.speed} ly/day`)),
      h('div', { class: 'planet-row' }, ...d.planets.map((p) => {
        const biome = BIOMES.find((b) => b.id === p.biome);
        const done = s.explored[p.id];
        return h('span', { class: `planet ${done ? (done.success ? 'ok' : 'bad') : ''}`, title: `${p.name} — ${biome?.name}${done ? ' (explored)' : ''}`, style: `--c:${biome?.color}` });
      })),
      h('div', { class: 'actions' },
        h('button', { class: 'btn', onclick: () => this.actions.flyTo(star, true) }, '⌖ Focus'),
        !isHome ? h('button', { class: 'btn', onclick: () => this.actions.sendFleet(star) }, '🚀 Send fleet') : null,
        d.planets.length ? h('button', { class: 'btn primary', onclick: () => this.actions.openPanel('explore') }, '🪐 Explore') : null),
    );
  }
}
