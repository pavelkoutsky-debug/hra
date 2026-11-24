// Rozbor mostu ve stavebním režimu (koncepce, kap. 7.8): má most klidovou polohu, na
// jakých frekvencích a v jakých tvarech kmitá, prázdný i obsazený lidmi, jak silně
// odpovídá na buzení v různém rytmu (rezonanční křivka) a jak by pod lidmi úrovně kmital
// (odhad a ověřené rady). Maticový výpočet bez časové simulace: u mostů kampaně desítky až
// stovky milisekund, u velkého mostu v pískovišti přes sekundu. Běží v pracovním vlákně po
// každé úpravě návrhu.

import { KATALOG, LADENY_TLUMIC } from "../data/katalog";
import type { NavrhMostu } from "../data/navrh";
import type { Uroven } from "../data/uroven";
import { TIHOVE_ZRYCHLENI } from "../jadro/integrator";
import { MEZE_KOMFORTU } from "../jadro/komfort";
import { vlastniTvarySoustavy, type VlastniTvary } from "../jadro/matice";
import { najdiKlid } from "../jadro/ustaleni";
import { ROZSAH_FREKVENCI } from "./kmitani";
import { najdiSlozeni } from "./slozeni";
import { POCET_TVARU_ODEZVY, rezonancniKrivka, zakladOdezvy, zmenenyZaklad, type ZakladOdezvy } from "../jadro/odezva";
import { LANO, sestavSoustavu, type PopisSoustavy, type Soustava } from "../jadro/soustava";
import { volneStupne } from "../jadro/stupne";
import { mostovkaTrasy, mostSLidmi, odhadniKmitani, POCET_TVARU_ODHADU, type OdhadKmitani, type SlozkaOdhadu, type TlumicOdhadu, type VolbyOdhadu } from "./odhad";
import { jeClovek } from "./provoz";
import type { RadaKTlumici, RozborMostu } from "./protokol";
import { sestavMost, type StavbaMostu } from "./stavba";

/** Kolik nejnižších vlastních frekvencí a tvarů rozbor vrací. */
export const POCET_FREKVENCI = 3;
/** Rozsah a krok rezonanční křivky, Hz. Rozsah odpovídá ose frekvencí ve hře. */
export const KRIVKA_OD = 0.5;
export const KRIVKA_DO = ROZSAH_FREKVENCI;
export const KROK_KRIVKY = 0.025;
/** Poměrný útlum konstrukce, když ho nejde odvodit z materiálů. */
const VYCHOZI_UTLUM = 0.01;
/**
 * Kolikrát tužší a kolikrát těžší most se zkouší, když se hledá, co by kmitání zmenšilo:
 * o třetinu (úprava průřezů, pár závaží) a dvojnásobně (jiná konstrukce, hodně závaží).
 */
export const ZMENY_PRO_RADU = [1.3, 2] as const;
/**
 * Od jakého podílu meze kmitání se rady počítají. Hra je ukazuje až od 80 % meze; pod tímhle
 * podílem by je nikdo neviděl a stojí několik dalších odhadů.
 */
const RADY_OD = 0.6;
/** O kolik smí být tlumič vedle cíle (podíl frekvence), aby se počítal za naladěný. */
const NALADENO = 0.03;
/** Od jakého poměru k nejsilnější složce se rytmus zkouší jako cíl ladění. */
const SROVNATELNA_SLOZKA = 0.5;

/** Frekvence, ve kterých se rezonanční křivka počítá, Hz. */
export function frekvenceKrivky(): number[] {
  const pocet = Math.round((KRIVKA_DO - KRIVKA_OD) / KROK_KRIVKY) + 1;
  return Array.from({ length: pocet }, (_, i) => KRIVKA_OD + i * KROK_KRIVKY);
}

/** Soustava v klidové poloze pod vlastní tíhou a její volné stupně; null, když klidovou polohu nemá. */
function vKlidu(popis: PopisSoustavy): { s: Soustava; stupne: Int32Array } | null {
  const s = sestavSoustavu(popis);
  const stupne = volneStupne(s);
  if (!najdiKlid(s, stupne, TIHOVE_ZRYCHLENI)) return null;
  return { s, stupne };
}

