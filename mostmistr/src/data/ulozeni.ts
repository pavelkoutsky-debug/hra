// Uložený postup hráče: rozpracované návrhy mostů a rekordy úrovní.
// Formát má číslo verze a řetěz převodů jako úroveň a návrh. Kam se ukládá (paměť
// prohlížeče, soubor), řeší vrstva nad tím; tady je jen tvar dat a jeho kontrola.

import { ChybaDat, cislo, jenZnameKlice, logicka, neboNull, objekt } from "./kontrola";
import { nactiNavrh, type NavrhMostu } from "./navrh";
import { prevedNaAktualni, type Prevod } from "./prevody";

export const VERZE_ULOZENI = 4;
/**
 * Od které verze formátu platí rekordy pro dnešní úrovně: v M12 se změnila pravidla medailí
 * a všech 28 úrovní (provoz, rozpočty, zóny), takže starší rekordy výzev jsou z jiné hry.
 */
export const VERZE_ULOZENI_M12 = 4;
/** Verze fyziky, se kterou se měřily všechny rekordy zkoušky do zlomu uložené ve formátu 2. */
const FYZIKA_ZLOMU_VE_FORMATU_2 = 7;

/** Převody ze starších verzí formátu uložení; viz `prevedNaAktualni`. */
const PREVODY_ULOZENI: readonly Prevod[] = [
  // 1 → 2: výzvy o efektivitu. Rekord si nově pamatuje i nejlehčí most a největší únosnost
  // na korunu; starší rekordy je nemají.
  (stare) => {
    const rekordy: Record<string, unknown> = {};
    for (const [id, zaznam] of Object.entries(objekt(stare.rekordy ?? {}, "ulozeni.rekordy"))) {
      rekordy[id] = { ...objekt(zaznam, `ulozeni.rekordy.${id}`), nejlepsiHmotnost: null, nejlepsiZlom: null };
    }
    return { ...stare, rekordy };
  },
  // 2 → 3: rekord zkoušky do zlomu si pamatuje, se kterou verzí fyziky byl změřen. Únosnost je
  // výsledek výpočtu: po změně fyziky by starý rekord držel stupeň, na který už nejde dosáhnout.
  (stare) => {
    const rekordy: Record<string, unknown> = {};
    for (const [id, zaznam] of Object.entries(objekt(stare.rekordy ?? {}, "ulozeni.rekordy"))) {
      const o = objekt(zaznam, `ulozeni.rekordy.${id}`);
      rekordy[id] = { ...o, verzeZlomu: o.nejlepsiZlom === null || o.nejlepsiZlom === undefined ? null : FYZIKA_ZLOMU_VE_FORMATU_2 };
    }
    return { ...stare, rekordy };
  },
  // 3 → 4 (M12): medaile jdou po schodech a všechny úrovně jsou přeladěné. Průchod a rozpočtová
  // hráči zůstávají; mistrovská jen tam, kde má i rozpočtovou (dřív šla získat drahým mostem
  // a pravidla i texty teď říkají „rozpočtová a k ní…“). Rekordy výzev se měří znovu: starý
  // most stál na jiném provozu, někdy i v jiném údolí, a jeho cena by držela zlato, na které
  // dnes dosáhnout nejde (1-01: 23 000 Kč proti dnešním nejméně 31 095 Kč).
  (stare) => {
    const rekordy: Record<string, unknown> = {};
    for (const [id, zaznam] of Object.entries(objekt(stare.rekordy ?? {}, "ulozeni.rekordy"))) {
      const o = objekt(zaznam, `ulozeni.rekordy.${id}`);
      const m = objekt(o.medaile ?? {}, `ulozeni.rekordy.${id}.medaile`);
      rekordy[id] = {
        ...o,
        medaile: { ...m, mistrovska: m.mistrovska === true && m.rozpocet === true },
        nejlepsiCena: null,
        nejlepsiHmotnost: null,
        nejlepsiZlom: null,
        verzeZlomu: null,
      };
    }
    return { ...stare, rekordy };
  },
];

