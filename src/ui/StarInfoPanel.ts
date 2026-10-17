import type { GameState } from '../app/GameState';
import type { Store } from '../app/Store';
import type { StarSystem } from '../core/galaxy/GalaxyModel';
import { SPECTRAL_COLORS } from '../core/galaxy/GalaxyModel';
import type { Planet } from '../core/galaxy/Planets';
import { BIOMES } from '../content/biomes';
import { BIOME_YIELDS, RESOURCES } from '../content/resources';
import { hasWarships } from '../content/logistics';
import type { FleetGroup, FleetInfo, GameActions, GameQueries } from './GameActions';
import type { FleetView } from '../render/map/FleetLayer';
import { formatDuration } from '../core/time/WorldTime';
import { CLOCK } from '../app/WorldClock';
import type { EconomyTables } from '../core/economy/Economy';
import { exploreCost } from '../core/fleet/Logistics';
import { countOf } from '../core/fleet/Presence';
import { minedBy } from '../core/fleet/AutoMine';
import { SHIP_CLASSES } from '../content/shipClasses';
import { colonyView, crateLine, haulView, shipsText, storesView } from './widgets';
import { collectWithFx } from './collectFx';
import { clear, fmt, h, touchFirst } from './dom';
import { icon, resourceIcon } from './icons';
import { FREIGHTER } from '../core/economy/Trade';

const minesOf = (classId: string) => SHIP_CLASSES.find((c) => c.id === classId)?.mines;

export interface StarDetails {
  readonly address: string;
  readonly distanceFromHome: number;
  readonly travel: string;
  /** Empire fleet speed (ly per year): 1 to start, raised by drive research. */
  readonly speed: number;
  readonly planets: readonly Planet[];
  readonly owner: string | null;
}

/** Card describing the selected star system. */
export class StarInfoPanel {
  readonly el = h('section', { class: 'star-card frame hidden', 'aria-label': 'Selected system' });

  constructor(private readonly store: Store<GameState>, private readonly actions: GameActions, private readonly q: GameQueries, private readonly describe: (s: StarSystem) => StarDetails, private readonly thumb: (p: Planet) => string, private readonly tables: EconomyTables) {
    store.subscribe((s, prev) => {
      if (s.selected !== prev.selected || s.selectedPlanet !== prev.selectedPlanet || s.explored !== prev.explored || s.openedCrates !== prev.openedCrates || s.empire !== prev.empire || s.loadouts !== prev.loadouts || s.turn !== prev.turn || s.economy.colonies !== prev.economy.colonies || s.collectedCaches !== prev.collectedCaches || s.depots !== prev.depots || s.construction !== prev.construction || s.selectedFleet !== prev.selectedFleet || s.fleets !== prev.fleets) this.render(s);
    });
  }

