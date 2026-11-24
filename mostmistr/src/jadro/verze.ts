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
 * - 7: opravy po nezávislé kontrole fyziky M5. Mostovka silnice a koleje se dělí vždy aspoň na
 *      dva díly, takže kolo jede po její ohybové čáře i u krátkého tuhého pole (kolejiště dřív
 *      vozidlu ukazovalo rovnou tětivu); brzdná a tažná síla nabíhá a doznívá plynule místo
 *      skokem; přenos tíhy mezi nápravami při brzdění splňuje rovnováhu momentů i u vozidel
 *      s více než dvěma nápravami. Mění se výsledky úrovní s vlakem a s brzděním; otisky
 *      dosavadní regresní sady se nezměnily (takový most v ní nebyl), přibyl scénář s vlakem.
 * - 8: vzpěr a plasticita po nezávislé kontrole výpočtů M7 (milník M8). Plastický moment se
 *      v tlaku krátí únosností průřezu v tlaku, ne v tahu (tlačená ocelobetonová mostovka byla
 *      v ohybu slabší než tažená). Vzpěrná délka se bere přes řetěz prutů, které ve svaru
 *      pokračují v přímce a nic dalšího je tam nedrží (pilíře nad sebou i bez svaru). Zkouška
 *      do zlomu nezvyšuje zátěž, dokud přibývá plastická práce. Výsledky běžných zkoušek
 *      referenčních mostů se nezměnily; z otisků jen scénář zkoušky do zlomu.
 * - 9: kmitání pod lidmi se měří i na mostě, který se porušil a stojí dál (milník M14). Ráz
 *      samotného porušení se nepočítá a do výsledku jde měření po porušení, jen když z mostu
 *      nikdo nespadl. Most, na kterém hned na začátku něco povolilo, dřív kmitání změřené neměl
 *      a mohl projít; teď na kmitání propadne. Neporušených mostů se to netýká a otisky
 *      regresní sady se nezměnily: změnilo se hodnocení.
 */
export const VERZE_FYZIKY = 9;
