// Základ výzev o efektivitu pro úrovně kampaně: co ve výzvách dokázaly referenční mosty.
// Cena a hmotnost se počítají přímo z referenčních mostů; únosnost na korunu je výsledek
// zkoušky do zlomu, kterou hra při spuštění počítat nemůže, proto je uložená v `zlomy.json`.
// Po změně fyziky, katalogu, úrovně nebo referenčního mostu ji zapiš znovu (`npm run vyzvy`);
// test `test/vyzvy.test.ts` hlídá, že uložená čísla platí.

import { cenaMostovky, cenaNavrhu, hmotnostMostovky, hmotnostNavrhu } from "../src/data/cena";
import type { NavrhMostu } from "../src/data/navrh";
import type { Uroven } from "../src/data/uroven";
import type { ZakladVyzev } from "../src/data/vyzvy";
import { RESENI } from "./reseni";
import zlomy from "./zlomy.json";

export const KLICE_RESENI = ["pruchod", "rozpocet", "mistrovska"] as const;
export type KlicReseni = (typeof KLICE_RESENI)[number];

/** Uložený výsledek zkoušky do zlomu: který referenční most je nejúčinnější a kolik unesl na korunu. */
export interface UlozenyZlom {
  reseni: KlicReseni;
  /** Únosnost na korunu, N/Kč. */
  naKorunu: number;
}

export const ULOZENE_ZLOMY: { verzeFyziky: number; urovne: Record<string, UlozenyZlom> } = zlomy as {
  verzeFyziky: number;
  urovne: Record<string, UlozenyZlom>;
};

/** Referenční mosty úrovně, které zkouškou projdou (most pro každou medaili). */
export function mostyProVyzvy(idUrovne: string): NavrhMostu[] {
  const reseni = RESENI[idUrovne];
  return reseni ? KLICE_RESENI.map((k) => reseni[k]) : [];
}

/**
 * Základ výzev úrovně; null u úrovně, která referenční mosty nemá (sandbox, zkušební výkres)
 * nebo jí chybí změřená únosnost.
 */
export function zakladVyzev(uroven: Uroven): ZakladVyzev | null {
  const mosty = mostyProVyzvy(uroven.id);
  const zlom = ULOZENE_ZLOMY.urovne[uroven.id];
  if (mosty.length === 0 || !zlom) return null;
  let nejlevnejsi = mosty[0]!;
  let nejlehci = mosty[0]!;
  for (const most of mosty) {
    if (cenaNavrhu(most) < cenaNavrhu(nejlevnejsi)) nejlevnejsi = most;
    if (hmotnostNavrhu(most, uroven) < hmotnostNavrhu(nejlehci, uroven)) nejlehci = most;
  }
  return {
    cena: cenaNavrhu(nejlevnejsi),
    cenaMostovky: cenaMostovky(nejlevnejsi),
    hmotnost: hmotnostNavrhu(nejlehci, uroven),
    hmotnostMostovky: hmotnostMostovky(nejlehci, uroven),
    zlom: zlom.naKorunu,
  };
}
