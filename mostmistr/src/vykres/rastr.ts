/** Rozteče čar rastru v metrech pro dané měřítko (pixely na metr). */
export interface KrokyRastru {
  jemny: number;
  hlavni: number;
}

/**
 * Při přiblížení je rastr po 1 m se zvýrazněním po 5 m. Při oddálení by metrové
 * čáry splynuly, proto se rozteč zvětšuje.
 */
export function krokyRastru(meritko: number): KrokyRastru {
  if (meritko >= 8) return { jemny: 1, hlavni: 5 };
  if (meritko >= 2) return { jemny: 5, hlavni: 25 };
  return { jemny: 25, hlavni: 100 };
}

const ROZTECE_SRAFOVANI = [0.25, 0.5, 1, 2, 5, 10, 25, 50] as const;

/** Rozteč šraf terénu v metrech: nejmenší, při které jsou čáry na obrazovce aspoň 9 px od sebe. */
export function roztecSrafovani(meritko: number): number {
  for (const roztec of ROZTECE_SRAFOVANI) {
    if (roztec * meritko >= 9) return roztec;
  }
  return ROZTECE_SRAFOVANI[ROZTECE_SRAFOVANI.length - 1]!;
}
