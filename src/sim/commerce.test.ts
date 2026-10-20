import { describe, expect, it } from 'vitest';
import { DEFAULT_LOOT_TABLES } from '../content/lootTables';
import { BUILDINGS, STORAGE } from '../content/buildings';
import { upkeepOf } from '../content/logistics';
import { SHARD_SOURCES } from '../content/shardSources';
import { SHIP_CLASSES } from '../content/shipClasses';
import { GOVERNMENTS, POLICIES, TENETS } from '../content/society';
import { ALIEN_TECH, TECH_NODES } from '../content/techTree';
import { BASE_PRICE, COMMERCE } from '../content/commerce';
import { EncounterResolver } from '../core/encounters/Encounters';
import { GalaxyModel } from '../core/galaxy/GalaxyModel';
import { TechTree } from '../core/research/TechTree';
import { shipValue } from '../core/economy/Companies';
import { contractPrice } from '../core/economy/Economy';
import { hexAt } from '../core/fleet/Fleet';
import { applyEffects, EMPTY_WORLD, type SharedWorld } from '../core/world/SharedWorld';
import type { GameState } from '../app/GameState';
import { SaveGame, upgradeSave, type SavedGame } from '../app/SaveGame';
import { Store } from '../app/Store';
import { createWorld } from '../app/World';
import { EmpireSim, snapshotLink, type SimDeps } from './EmpireSim';
import { newEmpireState } from './newEmpireState';

const galaxy = new GalaxyModel();
const tree = new TechTree(TECH_NODES, SHARD_SOURCES);
const world = createWorld(galaxy, '123456789012345678');
const T = 5_000;
const ARK = 'colony-ark';

function sim(patch: (s: GameState) => Partial<GameState> = () => ({}), shared: SharedWorld = EMPTY_WORLD, extra: Partial<SimDeps> = {}) {
  const base = newEmpireState({ galaxy, tree, world, playerName: 'Ruben', t0: T });
  const research = { ...base.empire.research, researched: [...base.empire.research.researched, 'u-logistics', 'u-colony-arks'] };
  const start: GameState = { ...base, empire: { ...base.empire, research, materials: { ...base.empire.materials, credits: 50_000, metals: 2000, gases: 500, crystals: 300 } } };
  const store = new Store<GameState>({ ...start, ...patch(start) });
  const economy = { tree, classes: SHIP_CLASSES, governments: GOVERNMENTS, policies: POLICIES, tenets: TENETS, alienTech: ALIEN_TECH, buildings: BUILDINGS, storage: STORAGE, upkeepOf };
  const link = snapshotLink(shared);
  const s = new EmpireSim({ store, galaxy, tree, encounters: new EncounterResolver(DEFAULT_LOOT_TABLES, tree), world, economy, playerId: 'me', npcs: 'local', shared: link, ...extra });
  return { sim: s, store, link };
}

/** Build a ship under charter and play the years until it is launched. */
function charterShip(s: EmpireSim, classId: string) {
  const yard = s.yards()[0];
  s.buildShip(classId, yard.planetId, true);
  const job = s.state.construction.find((j) => j.item === classId)!;
  expect(job.charter).toBe(true);
  s.advanceTo(job.doneTurn);
  return s.state.commerce!.companies.at(-1)!;
}