/** Styčníky jádra, které patří mostovce (včetně skrytých dělicích). */
function stycnikyMostovky(stavba: StavbaMostu): number[] {
  const mostovka = new Set(stavba.trasy.flatMap((t) => t.pruty));
  const stycniky = new Set<number>();
  for (const prvek of stavba.popis.prvky) {
    if (prvek.prut !== undefined && mostovka.has(prvek.prut)) {
      stycniky.add(prvek.a);
      stycniky.add(prvek.b);
    }
  }
  return [...stycniky];
}

const BEZ_MOSTU: RozborMostu = {
  stabilni: false,
  frekvence: [],
  frekvenceObsazeneho: [],
  bezTlumicu: null,
  odhad: null,
  odhadBezTlumicu: null,
  smer: null,
  tlumic: null,
  viskozni: null,
  tvary: [],
  krivka: null,
  tahyLan: [],
  pruves: null,
  slozeni: null,
  volny: null,
};

/** Poměrný útlum konstrukce: průměr přes její prvky, stejně jako ve zkoušce. */
function utlumStavby(stavba: StavbaMostu): number {
  if (stavba.utlumPrvku.length === 0) return VYCHOZI_UTLUM;
  let utlum = 0;
  for (const u of stavba.utlumPrvku) utlum += u / stavba.utlumPrvku.length;
  return utlum;
}

/** Základ odezvy mostu pro odhad: místa začínají styčníky mostovky první trasy podle x. */
interface ZakladMostu {
  zaklad: ZakladOdezvy;
  /** Polohy styčníků mostovky, m. */
  xs: number[];
  /** Styčníky soustavy v pořadí míst základu. */
  mista: number[];
}

/**
 * Připraví základ odezvy mostu `stavba` v klidové poloze `klid`. `navic` jsou další styčníky
 * (s laděnými tlumiči), které mají být mezi místy. Null, když most nemá mostovku nebo tvary.
 */
function zakladMostu(
  stavba: StavbaMostu,
  klid: { s: Soustava; stupne: Int32Array },
  utlum: number,
  navic: readonly number[],
  tvary?: VlastniTvary | null,
): ZakladMostu | null {
  const { stycniky, xs } = mostovkaTrasy(stavba, 0);
  if (stycniky.length < 2) return null;
  const mista = [...stycniky];
  for (const i of navic) if (!mista.includes(i)) mista.push(i);
  const zaklad = zakladOdezvy(klid.s, klid.stupne, mista, utlum, POCET_TVARU_ODHADU, tvary);
  return zaklad ? { zaklad, xs, mista } : null;
}

/** Prvních čtrnáct vlastních tvarů soustavy: sdílí je základ odezvy a rezonanční křivka. */
function tvaryOdezvy(klid: { s: Soustava; stupne: Int32Array }): VlastniTvary | null {
  const n = klid.stupne.length;
  return n > 0 ? vlastniTvarySoustavy(klid.s, klid.stupne, Math.min(POCET_TVARU_ODEZVY, n)) : null;
}

/** Laděný tlumič návrhu jako odpružená hmota v místě základu. */
function tlumicOdhadu(misto: number, hmota: number, frekvence: number): TlumicOdhadu {
  const omega = 2 * Math.PI * frekvence;
  return { misto, hmota, tuhost: hmota * omega * omega, tlumeni: 2 * LADENY_TLUMIC.utlum * hmota * omega };
}

/** Frekvence, na kterou jde laděný tlumič nastavit a která je `f` nejblíž. */
function naKrokLadeni(f: number): number {
  const kroku = Math.round(f / LADENY_TLUMIC.krokFrekvence);
  return Math.min(LADENY_TLUMIC.nejvetsiFrekvence, Math.max(LADENY_TLUMIC.nejmensiFrekvence, kroku * LADENY_TLUMIC.krokFrekvence));
}

