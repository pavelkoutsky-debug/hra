// Rada po opakovaném nezdaru: když most na téže úrovni neprojde podruhé po sobě stejným
// způsobem (stejný prvek a stejný způsob prvního porušení, stejný důvod složení, kmitání),
// hra sama a viditelně poradí u výsledku. Tady se jen rozhoduje, jestli je to „podruhé
// stejně“ a jestli se rada smí ukázat; text rady skládá obrazovka úrovně ze stávajících rad
// k porušení, ke složení a ke kmitání. Čisté funkce bez prohlížeče.

import { KATALOG, vlastnostiPrutu, type IdPrvku } from "../data/katalog";
import { ZPUSOB_OHYB, ZPUSOB_SMYK, ZPUSOB_TAH, ZPUSOB_TLAK, ZPUSOB_VZPER } from "../jadro/namahani";

/**
 * Druhy nezdaru, ke kterým hra umí poradit. Jsou to i hodnoty `druh` v událostech deníku
 * `rada.ukazana` a `rada.napoveda`; souhrn pro správce jiné nebere.
 */
export const DRUHY_RADY = ["vzper", "tlak", "tah", "ohyb", "smyk", "slozeni-mostovka", "slozeni-ztuzeni", "kmitani", "nedopnuto"] as const;
export type DruhRady = (typeof DRUHY_RADY)[number];

/**
 * Jak zkouška neprošla, tak jak to zná výsledek. `druh` je druh rady, nebo jiný krátký kód
 * příčiny, ke které rada není (mezera v mostovce, pohyblivý most, průhyb, sjetí z podpory):
 * i ten přeruší řadu stejných nezdarů. `prvek` je prvek prutu, který povolil první (jen u
 * porušení); `maRada` říká, jestli k němu hra v této úrovni má co poradit.
 */
export interface Nezdar {
  druh: string;
  prvek: IdPrvku | null;
  maRada: boolean;
}

/** Co si obrazovka úrovně o radách pamatuje během jedné návštěvy úrovně. */
export interface PametRady {
  /** Klíč posledního započteného nezdaru; null po průchodu nebo na začátku. */
  minuly: string | null;
  /** Klíče nezdarů, ke kterým už rada v této návštěvě zazněla (kvůli deníku: poprvé, nebo znovu). */
  ukazane: readonly string[];
  /**
   * Hráč během téže řady nezdarů sám otevřel nápovědu nebo rozbalil podrobnosti výsledku
   * (tam je celá věta s radou): nic se mu nevnucuje navíc. Jiný nezdar nebo průchod řadu končí.
   */
  samHledal: boolean;
  /** Kolikátý stejný nezdar za sebou je ten poslední započtený (1 = první). */
  vRade?: number;
}

export const novaPametRady = (): PametRady => ({ minuly: null, ukazane: [], samHledal: false });

/** Zkouška, jak ji rozhodování potřebuje. `nezdar` je null u mostu, který prošel. */
export interface ZkouskaProRadu {
  /** Brnknutí, budič nebo zkouška do zlomu: nepočítá se vůbec. */
  pokus: boolean;
  /** Zkouška cizího mostu z odkazu: není to hráčova stavba. */
  host: boolean;
  nezdar: Nezdar | null;
}

/**
 * Smí úroveň radit? Havarijní komise záměrně neradí (učí diagnózu) a zkouška kapitoly (x-05)
 * nemá nápovědu ani rady navíc.
 */
export function urovenRadi(uroven: { id: string; zkouskova?: boolean }, havarie: boolean): boolean {
  return !havarie && uroven.zkouskova !== true;
}

const klicNezdaru = (n: Nezdar): string => `${n.druh}/${n.prvek ?? ""}`;

