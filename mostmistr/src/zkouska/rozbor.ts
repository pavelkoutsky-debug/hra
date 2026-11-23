// Rozbor mostu ve stavebním režimu (koncepce, kap. 7.8): má most klidovou polohu, na
// jakých frekvencích a v jakých tvarech kmitá, prázdný i obsazený lidmi, a jak silně
// odpovídá na buzení v různém rytmu (rezonanční křivka). Maticový výpočet bez časové
// simulace; trvá milisekundy až desítky milisekund, takže se dá pouštět po každé úpravě návrhu.

import { KATALOG } from "../data/katalog";
import type { NavrhMostu } from "../data/navrh";
import type { Uroven } from "../data/uroven";
import { TIHOVE_ZRYCHLENI } from "../jadro/integrator";
import { vlastniTvarySoustavy } from "../jadro/matice";
import { najdiKlid } from "../jadro/ustaleni";
import { ROZSAH_FREKVENCI } from "./kmitani";
import { najdiSlozeni } from "./slozeni";
import { rezonancniKrivka, zakladOdezvy, zmenenyZaklad } from "../jadro/odezva";
import { LANO, sestavSoustavu, type PopisSoustavy, type Soustava } from "../jadro/soustava";
import { volneStupne } from "../jadro/stupne";
import { mostovkaTrasy, mostSLidmi, odhadniKmitani, POCET_TVARU_ODHADU, type MostSLidmi, type OdhadKmitani } from "./odhad";
import { jeClovek } from "./provoz";
import type { RozborMostu } from "./protokol";
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

/** Co rozbor ví o mostě s lidmi: odhad kmitání a most, na kterém stojí největší skupina. */
interface LideNaMoste {
  odhad: OdhadKmitani | null;
  sLidmi: MostSLidmi | null;
  /** Vlastní frekvence prázdného mostu, Hz. */
  prazdny: number[];
  smer: RozborMostu["smer"];
}

/**
 * Spočítá, jak se most `stavba` v klidové poloze `klid` chová pod lidmi úrovně. `sRadou` přidá
 * i otázku, jestli by pomohl tužší nebo těžší most. Null, když se odezva nedá spočítat.
 */
function lideNaMoste(
  uroven: Uroven,
  stavba: StavbaMostu,
  klid: { s: Soustava; stupne: Int32Array },
  utlum: number,
  sRadou: boolean,
): LideNaMoste | null {
  const { stycniky, xs } = mostovkaTrasy(stavba, 0);
  if (stycniky.length < 2) return null;
  const zaklad = zakladOdezvy(klid.s, klid.stupne, stycniky, utlum, POCET_TVARU_ODHADU);
  if (!zaklad) return null;
  const odhad = odhadniKmitani(uroven, zaklad, xs);
  let smer: LideNaMoste["smer"] = null;
  if (sRadou && odhad && odhad.zrychleni > 0) {
    // Obměny mostu se zkoušejí jen se skupinou, která most rozkmitá nejvíc.
    const nejhorsi = odhad.skupiny.reduce((a, b) => (b.zrychleni > a.zrychleni ? b : a));
    const pomer = (tuhost: number, hmota: number): number =>
      (odhadniKmitani(uroven, zmenenyZaklad(zaklad, tuhost, hmota), xs, nejhorsi.polozka)?.zrychleni ?? nejhorsi.zrychleni) / nejhorsi.zrychleni;
    smer = {
      tuzsi: [pomer(ZMENY_PRO_RADU[0], 1), pomer(ZMENY_PRO_RADU[1], 1)],
      tezsi: [pomer(1, ZMENY_PRO_RADU[0]), pomer(1, ZMENY_PRO_RADU[1])],
    };
  }
  return {
    odhad,
    sLidmi: mostSLidmi(uroven, zaklad, xs, frekvenceKrivky(), POCET_FREKVENCI),
    prazdny: Array.from(zaklad.omega.subarray(0, POCET_FREKVENCI), (omega) => omega / (2 * Math.PI)).filter((f) => Number.isFinite(f) && f > 0),
    smer,
  };
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

/** Rozbor mostu z návrhu. Vyhodí chybu, když se most nedá sestavit. */
export function rozeberMost(uroven: Uroven, navrh: NavrhMostu): RozborMostu {
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
  const krivkaPrazdneho = uroven.rezonancniKrivka
    ? rezonancniKrivka(prazdny.s, prazdny.stupne, mostovka, frekvenceBuzeni, utlum)
    : null;

  // Most s lidmi: těla jako hmoty na pružinách v místech, kde skupina stojí (viz `odhad.ts`).
  const lideVUrovni = uroven.jizdniRad.some((p) => jeClovek(p.druh));
  const sLidmi = lideVUrovni && (uroven.osaFrekvenci || uroven.rezonancniKrivka);
  const maTlumice = stavba.tlumice.length > 0;
  const lide = sLidmi ? lideNaMoste(uroven, stavba, prazdny, utlum, !maTlumice) : null;
  const frekvenceObsazeneho = lide?.sLidmi?.frekvence.slice(0, frekvence.length) ?? [];
  const krivkaObsazeneho = uroven.rezonancniKrivka ? (lide?.sLidmi?.krivka ?? null) : null;

  // Most bez laděných tlumičů: ten ukazuje osa frekvencí a z něj se pozná, co tlumič má krotit.
  let bezTlumicu: RozborMostu["bezTlumicu"] = null;
  let odhadBezTlumicu: OdhadKmitani | null = null;
  if (maTlumice && sLidmi) {
    const holy: NavrhMostu = {
      ...navrh,
      stycniky: navrh.stycniky.map((st) => {
        const { tlumic: _tlumic, ...zbytek } = st;
        return zbytek;
      }),
    };
    const holaStavba = sestavMost(uroven, holy);
    const holyKlid = vKlidu(holaStavba.popis);
    const holyLide = holyKlid ? lideNaMoste(uroven, holaStavba, holyKlid, utlumStavby(holaStavba), false) : null;
    if (holyLide) {
      bezTlumicu = { prazdny: holyLide.prazdny, obsazeny: holyLide.sLidmi?.frekvence.slice(0, holyLide.prazdny.length) ?? [] };
      odhadBezTlumicu = holyLide.odhad;
    }
  }

  return {
    stabilni: true,
    frekvence,
    frekvenceObsazeneho,
    bezTlumicu,
    odhad: lide?.odhad ?? null,
    odhadBezTlumicu,
    smer: lide?.smer ?? null,
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