describe('chartered companies', () => {
  it('a chartered freighter founds a trading company that owns its own fleet; the state keeps 60 shares and gets 40% of the ship back', () => {
    const { sim: s } = sim();
    const roster = { ...s.state.economy.roster };
    const credits = s.state.empire.materials.credits;
    const cost = SHIP_CLASSES.find((c) => c.id === 'bulk-freighter')!.cost;
    const c = charterShip(s, 'bulk-freighter');
    expect(c.kind).toBe('trade');
    expect(c.held).toBe(60);
    const l = s.state.loadouts[c.fleetId];
    expect(l.company).toBe(c.id);
    expect(l.ships).toEqual([{ classId: 'bulk-freighter', count: 1 }]);
    // Not the state's ship: not in the roster, not in the dock.
    expect(s.state.economy.roster['bulk-freighter']).toBe(roster['bulk-freighter']);
    expect(s.docked().find((x) => x.classId === 'bulk-freighter')?.count ?? 0).toBe(roster['bulk-freighter']);
    expect(s.state.flows!.some((f) => f.what.includes(c.name) && f.r === 'credits' && f.n === Math.round(shipValue(cost) * 0.4))).toBe(true);
    expect(credits).toBeGreaterThan(0);
  });

  it('a ship built without charter goes to the dock as before', () => {
    const { sim: s } = sim();
    const before = s.state.economy.roster.prospector;
    s.buildShip('prospector', s.yards()[0].planetId);
    const job = s.state.construction.find((j) => j.item === 'prospector')!;
    expect(job.charter).toBeUndefined();
    s.advanceTo(job.doneTurn);
    expect(s.state.economy.roster.prospector).toBe(before + 1);
    expect(s.state.commerce?.companies ?? []).toHaveLength(0);
  });

  it('a company fleet takes no orders from the state', () => {
    const { sim: s } = sim();
    const c = charterShip(s, 'prospector');
    const route = s.state.fleets.find((f) => f.id === c.fleetId)!.movement;
    s.moveFleet(c.fleetId, s.state.home);
    expect(s.state.fleets.find((f) => f.id === c.fleetId)!.movement).toBe(route);
    expect(s.state.dispatches[0].text).toContain(`run by ${c.name}`);
  });

  it('a mining company mines on its own and the state pays it the contract price for its ore', () => {
    const { sim: s } = sim();
    const c = charterShip(s, 'prospector');
    // It mines its home belt (where it was launched) or heads for the nearest field.
    for (let i = 0; i < 30 && !(s.state.lastReport?.ledger ?? []).some((e) => e.label.startsWith('Ore contract')); i++) s.skipYear();
    const ledger = s.state.lastReport!.ledger!;
    const ore = ledger.find((e) => e.r === 'metals' && e.label.startsWith(`${c.name}:`))!;
    const paid = ledger.find((e) => e.r === 'credits' && e.label === `Ore contract: ${c.name}`)!;
    expect(ore.n).toBeGreaterThan(0);
    expect(paid.n).toBe(-Math.round(ore.n * contractPrice('metals')));
    // Next year the company's books are closed: tax and the state's dividends are income.
    const company = s.state.commerce!.companies.find((x) => x.id === c.id)!;
    expect(company.revenue).toBe(-paid.n);
    s.skipYear();
    const after = s.state.commerce!.companies.find((x) => x.id === c.id)!;
    expect(after.profits.at(-1)).toBe(-paid.n - upkeepOf(SHIP_CLASSES.find((x) => x.id === 'prospector')!));
    expect(s.state.lastReport!.ledger!.some((e) => e.label === `Tax: ${c.name}`)).toBe(true);
  });

  it('a trading company buys goods from the state and sells them on the best route it knows', () => {
    const { sim: s } = sim((st) => ({ empire: { ...st.empire, materials: { ...st.empire.materials, goods: 300 } } }));
    s.skipYear(); // meet the neighbours: their worlds are markets
    const c = charterShip(s, 'bulk-freighter');
    const credits = s.state.empire.materials.credits;
    for (let i = 0; i < 3; i++) s.skipYear();
    const l = s.state.loadouts[c.fleetId];
    expect(l.orders?.trade).toBeTruthy();
    expect(l.cargo).toBe(50);
    expect(s.state.flows!.some((f) => f.what === `Goods sold to ${c.name}` && f.r === 'credits' && f.n === 50 * (BASE_PRICE.goods ?? 4) * COMMERCE.goodsShare)).toBe(true);
    expect(s.state.empire.materials.credits).toBeGreaterThan(credits - 1000);
    // It sells at the far end: the sale is the company's, not the state's.
    for (let i = 0; i < 200 && !(s.state.commerce!.companies[0].revenue > 0 || s.state.commerce!.companies[0].profits.some((p) => p > 0)); i++) s.skipYear();
    const company = s.state.commerce!.companies[0];
    expect(company.revenue > 0 || company.profits.some((p) => p > 0)).toBe(true);
  });

  it('grows with a profitable record and money in the bank, and is wound up when it loses its fleet and cannot buy one', () => {
    const { sim: s, store } = sim();
    const c = charterShip(s, 'prospector');
    store.update((st) => ({ commerce: { ...st.commerce!, companies: st.commerce!.companies.map((x) => ({ ...x, treasury: 1000, revenue: 50, profits: [5, 5, 5], founded: st.turn - 20 })) } }));
    s.skipYear();
    expect(s.state.loadouts[c.fleetId].ships).toEqual([{ classId: 'prospector', count: 2 }]);
    expect(s.state.commerce!.companies[0].treasury).toBeLessThan(1000);
    // Its fleet is lost and it has nothing in the bank.
    store.update((st) => {
      const { [c.fleetId]: _gone, ...loadouts } = st.loadouts;
      return { loadouts, fleets: st.fleets.filter((f) => f.id !== c.fleetId), commerce: { ...st.commerce!, companies: st.commerce!.companies.map((x) => ({ ...x, treasury: 0 })) } };
    });
    s.skipYear();
    expect(s.state.commerce!.companies).toHaveLength(0);
    expect(s.state.dispatches.some((d) => d.text.includes(`${c.name} has lost its fleet`))).toBe(true);
  });

  it('pays the dividends of shares other players hold through the shared world', () => {
    const { sim: s, store, link } = sim();
    const c = charterShip(s, 'prospector');
    store.update((st) => ({ commerce: { ...st.commerce!, companies: st.commerce!.companies.map((x) => ({ ...x, revenue: 200 })) } }));
    link.emit([{ kind: 'stake', company: `me:${c.id}`, player: 'bea', delta: 10 }]);
    s.skipYear();
    const perShare = s.state.commerce!.companies[0].dividend;
    expect(perShare).toBeGreaterThan(0);
    expect(link.world().payouts?.bea?.[`Dividends: ${c.name} (Ruben)`]).toBeCloseTo(perShare * 10);
  });
});

