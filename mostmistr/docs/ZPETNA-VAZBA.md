# Zpětná vazba hráčů a deník hraní

Od milníku M4c hra sbírá dvě věci: zprávy, které jí hráči sami napíšou, a anonymní deník toho, jak se hraje. Obojí se ukládá na Netlify (funkce a úložiště Netlify Blobs téhož webu) a čte se na stránce správce.

## Co je potřeba nastavit (jednou)

1. V Netlify otevři projekt `mostmistr` → **Project configuration → Environment variables → Add a variable**.
2. Klíč `MM_SPRAVCE_HESLO`, hodnota je heslo správce: aspoň 16 znaků, bez diakritiky, nejlépe dlouhé a náhodné (je to jediná ochrana zpráv hráčů). Rozsah (scope) musí zahrnovat **Functions**.
3. Web znovu nasaď (**Deploys → Trigger deploy**), aby funkce heslo dostaly.
4. Otevři `https://mostmistr.netlify.app/sprava.html` a přihlas se heslem.

Bez nastaveného hesla server správě nic nevydá (odpoví, že heslo chybí); hra sama funguje a data se ukládají i tak.

**Když hru zkoušíš sám**, otevři ji jednou adresou `https://mostmistr.netlify.app/?zaznam=vypnout`. Záznam hraní se v tom prohlížeči potichu vypne (bez zprávy do deníku) a zůstane vypnutý, dokud ho nezapneš vypínačem v přehledu kampaně; tvoje zkoušení tak nekazí čísla o hráčích. Stejný parametr nese odkaz **Otevřít úroveň ve hře** na stránce správce.

**Ostrý web a náhledy mají každý své úložiště.** Co se nahraje při zkoušení náhledu pull requestu, se do statistik ostrého webu nedostane, a náhled nevidí zprávy hráčů. Stránka správce po přihlášení řekne, na která data se díváš. Heslo je ale jedna proměnná pro všechna nasazení: kdo by uměl nasadit vlastní kód jako náhled, dostal by se k němu. Netlify proto náhledy z cizích forků drží ke schválení (výchozí nastavení od listopadu 2026); nevypínej to, nebo dej proměnné rozsah jen pro kontext Production.

## Zpětná vazba

Tlačítko **Napiš nám** je v přehledu kampaně, v horní liště úrovně (v úzkém okně jen dole v paletě) a v panelu s výsledkem zkoušky. Hráč zvolí, o čem píše (něco nefunguje, obtížnost, nápad, pochvala, jiné), napíše text do 4 000 znaků, může říct, jak ho hra baví (1 až 5), a nechat e-mail pro odpověď. Když nechá zaškrtnuté přílohy, pošle se s textem i most, který má právě na výkresu, a posledních nejvýš 150 kroků z té stránky hry. Kdo má záznam hraní vypnutý, má přílohy předem odškrtnuté. Když server do minuty neodpoví, hra to hráči řekne a text mu nechá.

Na stránce správce má každá zpráva stav **nová → řeší se → vyřešeno / zamítnuto** a poznámku k řešení. V detailu je most nakreslený na výkresu úrovně (jde zkopírovat a ve hře načíst tlačítkem Import) a seznam kroků před odesláním. Tlačítko **Ukázat sezení v deníku** přejde rovnou na sezení, ze kterého hráč zprávu poslal (pokud měl záznam zapnutý). Zprávu jde smazat.

## Deník hraní

Hra zapisuje, co hráč dělá: které úrovně otevře a jak dlouho v nich je, každý nakreslený prut (prvek, odkud kam), ostatní úpravy mostu, zvolený nástroj, každou zkoušku včetně celého mostu a jejího výsledku (průchod, medaile, cena, největší využití, první porušení, kmitání), dopnutí lan, zavření zadání a chyby, které ohlásí prohlížeč.

- **Anonymně, dokud hráč nenapíše kontakt.** Hráč dostane náhodné číslo uložené v jeho prohlížeči; žádné jméno, e-mail ani adresa se neukládají. Zpětná vazba ale nese totéž číslo (aby šlo dohledat, co hráč před zprávou dělal), takže kdo do ní napíše e-mail, tomu jde deník přiřadit. Okno zpětné vazby to hráči říká.
- **Zapnuto, jde vypnout.** Při první návštěvě hra upozorní, že anonymní záznam odesílá autorům, co v něm je a že jde vypnout (v přehledu, v zadání úrovně i v paletě úrovně); vypínač je v přehledu kampaně a v okně zpětné vazby. Při vypnutí se zahodí i to, co čekalo na odeslání, odejde jediná informace (že hráč záznam vypnul) a hra potvrdí, že se už nic neodesílá. Volba platí hned ve všech otevřených panelech. Když prohlížeč hře nedovolí nic si pamatovat, deník se nevede vůbec. Zpětnou vazbu poslat jde vždy.
- **Po dávkách.** Události se posílají po čtyřiceti nebo po dvaceti sekundách, hned po výsledku zkoušky a při opuštění stránky. Když server třikrát po sobě neodpoví, dá si hra pět minut přestávku a pak to zkusí znovu; hraní tím netrpí.
- **Čas v úrovni** běží jen, když je stránka vidět; hra v panelu na pozadí se nepočítá.

