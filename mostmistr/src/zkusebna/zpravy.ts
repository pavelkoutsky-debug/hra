// Zprávy mezi stránkou zkušebny a jejím pracovním vláknem.

import type { Obdelnik } from "../data/geometrie";
import type { Snimek, Topologie, UdalostZaznamu } from "../zkouska/zaznam";
import type { Overeni } from "./pripady";

export type ZpravaProZkusebnu = { typ: "spust"; pripad: string };

export type ZpravaZeZkusebny = { pripad: string } & (
  | {
      typ: "zacatek";
      vyrez: Obdelnik;
      /** Nejdelší možná délka děje v sekundách; po porušení může skončit dřív. */
      trvani: number;
      /** Krok výpočtu v sekundách. */
      dt: number;
    }
  | { typ: "zaznam"; snimky: Snimek[]; topologie: Topologie[]; udalosti: UdalostZaznamu[] }
  | {
      typ: "konec";
      overeni: Overeni[];
      kroku: number;
      /** Skutečná délka děje v sekundách. */
      trvani: number;
      /** Čistý čas výpočtu v milisekundách, bez přípravy a předávání snímků. */
      ms: number;
    }
  | { typ: "chyba"; zprava: string }
);
