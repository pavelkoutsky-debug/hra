// Kmitání pod lidmi čitelně pro hráče: jakými rytmy lidé most budí (krok a jeho násobky)
// a co ho při zkoušce rozhoupalo. Všechno se čte ze zadání úrovně a ze záznamu zkoušky;
// do simulace nic z toho nevstupuje, takže se tu smí počítat se siny a kosiny.
//
// Proč nestačí jediná značka kroku: síla kroku není čistý sinus. Vedle rytmu kroku má složky
// na jeho dvojnásobku a trojnásobku, a most, který se mine s krokem, se může potkat s nimi.

import type { IdProvozu } from "../data/katalog";
import type { Uroven } from "../data/uroven";
import { TIHOVE_ZRYCHLENI } from "../jadro/integrator";
import { jeClovek } from "./provoz";
import { hmotnostUcastnika, modelUcastnika, rytmusLidi, skokan } from "./vozidla";
import type { Zaznam } from "./zaznam";

/** Jedna složka síly kroku: rytmus skupiny lidí nebo jeho násobek. */
export interface SlozkaKroku {
  /** Kdo tak jde (druh provozu). */
  druh: IdProvozu;
  /** Rytmus kroku té skupiny v Hz. */
  rytmus: number;
  /** Kolikátá složka: 1 je krok sám, 2 jeho dvojnásobek, 3 trojnásobek. */
  nasobek: 1 | 2 | 3;
  /** Frekvence složky v Hz (rytmus × násobek). */
  frekvence: number;
  /** Síla složky jako podíl váhy člověka. */
  sila: number;
  /** Polovina šířky pásma v Hz: skupina, která nejde jedním rytmem, zabírá kolem složky pásmo. */
  pasmo: number;
}

/**
 * Kam až sahá osa frekvencí a rezonanční křivka, Hz: za trojnásobek nejrychlejšího pochodu
 * (3 × 2,3 Hz), protože i ten most budí.
 */
export const ROZSAH_FREKVENCI = 8;

/** Od jaké síly (podíl váhy) se složka kroku počítá mezi silné: běh a skákání. */
export const SILNA_SLOZKA = 0.5;

/**
 * Složky síly kroku všech lidí z jízdního řádu úrovně, seřazené podle frekvence. Každý rytmus
 * jednou; u skákajícího davu se bere rytmus skákání, u průvodu takt kapely.
 */
export function slozkyKroku(uroven: Uroven): SlozkaKroku[] {
  const slozky: SlozkaKroku[] = [];
  const hotove = new Set<string>();
  for (const polozka of uroven.jizdniRad) {
    if (!jeClovek(polozka.druh)) continue;
    const rytmus = rytmusLidi(polozka.druh, polozka.kadence);
    if (!rytmus) continue;
    const klic = `${polozka.druh}:${rytmus.f}`;
    if (hotove.has(klic)) continue;
    hotove.add(klic);
    const model = polozka.druh === "skakajici-dav" ? skokan(rytmus.f) : modelUcastnika(polozka.druh, polozka.kadence);
    const amplitudy = model?.buzeni?.amplitudy;
    if (!model || !amplitudy) continue;
    const vaha = hmotnostUcastnika(model) * TIHOVE_ZRYCHLENI;
    for (const nasobek of [1, 2, 3] as const) {
      const sila = Math.hypot(amplitudy[2 * nasobek - 2] ?? 0, amplitudy[2 * nasobek - 1] ?? 0) / vaha;
      if (!(sila > 0)) continue;
      slozky.push({
        druh: polozka.druh,
        rytmus: rytmus.f,
        nasobek,
        frekvence: nasobek * rytmus.f,
        sila,
        // Dvě směrodatné odchylky na každou stranu pokryjí skoro všechny lidi ve skupině.
        pasmo: 2 * nasobek * rytmus.rozptyl,
      });
    }
  }
  return slozky.sort((a, b) => a.frekvence - b.frekvence || b.sila - a.sila);
}

