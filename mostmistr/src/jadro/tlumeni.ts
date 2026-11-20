import type { VlastniTvary } from "./matice";
import type { Soustava } from "./soustava";
import { hmotyStupnu } from "./stupne";

/**
 * Tlumení zadané přímo vlastním tvarům: každý z prvních několika tvarů kmitání dostane
 * svůj poměrný útlum ζ. Síla na soustavu je −M·Φ·C·Φᵀ·M·v, kde Φ jsou tvary normované
 * hmotou a C je diagonála 2·ζ·ω. Tlumení vždy jen ubírá energii a ostatní tvary neovlivní.
 *
 * Tvary platí pro polohu, ve které byly spočítány. Po porušení mostu nebo při velkém
 * pohybu konstrukce (zvedací most) se má nahradit tlumením úměrným hmotě.
 */
export interface ModalniTlumeni {
  /** Styčník a směr (0 = x, 1 = y, 2 = natočení) každého volného stupně. */
  stycnik: Int32Array;
  smer: Uint8Array;
  /** Tvary vynásobené hmotou, po řádcích: M·φ_i. */
  hmotneTvary: Float64Array;
  /** 2·ζ·ω pro každý tvar. */
  soucinitele: Float64Array;
  /** Naposledy spočítané tlumicí síly ve volných stupních. */
  sily: Float64Array;
  /** Pracovní pole: rychlosti ve volných stupních. */
  rychlosti: Float64Array;
  /** Po kolika krocích se síly přepočítávají; mezi tím se drží. */
  interval: number;
  doPrepoctu: number;
}

/**
 * Největší fázové zpoždění držené síly, v radiánech, pro nejrychlejší tlumený tvar.
 * Držení síly po dobu T ji zpožďuje v průměru o T/2; při zpoždění 0,05 rad klesne
 * účinné tlumení o desetinu procenta.
 */
const NEJVETSI_ZPOZDENI = 0.05;

/**
 * Připraví tlumení pro dané tvary. `utlum` je poměrný útlum ζ společný všem tvarům,
 * nebo pole s hodnotou pro každý. Interval přepočtu se volí podle kroku `dt` tak,
 * aby držení síly neznehodnotilo tlumení nejrychlejšího tvaru.
 */
export function vytvorModalniTlumeni(
  s: Soustava,
  stupne: Int32Array,
  tvary: VlastniTvary,
  utlum: number | Float64Array,
  dt: number,
): ModalniTlumeni {
  const n = stupne.length;
  const pocet = tvary.omega.length;
  const hmoty = hmotyStupnu(s, stupne);
  const hmotneTvary = new Float64Array(pocet * n);
  const soucinitele = new Float64Array(pocet);
  let nejrychlejsi = 0;
  for (let i = 0; i < pocet; i++) {
    const zeta = typeof utlum === "number" ? utlum : utlum[i]!;
    soucinitele[i] = 2 * zeta * tvary.omega[i]!;
    nejrychlejsi = Math.max(nejrychlejsi, tvary.omega[i]!);
    for (let k = 0; k < n; k++) hmotneTvary[i * n + k] = hmoty[k]! * tvary.tvary[i * n + k]!;
  }
  const stycnik = new Int32Array(n);
  const smer = new Uint8Array(n);
  for (let k = 0; k < n; k++) {
    stycnik[k] = (stupne[k]! / 3) | 0;
    smer[k] = stupne[k]! % 3;
  }
  const interval = Math.max(1, Math.floor((2 * NEJVETSI_ZPOZDENI) / (nejrychlejsi * dt)));
  return {
    stycnik,
    smer,
    hmotneTvary,
    soucinitele,
    sily: new Float64Array(n),
    rychlosti: new Float64Array(n),
    interval,
    doPrepoctu: 0,
  };
}

/** Přičte tlumicí síly k silám na styčníky; podle intervalu je předtím přepočítá. */
export function pridejModalniTlumeni(s: Soustava, t: ModalniTlumeni): void {
  const { stycnik, smer, hmotneTvary, soucinitele, sily, rychlosti } = t;
  const n = sily.length;
  const { vx, vy, omega, fx, fy, moment } = s;

  if (t.doPrepoctu <= 0) {
    t.doPrepoctu = t.interval;
    // Rychlosti se posbírají jednou; vnitřní smyčky pak běží nad souvislými poli.
    for (let k = 0; k < n; k++) {
      const uzel = stycnik[k]!;
      rychlosti[k] = smer[k] === 0 ? vx[uzel]! : smer[k] === 1 ? vy[uzel]! : omega[uzel]!;
    }
    sily.fill(0);
    const pocet = soucinitele.length;
    for (let i = 0; i < pocet; i++) {
      const radek = i * n;
      // Rychlost tvaru: φᵀ·M·v.
      let rychlostTvaru = 0;
      for (let k = 0; k < n; k++) rychlostTvaru += hmotneTvary[radek + k]! * rychlosti[k]!;
      const nasobek = -soucinitele[i]! * rychlostTvaru;
      for (let k = 0; k < n; k++) sily[k] = sily[k]! + nasobek * hmotneTvary[radek + k]!;
    }
  }
  t.doPrepoctu -= 1;

  for (let k = 0; k < n; k++) {
    const uzel = stycnik[k]!;
    const sila = sily[k]!;
    if (smer[k] === 0) fx[uzel] = fx[uzel]! + sila;
    else if (smer[k] === 1) fy[uzel] = fy[uzel]! + sila;
    else moment[uzel] = moment[uzel]! + sila;
  }
}
