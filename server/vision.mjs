// What each player can see while the server hides systems (change admin-snapshots-and-fog). The
// rules are src/core/visibility/Vision.ts, bundled into the simulation: a player sees the systems
// they have explored or sighted, and those their allies have. With the hide-systems flag on, what
// the server sends a player (other players' public views, the shared world) leaves out what is
// outside that; the server's own rules always read everything. Each player's visible set is cached
// and recomputed at most every `ttlMs` (and after every world year).

/**
 * @param {{
 *   store: { load(id: string): Promise<any> },
 *   loadSim: () => Promise<any>,
 *   world?: { get(): Promise<any> } | null,
 *   hidden: () => boolean,
 *   worldTick: () => number,
 *   now?: () => number,
 *   ttlMs?: number,
 * }} deps
 */
export function createVision({ store, loadSim, world = null, hidden, worldTick, now = () => Date.now(), ttlMs = 30_000 }) {
  /** Each empire's own vision, keyed by the save it was read from. */
  const own = new Map(); // id -> { key, vision }
  /** Each player's visible stars (own and allies'), with when it was worked out. */
  const visible = new Map(); // id -> { at, stars: Set<string> }
  let sim = null;

  async function simulation() {
    sim ??= await loadSim();
    return sim;
  }

  /** An empire's own vision ({ explored, sighted }), from its stored save. */
  async function visionOf(id) {
    const s = await simulation();
    const record = await store.load(id);
    if (!s?.visionOfSave || !record?.save) return { explored: [], sighted: [] };
    const key = `${record.save.turn}:${record.updatedAt ?? 0}:${record.simulatedAt ?? 0}`;
    const hit = own.get(id);
    if (hit?.key === key) return hit.vision;
    const vision = s.visionOfSave(record.save);
    own.set(id, { key, vision });
    return vision;
  }

  /** The players allied with `id` (they share vision). */
  async function alliesOf(id) {
    const s = await simulation();
    const w = world ? await world.get() : null;
    return s?.alliesOf ? s.alliesOf(w?.relations, id) : [];
  }

  /** Every star a player sees: their own vision and their allies'. */
  async function starsFor(id) {
    const hit = visible.get(id);
    if (hit && now() - hit.at < ttlMs) return hit.stars;
    const visions = [await visionOf(id)];
    for (const ally of await alliesOf(id)) visions.push(await visionOf(ally));
    const stars = new Set();
    for (const v of visions) for (const list of [v.explored, v.sighted]) for (const star of list) stars.add(star);
    visible.set(id, { at: now(), stars });
    return stars;
  }

  /** A player's visible stars as last worked out (for live pushes, which cannot wait); empty when not yet known. */
  const cachedStars = (id) => visible.get(id)?.stars ?? new Set();

  return {
    starsFor,
    /** What allies share with a player: their explored and sighted systems together (GET /api/vision). */
    async sharedFor(id) {
      const explored = new Set(), sighted = new Set();
      for (const ally of await alliesOf(id)) {
        const v = await visionOf(ally);
        for (const star of v.explored) explored.add(star);
        for (const star of v.sighted) sighted.add(star);
      }
      for (const star of explored) sighted.delete(star);
      return { allies: await alliesOf(id), explored: [...explored].sort(), sighted: [...sighted].sort() };
    },
    /** Work out these players' visible stars now (after a world year), so live pushes have them. */
    async refresh(ids) {
      visible.clear();
      for (const id of ids) {
        try {
          await starsFor(id);
        } catch {
          // A broken save sees nothing; the rest go on.
        }
      }
    },
    /** Forget every cached vision (a reset, or the flag turned on). */
    invalidate() {
      own.clear();
      visible.clear();
    },
    /** The players list as `viewer` may see it: unchanged unless systems are hidden. */
    async players(viewer, list) {
      if (!hidden()) return list;
      const s = await simulation();
      // Without the bundled rules the server cannot tell what anyone sees: send no other empire's places.
      if (!s?.filterPublicView) return list.map((p) => ({ ...p, home: null, colonies: [], fleets: [] }));
      const stars = await starsFor(viewer);
      const tick = worldTick();
      return list.map((p) => s.filterPublicView(p, stars, tick));
    },
    /** One player's public view as `viewer` may see it now (a live push; null: send nothing). */
    player(viewer, view) {
      if (!hidden()) return view;
      // Never unfiltered while hidden: without the rules loaded yet, nothing is sent (the next poll brings it).
      if (!sim?.filterPublicView) { void simulation(); return null; }
      return sim.filterPublicView(view, cachedStars(viewer), worldTick());
    },
    /** The shared world as `viewer` (a player id, or null for a guest) may see it: unchanged unless systems are hidden. */
    async world(viewer, w) {
      if (!hidden()) return w;
      const s = await simulation();
      if (!w) return w;
      if (!s?.filterWorld) return { ...w, npcs: {} };
      return s.filterWorld(w, viewer ?? '', viewer ? await starsFor(viewer) : new Set(), worldTick());
    },
    /** The shared world for a live push to `viewer` (null: send nothing). */
    worldNow(viewer, w) {
      if (!hidden() || !w) return w;
      if (!sim?.filterWorld) { void simulation(); return null; }
      return sim.filterWorld(w, viewer, cachedStars(viewer), worldTick());
    },
  };
}
