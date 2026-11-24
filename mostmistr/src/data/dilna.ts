// Dílna: uložené práce z pískoviště (údolí s provozem a most v něm) a odkaz na scénář.
// Pískoviště má jeden pracovní stůl (nastavení a rozestavěný most); dílna si vedle něj pamatuje
// pojmenované práce, ke kterým se hráč vrací. Most je uložený jako kód pro sdílení
// (`src/data/sdileni.ts`). Odkaz na scénář nese nastavení údolí i most, takže ho kdokoli
// otevře ve stejném údolí se stejným provozem.
//
// Bez prohlížeče: čtení a zápis textu, pravidla seznamu a zápis nastavení do adresy.

import { ChybaDat } from "./kontrola";
import type { NavrhMostu } from "./navrh";
import { ID_SANDBOXU, nactiSandbox, sandboxNaText, VERZE_SANDBOXU, type NastaveniSandboxu } from "./sandbox";
import { NEJDELSI_KOD_MOSTU, PARAMETR_MOSTU, rozkodujMost, zakodujMost } from "./sdileni";
import { DRUHY_TRAS, type DruhTrasy } from "./uroven";

export const VERZE_DILNY = 1;
/** Kolik prací si dílna pamatuje; víc by se s náhledy nevešlo do okna ani do paměti prohlížeče. */
export const NEJVIC_PRACI = 12;
/** Nejdelší jméno práce ve znacích. */
export const NEJDELSI_NAZEV_PRACE = 40;
/** Parametr adresy s nastavením pískoviště. */
export const PARAMETR_SANDBOXU = "sandbox";

/** Jedna uložená práce: údolí s provozem a most v něm. */
export interface PraceDilny {
  /** Jméno, které jí dal hráč; v dílně je jedinečné (uložení pod stejným jménem práci přepíše). */
  nazev: string;
  nastaveni: NastaveniSandboxu;
  /** Kód mostu (`zakodujMost`). */
  kod: string;
  /** Kdy byla uložena, ms od roku 1970. */
  ulozeno: number;
}

export interface Dilna {
  verze: typeof VERZE_DILNY;
  /** Práce od naposledy uložené. */
  prace: PraceDilny[];
}

export function prazdnaDilna(): Dilna {
  return { verze: VERZE_DILNY, prace: [] };
}

/** Jméno práce, jak se uloží: bez řídicích znaků a mezer na krajích, zkrácené na mez. */
export function upravNazevPrace(nazev: string): string {
  const cisty = nazev.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  return [...cisty].slice(0, NEJDELSI_NAZEV_PRACE).join("").trim();
}

function jePrace(h: unknown): PraceDilny | null {
  if (typeof h !== "object" || h === null) return null;
  const p = h as Record<string, unknown>;
  if (typeof p.nazev !== "string" || typeof p.kod !== "string" || typeof p.ulozeno !== "number" || !Number.isFinite(p.ulozeno)) return null;
  const nazev = upravNazevPrace(p.nazev);
  if (nazev === "" || p.kod.length === 0 || p.kod.length > NEJDELSI_KOD_MOSTU) return null;
  try {
    const nastaveni = nactiSandbox(p.nastaveni);
    // Most musí jít přečíst a patřit pískovišti: kód cizí úrovně by se v údolí otevřel špatně.
    if (rozkodujMost(p.kod).uroven !== ID_SANDBOXU) return null;
    return { nazev, nastaveni, kod: p.kod, ulozeno: p.ulozeno };
  } catch {
    return null;
  }
}

/**
 * Přečte dílnu z textu v paměti prohlížeče. Nečitelný zápis dá prázdnou dílnu; práce, která
 * nejde přečíst (poškozený kód, nastavení mimo meze), se vynechá a ostatní zůstanou.
 */
export function dilnaZTextu(zapis: string | null): Dilna {
  if (zapis === null) return prazdnaDilna();
  let data: unknown;
  try {
    data = JSON.parse(zapis);
  } catch {
    return prazdnaDilna();
  }
  if (typeof data !== "object" || data === null) return prazdnaDilna();
  const o = data as Record<string, unknown>;
  if (o.verze !== VERZE_DILNY || !Array.isArray(o.prace)) return prazdnaDilna();
  const prace: PraceDilny[] = [];
  for (const polozka of o.prace) {
    const p = jePrace(polozka);
    if (p && !prace.some((jina) => jina.nazev === p.nazev) && prace.length < NEJVIC_PRACI) prace.push(p);
  }
  return { verze: VERZE_DILNY, prace };
}

