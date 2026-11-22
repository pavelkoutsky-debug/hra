# Mostmistr — pokyny pro práci v této složce

2D hra o stavění mostů s vlastním fyzikálním jádrem. Závazné zadání je `docs/KONCEPCE.md`.
**Než začneš, přečti `docs/STAV.md`**: říká, který milník je hotový, co je rozpracované a jakou zpětnou vazbu dal zadavatel. Na konci práce ho aktualizuj.

## Příkazy

Spouštěj ve složce `mostmistr/`.

- `npm run check` — typová kontrola všech tří konfigurací
- `npm test` — jednotkové testy
- `npm run build` — kontrola, testy a sestavení (totéž spouští Netlify)
- `npm run test:e2e` — sestavení a průchod hrou v bezhlavém prohlížeči; snímky do `test/e2e/vystup/` nebo do složky z proměnné `MM_SNIMKY`
- `MM_TRVANI=1000 npm run mereni` — měření výkonu jádra v bezhlavém prohlížeči; výsledky vypíše a uloží do `mereni.json` ve složce snímků
- `npm run otisky` — znovu zapíše otisky regresní sady; jen po vědomé změně fyziky (viz „Verze fyziky“)

Před každým pushem musí projít `npm run build` i `npm run test:e2e`. Po změně vzhledu si snímky prohlédni; testy nepoznají, že výkres vypadá špatně.

## Pravidla

