import { HERALDRY } from '../content/heraldry';
import { SHIP_CLASSES } from '../content/shipClasses';
import type { Squadron } from '../core/combat/Combat';
import { cleanIdentity, cleanText } from '../core/empire/Identity';
import type { FleetOrders } from '../core/fleet/Presence';
import type { StarSystem } from '../core/galaxy/GalaxyModel';
import type { Planet } from '../core/galaxy/Planets';
import type { Hex } from '../core/hex/Hex';
import { normalizeDesign, type ShipDesign } from '../core/ships/ShipDesign';
import type { EmpireSim } from './EmpireSim';
import { DIPLOMATIC_ACTIONS, type DiplomaticAction } from '../core/diplomacy/Diplomacy';
import { EXCHANGE_RESOURCES } from '../content/commerce';
import { FOCI, type GovernorFocus } from '../content/governor';
import type { Resource } from '../content/resources';

/**
 * Every order a player can give, as a command the server applies to its copy of the empire.
 *
 * The client calls the same EmpireSim method locally (so the game answers at once) and sends
 * `{ name, args }`, with game objects as plain ids: a star as its "q,r" id, a planet as its
 * planet id. The server decodes the args against its own state (unknown ids and malformed
 * values are rejected), runs the method, and its result is the truth.
 */

/** How one argument travels: `encode` on the client, `decode` (validating) on the server. */
interface ArgCodec<T> {
  encode(value: T): unknown;
  /** The value, or throws `CommandError` when it is not acceptable. */
  decode(raw: unknown, sim: EmpireSim): T;
}

export class CommandError extends Error {}

const fail = (msg: string): never => { throw new CommandError(msg); };

const ID = /^[\w:,./+-]{1,80}$/;
const string = (max = 80): ArgCodec<string> => ({
  encode: (v) => v,
  decode: (raw) => (typeof raw === 'string' && raw.length <= max ? raw : fail('bad text')),
});
const id: ArgCodec<string> = { encode: (v) => v, decode: (raw) => (typeof raw === 'string' && ID.test(raw) ? raw : fail('bad id')) };
const bool: ArgCodec<boolean> = { encode: (v) => v, decode: (raw) => (typeof raw === 'boolean' ? raw : fail('bad flag')) };
const optional = <T>(c: ArgCodec<T>): ArgCodec<T | undefined> => ({
  encode: (v) => (v === undefined ? null : c.encode(v)),
  decode: (raw, sim) => (raw === null || raw === undefined ? undefined : c.decode(raw, sim)),
});
const nullable = <T>(c: ArgCodec<T>): ArgCodec<T | null> => ({
  encode: (v) => (v === null ? null : c.encode(v)),
  decode: (raw, sim) => (raw === null ? null : c.decode(raw, sim)),
});