describe('exchanges', () => {
  it('only the exchanges of empires you have met; selling and buying move credits, stock and your pressure there', () => {
    const { sim: s } = sim();
    expect(s.exchanges()).toHaveLength(0);
    s.sellResource('npc:nobody', 'metals', 100);
    expect(s.state.dispatches[0].text).toContain('empires you have met');
    s.skipYear();
    const ex = s.exchanges()[0];
    expect(ex.kind).toBe('npc');
    const before = s.state.empire.materials;
    const quote = s.exchangeQuote(ex.id, 'metals', 'sell', 100);
    s.sellResource(ex.id, 'metals', 100);
    expect(s.state.empire.materials.metals).toBe(before.metals - 100);
    expect(s.state.empire.materials.credits).toBe(before.credits + quote);
    expect(s.state.commerce!.pressure![ex.id].metals!).toBeLessThan(0);
    const buy = s.exchangeQuote(ex.id, 'crystals', 'buy', 50);
    s.buyResource(ex.id, 'crystals', 50);
    expect(s.state.empire.materials.crystals).toBe(before.crystals + 50);
    expect(s.state.empire.materials.credits).toBe(before.credits + quote - buy);
    // Buying costs more than selling pays.
    expect(s.exchangePrice(ex.id, 'gases', 'buy')).toBeGreaterThan(s.exchangePrice(ex.id, 'gases', 'sell'));
    expect(s.state.flows![0].what).toContain(`on the ${ex.name} exchange`);
  });

  it('shows freighters against the exchange for trade goods', () => {
    const { sim: s } = sim();
    s.skipYear();
    const q = s.shippingQuote(s.exchanges()[0].id)!;
    expect(q.exchange).toBeGreaterThan(0);
    expect(q.freighter).toBeGreaterThan(q.exchange);
    expect(q.years).toBeGreaterThan(0);
  });

  it('a player\'s exchange charges their published tariff, which is paid to them', () => {
    const others = () => [{ id: 'bea', name: 'Iron Dominion', home: { q: world.home.hex.q + 3, r: world.home.hex.r }, colonies: [], commerce: { tariff: 25, tariffs: { me: 40 }, companies: [] } }];
    const met = applyEffects(EMPTY_WORLD, [{ kind: 'contact', a: 'me', b: 'bea', at: 1 }]);
    const { sim: s, link } = sim(() => ({}), met, { otherEmpires: others });
    const ex = s.exchanges().find((x) => x.kind === 'player')!;
    expect(ex.tariff).toBe(40);
    s.sellResource(ex.id, 'metals', 200);
    expect(link.world().payouts?.bea?.['Tariffs from Ruben']).toBeGreaterThan(0);
  });

  it('tariffs: one for everyone, and one per player', () => {
    const { sim: s } = sim();
    s.setTariff(30, null);
    s.setTariff(5, 'bea');
    expect(s.publicCommerce()).toMatchObject({ tariff: 30, tariffs: { bea: 5 } });
    s.setTariff(30, 'bea');
    expect(s.state.commerce!.tariffs).toEqual({});
    s.setTariff(80, null);
    expect(s.state.commerce!.tariff).toBe(50);
  });

  it('collects what other empires owe it as income, and claims exactly that', () => {
    const owed = applyEffects(EMPTY_WORLD, [{ kind: 'payout', to: 'me', label: 'Tariffs from Bea', credits: 40.5 }]);
    const { sim: s, link } = sim(() => ({}), owed);
    s.skipYear();
    expect(s.state.lastReport!.ledger!.find((e) => e.label === 'Tariffs from Bea')?.n).toBe(40);
    expect(link.world().payouts?.me).toEqual({ 'Tariffs from Bea': 0.5 });
  });
});

