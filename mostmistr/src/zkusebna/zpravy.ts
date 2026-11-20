// Zprávy mezi stránkou zkušebny a jejím pracovním vláknem.

import type { Obdelnik } from "../data/geometrie";
import type { Snimek, Topologie } from "../zkouska/zaznam";
import type { Overeni } from "./pripady";

export type ZpravaProZkusebnu = { typ: "spust"; pripad: string };

export type ZpravaZeZkusebny = { pripad: string } & (
  | {
      typ: "zacatek";
      topologie: Topologie;
      vyrez: Obdelnik;
      /** Délka děje v sekundách. */
      trvani: number;
      /** Krok výpočtu v sekundách. */
      dt: number;
      kol: number;
    }
  | { typ: "snimky"; snimky: Snimek[] }
  | {
      typ: "konec";
      overeni: Overeni[];
      kroku: number;
      /** Čistý čas výpočtu v milisekundách, bez přípravy a předávání snímků. */
      ms: number;
    }
  | { typ: "chyba"; zprava: string }
);
