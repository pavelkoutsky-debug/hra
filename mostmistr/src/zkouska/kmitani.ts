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
/** Nejkratší úsek záznamu, ze kterého jde frekvenci poznat, s. */
const NEJKRATSI_OKNO = 1;

/**
 * Frekvence v Hz, na které má průběh `y` (hodnoty v časech `casy`, s) největší amplitudu.
 * Průběh se zbaví průměru a sklonu, přenásobí oknem s plynulým náběhem a doběhem a jeho
 * složky se hledají po `KROK_HLEDANI` mezi `od` a `do`; vrchol se zpřesní parabolou.
 * S `zrychleni` rozhoduje amplituda zrychlení (výchylka × ω²), jinak amplituda výchylky.
 * Null, když je průběh kratší než `NEJKRATSI_OKNO` nebo se v něm nic nehýbe.
 */
export function dominantniFrekvence(
  casy: ArrayLike<number>,
  y: ArrayLike<number>,
  zrychleni: boolean,
  od = PASMO_OD,
  do_ = PASMO_DO,
): number | null {
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

  /** Amplituda výchylky na frekvenci `f` (až na stálý násobek okna). */
  const odezva = (f: number): number => {
    const w = 2 * Math.PI * f;
    let re = 0;
    let im = 0;
    for (let k = 0; k < pocet; k++) {
      re += v[k]! * Math.cos(w * t[k]!);
      im += v[k]! * Math.sin(w * t[k]!);
    }
    return Math.sqrt(re * re + im * im);
  };
  // Vrcholy se hledají ve spektru výchylky; zrychlení (výchylka × ω²) jen rozhoduje, který
  // z nich vyhraje. Hledat vrchol rovnou ve zrychlení by ho táhlo k vyšším frekvencím.
  const frekvence: number[] = [];
  const spektrum: number[] = [];
  for (let f = od; f <= do_ + 1e-9; f += KROK_HLEDANI) {
    frekvence.push(f);
    spektrum.push(odezva(f));
  }
  let nejlepsi = -1;
  let nejvic = 0;
  for (let i = 0; i < spektrum.length; i++) {
    const a = spektrum[i]!;
    const vrchol = a >= (spektrum[i - 1] ?? 0) && a > (spektrum[i + 1] ?? 0);
    if (!vrchol) continue;
    const vaha = zrychleni ? frekvence[i]! * frekvence[i]! * a : a;
    if (vaha > nejvic) {
      nejvic = vaha;
      nejlepsi = i;
    }
  }
  if (nejlepsi < 0) return null;
  // Zpřesnění vrcholu parabolou přes sousední body.
  const stred = spektrum[nejlepsi]!;
  const vlevo = spektrum[nejlepsi - 1] ?? odezva(frekvence[nejlepsi]! - KROK_HLEDANI);
  const vpravo = spektrum[nejlepsi + 1] ?? odezva(frekvence[nejlepsi]! + KROK_HLEDANI);
  const zakriveni = vlevo - 2 * stred + vpravo;
  const posun = zakriveni < 0 ? (0.5 * (vlevo - vpravo)) / zakriveni : 0;
  return frekvence[nejlepsi]! + KROK_HLEDANI * Math.max(-1, Math.min(1, posun));
}

/**
 * Na jaké frekvenci kmital styčník `stycnik` kolem času `cas`: frekvence v Hz, na které mělo
 * jeho svislé zrychlení největší amplitudu. Počítá se ze snímků záznamu několik sekund kolem
 * toho okamžiku. Null, když záznam nestačí, styčník v něm není, nebo se nehýbal; přes porušení
 * mostu se kmitání nečte.
 */
