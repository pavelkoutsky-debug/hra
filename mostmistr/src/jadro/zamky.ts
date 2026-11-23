// Dělicí zámky: místa, kde se pohyblivý most rozpojuje, aby se mohl zvednout, a kde se
// po sklopení zase spojí.
//
// Zámek je dvojí. Na opěře drží konec křídla na ložisku: zamčený je obyčejná podpora,
// odemčený nechá konec volně zvednout a při sklápění ho zachytí dosedací plocha, která
// umí jen tlačit vzhůru. Mezi křídly drží zámek dva konce u sebe: zamčený je jeden společný
// styčník, odemknutí ho rozdělí na dva a po sklopení je k sobě přitáhne čep.
//
// Na začátku jsou zámky zamčené přesně (podporou nebo společným styčníkem), takže výchozí
// rovnováha mostu je stejná jako u mostu bez zámků. Znovu zamčený zámek mezi křídly drží
// tuhá pružina s tlumičem: zapadne v poloze, ve které konce právě jsou, a pak je kuželový
// čep během zlomku sekundy stáhne k sobě. Zámek na opěře dostane podporu zpátky tam, kde
// konec dosedl.
//
// Počítá se jen sčítáním, násobením a dělením.

import { prepoctiHmoty, type Soustava } from "./soustava";
import { rozdelStycnik } from "./topologie";

/** Zámek je zamčený tak, jak byl postaven: podpora nebo společný styčník. */
export const ZAMEK_ZAMCENY = 0;
/** Odemčeno: konce se smějí rozejít. */
export const ZAMEK_ODEMCENY = 1;
/** Znovu zamčeno po sklopení mostu. */
export const ZAMEK_ZAPADLY = 2;

/** Jak daleko od sebe smějí být konce (nebo konec a opěra), aby zámek zapadl, m. */
export const VULE_ZAMKU = 0.05;
/** Jak rychle se konce smějí vůči sobě (nebo konec vůči opěře) hýbat, aby zámek zapadl, m/s. */
export const RYCHLOST_ZAMKNUTI = 0.2;
/** Jak rychle čep zámku mezi křídly stahuje konce k sobě, m/s. */
const RYCHLOST_DOTAZENI = 0.1;
/** Do jaké vzdálenosti od opěry ve vodorovném směru konec na dosedací plochu dosedne, m. */
const SIRKA_DOSEDNUTI = 0.5;

export interface PopisZamku {
  /** Styčník se zámkem. */
  stycnik: number;
  /**
   * Prvky druhého křídla: při odemknutí přejdou na nový styčník. Prázdný seznam znamená
   * zámek na opěře (styčník je podepřený a odemknutí mu podporu vezme).
   */
  prvky: readonly number[];
}

export interface Zamky {
  pocet: number;
  stycnik: Int32Array;
  /** Druhý konec zámku mezi křídly po rozdělení; −1 u zámku na opěře a před rozdělením. */
  druhy: Int32Array;
  prvky: (readonly number[])[];
  /** Podpora styčníku před odemknutím (bity jako `Soustava.podpora`); 0 u zámku mezi křídly. */
  podpora: Uint8Array;
  /** Místo opěry: kde konec křídla ležel, než se odemkl. */
  x0: Float64Array;
  y0: Float64Array;
  stav: Uint8Array;
  /** Tuhost dosedací plochy a čepu zámku, N/m. */
  tuhost: number;
  /**
   * Poměrný útlum dosednutí a čepu. Součinitel tlumení (N·s/m) každého zámku se z něj a
   * z hmoty spojovaných konců spočítá při odemknutí a zamknutí: pevně daný tlumič by na
   * lehkém styčníku rozkmital výpočet.
   */
  utlum: number;
  tlumeni: Float64Array;
  /**
   * O kolik jsou konce zámku mezi křídly ještě od sebe, než je čep dotáhne (m): poloha
   * druhého konce minus poloha prvního, při které čep nic nepřenáší.
   */
  odsazeniX: Float64Array;
  odsazeniY: Float64Array;
  /** Největší síla, kterou dosedací plocha nebo čep od posledního vynulování přenesly, N. */
  nejvetsiSila: Float64Array;
}

