// Záznam průběhu simulace: stavba konstrukce a řada snímků v čase.
// Simulace běží napřed v pracovním vlákně a plní záznam; hra z něj přehrává libovolný
// okamžik, takže jde zpomalovat, vracet se a skákat po časové ose.
//
// Stavba se během zkoušky mění jen porušením. Každá změna přidá do záznamu novou stavbu
// a snímky si pamatují, ke které patří.

import { LANO, PRUZINA, type Soustava } from "../jadro/soustava";
import type { Bod } from "../data/geometrie";

/** Stavba konstrukce mezi dvěma porušeními. */
export interface Topologie {
  stycniku: number;
  prvekA: Int32Array;
  prvekB: Int32Array;
  /** Číslo prutu, ke kterému prvek patří (ve zkoušce pořadí prutu v návrhu); −1, když k žádnému. */
  prut: Int32Array;
  /** Druh čáry prvku; viz konstanty CARA_*. */
  cara: Uint8Array;
  /** Bit 0: kloub na konci a, bit 1: kloub na konci b. */
  klouby: Uint8Array;
  /** Bit 0: zadržený posun x, bit 1: posun y, bit 2: natočení. */
  podpory: Uint8Array;
  /** Jak se styčník kreslí; viz konstanty STYCNIK_*. */
  znacky: Uint8Array;
}

export const CARA_PRUT = 0;
export const CARA_LANO = 1;
export const CARA_MOSTOVKA = 2;
export const CARA_PRUZINA = 3;
/** Prvek, který se nekreslí: pérování vozidla. */
export const CARA_SKRYTA = 4;
/** Viskózní tlumič: prut bez tuhosti, jen s tlumením. */
export const CARA_TLUMIC = 5;
/** Píst pohyblivého mostu: válec s pístnicí. */
export const CARA_PIST = 6;

export const STYCNIK_BEZNY = 0;
/** Styčník, který se nekreslí: patří břemenu a kreslí se jako kolo. */
export const STYCNIK_SKRYTY = 1;
export const STYCNIK_ZAVAZI = 2;

/** Stav konstrukce v jednom okamžiku. */
export interface Snimek {
  /** Čas děje v sekundách. */
  cas: number;
  /** Pořadové číslo stavby, ke které snímek patří. */
  topologie: number;
  /** Polohy styčníků: x0, y0, x1, y1, … */
  polohy: Float32Array;
  /** Využití každého prvku; kladné je tah, záporné tlak, 1 je mez únosnosti. */
  vyuziti: Float32Array;
  /** Středy kol: x0, y0, x1, y1, … */
  kola: Float32Array;
  /** Vnější síly k zakreslení: působiště a složky, x0, y0, Fx0, Fy0, … (m, N). */
  sily: Float32Array;
  /** Stav každého účastníka provozu (čeká, jede, přejel, spadl). */
  provoz: Uint8Array;
  /** Okamžité zrychlení mostovky v m/s², jak ho měří hodnocení komfortu; 0, když se neměří. */
  kmitani: number;
  /**
   * Plastické klouby: dvojice (styčník, vyčerpaný podíl mezního natočení od 0 do 1). Kloub je
   * místo, kde se tvárný prut trvale ohnul; při podílu 1 se zlomí.
   */
  klouby: Float32Array;
}

/** Od jakého podílu mezního natočení se plastický kloub ukazuje. */
const PRAH_KLOUBU = 0.01;

/** Plastické klouby soustavy pro záznam; ve styčníku s několika ohnutými pruty rozhoduje ten nejhorší. */
export function plastickeKlouby(s: Soustava): Float32Array {
  let podily: Map<number, number> | null = null;
  for (let e = 0; e < s.pocetPrvku; e++) {
    const mez = s.mezniNatoceni[e]!;
    if (!(mez > 0) || !(mez < Infinity)) continue;
    for (const [natoceni, stycnik] of [
      [s.plastA[e]!, s.prvekA[e]!],
      [s.plastB[e]!, s.prvekB[e]!],
    ] as const) {
      const podil = Math.min(1, Math.abs(natoceni) / mez);
      if (!(podil > PRAH_KLOUBU)) continue;
      podily ??= new Map();
      if (podil > (podily.get(stycnik) ?? 0)) podily.set(stycnik, podil);
    }
  }
  if (!podily) return BEZ_KLOUBU;
  const klouby = new Float32Array(2 * podily.size);
  let i = 0;
  for (const [stycnik, podil] of podily) {
    klouby[i++] = stycnik;
    klouby[i++] = podil;
  }
  return klouby;
}

