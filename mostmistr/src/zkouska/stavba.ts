// Převod prvků katalogu na popis, kterému rozumí fyzikální jádro.

import { KATALOG, LADENY_TLUMIC, vlastnostiPrutu, type IdPrvku, type VlastnostiPrutu } from "../data/katalog";
import { TIHOVE_ZRYCHLENI } from "../jadro/integrator";
import type { NavrhMostu } from "../data/navrh";
import type { Uroven } from "../data/uroven";
import {
  LANO,
  NOSNIK,
  popisPruziny,
  type PopisPrvku,
  type PopisSoustavy,
  type PopisStycniku,
} from "../jadro/soustava";

/** Popis prvku jádra bez koncových styčníků. */
export type PopisPrutu = Omit<PopisPrvku, "a" | "b">;

/**
 * Popis prutu daného prvku katalogu. `sirkaMostovky` se použije u prvků zadaných
 * na metr šířky, `hmotaNavic` je nenosná hmota v kg na metr (zábradlí, vozovka).
 */
export function popisPrutu(id: IdPrvku, sirkaMostovky: number, hmotaNavic = 0): PopisPrutu {
  return popisZVlastnosti(vlastnostiNeboChyba(id, sirkaMostovky), KATALOG[id].druh === "lano", hmotaNavic);
}

export function vlastnostiNeboChyba(id: IdPrvku, sirkaMostovky: number): VlastnostiPrutu {
  const v = vlastnostiPrutu(id, sirkaMostovky);
  if (!v) throw new Error(`Prvek ${id} nemá v katalogu průřez.`);
  return v;
}

function popisZVlastnosti(v: VlastnostiPrutu, lano: boolean, hmotaNavic: number): PopisPrutu {
  const popis: PopisPrutu = {
    druh: lano ? LANO : NOSNIK,
    EA: v.EA,
    EI: v.EI,
    GAs: v.GAs,
    hmotnostNaMetr: v.hmotnostNaMetr + hmotaNavic,
    polomerSetrvacnosti: v.polomerSetrvacnosti,
    unosnost: { ...v.unosnost },
  };
  if (v.pretrzeni) {
    popis.tvarny = {
      silaPretrzeni: v.pretrzeni.sila,
      mezniNatoceni: v.pretrzeni.mezniNatoceni,
      mezniProtazeni: v.pretrzeni.mezniProtazeni,
    };
  }
  return popis;
}

// ---------------------------------------------------------------------------------------
// Stavba výpočetní soustavy z návrhu mostu a úrovně.

/**
 * Horní mez pásma frekvencí, na kterých záleží: kroky lidí, houpání vozidel i poskakování
 * náprav leží pod ní. Prut, jehož vlastní ohybové kmitání do pásma spadá, se skrytě dělí.
 */
export const PASMO_FREKVENCI = 30;
/** Nejkratší díl skrytě děleného prutu v metrech; kratší by zbytečně zkracoval krok výpočtu. */
export const NEJKRATSI_DIL = 1;
/** Délka dílu lana v metrech: lano se dělí vždy, aby mělo průvěs a mohlo kmitat. */
const DIL_LANA = 2;
const NEJVIC_DILU_LANA = 16;
/** Hmotnost pružiny a tlumiče na metr délky (kování, píst), kg/m. */
const HMOTNOST_PRUZINY = 20;
/** Jak daleko od spojnice trasy smí ležet styčník mostovky, aby k trase patřil, v metrech. */
const TOLERANCE_TRASY = 0.5;

/**
 * Na kolik dílů se skrytě rozdělí nosník délky `delka`. Dva díly vystihnou první ohybový
 * tvar prutu s chybou pod 1 %, čtyři i druhý (viz docs/M1A-MERENI.md); na každý tvar,
 * který leží v pásmu, se proto berou dva díly.
 */
export function pocetDiluNosniku(delka: number, EI: number, hmotnostNaMetr: number): number {
  const nejvic = Math.floor(delka / NEJKRATSI_DIL);
  if (nejvic < 2 || !(EI > 0)) return 1;
  // První ohybová frekvence kloubově uloženého prutu; n-tá je n²krát vyšší.
  const prvni = (Math.PI / (2 * delka * delka)) * Math.sqrt(EI / hmotnostNaMetr);
  const tvaruVPasmu = Math.floor(Math.sqrt(PASMO_FREKVENCI / prvni));
  return Math.max(1, Math.min(2 * tvaruVPasmu, nejvic));
}

