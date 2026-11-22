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
 * - 4: zkouška nekončí, dokud ti, kdo spadli, nedopadnou na zem nebo do vody (milník M3z).
 *      Mění se délka děje a konečný stav mostů, ze kterých někdo spadl; otisky referenčních
 *      mostů se nezměnily.
 * - 5: lidé na silně kmitající mostovce ztrácejí krok (nad 2,5 m/s² jejich budicí síla slábne,
 *      nad 6 m/s² z ní zbývá čtvrtina) a ve výsledku se lidé počítají po jednom, ne po řadách
 *      (milník M3b). Mění se kmitání mostů, které se rozhoupaly přes mez; otisky referenčních
 *      mostů se nezměnily.
 * - 6: vlastní tíha prutů s tuhými konci působí po délce (momenty vetknutí a přesun příčné
 *      síly, `pridejTihuPrvku`), ne jen ve styčnících; tlumič kontaktu kola nepočítá s rychlostí
 *      povrchu přes 30 m/s (milník M5). Podporové momenty spojitých nosníků jsou správně
 *      (dřív o 6 % menší), pruty složené z dílů se pod vlastní tíhou prohnou o pětinu víc.
 *      Mění se otisky všech referenčních mostů; pořadí medailí úrovní zůstalo.
 */
export const VERZE_FYZIKY = 6;
