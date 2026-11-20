import type { Soustava } from "./soustava";

/**
 * Seznam volných stupňů volnosti soustavy: pro každý kód `styčník · 3 + směr`,
 * kde směr je 0 pro posun x, 1 pro posun y a 2 pro natočení.
 * Zadržené posuny a natočení styčníků bez tuhého spoje v seznamu nejsou.
 */
export function volneStupne(s: Soustava): Int32Array {
  const kody: number[] = [];
  for (let i = 0; i < s.pocetStycniku; i++) {
    if (s.invHmotaX[i] !== 0) kody.push(3 * i);
    if (s.invHmotaY[i] !== 0) kody.push(3 * i + 1);
    if (s.invSetrvacnost[i] !== 0) kody.push(3 * i + 2);
  }
  return Int32Array.from(kody);
}

/** Hmota, případně rotační setrvačnost, příslušná každému volnému stupni. */
export function hmotyStupnu(s: Soustava, stupne: Int32Array): Float64Array {
  const hmoty = new Float64Array(stupne.length);
  for (let k = 0; k < stupne.length; k++) {
    const kod = stupne[k]!;
    const i = (kod / 3) | 0;
    hmoty[k] = kod % 3 === 2 ? s.setrvacnost[i]! : s.hmota[i]!;
  }
  return hmoty;
}

/**
 * Posune soustavu o malý přírůstek `meritko · smer` ve volných stupních.
 * Natočení se přičítá lineárně a vektor natočení se znovu normuje, což pro účely
 * numerického derivování stačí.
 */
export function posunStupne(s: Soustava, stupne: Int32Array, smer: Float64Array, meritko: number): void {
  for (let k = 0; k < stupne.length; k++) {
    const kod = stupne[k]!;
    const i = (kod / 3) | 0;
    const d = meritko * smer[k]!;
    const druh = kod % 3;
    if (druh === 0) s.x[i] = s.x[i]! + d;
    else if (druh === 1) s.y[i] = s.y[i]! + d;
    else {
      const c = s.cosN[i]! - s.sinN[i]! * d;
      const sn = s.sinN[i]! + s.cosN[i]! * d;
      const delka = Math.sqrt(c * c + sn * sn);
      s.cosN[i] = c / delka;
      s.sinN[i] = sn / delka;
    }
  }
}

/** Přečte síly a momenty ve volných stupních do vektoru. */
export function silyStupnu(s: Soustava, stupne: Int32Array, cil: Float64Array): void {
  for (let k = 0; k < stupne.length; k++) {
    const kod = stupne[k]!;
    const i = (kod / 3) | 0;
    const druh = kod % 3;
    cil[k] = druh === 0 ? s.fx[i]! : druh === 1 ? s.fy[i]! : s.moment[i]!;
  }
}

/** Uloží polohu a natočení styčníků, aby se k nim šlo vrátit. */
export function ulozPolohu(s: Soustava): Float64Array {
  const n = s.pocetStycniku;
  const zaloha = new Float64Array(4 * n);
  zaloha.set(s.x, 0);
  zaloha.set(s.y, n);
  zaloha.set(s.cosN, 2 * n);
  zaloha.set(s.sinN, 3 * n);
  return zaloha;
}

export function obnovPolohu(s: Soustava, zaloha: Float64Array): void {
  const n = s.pocetStycniku;
  s.x.set(zaloha.subarray(0, n));
  s.y.set(zaloha.subarray(n, 2 * n));
  s.cosN.set(zaloha.subarray(2 * n, 3 * n));
  s.sinN.set(zaloha.subarray(3 * n, 4 * n));
}
