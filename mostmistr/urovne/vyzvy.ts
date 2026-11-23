// Základ výzev o efektivitu pro úrovně kampaně: co ve výzvách dokázaly referenční mosty a
// jejich strojově zeštíhlené verze („šampioni“, viz `hubnuti.ts`). Cena a hmotnost se počítají
// přímo z mostů; únosnost na korunu je výsledek zkoušky do zlomu, kterou hra při spuštění
// počítat nemůže, proto je uložená v `zlomy.json`. Šampioni jsou uložení jako úpravy
// referenčního mostu v `sampioni.json`. Po změně fyziky, katalogu, úrovně nebo referenčního
// mostu zapiš obojí znovu (`npm run sampioni`, `npm run vyzvy`); testy `test/sampioni.test.ts`
// a `test/vyzvy.test.ts` hlídají, že uložené platí.

import { cenaMostovky, cenaNavrhu, hmotnostMostovky, hmotnostNavrhu } from "../src/data/cena";
import type { NavrhMostu } from "../src/data/navrh";
import type { Uroven } from "../src/data/uroven";
import type { ZakladVyzev } from "../src/data/vyzvy";
import { pouzijUpravy, type Meritko, type Uprava } from "./hubnuti";
import { RESENI } from "./reseni";
import sampioni from "./sampioni.json";
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

export const MERITKA_SAMPIONU = ["cena", "hmotnost"] as const satisfies readonly Meritko[];

/** Uložený šampion: ze kterého referenčního mostu vznikl a co z něj stroj ubral. */
export interface UlozenySampion {
  z: KlicReseni;
  upravy: Uprava[];
}

export const ULOZENI_SAMPIONI = sampioni as unknown as {
  verzeFyziky: number;
  urovne: Record<string, Record<Meritko, UlozenySampion>>;
};

/**
 * Šampion úrovně v měřítku; null, když ho úroveň nemá nebo když úpravy na referenční most
 * už nesedí (most se změnil a šampioni se ještě nehledali znovu).
 */
export function sampionUrovne(idUrovne: string, meritko: Meritko): NavrhMostu | null {
  const ulozeny = ULOZENI_SAMPIONI.urovne[idUrovne]?.[meritko];
  const vychozi = RESENI[idUrovne]?.[ulozeny?.z ?? "pruchod"];
  if (!ulozeny || !vychozi) return null;
  try {
    return pouzijUpravy(vychozi, ulozeny.upravy);
  } catch {
    return null;
  }
}

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
  const levny = sampionUrovne(uroven.id, "cena");
  const lehky = sampionUrovne(uroven.id, "hmotnost");
  return {
    cena: cenaNavrhu(nejlevnejsi),
    cenaMostovky: cenaMostovky(nejlevnejsi),
    hmotnost: hmotnostNavrhu(nejlehci, uroven),
    hmotnostMostovky: hmotnostMostovky(nejlehci, uroven),
    sampion:
      levny && lehky
        ? {
            cena: cenaNavrhu(levny),
            cenaMostovky: cenaMostovky(levny),
            hmotnost: hmotnostNavrhu(lehky, uroven),
            hmotnostMostovky: hmotnostMostovky(lehky, uroven),
          }
        : null,
    zlom: zlom.naKorunu,
    rozpocet: uroven.rozpocet,
  };
}
