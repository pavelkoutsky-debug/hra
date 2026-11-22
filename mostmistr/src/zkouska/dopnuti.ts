// Automatické dopnutí lan (koncepce, kap. 5 a 7.8): najde předpětí lan, se kterým most pod
// vlastní tíhou drží nakreslený tvar.
//
// Postup je tlumená Gaussova–Newtonova metoda nad maticovou statikou. V klidové poloze mostu se
// spočítá, o kolik se sledované styčníky hnou, když se jedno lano dotáhne o jednotku
// (vlivová matice: dotažení lana je dvojice sil v jeho koncích, posun dá tečná matice
// tuhosti). Z toho vyjde metodou nejmenších čtverců oprava předpětí, most se s ní znovu
// ustálí a výpočet se opakuje, dokud se tvar zlepšuje. Lana jsou nelineární (průvěs), takže
// jeden krok nestačí; obvykle stačí tři až pět.
//
// Co se sleduje, od nejdůležitějšího:
// 1. svislá poloha styčníků mostovky (mostovka má zůstat tam, kde je nakreslená);
// 2. vodorovná poloha ostatních styčníků, do kterých vedou lana a zároveň pruty nebo pilíře
//    (hlava pylonu se nemá naklánět: kotevní lana vyrovnají tah lan z pole);
// 3. s malou vahou poloha styčníků, ve kterých se stýkají jen lana (body nosného lana);
// 4. každé lano má pod vlastní tíhou mostu zůstat napnuté, jinak by nic neneslo.
//
// Nosné lano visutého mostu se pod tíhou vyrovná do tvaru, který odpovídá zatížení, a
// předpětím se s tím nic nenadělá. Závěsy se mu proto přizpůsobí délkou (napínák je smí
// zkrátit i prodloužit o desítky centimetrů): mostovka pak zůstane rovná, i když nosné lano
// není nakreslené přesně jako parabola.

import { KATALOG, PREDPETI_LANA } from "../data/katalog";
import type { NavrhMostu } from "../data/navrh";
import type { Uroven } from "../data/uroven";
import { TIHOVE_ZRYCHLENI } from "../jadro/integrator";
import { choleskehoRozklad, sestavMaticiTuhosti, vyresRozkladem } from "../jadro/matice";
import { LANO, sestavSoustavu, type Soustava } from "../jadro/soustava";
import { volneStupne } from "../jadro/stupne";
import { najdiKlid } from "../jadro/ustaleni";
import { sestavMost, vlastnostiNeboChyba, type StavbaMostu } from "./stavba";

/** Nejvíc ustálení mostu, která si dopnutí dovolí. */
const NEJVIC_POKUSU = 60;
/** Odchylka mostovky, se kterou je dopnutí hotové, v metrech. */
const PRESNOST_TVARU = 5e-4;
/** Zlepšení, pro které už nemá cenu most znovu ustalovat, v metrech odchylky. */
const NEPATRNE_ZLEPSENI = 2e-4;
/** Rozsah tlumení kroku (viz `linearizuj`): od skoro plného kroku po velmi opatrný. */
const NEJMENSI_TLUMENI = 1e-6;
const NEJVETSI_TLUMENI = 1e4;
/** Váha polohy styčníků, ve kterých se stýkají jen lana, proti svislé poloze mostovky. */
const VAHA_BODU_LANA = 0.05;
/** Nejmenší tah, který má v každém laně pod vlastní tíhou mostu zůstat, jako podíl jeho pevnosti. */
const NEJMENSI_TAH = 0.05;
/** Váha chybějícího tahu: chybí-li lanu procento pevnosti, je to jako deset centimetrů odchylky mostovky. */
const VAHA_TAHU = 10;

export interface VysledekDopnuti {
  /** Nové předpětí každého lana: id prutu → podíl pevnosti. */
  predpeti: Map<number, number>;
  /** Největší svislá odchylka mostovky od nakresleného tvaru před dopnutím a po něm, v metrech. */
  pred: number;
  po: number;
}

