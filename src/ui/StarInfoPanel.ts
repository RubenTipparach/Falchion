import type { GameState } from '../app/GameState';
import type { Store } from '../app/Store';
import type { StarSystem } from '../core/galaxy/GalaxyModel';
import { SPECTRAL_COLORS } from '../core/galaxy/GalaxyModel';
import type { Planet } from '../core/galaxy/Planets';
import { BIOMES } from '../content/biomes';
import { BIOME_YIELDS, RESOURCES } from '../content/resources';
import type { GameActions, GameQueries } from './GameActions';
import type { EconomyTables } from '../core/economy/Economy';
import { exploreCost } from '../core/fleet/Logistics';
import { countOf } from '../core/fleet/Presence';
import { colonyView, shipsText, storesView } from './widgets';
import { clear, fmt, h } from './dom';
import { icon } from './icons';

export interface StarDetails {
  readonly address: string;
  readonly distanceFromHome: number;
  readonly travel: string;
  readonly speed: number;
  /** Fastest speed among hulls the empire owns. */
  readonly fastest: number;
  readonly planets: readonly Planet[];
  readonly owner: string | null;
}

/** Card describing the selected star system. */
export class StarInfoPanel {
  readonly el = h('section', { class: 'star-card frame hidden', 'aria-label': 'Selected system' });

  constructor(store: Store<GameState>, private readonly actions: GameActions, private readonly q: GameQueries, private readonly describe: (s: StarSystem) => StarDetails, private readonly thumb: (p: Planet) => string, private readonly tables: EconomyTables) {
    store.subscribe((s, prev) => {
      if (s.selected !== prev.selected || s.selectedPlanet !== prev.selectedPlanet || s.explored !== prev.explored || s.openedCrates !== prev.openedCrates || s.empire !== prev.empire || s.loadouts !== prev.loadouts || s.turn !== prev.turn || s.economy.colonies !== prev.economy.colonies || s.collectedCaches !== prev.collectedCaches || s.depots !== prev.depots || s.construction !== prev.construction) this.render(s);
    });
  }

