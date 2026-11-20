// Rozhraní zkoušky: zprávy mezi hrou a simulací.
// Stejné zprávy tečou ve hře přes Web Worker a v testech přímo v Node, takže každou
// zkoušku lze spustit bez prohlížeče a přehrát přesně znovu.

import type { NavrhMostu } from "../data/navrh";
import type { Uroven } from "../data/uroven";

/** Vše, co určuje průběh zkoušky. Stejný vstup dává stejný výsledek. */
export interface VstupZkousky {
  uroven: Uroven;
  navrh: NavrhMostu;
  /** Násada náhody pro dav a nerovnosti vozovky. */
  nasada: number;
  /** Verze fyziky, se kterou hra počítá; simulace jinou odmítne. */
  verzeFyziky: number;
}

/** Zásah hráče do běžící zkoušky, vázaný na číslo kroku simulace. */
export type VstupHrace = {
  krok: number;
  druh: "brnknuti";
  /** Id styčníku z návrhu. */
  stycnik: number;
  /** Výchylka v metrech, o kterou hráč styčník stáhl, než ho pustil. */
  vychylka: { x: number; y: number };
};

/** Stav mostu v jednom okamžiku. Pole jsou ve stejném pořadí jako v návrhu. */
export interface Snimek {
  krok: number;
  /** Čas zkoušky v sekundách. */
  cas: number;
  /** Poloha x, y a natočení každého styčníku. */
  stycniky: Float32Array;
  /** Využití každého prutu; 1 je mez únosnosti. */
  vyuziti: Float32Array;
}

export type ZpusobPoruseni = "tah" | "vzper" | "smyk" | "ohyb" | "plasticky-kloub";

export type Udalost = { krok: number; cas: number } & (
  | { druh: "poruseni"; prut: number; zpusob: ZpusobPoruseni }
  /** Položka jízdního řádu dorazila na druhý břeh. */
  | { druh: "prujezd"; polozka: number }
  /** Položka jízdního řádu spadla. */
  | { druh: "pad"; polozka: number }
);

export interface VysledekZkousky {
  /** Všichni přešli a přejeli, nikdo nespadl. */
  pruchod: boolean;
  kroku: number;
  /** Otisk konečného stavu pro regresní testy a porovnání mezi prohlížeči. */
  otisk: string;
}

export type ZpravaProZkousku =
  | { typ: "ahoj" }
  | { typ: "start"; vstup: VstupZkousky }
  | { typ: "vstup"; vstup: VstupHrace }
  | { typ: "stop" };

export type ZpravaZeZkousky =
  | { typ: "pripraveno"; verzeFyziky: number }
  | { typ: "snimky"; snimky: Snimek[] }
  | { typ: "udalosti"; udalosti: Udalost[] }
  | { typ: "konec"; vysledek: VysledekZkousky }
  | { typ: "chyba"; kod: KodChyby; podrobnosti?: string };

export type KodChyby = "jina-verze-fyziky" | "jadro-neni-hotove" | "neplatny-vstup";