interface Sledovany {
  /** Kód stupně volnosti (styčník · 3 + směr) a jeho váha. */
  kod: number;
  vaha: number;
  mostovka: boolean;
}

/** Stav mostu s daným předpětím lan v klidové poloze. */
interface Ustaleny {
  stavba: StavbaMostu;
  s: Soustava;
  stupne: Int32Array;
  /** Odchylky sledovaných stupňů od nakresleného tvaru, m. */
  odchylky: Float64Array;
  /** Tah každého lana jako podíl pevnosti; záporný u lana, které visí. */
  tahy: Float64Array;
  /** Vážený součet čtverců odchylek a největší odchylka mostovky. */
  cena: number;
  nejvetsi: number;
}

/** Lano návrhu, jak ho výpočet potřebuje. */
interface Lano {
  /** Pořadí prutu v návrhu a pořadí jeho koncových styčníků. */
  cislo: number;
  a: number;
  b: number;
  pevnost: number;
  EA: number;
}

function sPredpetim(navrh: NavrhMostu, lana: readonly number[], predpeti: Float64Array): NavrhMostu {
  const pruty = navrh.pruty.map((p) => ({ ...p }));
  lana.forEach((cislo, j) => {
    pruty[cislo]!.predpeti = predpeti[j]!;
  });
  return { ...navrh, pruty };
}

/**
 * Navrhne předpětí lan mostu. Vrací null, když most žádné lano nemá, když nemá klidovou
 * polohu, nebo když lana nemají na co působit. Návrh musí vyhovovat pravidlům úrovně
 * (jinak `sestavMost` skončí chybou).
 */
