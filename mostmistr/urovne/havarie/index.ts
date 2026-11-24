// Případy Havarijní komise v pořadí, v jakém je hra nabízí. Každý případ má vlastní soubor;
// texty (spis, nález) jsou ve slovníku pod `havarie.<id>.*`, anglický název v `NAZVY_UROVNI_EN`.

import type { PripadHavarie } from "../../src/data/havarie";
import { pripad01 } from "./9-01";
import { pripad02 } from "./9-02";

export const PRIPADY: readonly PripadHavarie[] = [pripad01, pripad02];

/** Případ podle id jeho úrovně. */
export function pripadHavarie(id: string): PripadHavarie | undefined {
  return PRIPADY.find((p) => p.uroven.id === id);
}
