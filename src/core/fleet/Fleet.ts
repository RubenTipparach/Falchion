import { Hex, hexDistance, hexLine, Point2 } from '../hex/Hex';

/**
 * Turn-based fleet movement. A fleet advances exactly `speed` hexes (light
 * years) along its route each turn. Position is derived from the departure
 * time, so it can be computed for any turn without per-turn simulation.
 */
export interface FleetMovement {
  readonly route: readonly Hex[];
  /**
   * When the fleet departed, in turns. Fractional when an order redirects a fleet between
   * ticks: it sets off from where it is at that moment instead of jumping back a hex.
   */
  readonly departTurn: number;
  /** Whole hexes (light years) per turn, >= 1. */
  readonly speed: number;
  /** Exact point (galaxy plane) it set off from, when that is not route[0]'s own point. */
  readonly from?: Point2;
}

export function planMovement(from: Hex, to: Hex, departTurn: number, speed: number, origin?: Point2): FleetMovement {
  if (!Number.isInteger(speed) || speed < 1) throw new Error('speed must be a positive whole number of hexes per turn');
  if (!Number.isFinite(departTurn) || departTurn < 0) throw new Error('departTurn must be a time >= 0');
  const m = { route: hexLine(from, to), departTurn, speed };
  return origin ? { ...m, from: { x: origin.x, z: origin.z } } : m;
}

/**
 * Where a fleet is drawn at a time: gliding in a straight line from its start (its exact
 * departure point, or its first hex's point) to its last hex's point.
 */
export function positionAt(m: FleetMovement, time: number, pointAt: (h: Hex) => Point2): Point2 {
  const a = m.from ?? pointAt(m.route[0]);
  const b = pointAt(m.route[m.route.length - 1]);
  const t = progressAtTime(m, time);
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
}

/** Turns needed to cover a distance (a partial final turn counts as a turn). */
export function travelTurns(distanceLy: number, speed: number): number {
  return Math.ceil(distanceLy / speed);
}

export function movementDistance(m: FleetMovement): number {
  return hexDistance(m.route[0], m.route[m.route.length - 1]);
}

/** The tick on which the fleet is at its destination (a whole turn). */
export function arrivalTurn(m: FleetMovement): number {
  return Math.ceil(m.departTurn + travelTurns(movementDistance(m), m.speed));
}

/** Index into the route of the hex occupied at a turn. */
export function routeIndexAt(m: FleetMovement, turn: number): number {
  const steps = Math.floor(Math.max(0, Math.floor(turn) - m.departTurn) * m.speed);
  return Math.min(m.route.length - 1, steps);
}

export function hexAt(m: FleetMovement, turn: number): Hex {
  return m.route[routeIndexAt(m, turn)];
}

/** Fraction of the journey completed at a turn, in [0, 1]. */
export function progressAt(m: FleetMovement, turn: number): number {
  const last = m.route.length - 1;
  return last === 0 ? 1 : routeIndexAt(m, turn) / last;
}

/**
 * Continuous journey fraction at a fractional time (tick + fraction of the
 * minute), for drawing ships gliding between ticks. Matches progressAt on
 * whole ticks.
 */
export function progressAtTime(m: FleetMovement, time: number): number {
  // A fleet redirected within its own hex still glides the rest of the way to its point.
  const last = Math.max(m.route.length - 1, m.from ? 1 : 0);
  if (last === 0) return 1;
  const steps = Math.max(0, time - m.departTurn) * m.speed;
  return Math.min(last, steps) / last;
}

/**
 * The same journey at a new speed from `turn` on: a fleet under way continues from the hex
 * it occupies, one that has arrived stays where it is. Unchanged when the speed matches.
 */
export function retime(m: FleetMovement, turn: number, speed: number): FleetMovement {
  if (m.speed === speed) return m;
  const dest = m.route[m.route.length - 1];
  const t = Math.floor(turn);
  return t >= arrivalTurn(m) ? planMovement(dest, dest, t, speed) : planMovement(hexAt(m, t), dest, t, speed);
}

export function formatTurns(turns: number): string {
  return turns === 1 ? '1 turn' : `${turns.toLocaleString('en-US')} turns`;
}