/** Největší frekvence, na které lidé úrovně most budí, Hz; 0, když v úrovni lidé nejdou. */
export function nejvyssiSlozka(slozky: readonly SlozkaKroku[]): number {
  let nejvyssi = 0;
  for (const s of slozky) nejvyssi = Math.max(nejvyssi, s.frekvence + s.pasmo);
  return nejvyssi;
}

/** Okno, ze kterého se frekvence kmitání čte: kolik sekund před špičkou a kolik po ní. */
const OKNO_PRED = 3;
const OKNO_PO = 1;
/** Pásmo, ve kterém se frekvence hledá (stejné jako u hodnocení komfortu), a krok hledání, Hz. */
const PASMO_OD = 0.5;
const PASMO_DO = 10;
const KROK_HLEDANI = 0.05;
/**
 * Jak velký musí být vrchol v pásmu proti největší složce pod pásmem, aby nešlo o postranní
 * vrchol okna (ten u použitého okna nepřesáhne tři procenta hlavního).
 */
const POSTRANNI_VRCHOL = 0.04;
/** Nejkratší úsek záznamu, ze kterého jde frekvenci poznat, s. */
const NEJKRATSI_OKNO = 1;

/**
 * Připraví průběh `y` (hodnoty v časech `casy`, s) ke čtení jeho složek: zbaví ho průměru
 * a sklonu a přenásobí oknem s plynulým náběhem a doběhem. Vrací funkci, která pro frekvenci
 * v Hz dá amplitudu výchylky na ní (až na stálý násobek okna, stejný pro všechny frekvence).
 * Null, když je průběh kratší než `NEJKRATSI_OKNO` nebo se v něm nic nehýbe.
 */
function slozkyPrubehu(casy: ArrayLike<number>, y: ArrayLike<number>): ((f: number) => number) | null {
  const pocet = Math.min(casy.length, y.length);
  if (pocet < 8) return null;
  const zacatek = casy[0]!;
  const trvani = casy[pocet - 1]! - zacatek;
  if (!(trvani >= NEJKRATSI_OKNO)) return null;
  const t = new Float64Array(pocet);
  const v = new Float64Array(pocet);
  let prumerT = 0;
  let prumerY = 0;
  for (let k = 0; k < pocet; k++) {
    t[k] = casy[k]! - zacatek;
    prumerT += t[k]! / pocet;
    prumerY += y[k]! / pocet;
  }
  let citatel = 0;
  let jmenovatel = 0;
  for (let k = 0; k < pocet; k++) {
    citatel += (t[k]! - prumerT) * (y[k]! - prumerY);
    jmenovatel += (t[k]! - prumerT) * (t[k]! - prumerT);
  }
  const sklon = jmenovatel > 0 ? citatel / jmenovatel : 0;
  let rozkmit = 0;
  for (let k = 0; k < pocet; k++) {
    const bezSklonu = y[k]! - prumerY - sklon * (t[k]! - prumerT);
    rozkmit = Math.max(rozkmit, Math.abs(bezSklonu));
    v[k] = (0.5 - 0.5 * Math.cos((2 * Math.PI * t[k]!) / trvani)) * bezSklonu;
  }
  // Pohyb pod setinu milimetru není kmitání, jen šum zaokrouhlení poloh v záznamu.
  if (!(rozkmit > 1e-5)) return null;
  return (f: number): number => {
    const w = 2 * Math.PI * f;
    let re = 0;
    let im = 0;
    for (let k = 0; k < pocet; k++) {
      re += v[k]! * Math.cos(w * t[k]!);
      im += v[k]! * Math.sin(w * t[k]!);
    }
    return Math.sqrt(re * re + im * im);
  };
}