  private render(s: GameState): void {
    const star = s.selected;
    this.el.classList.toggle('hidden', !star);
    clear(this.el);
    if (!star) return;
    if (s.selectedPlanet && s.selectedPlanet.starId === star.id) return this.renderPlanet(s, star, s.selectedPlanet);
    const d = this.describe(star);
    const isHome = star.id === s.home.id;
    const here = this.q.groupsAt(star).filter((g) => g.id !== 'dock' || isHome);
    const friendly = this.q.isFriendly(star);
    const caches = this.q.pendingCaches(star).length;
    const tender = !friendly && here.some((g) => countOf(g.ships, 'construction-tender') > 0);
    this.el.append(
      h('header', {},
        h('span', { class: 'star-dot', style: `background:${SPECTRAL_COLORS[star.spectral]}` }),
        h('div', {}, h('span', { class: 'eyebrow' }, isHome ? 'Home system' : 'Star system'), h('h3', {}, star.name),
          h('p', { class: 'muted' }, `Class ${star.spectral} · ${star.planetCount} planets${d.owner ? ` · ${d.owner}` : ''}`)),
        h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: () => this.actions.select(null) }, icon('close'))),
      h('dl', {},
        h('dt', {}, 'Address'), h('dd', {}, d.address),
        h('dt', {}, 'From home'), h('dd', {}, `${fmt(d.distanceFromHome)} ly`),
        h('dt', {}, 'Travel time'), h('dd', {}, d.fastest > d.speed ? `${d.travel} (${d.fastest} to ${d.speed} ly/min by hull)` : `${d.travel} at ${d.speed} ly/min`)),
      here.length ? h('div', { class: 'here' }, h('span', { class: 'eyebrow' }, 'On station'), ...here.map((g) => h('div', { class: 'here-group' }, h('b', {}, g.name), h('div', { class: 'small muted' }, shipsText(g.ships)), storesView(g)))) : '',
      friendly && !isHome ? h('p', { class: 'small green' }, 'Friendly system: fleets here resupply and rearm.') : '',
      h('div', { class: 'planet-row' }, ...d.planets.map((p) => {
        const biome = BIOMES.find((b) => b.id === p.biome);
        const done = s.explored[p.id];
        return h('button', { class: 'thumb-btn', title: `${p.name} — ${biome?.name}${done ? ' (explored)' : ''}. Click to fly to it.`, onclick: () => this.actions.focusPlanet(star, p) },
          h('img', { class: `planet-thumb small ${done ? (done.success ? 'ok' : 'bad') : ''}`, src: this.thumb(p), alt: `${p.name}, ${biome?.name}` }));
      })),
      h('div', { class: 'actions' },
        h('button', { class: 'btn', onclick: () => this.actions.flyTo(star, true) }, icon('focus'), ' Focus'),
        !isHome ? h('button', { class: 'btn', onclick: () => this.actions.openPanel('fleets') }, icon('fleet'), ' Send fleet') : null,
        d.planets.length ? h('button', { class: 'btn primary', onclick: () => this.actions.openPanel('explore') }, icon('explore'), ' Explore') : null,
        caches ? h('button', { class: 'btn primary collect', onclick: () => this.actions.collectResources(star) }, icon('crate'), ` Collect (${caches})`) : null,
        tender ? h('button', { class: 'btn', title: 'Uses the Construction Tender: 60 CR, 40 MET', onclick: () => this.actions.buildDepot(star) }, icon('build'), ' Build supply depot') : null),
    );
  }

  private renderPlanet(s: GameState, star: StarSystem, p: Planet): void {
    const biome = BIOMES.find((b) => b.id === p.biome);
    const done = s.explored[p.id];
    const yields = Object.entries(BIOME_YIELDS[p.biome] ?? {});
    const crateWaiting = !!done?.crate && !s.openedCrates.includes(p.id);
    const colony = this.q.colonyAt(p.id);
    const here = this.q.groupsAt(star);
    const cost = exploreCost(p);
    const canExplore = here.some((g) => g.stores.supply >= cost);
    const ark = here.some((g) => countOf(g.ships, 'colony-ark') > 0);
    const cache = this.q.pendingCaches(star).find((c) => c.planet.id === p.id);
    this.el.append(
      h('header', {},
        h('div', {}, h('span', { class: 'eyebrow' }, `${star.name} · planet ${p.index + 1} of ${star.planetCount}`), h('h3', {}, p.name),
          h('p', { class: 'muted' }, `${biome?.name ?? p.biome} world · size ${p.size}`)),
        h('button', { class: 'icon-btn', 'aria-label': 'Back to system', title: 'Back to system (Esc)', onclick: () => this.actions.focusPlanet(star, null) }, icon('close'))),
      h('img', { class: 'planet-portrait', src: this.thumb(p), alt: `${p.name}, ${biome?.name}` }),
      h('dl', {},
        !colony ? h('dt', {}, 'If colonised') : '', !colony ? h('dd', {}, yields.length ? yields.map(([r, n]) => `+${n} ${RESOURCES.find((x) => x.id === r)?.short ?? r}`).join('  ') + ' / yr' : '—') : '',
        h('dt', {}, 'Survey'), h('dd', {}, colony ? 'Settled' : done ? `${done.kind} · ${done.success ? 'success' : 'failed'}` : 'Unexplored')),
      done ? h('p', { class: 'small muted' }, done.narrative) : '',
      colony ? h('div', {}, h('span', { class: 'eyebrow' }, colony.capital ? 'Capital' : 'Your colony'), colonyView(colony, s.empire.materials, (b) => this.actions.build(p.id, b), this.tables, this.q.jobs(p.id), s.turn)) : '',
      !done && !colony && !canExplore ? h('p', { class: 'small red' }, `Exploring needs a ship on station here with ${cost} supply.`) : '',
      h('div', { class: 'actions' },
        !done && !colony ? h('button', { class: 'btn primary', disabled: !canExplore, onclick: () => this.actions.explore(p) }, icon('explore'), ` Explore · ${cost} supply`) : '',
        cache ? h('button', { class: 'btn primary collect', onclick: () => this.actions.collectResources(star) }, icon('crate'), ' Collect resources') : '',
        done && !colony && p.biome !== 'gas' ? h('button', { class: 'btn', disabled: !ark, title: ark ? 'Uses one Colony Ark' : 'Needs a Colony Ark on station here', onclick: () => this.actions.settle(p) }, icon('build'), ' Settle') : '',
        crateWaiting ? h('button', { class: 'btn primary', onclick: () => this.actions.collectCrate(p.id) }, icon('crate'), ' Open crate') : '',
        h('button', { class: 'btn', onclick: () => this.actions.focusPlanet(star, null) }, 'Back to system')),
    );
  }
}
