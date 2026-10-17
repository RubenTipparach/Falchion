import { Hex, hexDistance, hexLine } from '../hex/Hex';

/**
 * Turn-based fleet movement. A fleet advances exactly `speed` hexes (light
 * years) along its route each turn. Position is derived from the departure
 * turn, so it can be computed for any turn without per-turn simulation.
 */
export interface FleetMovement {
  readonly route: readonly Hex[];
  /** Turn the fleet departed. */
  readonly departTurn: number;
  /** Whole hexes (light years) per turn, >= 1. */
  readonly speed: number;
}

export function planMovement(from: Hex, to: Hex, departTurn: number, speed: number): FleetMovement {
  if (!Number.isInteger(speed) || speed < 1) throw new Error('speed must be a positive whole number of hexes per turn');
  if (!Number.isInteger(departTurn)) throw new Error('departTurn must be a whole turn');
  return { route: hexLine(from, to), departTurn, speed };
}

/** Turns needed to cover a distance (a partial final turn counts as a turn). */
export function travelTurns(distanceLy: number, speed: number): number {
  return Math.ceil(distanceLy / speed);
}

export function movementDistance(m: FleetMovement): number {
  return hexDistance(m.route[0], m.route[m.route.length - 1]);
}

export function arrivalTurn(m: FleetMovement): number {
  return m.departTurn + travelTurns(movementDistance(m), m.speed);
}

/** Index into the route of the hex occupied at a turn. */
export function routeIndexAt(m: FleetMovement, turn: number): number {
  const steps = Math.max(0, Math.floor(turn) - m.departTurn) * m.speed;
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

export function formatTurns(turns: number): string {
  return turns === 1 ? '1 turn' : `${turns.toLocaleString('en-US')} turns`;
}