describe('the stock market', () => {
  it('buys your own companies\' float and NPC corporations, and NPC corporations pay dividends', () => {
    const { sim: s } = sim();
    const c = charterShip(s, 'prospector');
    const own = s.stocks().find((x) => x.key === `own:${c.id}`)!;
    expect(own.float).toBe(40);
    const credits = s.state.empire.materials.credits;
    s.buyShares(own.key, 100);
    expect(s.state.commerce!.companies[0].held).toBe(100);
    expect(s.state.empire.materials.credits).toBe(credits - Math.ceil(own.price * 40 * 1.02));
    const corp = s.stocks().find((x) => x.kind === 'npc')!;
    s.buyShares(corp.key, 800);
    expect(s.state.commerce!.portfolio![corp.key]).toBe(800);
    s.skipYear();
    expect(s.state.lastReport!.ledger!.find((e) => e.label === `Dividends: ${corp.name}`)?.n).toBe(Math.round(corp.dividend * 800));
    s.sellShares(corp.key, 800);
    expect(s.state.commerce!.portfolio![corp.key]).toBeUndefined();
  });

  it('buying another player\'s company records the stake in the shared world', () => {
    const others = () => [{ id: 'bea', name: 'Iron Dominion', home: null, colonies: [], commerce: { tariff: 10, companies: [{ id: 'co-1', name: 'Bea Freight Line', kind: 'trade' as const, shares: 100, held: 60, price: 3, dividend: 0.2, ships: 2 }] } }];
    const met = applyEffects(EMPTY_WORLD, [{ kind: 'contact', a: 'me', b: 'bea', at: 1 }]);
    const { sim: s, link } = sim(() => ({}), met, { otherEmpires: others });
    const stock = s.stocks().find((x) => x.kind === 'player')!;
    expect(stock.float).toBe(40);
    s.buyShares(stock.key, 10);
    expect(s.state.commerce!.portfolio![stock.key]).toBe(10);
    expect(link.world().stakes).toEqual({ 'bea:co-1': { me: 10 } });
    expect(s.stocks().find((x) => x.key === stock.key)!.float).toBe(30);
  });
});

