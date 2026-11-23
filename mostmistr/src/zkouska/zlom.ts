// Zkouška do zlomu: na mostovku se rovnoměrně přikládá zátěž (jako pytle s pískem při
// zatěžovací zkoušce) a roste, dokud se neporuší první prut, most nesjede z podpory nebo
// nepovolí píst. Zatížení roste s třetí mocninou času: zpočátku pomalu, takže lehká lávka
// nespadne v první vteřině, a přitom se za minutu dostane na tisícinásobek toho, co unese
// prkno přes potok. Stejná zkouška tak změří dřevěnou lávku i železniční viadukt.
// Jen násobení: hodnota vstupuje do simulace.

import type { ZlomZkousky } from "./protokol";

/** Nejdelší zkouška do zlomu, s; most, který vydrží až sem, unesl všechno, co zkouška umí naložit. */
export const NEJDELSI_ZLOM = 60;
/** Jak dlouho po prvním porušení děj ještě běží, aby bylo vidět, co se s mostem stalo, s. */
export const DOBEH_ZLOMU = 3;
/** Rozteč sil, kterými se rovnoměrné zatížení na mostovku přikládá, m. */
export const ROZTEC_ZATEZE = 0.5;
/**
 * Jak rychle zatížení roste, N/m za s³: po 10 s leží na metru mostovky 20 kN, po 20 s
 * 160 kN, po 30 s 540 kN. Mosty kampaně se lámou mezi pátou a třicátou vteřinou.
 */
export const NARUST_ZLOMU = 20;

/** Zkouška do zlomu, jak ji pouští hra. */
export const ZKOUSKA_DO_ZLOMU: Readonly<ZlomZkousky> = { narust: NARUST_ZLOMU };

/** Zatížení mostovky v N na metr délky v čase `cas` od začátku zkoušky. */
export function zatizeniZlomu(zlom: ZlomZkousky, cas: number): number {
  const t = cas < 0 ? 0 : cas > NEJDELSI_ZLOM ? NEJDELSI_ZLOM : cas;
  return zlom.narust * t * t * t;
}