const BEZ_KLOUBU = new Float32Array(0);

/** Porušení prutu, jak ho ukazuje časová osa. */
export interface UdalostZaznamu {
  cas: number;
  /** Číslo prutu. */
  prut: number;
  /** Způsob namáhání, kterým prut selhal (konstanty ZPUSOB_* jádra). */
  zpusob: number;
  /** Co se s prutem stalo (konstanty NASLEDEK_* jádra). */
  nasledek: number;
}

export interface PopisKresleni {
  /** Čísla prutů, po kterých se jezdí. */
  mostovka?: Iterable<number>;
  /** Styčníky břemen, které se kreslí jako kola. */
  skryte?: Iterable<number>;
  /** Styčníky kreslené jako závaží. */
  zavazi?: Iterable<number>;
  /** Čísla prutů, které jsou písty. */
  pisty?: Iterable<number>;
}

/** Popíše okamžitou stavbu soustavy pro kreslení. */
export function topologieSoustavy(s: Soustava, popis: PopisKresleni = {}): Topologie {
  const mostovka = new Set(popis.mostovka ?? []);
  const pisty = new Set(popis.pisty ?? []);
  const cara = new Uint8Array(s.pocetPrvku);
  const klouby = new Uint8Array(s.pocetPrvku);
  for (let e = 0; e < s.pocetPrvku; e++) {
    if (s.druh[e] === LANO) cara[e] = CARA_LANO;
    else if (s.druh[e] === PRUZINA && pisty.has(s.prut[e]!)) cara[e] = CARA_PIST;
    else if (s.druh[e] === PRUZINA) cara[e] = s.EA[e] === 0 && s.tlumic[e] !== 0 ? CARA_TLUMIC : CARA_PRUZINA;
    else if (mostovka.has(s.prut[e]!)) cara[e] = CARA_MOSTOVKA;
    // Kloubový konec se pozná podle toho, že k němu prvek nemá ohybovou tuhost.
    const bezA = s.kAA[e] === 0;
    const bezB = s.kBB[e] === 0;
    klouby[e] = (bezA ? 1 : 0) | (bezB ? 2 : 0);
  }
  const znacky = new Uint8Array(s.pocetStycniku);
  for (const i of popis.skryte ?? []) znacky[i] = STYCNIK_SKRYTY;
  for (const i of popis.zavazi ?? []) znacky[i] = STYCNIK_ZAVAZI;
  // Styčník, do kterého po porušení nevede žádný prut a nic neváží, se nekreslí.
  const pripojeny = new Uint8Array(s.pocetStycniku);
  for (let e = 0; e < s.pocetPrvku; e++) {
    pripojeny[s.prvekA[e]!] = 1;
    pripojeny[s.prvekB[e]!] = 1;
  }
  for (let i = 0; i < s.pocetStycniku; i++) {
    if (pripojeny[i] === 0 && !(s.hmota[i]! > 0) && (s.podpora[i]! & 3) === 0) znacky[i] = STYCNIK_SKRYTY;
  }
  // Prvek mezi dvěma skrytými styčníky patří účastníkovi provozu (pérování).
  for (let e = 0; e < s.pocetPrvku; e++) {
    if (znacky[s.prvekA[e]!] === STYCNIK_SKRYTY && znacky[s.prvekB[e]!] === STYCNIK_SKRYTY) cara[e] = CARA_SKRYTA;
  }
  const podpory = new Uint8Array(s.pocetStycniku);
  for (let i = 0; i < s.pocetStycniku; i++) {
    if (znacky[i] !== STYCNIK_BEZNY) continue; // vedení břemen a závaží není podpora mostu
    // Natočení se počítá jako zadržené jen tam, kde do styčníku vede tuhý konec prutu.
    const vetknuto = (s.podpora[i]! & 4) !== 0 && s.setrvacnost[i]! > 0;
    podpory[i] = (s.podpora[i]! & 3) | (vetknuto ? 4 : 0);
  }
  return {
    stycniku: s.pocetStycniku,
    prvekA: s.prvekA.slice(0, s.pocetPrvku),
    prvekB: s.prvekB.slice(0, s.pocetPrvku),
    prut: s.prut.slice(0, s.pocetPrvku),
    cara,
    klouby,
    podpory,
    znacky,
  };
}

/** Řada snímků seřazená podle času, s dotazem na stav v libovolném okamžiku. */
export class Zaznam {
  readonly topologie: Topologie[] = [];
  readonly snimky: Snimek[] = [];
  readonly udalosti: UdalostZaznamu[] = [];