export function pocetDiluLana(delka: number): number {
  return Math.max(1, Math.min(NEJVIC_DILU_LANA, Math.floor(delka / DIL_LANA)));
}

/** Most převedený na soustavu jádra a vše, co je potřeba k návratu od výsledků k návrhu. */
export interface StavbaMostu {
  popis: PopisSoustavy;
  /**
   * Prvních tolik styčníků jádra odpovídá styčníkům návrhu ve stejném pořadí; další
   * vznikly skrytým dělením. Číslo prutu každého prvku je index prutu v návrhu.
   */
  stycnikuNavrhu: number;
  /** Poměrný útlum materiálu každého prvku jádra. */
  utlumPrvku: Float64Array;
  /** Pruty mostovky každé trasy úrovně (indexy v návrhu). */
  trasy: { id: string; pruty: number[] }[];
  /**
   * Laděné tlumiče: styčník návrhu, pod kterým visí, styčník jádra se závažím a prvek
   * jádra (pružina s tlumičem), který je spojuje.
   */
  tlumice: { stycnik: number; zavazi: number; prvek: number }[];
}

/**
 * Sestaví popis soustavy z návrhu mostu v dané úrovni. Předpokládá návrh, který prošel
 * kontrolou `zkontrolujNavrh`; s prvkem, který jádro ještě neumí (píst), skončí chybou.
 *
 * Pravidla:
 * - Styčník návrhu ležící v kotvě úrovně je podepřen podle jejího typu. Styčník v místě
 *   základu je vetknut (pata pilíře).
 * - Konec prutu je kloubový, pokud styčník není svařený nebo vetknutý. Lana, pružiny
 *   a tlumiče jsou kloubové vždy; betonový pilíř je naopak do styčníku vetknutý vždy.
 * - Dlouhé pruty a lana se skrytě dělí; díly jsou spojené tuze a sdílejí číslo prutu.
 * - Mostovka nese navíc hmotnost vybavení z úrovně.
 */