export function dopniLana(uroven: Uroven, navrh: NavrhMostu): VysledekDopnuti | null {
  const poradi = new Map(navrh.stycniky.map((st, i) => [st.id, i]));
  const lana: Lano[] = [];
  // Sledované stupně se odvodí z toho, co do kterého styčníku vede.
  const mostovka = new Set<number>();
  const konceLan = new Set<number>();
  const nosne = new Set<number>();
  navrh.pruty.forEach((p, cislo) => {
    const druh = KATALOG[p.prvek].druh;
    const a = poradi.get(p.a);
    const b = poradi.get(p.b);
    if (a === undefined || b === undefined) return;
    if (druh === "lano") {
      const v = vlastnostiNeboChyba(p.prvek, uroven.sirkaMostovky);
      lana.push({ cislo, a, b, pevnost: v.unosnost.tah, EA: v.EA });
      konceLan.add(a);
      konceLan.add(b);
      return;
    }
    if (druh === "mostovka") {
      mostovka.add(a);
      mostovka.add(b);
    }
    if (druh !== "tlumic" && druh !== "pruzina") {
      nosne.add(a);
      nosne.add(b);
    }
  });
  if (lana.length === 0) return null;
  const m = lana.length;
  const cisla = lana.map((l) => l.cislo);

  const zmer = (stav: Ustaleny, sledovane: readonly Sledovany[]): void => {
    stav.odchylky = new Float64Array(sledovane.length);
    stav.cena = 0;
    stav.nejvetsi = 0;
    sledovane.forEach((sl, r) => {
      const i = (sl.kod / 3) | 0;
      const nakreslene = stav.stavba.popis.stycniky[i]!;
      const u = sl.kod % 3 === 0 ? stav.s.x[i]! - nakreslene.x : stav.s.y[i]! - nakreslene.y;
      stav.odchylky[r] = u;
      stav.cena += sl.vaha * sl.vaha * u * u;
      if (sl.mostovka) stav.nejvetsi = Math.max(stav.nejvetsi, Math.abs(u));
    });
    // Tah lana: průměr přes jeho díly (záporný, když lano visí a jeho díly jsou kratší než klidová délka).
    stav.tahy = new Float64Array(m);
    const dilu = new Float64Array(m);
    const sloupec = new Map(cisla.map((cislo, j) => [cislo, j]));
    const { s } = stav;
    for (let e = 0; e < s.pocetPrvku; e++) {
      if (s.druh[e] !== LANO) continue;
      const j = sloupec.get(s.prut[e]!);
      if (j === undefined) continue;
      const dx = s.x[s.prvekB[e]!]! - s.x[s.prvekA[e]!]!;
      const dy = s.y[s.prvekB[e]!]! - s.y[s.prvekA[e]!]!;
      const klidova = s.klidovaDelka[e]!;
      stav.tahy[j] = stav.tahy[j]! + (s.EA[e]! * (Math.sqrt(dx * dx + dy * dy) - klidova)) / klidova / lana[j]!.pevnost;
      dilu[j] = dilu[j]! + 1;
    }
    for (let j = 0; j < m; j++) {
      if (dilu[j]! > 0) stav.tahy[j] = stav.tahy[j]! / dilu[j]!;
      const chybi = NEJMENSI_TAH - stav.tahy[j]!;
      if (chybi > 0) stav.cena += VAHA_TAHU * VAHA_TAHU * chybi * chybi;
    }
  };
  /**
   * Most s daným předpětím v klidové poloze. S `odkud` začíná hledání v poloze tohoto stavu
   * (stavba je stejná, liší se jen délky lan): bývá blízko a výpočet je několikrát rychlejší.
   */
  const ustal = (predpeti: Float64Array, sledovane: readonly Sledovany[] | null, odkud?: Ustaleny): Ustaleny | null => {
    const stavba = sestavMost(uroven, sPredpetim(navrh, cisla, predpeti));
    let s = sestavSoustavu(stavba.popis);
    let stupne = volneStupne(s);
    let nalezeno = false;
    if (odkud && odkud.s.pocetStycniku === s.pocetStycniku) {
      s.x.set(odkud.s.x);
      s.y.set(odkud.s.y);
      s.cosN.set(odkud.s.cosN);
      s.sinN.set(odkud.s.sinN);
      nalezeno = najdiKlid(s, stupne, TIHOVE_ZRYCHLENI);
      if (!nalezeno) {
        s = sestavSoustavu(stavba.popis);
        stupne = volneStupne(s);
      }
    }
    if (!nalezeno && !najdiKlid(s, stupne, TIHOVE_ZRYCHLENI)) return null;
    const stav: Ustaleny = {
      stavba,
      s,
      stupne,
      odchylky: new Float64Array(0),
      tahy: new Float64Array(0),
      cena: 0,
      nejvetsi: 0,
    };
    if (sledovane) zmer(stav, sledovane);
    return stav;
  };

  let predpeti = Float64Array.from(cisla, (cislo) => navrh.pruty[cislo]!.predpeti ?? 0);
  // Povolené lano nemá na most žádný vliv a výpočet by ho neuměl dotáhnout: začíná se s napnutým.
  const vychozi = predpeti.map((p) => Math.max(p, PREDPETI_LANA.vychozi));
  let stav = ustal(vychozi, null);
  if (!stav) return null;

  // Volné stupně sledovaných styčníků se určí z první ustálené soustavy; stavba se s předpětím nemění.
  const volne = new Set<number>(stav.stupne);
  const sledovane: Sledovany[] = [];
  for (const i of mostovka) if (volne.has(3 * i + 1)) sledovane.push({ kod: 3 * i + 1, vaha: 1, mostovka: true });
  for (const i of konceLan) {
    if (mostovka.has(i)) continue;
    if (nosne.has(i)) {
      // Hlava pylonu: svisle ji drží pylon sám, lana rozhodují o tom, jestli se nakloní.
      if (volne.has(3 * i)) sledovane.push({ kod: 3 * i, vaha: 1, mostovka: false });
      continue;
    }
    if (volne.has(3 * i)) sledovane.push({ kod: 3 * i, vaha: VAHA_BODU_LANA, mostovka: false });
    if (volne.has(3 * i + 1)) sledovane.push({ kod: 3 * i + 1, vaha: VAHA_BODU_LANA, mostovka: false });
  }
  if (sledovane.length === 0) return null;
  zmer(stav, sledovane);

  // Odchylka před dopnutím se měří s předpětím, jaké návrh opravdu má.
  const puvodni = ustal(predpeti, sledovane);
  const pred = puvodni ? puvodni.nejvetsi : Infinity;

  predpeti = vychozi;
  let nejlepsi = { predpeti, cena: stav.cena, nejvetsi: stav.nejvetsi };
  if (puvodni && puvodni.cena < nejlepsi.cena) {
    nejlepsi = {
      predpeti: Float64Array.from(cisla, (cislo) => navrh.pruty[cislo]!.predpeti ?? 0),
      cena: puvodni.cena,
      nejvetsi: puvodni.nejvetsi,
    };
  }

  // Levenbergova–Marquardtova metoda: krok z lineárního odhadu se zkusí, a když tvar nezlepší
  // (lana jsou nelineární a odhad platí jen poblíž), zkusí se opatrnější krok se silnějším
  // tlumením. Po úspěchu tlumení zase klesá. Linearizace se při tom nepočítá znovu.
  let pokusu = 2;
  let tlumeni = NEJMENSI_TLUMENI;
  while (pokusu < NEJVIC_POKUSU && stav.cena > PRESNOST_TVARU * PRESNOST_TVARU) {
    const odhad = linearizuj(stav, sledovane, lana);
    if (!odhad) break;
    let dalsi: Ustaleny | null = null;
    let dalsiPredpeti = predpeti;
    while (pokusu < NEJVIC_POKUSU && tlumeni <= NEJVETSI_TLUMENI) {
      const oprava = odhad(tlumeni);
      if (!oprava) break;
      const zkusene = new Float64Array(m);
      for (let j = 0; j < m; j++) {
        zkusene[j] = Math.max(PREDPETI_LANA.nejmensi, Math.min(PREDPETI_LANA.nejvetsi, predpeti[j]! + oprava[j]!));
      }
      const zkouseny = ustal(zkusene, sledovane, stav);
      pokusu += 1;
      if (zkouseny && zkouseny.cena < stav.cena) {
        dalsi = zkouseny;
        dalsiPredpeti = zkusene;
        tlumeni = Math.max(NEJMENSI_TLUMENI, tlumeni / 4);
        break;
      }
      tlumeni *= 8;
    }
    if (!dalsi) break;
    const zlepseni = stav.cena - dalsi.cena;
    stav = dalsi;
    predpeti = dalsiPredpeti;
    if (stav.cena < nejlepsi.cena) nejlepsi = { predpeti, cena: stav.cena, nejvetsi: stav.nejvetsi };
    // Dál už se tvar nezlepšuje: nakreslený tvar lana přesně splnit neumějí.
    if (zlepseni < Math.max(1e-3 * stav.cena, NEPATRNE_ZLEPSENI * NEPATRNE_ZLEPSENI)) break;
  }

  // Výsledek zaokrouhlený na krok napínáku a změřený tak, jak ho uvidí hráč.
  const zaokrouhlene = nejlepsi.predpeti.map((p) => Math.round(p / PREDPETI_LANA.presnost) * PREDPETI_LANA.presnost);
  const konecny = ustal(zaokrouhlene, sledovane);
  const vysledek = new Map<number, number>();
  cisla.forEach((cislo, j) => vysledek.set(navrh.pruty[cislo]!.id, Math.round(zaokrouhlene[j]! * 1000) / 1000));
  return { predpeti: vysledek, pred, po: konecny ? konecny.nejvetsi : nejlepsi.nejvetsi };
}

