import type { ShipKit } from './ShipKit';

/** Extension point: one implementation per ship visual style. */
export interface ShipStyleGenerator {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** Use flat shading for this style's materials. */
  readonly flatShading?: boolean;
  build(kit: ShipKit): void;
}

/** Extension point: research traits that decorate any style. */
export interface ShipTraitDecorator {
  readonly id: string;
  readonly name: string;
  apply(kit: ShipKit): void;
}
