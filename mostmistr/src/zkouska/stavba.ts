// Převod prvků katalogu na popis, kterému rozumí fyzikální jádro.

import { vlastnostiPrutu, type IdPrvku, type VlastnostiPrutu } from "../data/katalog";
import { LANO, NOSNIK, type PopisPrvku } from "../jadro/soustava";

/** Popis prvku jádra bez koncových styčníků. */
export type PopisPrutu = Omit<PopisPrvku, "a" | "b">;

/**
 * Popis prutu daného prvku katalogu. `sirkaMostovky` se použije u prvků zadaných
 * na metr šířky, `hmotaNavic` je nenosná hmota v kg na metr (zábradlí, vozovka).
 */
export function popisPrutu(id: IdPrvku, sirkaMostovky: number, hmotaNavic = 0): PopisPrutu {
  return popisZVlastnosti(vlastnostiNeboChyba(id, sirkaMostovky), id === "lano", hmotaNavic);
}

export function vlastnostiNeboChyba(id: IdPrvku, sirkaMostovky: number): VlastnostiPrutu {
  const v = vlastnostiPrutu(id, sirkaMostovky);
  if (!v) throw new Error(`Prvek ${id} nemá v katalogu průřez.`);
  return v;
}

function popisZVlastnosti(v: VlastnostiPrutu, lano: boolean, hmotaNavic: number): PopisPrutu {
  const popis: PopisPrutu = {
    druh: lano ? LANO : NOSNIK,
    EA: v.EA,
    EI: v.EI,
    GAs: v.GAs,
    hmotnostNaMetr: v.hmotnostNaMetr + hmotaNavic,
    polomerSetrvacnosti: v.polomerSetrvacnosti,
    unosnost: { ...v.unosnost },
  };
  if (v.pretrzeni) {
    popis.tvarny = {
      silaPretrzeni: v.pretrzeni.sila,
      mezniNatoceni: v.pretrzeni.mezniNatoceni,
      mezniProtazeni: v.pretrzeni.mezniProtazeni,
    };
  }
  return popis;
}