- **Jazyk.** Zadavatel mluví česky. Identifikátory jsou česky bez diakritiky (`Stycnik`, `nakresliVykres`), komentáře a texty česky s diakritikou. Pojmy drž shodné s koncepcí.
- **Vrstvy.** `src/jadro/`, `src/data/` a většina `src/zkouska/` nesmí znát prohlížeč; hlídá to `tsconfig.jadro.json`. Fyzika i hodnocení zkoušky musí jít spustit v Node.
- **Rozhraní zkoušky.** Hra se simulací mluví jen zprávami z `src/zkouska/protokol.ts`. Stejné zprávy tečou přes Web Worker i v testech.
- **Žádná fyzikální knihovna ani herní framework.** Jádro je vlastní a ověřuje se proti analytickým řešením (koncepce, kap. 7.10).
- **Jednotky.** Metry, kilogramy, newtony, sekundy. Osa y světa míří nahoru. Rastr je 1 m.
- **Bitová shoda mezi prohlížeči.** Všechno, co vstupuje do simulace (`src/jadro/`, `src/data/katalog.ts`, `src/zkouska/stavba.ts`, `src/zkouska/regrese.ts`), smí počítat jen sčítáním, násobením, dělením a odmocninou. `Math.sin`, `Math.cos`, `Math.atan2`, `Math.hypot` ani operátor `**` nedávají všude stejné bity. Natočení se drží jako jednotkový vektor. V testech, zkušebně a kreslení goniometrie nevadí.
- **Pole v jádře.** Stav simulace je v plochých `Float64Array`; ve vnitřních smyčkách nic nealokuj.
- **Formáty dat mají verze.** Změna formátu úrovně nebo návrhu znamená zvýšit verzi, přidat převod do řetězu a ponechat starý soubor jako test. Ceny a vlastnosti prvků žijí jen v `src/data/katalog.ts`.
- **Verze fyziky.** `VERZE_FYZIKY` se zvyšuje, kdykoli se změní výsledek zkoušky stejného mostu. Pozná se to tak, že test `test/regrese.test.ts` ohlásí jiný otisk. Když je změna záměrná: zvyš verzi, popiš změnu v `docs/STAV.md` a zapiš otisky znovu (`npm run otisky`). Když záměrná není, je to chyba.
- **Simulace.** Zkoušku krokuje třída `Simulace` (`src/jadro/simulace.ts`): volí krok a tlumení, posuzuje namáhání, provádí porušení. Provoz a jiné vnější síly do ní vstupují rozhraním `Zatizeni`; kola a chodci jsou `Bremena`. Samotný `krok` integrátoru volej přímo jen v testech jádra.
- **Výchozí stav je rovnováha.** Před zkouškou se hledá klidová poloha (`najdiKlid` v `src/jadro/ustaleni.ts`): přímým výpočtem, a když ten selže na povolených lanech, ustálením časovou simulací. Konstrukce puštěná z nakreslené polohy by se rozezněla.
- **Úrovně.** Každá úroveň kampaně má v `urovne/reseni.ts` most pro každou medaili a mosty, které spadnout mají; `test/vyhratelnost.test.ts` hlídá, že dopadnou, jak mají. Po každé změně fyziky, katalogu nebo úrovně ho pusť: i oprava, která vypadá jen vizuálně, umí změnit, které mosty projdou.
- **Hra a zkouška.** Obrazovku úrovně řídí `src/hra/uroven.ts`. Každá zkouška dostane vlastní pracovní vlákno, které se po výsledku nebo zastavení ukončí; zprávy z opuštěné zkoušky tak nemůžou dorazit do nové. Výsledek a medaile se hráči ukazují až na konci přehrávání.
- **Rozbor při stavbě.** Vlastní frekvence, tvary kmitání a rezonanční křivku počítá `src/zkouska/rozbor.ts` v pomocném pracovním vlákně na zprávu `rozbor`; odpověď nese `id` žádosti a zastaralé se zahazují. Hlavní vlákno fyziku nepočítá.
- **Kmitání a komfort.** Zrychlení mostovky měří `src/jadro/komfort.ts`; nad 2,5 m/s² most neobstojí a úroveň může chtít i lepší třídu (`nejhorsiKomfort`). Lidé na mostě ho sami tlumí a při silném kmitání ztrácejí krok, takže úrovně s rezonancí se ladí simulací se skutečnou násadou úrovně, ne odhadem.
- **Nerovnost vozovky.** Úroveň má třídu `nerovnost` (`zadna`, A, B, C); profil silnice vyrábí `src/jadro/nerovnost.ts` z násady úrovně jen aritmetikou a jedou po něm kola, ne chodci. Úrovně kapitol 1, 2 a 5 jsou vyladěné na rovné vozovce (`zadna`) a tak mají zůstat. Nerovnost zvětšuje jen účinek vozidla; u těžkého mostu je to pár procent celkového namáhání, takže úroveň s ní neraď „od oka“.
- **Těžké mosty nesou hlavně sebe.** Ocelobetonová mostovka váží přes čtyři tuny na metr. Příhrada pod ní je zhruba dvakrát účinnější než nad ní (tlak nese beton); když má úroveň učit něco jiného, zakaž prostor pod mostem zónou a ověř referenční mosty v obou polohách.
- **Lana a dopnutí.** Napínák mění délku lana; v návrhu je to `predpeti` (podíl pevnosti při nehybných koncích, smí být záporné i větší než 1), hráč vidí milimetry a tah z rozboru. Referenční mosty s lany mají napínáky zapsané v `urovne/reseni.ts` (`PREDPETI`) tak, jak je spočítalo `dopniLana`; po změně tvaru takového mostu, úrovně nebo katalogu je spočítej znovu, test `test/lana.test.ts` hlídá, že mostovka pod vlastní tíhou drží tvar. Zavěšený most potřebuje kotevní lana, pylon visutého mostu nesmí stát ve styčníku mostovky a svařená mostovka visutému mostu škodí. Dopnutí drží tah lan pod vlastní tíhou mezi 1 % a 70 % pevnosti (`NEJVETSI_KLIDOVY_TAH`) a most nikdy nezhorší; lano, které by ve výchozím stavu neslo přes trojnásobek pevnosti, zkouška přetrhne už v čase nula.
- **Pilíře a základy.** Pilíř stojí na základu nebo na jiném pilíři a smí se naklonit nejvýš o polovinu výšky; do základu nevede nic jiného než pilíř. Dlouhý tah mostovky nebo pilíře editor sám rozdělí na díly.
- **Výběr kvůli nastavení.** Lano vybrané samo (po nakreslení, nástrojem Napínák) není výběr k úpravám: volba prvku ho nepřepíše a zrcadlení se jím neomezí (`Editor.zrcadliJenVyber`). Nové samočinné výběry dělej stejně.
- **Lidé v řadách.** Útvar, dav, závod, průvod a skákající dav vede simulace po řadách (jeden účastník = jedna řada, `PopisUcastnika.lidi`). Všechno, co vidí hráč, počítá lidi, ne řady.
- **Pokusy.** Brnknutí a budič jsou zkoušky bez provozu (`Beh.pokus`): nepočítají se do medailí, rekordů ani do porovnání pokusů a smějí běžet i na mostě nad rozpočtem.
- **Každý nový prvek má ukázku.** Zadavatel chce, aby hráč pochopil, proč prvek potřebuje: úroveň, která učí něco nového, má v `urovne/ukazky.ts` dvojici mostů (bez prvku a s ním) a ve slovníku popisek `ukazka.<id>.*` a odstavec `skutecnost.<id>` o skutečných mostech. Fakta ověř vyhledáním; `test/ukazky.test.ts` hlídá, že ukázka předvádí, co tvrdí, a `test/e2e/mesto.e2e.ts` každou ukázku kampaně pustí v prohlížeči (novou úroveň s ukázkou tam přidej do seznamu). Ukázka se počítá s úrovní bez rozpočtu, takže její most smí být dražší; ostatní pravidla úrovně splnit musí, jinak ji zkouška odmítne.
- **Zvuk.** Hra nemá nahrávky. Co má zaznít, určuje `src/zvuk/deje.ts` jen ze záznamu zkoušky (bez prohlížeče, stejný záznam dá stejné zvuky); `syntezator.ts` zvuky skládá z šumu a tónů a nic nerozhoduje. Zvukový kontext smí vzniknout jen v obsluze gesta hráče (`Ozvuceni.probud`) a se ztlumeným zvukem se nic neplánuje. Nový zvuk patří i na stránku `/zvuky.html` (`mereni/zvuky.ts`), kde si ho zadavatel pustí a test ho změří; hlasitosti lad podle té tabulky, zvuk si neposlechneš. **Současné zvuky jsou pracovní**: zadavatel je chce předělat pomocí ElevenLabs, ale až po dokončení všech ostatních milníků (M9 v koncepci). Do té doby syntezátor nevylepšuj a nenavrhuj to; novému prvku nebo provozu dej jen jednoduchý pracovní zvuk. Při výměně se nahradí vrstva `syntezator.ts`, `deje.ts` a jeho testy zůstanou.
- **Odkazy pro zadavatele.** Odkazy na náhled a pull request piš přímo do textu odpovědi. Z dialogu s otázkou je zadavatel nemůže zkopírovat ani otevřít. Náhled pull requestu je zmrazený: oprava se do staršího náhledu nedostane, takže s každou opravou pošli odkaz na nový náhled a řekni, že starý odkaz zůstává starý.
- **Paleta ukazuje všechno, co úroveň dovoluje.** Nosné prvky, přídavky (napínák lana, svar, závaží, laděný tlumič; `button[data-pridavek]`), dopnutí lan i pokusy (brnknutí, budič) musí být vidět na prázdném výkresu. Nic nesmí být schované za výběrem ani zašedlé bez vysvětlení: tlačítko, které zatím nemá co dělat, po kliknutí poradí, co chybí. Nový prvek nebo nástroj další kapitoly patří do palety stejně.
- **Háčky pro testy v prohlížeči.** `body[data-rezim]` (prehled, stavba, zkouska), `body[data-zkouska]` (pocita, hotovo, chyba), `body[data-otisk]`, `body[data-pruty]` a `canvas[data-kamera]` (střed a měřítko pohledu; podle něj test spočítá, kam kliknout). Zvuk: `body[data-zvuk]` (nahlas, potichu, vypnuto), `body[data-zvuk-kontext]` (zadny, running…) a `body[data-zvuku-<druh>]` (kolik zvuků kterého druhu hra zahrála). Analýza a pokusy: `body[data-analyza]` (otevrena, zavrena), `body[data-tvar]` (pořadí rozhýbaného tvaru kmitání), `canvas[data-udaj="krivka"]` s `data-vrcholu`, `data-nejvyssi`, `data-strop` a `data-zmereno`, `body[data-rytmus-budice]` (rozsah nebo Hz), `body[data-budic]` a `body[data-budic-zrychleni]` (co budič našel), `body[data-brnknuti]`, `body[data-vybrany-prut]`, `body[data-prubehu]` (kolik vzorků mají grafy) a `body[data-zaznam-poruseni]` (okamžik přehrávaného zlomu). Lana: `body[data-predpeti]` (předpětí vybraného lana), `body[data-tah-lana]` (tah v kN z rozboru), `body[data-dopnuti]` (pocita, hotovo, nejde, zahozeno) a `body[data-dopnuti-odchylka]` (mm po dopnutí). Hlavní plátno je `canvas.vykres__platno`; na obrazovce úrovně jsou i plátna grafů. Deník: `body[data-denik]` (zapnuto, vypnuto), `body[data-denik-odeslano]` (počet odeslaných dávek), `#okno-vazba[data-odeslano]` (ano, ne) a na stránce správce `body[data-sprava]` (prihlaseno, odmitnuto, odhlaseno). Neměň je bez úpravy testů v `test/e2e/`.
- **Deník hraní.** Co hráč dělá, zapisuje `Denik` (`src/denik/`); obrazovka úrovně volá `zapis(druh, data)`. Nová akce hráče (nástroj, prvek, režim, ovládací prvek) dostane událost a nová data výsledku zkoušky patří do `zkouska.konec`; souhrn pro správce je v `src/denik/souhrn.ts`. Do deníku nepatří nic, podle čeho by šel hráč poznat (jméno, e-mail, volný text od hráče); hodnoty jsou čísla, krátké kódy a zápis mostu. Vypnutý záznam nesmí odeslat nic; volba se čte z paměti prohlížeče před každým odesláním. Dávky jedné stránky jdou na server po jedné a nedoručená dávka odchází znovu beze změny pod stejným číslem (souhrn podle toho pozná dávku, kterou má dvakrát). Souhrn věří jen hodnotám, jaké hra opravdu posílá (deník může plnit kdokoli): nový údaj, který má souhrn počítat, tam dostane mez nebo seznam povolených hodnot.
- **Server.** Obsluha žádostí (`src/server/obsluha.ts`) zná jen `Request`, `Response` a rozhraní `SkladZaznamu`; Netlify znají jen `src/server/blobs.ts`, `src/server/netlify.ts` a tenké funkce v `netlify/functions/`. Veřejné adresy kontrolují původ, velikost a tvar dat a nic nepřepisují (klíče mají náhodný dovětek); všechno ke čtení je za heslem správce. Klíč dávky deníku začíná časem příjmu, takže nové dávky přibývají na konec pořadí klíčů a souhrn čte jen to, co ještě nezapočítal (výtah dne si pamatuje klíč poslední započtené dávky); na tom pořadí stojí průběžný souhrn dneška, neměň ho. Ostrý web a náhledy mají každý své úložiště. Z kontejneru se funkce Netlify zavolat nedají: test `test/e2e/denik.e2e.ts` zapojuje obsluhu do náhledového serveru (zachytávání v prohlížeči nestačí, `sendBeacon` při opouštění stránky zachytit nejde).
- **Stránka správce** (`sprava.html`, `src/sprava/`) je nástroj zadavatele, ne součást hry: texty má u sebe, ne ve slovníku. Odkazy ze správy do hry nesou `?zaznam=vypnout`, které záznam v prohlížeči potichu vypne (zkoušení autorů nepatří do čísel o hráčích).
- **Texty.** Všechny texty pro hráče jdou přes `src/ui/slovnik.ts`.
- **Barvy.** Žlutá je vyhrazená pro varování. Využití prutů má jednu škálu bílá → žlutá → červená (`src/vykres/skala.ts`; legenda v `src/styly.css` má stejné zastávky); tlak plná čára, tah dvojitá.
- **Kořen repozitáře neměň.** Je v něm jiný, nesouvisející projekt.
- **Poctivé zástupné kusy.** Co ještě není hotové, to hra odmítne nebo neukáže. Nepředstírej výsledek, který nikdo nespočítal.

