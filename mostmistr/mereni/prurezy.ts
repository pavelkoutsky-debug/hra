// Průřezy prvků pro měření: převod položek katalogu na popis prvku jádra.

import { vlastnostiPrutu, type IdPrvku } from "../src/data/katalog";
import { LANO, NOSNIK, type PopisPrvku } from "../src/jadro/soustava";

export type Prurez = Omit<PopisPrvku, "a" | "b">;

/** Šířka mostovky referenčních mostů v metrech. */
const SIRKA_MOSTOVKY = 3;
/** Hmotnost zábradlí a vybavení mostovky, kg na metr délky. */
const HMOTNOST_VYBAVENI = 100;

/** Popis prvku jádra pro danou položku katalogu. */
export function prurezPrvku(id: IdPrvku, sirkaMostovky = SIRKA_MOSTOVKY, hmotaNavic = 0): Prurez {
  const v = vlastnostiPrutu(id, sirkaMostovky);
  if (!v) throw new Error(`Prvek ${id} nemá v katalogu průřez.`);
  return {
    druh: id === "lano" ? LANO : NOSNIK,
    EA: v.EA,
    EI: v.EI,
    GAs: v.GAs,
    hmotnostNaMetr: v.hmotnostNaMetr + hmotaNavic,
    polomerSetrvacnosti: v.polomerSetrvacnosti,
  };
}

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
