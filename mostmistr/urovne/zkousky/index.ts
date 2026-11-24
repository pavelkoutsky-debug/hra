// Referenční mosty zkouškových úrovní (pátá úroveň každé kapitoly: bez ukázky a bez nápovědy).
// Každá má vlastní soubor; `urovne/reseni.ts` je přidává k mostům ostatních úrovní.

import type { ReseniUrovne } from "../reseni";
import { reseni as nadLesniCestou } from "./1-05";
import { reseni as pochodABeh } from "./2-05";
import { reseni as nadKolejistem } from "./3-05";
import { reseni as jedinyZaklad } from "./4-05";
import { reseni as dvaRytmy } from "./5-05";
import { reseni as nestejnaPole } from "./6-05";
import { reseni as jedineKridlo } from "./7-05";

export const RESENI_ZKOUSEK: Readonly<Record<string, ReseniUrovne>> = {
  "1-05": nadLesniCestou,
  "2-05": pochodABeh,
  "3-05": nadKolejistem,
  "4-05": jedinyZaklad,
  "5-05": dvaRytmy,
  "6-05": nestejnaPole,
  "7-05": jedineKridlo,
};