## Postup po milnících

Milníky a jejich kritéria jsou v koncepci, kap. 12. Každý milník končí pull requestem do větve `main` a Netlify k němu vyrobí náhled. Hru si sám nezahraješ, proto ke každé úrovni patří referenční řešení a test vyhratelnosti.

Od 22. 11. 2026 zadavatel nechce u každého milníku čekat na své schválení. Postup je:

1. Milník dodělej a **detailně interně otestuj** (`npm run build`, `npm run test:e2e`, snímky si prohlédni).
2. Pusť **nezávislé recenze** čerstvými agenty, kteří neznají tvé závěry: aspoň recenzi kódu, hraní nové části očima nováčka v prohlížeči a u změn fyziky nezávislou kontrolu výpočtů. Dej jim kód a cíl, ne svůj názor.
3. Nálezy ověř a **zapracuj**; co nezapracuješ, zapiš do `docs/STAV.md` s důvodem.
4. Po zeleném sestavení pull request **slouč sám** a pokračuj dalším milníkem. Zadavateli pošli stručné shrnutí s odkazy.

Výjimka je M9 (zvuky načisto): ty musí zadavatel poslechnout a schválit.

## Prostředí

- Playwright je připnutý na verzi předinstalovanou v cloudovém kontejneru (1.63.0); jinou verzi neinstaluj, nenašla by prohlížeč.
- V kontejneru je jen Chromium. Shodu ve Firefoxu a Safari ověřuje zadavatel.
- Dokumentace Netlify (`docs.netlify.com`) z kontejneru není dostupná; vyhledávání funguje.
