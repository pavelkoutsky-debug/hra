// Dopad na terén: styčníky, které se dotknou země, se o ni opřou a třou se o ni.
//
// Slouží troskám zříceného mostu a spadlým vozidlům. Terén je lomená čára zleva doprava;
// kontakt je pružina s tlumičem kolmo k povrchu a tření podél něj. Tuhost se odvozuje
// od hmoty styčníku tak, aby dosednutí mělo u všech stejnou vlastní frekvenci a nikdy
// nezkracovalo krok výpočtu.

import type { Soustava } from "./soustava";

/** Kruhová frekvence dosednutí styčníku na terén (rad/s) a jeho poměrný útlum. */
const FREKVENCE_DOSEDNUTI = 60;
const UTLUM_DOSEDNUTI = 0.6;
/**
 * Součinitel tření o terén a rychlost, pod kterou tření plynule slábne (m/s). Tření bez
 * skoku v nule nedrží úplně: na svahu, který by skutečné tření udrželo, se styčník dál
 * sune rychlostí několika centimetrů za sekundu. Menší rychlost klidu by to zmenšila,
 * ale tření by se pak chovalo jako tuhý tlumič a omezovalo krok výpočtu.
 */
const TRENI = 0.7;
const RYCHLOST_KLIDU = 0.02;

export interface Teren {
  /** Vrcholy lomené čáry; x ostře roste. Za krajními body pokračuje terén vodorovně. */
  x: Float64Array;
  y: Float64Array;
  /** Jednotková normála každého úseku, mířící ven ze země. */
  nx: Float64Array;
  ny: Float64Array;
  /** Úsek, ve kterém byl styčník naposledy (urychluje hledání). */
  usek: Int32Array;
}

export function vytvorTeren(body: readonly { x: number; y: number }[]): Teren {
  const n = body.length;
  const teren: Teren = {
    x: Float64Array.from(body, (b) => b.x),
    y: Float64Array.from(body, (b) => b.y),
    nx: new Float64Array(Math.max(0, n - 1)),
    ny: new Float64Array(Math.max(0, n - 1)),
    usek: new Int32Array(0),
  };
  for (let i = 0; i + 1 < n; i++) {
    const dx = teren.x[i + 1]! - teren.x[i]!;
    const dy = teren.y[i + 1]! - teren.y[i]!;
    const delka = Math.sqrt(dx * dx + dy * dy);
    teren.nx[i] = -dy / delka;
    teren.ny[i] = dx / delka;
  }
  return teren;
}

/** Výška terénu nad souřadnicí x; `odhad` je index úseku, od kterého se hledá. Vrací i úsek v `posledniUsek`. */
export let posledniUsek = 0;
export function vyskaTerenuV(t: Teren, x: number, odhad = 0): number {
  const n = t.x.length;
  if (n === 0) return -Infinity;
  if (x <= t.x[0]!) {
    posledniUsek = -1;
    return t.y[0]!;
  }
  if (x >= t.x[n - 1]!) {
    posledniUsek = -1;
    return t.y[n - 1]!;
  }
  let i = odhad < 0 ? 0 : odhad > n - 2 ? n - 2 : odhad;
  while (i > 0 && t.x[i]! > x) i--;
  while (i < n - 2 && t.x[i + 1]! <= x) i++;
  posledniUsek = i;
  return t.y[i]! + ((t.y[i + 1]! - t.y[i]!) * (x - t.x[i]!)) / (t.x[i + 1]! - t.x[i]!);
}

/** Největší zábor, se kterým kontakt počítá, v metrech; hlouběji už síla neroste. */
const NEJVETSI_ZABOR = 0.5;

/**
 * Přičte síly od terénu ke styčníkům `od` až `po − 1`, které jsou pod jeho povrchem.
 * Zadržené stupně volnosti se přeskakují. Vrací počet styčníků, které se terénu dotýkají.
 *
 * Síla míří k nejbližšímu bodu povrchu, ne vždy svisle: styčník, který se zhoupne do strmé
 * stěny údolí, je vodorovně za stěnou, ale metry pod povrchem břehu nad ní. Svislý kontakt
 * by ho vystřelil vzhůru; správně ho stěna odrazí zpět do údolí.
 */
export function pridejKontaktSTerenem(s: Soustava, t: Teren, od = 0, po = s.pocetStycniku): number {
  if (t.usek.length < s.pocetStycniku) {
    const vetsi = new Int32Array(s.pocetStycniku);
    vetsi.set(t.usek);
    t.usek = vetsi;
  }
  const { x, y, vx, vy, fx, fy, hmota, invHmotaX, invHmotaY } = s;
  const posledni = t.x.length - 2;
  let dotyku = 0;
  for (let i = od; i < po; i++) {
    if (invHmotaY[i] === 0) continue;
    const px = x[i]!;
    const py = y[i]!;
    const povrch = vyskaTerenuV(t, px, t.usek[i]!);
    if (!(povrch > py)) continue;
    dotyku++;
    const usek = posledniUsek;
    t.usek[i] = usek < 0 ? 0 : usek;

    // Nejbližší bod povrchu: svisle nad styčníkem, nebo na některém ze sousedních úseků.
    let zabor = povrch - py;
    let nx = 0;
    let ny = 1;
    if (usek >= 0) {
      const prvni = usek > 0 ? usek - 1 : 0;
      const koncovy = usek < posledni ? usek + 1 : posledni;
      for (let j = prvni; j <= koncovy; j++) {
        const ax = t.x[j]!;
        const ay = t.y[j]!;
        const ux = t.x[j + 1]! - ax;
        const uy = t.y[j + 1]! - ay;
        let podil = ((px - ax) * ux + (py - ay) * uy) / (ux * ux + uy * uy);
        if (podil < 0) podil = 0;
        else if (podil > 1) podil = 1;
        const kx = ax + podil * ux - px;
        const ky = ay + podil * uy - py;
        const vzdalenost = Math.sqrt(kx * kx + ky * ky);
        if (vzdalenost < zabor) {
          zabor = vzdalenost;
          if (vzdalenost > 1e-9) {
            nx = kx / vzdalenost;
            ny = ky / vzdalenost;
          } else {
            nx = t.nx[j]!;
            ny = t.ny[j]!;
          }
        }
      }
    }
    if (zabor > NEJVETSI_ZABOR) zabor = NEJVETSI_ZABOR;

    const m = hmota[i]!;
    const kolmo = vx[i]! * nx + vy[i]! * ny;
    let tlak = m * FREKVENCE_DOSEDNUTI * (FREKVENCE_DOSEDNUTI * zabor - 2 * UTLUM_DOSEDNUTI * kolmo);
    if (tlak < 0) tlak = 0; // terén nepřitahuje
    // Tření proti pohybu podél povrchu; kolem nulové rychlosti plynule slábne.
    const podel = vx[i]! * ny - vy[i]! * nx;
    const velikost = podel < 0 ? -podel : podel;
    const treni = (-TRENI * tlak * podel) / (velikost + RYCHLOST_KLIDU);
    if (invHmotaX[i] !== 0) fx[i] = fx[i]! + tlak * nx + treni * ny;
    fy[i] = fy[i]! + tlak * ny - treni * nx;
  }
  return dotyku;
}
