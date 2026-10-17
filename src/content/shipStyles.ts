/**
 * Ship styles an empire can be founded with. An empire starts with one; research unlocks the
 * others (a `style` grant on each branch's first hull node), and unlocked styles can be mixed
 * into any design. Ids match the registered ShipStyleGenerators.
 */
export interface ShipStyleDef {
  readonly id: string;
  readonly name: string;
  readonly blurb: string;
}

export const SHIP_STYLES: readonly ShipStyleDef[] = [
  { id: 'organic', name: 'Organic', blurb: 'Living hulls with tendrils, fins and glowing sacs.' },
  { id: 'technological', name: 'Technological', blurb: 'Sleek frames, sensor masts and clean engineering.' },
  { id: 'classic', name: 'Aesthetic / Classic', blurb: 'Elegant lines, gilded spires and swept fins.' },
  { id: 'geometric', name: 'Simple Geometry', blurb: 'Pure polyhedra, rings and orbiting satellites.' },
  { id: 'utilitarian', name: 'Utilitarian', blurb: 'Bolt-together frames, cargo pods and cranes.' },
];
