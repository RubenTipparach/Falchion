import type { GameState } from '../../app/GameState';
import { flagEl } from '../../render/flag';
import type { Store } from '../../app/Store';
import { RESOURCES, type Resource } from '../../content/resources';
import { agoLabel, marketChart, MAX_LINES, sparkline as trendLine } from '../MarketChart';
import { FACTIONS, GOVERNMENTS, POLICIES, TENETS } from '../../content/society';
import {
  bonusOf, Colony, colonyYield, EconomyTables, factionApproval, upkeepOf, hasGrant, maxPolicies, maxSpies, sciencePerTurn, stabilityOf, tradePctOf,
} from '../../core/economy/Economy';
import { FREIGHTER } from '../../core/economy/Trade';
import { hexDistance } from '../../core/hex/Hex';
import type { StarSystem } from '../../core/galaxy/GalaxyModel';
import { STANDING, TIERS, tierOf } from '../../core/npc/Reputation';
import type { Relations } from '../../app/GameState';
import { Drawer } from '../Drawer';
import type { FactionView, GameActions, GameQueries } from '../GameActions';
import type { DiplomacyView } from '../../sim/EmpireSim';
import { CONTACT_RANGE, type DiplomaticAction } from '../../core/diplomacy/Diplomacy';
import { icon, resourceIcon } from '../icons';
import { BIOMES } from '../../content/biomes';
import { slotsOf } from '../../content/buildings';
import type { Planet } from '../../core/galaxy/Planets';
import { clear, fmt, h } from '../dom';
import { thumb } from '../thumbs';
import { BUILDING_ART_STYLES } from '../../content/artStyles';
import { buildingArtStyle, setBuildingArtStyle } from '../../render/thumbs/drawnArt';
import { COMMERCE, COMPANY_KINDS, EXCHANGE_RESOURCES } from '../../content/commerce';
import { NO_COMMERCE } from '../../core/economy/Commerce';
import { DEFAULT_RESERVE, FOCI, type GovernorFocus } from '../../content/governor';
import type { StockView } from '../../sim/EmpireSim';
import { formatDuration } from '../../core/time/WorldTime';
import { CLOCK } from '../../app/WorldClock';

type Tab = 'overview' | 'colonies' | 'trade' | 'market' | 'companies' | 'relations' | 'politics' | 'religion' | 'intel';
const TABS: Array<[Tab, string]> = [['overview', 'Overview'], ['colonies', 'Colonies'], ['trade', 'Trade'], ['market', 'Market'], ['companies', 'Companies'], ['relations', 'Relations'], ['politics', 'Politics'], ['religion', 'Religion'], ['intel', 'Espionage']];

/** Exploitation: stockpile, trade goods, government and factions, faith, spy networks. */
export class EmpirePanel extends Drawer {
  private tab: Tab = 'overview';
  /** The exchange the Market tab shows, and the amounts trades are made in. */
  private exchange: string | null = null;
  /** The commodity the price chart follows, and how far back it looks (years: a year is a minute). */
  private chartRes: Resource = 'metals';
  private chartSpan = 60;
  private amount = 100;
  private shareAmount = 10;
  private readonly tabsEl = h('div', { class: 'seg' });
  private readonly content = h('div', { class: 'empire-content' });
  /** Flag, name and ruler, with Edit to reopen the founding screen. */
  private readonly banner = h('div', { class: 'empire-banner' });

  constructor(private readonly store: Store<GameState>, private readonly actions: GameActions, private readonly q: GameQueries, private readonly t: EconomyTables, private readonly thumb: (p: Planet) => string) {
    super('empire', 'Empire', 'Colonies, trade, politics, religion and espionage. Income arrives every year: one minute.');
    this.body.append(this.banner, this.tabsEl, this.content);
    store.subscribe((s, prev) => { if (this.opened && (s.identity !== prev.identity || s.economy !== prev.economy || s.empire !== prev.empire || s.lastReport !== prev.lastReport || s.fleets !== prev.fleets || s.turn !== prev.turn || s.construction !== prev.construction || s.commerce !== prev.commerce || s.governor !== prev.governor)) this.render(); });
  }

  protected onOpen(): void {
    this.render();
  }

  private render(): void {
    const id = this.store.state.identity;
    this.banner.hidden = !id;
    if (id) this.banner.replaceChildren(flagEl(id.flag, 54),
      h('div', {}, h('b', { style: `color:${id.color}` }, id.name), h('div', { class: 'small muted' }, `${id.title} ${id.ruler} · capital ${id.capital}`)),
      h('button', { class: 'chip', onclick: () => this.actions.editEmpire() }, 'Edit'));
    this.tabsEl.replaceChildren(...TABS.map(([id, label]) => h('button', { class: `seg-btn ${this.tab === id ? 'active' : ''}`, onclick: () => { this.tab = id; this.render(); } }, label)));
    clear(this.content);
    const views: Record<Tab, () => HTMLElement[]> = {
      overview: () => this.overview(), colonies: () => this.colonies(), trade: () => this.trade(), market: () => this.market(), companies: () => this.companies(), relations: () => this.relations(), politics: () => this.politics(), religion: () => this.religion(), intel: () => this.intel(),
    };
    this.content.append(...views[this.tab]());
  }