/**
 * Započte dokončenou zkoušku a rozhodne, jestli se má ukázat rada. Vrací novou paměť
 * a nezdar, ke kterému se rada ukáže (null: neukáže se nic).
 *
 * Rada se ukáže, když zkouška neprošla stejně jako ta započtená před ní, k nezdaru je co
 * poradit a hráč v téže řadě nezdarů sám nehledal (nápověda, podrobnosti výsledku). Dokud
 * stejný nezdar trvá, rada zůstává: kdo ji napoprvé nepochopil, nemá potřetí dostat míň než
 * podruhé (nález recenze hraním). Pokusy a cizí mosty se nepočítají a řadu nepřeruší;
 * v úrovni, která neradí, se nic neukáže.
 */
export function rozhodniRadu(pamet: PametRady, zkouska: ZkouskaProRadu, radi: boolean): { pamet: PametRady; ukazat: Nezdar | null; vRade: number } {
  if (zkouska.pokus || zkouska.host || !radi) return { pamet, ukazat: null, vRade: 0 };
  const n = zkouska.nezdar;
  if (n === null) return { pamet: { ...pamet, minuly: null, samHledal: false, vRade: 0 }, ukazat: null, vRade: 0 };
  const klic = klicNezdaru(n);
  const stejny = pamet.minuly === klic;
  const samHledal = stejny && pamet.samHledal;
  const ukazat = stejny && n.maRada && !samHledal;
  const vRade = stejny ? (pamet.vRade ?? 1) + 1 : 1;
  return {
    pamet: { minuly: klic, ukazane: ukazat && !pamet.ukazane.includes(klic) ? [...pamet.ukazane, klic] : pamet.ukazane, samHledal, vRade },
    ukazat: ukazat ? n : null,
    vRade,
  };
}

/**
 * Rada byla rozhodnutá, ale hráč výsledek neviděl (zkoušku zastavil dřív, než se ukázal):
 * jako by nezazněla, takže smí přijít při dalším stejném nezdaru.
 */
export function vratRadu(pamet: PametRady, nezdar: Nezdar): PametRady {
  const klic = klicNezdaru(nezdar);
  return pamet.ukazane.includes(klic) ? { ...pamet, ukazane: pamet.ukazane.filter((k) => k !== klic) } : pamet;
}

/** Hráč sám otevřel nápovědu nebo rozbalil podrobnosti výsledku. */
export function samHledal(pamet: PametRady): PametRady {
  return pamet.samHledal ? pamet : { ...pamet, samHledal: true };
}

/** Kód způsobu porušení, jak ho zná deník a rada. */
export function druhPoruseni(zpusob: number): "vzper" | "tlak" | "tah" | "ohyb" | "smyk" {
  if (zpusob === ZPUSOB_TAH) return "tah";
  if (zpusob === ZPUSOB_TLAK) return "tlak";
  if (zpusob === ZPUSOB_OHYB) return "ohyb";
  if (zpusob === ZPUSOB_SMYK) return "smyk";
  return "vzper";
}

/**
 * Dovoluje úroveň silnější prvek téhož druhu, než je `prvek`, na daný způsob porušení?
 * Rada „dej silnější prvek“ smí zaznít jen tam, kde nějaký je (1-02 má jen lehké dřevo).
 * Vzpěr se porovnává ohybovou tuhostí (únosnost ve vzpěru jí roste), ostatní únosností.
 */
export function maSilnejsiPrvek(prvek: IdPrvku, zpusob: number, povolene: readonly IdPrvku[]): boolean {
  const druh = KATALOG[prvek].druh;
  const mira = (id: IdPrvku): number | null => {
    const v = vlastnostiPrutu(id, 1);
    if (!v) return null;
    if (zpusob === ZPUSOB_VZPER) return v.EI;
    if (zpusob === ZPUSOB_TAH) return v.unosnost.tah;
    if (zpusob === ZPUSOB_TLAK) return v.unosnost.tlak;
    if (zpusob === ZPUSOB_OHYB) return v.unosnost.moment;
    return v.unosnost.smyk;
  };
  const tento = mira(prvek);
  if (tento === null) return false;
  return povolene.some((id) => {
    if (id === prvek || KATALOG[id].druh !== druh) return false;
    const jiny = mira(id);
    return jiny !== null && jiny > tento;
  });
}
