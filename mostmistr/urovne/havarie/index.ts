// Případy Havarijní komise v pořadí, v jakém je hra nabízí. Každý případ má vlastní soubor;
// texty (spis, nález) jsou ve slovníku pod `havarie.<id>.*`, anglický název v `NAZVY_UROVNI_EN`.

import type { PripadHavarie } from "../../src/data/havarie";
import { pripad01 } from "./9-01";
import { pripad02 } from "./9-02";
import { pripad03 } from "./9-03";
import { pripad04 } from "./9-04";
import { pripad05 } from "./9-05";
import { pripad06 } from "./9-06";

export const PRIPADY: readonly PripadHavarie[] = [pripad01, pripad02, pripad03, pripad04, pripad05, pripad06];

/** Případ podle id jeho úrovně. */
export function pripadHavarie(id: string): PripadHavarie | undefined {
  return PRIPADY.find((p) => p.uroven.id === id);
}
