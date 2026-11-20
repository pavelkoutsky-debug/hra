// Průřezy prvků pro měření výkonu, odvozené z katalogu.

import type { IdPrvku } from "../src/data/katalog";
import { popisPrutu, type PopisPrutu } from "../src/zkouska/stavba";

export type Prurez = PopisPrutu;

/** Šířka mostovky referenčních mostů v metrech. */
const SIRKA_MOSTOVKY = 3;
/** Hmotnost zábradlí a vybavení mostovky, kg na metr délky. */
const HMOTNOST_VYBAVENI = 100;

export const prurezPrvku = (id: IdPrvku, sirkaMostovky = SIRKA_MOSTOVKY, hmotaNavic = 0): Prurez =>
  popisPrutu(id, sirkaMostovky, hmotaNavic);

export const PRUREZY = {
  "drevo-lehke": prurezPrvku("drevo-lehke"),
  "drevo-tezke": prurezPrvku("drevo-tezke"),
  "ocel-lehka": prurezPrvku("ocel-lehka"),
  "ocel-tezka": prurezPrvku("ocel-tezka"),
  "mostovka-drevo": prurezPrvku("mostovka-drevo", SIRKA_MOSTOVKY, HMOTNOST_VYBAVENI),
  "mostovka-ocelobeton": prurezPrvku("mostovka-ocelobeton", 8, 1500),
  kolejiste: prurezPrvku("kolejiste"),
  pilir: prurezPrvku("pilir"),
  lano: prurezPrvku("lano"),
} as const;

export type IdPrurezu = keyof typeof PRUREZY;

/** Rychlost podélné vlny v prutu, m/s. Určuje nejdelší stabilní krok: dt < L/c. */
export const rychlostVlny = (p: Prurez): number => Math.sqrt(p.EA / p.hmotnostNaMetr);