/** Tři medaile úrovně, každá vyšší stojí na nižší: průchod, rozpočtová, mistrovská (koncepce, kap. 4). */
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
  /** Nejmenší hmotnost mostu, který zkouškou prošel, v kg; null, dokud žádný neprošel. */
  nejlepsiHmotnost: number | null;
  /** Největší únosnost na korunu ze zkoušky do zlomu, N/Kč; null, dokud ji hráč nezkusil. */
  nejlepsiZlom: number | null;
  /** Verze fyziky, se kterou byl `nejlepsiZlom` změřen; null, dokud změřen nebyl. Viz `platnyZlom`. */
  verzeZlomu: number | null;
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
  jenZnameKlice(o, cesta, ["verzeFyziky", "medaile", "nejlepsiCena", "nejlepsiHmotnost", "nejlepsiZlom", "verzeZlomu"]);
  return {
    verzeFyziky: cislo(o.verzeFyziky, `${cesta}.verzeFyziky`, { min: 0, cele: true }),
    medaile: medaile(o.medaile, `${cesta}.medaile`),
    nejlepsiCena: neboNull(o.nejlepsiCena, (v) => cislo(v, `${cesta}.nejlepsiCena`, { min: 0 })),
    // Rekordy výzev smějí v zápisu chybět (ruční úprava, starší sestavení): čtou se jako nezměřené.
    nejlepsiHmotnost: neboNull(o.nejlepsiHmotnost ?? null, (v) => cislo(v, `${cesta}.nejlepsiHmotnost`, { min: 0 })),
    nejlepsiZlom: neboNull(o.nejlepsiZlom ?? null, (v) => cislo(v, `${cesta}.nejlepsiZlom`, { min: 0 })),
    // Rekord bez verze (ruční úprava) se čte jako změřený neznámou fyzikou, tedy neplatný.
    verzeZlomu: neboNull(o.verzeZlomu ?? null, (v) => cislo(v, `${cesta}.verzeZlomu`, { min: 0, cele: true })),
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

/**
 * Verze formátu, ve které je text uložení zapsaný; null, když ji z textu nejde přečíst.
 * Úložiště podle ní pozná, že právě načetlo starší postup a má ho zapsat v novém tvaru.
 */
export function verzeZapisuUlozeni(zapis: string): number | null {
  try {
    const data: unknown = JSON.parse(zapis);
    const verze = typeof data === "object" && data !== null ? (data as Record<string, unknown>).verze : undefined;
    return typeof verze === "number" && Number.isInteger(verze) ? verze : null;
  } catch {
    return null;
  }
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
 * neodebírají a cena i hmotnost se jen snižují. Hmotnost se počítá jen, když ji volající zná.
 */
export function vylepsiRekord(
  dosavadni: Rekord | undefined,
  ziskane: Medaile,
  cena: number,
  verzeFyziky: number,
  hmotnost?: number,
  celistvy = true,
): Rekord {
  const stare = dosavadni?.medaile ?? BEZ_MEDAILI;
  const nove: Medaile = {
    pruchod: stare.pruchod || ziskane.pruchod,
    rozpocet: stare.rozpocet || ziskane.rozpocet,
    mistrovska: stare.mistrovska || ziskane.mistrovska,
  };
  const dosavadniCena = dosavadni?.nejlepsiCena ?? null;
  // Do výzev o nejlevnější a nejlehčí most se počítá jen most, na kterém se při zkoušce nic
  // neporušilo (`celistvy`): most, kterému povolil prut a lidé přesto přešli, levný není.
  const plati = ziskane.pruchod && celistvy;
  const nejlepsiCena = plati && (dosavadniCena === null || cena < dosavadniCena) ? cena : dosavadniCena;
  const dosavadniHmotnost = dosavadni?.nejlepsiHmotnost ?? null;
  const nejlepsiHmotnost =
    plati && hmotnost !== undefined && hmotnost > 0 && (dosavadniHmotnost === null || hmotnost < dosavadniHmotnost)
      ? hmotnost
      : dosavadniHmotnost;
  const zmena =
    nove.pruchod !== stare.pruchod ||
    nove.rozpocet !== stare.rozpocet ||
    nove.mistrovska !== stare.mistrovska ||
    nejlepsiCena !== dosavadniCena ||
    nejlepsiHmotnost !== dosavadniHmotnost;
  return {
    verzeFyziky: zmena || !dosavadni ? verzeFyziky : dosavadni.verzeFyziky,
    medaile: nove,
    nejlepsiCena,
    nejlepsiHmotnost,
    nejlepsiZlom: dosavadni?.nejlepsiZlom ?? null,
    verzeZlomu: dosavadni?.verzeZlomu ?? null,
  };
}

/**
 * Rekord zkoušky do zlomu, pokud platí pro dnešní fyziku; jinak null. Únosnost je výsledek
 * výpočtu a prahy výzvy se s každou verzí fyziky měří znovu: rekord změřený jinou verzí by se
 * s nimi nedal poctivě porovnat. Medaile a cena takhle nezastarávají (viz `vylepsiRekord`).
 */
export function platnyZlom(rekord: Rekord | undefined, verzeFyziky: number): number | null {
  if (!rekord || rekord.verzeZlomu !== verzeFyziky) return null;
  return rekord.nejlepsiZlom;
}

/** Má úroveň rekord zkoušky do zlomu změřený jinou verzí fyziky, než je dnešní? */
export function zastaralyZlom(rekord: Rekord | undefined, verzeFyziky: number): boolean {
  return rekord !== undefined && rekord.nejlepsiZlom !== null && rekord.verzeZlomu !== verzeFyziky;
}

/**
 * Započítá výsledek zkoušky do zlomu: únosnost na korunu (N/Kč) se jen zvyšuje. Medaile
 * ani cenu zkouška do zlomu nemění. Rekord změřený jinou verzí fyziky se nepočítá: první
 * měření s dnešní fyzikou ho nahradí, i kdyby vyšlo menší.
 */
export function vylepsiZlom(dosavadni: Rekord | undefined, unosnostNaKorunu: number, verzeFyziky: number): Rekord {
  const zaklad: Rekord = dosavadni ?? {
    verzeFyziky,
    medaile: { ...BEZ_MEDAILI },
    nejlepsiCena: null,
    nejlepsiHmotnost: null,
    nejlepsiZlom: null,
    verzeZlomu: null,
  };
  const platny = platnyZlom(zaklad, verzeFyziky);
  if (!(unosnostNaKorunu > 0) || (platny !== null && unosnostNaKorunu <= platny)) return zaklad;
  return { ...zaklad, verzeFyziky, nejlepsiZlom: unosnostNaKorunu, verzeZlomu: verzeFyziky };
}