  private render(s: GameState): void {
    // The planet card is wider: the planet preview and its colony details need the room.
    this.el.classList.toggle('planet-view', !s.selectedFleet && !!s.selectedPlanet && s.selectedPlanet.starId === s.selected?.id);
    if (s.selectedFleet) {
      const info = this.q.fleetInfo(s.selectedFleet);
      if (info) return this.renderFleet(info);
    }
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
        this.shareButton(star, null),
        h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: () => this.actions.select(null) }, icon('close'))),
      h('dl', {},
        h('dt', {}, 'Address'), h('dd', {}, d.address),
        h('dt', {}, 'From home'), h('dd', {}, `${fmt(d.distanceFromHome)} ly`),
        h('dt', {}, 'Travel time'), h('dd', {}, `${d.travel} at ${d.speed} ly/min`),
        ...(star.planetCount ? (() => {
          const p = this.q.surveyProgress(star);
          return [h('dt', {}, 'Surveyed'), h('dd', {}, `${Math.round((100 * p.done) / p.total)}% · ${p.done} of ${p.total} planets`)];
        })() : [])),
      this.fieldsView(star),
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
        caches ? h('button', { class: 'btn primary collect', onclick: (e: Event) => collectWithFx(e.currentTarget as Element, () => this.actions.collectResources(star)) }, icon('crate'), ` Collect (${caches})`) : null,
        tender ? h('button', { class: 'btn', title: 'Uses the Construction Tender: 60 CR, 40 MET', onclick: () => this.actions.buildDepot(star) }, icon('build'), ' Build supply depot') : null,
        this.tradeButton(star)),
    );
  }

  /** Asteroid fields: what mining ships here can mine, how much is left, and when it refills. */
  private fieldsView(star: StarSystem): HTMLElement | string {
    const fields = this.q.fieldReport(star);
    if (!fields.length) return h('p', { class: 'small muted' }, 'No asteroid fields: mining ships have nothing to mine here.');
    return h('div', { class: 'fields' }, h('span', { class: 'eyebrow' }, 'Asteroid fields'),
      ...fields.map(({ field, left, fullIn }) => {
        const name = RESOURCES.find((r) => r.id === field.resource)?.name ?? field.resource;
        const pct = Math.round((100 * left) / field.capacity);
        return h('div', { class: 'field-row', title: `${name} field: ${fmt(left)} of ${fmt(field.capacity)} left` },
          resourceIcon(field.resource, 14),
          h('span', { class: 'field-name' }, name),
          h('span', { class: 'field-bar' }, h('i', { style: `width:${pct}%; background:${RESOURCES.find((r) => r.id === field.resource)?.color ?? '#ccc'}` })),
          h('small', { class: `mono ${left === 0 ? 'red' : 'muted'}` }, fullIn ? `${fmt(left)} · full in ${formatDuration(fullIn, CLOCK)}` : `${fmt(left)} · full`));
      }));
  }

  /** At a market: send free freighters (docked first) on a trade run here. */
  private tradeButton(star: StarSystem): HTMLElement | null {
    const market = this.q.marketAt(star);
    // Goods are loaded at another of your colonies: your only colony is no market for them.
    if (!market || !this.q.markets().some((m) => m.kind === 'own' && m.starId !== star.id)) return null;
    const free = this.q.groups().find((g) => g.ships.some((x) => x.classId === FREIGHTER && x.count > 0) && !g.orders?.trade);
    if (!free) return null;
    return h('button', { class: 'btn', title: `Freighters load trade goods at your nearest colony and sell them at ${star.name}, again and again`, onclick: () => this.actions.tradeRun(free.id, star) },
      resourceIcon('goods', 16), free.id === 'dock' ? ' Trade run (dock freighters)' : ` Trade run (${free.name})`);
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
    const portrait = h('img', { class: 'planet-portrait', src: this.thumb(p), alt: `${p.name}, ${biome?.name}` });
    this.el.append(
      h('header', {},
        h('div', {}, h('span', { class: 'eyebrow' }, `${star.name} · planet ${p.index + 1} of ${star.planetCount}`), h('h3', {}, p.name),
          h('p', { class: 'muted' }, `${biome?.name ?? p.biome} world · size ${p.size}`)),
        this.shareButton(star, p),
        h('button', { class: 'icon-btn', 'aria-label': 'Back to system', title: 'Back to system (Esc)', onclick: () => this.actions.focusPlanet(star, null) }, icon('close'))),
      portrait,
      h('dl', {},
        !colony ? h('dt', {}, 'If colonised') : '', !colony ? h('dd', {}, yields.length ? yields.map(([r, n]) => `+${n} ${RESOURCES.find((x) => x.id === r)?.short ?? r}`).join('  ') + ' / yr' : '—') : '',
        h('dt', {}, 'Survey'), h('dd', {}, colony ? 'Settled' : done ? `${done.kind} · ${done.success ? 'success' : 'failed'}` : 'Unexplored'),
        ...(done?.success && !colony ? [h('dt', {}, 'Resources'), h('dd', {}, haulView(this.q.cacheOf(p)), s.collectedCaches.includes(p.id) ? h('span', { class: 'muted' }, ' · collected') : '')] : []),
        ...(done?.crate ? [h('dt', {}, 'Loot crate'), h('dd', {}, crateLine(done.crate, s.openedCrates.includes(p.id)))] : [])),
      done ? h('p', { class: 'small muted' }, done.narrative) : '',
      colony ? h('div', {}, h('span', { class: 'eyebrow' }, colony.capital ? 'Capital' : 'Your colony'), colonyView(colony, s.empire.materials, (b) => this.actions.build(p.id, b), this.tables, this.q.jobs(p.id), s.turn, {
        unlocked: (id) => this.q.isBuildingUnlocked(id), openResearch: (id) => this.actions.openResearch(id), nodeName: (id) => this.tables.tree.node(id).name })) : '',
      !done && !colony && !canExplore ? h('p', { class: 'small red' }, `Exploring needs a ship on station here with ${cost} supply.`) : '',
      h('div', { class: 'actions' },
        !done && !colony ? h('button', { class: 'btn primary', disabled: !canExplore, onclick: () => this.actions.explore(p) }, icon('explore'), ` Explore · ${cost} supply`) : '',
        cache || crateWaiting ? h('button', { class: 'btn primary collect', title: 'Gather what this world holds', onclick: () => collectWithFx(portrait, () => this.actions.collectPlanet(p)) }, icon('crate'), ' Collect') : '',
        done && !colony && p.biome !== 'gas' ? h('button', { class: 'btn', disabled: !ark, title: ark ? 'Uses one Colony Ark' : 'Needs a Colony Ark on station here', onclick: () => this.actions.settle(p) }, icon('build'), ' Settle') : '',
        p.biome !== 'gas' ? h('button', { class: 'btn land', title: colony ? `Descend to ${colony.name.replace(/ \(capital\)$/, '')}` : 'Descend to the surface', onclick: () => this.actions.land(star, p) }, icon('land'), ' Land') : '',
        h('button', { class: 'btn', onclick: () => this.actions.focusPlanet(star, null) }, 'Back to system')),
    );
  }

  /** Share a hotlink to the system or planet (share sheet on phones, else copied), with a brief confirmation. */
  private shareButton(star: StarSystem, planet: Planet | null): HTMLElement {
    const what = planet ? planet.name : star.name;
    const btn = h('button', { class: 'icon-btn share', 'aria-label': `Share a link to ${what}`, title: `Copy a link to ${what}` }, icon('link'));
    btn.addEventListener('click', async () => {
      const result = await this.actions.shareLink(star, planet);
      if (result === 'shared') return;
      btn.dataset.tip = result === 'copied' ? 'Link copied' : 'Could not copy the link';
      btn.classList.add('tipped');
      setTimeout(() => btn.classList.remove('tipped'), 1_600);
    });
    return btn;
  }

  /** Card for a selected fleet: yours shows stores and orders; right-click a star or empty space to move it. */
  private renderFleet(info: FleetInfo): void {
    const { fleet, group } = info;
    this.el.classList.remove('hidden');
    clear(this.el);
    const where = info.at ? `On station at ${info.at.name}` : `En route to ${info.dest?.name ?? 'deep space'} · ETA ${formatDuration(info.eta, CLOCK)}`;
    const owner = fleet.owner.replace(/^alien:/, '');
    this.el.append(
      h('header', {},
        h('span', { class: 'star-dot', style: `background:${fleet.color}` }),
        h('div', {}, h('span', { class: 'eyebrow' }, info.mine ? 'Your fleet' : `${owner} fleet`), h('h3', {}, fleet.name), h('p', { class: 'muted' }, where)),
        h('button', { class: 'icon-btn', 'aria-label': 'Deselect fleet', title: 'Deselect (Esc)', onclick: () => this.actions.selectFleet(null) }, icon('close'))),
      group ? h('div', {},
        group.battle ? h('div', { class: 'battle-banner' },
          h('div', {}, h('b', {}, `In battle: round ${group.battle.round}`),
            h('div', { class: 'small' }, `Against ${group.battle.foeName} of ${group.battle.foeEmpire}. A round every year (minute) until one side is gone or breaks off.`)),
          h('button', { class: 'btn danger', onclick: () => this.actions.retreat(group.id) }, 'Retreat')) : '',
        group.orders?.chase ? h('div', { class: 'row orders' },
          h('button', { class: 'chip active', title: 'Stop the chase', onclick: () => this.actions.chase(group.id, null) }, `✓ Chasing ${this.q.fleetInfo(group.orders.chase)?.fleet.name.split(' · ')[0] ?? 'a fleet'} · stop`)) : '',
        h('p', { class: 'small' }, shipsText(group.ships)),
        storesView(group),
        h('div', { class: 'row orders' },
          this.orderChip(group, 'autoExplore', 'Auto-explore'),
          this.orderChip(group, 'autoReturn', 'Return to resupply'),
          minedBy(group.ships, minesOf).length ? this.orderChip(group, 'autoMine', 'Auto-mine') : '',
          this.stanceChip(group)),
        this.cargoView(group, info.at),
        info.surveying ? h('p', { class: 'small' }, `Surveying ${info.surveying.name} this year`) : '',
        info.plan.length ? h('div', { class: 'survey-plan' }, h('span', { class: 'eyebrow' }, 'Survey route'),
          ...info.plan.map((st, i) => {
            const p = this.q.surveyProgress(st);
            return h('button', { class: 'survey-row', title: `Locate ${st.name}`, onclick: () => { this.actions.flyTo(st); } },
              h('span', { class: 'survey-num' }, String(i + 1)), h('b', {}, st.name),
              h('small', { class: 'muted' }, `${Math.round((100 * p.done) / Math.max(1, p.total))}% surveyed · ${p.total} planets`));
          })) : '',
        h('p', { class: 'notice' }, touchFirst()
          ? 'Press and hold a star, or anywhere in empty space, to send this fleet there. Pinch to zoom.'
          : 'Right-click a star, or anywhere in empty space, to send this fleet there. Right-drag to orbit the camera.'))
        : h('div', {}, h('p', { class: 'small muted' }, fleet.owner.startsWith('alien:') ? 'Hostile alien fleet.' : fleet.status ? `Another empire's fleet: ${fleet.status}.` : 'Another empire\'s fleet.'), this.chaseView(fleet)),
      h('div', { class: 'actions' },
        h('button', { class: 'btn', title: 'Centre the camera on this fleet', onclick: () => this.actions.focusFleet(fleet.id) }, icon('locate'), ' Centre'),
        h('button', { class: 'btn', title: 'Zoom in to the ship', onclick: () => this.actions.focusFleet(fleet.id, true) }, icon('focus'), ' Zoom'),
        info.mine && !(info.at && info.at.id === this.store.state.home.id) ? h('button', { class: 'btn', onclick: () => this.actions.returnHome(fleet.id) }, icon('home'), ' Return home') : '',
        info.mine ? h('button', { class: 'btn', onclick: () => this.actions.openPanel('fleets') }, icon('fleet'), ' Fleets') : ''),
    );
  }

  /** Freighters: goods aboard, the trade run, and loading or selling where the fleet is. */
  private cargoView(g: FleetGroup, at: StarSystem | null): HTMLElement | string {
    const cap = this.q.cargoCapacity(g.ships);
    if (!cap) return '';
    const run = g.orders?.trade;
    const to = run && this.q.starById(run.to), from = run && this.q.starById(run.from);
    const loadedAt = g.cargoFrom ? this.q.starById(g.cargoFrom) : null;
    const market = at && this.q.marketAt(at);
    const canLoad = !!at && this.q.isOwned(at) && (g.cargo ?? 0) < cap && this.store.state.empire.materials.goods > 0;
    const sale = market && loadedAt && g.cargo && loadedAt.id !== at!.id ? this.q.saleValue(g.cargo, loadedAt, market) : 0;
    return h('div', { class: 'cargo' },
      h('p', { class: 'small' }, resourceIcon('goods', 14), ` ${fmt(g.cargo ?? 0)} / ${fmt(cap)} trade goods${loadedAt && g.cargo ? ` from ${loadedAt.name}` : ''}`),
      to && from ? h('p', { class: 'small green' }, `Trade run: ${from.name} → ${to.name}, repeating`) : '',
      h('div', { class: 'row orders' },
        to ? h('button', { class: 'chip active', onclick: () => this.actions.tradeRun(g.id, null) }, '✓ Trade run · stop') : null,
        !to && canLoad ? h('button', { class: 'chip', onclick: () => this.actions.loadGoods(g.id) }, 'Load goods') : null,
        !to && sale ? h('button', { class: 'chip', onclick: () => this.actions.sellGoods(g.id) }, `Sell here · ${fmt(sale)} cr`) : null,
        !to && market && !sale ? h('button', { class: 'chip', title: `Load goods at your nearest colony and sell them at ${market.name}, again and again`, onclick: () => this.actions.tradeRun(g.id, at) }, `Trade run to ${market.name}`) : null));
  }

  /** Another player's fleet: send one of your warship fleets after it. */
  private chaseView(fleet: FleetView): HTMLElement | string {
    if (fleet.owner.startsWith('alien:') || !fleet.id.includes(':')) return '';
    const owner = fleet.id.slice(0, fleet.id.indexOf(':'));
    const relation = this.q.diplomacyView().find((v) => v.empire.id === owner);
    if (relation && !relation.atWar) return h('p', { class: 'small muted' }, relation.relation.status === 'war' ? 'War declared: you can chase their fleets once the fighting starts.' : `Not at war with ${relation.empire.name}: declare war in Empire › Relations to chase their fleets.`);
    const hunters = this.q.groups().filter((g) => g.id !== 'dock' && hasWarships(g.ships));
    if (!hunters.length) return h('p', { class: 'small muted' }, 'Form a fleet with warships to chase it.');
    return h('div', {}, h('span', { class: 'eyebrow' }, 'Chase with'),
      h('p', { class: 'small muted' }, 'A faster fleet catches up; a slower one only when it stops. They fight a round a year once they meet.'),
      h('div', { class: 'row orders' }, ...hunters.map((g) => {
        const on = g.orders?.chase === fleet.id;
        return h('button', { class: `chip ${on ? 'active' : ''}`, onclick: () => this.actions.chase(g.id, on ? null : fleet.id) }, on ? `✓ ${g.name}` : g.name);
      })));
  }

  /** Warships only: an aggressive fleet attacks the fleets of other empires it meets at sea. */
  private stanceChip(g: FleetGroup): HTMLElement | null {
    if (!hasWarships(g.ships)) return null;
    const on = g.orders?.stance === 'aggressive';
    return h('button', { class: `chip ${on ? 'active' : ''}`, title: 'Aggressive: attack the fleets of empires you are at war with when they meet this one', 'aria-pressed': String(on), onclick: () => this.actions.setOrders(g.id, { ...g.orders, stance: on ? undefined : 'aggressive' }) }, on ? '✓ Aggressive' : 'Aggressive');
  }

  private orderChip(g: FleetGroup, key: 'autoExplore' | 'autoReturn' | 'autoMine', label: string): HTMLElement {
    const on = !!g.orders?.[key];
    return h('button', { class: `chip ${on ? 'active' : ''}`, 'aria-pressed': String(on), onclick: () => this.actions.setOrders(g.id, { ...g.orders, [key]: !on }) }, on ? `✓ ${label}` : label);
  }
}
