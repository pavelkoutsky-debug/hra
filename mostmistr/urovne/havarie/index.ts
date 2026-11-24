// Případy Havarijní komise v pořadí, v jakém je hra nabízí. Každý případ má vlastní soubor;
// texty (název, spis, nález) jsou ve slovníku pod `havarie.<id>.*`.

import type { PripadHavarie } from "../../src/data/havarie";

export const PRIPADY: readonly PripadHavarie[] = [];

/** Případ podle id jeho úrovně. */
export function pripadHavarie(id: string): PripadHavarie | undefined {
  return PRIPADY.find((p) => p.uroven.id === id);
}
