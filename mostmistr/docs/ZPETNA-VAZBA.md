# Zpětná vazba hráčů a deník hraní

Od milníku M4c hra sbírá dvě věci: zprávy, které jí hráči sami napíšou, a anonymní deník toho, jak se hraje. Obojí se ukládá na Netlify (funkce a úložiště Netlify Blobs téhož webu) a čte se na stránce správce.

## Co je potřeba nastavit (jednou)

1. V Netlify otevři projekt `mostmistr` → **Project configuration → Environment variables → Add a variable**.
2. Klíč `MM_SPRAVCE_HESLO`, hodnota je heslo správce (aspoň 8 znaků). Rozsah (scope) musí zahrnovat **Functions**.
3. Web znovu nasaď (**Deploys → Trigger deploy**), aby funkce heslo dostaly.
4. Otevři `https://mostmistr.netlify.app/sprava.html` a přihlas se heslem.

Bez nastaveného hesla server správě nic nevydá (odpoví, že heslo chybí); hra sama funguje a data se ukládají i tak.

Úložiště je společné všem nasazením webu, tedy i náhledům pull requestů. U každého záznamu je proto zapsáno, odkud přišel (`production`, `deploy-preview`).

## Zpětná vazba

Tlačítko **Napiš nám** je v přehledu kampaně, v horní liště úrovně a v panelu s výsledkem zkoušky. Hráč zvolí, o čem píše (něco nefunguje, obtížnost, nápad, pochvala, jiné), napíše text, může říct, jak ho hra baví (1 až 5), a nechat e-mail pro odpověď. Když nechá zaškrtnuté přílohy, pošle se s textem i most, který má právě na výkresu, a posledních nejvýš 150 kroků z deníku.

Na stránce správce má každá zpráva stav **nová → řeší se → vyřešeno / zamítnuto** a poznámku k řešení. V detailu je most nakreslený na výkresu úrovně (jde zkopírovat a ve hře načíst tlačítkem Import) a seznam kroků před odesláním. Zprávu jde smazat.

## Deník hraní

Hra zapisuje, co hráč dělá: které úrovně otevře a jak dlouho v nich je, každý nakreslený prut (prvek, odkud kam), ostatní úpravy mostu, zvolený nástroj, každou zkoušku včetně celého mostu a jejího výsledku (průchod, medaile, cena, největší využití, první porušení, kmitání), dopnutí lan, zavření zadání a chyby, které ohlásí prohlížeč.

- **Anonymně.** Hráč dostane náhodné číslo uložené v jeho prohlížeči; žádné jméno, e-mail ani adresa se neukládají. E-mail vidíš jen tehdy, když ho hráč sám napíše do zpětné vazby.
- **Zapnuto, jde vypnout.** Při první návštěvě hra na záznam upozorní; vypínač je v přehledu kampaně a v okně zpětné vazby. S vypnutým záznamem se neodešle nic (jen informace, že ho hráč vypnul); zpětnou vazbu poslat jde dál.
- **Po dávkách.** Události se posílají po čtyřiceti nebo po dvaceti sekundách, hned po výsledku zkoušky a při opuštění stránky. Když server třikrát neodpoví, hra to do konce sezení vzdá a hraní tím netrpí.

Stránka správce ukazuje po dnech nebo za delší období (7 dní, 30 dní, vše):

- kolik hráčů úroveň otevřelo, kolik ji prošlo a kolik jich odešlo bez jediné zkoušky,
- medián počtu zkoušek a minut do prvního průchodu,
- kolik hráčů má kterou medaili,
- cenu nejlevnějšího průchodu a medián proti rozpočtům úrovně,
- z čeho se stavělo a na čem mosty nejčastěji padaly,
- jednotlivá sezení krok za krokem; kliknutím na zkoušku se most nakreslí.

Den jde stáhnout jako JSON k vlastnímu rozboru a smazat.

## Kde to je v kódu

| Část | Soubor |
|---|---|
| Sbírání a odesílání ve hře | `src/denik/denik.ts`, `src/denik/prohlizec.ts` |
| Tvar a kontrola dat | `src/denik/udalosti.ts` |
| Souhrny (výtahy dnů, slučování) | `src/denik/souhrn.ts` |
| Obsluha žádostí serveru | `src/server/obsluha.ts` |
| Úložiště (Netlify Blobs) | `src/server/blobs.ts`, v testech `SkladVPameti` |
| Funkce Netlify | `netlify/functions/*.mts` |
| Stránka správce | `sprava.html`, `src/sprava/stranka.ts` |
| Okno zpětné vazby, upozornění | `src/hra/vazba.ts`, `src/hra/zaznam.ts` |

Klíče v úložišti: `denik/<den>/<hráč>/<sezení>/<pořadí>.json`, `vazba/<číslo>.json`, `vytah/<den>.json` (uložený souhrn uzavřeného dne; jde kdykoli smazat, spočítá se znovu).

## Co ověřeno není

Funkce Netlify se z vývojového prostředí nedají zavolat. Otestovaná je celá cesta od hry po stránku správce se skutečnou serverovou obsluhou a se skutečnou knihovnou Netlify Blobs proti jejímu místnímu serveru; samotné nasazení na Netlify ověří až první náhled pull requestu.
