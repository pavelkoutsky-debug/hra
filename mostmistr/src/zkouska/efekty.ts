// Drobné efekty při pádu mostu: šplouchnutí do vody a trosky v místě zlomu.
//
// Zkouška je spočítaná předem a přehrává se ze záznamu, takže efekty nejsou simulace: z času
// děje a ze záznamu se dá říct, kde a kdy něco dopadlo do vody a kde se co utrhlo, a kresba
// podle toho v každém okamžiku ukáže totéž (i při krokování a přehrání pozpátku).
// Bez prohlížeče, ať se dá zkoušet v testech.

import { NASLEDEK_KLOUB } from "../jadro/poruseni";
import type { Udalost } from "./protokol";
import { mistoPrutu, prazdnySnimek, type Zaznam } from "./zaznam";

/** Dopad na hladinu: kdy, kde a jak prudce (rychlost dopadu v m/s). */
export interface Splouchnuti {
  cas: number;
  x: number;
  sila: number;
}

/** Zlom prutu: kdy, kde a jak velký kus se utrhl (délka prutu v m). */
export interface Zlom {
  cas: number;
  x: number;
  y: number;
  rozsah: number;
}

/** Jak dlouho je šplouchnutí a jak dlouho jsou trosky vidět, v sekundách děje. */
export const DOBA_SPLOUCHNUTI = 1.1;
export const DOBA_TROSEK = 0.9;
/** Pomalejší dopad než tenhle (m/s) hladinu jen zčeří a nekreslí se. */
const NEJMENSI_DOPAD = 1.5;
/** Dopady blíž než tolik metrů a sekund splynou v jedno šplouchnutí. */
const SPLYNUTI_X = 1.2;
const SPLYNUTI_CAS = 0.25;
/** Víc efektů by výkres zahltilo (rozpad velkého mostu); další se už nepřidávají. */
const NEJVIC_EFEKTU = 240;

/**
 * Projde snímky záznamu od pořadí `od` a do `seznam` přidá dopady styčníků na hladinu: styčník,
 * který byl nad hladinou a je pod ní, a padal dost rychle. Kola a těžiště účastníků provozu
 * jsou styčníky taky, takže šplouchne i auto. Vrací pořadí, od kterého pokračovat příště
 * (záznam při výpočtu přibývá).
 */
export function najdiSplouchnuti(zaznam: Zaznam, hladina: number, od: number, seznam: Splouchnuti[]): number {
  const { snimky } = zaznam;
  let i = Math.max(1, od);
  for (; i < snimky.length; i++) {
    const pred = snimky[i - 1]!;
    const po = snimky[i]!;
    // Přes porušení se stavba mění a čísla styčníků by neseděla.
    if (pred.topologie !== po.topologie) continue;
    const dt = po.cas - pred.cas;
    if (!(dt > 0)) continue;
    const pocet = Math.min(pred.polohy.length, po.polohy.length) >> 1;
    for (let s = 0; s < pocet && seznam.length < NEJVIC_EFEKTU; s++) {
      const y0 = pred.polohy[2 * s + 1]!;
      const y1 = po.polohy[2 * s + 1]!;
      if (!(y0 > hladina && y1 <= hladina)) continue;
      const sila = (y0 - y1) / dt;
      if (sila < NEJMENSI_DOPAD) continue;
      const x = po.polohy[2 * s]!;
      const blizko = seznam.find((d) => Math.abs(d.x - x) < SPLYNUTI_X && Math.abs(d.cas - po.cas) < SPLYNUTI_CAS);
      if (blizko) blizko.sila = Math.max(blizko.sila, sila);
      else seznam.push({ cas: po.cas, x, sila });
    }
  }
  return i;
}

/**
 * Z událostí zkoušky od pořadí `od` přidá do `seznam` zlomy prutů (ne plastické klouby: tam se
 * nic neutrhlo). Místo se bere ze záznamu těsně před zlomem. Vrací pořadí, od kterého
 * pokračovat příště; událost, ke které záznam ještě nedošel, počká.
 */
export function najdiZlomy(zaznam: Zaznam, udalosti: readonly Udalost[], od: number, seznam: Zlom[]): number {
  const snimek = prazdnySnimek();
  let i = od;
  for (; i < udalosti.length; i++) {
    const u = udalosti[i]!;
    if (u.druh !== "poruseni" || u.nasledek === NASLEDEK_KLOUB) continue;
    if (zaznam.konec < u.cas) break;
    if (seznam.length >= NEJVIC_EFEKTU) continue;
    const stavba = zaznam.stavV(Math.max(0, u.cas - 1e-3), snimek);
    const kde = stavba ? mistoPrutu(stavba, snimek, u.prut) : null;
    if (kde) seznam.push({ cas: u.cas, x: kde.misto.x, y: kde.misto.y, rozsah: kde.rozsah });
  }
  return i;
}

/** Časy pádu účastníků provozu podle pořadí v seznamu účastníků; kdo nespadl, nemá nic. */
export function casyPadu(
  udalosti: readonly Udalost[],
  ucastnici: readonly { polozka: number; clen: number }[],
): (number | undefined)[] {
  const casy: (number | undefined)[] = new Array<number | undefined>(ucastnici.length).fill(undefined);
  for (const u of udalosti) {
    if (u.druh !== "pad") continue;
    const poradi = ucastnici.findIndex((p) => p.polozka === u.polozka && p.clen === u.clen);
    if (poradi >= 0 && casy[poradi] === undefined) casy[poradi] = u.cas;
  }
  return casy;
}

/**
 * Stálé „náhodné“ číslo od 0 do 1 z pořadí: efekty musí při každém přehrání vypadat stejně,
 * takže se nelosuje, ale počítá (zlatý řez dává rovnoměrně rozhozená čísla).
 */
export function rozhoz(poradi: number, slozka: number): number {
  const x = (poradi + 1) * 0.6180339887498949 + slozka * 0.7548776662466927;
  return x - Math.floor(x);
}