  /** One summary row per colony; click a row to open the planet, where its buildings are managed. */
  private colonies(): HTMLElement[] {
    const s = this.store.state;
    const open = (c: Colony) => {
      const star = c.starId ? this.q.starById(c.starId) : null;
      const planet = c.planetId ? this.q.planetById(c.planetId) : null;
      if (star && planet) this.actions.focusPlanet(star, planet);
      else if (star) this.actions.flyTo(star, true);
    };
    // Colonists (change commerce): the population a colony must have before an ark takes one of its people.
    const empireFloor = s.commerce?.colonistFloor ?? 2;
    const floorSelect = (value: number | null, onPick: (n: number | null) => void, inherit?: number) => {
      const sel = h('select', { class: 'floor-pick', 'aria-label': 'Colonist floor' },
        ...(inherit !== undefined ? [h('option', { value: '', selected: value === null }, `Empire (${inherit})`)] : []),
        ...[2, 3, 4, 5, 6, 8, 10, 15, 20].map((n) => h('option', { value: String(n), selected: value === n }, String(n)))) as HTMLSelectElement;
      sel.addEventListener('change', () => onPick(sel.value === '' ? null : Number(sel.value)));
      return sel;
    };
    return [
      h('section', { class: 'card colonist-floor' },
        h('div', { class: 'row-between' }, h('b', {}, 'Colonists'),
          h('label', { class: 'small' }, 'Take colonists only from worlds with population ', floorSelect(empireFloor, (n) => this.actions.setColonistFloor(n, null)), ' or more')),
        h('p', { class: 'small muted' }, 'An ark (yours or a colony company\'s) takes one person from a world at or above this, so it never drops below it less one. Set a different floor for a colony below.')),
      h('p', { class: 'small muted' }, 'Click a colony to open it and manage its buildings.'),
      h('div', { class: 'colony-list' }, ...s.economy.colonies.map((c) => {
        const y = colonyYield(c, this.t);
        const out = Object.entries(y.income).filter(([, n]) => n).map(([r, n]) => `${n! > 0 ? '+' : ''}${n} ${RESOURCES.find((x) => x.id === r)?.short ?? r}`);
        if (y.science) out.push(`+${y.science} SCI`);
        const built = (c.buildings ?? []).length;
        const queued = c.planetId ? this.q.jobs(c.planetId).length : 0;
        const slots = c.planetId ? slotsOf(c.size ?? 3, c.capital) : 0;
        const planet = c.planetId ? this.q.planetById(c.planetId) : null;
        const row = h('button', { class: 'colony-row', title: `Open ${c.name}`, onclick: () => open(c) },
          planet ? h('img', { class: 'planet-thumb cr-thumb', src: this.thumb(planet), alt: `${c.name}, ${c.biome}` }) : h('span', { class: 'cr-thumb' }),
          h('span', { class: 'cr-name' }, h('b', {}, c.name), h('small', { class: 'muted' }, `${BIOMES.find((b) => b.id === c.biome)?.name ?? c.biome}${c.size ? ` · size ${c.size}` : ''}`)),
          h('span', { class: 'cr-out small' }, out.join('  ') || '—'),
          h('span', { class: 'cr-slots mono small', title: 'Buildings / slots' }, slots ? `${built}/${slots}` : '—', queued ? h('span', { class: 'tag' }, `+${queued} building`) : ''),
          icon('locate'));
        return h('div', { class: 'colony-item' }, row,
          c.planetId ? h('label', { class: 'cr-floor small muted', title: 'Population this colony must have before an ark takes one of its people' },
            `Pop ${c.pop ?? 1} · gives colonists at `, floorSelect(c.colonistFloor ?? null, (n) => this.actions.setColonistFloor(n, c.planetId!), empireFloor), ' or more') : '');
      })),
    ];
  }

  private get econ() {
    const s = this.store.state;
    return { ...s.economy, stock: s.empire.materials };
  }

  private overview(): HTMLElement[] {
    const s = this.store.state;
    const r = s.lastReport;
    const approval = factionApproval(this.econ, this.t, s.empire.research);
    const caps = this.q.caps();
    return [
      this.governorCard(),
      h('div', { class: 'stock-grid' }, ...RESOURCES.map((res) => h('div', { class: 'stock' },
        thumb('resource', res.id, 40),
        h('span', { class: 'stock-name' }, res.name),
        h('b', { class: `mono ${caps[res.id] !== undefined && s.empire.materials[res.id] >= caps[res.id]! ? 'red' : ''}`, title: caps[res.id] !== undefined ? `Storage ${fmt(caps[res.id]!)}` : '' }, fmt(s.empire.materials[res.id]), caps[res.id] !== undefined ? h('span', { class: 'muted small' }, ` / ${fmt(caps[res.id]!)}`) : ''),
        r && r.income[res.id] ? h('span', { class: `delta ${r.income[res.id]! > 0 ? 'up' : 'down'}` }, `${r.income[res.id]! > 0 ? '+' : ''}${r.income[res.id]}`) : h('span', { class: 'delta' }, ''),
        h('small', {}, res.source)))),
      h('div', { class: 'two-col' },
        h('section', { class: 'card' }, h('h4', {}, 'Colonies'),
          h('ul', { class: 'plain' }, ...s.economy.colonies.map((c) => h('li', {}, h('b', {}, c.name), h('span', { class: 'muted' }, ` · ${c.biome} · ${(c.buildings ?? []).length} building${(c.buildings ?? []).length === 1 ? '' : 's'}`)))),
          h('button', { class: 'chip', onclick: () => { this.tab = 'colonies'; this.render(); } }, 'Manage colonies')),
        h('section', { class: 'card' }, h('h4', {}, 'State of the empire'),
          h('ul', { class: 'plain' },
            h('li', {}, `Stability ${stabilityOf(approval)}%`),
            h('li', {}, `Science +${sciencePerTurn(this.econ, this.t, s.empire.research)} shards per year`),
            h('li', {}, `Trade bonus +${tradePctOf(this.econ, this.t, s.empire.research)}%`),
            h('li', {}, `Ships in service ${Object.values(s.economy.roster).reduce((a, b) => a + b, 0)} · upkeep ${upkeepOf(s.economy, this.t)} credits a year`),
            h('li', {}, `Under construction: ${s.construction.length || 'nothing'}`)))),
      h('section', { class: 'card' }, h('h4', {}, r ? 'Last year' : 'Your first yearly report arrives within a minute'),
        r ? h('ul', { class: 'plain' }, ...r.lines.map((l) => h('li', {}, l))) : null),
      h('section', { class: 'card' }, h('h4', {}, 'Your empire is saved'),
        h('p', { class: 'small muted' }, `The world advances one year per minute, even while you are away. Progress is saved in this browser.`),
        h('button', { class: 'btn', onclick: () => { if (confirm('Abandon this empire and found a new one? This cannot be undone.')) this.actions.resetEmpire(); } }, 'Found a new empire')),
      this.artCard(),
    ];
  }

  /** How building pictures are drawn, for this browser only (change hand-drawn-art). */
  private artCard(): HTMLElement {
    const cur = buildingArtStyle();
    const sample = ['farm', 'mine', 'lab', 'shipyard', 'capitol'];
    return h('section', { class: 'card art-style' },
      h('h4', {}, 'Building art'),
      h('p', { class: 'small muted' }, 'How buildings are pictured on planet cards and build menus. Only you see your choice.'),
      h('div', { class: 'seg' }, ...BUILDING_ART_STYLES.map((st) => h('button', { class: `seg-btn ${cur.id === st.id ? 'active' : ''}`, title: st.blurb, onclick: () => { setBuildingArtStyle(st.id); this.render(); } }, st.name))),
      h('p', { class: 'small' }, cur.blurb),
      h('div', { class: 'art-sample' }, ...sample.map((id) => thumb('building', id, 56))));
  }

