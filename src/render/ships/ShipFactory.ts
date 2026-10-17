import type { ShipDesign } from '../../core/ships/ShipDesign';
import { ShipKit, ShipModel } from './ShipKit';
import type { ShipStyleGenerator, ShipTraitDecorator } from './ShipStyleGenerator';

/** Generic id → implementation registry (Open/Closed: add by registering). */
export class Registry<T extends { readonly id: string }> {
  private readonly items = new Map<string, T>();

  register(item: T): this {
    if (this.items.has(item.id)) throw new Error(`Duplicate registration: ${item.id}`);
    this.items.set(item.id, item);
    return this;
  }

  get(id: string): T | undefined {
    return this.items.get(id);
  }

  list(): T[] {
    return [...this.items.values()];
  }
}

export type ShipGeneratorRegistry = Registry<ShipStyleGenerator>;
export type ShipTraitRegistry = Registry<ShipTraitDecorator>;

/** Builds a ship model from a design: style generator first, then each trait decorator. */
export class ShipFactory {
  constructor(private readonly styles: ShipGeneratorRegistry, private readonly traits: ShipTraitRegistry) {}

  create(design: ShipDesign): ShipModel {
    const style = this.styles.get(design.style) ?? this.styles.list()[0];
    if (!style) throw new Error('No ship styles registered');
    const kit = new ShipKit(design, { flat: style.flatShading });
    style.build(kit);
    kit.freezeHull();
    for (const id of design.traits) this.traits.get(id)?.apply(kit);
    return kit.finish();
  }
}
