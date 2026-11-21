/**
 * Verze fyziky. Zvyšuje se pokaždé, když se změní výsledek zkoušky stejného mostu,
 * tedy když se změní otisk některého referenčního mostu v regresní sadě
 * (`test/regrese-otisky.json`). Výsledky a rekordy se na ni vážou.
 *
 * Co která verze přinesla, je zapsáno v docs/STAV.md.
 * - 0: jádro ještě neexistovalo.
 * - 1: první úplné jádro (milník M1b).
 * - 2: štíhlejší průřezy dřeva po kalibraci první kapitoly (milník M2).
 * - 3: měří se kmitání mostovky pod lidmi; nepřijatelné kmitání je neúspěch (milník M3a).
 *      Otisky referenčních mostů se nezměnily, změnilo se hodnocení.
 */
export const VERZE_FYZIKY = 3;
