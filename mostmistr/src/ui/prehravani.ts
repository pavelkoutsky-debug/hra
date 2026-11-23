// Hodiny přehrávání záznamu: čas děje, který běží zvolenou rychlostí a nikdy
// nepředběhne to, co simulace už spočítala.

import { cislo } from "./formaty";

export interface StavPrehravani {
  /** Čas děje v sekundách. */
  cas: number;
  bezi: boolean;
  /** Násobek skutečné rychlosti: 0,25, 1, 4… */
  rychlost: number;
}

/**
 * Posune čas o `uplynulo` sekund skutečného času. `spocitano` je konec záznamu,
 * `trvani` délka celého děje. Na konci děje se přehrávání samo zastaví; na konci
 * dosud spočítané části čeká.
 */
export function posunPrehravani(
  stav: StavPrehravani,
  uplynulo: number,
  spocitano: number,
  trvani: number,
): StavPrehravani {
  if (!stav.bezi) return stav;
  const cas = Math.min(stav.cas + uplynulo * stav.rychlost, spocitano, trvani);
  // Na konec děje se dojde jen tehdy, když je spočítaný celý.
  const naKonci = cas >= trvani;
  return { ...stav, cas, bezi: !naKonci };
}

/** Zápis času děje jako sekundy s desetinami, např. „12,3 s“. */
export function zapisCasu(cas: number): string {
  return `${cislo(cas, 1)} s`;
}
