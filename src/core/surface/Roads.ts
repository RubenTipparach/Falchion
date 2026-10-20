import { hash01, hashSeed } from '../rng/Rng';
import { BASE_OCTAVES, SurfaceLook, Vec3, cross, distance, dot, isLand, normalize, rawHeight } from './Terrain';

/**
 * The road network between a colony's settlements (the surface view). Pure and deterministic: the
 * same look, settlements and seed always give the same roads.
 *
 * Trunk roads are a minimum spanning tree over the settlements (Kruskal, costed by distance and
 * the water in the way); a few extra links then shorten the longest detours. Each road is routed
 * over the terrain by an A* search on a small grid between its ends: it climbs as little as it
 * can, keeps to land and bridges short straits only. Settlements across open ocean are not joined.
 */

export interface Road {
  /** Indices into the settlements. */
  readonly from: number;
  readonly to: number;
  /** Ground points (unit directions), from the edge of `from` to the edge of `to`, about ROAD_STEP apart. */
  readonly path: readonly Vec3[];
  /** Per point: over water (on a bridge). */
  readonly bridge: readonly boolean[];
  /** A trunk road (the spanning tree), or an extra link. */
  readonly trunk: boolean;
}

/** What the network needs of a settlement. */
export interface RoadSite {
  readonly dir: Vec3;
  readonly radius: number;
}

/** Spacing of a road's points (planet radii). */
export const ROAD_STEP = 0.004;
/** Longest run of water a road may bridge (planet radii, about 250 km on a mid-sized world). */
export const MAX_BRIDGE = 0.045;
/** Settlements further apart than this are never joined directly. */
const MAX_LINK = 0.75;
/** Octaves of terrain the router looks at (the coarse shape is what matters). */
const ROUTE_OCTAVES = 4;
/** Cost of a step over water, per unit length, against 1 on flat land. */
const WATER_COST = 7;
/** Heuristic weight of the A* search (1: exact shortest, more: faster and a little greedier). */
const GREED = 1.6;
/** Failed road attempts allowed between two groups of settlements (or for extra links, per link wanted). */
const MAX_TRIES = 2;

interface Edge { readonly a: number; readonly b: number; readonly chord: number; readonly est: number }

export function roadNetwork(look: SurfaceLook, sites: readonly RoadSite[], seed: number): Road[] {
  const n = sites.length;
  if (n < 2) return [];
  const water = (d: Vec3) => !isLand(look, rawHeight(look, d[0], d[1], d[2], ROUTE_OCTAVES));
  // Candidate links, cheapest first: distance, weighted by the water on the straight line.
  const edges: Edge[] = [];
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
    const chord = distance(sites[a].dir, sites[b].dir);
    if (chord > MAX_LINK) continue;
    let wet = 0;
    for (let k = 1; k < 12; k++) if (water(lerpDir(sites[a].dir, sites[b].dir, k / 12))) wet++;
    edges.push({ a, b, chord, est: chord * (1 + (wet / 11) * 4) });
  }
  edges.sort((x, y) => x.est - y.est || x.a - y.a || x.b - y.b);

  const roads: Road[] = [];
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const adj: Array<Array<{ to: number; len: number }>> = Array.from({ length: n }, () => []);
  const tried = new Set<string>();
  const build = (e: Edge, trunk: boolean): boolean => {
    tried.add(`${e.a}:${e.b}`);
    const route = routeBetween(look, sites[e.a], sites[e.b], hashSeed(seed, e.a, e.b));
    if (!route) return false;
    roads.push({ from: e.a, to: e.b, path: route.path, bridge: route.bridge, trunk });
    adj[e.a].push({ to: e.b, len: route.length });
    adj[e.b].push({ to: e.a, len: route.length });
    return true;
  };

  // Trunk roads: Kruskal over the candidates; a link that cannot be built (open ocean) is skipped.
  // Two groups of settlements get a few tries to meet, not one per pair across the sea.
  const failed = new Map<string, number>();
  for (const e of edges) {
    const ra = find(e.a), rb = find(e.b);
    if (ra === rb) continue;
    const pair = ra < rb ? `${ra}:${rb}` : `${rb}:${ra}`;
    if ((failed.get(pair) ?? 0) >= MAX_TRIES) continue;
    if (build(e, true)) parent[ra] = rb;
    else failed.set(pair, (failed.get(pair) ?? 0) + 1);
  }

  // Extra links: the shortest pairs whose road trip is far longer than the way as the crow flies.
  const extras = Math.max(1, Math.round(n / 5));
  let added = 0, attempts = 0;
  const byChord = [...edges].sort((x, y) => x.chord - y.chord || x.a - y.a || x.b - y.b);
  for (const e of byChord) {
    if (added >= extras || attempts >= extras * MAX_TRIES) break;
    if (tried.has(`${e.a}:${e.b}`)) continue;
    const trip = treeDistance(adj, e.a, e.b);
    if (trip < e.chord * 2) continue;
    attempts++;
    if (build(e, false)) added++;
  }
  return roads;
}

