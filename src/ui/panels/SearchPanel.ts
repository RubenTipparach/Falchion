import type { GameState } from '../../app/GameState';
import type { Store } from '../../app/Store';
import { BIOMES } from '../../content/biomes';
import { STAR_KINDS, describeStar } from '../../content/stars';
import { kindOf, SPECTRAL_COLORS, type GalaxyModel, type SpectralClass, type StarKind, type StarSystem } from '../../core/galaxy/GalaxyModel';
import { GalaxyScan, type PlanetStatus, type SearchHit, type SearchQuery } from '../../core/galaxy/GalaxySearch';
import type { Planet } from '../../core/galaxy/Planets';
import { clear, fmt, h } from '../dom';
import { Drawer } from '../Drawer';
import type { GameActions, GameQueries } from '../GameActions';
import { icon } from '../icons';

const STATUSES: ReadonlyArray<[SearchQuery['status'], string]> = [['any', 'Any'], ['unsurveyed', 'Unsurveyed'], ['surveyed', 'Surveyed'], ['settled', 'Your colonies'], ['free', 'Not yours']];
const KINDS = (Object.keys(STAR_KINDS) as StarKind[]).filter((k) => k !== 'smbh');
const CLASSES: readonly SpectralClass[] = ['O', 'B', 'A', 'F', 'G', 'K', 'M'];
/** Milliseconds of scanning a frame: the game keeps running while a search walks the galaxy. */
const SLICE_MS = 10;

/**
 * Galaxy search (change galaxy-search): stars by name, kind and class, planets by name, type and
 * survey status, nearest first from the view's centre or home. The scan (core/galaxy/GalaxySearch)
 * walks hex rings outward a slice a frame; results stream in as it goes.
 */
export class SearchPanel extends Drawer {
  private query: SearchQuery = { what: 'planets', text: '', biomes: [], kinds: [], spectral: [], status: 'unsurveyed' };
  private from: 'view' | 'home' = 'view';
  private scan: GalaxyScan | null = null;
  private frame = 0;
  private readonly form = h('div', { class: 'search-form' });
  private readonly progress = h('div', { class: 'search-progress small muted' });
  private readonly results = h('ol', { class: 'search-results' });
  private readonly more = h('button', { class: 'btn', hidden: true, onclick: () => this.further() }, 'Search further');
  private readonly text: HTMLInputElement;