export function vytvorZamky(s: Soustava, popisy: readonly PopisZamku[], tuhost: number, utlum: number): Zamky {
  const n = popisy.length;
  return {
    pocet: n,
    stycnik: Int32Array.from(popisy, (p) => p.stycnik),
    druhy: new Int32Array(n).fill(-1),
    prvky: popisy.map((p) => p.prvky),
    podpora: Uint8Array.from(popisy, (p) => (p.prvky.length === 0 ? s.podpora[p.stycnik]! : 0)),
    x0: Float64Array.from(popisy, (p) => s.x[p.stycnik]!),
    y0: Float64Array.from(popisy, (p) => s.y[p.stycnik]!),
    stav: new Uint8Array(n),
    tuhost,
    utlum,
    tlumeni: new Float64Array(n),
    odsazeniX: new Float64Array(n),
    odsazeniY: new Float64Array(n),
    nejvetsiSila: new Float64Array(n),
  };
}

/**
 * Odemkne všechny zámky. Mění stavbu soustavy (podpory, nové styčníky): volající pak
 * zavolá `Simulace.poZmeneStavby`. Vrací, kolik zámků odemkl.
 */
export function odemkniZamky(s: Soustava, z: Zamky): number {
  let odemceno = 0;
  for (let k = 0; k < z.pocet; k++) {
    if (z.stav[k] === ZAMEK_ODEMCENY) continue;
    const i = z.stycnik[k]!;
    if (z.prvky[k]!.length === 0) {
      // Zámek na opěře: konec ztratí podporu, zůstane jen dosedací plocha.
      s.podpora[i] = s.podpora[i]! & ~z.podpora[k]!;
    } else if (z.druhy[k] === -1) {
      z.druhy[k] = rozdelStycnik(s, i, z.prvky[k]!);
    }
    z.stav[k] = ZAMEK_ODEMCENY;
    odemceno += 1;
  }
  if (odemceno > 0) {
    prepoctiHmoty(s);
    // Dosedací plocha tlumí podle hmoty konce, který na ni dosedne.
    for (let k = 0; k < z.pocet; k++) {
      if (z.druhy[k] === -1) z.tlumeni[k] = tlumeniPodleHmoty(z, s.invHmotaY[z.stycnik[k]!]!);
    }
  }
  return odemceno;
}

/**
 * Zkusí zamknout odemčené zámky: zapadne ten, jehož konce jsou u sebe (nebo konec u opěry)
 * blíž než `VULE_ZAMKU` a vůči sobě se skoro nehýbou (`RYCHLOST_ZAMKNUTI`); konec, který se
 * po dosednutí ještě houpe, zámek nechytí. Mění stavbu soustavy jako `odemkniZamky`. Vrací,
 * kolik jich zapadlo.
 */
export function zamkniZamky(s: Soustava, z: Zamky): number {
  let zapadlo = 0;
  for (let k = 0; k < z.pocet; k++) {
    if (z.stav[k] !== ZAMEK_ODEMCENY) continue;
    const i = z.stycnik[k]!;
    const j = z.druhy[k]!;
    const dx = j >= 0 ? s.x[j]! - s.x[i]! : z.x0[k]! - s.x[i]!;
    const dy = j >= 0 ? s.y[j]! - s.y[i]! : z.y0[k]! - s.y[i]!;
    if (dx * dx + dy * dy > VULE_ZAMKU * VULE_ZAMKU) continue;
    const dvx = j >= 0 ? s.vx[j]! - s.vx[i]! : s.vx[i]!;
    const dvy = j >= 0 ? s.vy[j]! - s.vy[i]! : s.vy[i]!;
    if (dvx * dvx + dvy * dvy > RYCHLOST_ZAMKNUTI * RYCHLOST_ZAMKNUTI) continue;
    if (j < 0) {
      // Podpora se vrátí tam, kde konec leží; zadržené posuny se zastaví.
      s.podpora[i] = s.podpora[i]! | z.podpora[k]!;
      if ((z.podpora[k]! & 1) !== 0) s.vx[i] = 0;
      if ((z.podpora[k]! & 2) !== 0) s.vy[i] = 0;
    } else {
      // Čep tlumí podle hmoty obou konců, které drží u sebe; zapadne bez rázu tam, kde konce jsou.
      z.tlumeni[k] = tlumeniPodleHmoty(z, s.invHmotaY[i]! + s.invHmotaY[j]!);
      z.odsazeniX[k] = dx;
      z.odsazeniY[k] = dy;
    }
    z.stav[k] = ZAMEK_ZAPADLY;
    zapadlo += 1;
  }
  if (zapadlo > 0) prepoctiHmoty(s);
  return zapadlo;
}

/** Součinitel tlumení pro daný poměrný útlum: 2·ζ·√(k·m), kde 1/m je `invHmota`. */
function tlumeniPodleHmoty(z: Zamky, invHmota: number): number {
  return invHmota > 0 ? 2 * z.utlum * Math.sqrt(z.tuhost / invHmota) : 0;
}

