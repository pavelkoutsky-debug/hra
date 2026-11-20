// Rozhraní zkoušky: zprávy mezi hrou a simulací.
// Stejné zprávy tečou ve hře přes Web Worker a v testech přímo v Node, takže každou
// zkoušku lze spustit bez prohlížeče a přehrát přesně znovu.

import type { NavrhMostu } from "../data/navrh";
import type { Medaile } from "../data/ulozeni";
import type { Uroven } from "../data/uroven";
import type { PopisUcastnika } from "./provoz";
import type { Snimek, Topologie } from "./zaznam";

/** Vše, co určuje průběh zkoušky. Stejný vstup dává stejný výsledek. */
export interface VstupZkousky {
  uroven: Uroven;
  navrh: NavrhMostu;
  /** Násada náhody pro dav a nerovnosti vozovky. */
  nasada: number;
  /** Verze fyziky, se kterou hra počítá; simulace jinou odmítne. */
  verzeFyziky: number;
}

/** Co se při zkoušce stalo a kdy. Čísla způsobu a následku porušení jsou konstanty jádra. */
export type Udalost = { cas: number } & (
  | {
      druh: "poruseni";
      /** Pořadí prutu v návrhu. */
      prut: number;
      zpusob: number;
      nasledek: number;
      /** Využití v okamžiku porušení; 1 je mez únosnosti. */
      mira: number;
    }
  /** Konec mostu sjel z posuvné podpory; `stycnik` je pořadí styčníku v návrhu. */
  | { druh: "sjeti"; stycnik: number }
  /** Účastník provozu dojel na druhý břeh. */
  | { druh: "prujezd"; polozka: number; clen: number }
  /** Účastník provozu spadl. */
  | { druh: "pad"; polozka: number; clen: number }
);

/** Největší namáhání prutu za celou zkoušku. */
export interface ObalkaPrutu {
  /** Největší využití; 1 je mez únosnosti. */
  vyuziti: number;
  /** Čím bylo způsobené (konstanty ZPUSOB_* jádra). */
  zpusob: number;
  /** Kdy nastalo, v sekundách. */
  cas: number;
}

export interface VysledekZkousky {
  /** Všichni přešli a přejeli, nikdo nespadl. */
  pruchod: boolean;
  ucastniku: number;
  prejelo: number;
  spadlo: number;
  /** Počet porušení prutů. */
  poruseni: number;
  /** Cena mostu v korunách. */
  cena: number;
  /** Největší využití ze všech prutů. */
  nejvetsiVyuziti: number;
  medaile: Medaile;
  /** Obálka namáhání; pořadí odpovídá prutům návrhu. */
  obalka: ObalkaPrutu[];
  /** Most neměl pod vlastní tíhou klidovou polohu (chybí mu ztužení) a zkouška začala z nakreslené. */
  bezRovnovahy: boolean;
  /** Výpočet se rozpadl; výsledek neplatí. */
  rozpad: boolean;
  /** Délka děje v sekundách. */
  trvani: number;
  kroku: number;
  /** Otisk konečného stavu pro regresní testy a porovnání mezi prohlížeči. */
  otisk: string;
}

export type ZpravaProZkousku = { typ: "ahoj" } | { typ: "start"; vstup: VstupZkousky } | { typ: "stop" };

export type ZpravaZeZkousky =
  | { typ: "pripraveno"; verzeFyziky: number }
  | {
      typ: "zacatek";
      /** Očekávaná délka děje v sekundách; při zřícení může skončit dřív. */
      trvani: number;
      /** Krok výpočtu v sekundách. */
      dt: number;
      ucastnici: PopisUcastnika[];
    }
  | { typ: "zaznam"; snimky: Snimek[]; topologie: Topologie[]; udalosti: Udalost[] }
  | { typ: "konec"; vysledek: VysledekZkousky }
  | { typ: "chyba"; kod: KodChyby; podrobnosti?: string };

export type KodChyby = "jina-verze-fyziky" | "neplatny-vstup" | "vypocet-selhal";
