import { Registry, ShipFactory, ShipGeneratorRegistry, ShipTraitRegistry } from './ShipFactory';
import { ClassicStyle } from './styles/ClassicStyle';
import { GeometricStyle } from './styles/GeometricStyle';
import { OrganicStyle } from './styles/OrganicStyle';
import { TechnologicalStyle } from './styles/TechnologicalStyle';
import { UtilitarianStyle } from './styles/UtilitarianStyle';
import { ROLE_TRAITS } from './traits/roleTraits';
import { ALL_TRAITS } from './traits/traits';

/** Composition helper: the built-in styles and traits. Add new ones here or register at runtime. */
export function createDefaultShipFactory(): { factory: ShipFactory; styles: ShipGeneratorRegistry; traits: ShipTraitRegistry } {
  const styles: ShipGeneratorRegistry = new Registry();
  [OrganicStyle, TechnologicalStyle, ClassicStyle, GeometricStyle, UtilitarianStyle].forEach((s) => styles.register(s));
  const traits: ShipTraitRegistry = new Registry();
  [...ALL_TRAITS, ...ROLE_TRAITS].forEach((t) => traits.register(t));
  return { factory: new ShipFactory(styles, traits), styles, traits };
}
