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