/**
 * Tah lan v soustavě `s` v N: pro každý prut návrhu průměr přes díly lana (0, když lano visí
 * povolené); null u prutu, který lano není.
 */
export function tahyLan(s: Soustava, navrh: NavrhMostu): (number | null)[] {
  const tahy: (number | null)[] = navrh.pruty.map((p) => (KATALOG[p.prvek].druh === "lano" ? 0 : null));
  const dilu = new Float64Array(navrh.pruty.length);
  for (let e = 0; e < s.pocetPrvku; e++) {
    const prut = s.prut[e]!;
    if (s.druh[e] !== LANO || prut < 0 || tahy[prut] === null || tahy[prut] === undefined) continue;
    const dx = s.x[s.prvekB[e]!]! - s.x[s.prvekA[e]!]!;
    const dy = s.y[s.prvekB[e]!]! - s.y[s.prvekA[e]!]!;
    const klidova = s.klidovaDelka[e]!;
    tahy[prut] = (tahy[prut] as number) + Math.max(0, (s.EA[e]! * (Math.sqrt(dx * dx + dy * dy) - klidova)) / klidova);
    dilu[prut] = dilu[prut]! + 1;
  }
  return tahy.map((tah, i) => (tah === null || !(dilu[i]! > 0) ? tah : tah / dilu[i]!));
}

/**
 * Kde a o kolik se mostovka v klidové poloze `s` nejvíc liší od výkresu. Hledá se jen mezi
 * styčníky návrhu (skryté dělicí styčníky mostovky hráč nevidí a nemá na ně jak ukázat).
 */
function pruvesMostovky(s: Soustava, stavba: StavbaMostu, mostovka: readonly number[]): RozborMostu["pruves"] {
  let nejvic = -1;
  let kde = -1;
  for (const i of mostovka) {
    const nakresleny = stavba.popis.stycniky[i];
    if (i >= stavba.stycnikuNavrhu || !nakresleny) continue;
    const odchylka = Math.abs(s.y[i]! - nakresleny.y);
    if (odchylka > nejvic) {
      nejvic = odchylka;
      kde = i;
    }
  }
  if (kde < 0) return null;
  return { metru: nejvic, stycnik: kde, nad: s.y[kde]! > stavba.popis.stycniky[kde]!.y };
}

/** Co rozbor ví o kmitání mostu pod lidmi. */
interface KmitaniPodLidmi {
  odhad: OdhadKmitani | null;
  bezTlumicu: OdhadKmitani | null;
  smer: RozborMostu["smer"];
  tlumic: RadaKTlumici | null;
  viskozni: number | null;
}

/**
 * Odhad kmitání mostu pod lidmi úrovně a ověřené rady. `holy` je základ odezvy mostu bez
 * laděných tlumičů (mezi jeho místy jsou i styčníky, ve kterých tlumiče návrhu visí).
 */
