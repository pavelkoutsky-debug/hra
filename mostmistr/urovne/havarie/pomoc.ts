// Pomůcky pro soubory případů Havarijní komise: úroveň případu z údolí úrovně kampaně
// a přenesení mostu do ní.

import { KAPITOLA_HAVARII } from "../../src/data/havarie";
import type { NavrhMostu } from "../../src/data/navrh";
import { nactiUroven, type Uroven } from "../../src/data/uroven";
import { nactiKampan } from "../index";

/**
 * Úroveň případu číslo `cislo`: údolí, provoz a paleta úrovně kampaně `zaklad`, případně
 * upravené (`zmeny`: jiný jízdní řád, jiná paleta…). Případ nemá rozpočet, medaile ani
 * zkoušku kapitoly a prochází stejnou kontrolou jako soubory úrovní.
 */
export function urovenPripadu(cislo: number, nazev: string, zaklad: string, zmeny: Partial<Uroven> = {}): Uroven {
  const vzor = nactiKampan().find((u) => u.id === zaklad);
  if (!vzor) throw new Error(`Případ ${cislo}: úroveň ${zaklad} v kampani není.`);
  return nactiUroven({
    ...vzor,
    ...zmeny,
    id: `${KAPITOLA_HAVARII}-${String(cislo).padStart(2, "0")}`,
    nazev,
    rozpocet: null,
    inzenyrskyRozpocet: null,
    mistrovska: null,
    zkouskova: false,
  });
}

/** Tentýž most zapsaný pro jinou úroveň (most kampaně přenesený do případu). */
export function prenesMost(navrh: NavrhMostu, uroven: string): NavrhMostu {
  return { ...navrh, uroven };
}