  pridejTopologii(topologie: Topologie): void {
    this.topologie.push(topologie);
  }

  pridej(snimek: Snimek): void {
    this.snimky.push(snimek);
  }

  /** Čas posledního snímku; 0, dokud žádný není. */
  get konec(): number {
    return this.snimky.length === 0 ? 0 : this.snimky[this.snimky.length - 1]!.cas;
  }

  /**
   * Stav v čase `cas`: lineární proložení dvou sousedních snímků, zapsané do `cil`.
   * Mimo zaznamenaný rozsah vrací krajní snímek. Přes okamžik porušení se neprokládá:
   * snímky před ním a po něm mají jinou stavbu. Vrací stavbu, ke které stav patří,
   * nebo null, dokud je záznam prázdný.
   */
  stavV(cas: number, cil: Snimek): Topologie | null {
    const { snimky } = this;
    if (snimky.length === 0) return null;

    // Půlením najít poslední snímek, jehož čas není větší než hledaný.
    let dolni = 0;
    let horni = snimky.length - 1;
    while (dolni < horni) {
      const stred = (dolni + horni + 1) >> 1;
      if (snimky[stred]!.cas <= cas) dolni = stred;
      else horni = stred - 1;
    }
    const a = snimky[dolni]!;
    let b = snimky[Math.min(dolni + 1, snimky.length - 1)]!;
    if (b.topologie !== a.topologie) b = a;
    const rozdil = b.cas - a.cas;
    const t = rozdil > 0 ? Math.min(1, Math.max(0, (cas - a.cas) / rozdil)) : 0;

    cil.cas = a.cas + t * rozdil;
    cil.topologie = a.topologie;
    cil.polohy = prolozit(a.polohy, b.polohy, t, cil.polohy);
    cil.vyuziti = prolozit(a.vyuziti, b.vyuziti, t, cil.vyuziti);
    cil.kola = prolozit(a.kola, b.kola, t, cil.kola);
    cil.sily = prolozit(a.sily, b.sily, t, cil.sily);
    cil.provoz = a.provoz;
    cil.kmitani = a.kmitani + (b.kmitani - a.kmitani) * t;
    cil.klouby = a.klouby;
    return this.topologie[a.topologie] ?? null;
  }
}

/** Proloží dvě stejně dlouhá pole do `cil`; když se velikost nehodí, vrátí nové pole. */
function prolozit(a: Float32Array, b: Float32Array, t: number, cil: Float32Array): Float32Array {
  const n = a.length;
  const vysledek = cil.length === n ? cil : new Float32Array(n);
  for (let i = 0; i < n; i++) vysledek[i] = a[i]! + (b[i]! - a[i]!) * t;
  return vysledek;
}

/** Prázdný snímek, do kterého `Zaznam.stavV` zapisuje; pole si podle potřeby zvětší sám. */
export function prazdnySnimek(): Snimek {
  return {
    cas: 0,
    topologie: 0,
    polohy: new Float32Array(0),
    vyuziti: new Float32Array(0),
    kola: new Float32Array(0),
    sily: new Float32Array(0),
    provoz: new Uint8Array(0),
    kmitani: 0,
    klouby: BEZ_KLOUBU,
  };
}

/** Kde leží prut návrhu ve snímku: střed a délka (od jednoho konce prutu k druhému). */
export function mistoPrutu(topologie: Topologie, snimek: Snimek, prut: number): { misto: Bod; rozsah: number } | null {
  let xMin = Infinity;
  let xMax = -Infinity;
  let yMin = Infinity;
  let yMax = -Infinity;
  for (let e = 0; e < topologie.prut.length; e++) {
    if (topologie.prut[e] !== prut) continue;
    for (const stycnik of [topologie.prvekA[e]!, topologie.prvekB[e]!]) {
      const x = snimek.polohy[2 * stycnik];
      const y = snimek.polohy[2 * stycnik + 1];
      if (x === undefined || y === undefined) continue;
      if (x < xMin) xMin = x;
      if (x > xMax) xMax = x;
      if (y < yMin) yMin = y;
      if (y > yMax) yMax = y;
    }
  }
  if (!(xMax >= xMin)) return null;
  const dx = xMax - xMin;
  const dy = yMax - yMin;
  return { misto: { x: (xMin + xMax) / 2, y: (yMin + yMax) / 2 }, rozsah: Math.sqrt(dx * dx + dy * dy) };
}
