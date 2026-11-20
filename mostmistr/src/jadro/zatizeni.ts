// Zatížení působící na prut mezi styčníky: kolo uprostřed pole, chodec, vlastní tíha.
//
// Jádro počítá jen se silami ve styčnících. Síla uvnitř prvku se proto nahradí silami
// a momenty na jeho koncích tak, aby posuny a natočení styčníků vyšly přesně jako
// u nosníku zatíženého přímo (tvarové funkce Timošenkova nosníku). Průběh momentu
// uvnitř prvku se pak dopočítá zpětně: k momentům z deformace styčníků se přičte
// řešení nosníku se zadrženými konci.

import type { Soustava } from "./soustava";

/** Místa uvnitř prvku, kde se posuzuje ohybový moment: čtvrtina, střed, tři čtvrtiny. */
export const MISTA_POSUDKU: readonly number[] = [0.25, 0.5, 0.75];

/**
 * Přičte ke styčníkům sílu (Fx, Fy) působící na prvek `e` v místě `xi` (0 na konci a,
 * 1 na konci b) a zaznamená ji pro posouzení namáhání prvku.
 * Volá se po `spoctiVnitrniSily`, které zatížení z minulého kroku zapomene.
 */
export function pridejSiluNaPrvek(s: Soustava, e: number, xi: number, Fx: number, Fy: number): void {
  const a = s.prvekA[e]!;
  const b = s.prvekB[e]!;
  const dx = s.x[b]! - s.x[a]!;
  const dy = s.y[b]! - s.y[a]!;
  const delka = Math.sqrt(dx * dx + dy * dy);
  const ex = dx / delka;
  const ey = dy / delka;

  // Složka podél prvku se dělí pákovým pravidlem, složka napříč podle uložení konců.
  const podelna = Fx * ex + Fy * ey;
  const pricna = -Fx * ey + Fy * ex; // ve směru n = (−e_y, e_x)

  const eta = 1 - xi;
  let silaA: number;
  let silaB: number;
  let momentA = 0;
  let momentB = 0;
  const kloub = s.kloub[e]!;
  if (kloub === 3) {
    silaA = pricna * eta;
    silaB = pricna * xi;
  } else {
    // Oba konce tuhé: tvarové funkce Timošenkova nosníku se smykovým parametrem Φ.
    const fi = s.fi[e]!;
    const jmenovatel = 1 / (1 + fi);
    silaA = pricna * (1 - 3 * xi * xi + 2 * xi * xi * xi + fi * eta) * jmenovatel;
    silaB = pricna - silaA;
    momentA = pricna * delka * xi * eta * (eta + 0.5 * fi) * jmenovatel;
    momentB = -pricna * delka * xi * eta * (xi + 0.5 * fi) * jmenovatel;
    if (kloub === 1) {
      // Kloub na konci a: moment tam být nemůže, přenese se do druhého konce a do sil.
      const posun = (6 * momentA) / (delka * (4 + fi));
      silaA -= posun;
      silaB += posun;
      momentB -= ((2 - fi) / (4 + fi)) * momentA;
      momentA = 0;
    } else if (kloub === 2) {
      const posun = (6 * momentB) / (delka * (4 + fi));
      silaA -= posun;
      silaB += posun;
      momentA -= ((2 - fi) / (4 + fi)) * momentB;
      momentB = 0;
    }
  }

  const osovaA = podelna * eta;
  const osovaB = podelna * xi;
  s.fx[a] = s.fx[a]! + osovaA * ex - silaA * ey;
  s.fy[a] = s.fy[a]! + osovaA * ey + silaA * ex;
  s.fx[b] = s.fx[b]! + osovaB * ex - silaB * ey;
  s.fy[b] = s.fy[b]! + osovaB * ey + silaB * ex;
  s.moment[a] = s.moment[a]! + momentA;
  s.moment[b] = s.moment[b]! + momentB;

  // Záznam pro posouzení namáhání.
  if (s.jeZatizen[e] === 0) {
    s.jeZatizen[e] = 1;
    s.zatizenePrvky[s.pocetZatizenych] = e;
    s.pocetZatizenych += 1;
  }
  s.zatSilaA[e] = s.zatSilaA[e]! + silaA;
  s.zatSilaB[e] = s.zatSilaB[e]! + silaB;
  s.zatMomentA[e] = s.zatMomentA[e]! + momentA;
  s.zatMomentB[e] = s.zatMomentB[e]! + momentB;
  // Moment na prostě uloženém prvku od síly napříč; síla ve směru n dává záporný (horní tah).
  for (let k = 0; k < 3; k++) {
    const misto = MISTA_POSUDKU[k]!;
    const vliv = misto <= xi ? misto * eta : xi * (1 - misto);
    s.zatMomentPole[3 * e + k] = s.zatMomentPole[3 * e + k]! - pricna * delka * vliv;
  }
}

/**
 * Skutečný ohybový moment na koncích prvku: moment z deformace styčníků opravený
 * o náhradní momenty zatížení. Kladný moment natahuje vlákna na straně −n.
 */
export function momentNaKonciA(s: Soustava, e: number): number {
  return -(s.momentA[e]! - s.zatMomentA[e]!);
}

export function momentNaKonciB(s: Soustava, e: number): number {
  return s.momentB[e]! - s.zatMomentB[e]!;
}

/**
 * Ohybový moment uvnitř prvku v místě `MISTA_POSUDKU[k]`: přímka mezi koncovými
 * momenty plus moment od zatížení na prostě uloženém prvku. Vlastní tíha prvku se
 * přičítá jako rovnoměrné zatížení; `tiha` je tíhové zrychlení.
 */
export function momentVPoli(s: Soustava, e: number, k: number, tiha: number): number {
  const misto = MISTA_POSUDKU[k]!;
  let moment = momentNaKonciA(s, e) * (1 - misto) + momentNaKonciB(s, e) * misto + s.zatMomentPole[3 * e + k]!;
  if (tiha !== 0) {
    const a = s.prvekA[e]!;
    const b = s.prvekB[e]!;
    const dx = s.x[b]! - s.x[a]!;
    const dy = s.y[b]! - s.y[a]!;
    const delka = Math.sqrt(dx * dx + dy * dy);
    // Tíha působí svisle; na prvek napříč jen její průmět, proto násobení vodorovným průmětem délky.
    moment += 0.5 * s.hmotnostNaMetr[e]! * tiha * dx * delka * misto * (1 - misto);
  }
  return moment;
}

/** Posouvající síla na koncích prvku včetně zatížení uvnitř prvku. */
export function posouvajiciNaKonciA(s: Soustava, e: number): number {
  return posouvajiciZDeformace(s, e) - s.zatSilaA[e]!;
}

export function posouvajiciNaKonciB(s: Soustava, e: number): number {
  return -posouvajiciZDeformace(s, e) - s.zatSilaB[e]!;
}

/** Posouvající síla z koncových momentů: (M_a·κ_a + M_b·κ_b)/L, pro malé deformace (M_a + M_b)/L. */
function posouvajiciZDeformace(s: Soustava, e: number): number {
  const a = s.prvekA[e]!;
  const b = s.prvekB[e]!;
  const dx = s.x[b]! - s.x[a]!;
  const dy = s.y[b]! - s.y[a]!;
  return (s.momentA[e]! + s.momentB[e]!) / Math.sqrt(dx * dx + dy * dy);
}
