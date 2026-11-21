// Pravidla kreslení: co editor hráči dovolí nakreslit. Opírají se o tutéž kontrolu návrhu,
// kterou před zkouškou dělá simulace, takže editor nikdy nenabídne most, který by zkouška odmítla
// (kromě překročeného rozpočtu, na který jen upozorňuje).

import type { Bod } from "../data/geometrie";
import type { IdPrvku } from "../data/katalog";
import { zkontrolujNavrh, type DruhProblemu, type NavrhMostu, type ProblemNavrhu } from "../data/navrh";
import type { Uroven } from "../data/uroven";
import { posunStycnik, pridejPrut, stycnikV } from "./upravy";

/** Problémy, které kreslení neblokují: hráč je vyřeší později a zkouška na ně počká. */
const NEBLOKUJE: ReadonlySet<DruhProblemu> = new Set(["nad-rozpocet"]);

function klic(p: ProblemNavrhu): string {
  return `${p.druh}:${p.stycnik ?? ""}:${p.prut ?? ""}`;
}

/** První problém, který v `novy` přibyl proti `stary`; null, když žádný blokující nepřibyl. */
function novyProblem(stary: NavrhMostu, novy: NavrhMostu, uroven: Uroven): DruhProblemu | null {
  const puvodni = new Set(zkontrolujNavrh(stary, uroven).map(klic));
  for (const p of zkontrolujNavrh(novy, uroven)) {
    if (!NEBLOKUJE.has(p.druh) && !puvodni.has(klic(p))) return p.druh;
  }
  return null;
}

/**
 * Smí kreslení prutu začít v daném bodě rastru? Jen ze styčníku mostu, z kotvy nebo ze
 * základu: most tak vždy roste z podpor a nevznikají volně visící kusy.
 */
export function lzeZacit(navrh: NavrhMostu, uroven: Uroven, bod: Bod): boolean {
  if (stycnikV(navrh, bod)) return true;
  const stejny = (b: Bod): boolean => b.x === bod.x && b.y === bod.y;
  return uroven.kotvy.some(stejny) || uroven.zaklady.some(stejny);
}

/** Proč nejde nakreslit prut z `a` do `b`; null, když jde. */
export function duvodProtiPrutu(navrh: NavrhMostu, uroven: Uroven, a: Bod, b: Bod, prvek: IdPrvku): DruhProblemu | null {
  if (a.x === b.x && a.y === b.y) return "prut-kratky";
  return novyProblem(navrh, pridejPrut(navrh, a, b, prvek), uroven);
}

/** Proč nejde styčník posunout do bodu `kam`; null, když jde. */
export function duvodProtiPosunu(navrh: NavrhMostu, uroven: Uroven, stycnik: number, kam: Bod): DruhProblemu | null {
  const posunuty = posunStycnik(navrh, stycnik, kam);
  if (!posunuty) return "stycniky-na-stejnem-miste";
  return novyProblem(navrh, posunuty, uroven);
}

/** Problémy, kvůli kterým zkoušku nelze spustit. */
export function prekazkyZkousky(navrh: NavrhMostu, uroven: Uroven): ProblemNavrhu[] {
  return zkontrolujNavrh(navrh, uroven);
}
