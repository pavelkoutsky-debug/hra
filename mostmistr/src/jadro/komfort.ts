// Měření kmitání mostovky pro hodnocení komfortu chodců (koncepce, kap. 7.7).
//
// V každém měřeném styčníku se ze změny svislé rychlosti počítá zrychlení, propustí se
// pásmem 0,5 až 10 Hz (pomalejší pohyb člověk nevnímá jako kmitání, rychlejší utlumí tělo)
// a jeho čtverec se průměruje přes zhruba jednu sekundu, aby o výsledku nerozhodl jediný
// náraz. Výsledkem je √2 násobek efektivní hodnoty: u ustáleného kmitání je to jeho
// amplituda, tedy veličina, ke které se vztahují třídy komfortu.
//
// Počítá se jen sčítáním, násobením, dělením a odmocninou, aby výsledek vyšel ve všech
// prohlížečích stejně.

import type { Soustava } from "./soustava";

/** Časové konstanty filtrů v sekundách: 1/(2π·10 Hz), 1/(2π·0,5 Hz) a okno průměrování. */
const RC_DOLNI_PROPUST = 1 / (2 * Math.PI * 10);
const RC_HORNI_PROPUST = 1 / (2 * Math.PI * 0.5);
const OKNO_PRUMERU = 1;

/** Meze tříd komfortu v m/s²: do první výborný, do druhé střední, do třetí nízký, nad ní nepřijatelný. */
export const MEZE_KOMFORTU = [0.5, 1, 2.5] as const;
export type TridaKomfortu = 1 | 2 | 3 | 4;
/**
 * Svislé zrychlení ve voze, do kterého evropská norma pro železniční mosty mluví o velmi
 * dobrém pohodlí cestujících, m/s².
 */
export const MEZ_POHODLI_VE_VOZE = 1;

/** Třída komfortu pro dané zrychlení: 1 výborný až 4 nepřijatelný. */
export function tridaKomfortu(zrychleni: number): TridaKomfortu {
  if (zrychleni <= MEZE_KOMFORTU[0]) return 1;
  if (zrychleni <= MEZE_KOMFORTU[1]) return 2;
  if (zrychleni <= MEZE_KOMFORTU[2]) return 3;
  return 4;
}

export interface MereniKomfortu {
  /** Měřené styčníky (mostovka). */
  stycniky: Int32Array;
  rychlost: Float64Array;
  /** Výstup dolní propusti, její minulý výstup a výstup horní propusti. */
  dolni: Float64Array;
  dolniMinula: Float64Array;
  horni: Float64Array;
  /** Průměr čtverce zrychlení v pásmu. */
  ctverec: Float64Array;
  /** Největší naměřené zrychlení v m/s², kdy nastalo a ve kterém styčníku. */
  nejvetsi: number;
  cas: number;
  stycnik: number;
  /** Okamžitá hodnota: největší zrychlení přes měřené styčníky v posledním kroku. */
  okamzite: number;
  /** Mez v m/s², jejíž první překročení se zaznamená, a kdy k němu došlo (−1, dokud ne). */
  mez: number;
  prekroceni: number;
}

/**
 * Připraví měření ve styčnících `stycniky`; výchozí stav je klid. `mez` je zrychlení, jehož
 * první započítané překročení si měření zapamatuje (kdy přestal být most pro lidi přijatelný).
 */
export function vytvorMereniKomfortu(s: Soustava, stycniky: Iterable<number>, mez = Infinity): MereniKomfortu {
  const seznam = Int32Array.from(stycniky);
  const n = seznam.length;
  const m: MereniKomfortu = {
    stycniky: seznam,
    rychlost: new Float64Array(n),
    dolni: new Float64Array(n),
    dolniMinula: new Float64Array(n),
    horni: new Float64Array(n),
    ctverec: new Float64Array(n),
    nejvetsi: 0,
    cas: 0,
    stycnik: -1,
    okamzite: 0,
    mez,
    prekroceni: -1,
  };
  for (let k = 0; k < n; k++) m.rychlost[k] = s.vy[seznam[k]!]!;
  return m;
}

/**
 * Zpracuje jeden krok simulace délky `dt`, který skončil v čase `cas`. Filtry běží pořád;
 * do největší hodnoty se měření započítá, jen když je `pocitat` (na mostě jsou lidé).
 */
export function zmerKomfort(s: Soustava, m: MereniKomfortu, dt: number, cas: number, pocitat: boolean): void {
  const dolniVaha = dt / (RC_DOLNI_PROPUST + dt);
  const horniVaha = RC_HORNI_PROPUST / (RC_HORNI_PROPUST + dt);
  const vahaPrumeru = dt / (OKNO_PRUMERU + dt);
  let okamzite = 0;
  let kde = -1;
  for (let k = 0; k < m.stycniky.length; k++) {
    const i = m.stycniky[k]!;
    const v = s.vy[i]!;
    const zrychleni = (v - m.rychlost[k]!) / dt;
    m.rychlost[k] = v;
    const dolni = m.dolni[k]! + dolniVaha * (zrychleni - m.dolni[k]!);
    const horni = horniVaha * (m.horni[k]! + dolni - m.dolniMinula[k]!);
    m.dolni[k] = dolni;
    m.dolniMinula[k] = dolni;
    m.horni[k] = horni;
    const ctverec = m.ctverec[k]! + vahaPrumeru * (horni * horni - m.ctverec[k]!);
    m.ctverec[k] = ctverec;
    if (ctverec > okamzite) {
      okamzite = ctverec;
      kde = i;
    }
  }
  const hodnota = Math.sqrt(2 * okamzite);
  m.okamzite = hodnota;
  if (pocitat && hodnota > m.nejvetsi) {
    m.nejvetsi = hodnota;
    m.cas = cas;
    m.stycnik = kde;
    if (m.prekroceni < 0 && hodnota > m.mez) m.prekroceni = cas;
  }
}
