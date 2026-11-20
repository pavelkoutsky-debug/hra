// Záznam průběhu simulace: neměnná stavba konstrukce a řada snímků v čase.
// Simulace běží napřed v pracovním vlákně a plní záznam; hra z něj přehrává libovolný
// okamžik, takže jde zpomalovat, vracet se a skákat po časové ose.

import { LANO, type Soustava } from "../jadro/soustava";

/** Stavba konstrukce, která se během zkoušky nemění. */
export interface Topologie {
  stycniku: number;
  prvekA: Int32Array;
  prvekB: Int32Array;
  /** Druh čáry prvku: 0 prut, 1 lano, 2 mostovka. */
  cara: Uint8Array;
  /** Bit 0: kloub na konci a, bit 1: kloub na konci b. */
  klouby: Uint8Array;
  /** Bit 0: zadržený posun x, bit 1: posun y, bit 2: natočení. */
  podpory: Uint8Array;
}

export const CARA_PRUT = 0;
export const CARA_LANO = 1;
export const CARA_MOSTOVKA = 2;

/** Stav konstrukce v jednom okamžiku. */
export interface Snimek {
  /** Čas děje v sekundách. */
  cas: number;
  /** Polohy styčníků: x0, y0, x1, y1, … */
  polohy: Float32Array;
  /** Využití každého prvku; kladné je tah, záporné tlak, 1 je mez únosnosti. */
  vyuziti: Float32Array;
  /** Středy kol: x0, y0, x1, y1, … */
  kola: Float32Array;
}

/** Popíše stavbu soustavy pro kreslení. `mostovka` jsou indexy prvků, po kterých se jezdí. */
export function topologieSoustavy(s: Soustava, mostovka: Iterable<number> = []): Topologie {
  const cara = new Uint8Array(s.pocetPrvku);
  const klouby = new Uint8Array(s.pocetPrvku);
  for (let e = 0; e < s.pocetPrvku; e++) {
    if (s.druh[e] === LANO) cara[e] = CARA_LANO;
    // Kloubový konec se pozná podle toho, že k němu prvek nemá ohybovou tuhost.
    const bezA = s.kAA[e] === 0;
    const bezB = s.kBB[e] === 0;
    klouby[e] = (bezA ? 1 : 0) | (bezB ? 2 : 0);
  }
  for (const e of mostovka) cara[e] = CARA_MOSTOVKA;
  const podpory = new Uint8Array(s.pocetStycniku);
  for (let i = 0; i < s.pocetStycniku; i++) {
    // Natočení se počítá jako zadržené jen tam, kde do styčníku vede tuhý konec prutu.
    const vetknuto = s.invSetrvacnost[i] === 0 && s.setrvacnost[i]! > 0;
    podpory[i] = (s.invHmotaX[i] === 0 ? 1 : 0) | (s.invHmotaY[i] === 0 ? 2 : 0) | (vetknuto ? 4 : 0);
  }
  return {
    stycniku: s.pocetStycniku,
    prvekA: s.prvekA.slice(),
    prvekB: s.prvekB.slice(),
    cara,
    klouby,
    podpory,
  };
}

/** Řada snímků seřazená podle času, s dotazem na stav v libovolném okamžiku. */
export class Zaznam {
  readonly snimky: Snimek[] = [];

  pridej(snimek: Snimek): void {
    this.snimky.push(snimek);
  }

  /** Čas posledního snímku; 0, dokud žádný není. */
  get konec(): number {
    return this.snimky.length === 0 ? 0 : this.snimky[this.snimky.length - 1]!.cas;
  }

  /**
   * Stav v čase `cas`: lineární proložení dvou sousedních snímků, zapsané do `cil`.
   * Mimo zaznamenaný rozsah vrací krajní snímek. Vrací false, dokud je záznam prázdný.
   */
  stavV(cas: number, cil: Snimek): boolean {
    const { snimky } = this;
    if (snimky.length === 0) return false;

    // Půlením najít poslední snímek, jehož čas není větší než hledaný.
    let dolni = 0;
    let horni = snimky.length - 1;
    while (dolni < horni) {
      const stred = (dolni + horni + 1) >> 1;
      if (snimky[stred]!.cas <= cas) dolni = stred;
      else horni = stred - 1;
    }
    const a = snimky[dolni]!;
    const b = snimky[Math.min(dolni + 1, snimky.length - 1)]!;
    const rozdil = b.cas - a.cas;
    const t = rozdil > 0 ? Math.min(1, Math.max(0, (cas - a.cas) / rozdil)) : 0;

    cil.cas = a.cas + t * rozdil;
    prolozit(a.polohy, b.polohy, t, cil.polohy);
    prolozit(a.vyuziti, b.vyuziti, t, cil.vyuziti);
    prolozit(a.kola, b.kola, t, cil.kola);
    return true;
  }
}

function prolozit(a: Float32Array, b: Float32Array, t: number, cil: Float32Array): void {
  const n = Math.min(a.length, b.length, cil.length);
  for (let i = 0; i < n; i++) cil[i] = a[i]! + (b[i]! - a[i]!) * t;
}

/** Prázdný snímek správné velikosti, do kterého `Zaznam.stavV` zapisuje. */
export function prazdnySnimek(stycniku: number, prvku: number, kol: number): Snimek {
  return {
    cas: 0,
    polohy: new Float32Array(2 * stycniku),
    vyuziti: new Float32Array(prvku),
    kola: new Float32Array(2 * kol),
  };
}
