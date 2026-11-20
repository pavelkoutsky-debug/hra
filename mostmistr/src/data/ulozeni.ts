// Uložený postup hráče: rozpracované návrhy mostů a rekordy úrovní.
// Formát má číslo verze a řetěz převodů jako úroveň a návrh. Kam se ukládá (paměť
// prohlížeče, soubor), řeší vrstva nad tím; tady je jen tvar dat a jeho kontrola.

import { ChybaDat, cislo, jenZnameKlice, logicka, neboNull, objekt } from "./kontrola";
import { nactiNavrh, type NavrhMostu } from "./navrh";
import { prevedNaAktualni, type Prevod } from "./prevody";

export const VERZE_ULOZENI = 1;

/** Převody ze starších verzí formátu uložení; viz `prevedNaAktualni`. */
const PREVODY_ULOZENI: readonly Prevod[] = [];

/** Tři nezávislé medaile úrovně (koncepce, kap. 4). */
export interface Medaile {
  pruchod: boolean;
  rozpocet: boolean;
  mistrovska: boolean;
}

export const BEZ_MEDAILI: Readonly<Medaile> = { pruchod: false, rozpocet: false, mistrovska: false };

/** Co hráč v úrovni dokázal. Medaile se sčítají přes pokusy: každou lze získat jiným mostem. */
export interface Rekord {
  /** Verze fyziky, se kterou byl rekord naposledy vylepšen. */
  verzeFyziky: number;
  medaile: Medaile;
  /** Nejnižší cena mostu, který zkouškou prošel, v korunách; null, dokud žádný neprošel. */
  nejlepsiCena: number | null;
}

export interface Ulozeni {
  verze: typeof VERZE_ULOZENI;
  /** Rozpracovaný návrh každé úrovně, podle jejího id. */
  navrhy: Record<string, NavrhMostu>;
  rekordy: Record<string, Rekord>;
}

export function prazdneUlozeni(): Ulozeni {
  return { verze: VERZE_ULOZENI, navrhy: {}, rekordy: {} };
}

function medaile(h: unknown, cesta: string): Medaile {
  const o = objekt(h, cesta);
  jenZnameKlice(o, cesta, ["pruchod", "rozpocet", "mistrovska"]);
  return {
    pruchod: logicka(o.pruchod, `${cesta}.pruchod`),
    rozpocet: logicka(o.rozpocet, `${cesta}.rozpocet`),
    mistrovska: logicka(o.mistrovska, `${cesta}.mistrovska`),
  };
}

function rekord(h: unknown, cesta: string): Rekord {
  const o = objekt(h, cesta);
  jenZnameKlice(o, cesta, ["verzeFyziky", "medaile", "nejlepsiCena"]);
  return {
    verzeFyziky: cislo(o.verzeFyziky, `${cesta}.verzeFyziky`, { min: 0, cele: true }),
    medaile: medaile(o.medaile, `${cesta}.medaile`),
    nejlepsiCena: neboNull(o.nejlepsiCena, (v) => cislo(v, `${cesta}.nejlepsiCena`, { min: 0 })),
  };
}

/** Přečte uložení z dat neznámého tvaru. Při chybě vyhodí `ChybaDat` s cestou k místu chyby. */
export function nactiUlozeni(data: unknown): Ulozeni {
  const c = "ulozeni";
  const o = prevedNaAktualni(data, VERZE_ULOZENI, PREVODY_ULOZENI, c);
  jenZnameKlice(o, c, ["verze", "navrhy", "rekordy"]);
  const ulozeni = prazdneUlozeni();
  for (const [id, navrh] of Object.entries(objekt(o.navrhy, `${c}.navrhy`))) {
    const nacteny = nactiNavrh(navrh);
    if (nacteny.uroven !== id) throw new ChybaDat(`${c}.navrhy.${id}`, "návrh patří k jiné úrovni");
    ulozeni.navrhy[id] = nacteny;
  }
  for (const [id, zaznam] of Object.entries(objekt(o.rekordy, `${c}.rekordy`))) {
    ulozeni.rekordy[id] = rekord(zaznam, `${c}.rekordy.${id}`);
  }
  return ulozeni;
}

export function ulozeniNaText(ulozeni: Ulozeni): string {
  return JSON.stringify(ulozeni);
}

export function ulozeniZTextu(zapis: string): Ulozeni {
  let data: unknown;
  try {
    data = JSON.parse(zapis);
  } catch {
    throw new ChybaDat("ulozeni", "text není platný zápis uloženého postupu");
  }
  return nactiUlozeni(data);
}

/**
 * Započítá výsledek zkoušky do rekordu úrovně a vrátí nový rekord. Medaile se nikdy
 * neodebírají a cena se jen snižuje.
 */
export function vylepsiRekord(
  dosavadni: Rekord | undefined,
  ziskane: Medaile,
  cena: number,
  verzeFyziky: number,
): Rekord {
  const stare = dosavadni?.medaile ?? BEZ_MEDAILI;
  const nove: Medaile = {
    pruchod: stare.pruchod || ziskane.pruchod,
    rozpocet: stare.rozpocet || ziskane.rozpocet,
    mistrovska: stare.mistrovska || ziskane.mistrovska,
  };
  const dosavadniCena = dosavadni?.nejlepsiCena ?? null;
  const nejlepsiCena = ziskane.pruchod && (dosavadniCena === null || cena < dosavadniCena) ? cena : dosavadniCena;
  const zmena =
    nove.pruchod !== stare.pruchod ||
    nove.rozpocet !== stare.rozpocet ||
    nove.mistrovska !== stare.mistrovska ||
    nejlepsiCena !== dosavadniCena;
  return {
    verzeFyziky: zmena || !dosavadni ? verzeFyziky : dosavadni.verzeFyziky,
    medaile: nove,
    nejlepsiCena,
  };
}