/**
 * Posune dotahování zámků o krok `dt`: čep zapadlého zámku mezi křídly stahuje konce k sobě.
 * Volá se jednou na začátku každého kroku simulace.
 */
export function posunZamky(z: Zamky, dt: number): void {
  const krok = RYCHLOST_DOTAZENI * dt;
  for (let k = 0; k < z.pocet; k++) {
    if (z.stav[k] !== ZAMEK_ZAPADLY || z.druhy[k]! < 0) continue;
    z.odsazeniX[k] = kNule(z.odsazeniX[k]!, krok);
    z.odsazeniY[k] = kNule(z.odsazeniY[k]!, krok);
  }
}

function kNule(hodnota: number, krok: number): number {
  if (hodnota > krok) return hodnota - krok;
  if (hodnota < -krok) return hodnota + krok;
  return 0;
}

/** Jsou všechny zámky zamčené (původně, nebo znovu po sklopení)? */
export function zamkyZamcene(z: Zamky): boolean {
  for (let k = 0; k < z.pocet; k++) if (z.stav[k] === ZAMEK_ODEMCENY) return false;
  return true;
}

/**
 * Přičte síly zámků: dosednutí odemčeného konce na opěru (jen tlak vzhůru) a čep znovu
 * zamčeného zámku mezi křídly (pružina s tlumičem v obou směrech). Vlastní stav kromě
 * největší přenesené síly nemění.
 */
export function pridejSilyZamku(s: Soustava, z: Zamky): void {
  const { tuhost } = z;
  for (let k = 0; k < z.pocet; k++) {
    const i = z.stycnik[k]!;
    const j = z.druhy[k]!;
    const tlumeni = z.tlumeni[k]!;
    if (j < 0) {
      if (z.stav[k] !== ZAMEK_ODEMCENY) continue;
      const stranou = s.x[i]! - z.x0[k]!;
      if (stranou > SIRKA_DOSEDNUTI || stranou < -SIRKA_DOSEDNUTI) continue;
      const stlaceni = z.y0[k]! - s.y[i]!;
      if (!(stlaceni > 0)) continue;
      let sila = tuhost * stlaceni - tlumeni * s.vy[i]!;
      if (sila < 0) sila = 0;
      s.fy[i] = s.fy[i]! + sila;
      if (sila > z.nejvetsiSila[k]!) z.nejvetsiSila[k] = sila;
    } else if (z.stav[k] === ZAMEK_ZAPADLY) {
      const fx = tuhost * (s.x[j]! - s.x[i]! - z.odsazeniX[k]!) + tlumeni * (s.vx[j]! - s.vx[i]!);
      const fy = tuhost * (s.y[j]! - s.y[i]! - z.odsazeniY[k]!) + tlumeni * (s.vy[j]! - s.vy[i]!);
      s.fx[i] = s.fx[i]! + fx;
      s.fy[i] = s.fy[i]! + fy;
      s.fx[j] = s.fx[j]! - fx;
      s.fy[j] = s.fy[j]! - fy;
      const velikost2 = fx * fx + fy * fy;
      if (velikost2 > z.nejvetsiSila[k]! * z.nejvetsiSila[k]!) z.nejvetsiSila[k] = Math.sqrt(velikost2);
    }
  }
}

/**
 * O kolik zámky zvyšují čtverec nejvyšší frekvence soustavy (rad²/s²): tuhá dosedací plocha
 * nebo čep na lehkém styčníku kmitá rychle a krok výpočtu se podle toho musí zkrátit.
 */
export function pridavnaFrekvenceZamku(s: Soustava, z: Zamky): number {
  let nejvic = 0;
  for (let k = 0; k < z.pocet; k++) {
    const i = z.stycnik[k]!;
    const j = z.druhy[k]!;
    let invHmota = 0;
    if (j < 0) {
      if (z.stav[k] === ZAMEK_ODEMCENY) invHmota = s.invHmotaY[i]!;
    } else if (z.stav[k] === ZAMEK_ZAPADLY) {
      invHmota = s.invHmotaY[i]! + s.invHmotaY[j]!;
    }
    const omega2 = z.tuhost * invHmota;
    if (omega2 > nejvic) nejvic = omega2;
  }
  // Tlumič zámku se počítá explicitně a krok zkracuje také: s útlumem do 0,3 stačí dvojnásobek.
  return 2 * nejvic;
}
