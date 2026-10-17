import { Hex, hexDistance, hexLine } from '../hex/Hex';

export interface FleetMovement {
  readonly route: readonly Hex[];
  /** Game day the fleet departed. */
  readonly departDay: number;
  /** Light years per game day. */
  readonly speed: number;
}

export function planMovement(from: Hex, to: Hex, departDay: number, speed: number): FleetMovement {
  if (speed <= 0) throw new Error('speed must be positive');
  return { route: hexLine(from, to), departDay, speed };
}

export function travelDays(distanceLy: number, speed: number): number {
  return distanceLy / speed;
}

export function movementDistance(m: FleetMovement): number {
  return hexDistance(m.route[0], m.route[m.route.length - 1]);
}

export function arrivalDay(m: FleetMovement): number {
  return m.departDay + travelDays(movementDistance(m), m.speed);
}

/** Progress in [0,1] at a game day. Derived, so no per-tick simulation is needed. */
export function progressAt(m: FleetMovement, day: number): number {
  const total = travelDays(movementDistance(m), m.speed);
  if (total === 0) return 1;
  return Math.min(1, Math.max(0, (day - m.departDay) / total));
}

export function hexAt(m: FleetMovement, day: number): Hex {
  const idx = Math.floor(progressAt(m, day) * (m.route.length - 1));
  return m.route[idx];
}

export function formatDuration(days: number): string {
  if (days < 1) return `${Math.round(days * 24)} hours`;
  if (days < 365) return `${Math.round(days)} days`;
  const years = days / 365;
  return years < 100 ? `${Math.round(days)} days (${years.toFixed(1)} yr)` : `${Math.round(years).toLocaleString('en-US')} years`;
}