  constructor(private readonly store: Store<GameState>, private readonly actions: GameActions, private readonly q: GameQueries, private readonly galaxy: GalaxyModel, private readonly planetsOf: (s: StarSystem) => Planet[], private readonly thumb: (p: Planet) => string) {
    super('search', 'Search', 'Find stars and planets anywhere in the galaxy, nearest first.');
    this.text = h('input', { type: 'search', class: 'search-text', placeholder: 'Star or planet name…', 'aria-label': 'Name', autocomplete: 'off' }) as HTMLInputElement;
    this.text.addEventListener('input', () => { this.query = { ...this.query, text: this.text.value }; this.restartSoon(); });
    this.text.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.restart(); });
    this.body.append(this.text, this.form, this.progress, this.results, this.more);
    this.renderForm();
  }

  protected onOpen(): void {
    this.renderForm();
    this.restart();
    setTimeout(() => this.text.focus(), 50);
  }

  close(): void {
    cancelAnimationFrame(this.frame);
    super.close();
  }

  private set(patch: Partial<SearchQuery>): void {
    this.query = { ...this.query, ...patch };
    this.renderForm();
    this.restart();
  }

  private flip<T>(list: readonly T[] | undefined, v: T): T[] {
    const l = list ?? [];
    return l.includes(v) ? l.filter((x) => x !== v) : [...l, v];
  }

  private renderForm(): void {
    const q = this.query;
    const seg = <T extends string>(options: ReadonlyArray<[T, string]>, current: T, pick: (v: T) => void) =>
      h('div', { class: 'seg' }, ...options.map(([v, label]) => h('button', { class: `seg-btn ${current === v ? 'active' : ''}`, onclick: () => pick(v) }, label)));
    const chip = (on: boolean, label: string, color: string, onclick: () => void, title = '') =>
      h('button', { class: `chip search-chip ${on ? 'active' : ''}`, 'aria-pressed': String(on), title, onclick }, h('span', { class: 'swatch', style: `background:${color}` }), label);
    clear(this.form);
    this.form.append(
      h('div', { class: 'row' },
        seg([['planets', 'Planets'], ['stars', 'Stars']], q.what, (what) => this.set({ what })),
        seg([['view', 'From the view'], ['home', 'From home']], this.from, (from) => { this.from = from; this.renderForm(); this.restart(); })),
      q.what === 'planets' ? h('div', { class: 'search-group' }, h('h4', {}, 'Survey'), seg(STATUSES.map(([v, l]) => [v ?? 'any', l] as [string, string]), q.status ?? 'any', (status) => this.set({ status: status as SearchQuery['status'] }))) : '',
      q.what === 'planets' ? h('div', { class: 'search-group' }, h('h4', {}, 'Planet type'),
        h('div', { class: 'chips' }, ...BIOMES.filter((b) => !b.megastructure).map((b) => chip(!!q.biomes?.includes(b.id), b.name, b.color, () => this.set({ biomes: this.flip(q.biomes, b.id) }), b.blurb)))) : '',
      // A few hundred in the whole galaxy: on their own, they are found at any distance.
      q.what === 'planets' ? h('div', { class: 'search-group' }, h('h4', {}, 'Megastructures'),
        h('div', { class: 'chips' }, ...BIOMES.filter((b) => b.megastructure).map((b) => chip(!!q.biomes?.includes(b.id), b.name, b.color, () => this.set({ biomes: this.flip(q.biomes, b.id) }), b.blurb)))) : '',
      h('div', { class: 'search-group' }, h('h4', {}, q.what === 'planets' ? 'Around a star' : 'Star'),
        h('div', { class: 'chips' }, ...KINDS.map((k) => chip(!!q.kinds?.includes(k), STAR_KINDS[k].name, STAR_KINDS[k].color ?? SPECTRAL_COLORS.G, () => this.set({ kinds: this.flip(q.kinds, k) }), STAR_KINDS[k].blurb))),
        h('div', { class: 'chips' }, ...CLASSES.map((c) => chip(!!q.spectral?.includes(c), `Class ${c}`, SPECTRAL_COLORS[c], () => this.set({ spectral: this.flip(q.spectral, c) }), 'Main-sequence stars of this class')))),
    );
  }

  private restartTimer = 0;
  private restartSoon(): void {
    clearTimeout(this.restartTimer);
    this.restartTimer = window.setTimeout(() => this.restart(), 250);
  }

  private restart(): void {
    cancelAnimationFrame(this.frame);
    clear(this.results);
    const origin = this.from === 'home' ? this.store.state.home.hex : this.q.viewHex();
    const explored = this.store.state.explored;
    this.scan = new GalaxyScan(this.galaxy, origin, this.query, {
      planetsOf: this.planetsOf,
      // Only what the player sees: hidden stars are skipped, megastructures not yet found are ordinary stars.
      see: (star) => this.q.seeStar(star),
      statusOf: (p): PlanetStatus => (this.q.colonyAt(p.id) ? 'settled' : explored[p.id] ? 'surveyed' : 'unsurveyed'),
    });
    this.run();
  }

  private further(): void {
    if (!this.scan) return;
    this.scan.extend();
    this.run();
  }

  private run(): void {
    const scan = this.scan;
    if (!scan) return;
    this.more.hidden = true;
    const tick = () => {
      if (scan !== this.scan || !this.opened) return;
      const t = performance.now();
      while (!scan.done && performance.now() - t < SLICE_MS) this.results.append(...scan.step(4_000).map((hit) => this.row(hit)));
      this.progress.textContent = `${scan.done ? 'Searched' : 'Searching'} ${fmt(scan.radius)} ly round ${this.from === 'home' ? 'home' : 'the view'} · ${fmt(scan.stars)} stars · ${this.results.children.length} found`;
      if (scan.done) {
        this.more.hidden = false;
        if (!this.results.children.length) this.results.append(h('li', { class: 'muted small' }, 'Nothing yet within this radius. Search further to look wider.'));
        return;
      }
      this.frame = requestAnimationFrame(tick);
    };
    tick();
  }

  private row({ star, planet, distance }: SearchHit): HTMLElement {
    const go = () => (planet ? this.actions.focusPlanet(star, planet) : (this.actions.select(star), this.actions.flyTo(star)));
    const link = h('button', { class: 'icon-btn', title: 'Copy a link', 'aria-label': 'Copy a link', onclick: (e: Event) => { e.stopPropagation(); void this.actions.shareLink(star, planet ?? null); } }, icon('link'));
    if (planet) {
      const biome = BIOMES.find((b) => b.id === planet.biome);
      const status = this.q.colonyAt(planet.id) ? 'Your colony' : this.store.state.explored[planet.id] ? 'Surveyed' : 'Unsurveyed';
      return h('li', { class: 'search-hit', onclick: go, title: `Fly to ${planet.name}` },
        h('img', { class: 'planet-thumb small', src: this.thumb(planet), alt: '' }),
        h('span', { class: 'hit-name' }, h('b', {}, planet.name), h('small', {}, `${biome?.name ?? planet.biome} · size ${planet.size} · ${status}`)),
        h('span', { class: 'hit-dist mono' }, `${fmt(distance)} ly`), link);
    }
    const color = STAR_KINDS[kindOf(star)].color ?? SPECTRAL_COLORS[star.spectral];
    return h('li', { class: 'search-hit', onclick: go, title: `Fly to ${star.name}` },
      h('span', { class: 'star-dot', style: `--c:${color}` }),
      h('span', { class: 'hit-name' }, h('b', {}, star.name), h('small', {}, `${describeStar(star)} · ${star.planetCount} planet${star.planetCount === 1 ? '' : 's'}`)),
      h('span', { class: 'hit-dist mono' }, `${fmt(distance)} ly`), link);
  }
}