export function dilnaNaText(dilna: Dilna): string {
  return JSON.stringify(dilna);
}

/** Je práce totéž co údolí a most na stole? (Pak ji otevření jiné práce nezahodí.) */
export function jeStejnaPrace(prace: PraceDilny, nastaveni: NastaveniSandboxu, kod: string): boolean {
  return prace.kod === kod && sandboxNaText(prace.nastaveni) === sandboxNaText(nastaveni);
}

export type VysledekUlozeni =
  | { stav: "ulozeno" | "prepsano"; dilna: Dilna }
  /** Dílna je plná a práce toho jména v ní není. */
  | { stav: "plno"; dilna: Dilna }
  /** Jméno je prázdné, nebo most nejde zapsat do kódu (příliš velký). */
  | { stav: "bez-jmena" | "velky"; dilna: Dilna };

/**
 * Uloží údolí a most pod jménem `nazev`: práci stejného jména přepíše, jinak ji přidá na
 * začátek seznamu. Vrací novou dílnu a to, co se stalo; vstupní dílnu nemění.
 */
export function ulozPraci(dilna: Dilna, nazev: string, nastaveni: NastaveniSandboxu, navrh: NavrhMostu, cas: number): VysledekUlozeni {
  const jmeno = upravNazevPrace(nazev);
  if (jmeno === "") return { stav: "bez-jmena", dilna };
  let kod: string;
  try {
    kod = zakodujMost(navrh);
  } catch {
    return { stav: "velky", dilna };
  }
  if (kod.length > NEJDELSI_KOD_MOSTU) return { stav: "velky", dilna };
  const prace: PraceDilny = { nazev: jmeno, nastaveni: nactiSandbox(nastaveni), kod, ulozeno: cas };
  const byla = dilna.prace.some((p) => p.nazev === jmeno);
  if (!byla && dilna.prace.length >= NEJVIC_PRACI) return { stav: "plno", dilna };
  return { stav: byla ? "prepsano" : "ulozeno", dilna: { verze: VERZE_DILNY, prace: [prace, ...dilna.prace.filter((p) => p.nazev !== jmeno)] } };
}

export function smazPraci(dilna: Dilna, nazev: string): Dilna {
  return { verze: VERZE_DILNY, prace: dilna.prace.filter((p) => p.nazev !== nazev) };
}

/** První volné jméno „<zaklad> N“ (Most 1, Most 2, …). */
export function volnyNazevPrace(dilna: Dilna, zaklad: string): string {
  for (let n = 1; n <= NEJVIC_PRACI + 1; n++) {
    const nazev = `${zaklad} ${n}`;
    if (!dilna.prace.some((p) => p.nazev === nazev)) return nazev;
  }
  return `${zaklad} ${NEJVIC_PRACI + 2}`;
}

// ---- Nastavení pískoviště v adrese ----

const ZNAK_TRASY: Record<DruhTrasy, string> = { lavka: "l", silnice: "s", kolej: "k" };

/**
 * Nastavení pískoviště úsporně do adresy: pole oddělená vlnovkou, položky jízdního řádu
 * podtržítkem a jejich údaje dvojtečkou (znaky, které se v adrese nekódují; druh provozu
 * obsahuje jen písmena a pomlčku). Zápis JSON by byl po zakódování třikrát delší.
 * Pořadí: verze, rozpětí, hloubka, trasa, voda, základy, provoz, zvedání, rozpočet, kmitání.
 */
export function sandboxDoAdresy(nastaveni: NastaveniSandboxu): string {
  const n = nactiSandbox(nastaveni);
  // Čísla přesně, jen nikdy s exponentem: zápis „1e-7“ by čtení odmítlo jako poškozený odkaz
  // (a čas pod miliontinu sekundy je nula). Meze nastavení drží čísla daleko od velkých řádů.
  const c = (x: number): string => (Math.abs(x) < 1e-6 ? "0" : String(x));
  return [
    VERZE_SANDBOXU,
    c(n.rozpeti),
    c(n.hloubka),
    ZNAK_TRASY[n.druh],
    n.voda ? 1 : 0,
    c(n.zaklady),
    n.provoz.map((p) => [p.druh, c(p.pocet), p.smer === 1 ? 1 : 0, c(p.cas)].join(":")).join("_"),
    n.zvedani ? [n.zvedani.kridla, c(n.zvedani.cas), c(n.zvedani.lod)].join(":") : "",
    n.rozpocet === null ? "" : c(n.rozpocet),
    n.komfort,
  ].join("~");
}