describe('reusable colony arks', () => {
  it('leave the dock with colonists from the capital, settle without being used up, and reload at a populated colony', () => {
    const { sim: s, store } = sim();
    const capital = () => s.state.economy.colonies.find((c) => c.capital)!;
    const pop = capital().pop!;
    // Survey a free planet of the home system to settle.
    const target = s.planets(s.state.home).find((p) => !s.colonyAt(p.id) && p.biome !== 'gas' && p.biome !== 'magma')!;
    store.update((st) => ({ explored: { ...st.explored, [target.id]: { kind: 'empty' } as never } }));
    s.formFleet([{ classId: ARK, count: 1 }], s.state.home, 'Ark');
    const fleet = s.state.fleets.at(-1)!;
    expect(s.state.loadouts[fleet.id].colonists).toBe(1);
    expect(capital().pop).toBe(pop - 1);
    s.skipYear();
    s.settle(target);
    expect(s.colonyAt(target.id)).toBeTruthy();
    const l = s.state.loadouts[fleet.id];
    expect(l.ships).toEqual([{ classId: ARK, count: 1 }]);
    expect(l.colonists).toBe(0);
    // Embark at home: the capital (population 2 or more) gives one.
    store.update((st) => ({ economy: { ...st.economy, colonies: st.economy.colonies.map((c) => (c.capital ? { ...c, pop: 3 } : c)) } }));
    expect(s.embark(fleet.id)).toBe(1);
    expect(capital().pop).toBe(2);
    expect(s.state.loadouts[fleet.id].colonists).toBe(1);
  });

  it('an empty ark cannot settle', () => {
    const { sim: s, store } = sim();
    const target = s.planets(s.state.home).find((p) => !s.colonyAt(p.id) && p.biome !== 'gas' && p.biome !== 'magma')!;
    store.update((st) => ({ explored: { ...st.explored, [target.id]: { kind: 'empty' } as never }, economy: { ...st.economy, colonies: st.economy.colonies.map((c) => (c.capital ? { ...c, pop: 1 } : c)) } }));
    s.formFleet([{ classId: ARK, count: 1 }], s.state.home, 'Ark');
    const fleet = s.state.fleets.at(-1)!;
    expect(s.state.loadouts[fleet.id].colonists).toBe(0);
    s.skipYear();
    s.settle(target);
    expect(s.colonyAt(target.id)).toBeUndefined();
    expect(s.state.dispatches[0].text).toContain('no colonists');
  });

  it('a colony company settles the best surveyed world in reach and is paid the fee', () => {
    const { sim: s, store } = sim();
    const target = s.planets(s.state.home).find((p) => !s.colonyAt(p.id) && p.biome !== 'gas' && p.biome !== 'magma')!;
    store.update((st) => ({ explored: { ...st.explored, [target.id]: { kind: 'empty' } as never } }));
    const pop = s.state.economy.colonies.find((x) => x.capital)!.pop!;
    // Its first colonists come from the yard's world (the capital).
    const c = charterShip(s, ARK);
    expect(s.state.economy.colonies.find((x) => x.capital)!.pop).toBe(pop - 1);
    for (let i = 0; i < 5 && !s.colonyAt(target.id); i++) s.skipYear();
    expect(s.colonyAt(target.id)).toBeTruthy();
    expect(s.state.flows!.some((f) => f.what === `Settlement fee: ${c.name}` && f.n === -COMMERCE.settleFee)).toBe(true);
    expect(s.state.loadouts[c.fleetId].ships).toEqual([{ classId: ARK, count: 1 }]);
    expect(s.state.loadouts[c.fleetId].colonists).toBe(0);
    expect(s.state.dispatches.some((d) => d.text.includes(`settled by ${c.name}`))).toBe(true);
  });

  it('saves from before give arks out in fleets their colonists', () => {
    const { store } = sim();
    const save = new SaveGame(galaxy.params.seed, null).snapshot(store.state) as unknown as SavedGame;
    const old = { ...save, loadouts: { ...save.loadouts, 'ark-1': { ships: [{ classId: ARK, count: 2 }], supply: 12 } } } as SavedGame;
    const up = upgradeSave(old);
    expect(up.loadouts['ark-1'].colonists).toBe(2);
    expect(upgradeSave(up)).toBe(up);
  });
});

