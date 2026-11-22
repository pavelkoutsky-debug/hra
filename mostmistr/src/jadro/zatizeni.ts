// Zatížení působící na prut mezi styčníky: kolo uprostřed pole, chodec, vlastní tíha.
//
// Jádro počítá jen se silami ve styčnících. Síla uvnitř prvku se proto nahradí silami
// a momenty na jeho koncích tak, aby posuny a natočení styčníků vyšly přesně jako
// u nosníku zatíženého přímo (tvarové funkce Timošenkova nosníku). Průběh momentu
// uvnitř prvku se pak dopočítá zpětně: k momentům z deformace styčníků se přičte
// řešení nosníku se zadrženými konci.

import { NOSNIK, type Soustava } from "./soustava";

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
 * Vlastní tíha prvků tak, jak působí doopravdy: rovnoměrně po délce. Integrátor dává tíhu
 * prvku po polovinách do jeho koncových styčníků. U prvku, který má aspoň jeden konec tuhý,
 * k tomu patří ještě momenty vetknutí a při jednom kloubu i přesun části příčné síly
 * z kloubového konce na tuhý; bez nich vycházejí podporové momenty spojitého nosníku menší
 * (při poli děleném na čtyři díly o 6 %) a průhyb prostého nosníku ze dvou dílů o pětinu.
 *
 * Oprava je záporný gradient polohové energie, kterou nese průhyb prvku mezi styčníky:
 *   V = G · (d_x / L) · (c_a·Q_a + c_b·Q_b),
 * kde G je tíha prvku, d_x vodorovný průmět spojnice, L její délka a Q_i = L·ψ_i je natočení
 * konce vůči spojnici (viz `spoctiVnitrniSily`). Součinitele plynou z tvarových funkcí:
 *   oba konce tuhé:  c_a = 1/12, c_b = −1/12   (momenty vetknutí ±W·L/12)
 *   kloub na konci a: c_a = 0, c_b = −1/(2·(4 + Φ))  (W·L/8 při Φ = 0 a přesun síly W/8)
 *   kloub na konci b: c_a = 1/(2·(4 + Φ)), c_b = 0
 * Je to integrál `pridejSiluNaPrvek` přes délku prvku pro rovnoměrné zatížení, zmenšený
 * o poloviny, které už ve styčnících jsou. Protože síly plynou z energie, výpočet ji
 * nepřidává ani neubírá ani při velkých pootočeních.
 */
function soucinitele(ulozeni: number, fi: number, cil: Float64Array): void {
  if (ulozeni === 0) {
    cil[0] = 1 / 12;
    cil[1] = -1 / 12;
  } else if (ulozeni === 1) {
    cil[0] = 0;
    cil[1] = -1 / (2 * (4 + fi));
  } else {
    cil[0] = 1 / (2 * (4 + fi));
    cil[1] = 0;
  }
}

const SOUCINITELE = new Float64Array(2);

/**
 * Přičte ke styčníkům opravu vlastní tíhy prvků s tuhými konci (viz výše) a zapíše ji stejně
 * jako břemena, takže posudek namáhání i plastické klouby počítají se skutečnými koncovými
 * momenty. Volá se po `spoctiVnitrniSily` a před břemeny.
 */
