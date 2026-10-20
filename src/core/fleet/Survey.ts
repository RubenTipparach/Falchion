import type { GalaxyModel, StarSystem } from '../galaxy/GalaxyModel';
import { Hex, hexKey, hexRing } from '../hex/Hex';

/** How far (ly) a surveyor looks for its next system: half an hour at the base speed. */
export const SURVEY_REACH = 30;

/**
 * The next `count` systems a surveying fleet will visit from `from`: each the nearest system
 * (by hex distance, ties in ring order) to the previous stop that `isTarget` accepts and that is
 * not already on the route. Deterministic for a given galaxy, start and target test.
 */
export function planSurvey(galaxy: GalaxyModel, from: Hex, count: number, isTarget: (s: StarSystem) => boolean, reach = SURVEY_REACH): StarSystem[] {
  const route: StarSystem[] = [];
  const taken = new Set<string>([hexKey(from)]);
  let at = from;
  while (route.length < count) {
    const next = nearestTarget(galaxy, at, reach, (s) => !taken.has(hexKey(s.hex)) && isTarget(s));
    if (!next) break;
    route.push(next);
    taken.add(hexKey(next.hex));
    at = next.hex;
  }
  return route;
}

function nearestTarget(galaxy: GalaxyModel, h: Hex, reach: number, accept: (s: StarSystem) => boolean): StarSystem | null {
  for (let k = 1; k <= reach; k++) {
    for (const c of hexRing(h, k)) {
      const s = galaxy.starAt(c);
      if (s && accept(s)) return s;
    }
  }
  return null;
}
