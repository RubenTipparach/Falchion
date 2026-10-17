import type { GameState } from '../../app/GameState';
import type { Store } from '../../app/Store';
import { RESOURCES } from '../../content/resources';
import { FACTIONS, GOVERNMENTS, POLICIES, TENETS } from '../../content/society';
import {
  bonusOf, EconomyTables, factionApproval, upkeepOf, hasGrant, maxPolicies, maxRoutes, maxSpies, routeValue, sciencePerTurn, stabilityOf, tradePctOf,
} from '../../core/economy/Economy';
import { Drawer } from '../Drawer';
import type { GameActions, GameQueries } from '../GameActions';
import { colonyView, locateButton } from '../widgets';
import { BIOMES } from '../../content/biomes';
import { clear, fmt, h } from '../dom';

type Tab = 'overview' | 'colonies' | 'trade' | 'politics' | 'religion' | 'intel';
const TABS: Array<[Tab, string]> = [['overview', 'Overview'], ['colonies', 'Colonies'], ['trade', 'Trade'], ['politics', 'Politics'], ['religion', 'Religion'], ['intel', 'Espionage']];

/** Exploitation: stockpile, trade routes, government and factions, faith, spy networks. */
export class EmpirePanel extends Drawer {
  private tab: Tab = 'overview';
  private readonly tabsEl = h('div', { class: 'seg' });
  private readonly content = h('div', { class: 'empire-content' });

  constructor(private readonly store: Store<GameState>, private readonly actions: GameActions, private readonly q: GameQueries, private readonly t: EconomyTables, private readonly empires: string[]) {
    super('empire', 'Empire', 'Colonies and their buildings, trade, politics, religion and espionage. Income arrives every year: one minute.', true);
    this.body.append(this.tabsEl, this.content);
    store.subscribe((s, prev) => { if (this.opened && (s.economy !== prev.economy || s.empire !== prev.empire || s.lastReport !== prev.lastReport || s.fleets !== prev.fleets || s.turn !== prev.turn || s.construction !== prev.construction)) this.render(); });
  }

  protected onOpen(): void {
    this.render();
  }

  private render(): void {
    this.tabsEl.replaceChildren(...TABS.map(([id, label]) => h('button', { class: `seg-btn ${this.tab === id ? 'active' : ''}`, onclick: () => { this.tab = id; this.render(); } }, label)));
    clear(this.content);
    const views: Record<Tab, () => HTMLElement[]> = {
      overview: () => this.overview(), colonies: () => this.colonies(), trade: () => this.trade(), politics: () => this.politics(), religion: () => this.religion(), intel: () => this.intel(),
    };
    this.content.append(...views[this.tab]());
  }

  private colonies(): HTMLElement[] {
    const s = this.store.state;
    return [
      h('p', { class: 'muted' }, 'Every colony is a planet with building slots (bigger worlds hold more). Farms feed your colonies, mines boost minerals, trade hubs earn credits, labs add science, temples faith, and shipyards build ships in that system. Settle new worlds with a Colony Ark on station.'),
      ...s.economy.colonies.map((c) => {
        const star = c.starId ? this.q.starById(c.starId) : null;
        return h('section', { class: 'card colony-card' },
          h('div', { class: 'row-between' },
            h('h4', {}, c.name, h('span', { class: 'muted small' }, ` · ${BIOMES.find((b) => b.id === c.biome)?.name ?? c.biome}${c.size ? ` · size ${c.size}` : ''}${star ? ` · ${star.name}` : ''}`)),
            star ? locateButton(`Zoom to ${c.name}`, () => {
              const planet = c.planetId ? this.q.planetById(c.planetId) : null;
              if (planet) this.actions.focusPlanet(star, planet); else this.actions.flyTo(star, true);
            }) : ''),
          c.planetId ? colonyView(c, s.empire.materials, (b) => this.actions.build(c.planetId!, b), this.t, this.q.jobs(c.planetId), s.turn) : h('p', { class: 'small muted' }, 'Captured world: no building slots yet.'));
      }),
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
        h('span', { class: 'swatch-dot', style: `background:${res.color}` }),
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
    const slots = maxRoutes(this.econ, this.t, s.empire.research);
    const freighters = s.economy.roster['bulk-freighter'] ?? 0;
    return [
      h('p', { class: 'muted' }, `Each route needs a Bulk Freighter and earns credits that fall off with distance. Routes: ${s.economy.routes.length} of ${slots} active (${freighters} freighter${freighters === 1 ? '' : 's'}, route limit ${2 + bonusOf(this.t.tree, s.empire.research, 'routes')}).`),
      h('table', { class: 'data' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Partner'), h('th', {}, 'Type'), h('th', { class: 'num' }, 'Distance'), h('th', { class: 'num' }, 'Credits / yr'), h('th', {}, ''))),
        h('tbody', {}, ...this.t.partners.map((p) => {
          const on = s.economy.routes.some((r) => r.partnerId === p.id);
          const idx = s.economy.routes.findIndex((r) => r.partnerId === p.id);
          const idle = on && idx >= slots;
          return h('tr', { class: on ? 'on' : '' },
            h('td', {}, p.name), h('td', { class: 'muted' }, p.kind),
            h('td', { class: 'num mono' }, `${fmt(p.distance)} ly`),
            h('td', { class: 'num mono' }, `${routeValue(p, pct)}`),
            h('td', {}, h('button', { class: `chip ${on ? 'active' : ''}`, onclick: () => this.actions.toggleRoute(p.id) }, idle ? 'Idle — need freighter' : on ? 'Cancel route' : 'Open route')));
        }))),
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
        h('div', { class: 'factions' }, ...[s.playerName, ...this.empires].map((e) => {
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
      h('div', { class: 'option-grid' }, ...Object.entries(this.t.alienTech).map(([empire, techs]) => {
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