/**
 * Frekvence v Hz, na které má průběh `y` (hodnoty v časech `casy`, s) největší amplitudu.
 * Složky průběhu se hledají po `KROK_HLEDANI` mezi `od` a `do`; vrchol se zpřesní parabolou.
 * S `zrychleni` rozhoduje amplituda zrychlení, jak ji váží hodnocení komfortu, jinak amplituda
 * výchylky. Null, když je průběh příliš krátký, nic se v něm nehýbe, nebo v pásmu žádný vrchol
 * nemá (pomalý návrat přetlumeného mostu není kmitání).
 */
export function dominantniFrekvence(
  casy: ArrayLike<number>,
  y: ArrayLike<number>,
  zrychleni: boolean,
  od = PASMO_OD,
  do_ = PASMO_DO,
): number | null {
  const odezva = slozkyPrubehu(casy, y);
  if (!odezva) return null;
  // Spektrum se počítá o krok za oba okraje pásma: vrchol musí mít nižší sousedy z obou stran.
  // Průběh, který jen klesá od okraje (pomalý návrat přetlumeného mostu), tak žádný vrchol nemá.
  const frekvence: number[] = [];
  const spektrum: number[] = [];
  for (let f = od - KROK_HLEDANI; f <= do_ + KROK_HLEDANI + 1e-9; f += KROK_HLEDANI) {
    frekvence.push(f);
    spektrum.push(f > 0 ? odezva(f) : 0);
  }
  // Silná složka pod pásmem (pomalé houpání, průhyb pod jdoucími lidmi) nechá v pásmu drobné
  // postranní vrcholy okna. Za kmitání se počítá jen vrchol, který je proti ní dost velký.
  let podPasmem = 0;
  for (let f = KROK_HLEDANI; f < od - KROK_HLEDANI - 1e-9; f += KROK_HLEDANI) podPasmem = Math.max(podPasmem, odezva(f));
  let nejlepsi = -1;
  let nejvic = 0;
  for (let i = 1; i + 1 < spektrum.length; i++) {
    const a = spektrum[i]!;
    const vrchol = a >= spektrum[i - 1]! && a > spektrum[i + 1]!;
    if (!vrchol || a < POSTRANNI_VRCHOL * podPasmem) continue;
    // Zrychlení se váží stejně jako při hodnocení komfortu: pásmem 0,5 až 10 Hz.
    const vaha = zrychleni ? frekvence[i]! * frekvence[i]! * zesileniPasma(frekvence[i]!) * a : a;
    if (vaha > nejvic) {
      nejvic = vaha;
      nejlepsi = i;
    }
  }
  if (nejlepsi < 0) return null;
  // Zpřesnění vrcholu parabolou přes sousední body.
  const stred = spektrum[nejlepsi]!;
  const vlevo = spektrum[nejlepsi - 1]!;
  const vpravo = spektrum[nejlepsi + 1]!;
  const zakriveni = vlevo - 2 * stred + vpravo;
  const posun = zakriveni < 0 ? (0.5 * (vlevo - vpravo)) / zakriveni : 0;
  const vysledek = frekvence[nejlepsi]! + KROK_HLEDANI * Math.max(-1, Math.min(1, posun));
  return Math.max(od, Math.min(do_, vysledek));
}

/** Jak velkou část počáteční výchylky musí most po puštění překmitnout na druhou stranu, aby kmital. */
const NEJMENSI_PREKMIT = 0.02;
/** Kolik kmitů se musí do sledované doby vejít, aby se frekvence dala poznat. */
const NEJMENE_KMITU = 3;

/**
 * Frekvence volného kmitání po brnknutí: průběh `y` (v časech `casy`, s) začíná vychýlený
 * a vrací se ke klidu. Most kmitá, jen když přes klidovou polohu překmitne na druhou stranu;
 * přetlumený most se vrací bez kmitu a frekvenci nemá (jeho spektrum má vrcholy jen jako stopu
 * po zpracování průběhu). Klidová poloha se bere z konce průběhu. Null, když most nekmitá
 * nebo se frekvence nedá poznat.
 */
