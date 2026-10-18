import type { GameState } from '../../app/GameState';
import { flagEl } from '../../render/flag';
import type { Store } from '../../app/Store';
import { RESOURCES } from '../../content/resources';
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
import { icon } from '../icons';
import { BIOMES } from '../../content/biomes';
import { slotsOf } from '../../content/buildings';
import type { Planet } from '../../core/galaxy/Planets';
import { clear, fmt, h } from '../dom';
import { thumb } from '../thumbs';

type Tab = 'overview' | 'colonies' | 'trade' | 'relations' | 'politics' | 'religion' | 'intel';
const TABS: Array<[Tab, string]> = [['overview', 'Overview'], ['colonies', 'Colonies'], ['trade', 'Trade'], ['relations', 'Relations'], ['politics', 'Politics'], ['religion', 'Religion'], ['intel', 'Espionage']];

/** Exploitation: stockpile, trade goods, government and factions, faith, spy networks. */
export class EmpirePanel extends Drawer {
  private tab: Tab = 'overview';
  private readonly tabsEl = h('div', { class: 'seg' });
  private readonly content = h('div', { class: 'empire-content' });
  /** Flag, name and ruler, with Edit to reopen the founding screen. */
  private readonly banner = h('div', { class: 'empire-banner' });

  constructor(private readonly store: Store<GameState>, private readonly actions: GameActions, private readonly q: GameQueries, private readonly t: EconomyTables, private readonly thumb: (p: Planet) => string) {
    super('empire', 'Empire', 'Colonies, trade, politics, religion and espionage. Income arrives every year: one minute.');
    this.body.append(this.banner, this.tabsEl, this.content);
    store.subscribe((s, prev) => { if (this.opened && (s.identity !== prev.identity || s.economy !== prev.economy || s.empire !== prev.empire || s.lastReport !== prev.lastReport || s.fleets !== prev.fleets || s.turn !== prev.turn || s.construction !== prev.construction)) this.render(); });
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
      overview: () => this.overview(), colonies: () => this.colonies(), trade: () => this.trade(), relations: () => this.relations(), politics: () => this.politics(), religion: () => this.religion(), intel: () => this.intel(),
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
    return [
      h('p', { class: 'small muted' }, 'Click a colony to open it and manage its buildings.'),
      h('div', { class: 'colony-list' }, ...s.economy.colonies.map((c) => {
        const y = colonyYield(c, this.t);
        const out = Object.entries(y.income).filter(([, n]) => n).map(([r, n]) => `${n! > 0 ? '+' : ''}${n} ${RESOURCES.find((x) => x.id === r)?.short ?? r}`);
        if (y.science) out.push(`+${y.science} SCI`);
        const built = (c.buildings ?? []).length;
        const queued = c.planetId ? this.q.jobs(c.planetId).length : 0;
        const slots = c.planetId ? slotsOf(c.size ?? 3, c.capital) : 0;
        const planet = c.planetId ? this.q.planetById(c.planetId) : null;
        return h('button', { class: 'colony-row', title: `Open ${c.name}`, onclick: () => open(c) },
          planet ? h('img', { class: 'planet-thumb cr-thumb', src: this.thumb(planet), alt: `${c.name}, ${c.biome}` }) : h('span', { class: 'cr-thumb' }),
          h('span', { class: 'cr-name' }, h('b', {}, c.name), h('small', { class: 'muted' }, `${BIOMES.find((b) => b.id === c.biome)?.name ?? c.biome}${c.size ? ` · size ${c.size}` : ''}`)),
          h('span', { class: 'cr-out small' }, out.join('  ') || '—'),
          h('span', { class: 'cr-slots mono small', title: 'Buildings / slots' }, slots ? `${built}/${slots}` : '—', queued ? h('span', { class: 'tag' }, `+${queued} building`) : ''),
          icon('locate'));
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
    ];
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
    const fleets = groups.filter((g) => g.id !== 'dock');
    return [
      h('p', { class: 'muted' }, `Colonies make trade goods (${fmt(s.empire.materials.goods)} in store, +${made} a year; Manufactories make more). Bulk Freighters carry ${perHold} each to another world and sell them: the farther from where they were loaded, the better the price, and foreign markets pay more than your own colonies.${pct ? ` Your traders get +${pct}%.` : ''}`),
      h('section', { class: 'card' }, h('h4', {}, 'Freighters'),
        groups.length ? h('ul', { class: 'plain' },
          dock && docked ? h('li', {}, h('b', {}, `${docked} in the dock`), h('span', { class: 'muted' }, ' · pick a market below to start a trade run')) : null,
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