/** Vypadá text z adresy jako úsporný zápis nastavení (ne jako JSON ani jako prázdný parametr)? */
export function jeSandboxVAdrese(text: string): boolean {
  return /^\d+~/.test(text);
}

/** Přečte úsporný zápis z adresy; při chybě vyhodí `ChybaDat` (stejně jako kontrola nastavení). */
export function sandboxZAdresy(text: string): NastaveniSandboxu {
  const c = "sandbox";
  const casti = text.split("~");
  if (casti.length !== 10) throw new ChybaDat(c, "zápis nastavení v adrese je neúplný");
  const cislo = (zapis: string, cesta: string): number => {
    if (!/^-?\d+(\.\d+)?$/.test(zapis)) throw new ChybaDat(cesta, "v adrese není číslo");
    return Number(zapis);
  };
  const [verze, rozpeti, hloubka, trasa, voda, zaklady, provoz, zvedani, rozpocet, komfort] = casti as [string, string, string, string, string, string, string, string, string, string];
  if (cislo(verze, `${c}.verze`) !== VERZE_SANDBOXU) throw new ChybaDat(`${c}.verze`, "neznámá verze nastavení sandboxu");
  const druh = DRUHY_TRAS.find((d) => ZNAK_TRASY[d] === trasa);
  if (!druh) throw new ChybaDat(`${c}.druh`, "neznámý druh trasy");
  if (voda !== "0" && voda !== "1") throw new ChybaDat(`${c}.voda`, "voda je 0 nebo 1");
  const polozky =
    provoz === ""
      ? []
      : provoz.split("_").map((zapis, i) => {
          const pole = zapis.split(":");
          if (pole.length !== 4) throw new ChybaDat(`${c}.provoz[${i}]`, "položka jízdního řádu je neúplná");
          const [co, pocet, smer, cas] = pole as [string, string, string, string];
          if (smer !== "0" && smer !== "1") throw new ChybaDat(`${c}.provoz[${i}].smer`, "směr je 0 nebo 1");
          return { druh: co, pocet: cislo(pocet, `${c}.provoz[${i}].pocet`), smer: smer === "1" ? 1 : -1, cas: cislo(cas, `${c}.provoz[${i}].cas`) };
        });
  let zvedaniMostu: unknown = null;
  if (zvedani !== "") {
    const pole = zvedani.split(":");
    if (pole.length !== 3) throw new ChybaDat(`${c}.zvedani`, "zápis zvedání je neúplný");
    const [kridla, cas, lod] = pole as [string, string, string];
    zvedaniMostu = { kridla: cislo(kridla, `${c}.zvedani.kridla`), cas: cislo(cas, `${c}.zvedani.cas`), lod: cislo(lod, `${c}.zvedani.lod`) };
  }
  // Meze, druhy provozu a souvislosti (loď jen s vodou) hlídá kontrola nastavení.
  return nactiSandbox({
    verze: VERZE_SANDBOXU,
    rozpeti: cislo(rozpeti, `${c}.rozpeti`),
    hloubka: cislo(hloubka, `${c}.hloubka`),
    druh,
    voda: voda === "1",
    zaklady: cislo(zaklady, `${c}.zaklady`),
    provoz: polozky,
    zvedani: zvedaniMostu,
    rozpocet: rozpocet === "" ? null : cislo(rozpocet, `${c}.rozpocet`),
    komfort: cislo(komfort, `${c}.komfort`),
  });
}

/**
 * Odkaz na scénář: adresa hry (`zaklad`, bez dotazu), kód mostu a nastavení pískoviště. Kód
 * mostu je první a nastavení poslední (končí číslicí; kód smí končit pomlčkou, kterou některé
 * aplikace z konce odkazu odříznou).
 */
export function odkazNaScenar(zaklad: string, nastaveni: NastaveniSandboxu, kod: string): string {
  const bezDotazu = zaklad.replace(/[?#].*$/, "");
  return `${bezDotazu}?${PARAMETR_MOSTU}=${kod}&${PARAMETR_SANDBOXU}=${sandboxDoAdresy(nastaveni)}`;
}