/** Road length along the network from a to b (Infinity when not connected). */
export function treeDistance(adj: ReadonlyArray<ReadonlyArray<{ to: number; len: number }>>, a: number, b: number): number {
  // Dijkstra on a tiny graph (a couple of dozen nodes): a linear scan is plenty.
  const dist = adj.map(() => Infinity);
  const done = adj.map(() => false);
  dist[a] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < dist.length; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0) return Infinity;
    if (u === b) return dist[u];
    done[u] = true;
    for (const { to, len } of adj[u]) if (dist[u] + len < dist[to]) dist[to] = dist[u] + len;
  }
}

/**
 * Route one road with A* on a grid laid over the ground between two settlements (a gnomonic
 * projection round their midpoint). Null when it would have to bridge more than MAX_BRIDGE.
 */
function routeBetween(look: SurfaceLook, A: RoadSite, B: RoadSite, seed: number): { path: Vec3[]; bridge: boolean[]; length: number } | null {
  const m = normalize([A.dir[0] + B.dir[0], A.dir[1] + B.dir[1], A.dir[2] + B.dir[2]]);
  const proj = (d: Vec3): [number, number] => {
    const k = 1 / dot(d, m);
    const q: Vec3 = [d[0] * k - m[0], d[1] * k - m[1], d[2] * k - m[2]];
    return [dot(q, t1), dot(q, t2)];
  };
  const toB: Vec3 = [B.dir[0] - A.dir[0], B.dir[1] - A.dir[1], B.dir[2] - A.dir[2]];
  const t1 = normalize([toB[0] - m[0] * dot(toB, m), toB[1] - m[1] * dot(toB, m), toB[2] - m[2] * dot(toB, m)]);
  const t2 = cross(m, t1);
  const [ax] = proj(A.dir), [bx] = proj(B.dir);
  const L = bx - ax;
  const k = Math.max(8, Math.ceil(L / Math.min(Math.max(L / 24, 0.005), 0.016)));
  const s = L / k;
  const mx = Math.ceil(Math.max(0.25 * L, 0.03) / s), my = Math.ceil(Math.max(0.35 * L, 0.03) / s);
  const nx = k + 2 * mx + 1, ny = 2 * my + 1;
  const x0 = ax - mx * s, y0 = -my * s;
  const dirAt = (i: number, j: number): Vec3 => {
    const x = x0 + i * s, y = y0 + j * s;
    return normalize([m[0] + t1[0] * x + t2[0] * y, m[1] + t1[1] * x + t2[1] * y, m[2] + t1[2] * x + t2[2] * y]);
  };
  // Heights are sampled lazily: A* only looks at a band round the straight line.
  const H = new Float64Array(nx * ny).fill(NaN);
  const height = (c: number): number => {
    if (Number.isNaN(H[c])) {
      const d = dirAt(c % nx, Math.floor(c / nx));
      H[c] = rawHeight(look, d[0], d[1], d[2], ROUTE_OCTAVES);
    }
    return H[c];
  };
  const wet = (c: number) => !isLand(look, height(c));
  const start = my * nx + mx, goal = my * nx + mx + k;
  const g = new Float64Array(nx * ny).fill(Infinity);
  const from = new Int32Array(nx * ny).fill(-1);
  const closed = new Uint8Array(nx * ny);
  const heap = new MinHeap();
  const gx = goal % nx, gy = Math.floor(goal / nx);
  // Weighted A* (an inflated heuristic): a slightly longer road for far fewer cells looked at.
  const hEst = (c: number) => Math.hypot((c % nx) - gx, Math.floor(c / nx) - gy) * s * GREED;
  g[start] = 0;
  heap.push(start, hEst(start));
  const NB = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const;
  while (heap.size) {
    const c = heap.pop();
    if (c === goal) break;
    if (closed[c]) continue;
    closed[c] = 1;
    const ci = c % nx, cj = Math.floor(c / nx);
    for (const [di, dj] of NB) {
      const i = ci + di, j = cj + dj;
      if (i < 0 || j < 0 || i >= nx || j >= ny) continue;
      const q = j * nx + i;
      if (closed[q]) continue;
      const len = (di && dj ? Math.SQRT2 : 1) * s;
      const grade = (Math.abs(height(q) - height(c)) / len) * 0.02;
      const rough = 1 + 0.2 * hash01(seed, i, j);
      const cost = len * (wet(q) ? WATER_COST : (1 + 30 * grade) * rough);
      if (g[c] + cost < g[q]) {
        g[q] = g[c] + cost;
        from[q] = c;
        heap.push(q, g[q] + hEst(q));
      }
    }
  }
  if (from[goal] < 0) return null;
  const cells: number[] = [];
  for (let c = goal; c >= 0; c = from[c]) cells.push(c);
  cells.reverse();
  // The longest stretch over water must be a short strait.
  let run = 0, longest = 0;
  for (const c of cells) {
    run = wet(c) ? run + s : 0;
    longest = Math.max(longest, run);
  }
  if (longest > MAX_BRIDGE) return null;
  let pts: Vec3[] = cells.map((c) => dirAt(c % nx, Math.floor(c / nx)));
  pts[0] = A.dir;
  pts[pts.length - 1] = B.dir;
  pts = chaikin(chaikin(pts));
  pts = trimEnd(trimEnd(pts, A.dir, A.radius * 0.85).reverse(), B.dir, B.radius * 0.85).reverse();
  const path = resample(pts, ROAD_STEP);
  const bridge = path.map((d) => !isLand(look, rawHeight(look, d[0], d[1], d[2], BASE_OCTAVES)));
  return { path, bridge, length: polylineLength(path) };
}