export function sestavMost(uroven: Uroven, navrh: NavrhMostu): StavbaMostu {
  const popis: PopisSoustavy = { stycniky: [], prvky: [] };
  const index = new Map<number, number>();
  const tuhy: boolean[] = [];

  navrh.stycniky.forEach((st, i) => {
    index.set(st.id, i);
    const stycnik: PopisStycniku = { x: st.x, y: st.y };
    if (st.zavazi) stycnik.hmota = st.zavazi;
    let svar = st.svar === true;
    const kotva = uroven.kotvy.find((k) => k.x === st.x && k.y === st.y);
    const zaklad = uroven.zaklady.some((z) => z.x === st.x && z.y === st.y);
    if (kotva?.typ === "vetknuti" || zaklad) {
      Object.assign(stycnik, { pevneX: true, pevneY: true, pevneNatoceni: true });
      svar = true;
    } else if (kotva?.typ === "pevna") {
      Object.assign(stycnik, { pevneX: true, pevneY: true });
    } else if (kotva?.typ === "posuvna") {
      stycnik.pevneY = true;
    }
    popis.stycniky.push(stycnik);
    tuhy.push(svar);
  });

  const utlumy: number[] = [];
  const mostovka: number[] = [];
  navrh.pruty.forEach((prut, cislo) => {
    const a = index.get(prut.a);
    const b = index.get(prut.b);
    if (a === undefined || b === undefined) throw new Error(`Prut ${prut.id} vede do styčníku, který v návrhu není.`);
    const sa = popis.stycniky[a]!;
    const sb = popis.stycniky[b]!;
    const delka = Math.sqrt((sb.x - sa.x) * (sb.x - sa.x) + (sb.y - sa.y) * (sb.y - sa.y));
    const druh = KATALOG[prut.prvek].druh;

    if (druh === "pist") throw new Error(`Prut ${prut.id}: píst jádro zatím neumí.`);
    if (druh === "pruzina" || druh === "tlumic") {
      popis.prvky.push({
        ...popisPruziny(a, b, prut.tuhost ?? 0, prut.tlumeni ?? KATALOG[prut.prvek].tlumeni?.vychozi ?? 0, HMOTNOST_PRUZINY),
        prut: cislo,
      });
      utlumy.push(0);
      return;
    }

    const vlastnosti = vlastnostiNeboChyba(prut.prvek, uroven.sirkaMostovky);
    const jeMostovka = druh === "mostovka";
    const zaklad = popisZVlastnosti(vlastnosti, druh === "lano", jeMostovka ? uroven.hmotnostVybaveni : 0);
    if (jeMostovka) mostovka.push(cislo);

    const dilu =
      druh === "lano" ? pocetDiluLana(delka) : pocetDiluNosniku(delka, zaklad.EI, zaklad.hmotnostNaMetr);
    // Předpětí lana: klidová délka se zkrátí tak, aby v napnutém laně byla zadaná síla;
    // záporné předpětí lano naopak prodlouží (viz `PREDPETI_LANA`).
    const predpeti = druh === "lano" ? (prut.predpeti ?? 0) * vlastnosti.unosnost.tah : 0;
    const klidovaDelka = delka / dilu / (1 + predpeti / zaklad.EA);

    let predchozi = a;
    for (let i = 0; i < dilu; i++) {
      let dalsi = b;
      if (i < dilu - 1) {
        const t = (i + 1) / dilu;
        dalsi = popis.stycniky.length;
        popis.stycniky.push({ x: sa.x + t * (sb.x - sa.x), y: sa.y + t * (sb.y - sa.y) });
      }
      const prvek: PopisPrvku = { ...zaklad, a: predchozi, b: dalsi, prut: cislo, klidovaDelka };
      if (druh !== "lano") {
        prvek.vzpernaDelka = delka;
        // Betonový pilíř je monolit: do styčníku je vetknutý vždy, takže dva pilíře nad
        // sebou tvoří jeden průběžný sloup. Ostatní pruty jsou tuhé jen ve svaru.
        const monolit = druh === "pilir";
        if (i === 0) prvek.kloubA = !(tuhy[a] || monolit);
        if (i === dilu - 1) prvek.kloubB = !(tuhy[b] || monolit);
      }
      popis.prvky.push(prvek);
      utlumy.push(vlastnosti.utlum);
      predchozi = dalsi;
    }
  });

  // Mostovka patří k trase, podél jejíž spojnice leží.
  const trasy = uroven.trasy.map((trasa) => {
    const dx = trasa.konec.x - trasa.zacatek.x;
    const dy = trasa.konec.y - trasa.zacatek.y;
    const delka = Math.sqrt(dx * dx + dy * dy);
    const naTrase = (i: number): boolean => {
      const st = popis.stycniky[i]!;
      const podel = ((st.x - trasa.zacatek.x) * dx + (st.y - trasa.zacatek.y) * dy) / delka;
      const napric = ((st.x - trasa.zacatek.x) * dy - (st.y - trasa.zacatek.y) * dx) / delka;
      return podel >= -1e-9 && podel <= delka + 1e-9 && Math.abs(napric) <= TOLERANCE_TRASY;
    };
    const kolej = trasa.druh === "kolej";
    const pruty = mostovka.filter((cislo) => {
      const prut = navrh.pruty[cislo]!;
      if ((prut.prvek === "kolejiste") !== kolej) return false;
      return naTrase(index.get(prut.a)!) && naTrase(index.get(prut.b)!);
    });
    return { id: trasa.id, pruty };
  });

  // Laděné tlumiče: závaží visí pod styčníkem na pružině s tlumičem a hýbe se jen svisle.
  // Pružina je zkrácená o protažení vlastní tíhou závaží, takže závaží v klidu visí přesně
  // o délku závěsu pod styčníkem, ať je naladěné jakkoli.
  const tlumice: StavbaMostu["tlumice"] = [];
  navrh.stycniky.forEach((st, i) => {
    if (!st.tlumic) return;
    const { hmota, frekvence } = st.tlumic;
    const omega = 2 * Math.PI * frekvence;
    const tuhost = hmota * omega * omega;
    const zavazi = popis.stycniky.length;
    popis.stycniky.push({ x: st.x, y: st.y - LADENY_TLUMIC.zaves, pevneX: true, hmota });
    const prvek = popis.prvky.length;
    popis.prvky.push({
      ...popisPruziny(i, zavazi, tuhost, 2 * LADENY_TLUMIC.utlum * hmota * omega),
      klidovaDelka: LADENY_TLUMIC.zaves - (hmota * TIHOVE_ZRYCHLENI) / tuhost,
      prut: -1,
    });
    utlumy.push(0);
    tlumice.push({ stycnik: i, zavazi, prvek });
  });

  return { popis, stycnikuNavrhu: navrh.stycniky.length, utlumPrvku: Float64Array.from(utlumy), trasy, tlumice };
}