  private trade(): HTMLElement[] {
    const s = this.store.state;
    const pct = tradePctOf(this.econ, this.t, s.empire.research);
    const made = s.economy.colonies.reduce((n, c) => n + (colonyYield(c, this.t).income.goods ?? 0), 0);
    const groups = this.q.groups().filter((g) => g.ships.some((x) => x.classId === FREIGHTER && x.count > 0));
    const dock = groups.find((g) => g.id === 'dock');
    const docked = dock?.ships.find((x) => x.classId === FREIGHTER)?.count ?? 0;
    const perHold = this.q.cargoCapacity([{ classId: FREIGHTER, count: 1 }]);
    const colonies = s.economy.colonies.map((c) => (c.starId ? this.q.starById(c.starId) : null)).filter((x): x is StarSystem => !!x);
    // Companies run their own freighters (Companies tab).
    const fleets = groups.filter((g) => g.id !== 'dock' && !g.company);
    const companyFreighters = groups.filter((g) => g.company).reduce((n, g) => n + (g.ships.find((x) => x.classId === FREIGHTER)?.count ?? 0), 0);
    return [
      h('p', { class: 'muted' }, `Colonies make trade goods (${fmt(s.empire.materials.goods)} in store, +${made} a year; Manufactories make more). Bulk Freighters carry ${perHold} each to another world and sell them: the farther from where they were loaded, the better the price, and foreign markets pay more than your own colonies, less their tariff.${pct ? ` Your traders get +${pct}%.` : ''} To sell at once without a ship, use the Market tab; freighters chartered as a company trade on their own (Companies).`),
      h('section', { class: 'card' }, h('h4', {}, 'Freighters'),
        groups.length ? h('ul', { class: 'plain' },
          dock && docked ? h('li', {}, h('b', {}, `${docked} in the dock`), h('span', { class: 'muted' }, ' · pick a market below to start a trade run')) : null,
          companyFreighters ? h('li', {}, h('b', {}, `${companyFreighters} run by trading companies`), h('span', { class: 'muted' }, ' · they choose their own routes (Companies tab)')) : null,
          ...fleets.map((g) => {
            const run = g.orders?.trade;
            const to = run && this.q.starById(run.to);
            return h('li', {}, h('b', {}, g.name),
              h('span', { class: 'muted' }, ` · ${fmt(g.cargo ?? 0)} / ${fmt(this.q.cargoCapacity(g.ships))} goods · ${to ? `trade run to ${to.name}` : g.star ? `at ${g.star.name}` : 'in space'}`),
              ' ', to ? h('button', { class: 'chip', onclick: () => this.actions.tradeRun(g.id, null) }, 'Stop run') : h('button', { class: 'chip', onclick: () => this.actions.focusFleet(g.id) }, 'Show'));
          })) : h('p', { class: 'muted' }, 'No Bulk Freighters yet: build them at a shipyard (Container Logistics research).')),
      h('table', { class: 'data' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Market'), h('th', {}, 'Owner'), h('th', { class: 'num' }, 'Run'), h('th', { class: 'num' }, 'Full hold sells for'), h('th', {}, ''))),
        h('tbody', {}, ...this.q.markets().map((m) => {
          const star = this.q.starById(m.starId);
          const from = star && colonies.filter((c) => c.id !== star.id).sort((a, b) => hexDistance(a.hex, star.hex) - hexDistance(b.hex, star.hex))[0];
          const running = fleets.filter((g) => g.orders?.trade?.to === m.starId).length;
          const idle = fleets.find((g) => !g.orders?.trade);
          const by = docked ? 'dock' : idle?.id;
          return h('tr', { class: running ? 'on' : '' },
            h('td', {}, m.name), h('td', { class: 'muted' }, m.kind === 'own' ? 'your colony' : m.kind === 'npc' ? 'alien world' : 'other empire'),
            h('td', { class: 'num mono' }, from && star ? `${fmt(hexDistance(from.hex, star.hex))} ly` : '—'),
            h('td', { class: 'num mono' }, from ? `${fmt(this.q.saleValue(perHold, from, m))} cr` : '—'),
            h('td', {}, from && by ? h('button', { class: 'chip', onclick: () => this.actions.tradeRun(by, star) }, running ? `Add freighters (${running} running)` : 'Start trade run') : h('span', { class: 'muted small' }, running ? `${running} running` : from ? 'No free freighters' : 'Needs another colony to load at')));
        }))),
    ];
  }

  /**
   * Exchanges (change commerce): buy and sell resources at once on the exchange of any empire you
   * have met, against what freighters would get; and the tariffs other players pay you.
   */
  private market(): HTMLElement[] {
    const s = this.store.state;
    const exchanges = this.q.exchanges();
    if (!exchanges.length) return [h('p', { class: 'muted' }, 'No exchanges yet: you can trade only on the exchanges of empires you have met. Your home\'s neighbours make contact within a year.'), this.tariffs()];
    const ex = exchanges.find((x) => x.id === this.exchange) ?? exchanges[0];
    this.exchange = ex.id;
    const amount = this.amount;
    const caps = this.q.caps();
    const spread = Math.round(COMMERCE.spread * 100);
    const ship = this.q.shippingQuote(ex.id);
    return [
      h('p', { class: 'muted' }, `Trade at once on the exchange of any empire you have met. Buying costs ${spread}% above the price and selling pays ${spread}% below it, and the owner takes its tariff both ways. Prices drift over the years, and your own trading moves them: a big sale lowers the price you get there, for a while.`),
      h('div', { class: 'exchange-pick' }, ...exchanges.map((x) => h('button', { class: `chip ${x.id === ex.id ? 'active' : ''}`, onclick: () => { this.exchange = x.id; this.render(); } },
        h('span', { class: 'doc-dot', style: `--doc:${x.color ?? '#7fd3e6'}` }), x.name, h('small', { class: 'muted' }, ` · ${x.tariff}% tariff`)))),
      h('div', { class: 'row amount-pick' }, h('span', { class: 'small muted' }, 'Amount:'),
        ...[10, 100, 500, 1000].map((n) => h('button', { class: `chip ${n === amount ? 'active' : ''}`, onclick: () => { this.amount = n; this.render(); } }, fmt(n)))),
      h('div', { class: 'exchange' },
        h('div', { class: 'ex-row ex-head' }, h('span', {}, 'Resource'), h('span', { class: 'ex-trend' }, 'Trend'), h('span', { class: 'num' }, 'Buy / sell each'), h('span', {}, '')),
        ...EXCHANGE_RESOURCES.map((r) => {
          const def = RESOURCES.find((x) => x.id === r)!;
          const stock = s.empire.materials[r];
          const room = caps[r] !== undefined ? Math.max(0, caps[r]! - stock) : Infinity;
          const buyN = Math.min(amount, Math.floor(room)), sellN = Math.min(amount, Math.floor(stock));
          const buy = buyN ? this.q.exchangeQuote(ex.id, r, 'buy', buyN) : 0, sell = sellN ? this.q.exchangeQuote(ex.id, r, 'sell', sellN) : 0;
          const trend = trendLine(this.q.exchangeHistory(ex.id, r, this.chartSpan, 40));
          const pct = Math.round(trend.change * 1000) / 10;
          return h('div', { class: `ex-row ${r === this.chartRes ? 'charted' : ''}` },
            h('button', { class: 'ex-res', title: `Chart ${def.name.toLowerCase()} prices`, onclick: () => { this.chartRes = r; this.render(); } }, resourceIcon(r, 16), h('span', {}, h('b', {}, def.name), h('small', { class: 'muted' }, `${fmt(stock)}${caps[r] !== undefined ? ` of ${fmt(caps[r]!)}` : ''} in store`))),
            h('span', { class: 'ex-trend', title: `${pct >= 0 ? 'Up' : 'Down'} ${Math.abs(pct)}% over the last ${agoLabel(this.chartSpan).replace(' ago', '')}` }, trend.el, h('small', { class: 'muted mono' }, `${pct > 0 ? '▲' : pct < 0 ? '▼' : '·'} ${Math.abs(pct).toFixed(1)}%`)),
            h('span', { class: 'num mono ex-price' }, h('span', { class: 'red', title: 'Buy price, each' }, this.q.exchangePrice(ex.id, r, 'buy').toFixed(2)), h('span', { class: 'green', title: 'Sell price, each' }, this.q.exchangePrice(ex.id, r, 'sell').toFixed(2))),
            h('span', { class: 'trade-btns' },
              h('button', { class: 'chip', disabled: !buyN || buy > s.empire.materials.credits, title: buyN ? `${fmt(buyN)} ${def.name.toLowerCase()} for ${fmt(buy)} credits` : 'No room in store', onclick: () => this.actions.buyResource(ex.id, r, buyN) }, buyN ? `Buy ${fmt(buyN)} · ${fmt(buy)} cr` : 'Store full'),
              h('button', { class: 'chip', disabled: !sellN, title: sellN ? `${fmt(sellN)} ${def.name.toLowerCase()} for ${fmt(sell)} credits` : 'None to sell', onclick: () => this.actions.sellResource(ex.id, r, sellN) }, sellN ? `Sell ${fmt(sellN)} · ${fmt(sell)} cr` : 'None to sell')));
        })),
      this.priceChart(exchanges, ex.id),
      ship ? h('section', { class: 'card ship-vs' }, h('h4', {}, 'Shipping against the exchange: trade goods'),
        h('div', { class: 'vs-row' }, h('span', {}, `${ex.name} exchange`), h('span', { class: 'vs-bar' }, h('i', { style: `width:${Math.min(100, (100 * ship.exchange) / Math.max(ship.freighter, ship.exchange))}%` })), h('b', { class: 'mono' }, `${ship.exchange.toFixed(2)} cr each, now`)),
        h('div', { class: 'vs-row' }, h('span', {}, 'By freighter'), h('span', { class: 'vs-bar freighter' }, h('i', { style: `width:${Math.min(100, (100 * ship.freighter) / Math.max(ship.freighter, ship.exchange))}%` })), h('b', { class: 'mono' }, `${ship.freighter.toFixed(2)} cr each`)),
        h('p', { class: 'small muted' }, `A freighter loads at ${ship.from} and sells at ${ship.to}: ${formatDuration(ship.years, CLOCK)} one way, ${ship.freighter > ship.exchange ? `${(ship.freighter / Math.max(0.01, ship.exchange)).toFixed(1)}× what the exchange pays` : 'no better than the exchange'}. The exchange pays now, with no ship.`))
        : h('p', { class: 'small muted' }, `You know no world of ${ex.name} a freighter could sell at.`),
      this.tariffs(),
    ];
  }

  /**
   * The empire governor (change empire-governor): a focus, and whether it builds in free slots and
   * picks research when none is set. Companies (chartered ships) do the mining, trading and settling.
   */
  private governorCard(): HTMLElement {
    const g = this.store.state.governor ?? { focus: 'balanced' as GovernorFocus, build: false, research: false, reserve: DEFAULT_RESERVE };
    const set = (patch: Partial<typeof g>) => { const n = { ...g, ...patch }; this.actions.setGovernor(n.focus, n.build, n.research, n.reserve); };
    const on = g.build || g.research;
    const reserve = h('input', { type: 'range', min: 0, max: 5000, step: 100, value: g.reserve }) as HTMLInputElement;
    const out = h('output', { class: 'mono' }, fmt(g.reserve));
    reserve.addEventListener('input', () => { out.textContent = fmt(Number(reserve.value)); });
    reserve.addEventListener('change', () => set({ reserve: Number(reserve.value) }));
    return h('section', { class: `card governor ${on ? 'on' : ''}` },
      h('div', { class: 'row-between' }, h('h4', {}, 'Governor'), h('span', { class: `pill ${on ? 'good' : ''}` }, on ? 'Running the empire' : 'Off')),
      h('p', { class: 'small muted' }, 'Pick a focus and let the governor build and research for it. Freighters, miners and colony arks chartered as companies trade, mine and settle on their own.'),
      h('div', { class: 'seg focus-pick' }, ...(Object.keys(FOCI) as GovernorFocus[]).map((f) => h('button', { class: `seg-btn ${g.focus === f ? 'active' : ''}`, title: FOCI[f].blurb, onclick: () => set({ focus: f }) }, FOCI[f].name))),
      h('p', { class: 'small' }, FOCI[g.focus].blurb),
      h('div', { class: 'row' },
        h('button', { class: `chip ${g.build ? 'active' : ''}`, 'aria-pressed': String(g.build), title: 'Every year, start the best building for the focus on each colony with a free slot', onclick: () => set({ build: !g.build }) }, g.build ? '✓ Build in free slots' : 'Build in free slots'),
        h('button', { class: `chip ${g.research ? 'active' : ''}`, 'aria-pressed': String(g.research), title: 'Pick the next research for the focus whenever none is set', onclick: () => set({ research: !g.research }) }, g.research ? '✓ Pick research' : 'Pick research')),
      h('label', { class: 'slider reserve' }, h('span', {}, 'Keep in reserve'), reserve, out));
  }

  /** A commodity's price over time on the exchanges you have met, the one you are trading on first. */
  private priceChart(exchanges: readonly { id: string; name: string }[], current: string): HTMLElement {
    const def = RESOURCES.find((x) => x.id === this.chartRes)!;
    const ordered = [...exchanges.filter((x) => x.id === current), ...exchanges.filter((x) => x.id !== current)].slice(0, MAX_LINES);
    const lines = ordered.map((x) => ({ id: x.id, name: x.name, points: this.q.exchangeHistory(x.id, this.chartRes, this.chartSpan, 121) }));
    const ranges: Array<[string, number]> = [['1 hour', 60], ['6 hours', 360], ['1 day', 1440]];
    return h('section', { class: 'card price-chart' },
      h('div', { class: 'row pc-head' }, h('h4', {}, `${def.name} price`),
        h('span', { class: 'pc-chips' }, ...EXCHANGE_RESOURCES.map((r) => h('button', { class: `chip ${r === this.chartRes ? 'active' : ''}`, onclick: () => { this.chartRes = r; this.render(); } }, RESOURCES.find((x) => x.id === r)!.name))),
        h('span', { class: 'pc-chips' }, ...ranges.map(([label, span]) => h('button', { class: `chip ${span === this.chartSpan ? 'active' : ''}`, onclick: () => { this.chartSpan = span; this.render(); } }, label)))),
      marketChart(lines, this.store.state.turn, def.name),
      h('p', { class: 'small muted' }, `Each exchange's own price, before the buy and sell spread, its tariff, and the effect of your own recent trading there. ${exchanges.length > MAX_LINES ? `The first ${MAX_LINES} exchanges are drawn; pick an exchange above to put it first.` : ''}`));
  }

  /** Your tariffs: what other players pay to trade on your exchange or sell goods at your worlds. */
  private tariffs(): HTMLElement {
    const c = this.store.state.commerce ?? NO_COMMERCE;
    const slider = (value: number, set: (n: number) => void) => {
      const input = h('input', { type: 'range', min: 0, max: COMMERCE.maxTariff, step: 1, value }) as HTMLInputElement;
      const out = h('output', { class: 'mono' }, `${value}%`);
      input.addEventListener('input', () => { out.textContent = `${input.value}%`; });
      input.addEventListener('change', () => set(Number(input.value)));
      return [input, out];
    };
    const players = this.q.diplomacyView();
    return h('section', { class: 'card tariffs' }, h('h4', {}, 'Your tariffs'),
      h('p', { class: 'small muted' }, 'Other players pay your tariff when they trade on your exchange or sell trade goods at your worlds; it reaches you the next year. A high tariff earns more from each trade, and makes your markets the last place they choose.'),
      h('label', { class: 'slider' }, h('span', {}, 'Everyone'), ...slider(c.tariff, (n) => this.actions.setTariff(n, null))),
      ...players.map((v) => h('label', { class: 'slider' }, h('span', {}, h('span', { class: 'doc-dot', style: `--doc:${v.empire.color ?? '#7fd3e6'}` }), v.empire.name), ...slider(c.tariffs?.[v.empire.id] ?? c.tariff, (n) => this.actions.setTariff(n, v.empire.id)))),
      players.length ? '' : h('p', { class: 'small muted' }, 'Players you meet can be given tariffs of their own here.'));
  }

  /**
   * Companies and the stock market (change commerce): the companies your civilian ships founded,
   * and shares in yours, other players' and NPC corporations.
   */
  private companies(): HTMLElement[] {
    const s = this.store.state;
    const stocks = this.q.stocks();
    const own = stocks.filter((x) => x.kind === 'own');
    const market = stocks.filter((x) => x.kind !== 'own');
    const n = this.shareAmount;
    const credits = s.empire.materials.credits;
    const fee = COMMERCE.shareFee;
    const income = own.reduce((t, x) => t + x.dividend * x.held, 0) + market.reduce((t, x) => t + x.dividend * x.held, 0);
    const worth = stocks.reduce((t, x) => t + x.price * x.held, 0);
    const trade = (x: StockView) => {
      const buyN = Math.min(n, x.float), sellN = Math.min(n, x.held);
      const cost = Math.ceil(x.price * buyN * (1 + fee)), gain = Math.floor(x.price * sellN * (1 - fee));
      return h('span', { class: 'trade-btns' },
        h('button', { class: 'chip', disabled: !buyN || cost > credits, title: buyN ? `${buyN} shares for ${fmt(cost)} credits` : 'None for sale', onclick: () => this.actions.buyShares(x.key, buyN) }, buyN ? `Buy ${buyN} · ${fmt(cost)} cr` : 'None for sale'),
        h('button', { class: 'chip', disabled: !sellN, title: sellN ? `${sellN} shares for ${fmt(gain)} credits` : 'You hold none', onclick: () => this.actions.sellShares(x.key, sellN) }, sellN ? `Sell ${sellN} · ${fmt(gain)} cr` : 'Sell'));
    };
    return [
      h('p', { class: 'muted' }, `A freighter, mining ship or colony ark built with "Charter a company" founds a company that runs it on its own: traders buy goods from you and sell them on the best route they know, miners sell you their ore, and colony companies settle the best worlds you have surveyed nearby for a fee. Each year a company pays its upkeep and ${Math.round(COMMERCE.tax * 100)}% tax, pays out half of the rest as dividends and keeps the remainder; when its last ten years add up to a profit and it has the credits, it buys another ship, up to ${COMMERCE.maxShips}.`),
      h('div', { class: 'row amount-pick' }, h('span', { class: 'small muted' }, 'Shares per trade:'),
        ...[1, 10, 50, 100].map((k) => h('button', { class: `chip ${k === n ? 'active' : ''}`, onclick: () => { this.shareAmount = k; this.render(); } }, String(k)))),
      h('p', { class: 'small muted' }, `Your shares are worth ${fmt(Math.round(worth))} credits and pay about ${fmt(Math.round(income))} a year in dividends. Each trade costs a ${Math.round(fee * 100)}% fee.`),
      h('section', { class: 'card' }, h('h4', {}, 'Your companies'),
        own.length ? h('div', { class: 'company-list' }, ...own.map((x) => h('div', { class: 'company' },
          h('div', { class: 'row-between' },
            h('div', {}, h('b', {}, x.name), h('div', { class: 'small muted' }, `${COMPANY_KINDS[x.sector as keyof typeof COMPANY_KINDS]?.name ?? x.sector} · ${x.ships ?? 0} ship${x.ships === 1 ? '' : 's'} · ${fmt(Math.round(x.treasury ?? 0))} cr in the bank · last year ${(x.profit ?? 0) >= 0 ? '+' : ''}${fmt(x.profit ?? 0)} cr`)),
            x.fleetId ? h('button', { class: 'chip', onclick: () => this.actions.focusFleet(x.fleetId!) }, 'Show fleet') : ''),
          x.status ? h('div', { class: 'small company-status' }, x.status) : '',
          h('div', { class: 'small' }, `Share ${x.price.toFixed(2)} cr · dividend ${x.dividend.toFixed(2)} a share · you hold ${x.held} of ${x.shares} · ${x.float} for sale`),
          h('span', { class: 'meter' }, h('i', { style: `width:${(100 * x.held) / (x.shares ?? 100)}%` })),
          trade(x)))) : h('p', { class: 'small muted' }, 'None yet. Build a freighter, mining ship or colony ark with "Charter a company" ticked.')),
      h('section', { class: 'card' }, h('h4', {}, 'Stock market'),
        market.length ? h('table', { class: 'data stocks' },
          h('thead', {}, h('tr', {}, h('th', {}, 'Company'), h('th', { class: 'num' }, 'Price'), h('th', { class: 'num' }, 'Yield'), h('th', { class: 'num' }, 'Held'), h('th', {}, ''))),
          h('tbody', {}, ...market.map((x) => h('tr', { class: x.held ? 'on' : '' },
            h('td', {}, h('b', {}, x.name), h('div', { class: 'small muted' }, `${x.owner}${x.kind === 'player' ? ' (player)' : ''} · ${x.kind === 'player' ? COMPANY_KINDS[x.sector as keyof typeof COMPANY_KINDS]?.name ?? x.sector : x.sector}`)),
            h('td', { class: 'num mono' }, x.history ? sparkline(x.history) : '', ` ${x.price.toFixed(2)}`),
            h('td', { class: 'num mono' }, x.price ? `${((100 * x.dividend) / x.price).toFixed(2)}%` : '—'),
            h('td', { class: 'num mono' }, fmt(x.held)),
            h('td', {}, x.delisted ? h('button', { class: 'chip', onclick: () => this.actions.sellShares(x.key, x.held) }, 'Write off') : trade(x)))))) : h('p', { class: 'small muted' }, 'Meet other empires to trade their shares: each NPC faction has two corporations, and players you have met list their companies here.')),
    ];
  }

  /** Reputation: a chart of your standing with every known NPC faction over time, then each faction. */
  private relations(): HTMLElement[] {
    return [...this.playerRelations(), ...this.factionRelations()];
  }

  /** Diplomacy with other players: war, peace and alliances, with any proposal waiting. */
  private playerRelations(): HTMLElement[] {
    const rows = this.q.diplomacyView();
    const unmet = this.q.unmetEmpires();
    if (!rows.length && !unmet) return [];
    const strangers = unmet ? h('p', { class: 'small muted unmet' }, `${unmet} other ${unmet === 1 ? 'empire' : 'empires'} not met yet. You can deal with an empire only after first contact: when one of your fleets or worlds comes within ${CONTACT_RANGE} hexes of one of theirs.`) : '';
    const label: Record<DiplomaticAction, string> = {
      'declare-war': 'Declare war', 'propose-peace': 'Propose peace', 'propose-alliance': 'Propose alliance',
      accept: 'Accept', decline: 'Decline', withdraw: 'Withdraw proposal', 'break-alliance': 'Break alliance',
    };
    const status = (v: DiplomacyView) => v.relation.status === 'war' ? (v.atWar ? 'At war' : 'War declared: fighting starts within a year') : v.relation.status === 'alliance' ? 'Allied' : 'Neutral';
    return [h('section', { class: 'card' }, h('h4', {}, 'Players'),
      h('p', { class: 'small muted' }, 'Fleets fight only empires at war with each other. War starts a year after it is declared; peace and alliances need both sides to agree. An ally\'s systems are friendly to your fleets.'),
      strangers,
      ...rows.map((v) => {
        const p = v.relation.proposal;
        const pending = p ? (p.from === v.empire.id ? `They propose ${p.kind === 'peace' ? 'peace' : 'an alliance'}` : `You proposed ${p.kind === 'peace' ? 'peace' : 'an alliance'}`) : '';
        return h('div', { class: `diplo-row ${v.relation.status}` },
          h('div', {}, h('span', { class: 'doc-dot', style: `--doc:${v.empire.color ?? '#7fd3e6'}` }), h('b', {}, v.empire.name),
            h('div', { class: 'small muted' }, status(v), pending ? h('span', { class: 'pending' }, ` · ${pending}`) : '')),
          h('div', { class: 'row' }, ...v.actions.map((a) => h('button', {
            class: `chip ${a === 'declare-war' || a === 'break-alliance' ? 'danger' : a === 'accept' ? 'active' : ''}`,
            onclick: () => { if (a !== 'declare-war' || confirm(`Declare war on ${v.empire.name}? Their fleets and yours will fight wherever they meet, from a year from now.`)) this.actions.diplomacy(v.empire.id, a); },
          }, label[a]))));
      }))];
  }

  private factionRelations(): HTMLElement[] {
    const s = this.store.state;
    const factions = this.q.factions();
    if (!factions.length) return [h('p', { class: 'muted' }, 'You have not met any NPC factions yet. Your home\'s neighbours make contact within a year; others when your fleets come near their space.')];
    const cost = STANDING.tributeCost;
    const canPay = s.empire.materials.credits >= cost.credits && s.empire.materials.influence >= cost.influence;
    return [
      h('p', { class: 'muted' }, `Where you stand with each faction, from −100 to +100. Selling them trade goods and paying tribute raise it; fighting their raiders lowers it a little and attacking their worlds a lot. It drifts back toward each faction's nature over time. Cordial and Allied factions do not raid you, Hostile ones raid more, and their markets pay more the better you stand.`),
      h('section', { class: 'card' }, h('h4', {}, 'Reputation'), reputationChart(s.relations, factions, s.turn)),
      ...factions.map((f) => {
        const tier = tierOf(f.standing);
        const pct = (f.standing + 100) / 2;
        return h('section', { class: 'card npc-faction' },
          h('div', { class: 'row-between' },
            h('div', {}, h('span', { class: 'doc-dot', style: `--doc:${f.color}` }), h('b', {}, f.name), h('span', { class: 'muted small' }, ` · strength ${f.tier} · ${f.worlds} world${f.worlds === 1 ? '' : 's'} · ${f.fleets} raider fleet${f.fleets === 1 ? '' : 's'}`)),
            h('span', { class: 'tier-badge', style: `--tier:${tier.color}` }, `${tier.name} ${f.standing > 0 ? '+' : ''}${f.standing}`)),
          h('div', { class: 'standing-bar', title: `Standing ${f.standing} (drifts toward ${f.disposition})` },
            h('i', { class: 'zero' }), h('i', { class: 'mark', style: `left:${pct}%; background:${tier.color}` }), h('i', { class: 'home', style: `left:${(f.disposition + 100) / 2}%` })),
          h('p', { class: 'small muted' }, `${tier.blurb} ${f.blurb}`),
          h('div', { class: 'row' },
            h('button', { class: 'chip', disabled: !canPay, title: `Costs ${cost.credits} credits and ${cost.influence} influence`, onclick: () => this.actions.sendTribute(f.id) }, `Send tribute (+${STANDING.tribute}) · ${cost.credits} CR, ${cost.influence} INF`),
            h('button', { class: 'chip', onclick: () => { this.actions.select(f.home); this.actions.flyTo(f.home); } }, `Locate ${f.home.name}`)));
      }),
    ];
  }

  private politics(): HTMLElement[] {
    const s = this.store.state;
    const research = s.empire.research;
    const approval = factionApproval(this.econ, this.t, research);
    const stability = stabilityOf(approval);
    const slots = maxPolicies(this.t, research);
    return [
      h('section', { class: 'card' }, h('h4', {}, 'Government ', h('span', { class: 'muted small' }, '(changing costs 30 influence)')),
        h('div', { class: 'option-grid' }, ...GOVERNMENTS.map((g) => {
          const available = !g.unlock || hasGrant(this.t.tree, research, g.unlock);
          const active = s.economy.government === g.id;
          return h('button', { class: `option ${active ? 'active' : ''}`, disabled: !available || active, onclick: () => this.actions.setGovernment(g.id) },
            h('b', {}, g.name), h('span', {}, g.blurb), !available ? h('small', { class: 'muted' }, `Locked: research ${this.t.tree.nodes.find((n) => n.grants.some((x) => x.kind === 'part' && x.id === g.unlock))?.name ?? 'its Society technology'}`) : null);
        }))),
      h('section', { class: 'card' }, h('h4', {}, `Policies (${s.economy.policies.length} of ${slots})`),
        h('div', { class: 'option-grid' }, ...POLICIES.map((p) => {
          const on = s.economy.policies.includes(p.id);
          return h('button', { class: `option ${on ? 'active' : ''}`, disabled: !on && s.economy.policies.length >= slots, onclick: () => this.actions.togglePolicy(p.id) }, h('b', {}, p.name), h('span', {}, p.blurb));
        }))),
      h('section', { class: 'card' }, h('h4', {}, `Factions · stability ${stability}%`, stability < 40 ? h('span', { class: 'pill bad' }, 'Unrest: −20% income') : stability > 70 ? h('span', { class: 'pill good' }, 'Content: +10% income') : null),
        h('div', { class: 'factions' }, ...FACTIONS.map((f) => h('div', { class: 'faction' },
          h('span', { class: 'fname' }, f.name), h('span', { class: 'meter' }, h('i', { style: `width:${approval[f.id]}%`, class: approval[f.id] < 40 ? 'low' : approval[f.id] > 70 ? 'high' : '' })),
          h('span', { class: 'mono' }, `${approval[f.id]}%`), h('small', { class: 'muted' }, `wants ${f.wants}`))))),
    ];
  }

  private religion(): HTMLElement[] {
    const s = this.store.state;
    const faith = s.economy.faith;
    const canFound = hasGrant(this.t.tree, s.empire.research, 'faith');
    if (!faith) {
      const name = h('input', { value: 'Church of the Long Dark', id: 'faith-name', 'aria-label': 'Faith name' }) as HTMLInputElement;
      const picked = new Set<string>(['star-pilgrims', 'harmony']);
      const tenetBtns = TENETS.map((t) => {
        const b = h('button', { class: `option ${picked.has(t.id) ? 'active' : ''}`, onclick: () => {
          if (picked.has(t.id)) picked.delete(t.id); else if (picked.size < 2) picked.add(t.id);
          tenetBtns.forEach((x, i) => x.classList.toggle('active', picked.has(TENETS[i].id)));
        } }, h('b', {}, t.name), h('span', {}, t.blurb));
        return b;
      });
      return [
        h('p', { class: 'muted' }, 'A faith earns Faith and Influence from every follower, at home and in other empires. Missionaries convert other empires a few percent each year.'),
        h('section', { class: 'card' }, h('h4', {}, 'Found a faith'),
          canFound ? null : h('p', { class: 'warn' }, 'Research Cathedral Ships, Spore Missions or Harmony of the Spheres first.'),
          h('label', { class: 'field' }, h('span', {}, 'Name'), name),
          h('p', { class: 'small muted' }, 'Pick two tenets:'),
          h('div', { class: 'option-grid' }, ...tenetBtns),
          h('button', { class: 'btn primary', disabled: !canFound, onclick: () => this.actions.foundFaith(name.value || 'The Faith', [...picked]) }, 'Found faith')),
      ];
    }
    return [
      h('section', { class: 'card' }, h('h4', {}, faith.name),
        h('p', { class: 'muted' }, 'Tenets: ', faith.tenets.map((id) => TENETS.find((t) => t.id === id)?.name).join(' · '))),
      h('section', { class: 'card' }, h('h4', {}, 'Followers by empire ', h('span', { class: 'muted small' }, '(missionaries work on up to 3)')),
        h('div', { class: 'factions' }, ...[s.playerName, ...this.q.knownEmpires().map((k) => k.name)].map((e) => {
          const pct = faith.adherents[e] ?? 0;
          const on = faith.missions.includes(e);
          return h('div', { class: 'faction' },
            h('span', { class: 'fname' }, e), h('span', { class: 'meter faith' }, h('i', { style: `width:${pct}%` })), h('span', { class: 'mono' }, `${pct}%`),
            e === s.playerName ? h('small', { class: 'muted' }, 'home') : h('span', {}, on && !this.q.reached(e) ? h('span', { class: 'tag warn', title: 'Missionaries need one of your ships in their space' }, 'NO SHIP') : '', h('button', { class: `chip ${on ? 'active' : ''}`, onclick: () => this.actions.toggleMission(e) }, on ? 'Recall missionaries' : 'Send missionaries')));
        }))),
    ];
  }

  private intel(): HTMLElement[] {
    const s = this.store.state;
    const slots = maxSpies(this.t, s.empire.research);
    const espionage = 3 + bonusOf(this.t.tree, s.empire.research, 'espionage');
    return [
      h('p', { class: 'muted' }, `Spy networks steal ${espionage} research shards a year from the target's technology, even for nodes you are not connected to. Networks: ${s.economy.spyNetworks.length} of ${slots}.`),
      h('div', { class: 'option-grid' }, ...this.q.knownEmpires().map(({ name: empire, tech: techs }) => {
        const on = s.economy.spyNetworks.includes(empire);
        const left = techs.filter((id) => !s.empire.research.researched.includes(id));
        return h('section', { class: `card spy ${on ? 'active' : ''}` },
          h('h4', {}, empire),
          h('p', { class: 'small muted' }, `Known technology: ${left.map((id) => this.t.tree.node(id).name).join(', ') || 'nothing left to steal'}`),
          this.q.reached(empire) ? h('p', { class: 'small green' }, 'A ship of yours is in their space.') : h('p', { class: 'small red' }, 'Needs one of your ships inside their space to operate.'),
          h('button', { class: `btn ${on ? 'on' : ''}`, disabled: !on && s.economy.spyNetworks.length >= slots, onclick: () => this.actions.toggleSpy(empire) }, on ? 'Withdraw network' : 'Plant spy network'));
      })),
    ];
  }
}

/** Standing over time, one line per faction, on bands for the tiers. The last point is now. */
function reputationChart(rel: Relations | undefined, factions: readonly FactionView[], turn: number): HTMLElement {
  const W = 600, H = 200, L = 34, R = 8, T = 8, B = 22;
  const years = [...(rel?.years ?? [])];
  const series = (id: string): Array<number | null> => [...(rel?.series[id] ?? years.map(() => null))];
  if (years.at(-1) !== turn) years.push(turn);
  const lines = factions.map((f) => {
    const v = series(f.id);
    while (v.length < years.length - 1) v.unshift(null);
    return { f, v: [...v.slice(0, years.length - 1), f.standing] };
  });
  const x0 = years[0], x1 = Math.max(years[0] + 1, years.at(-1)!);
  const X = (y: number) => L + ((y - x0) / (x1 - x0)) * (W - L - R);
  const Y = (v: number) => T + ((100 - v) / 200) * (H - T - B);
  const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  const bands = TIERS.map((t, i) => {
    const top = i === 0 ? 100 : TIERS[i - 1].min, bottom = Math.max(-100, t.min);
    return `<rect x="${L}" y="${Y(top)}" width="${W - L - R}" height="${Y(bottom) - Y(top)}" fill="${t.color}" opacity="0.06"/><text x="${L - 4}" y="${(Y(top) + Y(bottom)) / 2 + 3}" text-anchor="end" class="tick">${t.name.slice(0, 4)}</text>`;
  }).join('');
  const grid = [50, 10, -10, -50].map((v) => `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" class="grid"/>`).join('') + `<line x1="${L}" x2="${W - R}" y1="${Y(0)}" y2="${Y(0)}" class="zero"/>`;
  const paths = lines.map(({ f, v }) => {
    let d = '', pen = false;
    v.forEach((p, i) => { if (p === null) { pen = false; return; } d += `${pen ? 'L' : 'M'}${X(years[i]).toFixed(1)},${Y(p).toFixed(1)}`; pen = true; });
    const last = v.at(-1)!;
    return `<path d="${d}" fill="none" stroke="${f.color}" stroke-width="2" stroke-linejoin="round"/><circle cx="${X(years.at(-1)!)}" cy="${Y(last)}" r="3.5" fill="${f.color}"><title>${esc(f.name)}: ${last}</title></circle>`;
  }).join('');
  const axis = `<text x="${L}" y="${H - 6}" class="tick">Y${x0}</text><text x="${W - R}" y="${H - 6}" text-anchor="end" class="tick">Y${turn}</text>`;
  const chart = h('div', { class: 'rep-chart' });
  chart.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Standing with each faction over time">${bands}${grid}${paths}${axis}</svg>`;
  return h('div', {}, chart,
    h('div', { class: 'rep-legend' }, ...factions.map((f) => h('span', {}, h('i', { style: `background:${f.color}` }), f.name))),
    years.length < 3 ? h('p', { class: 'small muted' }, 'The chart fills in as the years pass: a point every five years.') : '');
}

/** A tiny line of a price over time (oldest first). */
function sparkline(values: readonly number[]): SVGSVGElement {
  const w = 54, hgt = 16;
  const lo = Math.min(...values), hi = Math.max(...values), span = hi - lo || 1;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * w).toFixed(1)},${(hgt - 1 - ((v - lo) / span) * (hgt - 2)).toFixed(1)}`).join(' ');
  const up = values[values.length - 1] >= values[0];
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${hgt}`);
  svg.setAttribute('class', `spark ${up ? 'up' : 'down'}`);
  svg.setAttribute('aria-hidden', 'true');
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  line.setAttribute('points', pts);
  svg.append(line);
  return svg;
}
