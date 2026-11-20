// Tlumení úměrné hmotě pro konstrukci po porušení.
//
// Dokud je most celý, tlumí se jeho vlastní tvary (tlumeni.ts). Porušením tvary přestanou
// platit a nastoupí jednodušší tlumení: síla −α·m·v na každý styčník. V té podobě by ale
// brzdilo i pohyb, který kmitáním není: utržený prut by padal jako v oleji a zlomená
// polovina mostu by se kolem podpory sklápěla zpomaleně. Proto se od rychlosti každé
// souvislé části konstrukce nejdřív odečte pohyb, kterým se smí hýbat jako tuhý celek:
//
//   část bez podpory          posun a otáčení (volný pád, let trosek),
//   část držená jedním bodem  otáčení kolem něj, u posuvné podpory i posun v jejím směru,
//   část držená víckrát       žádný; tlumí se celá rychlost.
//
// Tlumí se tak jen deformace a kmitání. Pohyb celku se určí z hybnosti a momentu hybnosti
// části, takže tlumení nikdy energii nepřidává.

import type { Soustava } from "./soustava";

/** Největší α v 1/s. Konstrukce, která porušení přežila, tak má na 3 Hz útlum kolem 0,7 %. */
export const NEJVYSSI_ALFA = 0.25;

const DRZENA = 0;
const VOLNA = 1;
/** Otáčení kolem pevného bodu. */
const KLOUB = 2;
/** Otáčení kolem bodu, který se smí posouvat vodorovně, nebo svisle. */
const POSUV_X = 3;
const POSUV_Y = 4;

export interface TlumeniHmotou {
  alfa: number;
  /** Číslo souvislé části pro každý styčník; −1 u styčníků, které se netlumí (břemena). */
  cast: Int32Array;
  pocetCasti: number;
  /** Jak se část smí hýbat jako celek, a styčník, kolem kterého se otáčí. */
  volnost: Uint8Array;
  stred: Int32Array;
  // Pracovní pole, jedna hodnota na část.
  hmota: Float64Array;
  stredX: Float64Array;
  stredY: Float64Array;
  hybnostX: Float64Array;
  hybnostY: Float64Array;
  statickyX: Float64Array;
  statickyY: Float64Array;
  momentHybnosti: Float64Array;
  setrvacnost: Float64Array;
  posunX: Float64Array;
  posunY: Float64Array;
  otaceni: Float64Array;
}

/**
 * Rozdělí soustavu na souvislé části a určí, jak se která smí hýbat jako celek.
 * `tlumeny` označuje styčníky konstrukce; ostatní (břemena s vlastními tlumiči) se
 * netlumí. Volá se po každé změně stavby.
 */
export function vytvorTlumeniHmotou(s: Soustava, alfa: number, tlumeny: Uint8Array | null): TlumeniHmotou {
  const n = s.pocetStycniku;
  // Souvislé části sjednocováním koncových styčníků prvků.
  const koren = new Int32Array(n);
  for (let i = 0; i < n; i++) koren[i] = i;
  const najdi = (i: number): number => {
    while (koren[i] !== i) {
      koren[i] = koren[koren[i]!]!;
      i = koren[i]!;
    }
    return i;
  };
  for (let e = 0; e < s.pocetPrvku; e++) {
    const a = najdi(s.prvekA[e]!);
    const b = najdi(s.prvekB[e]!);
    // Menší index je kořenem, aby číslování nezáviselo na pořadí prvků.
    if (a < b) koren[b] = a;
    else if (b < a) koren[a] = b;
  }

  const cast = new Int32Array(n).fill(-1);
  const cisloKorene = new Int32Array(n).fill(-1);
  let pocet = 0;
  for (let i = 0; i < n; i++) {
    if (tlumeny && i < tlumeny.length && tlumeny[i] === 0) continue;
    const k = najdi(i);
    if (cisloKorene[k] === -1) cisloKorene[k] = pocet++;
    cast[i] = cisloKorene[k]!;
  }

  const volnost = new Uint8Array(pocet).fill(VOLNA);
  const stred = new Int32Array(pocet).fill(-1);
  for (let i = 0; i < n; i++) {
    const c = cast[i]!;
    if (c < 0) continue;
    const podpora = s.podpora[i]!;
    if ((podpora & 3) === 0) continue;
    if (volnost[c] !== VOLNA) {
      volnost[c] = DRZENA; // druhá podpora
      continue;
    }
    stred[c] = i;
    // Vetknutí drží i natočení, pokud do styčníku vede tuhý konec prutu.
    const vetknuto = (podpora & 4) !== 0 && s.setrvacnost[i]! > 0;
    if (vetknuto) volnost[c] = DRZENA;
    else if ((podpora & 3) === 3) volnost[c] = KLOUB;
    else volnost[c] = (podpora & 2) !== 0 ? POSUV_X : POSUV_Y;
  }

  const pole = (): Float64Array => new Float64Array(pocet);
  return {
    alfa,
    cast,
    pocetCasti: pocet,
    volnost,
    stred,
    hmota: pole(),
    stredX: pole(),
    stredY: pole(),
    hybnostX: pole(),
    hybnostY: pole(),
    statickyX: pole(),
    statickyY: pole(),
    momentHybnosti: pole(),
    setrvacnost: pole(),
    posunX: pole(),
    posunY: pole(),
    otaceni: pole(),
  };
}