export function frekvenceVolnehoKmitani(casy: ArrayLike<number>, y: ArrayLike<number>, od: number, do_: number): number | null {
  const pocet = Math.min(casy.length, y.length);
  if (pocet < 16) return null;
  const konec = Math.max(1, Math.floor(pocet / 10));
  let klid = 0;
  for (let k = pocet - konec; k < pocet; k++) klid += y[k]! / konec;
  const pocatek = y[0]! - klid;
  if (pocatek === 0) return null;
  let prekmit = 0;
  for (let k = 0; k < pocet; k++) prekmit = Math.max(prekmit, -(y[k]! - klid) / pocatek);
  if (prekmit < NEJMENSI_PREKMIT) return null;
  // Pomalejší složka, než jaká stihne aspoň několikrát zakmitat, se z průběhu poznat nedá.
  const trvani = casy[pocet - 1]! - casy[0]!;
  return dominantniFrekvence(casy, y, false, Math.max(od, NEJMENE_KMITU / trvani), do_);
}

/**
 * Zesílení pásma, ve kterém zkouška kmitání měří (dolní propust 10 Hz a horní propust 0,5 Hz,
 * obě prvního řádu), na frekvenci `f` v Hz.
 */
export function zesileniPasma(f: number): number {
  return 1 / Math.sqrt((1 + (f / 10) * (f / 10)) * (1 + (0.5 / f) * (0.5 / f)));
}

/**
 * Průběh svislé polohy styčníku `stycnik` v okně kolem času `cas` (několik sekund před ním
 * a chvíli po něm), jen ze snímků stavby, která v tom čase platila: přes porušení mostu se
 * kmitání nečte. Null, když záznam nestačí nebo styčník v něm není.
 */
function oknoZaznamu(zaznam: Zaznam, stycnik: number, cas: number): { casy: Float64Array; y: Float64Array } | null {
  const { snimky } = zaznam;
  if (stycnik < 0 || snimky.length < 2) return null;
  let prvni = -1;
  let posledni = -1;
  for (let i = 0; i < snimky.length; i++) {
    const s = snimky[i]!;
    if (s.cas < cas - OKNO_PRED) continue;
    if (s.cas > cas + OKNO_PO) break;
    if (prvni < 0) prvni = i;
    posledni = i;
  }
  if (prvni < 0) return null;
  const stavba = snimky[Math.min(posledni, Math.max(prvni, najdiSnimek(snimky, cas)))]!.topologie;
  while (prvni <= posledni && snimky[prvni]!.topologie !== stavba) prvni++;
  while (posledni >= prvni && snimky[posledni]!.topologie !== stavba) posledni--;
  const pocet = posledni - prvni + 1;
  if (pocet < 8 || 2 * stycnik + 1 >= snimky[prvni]!.polohy.length) return null;
  const casy = new Float64Array(pocet);
  const y = new Float64Array(pocet);
  for (let k = 0; k < pocet; k++) {
    const s = snimky[prvni + k]!;
    casy[k] = s.cas;
    y[k] = s.polohy[2 * stycnik + 1]!;
  }
  return { casy, y };
}

/**
 * Na jaké frekvenci kmital styčník `stycnik` kolem času `cas`: frekvence v Hz, na které mělo
 * jeho svislé zrychlení největší amplitudu. Null, když záznam nestačí, styčník v něm není,
 * nebo se nehýbal.
 */
export function frekvenceKmitani(zaznam: Zaznam, stycnik: number, cas: number): number | null {
  const okno = oknoZaznamu(zaznam, stycnik, cas);
  return okno ? dominantniFrekvence(okno.casy, okno.y, true) : null;
}