const star: ArgCodec<StarSystem> = {
  encode: (s) => s.id,
  decode: (raw, sim) => (typeof raw === 'string' && ID.test(raw) ? sim.starById(raw) ?? fail('no such star') : fail('bad star')),
};
const planet: ArgCodec<Planet> = {
  encode: (p) => p.id,
  decode: (raw, sim) => (typeof raw === 'string' && ID.test(raw) ? sim.planetById(raw) ?? fail('no such planet') : fail('bad planet')),
};
const hex: ArgCodec<Hex> = {
  encode: (h) => ({ q: h.q, r: h.r }),
  decode: (raw) => {
    const h = raw as Hex | null;
    return h && Number.isInteger(h.q) && Number.isInteger(h.r) && Math.abs(h.q) < 1e6 && Math.abs(h.r) < 1e6 ? { q: h.q, r: h.r } : fail('bad hex');
  },
};
/** An asteroid field: `${starId}#n` (or a home belt's `${starId}#home-…`). */
const fieldId: ArgCodec<string> = { encode: (v) => v, decode: (raw) => (typeof raw === 'string' && /^[\w:,./+-]{1,80}#[\w-]{1,24}$/.test(raw) ? raw : fail('bad field')) };
/** Another player's fleet, as `${ownerId}:${fleetId}`. */
const fleetKey: ArgCodec<string> = { encode: (v) => v, decode: (raw) => (typeof raw === 'string' && /^[\w-]{1,40}:[\w:,./+-]{1,80}$/.test(raw) ? raw : fail('bad fleet')) };
const playerId: ArgCodec<string> = { encode: (v) => v, decode: (raw) => (typeof raw === 'string' && /^[\w-]{1,40}$/.test(raw) ? raw : fail('bad player')) };
const diplomaticAction: ArgCodec<DiplomaticAction> = { encode: (v) => v, decode: (raw) => ((DIPLOMATIC_ACTIONS as readonly unknown[]).includes(raw) ? (raw as DiplomaticAction) : fail('bad action')) };
const CLASS_IDS = new Set(SHIP_CLASSES.map((c) => c.id));
const squadrons: ArgCodec<Squadron[]> = {
  encode: (ships) => ships.map((s) => ({ classId: s.classId, count: s.count })),
  decode: (raw) => {
    if (!Array.isArray(raw) || raw.length > SHIP_CLASSES.length) return fail('bad ships');
    return raw.map((s) => (s && CLASS_IDS.has(s.classId) && Number.isInteger(s.count) && s.count >= 0 && s.count <= 10_000 ? { classId: s.classId, count: s.count } : fail('bad ships')));
  },
};
// A trade run is not sent: it is started with tradeRun, and setOrders keeps the one a fleet has.
const orders: ArgCodec<FleetOrders> = {
  encode: (o) => ({ autoExplore: !!o.autoExplore, autoReturn: !!o.autoReturn, autoMine: !!o.autoMine, ...(o.stance ? { stance: o.stance } : {}) }),
  decode: (raw) => {
    const o = raw as FleetOrders | null;
    if (!o || typeof o !== 'object') return fail('bad orders');
    return { autoExplore: o.autoExplore === true, autoReturn: o.autoReturn === true, autoMine: o.autoMine === true, ...(o.stance === 'aggressive' ? { stance: 'aggressive' as const } : {}) };
  },
};
/** A whole number from 0 to a million (amounts, shares, percents). */
const count: ArgCodec<number> = { encode: (v) => v, decode: (raw) => (Number.isInteger(raw) && (raw as number) >= 0 && (raw as number) <= 1e6 ? (raw as number) : fail('bad number')) };
const resource: ArgCodec<Resource> = { encode: (v) => v, decode: (raw) => ((EXCHANGE_RESOURCES as readonly unknown[]).includes(raw) ? (raw as Resource) : fail('bad resource')) };
/** An exchange: `npc:<faction>` or `player:<id>`. */
const exchange: ArgCodec<string> = { encode: (v) => v, decode: (raw) => (typeof raw === 'string' && /^(npc|player):[\w:,.-]{1,80}$/.test(raw) ? raw : fail('bad exchange')) };
/** A share: `own:<company>`, `player:<owner>:<company>` or `npc:<corporation>`. */
const share: ArgCodec<string> = { encode: (v) => v, decode: (raw) => (typeof raw === 'string' && /^(own|player|npc):[\w:#,.-]{1,120}$/.test(raw) ? raw : fail('bad share')) };
const focus: ArgCodec<GovernorFocus> = { encode: (v) => v, decode: (raw) => (typeof raw === 'string' && Object.hasOwn(FOCI, raw) ? (raw as GovernorFocus) : fail('bad focus')) };
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const design: ArgCodec<ShipDesign> = {
  encode: (d) => d,
  decode: (raw) => {
    const d = raw as ShipDesign | null;
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : fail('bad design'));
    const col = (v: unknown) => (typeof v === 'string' && HEX_COLOR.test(v) ? v : fail('bad design'));
    const ids = (v: unknown, max: number) => (Array.isArray(v) && v.length <= max && v.every((x) => typeof x === 'string' && ID.test(x)) ? (v as string[]) : fail('bad design'));
    if (!d || typeof d !== 'object' || !d.colors) return fail('bad design');
    return normalizeDesign({
      name: cleanText(d.name, 40) || 'Ship', style: id.decode(d.style, null as never), seed: num(d.seed),
      length: num(d.length), bulk: num(d.bulk), engines: num(d.engines), weapons: num(d.weapons),
      colors: { primary: col(d.colors.primary), secondary: col(d.colors.secondary), accent: col(d.colors.accent) },
      traits: ids(d.traits, 32), blend: ids(d.blend ?? [], 4),
      livery: d.livery === undefined ? undefined : typeof d.livery === 'string' && ID.test(d.livery) ? d.livery : fail('bad design'),
    });
  },
};
const identity = {
  encode: (v: unknown) => v,
  decode: (raw: unknown) => cleanIdentity(raw, HERALDRY) ?? fail('bad identity'),
};
const tenets: ArgCodec<string[]> = {
  encode: (v) => v,
  decode: (raw) => (Array.isArray(raw) && raw.length <= 8 && raw.every((x) => typeof x === 'string' && ID.test(x)) ? raw : fail('bad tenets')),
};

/** Command name → the codecs of its arguments, in order. Only these may be sent. */
export const COMMANDS = {
  setIdentity: [identity, bool],
  formFleet: [squadrons, star, optional(string(40))],
  moveFleet: [id, star, optional(bool)],
  moveFleetToHex: [id, hex, string(120), optional(bool)],
  setOrders: [id, orders],
  mineField: [id, fieldId],
  returnHome: [id],
  dockFleet: [id],
  explore: [planet, optional(bool)],
  exploreAll: [star],
  collectCrate: [id],
  collectResources: [star],
  collectPlanet: [planet],
  collectAllLoot: [],
  research: [id],
  setFocus: [nullable(id)],
  selectClass: [id],
  setDesign: [design],
  buildShip: [id, optional(id), optional(bool)],
  settle: [planet],
  embark: [id],
  buyResource: [exchange, resource, count],
  sellResource: [exchange, resource, count],
  setTariff: [count, nullable(playerId)],
  buyShares: [share, count],
  sellShares: [share, count],
  setGovernor: [focus, bool, bool, count],
  setColonistFloor: [nullable(count), nullable(id)],
  buildDepot: [star],
  build: [id, id],
  toggleTrait: [id],
  setGovernment: [id],
  togglePolicy: [id],
  loadGoods: [id],
  sellGoods: [id],
  tradeRun: [id, nullable(star)],
  sendTribute: [id],
  retreat: [id],
  chase: [id, nullable(fleetKey)],
  diplomacy: [playerId, diplomaticAction],
  foundFaith: [string(40), tenets],
  toggleMission: [string(60)],
  toggleSpy: [string(60)],
  engage: [id, squadrons, id],
} satisfies Record<string, ReadonlyArray<ArgCodec<never> | { encode(v: never): unknown; decode(raw: unknown, sim: EmpireSim): unknown }>>;

export type CommandName = keyof typeof COMMANDS;

export interface Command {
  readonly name: CommandName;
  readonly args: readonly unknown[];
}

export const isCommandName = (name: unknown): name is CommandName => typeof name === 'string' && Object.hasOwn(COMMANDS, name);

/** Encode a call for the wire. */
export function encodeCommand(name: CommandName, args: readonly unknown[]): Command {
  const codecs = COMMANDS[name] as ReadonlyArray<{ encode(v: unknown): unknown }>;
  return { name, args: codecs.map((c, i) => c.encode(args[i] as never)) };
}

/** Decode and validate a command's args against the empire it will run on. Throws CommandError. */
export function decodeArgs(command: unknown, sim: EmpireSim): { name: CommandName; args: unknown[] } {
  const c = command as Command | null;
  if (!c || !isCommandName(c.name)) return fail('unknown command');
  const codecs = COMMANDS[c.name] as ReadonlyArray<{ decode(raw: unknown, sim: EmpireSim): unknown }>;
  const raw = Array.isArray(c.args) ? c.args : [];
  if (raw.length > codecs.length) return fail('too many arguments');
  return { name: c.name, args: codecs.map((codec, i) => codec.decode(raw[i], sim)) };
}
