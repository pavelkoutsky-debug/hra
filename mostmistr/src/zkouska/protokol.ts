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
  /**
   * Brnknutí místo provozu: styčník návrhu (pořadí v návrhu) se stáhne silou `sila` (N,
   * kladná dolů), pustí a most volně kmitá. Jízdní řád se při tom nepouští a výsledek
   * se nepočítá do medailí.
   */
  brnknuti?: { stycnik: number; sila: number };
}

/** Rozbor mostu ve stavebním režimu: maticový výpočet bez časové simulace. */
export interface RozborMostu {
  /** Most má pod vlastní tíhou klidovou polohu; mechanismus ji nemá a frekvence nejsou. */
  stabilni: boolean;
  /** Nejnižší vlastní frekvence prázdného mostu v Hz, vzestupně. */
  frekvence: number[];
  /**
   * Totéž s největší skupinou lidí z jízdního řádu rozestavenou po mostovce. Lidé přidávají
   * hmotu, takže frekvence klesnou; prázdné pole v úrovni bez lidí.
   */
  frekvenceObsazeneho: number[];
  /**
   * Tvary kmitání prázdného mostu ke každé frekvenci z `frekvence`: posuny styčníků návrhu
   * (dx0, dy0, dx1, dy1, …) v pořadí, v jakém jsou v návrhu. Největší posun má velikost 1.
   */
  tvary: number[][];
  /**
   * Rezonanční křivka: největší svislé zrychlení mostovky v m/s² na 1 kN svislé harmonické
   * síly, pro frekvence `od`, `od + krok`, … Hz. Null v úrovni, která křivku neukazuje.
   */
  krivka: { od: number; krok: number; prazdny: number[]; obsazeny: number[] | null } | null;
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

/** Kmitání mostovky pod lidmi. */
export interface KomfortZkousky {
  /** Největší zrychlení mostovky v m/s² (amplituda v pásmu 0,5–10 Hz, průměrovaná přes sekundu). */
  zrychleni: number;
  /** Kdy nastalo, v sekundách. */
  cas: number;
  /** Třída komfortu: 1 výborný, 2 střední, 3 nízký, 4 nepřijatelný. */
  trida: 1 | 2 | 3 | 4;
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
  /** Kmitání mostovky, dokud po ní šli lidé; null v úrovni bez lidí. */
  komfort: KomfortZkousky | null;
  /**
   * Výsledek brnknutí: frekvence v Hz, kterou brnknutý styčník kmital (null, když se
   * nerozkmital). U běžné zkoušky null.
   */
  brnknuti: { frekvence: number | null } | null;
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

export type ZpravaProZkousku =
  | { typ: "ahoj" }
  | { typ: "start"; vstup: VstupZkousky }
  | { typ: "stop" }
  /** Žádost o rozbor mostu; `id` se vrátí v odpovědi, aby šla poznat zastaralá. */
  | { typ: "rozbor"; id: number; uroven: Uroven; navrh: NavrhMostu };

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
  /** Odpověď na žádost o rozbor; null, když se most nedal sestavit (nevyhovuje pravidlům). */
  | { typ: "rozbor"; id: number; rozbor: RozborMostu | null }
  | { typ: "chyba"; kod: KodChyby; podrobnosti?: string };

export type KodChyby = "jina-verze-fyziky" | "neplatny-vstup" | "vypocet-selhal";