/** Přičte tlumicí síly ke styčníkům. */
export function pridejTlumeniHmotou(s: Soustava, t: TlumeniHmotou): void {
  const { cast, volnost, stred, hmota, stredX, stredY, hybnostX, hybnostY } = t;
  const { statickyX, statickyY, momentHybnosti, setrvacnost, posunX, posunY, otaceni } = t;
  const { x, y, vx, vy, omega, fx, fy, moment } = s;
  const n = Math.min(s.pocetStycniku, cast.length);
  const pocet = t.pocetCasti;
  const alfa = t.alfa;
  if (alfa === 0) return;

  // Vztažný bod části: podpora, kolem které se otáčí; u volné části první průchod určí těžiště.
  for (let c = 0; c < pocet; c++) {
    hmota[c] = 0;
    hybnostX[c] = 0;
    hybnostY[c] = 0;
    statickyX[c] = 0;
    statickyY[c] = 0;
    momentHybnosti[c] = 0;
    setrvacnost[c] = 0;
    const bod = stred[c]!;
    stredX[c] = bod >= 0 ? x[bod]! : 0;
    stredY[c] = bod >= 0 ? y[bod]! : 0;
  }
  for (let i = 0; i < n; i++) {
    const c = cast[i]!;
    if (c < 0 || volnost[c] === DRZENA) continue;
    const m = s.hmota[i]!;
    const dx = x[i]! - stredX[c]!;
    const dy = y[i]! - stredY[c]!;
    hmota[c] = hmota[c]! + m;
    hybnostX[c] = hybnostX[c]! + m * vx[i]!;
    hybnostY[c] = hybnostY[c]! + m * vy[i]!;
    statickyX[c] = statickyX[c]! + m * dx;
    statickyY[c] = statickyY[c]! + m * dy;
    momentHybnosti[c] = momentHybnosti[c]! + m * (dx * vy[i]! - dy * vx[i]!);
    setrvacnost[c] = setrvacnost[c]! + m * (dx * dx + dy * dy);
  }

  // Pohyb celku: posun vztažného bodu (u, w) a úhlová rychlost ω, které nejlépe vystihují
  // rychlosti styčníků (shodná hybnost a moment hybnosti v povolených směrech).
  for (let c = 0; c < pocet; c++) {
    posunX[c] = 0;
    posunY[c] = 0;
    otaceni[c] = 0;
    const druh = volnost[c]!;
    const M = hmota[c]!;
    if (druh === DRZENA || !(M > 0)) continue;
    const Sx = statickyX[c]!;
    const Sy = statickyY[c]!;
    const I = setrvacnost[c]!;
    const L = momentHybnosti[c]!;
    if (druh === VOLNA) {
      // Přepočet k těžišti: tam jsou posun a otáčení nezávislé.
      const tx = Sx / M;
      const ty = Sy / M;
      const u = hybnostX[c]! / M;
      const w = hybnostY[c]! / M;
      const vlastni = I - M * (tx * tx + ty * ty);
      const om = vlastni > 1e-9 * I ? (L - M * (tx * w - ty * u)) / vlastni : 0;
      otaceni[c] = om;
      // Rychlost vztažného bodu (počátku), aby šla rychlost celku psát jednotně.
      posunX[c] = u + om * ty;
      posunY[c] = w - om * tx;
    } else if (druh === KLOUB) {
      otaceni[c] = I > 0 ? L / I : 0;
    } else if (druh === POSUV_X) {
      // Neznámé u a ω: M·u − S_y·ω = P_x, −S_y·u + I·ω = L.
      const det = M * I - Sy * Sy;
      if (det > 1e-9 * M * I) {
        posunX[c] = (hybnostX[c]! * I + Sy * L) / det;
        otaceni[c] = (M * L + Sy * hybnostX[c]!) / det;
      } else {
        posunX[c] = hybnostX[c]! / M;
      }
    } else {
      // Neznámé w a ω: M·w + S_x·ω = P_y, S_x·w + I·ω = L.
      const det = M * I - Sx * Sx;
      if (det > 1e-9 * M * I) {
        posunY[c] = (hybnostY[c]! * I - Sx * L) / det;
        otaceni[c] = (M * L - Sx * hybnostY[c]!) / det;
      } else {
        posunY[c] = hybnostY[c]! / M;
      }
    }
  }

  for (let i = 0; i < n; i++) {
    const c = cast[i]!;
    if (c < 0) continue;
    const om = otaceni[c]!;
    const dx = x[i]! - stredX[c]!;
    const dy = y[i]! - stredY[c]!;
    const m = alfa * s.hmota[i]!;
    fx[i] = fx[i]! - m * (vx[i]! - posunX[c]! + om * dy);
    fy[i] = fy[i]! - m * (vy[i]! - posunY[c]! - om * dx);
    moment[i] = moment[i]! - alfa * s.setrvacnost[i]! * (omega[i]! - om);
  }
}
