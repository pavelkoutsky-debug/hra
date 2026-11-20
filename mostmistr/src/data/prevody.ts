import { ChybaDat, cislo, objekt } from "./kontrola";

/** Převod dat o jednu verzi formátu výš. */
export type Prevod = (stara: Record<string, unknown>) => Record<string, unknown>;

/**
 * Převede data ze starší verze formátu na aktuální.
 * `prevody[i]` převádí z verze `i + 1` na verzi `i + 2`, takže řetěz pro aktuální
 * verzi N má N − 1 položek. Novější data, než hra umí, odmítne.
 */
export function prevedNaAktualni(
  data: unknown,
  aktualni: number,
  prevody: readonly Prevod[],
  cesta: string,
): Record<string, unknown> {
  let d = objekt(data, cesta);
  let verze = cislo(d.verze, `${cesta}.verze`, { min: 1, cele: true });
  if (verze > aktualni) {
    throw new ChybaDat(
      `${cesta}.verze`,
      `formát verze ${verze} je novější, než tato verze hry umí (${aktualni})`,
    );
  }
  while (verze < aktualni) {
    const prevod = prevody[verze - 1];
    if (!prevod) throw new ChybaDat(`${cesta}.verze`, `chybí převod z verze ${verze}`);
    verze += 1;
    d = { ...prevod(d), verze };
  }
  return d;
}
