// Posouzení namáhání prutů: jak blízko je každý prvek své únosnosti a čím.
//
// Využití 1 znamená mez únosnosti. Posuzuje se:
//   tah            N / N_tah
//   tlak a vzpěr   |N| / N_tlak + |N| / N_cr      (Rankinův vzorec: plynulý přechod
//                                                  mezi rozdrcením a Eulerovým vzpěrem)
//   ohyb           |M| / M_R, u tlačeného prutu zvětšený součinitelem 1 / (1 − |N|/N_cr)
//   osová síla s ohybem se sčítají
//   smyk           |V| / V_R samostatně
// Moment se bere na obou koncích a ve čtvrtinách prutu, včetně zatížení uvnitř prvku
// a vlastní tíhy.

import { LANO, type Soustava } from "./soustava";
import { MISTA_POSUDKU } from "./zatizeni";

export const ZPUSOB_ZADNY = 0;
export const ZPUSOB_TAH = 1;
export const ZPUSOB_TLAK = 2;
export const ZPUSOB_VZPER = 3;
export const ZPUSOB_OHYB = 4;
export const ZPUSOB_SMYK = 5;

/** Místo největšího namáhání na konci b; konec a je 0, čtvrtiny prutu 1 až 3. */
export const MISTO_KONEC_B = 4;

/** Součinitel zvětšení momentu tlakem se omezuje, aby těsně u kritické síly nerostl do nekonečna. */
const NEJVETSI_ZVETSENI = 10;

/**
 * Přepočítá využití všech prvků. `vaha` v rozsahu (0, 1] určuje vyhlazení v čase:
 * nová hodnota = stará + váha · (okamžitá − stará). Váha 1 vyhlazení vypne.
 * Vyhlazení brání tomu, aby o porušení rozhodla špička trvající zlomek milisekundy.
 * Volá se po výpočtu sil a po přičtení zatížení prvků.
 */
export function vyhodnotNamahani(s: Soustava, tiha: number, vaha: number): void {
  const { x, y, prvekA, prvekB, druh, osovaSila, momentA, momentB, hmotnostNaMetr } = s;
  const { unosnostTah, unosnostTlak, unosnostMoment, unosnostSmyk, kritickaSila } = s;
  const { zatSilaA, zatSilaB, zatMomentA, zatMomentB, zatMomentPole, vyuziti, zpusob, mistoNamahani } = s;

  for (let e = 0; e < s.pocetPrvku; e++) {
    const osova = osovaSila[e]!;
    let okamzite: number;
    let jak: number;
    let misto = 0;

    if (druh[e] === LANO) {
      okamzite = osova / unosnostTah[e]!;
      jak = ZPUSOB_TAH;
    } else {
      const a = prvekA[e]!;
      const b = prvekB[e]!;
      const dx = x[b]! - x[a]!;
      const dy = y[b]! - y[a]!;
      const delka = Math.sqrt(dx * dx + dy * dy);

      let podilOsovy: number;
      let zvetseni = 1;
      if (osova >= 0) {
        podilOsovy = osova / unosnostTah[e]!;
        jak = ZPUSOB_TAH;
      } else {
        const kriticka = kritickaSila[e]!;
        const podilVzperu = -osova / kriticka;
        podilOsovy = -osova / unosnostTlak[e]! + podilVzperu;
        jak = kriticka < unosnostTlak[e]! ? ZPUSOB_VZPER : ZPUSOB_TLAK;
        zvetseni = podilVzperu < 1 - 1 / NEJVETSI_ZVETSENI ? 1 / (1 - podilVzperu) : NEJVETSI_ZVETSENI;
      }

      // Skutečné koncové momenty a moment ve čtvrtinách prutu.
      const koncovyA = -(momentA[e]! - zatMomentA[e]!);
      const koncovyB = momentB[e]! - zatMomentB[e]!;
      let nejvetsi = Math.abs(koncovyA);
      if (Math.abs(koncovyB) > nejvetsi) {
        nejvetsi = Math.abs(koncovyB);
        misto = MISTO_KONEC_B;
      }
      const tihaNaMetr = hmotnostNaMetr[e]! * tiha;
      for (let k = 0; k < 3; k++) {
        const xi = MISTA_POSUDKU[k]!;
        const vPoli =
          koncovyA * (1 - xi) + koncovyB * xi + zatMomentPole[3 * e + k]! + 0.5 * tihaNaMetr * dx * delka * xi * (1 - xi);
        if (Math.abs(vPoli) > nejvetsi) {
          nejvetsi = Math.abs(vPoli);
          misto = k + 1;
        }
      }
      const podilOhybu = (nejvetsi * zvetseni) / unosnostMoment[e]!;
      okamzite = podilOsovy + podilOhybu;
      if (podilOhybu > podilOsovy) jak = ZPUSOB_OHYB;
      else misto = 0;

      // Posouvající síla na koncích; vlastní tíha přidá na každém konci polovinu své příčné složky.
      const zDeformace = (momentA[e]! + momentB[e]!) / delka;
      const vlastni = 0.5 * tihaNaMetr * Math.abs(dx);
      const smykA = Math.abs(zDeformace - zatSilaA[e]!) + vlastni;
      const smykB = Math.abs(-zDeformace - zatSilaB[e]!) + vlastni;
      const podilSmyku = (smykA > smykB ? smykA : smykB) / unosnostSmyk[e]!;
      if (podilSmyku > okamzite) {
        okamzite = podilSmyku;
        jak = ZPUSOB_SMYK;
        misto = smykA >= smykB ? 0 : MISTO_KONEC_B;
      }
    }

    vyuziti[e] = vyuziti[e]! + vaha * (okamzite - vyuziti[e]!);
    zpusob[e] = okamzite > 0 ? jak : ZPUSOB_ZADNY;
    mistoNamahani[e] = misto;
  }
}