export function pridejTihuPrvku(s: Soustava, tiha: number): void {
  if (tiha === 0) return;
  const { x, y, cosN, sinN, prvekA, prvekB, druh, kloub, fi, hmotnostNaMetr, klidovaDelka, osaX0, osaY0 } = s;
  for (let e = 0; e < s.pocetPrvku; e++) {
    // Utržené kusy se nechávají být: jádro je změkčuje (viz `Simulace.poZmeneStavby`) a
    // ohyb trosek vlastní tíhou nikoho nezajímá.
    if (druh[e] !== NOSNIK || s.utrzeny[e] === 1) continue;
    const ulozeni = kloub[e]!;
    if (ulozeni === 3) continue;
    const G = hmotnostNaMetr[e]! * klidovaDelka[e]! * tiha;
    if (G === 0) continue;
    const a = prvekA[e]!;
    const b = prvekB[e]!;
    const dx = x[b]! - x[a]!;
    const dy = y[b]! - y[a]!;
    const delka = Math.sqrt(dx * dx + dy * dy);
    if (!(delka > 0)) continue;
    soucinitele(ulozeni, fi[e]!, SOUCINITELE);
    const cA = SOUCINITELE[0]!;
    const cB = SOUCINITELE[1]!;
    const ox = osaX0[e]!;
    const oy = osaY0[e]!;
    // u = L·cos α, v = L·sin α: spojnice v souřadnicích výchozí osy prvku.
    const u = ox * dx + oy * dy;
    const v = ox * dy - oy * dx;
    const S = cA * (sinN[a]! * u - cosN[a]! * v) + cB * (sinN[b]! * u - cosN[b]! * v);
    const Sx = cA * (sinN[a]! * ox + cosN[a]! * oy) + cB * (sinN[b]! * ox + cosN[b]! * oy);
    const Sy = cA * (sinN[a]! * oy - cosN[a]! * ox) + cB * (sinN[b]! * oy - cosN[b]! * ox);
    const L3 = delka * delka * delka;
    // Derivace energie podle průmětů spojnice; síla na konec b je záporná, na konec a kladná.
    const podleX = G * (S / delka + (dx * Sx) / delka - (dx * dx * S) / L3);
    const podleY = G * ((dx * Sy) / delka - (dx * dy * S) / L3);
    const momentA = -((G * dx) / delka) * cA * (cosN[a]! * u + sinN[a]! * v);
    const momentB = -((G * dx) / delka) * cB * (cosN[b]! * u + sinN[b]! * v);

    s.fx[a] = s.fx[a]! + podleX;
    s.fy[a] = s.fy[a]! + podleY;
    s.fx[b] = s.fx[b]! - podleX;
    s.fy[b] = s.fy[b]! - podleY;
    s.moment[a] = s.moment[a]! + momentA;
    s.moment[b] = s.moment[b]! + momentB;

    if (s.jeZatizen[e] === 0) {
      s.jeZatizen[e] = 1;
      s.zatizenePrvky[s.pocetZatizenych] = e;
      s.pocetZatizenych += 1;
    }
    // Příčné složky sil (ve směru n = (−e_y, e_x)) pro posouzení smyku.
    const ex = dx / delka;
    const ey = dy / delka;
    const pricnaA = -podleX * ey + podleY * ex;
    s.zatSilaA[e] = s.zatSilaA[e]! + pricnaA;
    s.zatSilaB[e] = s.zatSilaB[e]! - pricnaA;
    s.zatMomentA[e] = s.zatMomentA[e]! + momentA;
    s.zatMomentB[e] = s.zatMomentB[e]! + momentB;
  }
}

/**
 * Polohová energie, kterou nese průhyb prvků mezi styčníky: doplněk k energii hmot ve
 * styčnících pro tíhu rozloženou po délce (viz `pridejTihuPrvku`). Slouží kontrole
 * zachování energie.
 */
export function energieTihyPrvku(s: Soustava, tiha: number): number {
  if (tiha === 0) return 0;
  let energie = 0;
  for (let e = 0; e < s.pocetPrvku; e++) {
    if (s.druh[e] !== NOSNIK || s.utrzeny[e] === 1) continue;
    const ulozeni = s.kloub[e]!;
    if (ulozeni === 3) continue;
    const a = s.prvekA[e]!;
    const b = s.prvekB[e]!;
    const dx = s.x[b]! - s.x[a]!;
    const dy = s.y[b]! - s.y[a]!;
    const delka = Math.sqrt(dx * dx + dy * dy);
    if (!(delka > 0)) continue;
    soucinitele(ulozeni, s.fi[e]!, SOUCINITELE);
    const u = s.osaX0[e]! * dx + s.osaY0[e]! * dy;
    const v = s.osaX0[e]! * dy - s.osaY0[e]! * dx;
    const S = SOUCINITELE[0]! * (s.sinN[a]! * u - s.cosN[a]! * v) + SOUCINITELE[1]! * (s.sinN[b]! * u - s.cosN[b]! * v);
    energie += (s.hmotnostNaMetr[e]! * s.klidovaDelka[e]! * tiha * dx * S) / delka;
  }
  return energie;
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
