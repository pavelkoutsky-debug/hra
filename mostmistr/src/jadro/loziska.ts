// Posuvné podpory s konečnou úložnou délkou. Posuvné ložisko nese konec mostu jen svisle
// a nechá ho volně dýchat; když se ale konec posune dál, než sahá úložná plocha, z ložiska
// sjede a podporu ztratí. Bez toho by se při zřícení posuvná podpora rozjela po své rovině
// přes celé údolí a most by na ní zůstal viset ve vzduchu.

import type { Soustava } from "./soustava";

/** O kolik metrů se konec mostu smí na posuvné podpoře posunout, než z ní sjede. */
export const ULOZNA_DELKA = 0.5;

export interface Loziska {
  /** Styčníky s posuvnou podporou. */
  stycnik: Int32Array;
  /** Jejich výchozí poloha x. */
  x0: Float64Array;
  /** Úložná délka na každou stranu od výchozí polohy, m. */
  delka: number;
}

/**
 * Najde mezi styčníky `od` až `po` posuvné podpory (zadržený jen svislý posun) a zapamatuje
 * si jejich výchozí polohu.
 */
export function vytvorLoziska(s: Soustava, od = 0, po = s.pocetStycniku, delka = ULOZNA_DELKA): Loziska {
  const stycniky: number[] = [];
  for (let i = od; i < po; i++) {
    if ((s.podpora[i]! & 3) === 2) stycniky.push(i);
  }
  return { stycnik: Int32Array.from(stycniky), x0: Float64Array.from(stycniky, (i) => s.x[i]!), delka };
}

/**
 * Uvolní podpory, jejichž styčník sjel z ložiska, a zapíše jejich čísla do `sjete`.
 * Vrací, kolik jich uvolnil. Volající pak musí přepočítat hmoty soustavy.
 */
export function uvolniSjeta(s: Soustava, l: Loziska, sjete: number[]): number {
  let uvolneno = 0;
  for (let k = 0; k < l.stycnik.length; k++) {
    const i = l.stycnik[k]!;
    if ((s.podpora[i]! & 2) === 0) continue; // už sjel
    const posun = s.x[i]! - l.x0[k]!;
    if (posun > l.delka || posun < -l.delka) {
      s.podpora[i] = s.podpora[i]! & ~2;
      sjete.push(i);
      uvolneno++;
    }
  }
  return uvolneno;
}