function kmitaniPodLidmi(uroven: Uroven, navrh: NavrhMostu, stavba: StavbaMostu, holy: ZakladMostu, nasada: number | undefined): KmitaniPodLidmi {
  const { zaklad, xs, mista } = holy;
  const volby: VolbyOdhadu = nasada === undefined ? {} : { nasada };
  const tlumice: (TlumicOdhadu & { frekvence: number })[] = [];
  for (const tl of stavba.tlumice) {
    const popis = navrh.stycniky[tl.stycnik]?.tlumic;
    const misto = mista.indexOf(tl.stycnik);
    if (popis && misto >= 0) tlumice.push({ ...tlumicOdhadu(misto, popis.hmota, popis.frekvence), frekvence: popis.frekvence });
  }
  const bezTlumicu = odhadniKmitani(uroven, zaklad, xs, volby);
  const odhad = tlumice.length > 0 ? odhadniKmitani(uroven, zaklad, xs, { ...volby, tlumice }) : bezTlumicu;
  const vysledek: KmitaniPodLidmi = { odhad, bezTlumicu, smer: null, tlumic: null, viskozni: null };
  if (!odhad || !bezTlumicu || !(odhad.zrychleni > 0)) return vysledek;

  // Obměny mostu se počítají jen v hrubých místech; poměr se bere k odhadu spočítanému stejně.
  const hrube = (z: ZakladOdezvy, t: readonly TlumicOdhadu[]): number => odhadniKmitani(uroven, z, xs, { ...volby, tlumice: t, hrube: true })?.zrychleni ?? 0;
  let dnes: number | null = null;
  const pomer = (z: ZakladOdezvy, t: readonly TlumicOdhadu[]): number => {
    dnes ??= hrube(zaklad, tlumice);
    return dnes > 0 ? hrube(z, t) / dnes : 1;
  };
  const mez = MEZE_KOMFORTU[uroven.nejhorsiKomfort - 1]!;
  const radit = odhad.zrychleni >= RADY_OD * mez;

  // Laděný tlumič: kam a na co.
  if (uroven.nejvetsiTlumic > 0 || tlumice.length > 0) {
    const nejhorsi = bezTlumicu.skupiny.reduce((a, b) => (b.zrychleni > a.zrychleni ? b : a));
    // Kam by tlumič patřil: styčník návrhu na mostovce nejblíž místu, kde most kmitá nejvíc.
    let kam = -1;
    const stred = (xs[0]! + xs[xs.length - 1]!) / 2;
    for (let j = 0; j < xs.length; j++) {
      if (mista[j]! >= stavba.stycnikuNavrhu || zaklad.fi.subarray(j * zaklad.omega.length, (j + 1) * zaklad.omega.length).every((f) => f === 0)) continue;
      // Při stejné vzdálenosti (nejvíc kmitá skrytý styčník uprostřed pole) ten blíž středu mostu.
      const dal = Math.abs(xs[j]! - xs[nejhorsi.stycnik]!) - (kam < 0 ? Infinity : Math.abs(xs[kam]! - xs[nejhorsi.stycnik]!));
      if (dal < -1e-9 || (Math.abs(dal) <= 1e-9 && Math.abs(xs[j]! - stred) < Math.abs(xs[kam]! - stred))) kam = j;
    }
    const nejvetsi = Math.max(uroven.nejvetsiTlumic, ...tlumice.map((t) => t.hmota));
    /** Tlumiče, se kterými se zkouší ladění na `f`: ty z návrhu, nebo jeden nový. */
    const naladene = (f: number): TlumicOdhadu[] =>
      tlumice.length > 0 ? tlumice.map((t) => tlumicOdhadu(t.misto, t.hmota, f)) : kam >= 0 ? [tlumicOdhadu(kam, nejvetsi, f)] : [];
    /**
     * Cíl ladění pro most s odhadem `podle`: nejsilnější složka kroku skupiny, která ho rozkmitá
     * nejvíc, a když je jich víc srovnatelných, ta, se kterou tlumiče `sada(f)` odhad sníží
     * nejvíc (tlumič zkrotí jen jednu). `a` je odhad s takovou sadou, pokud se počítal.
     */
    const vyberCil = (podle: OdhadKmitani, sada: (f: number) => readonly TlumicOdhadu[]): { slozka: SlozkaOdhadu; f: number; a: number | null } => {
      const horsi = podle.skupiny.reduce((x, y) => (y.zrychleni > x.zrychleni ? y : x));
      const kandidati = horsi.slozky.filter(
        (sl, i, vse) => sl.zrychleni >= SROVNATELNA_SLOZKA * vse[0]!.zrychleni && vse.findIndex((x) => naKrokLadeni(x.frekvence) === naKrokLadeni(sl.frekvence)) === i,
      );
      let slozka = kandidati[0] ?? horsi.slozky[0]!;
      let a: number | null = null;
      if (kandidati.length > 1 && sada(1).length > 0) {
        for (const kandidat of kandidati) {
          const odhadSKandidatem = hrube(zaklad, sada(naKrokLadeni(kandidat.frekvence)));
          if (a === null || odhadSKandidatem < a) {
            a = odhadSKandidatem;
            slozka = kandidat;
          }
        }
      }
      return { slozka, f: naKrokLadeni(slozka.frekvence), a };
    };
    const { slozka: cil, f, a: sCilem } = vyberCil(bezTlumicu, naladene);
    const tlumic: RadaKTlumici = {
      cil: f,
      polozka: cil.polozka,
      nasobek: cil.nasobek,
      novy: null,
      preladeny: null,
      tezsi: null,
      jinde: null,
      jindeX: null,
      zbyly: null,
      cile: [],
      dalsi: null,
      dalsiX: null,
      jeden: null,
    };
    vysledek.tlumic = tlumic;
    const kDnesku = (a: number | null, t: readonly TlumicOdhadu[]): number => {
      dnes ??= hrube(zaklad, tlumice);
      return dnes > 0 ? (a ?? hrube(zaklad, t)) / dnes : 1;
    };
    if (tlumice.length > 0) {
      // Most s tlumiči: který rytmus ho rozkmitá i s nimi. Na ten patří další tlumič, zavěšený
      // tam, kde most kmitá teď (ve styčníku návrhu, kde ještě žádný nevisí).
      const horsi = odhad.skupiny.reduce((x, y) => (y.zrychleni > x.zrychleni ? y : x));
      let kamDalsi = -1;
      for (let j = 0; j < xs.length; j++) {
        if (mista[j]! >= stavba.stycnikuNavrhu || tlumice.some((t) => t.misto === j)) continue;
        if (zaklad.fi.subarray(j * zaklad.omega.length, (j + 1) * zaklad.omega.length).every((x) => x === 0)) continue;
        if (kamDalsi < 0 || Math.abs(xs[j]! - xs[horsi.stycnik]!) < Math.abs(xs[kamDalsi]! - xs[horsi.stycnik]!) - 1e-9) kamDalsi = j;
      }
      const sDalsim = (fDalsi: number): TlumicOdhadu[] => (kamDalsi >= 0 ? [...tlumice, tlumicOdhadu(kamDalsi, nejvetsi, fDalsi)] : []);
      const zbyly = vyberCil(odhad, sDalsim);
      tlumic.zbyly = { cil: zbyly.f, polozka: zbyly.slozka.polozka, nasobek: zbyly.slozka.nasobek };
      if (radit && kamDalsi >= 0 && uroven.nejvetsiTlumic > 0) {
        tlumic.dalsi = kDnesku(zbyly.a, sDalsim(zbyly.f));
        tlumic.dalsiX = xs[kamDalsi]! - xs[0]!;
      }
      // Na co ladit každý z tlumičů, když ostatní zůstanou, jak jsou: na rytmus, který most
      // s těmi ostatními rozkmitá nejvíc. Jediný tlumič má cíl mostu bez tlumičů.
      tlumice.forEach((t, j) => {
        const stycnik = mista[t.misto]!;
        if (tlumice.length === 1) {
          tlumic.cile.push({ stycnik, cil: f, polozka: cil.polozka, nasobek: cil.nasobek });
          return;
        }
        const ostatni = tlumice.filter((_, k) => k !== j);
        const bezNej = odhadniKmitani(uroven, zaklad, xs, { ...volby, tlumice: ostatni, hrube: true });
        if (!bezNej || bezNej.skupiny.length === 0) return;
        const sNim = (fj: number): TlumicOdhadu[] => [...ostatni, tlumicOdhadu(t.misto, t.hmota, fj)];
        const jeho = vyberCil(bezNej, sNim);
        tlumic.cile.push({ stycnik, cil: jeho.f, polozka: jeho.slozka.polozka, nasobek: jeho.slozka.nasobek });
        // Jeden tlumič přeladěný na svůj cíl: počítá se jen tomu, který tak naladěný není.
        if (!radit || Math.abs(t.frekvence - jeho.f) <= NALADENO * jeho.f) return;
        const pomer = kDnesku(jeho.a, sNim(jeho.f));
        if (tlumic.jeden === null || pomer < tlumic.jeden.pomer) tlumic.jeden = { pomer, cil: jeho.f, x: xs[t.misto]! - xs[0]! };
      });
    }
    if (radit) {
      if (tlumice.length === 0) {
        if (kam >= 0 && uroven.nejvetsiTlumic > 0) tlumic.novy = kDnesku(sCilem, naladene(f));
      } else {
        if (tlumice.some((t) => Math.abs(t.frekvence - f) > NALADENO * f)) tlumic.preladeny = kDnesku(sCilem, naladene(f));
        if (uroven.nejvetsiTlumic > 0 && tlumice.some((t) => t.hmota < uroven.nejvetsiTlumic)) {
          tlumic.tezsi = kDnesku(null, tlumice.map((t) => tlumicOdhadu(t.misto, Math.max(t.hmota, uroven.nejvetsiTlumic), t.frekvence)));
        }
        const nejtezsi = tlumice.reduce((a, b) => (b.hmota > a.hmota ? b : a));
        if (kam >= 0 && nejtezsi.misto !== kam && !tlumice.some((t) => t.misto === kam)) {
          tlumic.jinde = kDnesku(null, tlumice.map((t) => (t === nejtezsi ? tlumicOdhadu(kam, t.hmota, t.frekvence) : t)));
          tlumic.jindeX = xs[kam]! - xs[0]!;
        }
      }
    }
  }
  const { tlumic } = vysledek;

  // Viskózní tlumič do kotvy: z každé kotvy pod mostovkou k nejbližšímu styčníku návrhu na
  // mostovce, kam tlumič dosáhne. Brzdí jen svislou složkou; zkouší se výchozí a největší tlumení.
  if (radit && uroven.povolenePrvky.includes("tlumic")) {
    const dosah = KATALOG.tlumic.nejvetsiDelka ?? 0;
    const m = zaklad.omega.length;
    const kotvene: { misto: number; podil: number }[] = [];
    for (const kotva of uroven.kotvy) {
      let nejbliz: { misto: number; delka: number; podil: number } | null = null;
      for (let j = 0; j < xs.length; j++) {
        const st = stavba.popis.stycniky[mista[j]!]!;
        const dy = st.y - kotva.y;
        const delka = Math.hypot(st.x - kotva.x, dy);
        if (mista[j]! >= stavba.stycnikuNavrhu || !(dy > 0.5) || delka > dosah) continue;
        if (zaklad.fi.subarray(j * m, (j + 1) * m).every((f) => f === 0)) continue;
        if (!nejbliz || delka < nejbliz.delka) nejbliz = { misto: j, delka, podil: (dy / delka) * (dy / delka) };
      }
      if (nejbliz) kotvene.push(nejbliz);
    }
    if (kotvene.length > 0) {
      const meze = KATALOG.tlumic.tlumeni;
      const stupne = meze ? [meze.vychozi, meze.nejvetsi] : [];
      // Tlumič do pevného bodu je „tělo“ s nekonečnou hmotou: na výchylku místa odpovídá jen svým tlumením.
      const sViskoznim = (tlumeni: number): number =>
        pomer(zaklad, [...tlumice, ...kotvene.map((k) => ({ misto: k.misto, hmota: 1e15, tuhost: 0, tlumeni: tlumeni * k.podil }))]);
      for (const tlumeni of stupne) vysledek.viskozni = Math.min(vysledek.viskozni ?? Infinity, sViskoznim(tlumeni));
    }
  }

  // Tužší, nebo těžší most? U mostu s tlumičem jen tehdy, když úprava tlumiče nepomůže.
  const tlumicPomuze = tlumic !== null && [tlumic.preladeny, tlumic.tezsi, tlumic.jinde, tlumic.dalsi, tlumic.jeden?.pomer ?? null].some((x) => x !== null && x <= 0.9);
  if (radit && !(tlumice.length > 0 && tlumicPomuze)) {
    const zmena = (tuhost: number, hmota: number): number => pomer(zmenenyZaklad(zaklad, tuhost, hmota), tlumice);
    vysledek.smer = {
      tuzsi: [zmena(ZMENY_PRO_RADU[0], 1), zmena(ZMENY_PRO_RADU[1], 1)],
      tezsi: [zmena(1, ZMENY_PRO_RADU[0]), zmena(1, ZMENY_PRO_RADU[1])],
    };
  }
  return vysledek;
}

