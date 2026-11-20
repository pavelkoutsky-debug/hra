// Porušení prutů: kdy k němu dojde a co se s konstrukcí stane.
//
// Křehké prvky (dřevo, lano, beton) selžou, jakmile vyhlazené využití dosáhne 1.
// Tvárné prvky (ocel) se v tahu a v ohybu na koncích nejdřív plasticky deformují
// (viz sily.ts) a poruší se až po vyčerpání mezní deformace; vzpěr, smyk a ohyb
// uprostřed pole u nich nastávají při využití 1 jako u křehkých.

import {
  MISTO_KONEC_B,
  ZPUSOB_OHYB,
  ZPUSOB_SMYK,
  ZPUSOB_TAH,
  ZPUSOB_TLAK,
  ZPUSOB_VZPER,
} from "./namahani";
import { LANO, type Soustava } from "./soustava";
import { odpojKonec, rozdelPrvek } from "./topologie";

/** Prut se rozdělí na dva volné kusy. */
export const NASLEDEK_ROZLOMENI = 1;
/** Konec prutu se utrhne od styčníku. */
export const NASLEDEK_ODPOJENI = 2;
/** V prutu vznikne plastický kloub; díly zůstanou spojené. */
export const NASLEDEK_KLOUB = 3;

export interface Poruseni {
  /** Index prvku jádra a číslo prutu, ke kterému patří. */
  prvek: number;
  prut: number;
  /** Čím prut selhal; konstanty ZPUSOB_* z namahani.ts. */
  zpusob: number;
  /** Kde: 0 konec a, 1 až 3 čtvrtiny prutu, 4 konec b. */
  misto: number;
  nasledek: number;
  /** Míra překročení: využití, nebo podíl vyčerpané mezní deformace. */
  mira: number;
}

/** Kratší prvky se už nedělí, jen odpojují; drobné úlomky by zbytečně zkracovaly krok výpočtu. */
const NEJKRATSI_DELENY = 0.5;
/** Zalomení prutu při vybočení ve vzpěru jako podíl jeho délky. */
const ZALOMENI_VE_VZPERU = 0.01;

/**
 * Najde nejvíc přetížený prvek, který se má právě porušit; null, když žádný není.
 * Předpokládá aktuální `vyhodnotNamahani`.
 */
export function najdiPoruseni(s: Soustava): Poruseni | null {
  let nejhorsi: Poruseni | null = null;
  const zvaz = (prvek: number, zpusob: number, misto: number, nasledek: number, mira: number): void => {
    if (nejhorsi === null || mira > nejhorsi.mira) {
      nejhorsi = { prvek, prut: s.prut[prvek]!, zpusob, misto, nasledek, mira };
    }
  };

  for (let e = 0; e < s.pocetPrvku; e++) {
    // Utržený kus je v okamžiku přetržení ještě napjatý a pak se rozkmitá; nic už ale
    // nenese, takže jeho další „porušení“ by bylo jen drobení trosek.
    if (s.utrzeny[e] === 1) continue;
    const vyuziti = s.vyuziti[e]!;
    const zpusob = s.zpusob[e]!;
    const misto = s.mistoNamahani[e]!;
    const tvarny = s.mezTahu[e] !== Infinity;

    if (tvarny) {
      const protazeni = s.plastDelka[e]! / (s.mezniProtazeni[e]! * s.klidovaDelka[e]!);
      if (protazeni >= 1) zvaz(e, ZPUSOB_TAH, 2, NASLEDEK_ROZLOMENI, protazeni);
      const natoceniA = Math.abs(s.plastA[e]!) / s.mezniNatoceni[e]!;
      if (natoceniA >= 1) zvaz(e, ZPUSOB_OHYB, 0, NASLEDEK_ODPOJENI, natoceniA);
      const natoceniB = Math.abs(s.plastB[e]!) / s.mezniNatoceni[e]!;
      if (natoceniB >= 1) zvaz(e, ZPUSOB_OHYB, MISTO_KONEC_B, NASLEDEK_ODPOJENI, natoceniB);
      if (vyuziti < 1) continue;
      if (zpusob === ZPUSOB_VZPER || zpusob === ZPUSOB_TLAK) zvaz(e, zpusob, 2, NASLEDEK_KLOUB, vyuziti);
      else if (zpusob === ZPUSOB_SMYK) zvaz(e, zpusob, misto, NASLEDEK_ODPOJENI, vyuziti);
      else if (zpusob === ZPUSOB_OHYB && misto !== 0 && misto !== MISTO_KONEC_B) {
        zvaz(e, zpusob, misto, NASLEDEK_KLOUB, vyuziti);
      }
      // Tah a ohyb na koncích řeší plasticita; samy o sobě porušením nejsou.
      continue;
    }

    if (vyuziti < 1) continue;
    if (s.druh[e] === LANO || zpusob === ZPUSOB_TAH) zvaz(e, ZPUSOB_TAH, 2, NASLEDEK_ROZLOMENI, vyuziti);
    else if (zpusob === ZPUSOB_VZPER || zpusob === ZPUSOB_TLAK) zvaz(e, zpusob, 2, NASLEDEK_ROZLOMENI, vyuziti);
    else if (zpusob === ZPUSOB_SMYK) zvaz(e, zpusob, misto, NASLEDEK_ODPOJENI, vyuziti);
    else if (zpusob === ZPUSOB_OHYB) {
      const naKonci = misto === 0 || misto === MISTO_KONEC_B;
      zvaz(e, zpusob, misto, naKonci ? NASLEDEK_ODPOJENI : NASLEDEK_ROZLOMENI, vyuziti);
    }
  }
  return nejhorsi;
}

/**
 * Provede porušení: změní stavbu soustavy. Po návratu je potřeba znovu určit krok
 * výpočtu, protože soustava má nové styčníky a kratší prvky.
 */
export function provedPoruseni(s: Soustava, p: Poruseni): void {
  const e = p.prvek;
  const podil = p.misto === 0 || p.misto === MISTO_KONEC_B ? 0.5 : p.misto / 4;
  // Příliš krátký prvek se nedělí; utrhne se na bližším konci.
  const lzeDelit = s.klidovaDelka[e]! >= NEJKRATSI_DELENY;

  if (p.nasledek === NASLEDEK_ODPOJENI || !lzeDelit) {
    const konecB = p.misto === MISTO_KONEC_B || (p.misto !== 0 && podil > 0.5);
    odpojKonec(s, e, konecB);
    // Utržený konec už moment nepřenese a jeho plastický kloub zaniká.
    if (konecB) s.plastB[e] = 0;
    else s.plastA[e] = 0;
    s.vyuziti[e] = 0;
    s.utrzeny[e] = 1;
    return;
  }

  if (p.nasledek === NASLEDEK_KLOUB) {
    const veVzperu = p.zpusob === ZPUSOB_VZPER || p.zpusob === ZPUSOB_TLAK;
    const { prvek } = rozdelPrvek(s, e, podil, veVzperu ? ZALOMENI_VE_VZPERU * s.klidovaDelka[e]! : 0);
    s.vyuziti[e] = 0;
    s.vyuziti[prvek] = 0;
    return;
  }

  // Rozlomení: prut se rozdělí a druhý díl se od nového styčníku odpojí.
  const { prvek } = rozdelPrvek(s, e, podil);
  odpojKonec(s, prvek, false);
  s.vyuziti[e] = 0;
  s.vyuziti[prvek] = 0;
  s.utrzeny[e] = 1;
  s.utrzeny[prvek] = 1;
}