/**
 * Lineární odhad mostu kolem stavu `stav`: vrací funkci, která pro dané tlumení spočítá opravu
 * předpětí lan, jež podle odhadu nejvíc zmenší odchylky sledovaných stupňů a chybějící tah
 * povolených lan. Silnější tlumení dává kratší, opatrnější krok. Null, když matice tuhosti
 * nejde rozložit nebo lana na sledované stupně nepůsobí.
 */
function linearizuj(
  stav: Ustaleny,
  sledovane: readonly Sledovany[],
  lana: readonly Lano[],
): ((tlumeni: number) => Float64Array | null) | null {
  const { s, stupne } = stav;
  const n = stupne.length;
  const m = lana.length;
  const K = sestavMaticiTuhosti(s, stupne);
  if (!choleskehoRozklad(K, n)) return null;
  const kde = new Map<number, number>();
  stupne.forEach((kod, k) => kde.set(kod, k));
  const sloupecLana = new Map(lana.map((l, j) => [l.cislo, j]));

  // Síly od jednotkového dotažení každého lana: v každém dílu lana dvojice sil, která táhne
  // jeho konce k sobě. Derivace síly v dílu podle předpětí je pevnost · L / (délka dílu v návrhu).
  const posuny = Array.from({ length: m }, () => new Float64Array(n));
  for (let e = 0; e < s.pocetPrvku; e++) {
    if (s.druh[e] !== LANO) continue;
    const j = sloupecLana.get(s.prut[e]!);
    if (j === undefined) continue;
    const a = s.prvekA[e]!;
    const b = s.prvekB[e]!;
    const dx = s.x[b]! - s.x[a]!;
    const dy = s.y[b]! - s.y[a]!;
    const delka = Math.sqrt(dx * dx + dy * dy);
    if (!(delka > 0)) continue;
    const pa = stav.stavba.popis.stycniky[a]!;
    const pb = stav.stavba.popis.stycniky[b]!;
    const nakreslena = Math.sqrt((pb.x - pa.x) * (pb.x - pa.x) + (pb.y - pa.y) * (pb.y - pa.y));
    const sila = (lana[j]!.pevnost * delka) / nakreslena;
    const f = posuny[j]!;
    const pricti = (kod: number, hodnota: number): void => {
      const k = kde.get(kod);
      if (k !== undefined) f[k] = f[k]! + hodnota;
    };
    pricti(3 * a, (sila * dx) / delka);
    pricti(3 * a + 1, (sila * dy) / delka);
    pricti(3 * b, (-sila * dx) / delka);
    pricti(3 * b + 1, (-sila * dy) / delka);
  }
  // Ze sil posuny: posuny[j] je odezva soustavy na jednotkové dotažení lana j.
  for (let j = 0; j < m; j++) vyresRozkladem(K, n, posuny[j]!);

  // Vlivová matice sledovaných stupňů (s vahou): o kolik se který hne dotažením kterého lana.
  const r = sledovane.length;
  const A = new Float64Array(r * m);
  const zbytek = new Float64Array(r);
  let vliv = 0;
  sledovane.forEach((sl, i) => {
    const k = kde.get(sl.kod);
    zbytek[i] = sl.vaha * stav.odchylky[i]!;
    if (k === undefined) return;
    for (let j = 0; j < m; j++) {
      const hodnota = sl.vaha * posuny[j]![k]!;
      A[i * m + j] = hodnota;
      vliv = Math.max(vliv, Math.abs(hodnota));
    }
  });
  if (!(vliv > 0)) return null;
  // Vliv na tahy: tah lana i se dotažením lana j změní o pevnost (jen když i = j) a o to, jak
  // se jeho konce posunem soustavy vzdálí: tuhost lana krát změna vzdálenosti konců.
  const posun = (j: number, kod: number): number => {
    const k = kde.get(kod);
    return k === undefined ? 0 : posuny[j]![k]!;
  };
  const T = new Float64Array(m * m);
  lana.forEach((lano, i) => {
    const dx = s.x[lano.b]! - s.x[lano.a]!;
    const dy = s.y[lano.b]! - s.y[lano.a]!;
    const delka = Math.sqrt(dx * dx + dy * dy);
    for (let j = 0; j < m; j++) {
      const vzdaleni =
        ((posun(j, 3 * lano.b) - posun(j, 3 * lano.a)) * dx + (posun(j, 3 * lano.b + 1) - posun(j, 3 * lano.a + 1)) * dy) / delka;
      T[i * m + j] = (i === j ? 1 : 0) + (lano.EA * vzdaleni) / delka / lano.pevnost;
    }
  });

  // Nejmenší čtverce s tlumením (lana, která dělají totéž, si opravu rozdělí):
  // (AᵀA + λ·D)·Δp = −Aᵀ·zbytek, kde D je diagonála AᵀA. Lana, která by oprava povolila pod
  // nejmenší tah, se přidají jako podmínka „tah zůstane na nejmenší hodnotě“ a úloha se vyřeší znovu.
  const zaklad = new Float64Array(m * m);
  const pravaZaklad = new Float64Array(m);
  let stopa = 0;
  for (let j = 0; j < m; j++) {
    for (let k = j; k < m; k++) {
      let soucet = 0;
      for (let i = 0; i < r; i++) soucet += A[i * m + j]! * A[i * m + k]!;
      zaklad[j * m + k] = soucet;
      zaklad[k * m + j] = soucet;
    }
    stopa += zaklad[j * m + j]!;
    let soucet = 0;
    for (let i = 0; i < r; i++) soucet += A[i * m + j]! * zbytek[i]!;
    pravaZaklad[j] = -soucet;
  }
  const vaha2 = VAHA_TAHU * VAHA_TAHU;
  // Tlumení každého lana: podle jeho vlastního vlivu, nejméně podle průměrného (lano bez vlivu
  // na sledované stupně by jinak nemělo tlumení žádné).
  const meritko = new Float64Array(m);
  for (let j = 0; j < m; j++) meritko[j] = Math.max(zaklad[j * m + j]! + vaha2 * T[j * m + j]! * T[j * m + j]!, (1e-6 * stopa) / m);

  return (tlumeni) => {
    const drzene = new Uint8Array(m);
    for (let i = 0; i < m; i++) if (stav.tahy[i]! < NEJMENSI_TAH) drzene[i] = 1;
    let oprava: Float64Array | null = null;
    for (let kolo = 0; kolo <= m; kolo++) {
      const N = zaklad.slice();
      const prava = pravaZaklad.slice();
      for (let j = 0; j < m; j++) N[j * m + j] = N[j * m + j]! + tlumeni * meritko[j]!;
      for (let i = 0; i < m; i++) {
        if (drzene[i] === 0) continue;
        const chybi = stav.tahy[i]! - NEJMENSI_TAH;
        for (let j = 0; j < m; j++) {
          prava[j] = prava[j]! - vaha2 * T[i * m + j]! * chybi;
          for (let k = 0; k < m; k++) N[j * m + k] = N[j * m + k]! + vaha2 * T[i * m + j]! * T[i * m + k]!;
        }
      }
      if (!choleskehoRozklad(N, m)) return oprava;
      vyresRozkladem(N, m, prava);
      oprava = prava;
      // Která další lana by tahle oprava povolila pod nejmenší tah?
      let pribylo = false;
      for (let i = 0; i < m; i++) {
        if (drzene[i] === 1) continue;
        let zmena = 0;
        for (let j = 0; j < m; j++) zmena += T[i * m + j]! * prava[j]!;
        if (stav.tahy[i]! + zmena < NEJMENSI_TAH - 1e-4) {
          drzene[i] = 1;
          pribylo = true;
        }
      }
      if (!pribylo) break;
    }
    return oprava;
  };
}