/**
 * Rozbor mostu z návrhu. Vyhodí chybu, když se most nedá sestavit. `nasada` je násada, se kterou
 * most pojede zkouška: odhad kmitání podle ní zná fáze kroku jednotlivců (viz `VolbyOdhadu`).
 */
export function rozeberMost(uroven: Uroven, navrh: NavrhMostu, nasada?: number): RozborMostu {
  if (navrh.pruty.length === 0) return BEZ_MOSTU;
  const stavba = sestavMost(uroven, navrh);
  const prazdny = vKlidu(stavba.popis);
  // Most bez klidové polohy: aspoň říct, kde a proč se složí.
  if (!prazdny) return { ...BEZ_MOSTU, ...najdiSlozeni(uroven, navrh) };
  const n = prazdny.stupne.length;
  const vlastni = n > 0 ? vlastniTvarySoustavy(prazdny.s, prazdny.stupne, POCET_FREKVENCI) : null;
  if (n > 0 && !vlastni) return BEZ_MOSTU;

  const frekvence: number[] = [];
  const tvary: number[][] = [];
  if (vlastni) {
    // Kde v seznamu volných stupňů leží posuny styčníků návrhu.
    const poradi = new Map<number, number>();
    prazdny.stupne.forEach((kod, k) => poradi.set(kod, k));
    for (let j = 0; j < vlastni.omega.length; j++) {
      const f = vlastni.omega[j]! / (2 * Math.PI);
      if (!Number.isFinite(f) || !(f > 0)) continue;
      frekvence.push(f);
      // Tvar kmitání: posuny styčníků návrhu, největší z nich má velikost 1.
      const tvar: number[] = [];
      let nejvetsi = 0;
      for (let i = 0; i < stavba.stycnikuNavrhu; i++) {
        const kx = poradi.get(3 * i);
        const ky = poradi.get(3 * i + 1);
        const dx = kx === undefined ? 0 : vlastni.tvary[j * n + kx]!;
        const dy = ky === undefined ? 0 : vlastni.tvary[j * n + ky]!;
        tvar.push(dx, dy);
        nejvetsi = Math.max(nejvetsi, Math.hypot(dx, dy));
      }
      // Znaménko tak, aby největší svislá výchylka mířila dolů: tvary se pak mezi úpravami nepřeklápějí.
      let znamenko = 1;
      let nejvetsiSvisla = 0;
      for (let i = 1; i < tvar.length; i += 2) {
        if (Math.abs(tvar[i]!) > Math.abs(nejvetsiSvisla)) nejvetsiSvisla = tvar[i]!;
      }
      if (nejvetsiSvisla > 0) znamenko = -1;
      tvary.push(nejvetsi > 0 ? tvar.map((d) => (znamenko * d) / nejvetsi) : tvar);
    }
  }

  const utlum = utlumStavby(stavba);
  const mostovka = stycnikyMostovky(stavba);
  const frekvenceBuzeni = frekvenceKrivky();

  // Most s lidmi: těla jako hmoty na pružinách v místech, kde skupina stojí (viz `odhad.ts`).
  const lideVUrovni = uroven.jizdniRad.some((p) => jeClovek(p.druh));
  const sLidmi = lideVUrovni && (uroven.osaFrekvenci || uroven.rezonancniKrivka);
  const maTlumice = stavba.tlumice.length > 0;
  // Čtrnáct tvarů mostu se hledá jednou pro křivku i pro odhad.
  const tvaryMostu = n > 0 && (uroven.rezonancniKrivka || sLidmi) ? tvaryOdezvy(prazdny) : null;
  const krivkaPrazdneho = uroven.rezonancniKrivka
    ? rezonancniKrivka(prazdny.s, prazdny.stupne, mostovka, frekvenceBuzeni, utlum, tvaryMostu)
    : null;
  const celyMost = sLidmi ? zakladMostu(stavba, prazdny, utlum, [], tvaryMostu) : null;
  const mostSeSkupinou = celyMost ? mostSLidmi(uroven, celyMost.zaklad, celyMost.xs, frekvenceBuzeni, POCET_FREKVENCI) : null;
  const frekvenceObsazeneho = mostSeSkupinou?.frekvence.slice(0, frekvence.length) ?? [];
  const krivkaObsazeneho = uroven.rezonancniKrivka ? (mostSeSkupinou?.krivka ?? null) : null;

  // Odhad kmitání stojí na mostě bez laděných tlumičů; tlumiče se k němu připojují jako
  // odpružené hmoty. Tak jde stejným výpočtem zkusit i tlumič přeladěný, těžší nebo jinde.
  let bezTlumicu: RozborMostu["bezTlumicu"] = null;
  let odhad: OdhadKmitani | null = null;
  let odhadBezTlumicu: OdhadKmitani | null = null;
  let smer: RozborMostu["smer"] = null;
  let tlumic: RadaKTlumici | null = null;
  let viskozni: number | null = null;
  if (sLidmi) {
    let holy: ZakladMostu | null = celyMost;
    if (maTlumice) {
      const bez: NavrhMostu = {
        ...navrh,
        stycniky: navrh.stycniky.map((st) => {
          const { tlumic: _tlumic, ...zbytek } = st;
          return zbytek;
        }),
      };
      const holaStavba = sestavMost(uroven, bez);
      const holyKlid = vKlidu(holaStavba.popis);
      holy = holyKlid ? zakladMostu(holaStavba, holyKlid, utlumStavby(holaStavba), stavba.tlumice.map((tl) => tl.stycnik)) : null;
      if (holy) {
        const tvaruBezTlumicu = Array.from(holy.zaklad.omega.subarray(0, POCET_FREKVENCI), (omega) => omega / (2 * Math.PI)).filter((f) => Number.isFinite(f) && f > 0);
        const sLidmiBez = mostSLidmi(uroven, holy.zaklad, holy.xs, frekvenceBuzeni, POCET_FREKVENCI);
        bezTlumicu = { prazdny: tvaruBezTlumicu, obsazeny: sLidmiBez?.frekvence.slice(0, tvaruBezTlumicu.length) ?? [] };
      }
    }
    if (holy) {
      const kmitani = kmitaniPodLidmi(uroven, navrh, stavba, holy, nasada);
      odhad = kmitani.odhad;
      odhadBezTlumicu = maTlumice ? kmitani.bezTlumicu : null;
      smer = kmitani.smer;
      tlumic = kmitani.tlumic;
      viskozni = kmitani.viskozni;
    }
  }

  return {
    stabilni: true,
    frekvence,
    frekvenceObsazeneho,
    bezTlumicu,
    odhad,
    odhadBezTlumicu,
    smer,
    tlumic,
    viskozni,
    tvary,
    tahyLan: tahyLan(prazdny.s, navrh),
    pruves: pruvesMostovky(prazdny.s, stavba, mostovka),
    slozeni: null,
    volny: null,
    krivka: krivkaPrazdneho
      ? {
          od: KRIVKA_OD,
          krok: KROK_KRIVKY,
          // Křivka v m/s² na kilonewton: pro hráče čitelnější řád než na newton.
          prazdny: Array.from(krivkaPrazdneho, (h) => 1000 * h),
          obsazeny: krivkaObsazeneho ? Array.from(krivkaObsazeneho, (h) => 1000 * h) : null,
        }
      : null,
  };
}
