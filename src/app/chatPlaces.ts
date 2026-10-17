import type { ChatPlace } from '../core/chat/ChatText';
import type { GalaxyModel, StarSystem } from '../core/galaxy/GalaxyModel';
import type { Planet } from '../core/galaxy/Planets';
import type { Hex } from '../core/hex/Hex';
import type { GameState } from './GameState';

/**
 * Locations this player knows, for chat links: home, the selected star, colony stars and
 * planets, depots, explored stars and planets, fleet destinations, and other players' homes.
 */
export function knownPlaces(
  s: GameState,
  galaxy: Pick<GalaxyModel, 'starAt'>,
  planets: (star: StarSystem) => Planet[],
  otherHomes: ReadonlyArray<Hex | null>,
): ChatPlace[] {
  const stars = new Map<string, StarSystem>();
  const add = (st: StarSystem | null | undefined) => { if (st && !stars.has(st.id)) stars.set(st.id, st); };
  const byId = (id: string): StarSystem | null => {
    const known = stars.get(id);
    if (known) return known;
    const [q, r] = id.split(',').map(Number);
    return Number.isInteger(q) && Number.isInteger(r) ? galaxy.starAt({ q, r }) : null;
  };
  add(s.home);
  add(s.selected);
  const planetIds = new Set<string>([...Object.keys(s.explored), ...s.economy.colonies.map((c) => c.planetId).filter((x): x is string => !!x)]);
  for (const c of s.economy.colonies) if (c.starId) add(byId(c.starId));
  for (const id of s.depots) add(byId(id));
  for (const pid of planetIds) add(byId(pid.slice(0, pid.lastIndexOf('/'))));
  for (const f of s.fleets) {
    const dest = f.movement?.route?.[f.movement.route.length - 1];
    if (dest) add(galaxy.starAt(dest));
  }
  for (const h of otherHomes) if (h) add(galaxy.starAt(h));

  const out: ChatPlace[] = [...stars.values()].map((st) => ({ name: st.name, q: st.hex.q, r: st.hex.r }));
  for (const pid of planetIds) {
    const star = byId(pid.slice(0, pid.lastIndexOf('/')));
    const p = star ? planets(star).find((x) => x.id === pid) : undefined;
    if (star && p) out.push({ name: p.name, q: star.hex.q, r: star.hex.r });
  }
  return out;
}
