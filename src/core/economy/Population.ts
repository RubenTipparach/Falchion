export function populationOf(colony: { readonly pop?: number }): number { return Math.max(1, Math.floor(colony.pop ?? 1)); }
