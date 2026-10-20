/**
 * Population of a world: a whole number of at least 1, each point eating FOOD_PER_POP food a
 * year. A world grows only from its own food surplus, which builds its growth progress until the
 * next point of population (GROWTH_PER_POP × pop). A shortfall the empire's stores cover keeps it
 * as it is. What the stores cannot cover starves worlds, the most populous first: it eats into
 * their progress, and at −DECLINE_PER_POP × pop a world loses a point. Pure: the economy calls
 * `growWorld` once a year for each colony.
 */
export const FOOD_PER_POP = 2;
export const GROWTH_PER_POP = 10;
export const DECLINE_PER_POP = 2;
/** Most population a world holds, by its planet's size. */
export const POP_PER_SIZE = 3;
/** Population a new empire's capital starts with (a settled world starts at 1). */
export const CAPITAL_START_POP = 3;

export interface Populated {
  readonly pop?: number;
  /** Food put towards the next point of population (negative: starving towards losing one). */
  readonly growth?: number;
  readonly size?: number;
  readonly capital?: boolean;
}

export function populationOf(colony: { readonly pop?: number }): number {
  return Math.max(1, Math.floor(colony.pop ?? 1));
}

/** Food a world needs for its next point of population. */
export const growthNeeded = (pop: number): number => GROWTH_PER_POP * Math.max(1, pop);

/** The most population a world can hold. */
export const popCap = (colony: Populated): number => Math.max(1, POP_PER_SIZE * (colony.size ?? 3));

/**
 * One year of a world's population. `balance` is its own food (produced minus eaten); `uncovered`
 * is the empire's shortfall this world is left to go without (0 when the stores cover it). A world
 * that goes hungry does not grow that year, whatever it grows itself.
 */
export function growWorld<C extends Populated>(colony: C, balance: number, uncovered: number): { colony: C; change: -1 | 0 | 1 } {
  let pop = populationOf(colony);
  let growth = colony.growth ?? 0;
  let change: -1 | 0 | 1 = 0;
  if (uncovered > 0) {
    growth = Math.min(growth, 0) - uncovered;
    if (growth <= -DECLINE_PER_POP * pop) {
      if (pop > 1) { pop--; change = -1; }
      growth = 0;
    }
  } else if (balance > 0) {
    // Its own surplus; a world that was starving recovers first.
    growth += balance;
    if (pop >= popCap(colony)) growth = Math.min(growth, 0);
    else if (growth >= growthNeeded(pop)) { pop++; growth = 0; change = 1; }
  }
  if (pop === colony.pop && growth === (colony.growth ?? 0)) return { colony, change };
  return { colony: { ...colony, pop, growth }, change };
}