/** Pořadí snímku, který je času `cas` nejblíž zdola. */
function najdiSnimek(snimky: Zaznam["snimky"], cas: number): number {
  let dolni = 0;
  let horni = snimky.length - 1;
  while (horni > dolni) {
    const stred = (dolni + horni + 1) >> 1;
    if (snimky[stred]!.cas <= cas) dolni = stred;
    else horni = stred - 1;
  }
  return dolni;
}

/**
 * Jak daleko od násobku kroku se jeho složka v kmitání ještě hledá, Hz: krátká dávka kroků
 * (skupina přeběhne jedno pole mostovky) má vrchol o desetiny Hz vedle.
 */
const OKOLI_SLOZKY = 0.2;
/** Od jakého podílu na kmitání se rytmus jmenuje jako jeho příčina. */
const PREVAHA_RYTMU = 0.5;
/** Jak daleko (podíl frekvence) smí být vlastní frekvence mostu, aby se k ní kmitání přiřadilo. */
const SHODA_TVARU = 0.12;

/** Rytmus skupiny lidí a jak velkou část kmitání nesou jeho násobky. */
export interface RytmusVKmitani {
  /** Kdo tak jde (druh provozu) a v jakém rytmu, Hz. */
  druh: IdProvozu;
  rytmus: number;
  /** Podíl kroku a jeho násobků na kmitání mostu (čtverec zrychlení v pásmu komfortu), 0 až 1. */
  podil: number;
  /** Násobek kroku, na kterém most kmital nejvíc, a jeho frekvence v Hz. */
  nasobek: 1 | 2 | 3;
  frekvence: number;
}

/** Co most rozhoupalo. */
export interface PricinaKmitani {
  /** Frekvence, na které most kmital nejvíc, Hz. */
  frekvence: number;
  /**
   * Skupina lidí, jejíž krok s násobky nese většinu kmitání; null, když žádná nepřevažuje
   * (most kmital po svém, nebo se na kmitání podílí víc skupin podobně).
   */
  rytmus: RytmusVKmitani | null;
}

/**
 * Co rozhoupalo styčník `stycnik` kolem času `cas`. Kmitání pod lidmi má víc složek (krok
 * a jeho násobky) a největší z nich nemusí říct, kdo za ním stojí: proto se pro každý rytmus
 * z `slozky` sečte, kolik kmitání nesou všechny jeho násobky dohromady, a jmenuje se ten, který
 * převažuje. Null, když záznam nestačí nebo se styčník nehýbal.
 */
export function pricinaKmitani(zaznam: Zaznam, stycnik: number, cas: number, slozky: readonly SlozkaKroku[]): PricinaKmitani | null {
  const okno = oknoZaznamu(zaznam, stycnik, cas);
  if (!okno) return null;
  const frekvence = dominantniFrekvence(okno.casy, okno.y, true);
  const odezva = slozkyPrubehu(okno.casy, okno.y);
  if (frekvence === null || !odezva) return null;
  /** Zrychlení na frekvenci `f`, jak ho váží hodnocení komfortu (až na stálý násobek). */
  const zrychleni = (f: number): number => f * f * zesileniPasma(f) * odezva(f);
  // Celkové kmitání: součet čtverců všech vrcholů v pásmu komfortu.
  let celkem = 0;
  let vlevo = zrychleni(PASMO_OD - KROK_HLEDANI);
  let stred = zrychleni(PASMO_OD);
  for (let f = PASMO_OD; f <= PASMO_DO + 1e-9; f += KROK_HLEDANI) {
    const vpravo = zrychleni(f + KROK_HLEDANI);
    if (stred >= vlevo && stred > vpravo) celkem += stred * stred;
    vlevo = stred;
    stred = vpravo;
  }
  if (!(celkem > 0)) return { frekvence, rytmus: null };

  const rytmy = new Map<string, RytmusVKmitani & { nejvic: number }>();
  for (const slozka of slozky) {
    // Největší zrychlení v okolí složky (u skupiny bez jednoho rytmu v celém jejím pásmu).
    let nejvic = 0;
    for (let f = slozka.frekvence - slozka.pasmo - OKOLI_SLOZKY; f <= slozka.frekvence + slozka.pasmo + OKOLI_SLOZKY + 1e-9; f += KROK_HLEDANI) {
      if (f > 0) nejvic = Math.max(nejvic, zrychleni(f));
    }
    const klic = `${slozka.druh}:${slozka.rytmus}`;
    let rytmus = rytmy.get(klic);
    if (!rytmus) {
      rytmus = { druh: slozka.druh, rytmus: slozka.rytmus, podil: 0, nasobek: slozka.nasobek, frekvence: slozka.frekvence, nejvic: 0 };
      rytmy.set(klic, rytmus);
    }
    rytmus.podil += (nejvic * nejvic) / celkem;
    if (nejvic > rytmus.nejvic) {
      rytmus.nejvic = nejvic;
      rytmus.nasobek = slozka.nasobek;
      rytmus.frekvence = slozka.frekvence;
    }
  }
  let nejlepsi: (RytmusVKmitani & { nejvic: number }) | null = null;
  for (const rytmus of rytmy.values()) {
    if (!nejlepsi || rytmus.podil > nejlepsi.podil) nejlepsi = rytmus;
  }
  if (!nejlepsi || nejlepsi.podil < PREVAHA_RYTMU) return { frekvence, rytmus: null };
  const { nejvic: _nejvic, ...rytmus } = nejlepsi;
  return { frekvence, rytmus: { ...rytmus, podil: Math.min(1, rytmus.podil) } };
}

