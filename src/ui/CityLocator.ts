import type { GameState } from '../app/GameState';
import type { Store } from '../app/Store';
import type { CityEntry, GameActions, GameQueries } from './GameActions';
import { clear, h } from './dom';
import { icon } from './icons';

/** The planet card, as far as the locator needs it: reopening it after the player closed it. */
export interface PlanetCardControl {
  readonly planetClosed: boolean;
  showPlanet(): void;
}

/**
 * City locator: a small floating button, shown while a settled planet is focused (planet view or
 * its surface, with or without its card), that opens a list of the planet's major cities, capital
 * first. Picking one flies the camera down to it.
 */
export class CityLocator {
  readonly el = h('div', { class: 'city-locator hidden' });
  private open = false;
  private key = '';

  constructor(private readonly store: Store<GameState>, private readonly q: GameQueries, private readonly actions: GameActions, private readonly card: PlanetCardControl) {
    store.subscribe((s, prev) => {
      if (s.selectedPlanet !== prev.selectedPlanet || s.selected !== prev.selected || s.selectedFleet !== prev.selectedFleet || s.economy.colonies !== prev.economy.colonies) this.render();
    });
  }

  /** Re-draw (the planet card opened or closed). */
  render(): void {
    const s = this.store.state;
    const planet = s.selectedFleet ? null : s.selectedPlanet;
    const star = planet && s.selected?.id === planet.starId ? s.selected : null;
    const cities: readonly CityEntry[] = planet && star ? this.q.citiesOf(planet) : [];
    const key = planet ? planet.id : '';
    if (key !== this.key) this.open = false;
    this.key = key;
    this.el.classList.toggle('hidden', !cities.length);
    clear(this.el);
    if (!cities.length || !planet || !star) return;
    const toggle = h('button', { class: 'btn city-toggle', 'aria-expanded': this.open ? 'true' : 'false', title: `Major cities on ${planet.name}: fly to one`, onclick: () => { this.open = !this.open; this.render(); } },
      icon('locate'), ` Cities · ${cities.length}`);
    this.el.append(toggle);
    if (!this.open) return;
    this.el.append(h('ul', { class: 'city-list', 'aria-label': `Cities on ${planet.name}` },
      ...cities.map((c) => h('li', {}, h('button', { class: `city-item ${c.kind}`, title: `Fly to ${c.name}`, onclick: () => { this.open = false; this.render(); this.actions.land(star, planet, { city: c.index }); } },
        h('span', { class: 'city-mark' }), h('span', { class: 'city-name' }, c.name), h('small', {}, c.kind === 'capital' ? 'Capital' : 'City')))),
      this.card.planetClosed ? h('li', {}, h('button', { class: 'city-item card', onclick: () => { this.open = false; this.card.showPlanet(); } }, h('span', { class: 'city-name' }, 'Planet card'))) : ''));
  }
}
