/**
 * Verze fyziky. Zvyšuje se pokaždé, když se změní výsledek zkoušky stejného mostu,
 * tedy když se změní otisk některého referenčního mostu v regresní sadě
 * (`test/regrese-otisky.json`). Výsledky a rekordy se na ni vážou.
 *
 * Co která verze přinesla, je zapsáno v docs/STAV.md.
 * - 0: jádro ještě neexistovalo.
 * - 1: první úplné jádro (milník M1b).
 */
export const VERZE_FYZIKY = 1;