/** Vnitřní síly prvku v jednom okamžiku. */
export interface VnitrniSily {
  /** Osová síla v newtonech; tah kladný, tlak záporný. */
  osova: number;
  /** Největší ohybový moment po délce prvku, N·m (velikost). */
  moment: number;
  /** Největší posouvající síla, N (velikost). */
  smyk: number;
}

/**
 * Vnitřní síly prvku tak, jak s nimi počítá posudek: osová síla, největší ohybový moment
 * (konce a čtvrtiny prutu včetně zatížení uvnitř prvku a vlastní tíhy) a největší posouvající
 * síla na koncích. Slouží hlášením pro hráče; do výpočtu nevstupuje.
 */
export function vnitrniSily(s: Soustava, e: number, tiha: number): VnitrniSily {
  const osova = s.osovaSila[e]!;
  if (s.druh[e] === LANO) return { osova, moment: 0, smyk: 0 };
  const a = s.prvekA[e]!;
  const b = s.prvekB[e]!;
  const dx = s.x[b]! - s.x[a]!;
  const dy = s.y[b]! - s.y[a]!;
  const delka = Math.sqrt(dx * dx + dy * dy);
  const koncovyA = -(s.momentA[e]! - s.zatMomentA[e]!);
  const koncovyB = s.momentB[e]! - s.zatMomentB[e]!;
  let moment = Math.max(Math.abs(koncovyA), Math.abs(koncovyB));
  const tihaNaMetr = s.hmotnostNaMetr[e]! * tiha;
  for (let k = 0; k < 3; k++) {
    const xi = MISTA_POSUDKU[k]!;
    const vPoli =
      koncovyA * (1 - xi) + koncovyB * xi + s.zatMomentPole[3 * e + k]! + 0.5 * tihaNaMetr * dx * delka * xi * (1 - xi);
    if (Math.abs(vPoli) > moment) moment = Math.abs(vPoli);
  }
  const zDeformace = delka > 0 ? (s.momentA[e]! + s.momentB[e]!) / delka : 0;
  const vlastni = 0.5 * tihaNaMetr * Math.abs(dx);
  const smyk = Math.max(Math.abs(zDeformace - s.zatSilaA[e]!), Math.abs(-zDeformace - s.zatSilaB[e]!)) + vlastni;
  return { osova, moment, smyk };
}

/**
 * Veličina, která při daném způsobu namáhání rozhoduje, a únosnost prvku v ní: u tahu,
 * tlaku a vzpěru osová síla v newtonech (u tlaku a vzpěru únosnost podle Rankina, tedy
 * rozdrcení a vybočení dohromady), u ohybu moment v N·m, u smyku posouvající síla v N.
 */
export function rozhodujiciVelicina(s: Soustava, e: number, zpusob: number, sily: VnitrniSily): { velicina: number; unosnost: number } {
  if (zpusob === ZPUSOB_OHYB) return { velicina: sily.moment, unosnost: s.unosnostMoment[e]! };
  if (zpusob === ZPUSOB_SMYK) return { velicina: sily.smyk, unosnost: s.unosnostSmyk[e]! };
  if (zpusob === ZPUSOB_TLAK || zpusob === ZPUSOB_VZPER) {
    const tlak = s.unosnostTlak[e]!;
    const kriticka = s.kritickaSila[e]!;
    const unosnost = s.druh[e] === LANO ? 0 : 1 / (1 / tlak + 1 / kriticka);
    return { velicina: Math.abs(sily.osova), unosnost };
  }
  return { velicina: Math.abs(sily.osova), unosnost: s.unosnostTah[e]! };
}