export function frekvenceKmitani(zaznam: Zaznam, stycnik: number, cas: number): number | null {
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
  // Jen jedna stavba: ta, která platila v čase `cas`.
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
  return dominantniFrekvence(casy, y, true);
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

/** Jak daleko od změřené frekvence smí být složka kroku, aby šlo o ni: Hz a podíl frekvence. */
const SHODA_SLOZKY_HZ = 0.15;
const SHODA_SLOZKY_PODIL = 0.04;
/** Jak daleko (podíl frekvence) smí být vlastní frekvence mostu, aby se k ní kmitání přiřadilo. */
const SHODA_TVARU = 0.12;

/** Co most rozhoupalo. */
export interface PricinaKmitani {
  /** Frekvence, na které most kmital, Hz. */
  frekvence: number;
  /** Složka kroku, která na té frekvenci leží; null, když žádná. */
  slozka: SlozkaKroku | null;
  /**
   * Vlastní frekvence mostu, která je kmitání nejblíž: pořadí (od 1) a frekvence prázdného
   * a obsazeného mostu v Hz; null, když žádná blízko není nebo rozbor chybí.
   */
  tvar: { poradi: number; prazdny: number; obsazeny: number | null } | null;
}

/** Vlastní frekvence mostu z rozboru: prázdného a obsazeného lidmi. */
export interface FrekvenceMostu {
  frekvence: readonly number[];
  frekvenceObsazeneho: readonly number[];
}

/**
 * Vlastní frekvence mostu nejbližší frekvenci `f`: pořadí od 1 a obě její hodnoty. Obsazený most
 * kmitá pomaleji než prázdný a během přechodu se mezi oběma hodnotami pohybuje, takže se
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
 * Přiřadí změřené frekvenci kmitání rytmus lidí a vlastní frekvenci mostu. Když na frekvenci
 * leží víc složek, vyhraje ta nejbližší a z těch stejně blízkých ta silnější.
 */
export function pricinaKmitani(frekvence: number, slozky: readonly SlozkaKroku[], most: FrekvenceMostu | null): PricinaKmitani {
  let slozka: SlozkaKroku | null = null;
  let nejbliz = Infinity;
  for (const s of slozky) {
    const mimoPasmo = Math.max(0, Math.abs(s.frekvence - frekvence) - s.pasmo);
    if (mimoPasmo > Math.max(SHODA_SLOZKY_HZ, SHODA_SLOZKY_PODIL * frekvence)) continue;
    if (mimoPasmo < nejbliz - 1e-9 || (Math.abs(mimoPasmo - nejbliz) <= 1e-9 && slozka !== null && s.sila > slozka.sila)) {
      nejbliz = mimoPasmo;
      slozka = s;
    }
  }
  return { frekvence, slozka, tvar: nejblizsiTvar(frekvence, most) };
}

/** Do jakého odstupu (podíl frekvence) leží složka kroku „u“ vlastní frekvence mostu. */
export const PASMO_SHODY = 0.08;
/** Do jakého odstupu je silná složka (běh, skákání) vlastní frekvenci ještě „blízko“. */
export const PASMO_BLIZKO = 0.2;

/** Složka kroku, která se potkává s vlastní frekvencí mostu, nebo je jí blízko. */
export interface Shoda {
  slozka: SlozkaKroku;
  /** Pořadí vlastní frekvence od 1 a její hodnoty pro prázdný a obsazený most, Hz. */
  poradi: number;
  prazdny: number;
  obsazeny: number | null;
  /** Odstup složky od vlastní frekvence jako podíl té frekvence; 0, když leží mezi prázdným a obsazeným mostem. */
  odstup: number;
}

/**
 * Všechny dvojice složka kroku – vlastní frekvence mostu, které jsou od sebe nejvýš o
 * `PASMO_BLIZKO`, od nejtěsnější. Most během přechodu kmitá někde mezi frekvencí prázdného
 * a obsazeného, skupina bez jednoho rytmu zabírá pásmo: odstup se měří mezi těmi rozmezími.
 */
export function shodyRytmu(slozky: readonly SlozkaKroku[], most: FrekvenceMostu): Shoda[] {
  const shody: Shoda[] = [];
  most.frekvence.forEach((prazdny, j) => {
    const obsazeny = most.frekvenceObsazeneho[j] ?? null;
    const dolni = Math.min(prazdny, obsazeny ?? prazdny);
    const horni = Math.max(prazdny, obsazeny ?? prazdny);
    for (const slozka of slozky) {
      const pod = dolni - (slozka.frekvence + slozka.pasmo);
      const nad = slozka.frekvence - slozka.pasmo - horni;
      const odstup = pod > 0 ? pod / dolni : nad > 0 ? nad / horni : 0;
      if (odstup <= PASMO_BLIZKO) shody.push({ slozka, poradi: j + 1, prazdny, obsazeny, odstup });
    }
  });
  return shody.sort((a, b) => a.odstup - b.odstup || b.slozka.sila - a.slozka.sila);
}

/** Co z nalezených shod říct hráči. */
export interface VyberShody {
  /** Dvojice, která most ohrožuje nejvíc; null, když žádná nestojí za řeč. */
  hlavni: Shoda | null;
  /** Leží hlavní složka přímo u vlastní frekvence (do `PASMO_SHODY`), nebo je jen blízko? */
  uVlastni: boolean;
  /** Všechny dvojice, které stojí za řeč, od nejzávažnější. */
  vsechny: Shoda[];
}

/** Nejmenší odstup, se kterým se počítá závažnost: těsněji než takhle už na rozdílu nesejde. */
const NEJMENSI_ODSTUP = 0.02;

/**
 * Vybere ze shod tu, o které má osa frekvencí mluvit. Za řeč stojí každá složka kroku, která
 * leží u vlastní frekvence (do `PASMO_SHODY`), a silná složka (běh, skákání) i o kus dál.
 * Závažnost je síla složky dělená odstupem: silný běh 13 % od vlastní frekvence most rozhoupe
 * spíš než slabý trojnásobek kroku chodce, který leží přímo u ní.
 */
export function hlavniShoda(shody: readonly Shoda[]): VyberShody {
  const zavaznost = (s: Shoda): number => s.slozka.sila / Math.max(s.odstup, NEJMENSI_ODSTUP);
  const vsechny = shody
    .filter((s) => s.odstup <= PASMO_SHODY || s.slozka.sila >= SILNA_SLOZKA)
    .sort((a, b) => zavaznost(b) - zavaznost(a) || a.odstup - b.odstup);
  const hlavni = vsechny[0] ?? null;
  return { hlavni, uVlastni: hlavni !== null && hlavni.odstup <= PASMO_SHODY, vsechny };
}

/**
 * Vlastní frekvence mostu, jak je hráč vidí na ose: u mostu s laděnými tlumiči jsou to frekvence
 * mostu bez nich. Tlumič vlastní frekvenci mostu rozdělí na dvě a žádná z nich není ta, na kterou
 * se ladí; hráč potřebuje vidět most a tlumič zvlášť.
 */
export function mostProHrace(rozbor: FrekvenceMostu & { bezTlumicu: { prazdny: number[]; obsazeny: number[] } | null }): FrekvenceMostu {
  return rozbor.bezTlumicu ? { frekvence: rozbor.bezTlumicu.prazdny, frekvenceObsazeneho: rozbor.bezTlumicu.obsazeny } : rozbor;
}