/** Vlastní frekvence mostu z rozboru: prázdného a obsazeného lidmi. */
export interface FrekvenceMostu {
  frekvence: readonly number[];
  frekvenceObsazeneho: readonly number[];
}

/**
 * Vlastní frekvence mostu nejbližší frekvenci `f`: pořadí od 1 a obě její hodnoty. S lidmi most
 * kmitá jinak než prázdný a během přechodu se mezi oběma hodnotami pohybuje, takže se
 * vzdálenost měří k celému rozmezí. Null, když je všechno dál než `nejdal` (podíl frekvence).
 */
export function nejblizsiTvar(
  f: number,
  most: FrekvenceMostu | null,
  nejdal = SHODA_TVARU,
): { poradi: number; prazdny: number; obsazeny: number | null } | null {
  if (!most || !(f > 0)) return null;
  let nejlepsi: { poradi: number; prazdny: number; obsazeny: number | null } | null = null;
  let nejbliz = Infinity;
  most.frekvence.forEach((prazdny, j) => {
    const obsazeny = most.frekvenceObsazeneho[j] ?? null;
    const dolni = Math.min(prazdny, obsazeny ?? prazdny);
    const horni = Math.max(prazdny, obsazeny ?? prazdny);
    const vzdalenost = f < dolni ? dolni - f : f > horni ? f - horni : 0;
    if (vzdalenost < nejbliz) {
      nejbliz = vzdalenost;
      nejlepsi = { poradi: j + 1, prazdny, obsazeny };
    }
  });
  return nejlepsi && nejbliz <= nejdal * f ? nejlepsi : null;
}

/**
 * Vlastní frekvence mostu, jak je hráč vidí na ose: u mostu s laděnými tlumiči jsou to frekvence
 * mostu bez nich. Tlumič vlastní frekvenci mostu rozdělí na dvě a žádná z nich není ta, na kterou
 * se ladí; hráč potřebuje vidět most a tlumič zvlášť.
 */
export function mostProHrace(rozbor: FrekvenceMostu & { bezTlumicu: { prazdny: number[]; obsazeny: number[] } | null }): FrekvenceMostu {
  return rozbor.bezTlumicu ? { frekvence: rozbor.bezTlumicu.prazdny, frekvenceObsazeneho: rozbor.bezTlumicu.obsazeny } : rozbor;
}