**Právní poznámka (není to právní rada):** hra ukládá do prohlížeče náhodné číslo hráče a vede statistiku hraní bez předchozího souhlasu, jen s upozorněním a vypínačem. Pravidla EU a ČR pro ukládání údajů do zařízení uživatele (od roku 2022 režim výslovného souhlasu pro vše, co není nezbytné) mluví spíš pro souhlas předem. Pro soukromé zkoušení to nevadí; před zveřejněním hry širšímu publiku je to rozhodnutí zadavatele.

Stránka správce ukazuje po dnech nebo za delší období (7 dní, 30 dní, vše):

- kolik hráčů úroveň otevřelo, kolik ji prošlo a kolik jich odešlo bez jediné zkoušky,
- medián počtu zkoušek a minut do prvního průchodu,
- kolik hráčů má kterou medaili,
- cenu nejlevnějšího průchodu a medián proti rozpočtům úrovně,
- z čeho se stavělo a na čem mosty nejčastěji padaly,
- jednotlivá sezení krok za krokem; kliknutím na zkoušku se most nakreslí.

Dny jsou podle času UTC (den začíná v 1:00, v létě ve 2:00 našeho času). Souhrn dneška se počítá průběžně ze všeho, co zatím přišlo; server si pamatuje, co už započítal, a čte jen nové dávky. Den s tisíci dávek se dopočítá na víc žádostí (stránka je posílá sama a ukazuje postup). „Záznam si vypnuli“ počítá hráče, kteří záznam vypnuli a do konce období ho znovu nezapnuli. Do deníku jde i zkouška, kterou hra nepustila (most nad rozpočet), a proč.

Den jde stáhnout jako JSON k vlastnímu rozboru a smazat.

## Ochrana před zneužitím

Adresy, na které hra posílá deník a zpětnou vazbu, jsou veřejné; jinak by na ně hra nemohla. Proti zahlcení mají:

- omezení počtu žádostí z jedné adresy (deník 30 za minutu, zpětná vazba 10 za minutu, správa 120 za minutu; nastavení je u funkcí v `netlify/functions/`),
- strop na síťovou adresu a den: deník 5 000 dávek, zpětná vazba 20 zpráv, žebříček 60 zkoušek (adresa se bere jen z hlavičky Netlify `x-nf-client-connection-ip`, u IPv6 jen předpona /64; neukládá se, počitadla jsou pod jejím otiskem se solí dne a po dvou dnech se mažou i se solí),
- společný strop 300 zpráv zpětné vazby a 1 000 zkoušek žebříčku za den,
- žebříček navíc odmítne zápis, u kterého adresu nepozná, a přezdívku z krátkého seznamu hrubých výrazů,
- kontrolu velikosti a tvaru dat a hlavičky Origin (cizí weby a nahodilé roboty odmítne; kdo si hlavičku napíše sám, projde),
- souhrn, který bere jen hodnoty, jaké hra opravdu posílá (známé prvky, rozumné časy a ceny).

Kdyby někdo deník přesto zaplnil nesmysly, den jde na stránce správce smazat.

## Uchování a smazání dat (od M17)

- **Doba uchování:** deník hraní 365 dní, zprávy zpětné vazby 730 dní; starší záznamy server maže sám (úklid běží s denním rozborem a s výpisem dnů ve správě, pokaždé nejvýš pár set záznamů).
- **Smazání dat jednoho hráče:** formulář „Smazat data hráče“ na stránce správce smaže jeho deník ze všech dnů, jeho zprávy a jeho řádky v žebříčcích. Hráč své číslo vidí v okně Soukromí a kontakt; žebříčky ho vedou pod druhým, delším číslem (okno ukazuje obě a tlačítko Zkopírovat je vezme obě), a mazat se musí obě. Souhrny dnů, které už jsou spočítané, se nepřepočítávají.
- Co hra hráči o tomhle všem říká, je v okně Soukromí a kontakt (`soukromi.*`); rozhodnutí zadavatele jsou v `docs/ZVEREJNENI.md`.

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

Klíče v úložišti: `denik/<den>/<čas příjmu>-<hráč>-<začátek sezení>-<sezení>-<pořadí>-<náhodný dovětek>.json` (nic se nepřepisuje; čas příjmu je vpředu, aby nové dávky přibývaly na konec a souhrn nemusel číst znovu to, co už započítal), `vazba/<číslo>.json` a k ní malý záznam do seznamu `vazba-seznam/<číslo>.json`, `vytah/<den>.json` (uložený mezivýsledek souhrnu dne i s klíčem poslední započtené dávky; jde kdykoli smazat, spočítá se znovu; po půlnoci UTC se den jednou přepočítá celý a pak se už jen čte). Úložiště `mostmistr` patří ostrému webu, `mostmistr-nahled` náhledům.

## Co ověřeno není

Funkce Netlify se z vývojového prostředí nedají zavolat. Neověřené je proto hlavně: zda Netlify přijme nastavení omezení počtu žádostí tak, jak je zapsané (podle dokumentace ano), zda funkce pozná druh nasazení z kontextu (jinak všechno skončí v úložišti náhledů a stránka správce to řekne) a zda kontrola hlavičky Origin sedí s adresou, pod kterou funkce žádost vidí (jinak by deník končil chybou 403 a na stránce správce by žádný nebyl). Otestovaná je celá cesta od hry po stránku správce se skutečnou serverovou obsluhou a se skutečnou knihovnou Netlify Blobs proti jejímu místnímu serveru; samotné nasazení na Netlify ověří až první náhled pull requestu.