describe('a company fleet in the public view', () => {
  it('is priced from its fleet and published with the tariffs', () => {
    const { sim: s } = sim();
    const c = charterShip(s, 'prospector');
    const pub = s.publicCommerce();
    expect(pub.companies).toEqual([{ id: c.id, name: c.name, kind: 'mining', shares: 100, held: 60, price: s.sharePriceOf(c), dividend: 0, ships: 1 }]);
    expect(hexAt(s.state.fleets.find((f) => f.id === c.fleetId)!.movement, s.state.turn)).toBeTruthy();
  });
});

describe('the empire governor (change empire-governor)', () => {
  it('builds the focus\'s best building on every colony with a free slot, keeping the reserve', () => {
    const { sim: s } = sim();
    s.setGovernor('industry', true, false, 300);
    s.skipYear();
    const queued = s.state.construction.filter((j) => j.kind === 'building');
    const free = s.state.economy.colonies.filter((c) => (c.buildings ?? []).length < (c.size ?? 3) + 1 + (c.capital ? 2 : 0));
    expect(queued.length).toBe(free.length);
    expect(s.state.dispatches.some((d) => d.text.startsWith('Governor:'))).toBe(true);
    // One at a time per colony: nothing new while those are under construction.
    s.skipYear();
    expect(s.state.construction.filter((j) => j.kind === 'building').length).toBeLessThanOrEqual(queued.length);
  });

  it('starts nothing that would leave less than the reserve', () => {
    const { sim: s } = sim((st) => ({ empire: { ...st.empire, materials: { ...st.empire.materials, credits: 150 } } }));
    s.setGovernor('wealth', true, false, 100);
    s.skipYear();
    expect(s.state.construction.filter((j) => j.kind === 'building')).toHaveLength(0);
  });

  it('picks research when none is set, and does nothing when switched off', () => {
    const { sim: s, store } = sim();
    store.update((st) => ({ economy: { ...st.economy, focus: null } }));
    s.setGovernor('science', false, false, 300);
    s.skipYear();
    expect(s.state.economy.focus).toBeNull();
    s.setGovernor('science', false, true, 300);
    s.skipYear();
    expect(s.state.economy.focus).toBeTruthy();
  });
});

describe('colonist floors', () => {
  it('an ark takes colonists only from a world at or above its floor: the empire\'s, or the colony\'s own', () => {
    const { sim: s, store } = sim((st) => ({ economy: { ...st.economy, colonies: st.economy.colonies.map((c) => (c.capital ? { ...c, pop: 3 } : c)) } }));
    const capital = () => s.state.economy.colonies.find((c) => c.capital)!;
    s.setColonistFloor(4, null);
    s.formFleet([{ classId: ARK, count: 1 }], s.state.home, 'Ark');
    const fleet = s.state.fleets.at(-1)!;
    expect(s.state.loadouts[fleet.id].colonists).toBe(0);
    expect(capital().pop).toBe(3);
    expect(s.embark(fleet.id)).toBe(0);
    // This colony's own floor overrides the empire's.
    s.setColonistFloor(3, capital().planetId!);
    expect(s.colonistFloor(capital())).toBe(3);
    expect(s.embark(fleet.id)).toBe(1);
    expect(capital().pop).toBe(2);
    // Back to the empire's.
    s.setColonistFloor(null, capital().planetId!);
    expect(capital().colonistFloor).toBeUndefined();
    expect(s.colonistFloor(capital())).toBe(4);
    // Never below 2.
    s.setColonistFloor(1, null);
    expect(store.state.commerce!.colonistFloor).toBe(2);
  });
});