/** Corner cutting (keeps both ends), on the sphere. */
function chaikin(pts: readonly Vec3[]): Vec3[] {
  if (pts.length < 3) return [...pts];
  const out: Vec3[] = [pts[0]];
  for (let i = 0; i < pts.length - 1; i++) {
    out.push(lerpDir(pts[i], pts[i + 1], 0.25), lerpDir(pts[i], pts[i + 1], 0.75));
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/** Drop the points within `r` of `c` at the start of the polyline, starting it on that circle. */
function trimEnd(pts: readonly Vec3[], c: Vec3, r: number): Vec3[] {
  if (!pts.length || distance(pts[0], c) >= r) return [...pts];
  let i = 0;
  while (i < pts.length - 1 && distance(pts[i + 1], c) < r) i++;
  if (i >= pts.length - 1) return [...pts];
  // Where the segment i -> i+1 crosses the circle (bisection on the chord).
  let lo = 0, hi = 1;
  for (let k = 0; k < 20; k++) {
    const mid = (lo + hi) / 2;
    if (distance(lerpDir(pts[i], pts[i + 1], mid), c) < r) lo = mid; else hi = mid;
  }
  return [lerpDir(pts[i], pts[i + 1], hi), ...pts.slice(i + 1)];
}

/** Points along a polyline every `step` (planet radii), both ends included. */
export function resample(pts: readonly Vec3[], step: number): Vec3[] {
  if (pts.length < 2) return [...pts];
  const total = polylineLength(pts);
  const n = Math.max(1, Math.round(total / step));
  const out: Vec3[] = [pts[0]];
  let seg = 0, segStart = 0, segLen = distance(pts[0], pts[1]);
  for (let k = 1; k < n; k++) {
    const at = (k / n) * total;
    while (seg < pts.length - 2 && at > segStart + segLen) {
      segStart += segLen;
      seg++;
      segLen = distance(pts[seg], pts[seg + 1]);
    }
    out.push(lerpDir(pts[seg], pts[seg + 1], segLen > 0 ? (at - segStart) / segLen : 0));
  }
  out.push(pts[pts.length - 1]);
  return out;
}

export function polylineLength(pts: readonly Vec3[]): number {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += distance(pts[i - 1], pts[i]);
  return l;
}

function lerpDir(a: Vec3, b: Vec3, t: number): Vec3 {
  return normalize([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
}

/** Binary min-heap of grid cells by priority; ties go to the lower cell index (stable order). */
class MinHeap {
  private readonly ids: number[] = [];
  private readonly keys: number[] = [];

  get size(): number {
    return this.ids.length;
  }

  push(id: number, key: number): void {
    this.ids.push(id);
    this.keys.push(key);
    let i = this.ids.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(i, p)) break;
      this.swap(i, p);
      i = p;
    }
  }

  pop(): number {
    const top = this.ids[0];
    const lastId = this.ids.pop()!, lastKey = this.keys.pop()!;
    if (this.ids.length) {
      this.ids[0] = lastId;
      this.keys[0] = lastKey;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < this.ids.length && this.less(l, m)) m = l;
        if (r < this.ids.length && this.less(r, m)) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }

  private less(a: number, b: number): boolean {
    return this.keys[a] < this.keys[b] || (this.keys[a] === this.keys[b] && this.ids[a] < this.ids[b]);
  }

  private swap(a: number, b: number): void {
    [this.ids[a], this.ids[b]] = [this.ids[b], this.ids[a]];
    [this.keys[a], this.keys[b]] = [this.keys[b], this.keys[a]];
  }
}
