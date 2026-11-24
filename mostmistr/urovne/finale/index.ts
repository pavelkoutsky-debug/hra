// Referenční mosty závěrečné kapitoly (kapitola 8): úrovně, které nic nového neučí a spojují
// mechaniky dvou kapitol. Každá má vlastní soubor; `urovne/reseni.ts` je přidává k ostatním.

import type { ReseniUrovne } from "../reseni";
import { reseni as tratNaLanech } from "./8-01";
import { reseni as pristavniTrat } from "./8-03";

export const RESENI_FINALE: Readonly<Record<string, ReseniUrovne>> = {
  "8-01": tratNaLanech,
  "8-03": pristavniTrat,
};
