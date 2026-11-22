// Rozbor mostu ve stavebním režimu (koncepce, kap. 7.8): má most klidovou polohu, na
// jakých frekvencích a v jakých tvarech kmitá, prázdný i obsazený lidmi, a jak silně
// odpovídá na buzení v různém rytmu (rezonanční křivka). Maticový výpočet bez časové
// simulace; trvá milisekundy až desítky milisekund, takže se dá pouštět po každé úpravě návrhu.

import type { NavrhMostu } from "../data/navrh";
import type { Uroven } from "../data/uroven";
import { TIHOVE_ZRYCHLENI } from "../jadro/integrator";
import { najdiRovnovahu, vlastniTvarySoustavy } from "../jadro/matice";
import { rezonancniKrivka } from "../jadro/odezva";
import { sestavSoustavu, type PopisSoustavy, type Soustava } from "../jadro/soustava";
import { volneStupne } from "../jadro/stupne";
import { jeClovek } from "./provoz";
import type { RozborMostu } from "./protokol";
import { sestavMost, type StavbaMostu } from "./stavba";
import { hmotnostUcastnika, lidiVRade, modelUcastnika } from "./vozidla";

/** Kolik nejnižších vlastních frekvencí a tvarů rozbor vrací. */
export const POCET_FREKVENCI = 3;
/** Rozsah a krok rezonanční křivky, Hz. Rozsah odpovídá ose frekvencí ve hře. */
export const KRIVKA_OD = 0.5;
export const KRIVKA_DO = 6;
export const KROK_KRIVKY = 0.025;
/** Poměrný útlum konstrukce, když ho nejde odvodit z materiálů. */
const VYCHOZI_UTLUM = 0.01;

/** Frekvence, ve kterých se rezonanční křivka počítá, Hz. */
export function frekvenceKrivky(): number[] {
  const pocet = Math.round((KRIVKA_DO - KRIVKA_OD) / KROK_KRIVKY) + 1;
  return Array.from({ length: pocet }, (_, i) => KRIVKA_OD + i * KROK_KRIVKY);
}

/** Soustava v klidové poloze pod vlastní tíhou a její volné stupně; null, když klidovou polohu nemá. */
function vKlidu(popis: PopisSoustavy): { s: Soustava; stupne: Int32Array } | null {
  const s = sestavSoustavu(popis);
  const stupne = volneStupne(s);
  if (stupne.length > 0 && najdiRovnovahu(s, stupne, new Float64Array(stupne.length), TIHOVE_ZRYCHLENI) < 0) return null;
  return { s, stupne };
}

/**
 * Hmotnost největší skupiny lidí z jízdního řádu, která se na most vejde najednou, v kg.
 * Skupina delší než most se počítá jen tou částí, která na něm zrovna je.
 */
function hmotnostLidiNaMoste(uroven: Uroven, delkaMostu: number): number {
  let nejvic = 0;
  for (const polozka of uroven.jizdniRad) {
    if (!jeClovek(polozka.druh)) continue;
    const model = modelUcastnika(polozka.druh, polozka.kadence);
    if (!model) continue;
    const lidi = polozka.pocet ?? 1;
    // Útvar, dav a průvod jdou v řadách přes šířku mostovky; ostatní po jednom za sebou.
    const vRade = lidiVRade(polozka.druh, uroven.sirkaMostovky);
    const vejdeSe = (Math.floor(delkaMostu / model.rozestup) + 1) * vRade;
    nejvic = Math.max(nejvic, Math.min(lidi, vejdeSe) * hmotnostUcastnika(model));
  }
  return nejvic;
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

const BEZ_MOSTU: RozborMostu = { stabilni: false, frekvence: [], frekvenceObsazeneho: [], tvary: [], krivka: null };

/** Rozbor mostu z návrhu. Vyhodí chybu, když se most nedá sestavit. */
export function rozeberMost(uroven: Uroven, navrh: NavrhMostu): RozborMostu {
  if (navrh.pruty.length === 0) return BEZ_MOSTU;
  const stavba = sestavMost(uroven, navrh);
  const prazdny = vKlidu(stavba.popis);
  if (!prazdny) return BEZ_MOSTU;
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

  // Poměrný útlum konstrukce: průměr přes její prvky, stejně jako ve zkoušce.
  let utlum = VYCHOZI_UTLUM;
  if (stavba.utlumPrvku.length > 0) {
    utlum = 0;
    for (const u of stavba.utlumPrvku) utlum += u / stavba.utlumPrvku.length;
  }
  const mostovka = stycnikyMostovky(stavba);
  const frekvenceBuzeni = frekvenceKrivky();
  const krivkaPrazdneho = uroven.rezonancniKrivka
    ? rezonancniKrivka(prazdny.s, prazdny.stupne, mostovka, frekvenceBuzeni, utlum)
    : null;

  // Obsazený most: hmota lidí rozdělená rovnoměrně do styčníků mostovky.
  const trasa = uroven.trasy[0];
  const lide = trasa ? hmotnostLidiNaMoste(uroven, trasa.konec.x - trasa.zacatek.x) : 0;
  let frekvenceObsazeneho: number[] = [];
  let krivkaObsazeneho: Float64Array | null = null;
  if (lide > 0 && mostovka.length > 0) {
    const sLidmi = sestavMost(uroven, navrh);
    const naStycnik = lide / mostovka.length;
    for (const i of mostovka) {
      const st = sLidmi.popis.stycniky[i]!;
      st.hmota = (st.hmota ?? 0) + naStycnik;
    }
    const obsazeny = vKlidu(sLidmi.popis);
    const vlastniObsazeneho = obsazeny ? vlastniTvarySoustavy(obsazeny.s, obsazeny.stupne, POCET_FREKVENCI) : null;
    if (obsazeny && vlastniObsazeneho) {
      frekvenceObsazeneho = Array.from(vlastniObsazeneho.omega, (omega) => omega / (2 * Math.PI)).filter(
        (f) => Number.isFinite(f) && f > 0,
      );
      if (uroven.rezonancniKrivka) {
        krivkaObsazeneho = rezonancniKrivka(obsazeny.s, obsazeny.stupne, mostovka, frekvenceBuzeni, utlum);
      }
    }
  }

  return {
    stabilni: true,
    frekvence,
    frekvenceObsazeneho,
    tvary,
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
