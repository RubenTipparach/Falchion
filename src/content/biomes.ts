/** Planet biomes. Adjacency drives expansion research (see change mmo-core-systems). */
export interface BiomeDef {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly adjacent: readonly string[];
  /** Relative frequency when generating planets. */
  readonly weight: number;
}

export const BIOMES: readonly BiomeDef[] = [
  { id: 'terran', name: 'Terran', color: '#4caf50', adjacent: ['ocean', 'jungle', 'desert'], weight: 2 },
  { id: 'ocean', name: 'Ocean', color: '#2196f3', adjacent: ['terran', 'ice', 'jungle'], weight: 3 },
  { id: 'jungle', name: 'Jungle', color: '#2e7d32', adjacent: ['terran', 'ocean', 'toxic'], weight: 2 },
  { id: 'desert', name: 'Desert', color: '#d7a648', adjacent: ['terran', 'volcanic', 'barren'], weight: 4 },
  { id: 'ice', name: 'Ice', color: '#b3e5fc', adjacent: ['ocean', 'barren'], weight: 4 },
  { id: 'volcanic', name: 'Volcanic', color: '#e64a19', adjacent: ['desert', 'toxic'], weight: 3 },
  { id: 'toxic', name: 'Toxic', color: '#9ccc65', adjacent: ['jungle', 'volcanic', 'gas'], weight: 3 },
  { id: 'barren', name: 'Barren', color: '#9e9e9e', adjacent: ['desert', 'ice', 'gas'], weight: 6 },
  { id: 'gas', name: 'Gas Giant', color: '#ce93d8', adjacent: ['toxic', 'barren'], weight: 5 },
];
