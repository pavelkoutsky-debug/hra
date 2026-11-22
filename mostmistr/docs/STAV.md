# Mostmistr — stav vývoje

Poslední aktualizace: 22. 11. 2026

## Milníky

| Milník | Stav |
|---|---|
| M0 Základy | Hotovo, sloučeno do `main`, nasazeno na Netlify (20. 11. 2026) |
| M1a Průzkum (krok, tlumení, výkon) | Hotovo, sloučeno do `main`; kritérium splněno i na počítači zadavatele |
| M1b Jádro | Hotovo, sloučeno do `main` (20. 11. 2026) |
| M2 První hratelná verze | Hotovo, zadavatel vyzkoušel a schválil sloučení do `main` (21. 11. 2026) |
| M3a Rezonance | Hotovo, zadavatel vyzkoušel a schválil; sloučeno do `main` (21. 11. 2026) |
| M3z Zvuk (předsunuto z M8) | Hotovo jako **pracovní verze**, sloučeno do `main` (22. 11. 2026). Zadavatel chce zvuky později předělat pomocí ElevenLabs |
| M3b Dav a analýza | Hotovo, sloučeno do `main` (22. 11. 2026) včetně opravy ukázky 5-04 |
| M4a Těžká doprava | Hotovo, sloučeno do `main` (22. 11. 2026) |
| M4b Velká rozpětí | Hotovo, po třech nezávislých recenzích sloučeno do `main` (22. 11. 2026) |
| M4c Zpětná vazba a deník hraní | Hotovo (přidáno na přání zadavatele 22. 11. 2026); čeká na nastavení hesla správce v Netlify |
| M5 až M8 | Nezačato |
| M9 Zvuk načisto (ElevenLabs) | Až po dokončení všech ostatních milníků |

## M4c — výsledek

Zpětná vazba hráčů a deník hraní. Popis pro zadavatele, včetně toho, co nastavit v Netlify, je v `docs/ZPETNA-VAZBA.md`.

**Ve hře**

- Tlačítko **Napiš nám** v přehledu kampaně, v liště úrovně a v panelu výsledku otevře okno: druh zprávy (něco nefunguje, obtížnost, nápad, pochvala, jiné), text, jak hra baví (1 až 5), nepovinný e-mail a přílohy (most z výkresu a posledních nejvýš 150 kroků).
- **Deník hraní** (`src/denik/`): otevření a opuštění úrovně s časem, každý nakreslený prut (prvek, odkud kam, počet dílů), ostatní úpravy mostu, nástroje, každá zkouška s celým mostem a výsledkem (průchod, medaile, cena, využití, první porušení, kmitání, doba výpočtu), dopnutí lan, zavření zadání, ovládání a chyby prohlížeče. Anonymně: náhodné číslo hráče v prohlížeči, žádné jméno ani adresa.
- **Zapnuto, jde vypnout** (rozhodnutí zadavatele): první návštěva na záznam upozorní, vypínač je v přehledu a v okně zpětné vazby. S vypnutým záznamem se neposílá nic; zpětná vazba ano, je to výslovná zpráva.
- Odesílá se po dávkách (40 událostí nebo 20 s, po výsledku zkoušky a při opuštění stránky přes `sendBeacon`). Po třech nezdarech to deník do konce sezení vzdá; bez serveru (místní spuštění) tedy hře nic nechybí.

**Na serveru** (`src/server/`, funkce v `netlify/functions/`)

- `POST /api/denik` a `POST /api/vazba` přijímají jen žádosti ze stejného webu, kontrolují tvar a velikost dat (dávka do 96 kB, zpětná vazba do 400 kB) a ukládají do Netlify Blobs. Formulář má skryté pole jako past na roboty.
- `/api/sprava` vydává data jen s heslem správce (proměnná prostředí `MM_SPRAVCE_HESLO`, aspoň 8 znaků; bez ní odpovídá 503). Umí seznam a detail zpětné vazby, změnu stavu řešení s poznámkou, dny a sezení deníku, souhrn za den nebo období, vývoz dne po částech a mazání.
- **Souhrn** se počítá z „výtahů“ dnů (`src/denik/souhrn.ts`): co se o kterém hráči ve které úrovni ví. Výtahy jdou slučovat, takže souhrn za měsíc nečte znovu všechny dávky; uzavřený den má výtah uložený a den s víc než 1 500 dávkami se dopočítá na víc žádostí.
- Obsluha pracuje se standardními `Request` a `Response` a s úložištěm za rozhraním `SkladZaznamu`, takže stejný kód běží ve funkcích i v testech.

**Stránka správce** (`/sprava.html`): zpětná vazba se stavy nová → řeší se → vyřešeno / zamítnuto, s poznámkou, přiloženým mostem nakresleným na výkresu úrovně a kroky před odesláním; deník po dnech s tabulkou po úrovních (hráči, průchody, zkoušky a minuty do průchodu, medaile, cena průchodu proti rozpočtům, použité prvky, důvody pádů) a sezení krok za krokem.

**Jak je to ověřeno**

- `test/denik.test.ts`: sbírání a odesílání ve hře, kontrola příchozích dat, příjem, správa s heslem, souhrny a jejich slučování, mazání a skutečná knihovna Netlify Blobs proti jejímu místnímu serveru.
- `test/e2e/denik.e2e.ts`: hra v prohlížeči proti skutečné serverové obsluze zapojené do náhledového serveru: upozornění, stavba myší a zkouška, obsah deníku, zpětná vazba s mostem, vypnutý záznam, stránka správce od špatného hesla po smazání dne.

**Co ověřeno není**

- Funkce na Netlify: z vývojového prostředí se zavolat nedají. První skutečné ověření je náhled pull requestu; správu jde vyzkoušet až po nastavení hesla.
- Zátěž: jak rychle Netlify Blobs čte stovky dávek najednou. Souhrn je proto stavěný tak, aby se dal dopočítat na víc žádostí.

## M4b — výsledek

Čtvrtá kapitola: údolí. Pilíře, svary, lana s napínáky, zavěšený a visutý most; tahač s návěsem a nadměrný náklad.

**Lana a napínák** (`src/data/katalog.ts`, `src/zkouska/stavba.ts`)

- **Lano** (2× spirálové lano ⌀ 40 mm, pevnost 2,6 MN, 1 800 Kč/m, do 60 m) umí jen táhnout. Nově je i **nosné lano** se čtyřnásobným průřezem (2× ⌀ 80 mm, 10,6 MN, 6 000 Kč/m): hlavní lano visutého mostu obyčejné lano neunese. V koncepci původně nebylo.
- **Napínák mění délku lana.** V paletě je jako přídavek (klik na Napínák lana, pak na lano) a nastavení se ukáže i hned po nakreslení lana. Točí se po milimetrech (se Shiftem po centimetru) a ukazuje „dotaženo o 47 mm“ nebo „povoleno o 7 mm“ a k tomu tah, který lano nese pod vlastní tíhou mostu (z rozboru v pomocném vlákně). V návrhu se ukládá jako předpětí, tedy podíl pevnosti, kterým by lano táhlo, kdyby se jeho konce nehnuly; smí být záporné (lano delší než nakreslené) i větší než 1. Nové lano je dotažené na 5 %, aby neviselo.
- *Odchylka od koncepce:* koncepce mluví o předpětí lana. Závěsy visutého mostu se ale musí přizpůsobit tvaru nosného lana o desítky centimetrů oběma směry, což jako „podíl pevnosti“ nedává smysl. Hráč proto vidí délku a skutečný tah; předpětí zůstalo jen ve formátu návrhu.

**Automatické dopnutí lan** (`src/zkouska/dopnuti.ts`; tlačítko Dopnout lana v paletě, klávesa N)

- Najde nastavení napínáků, se kterým mostovka pod vlastní tíhou drží nakreslený tvar, pylony se nenaklánějí, žádné lano nevisí (nejméně 1 % pevnosti) a žádné nenese pod vlastní tíhou mostu víc než 70 % pevnosti (po recenzích; viz níže). Tlumená Gaussova–Newtonova metoda nad maticovou statikou: vliv dotažení každého lana se spočítá z tečné matice tuhosti v klidové poloze, oprava metodou nejmenších čtverců, most se znovu ustálí a tak dokola. Lana, která by oprava povolila, se drží podmínkou.
- Počítá se v pomocném vlákně (zpráva `dopnuti`), výsledek je jeden krok historie a jde vzít zpět. Zavěšený most dopne za 0,3 s (mostovka z 62 mm na 0,5 mm), visutý za 0,7 s (z 80 cm na 0,5 mm). Špatně nakreslené nosné lano (do „V“, „schody“) zvládne na pár centimetrů, ale trvá to až deset sekund; hra pak poradí nakreslit lano jako oblouk.
- **Nosné lano visutého mostu se pod tíhou vyrovná do oblouku samo** a napínákem se s tím nic nenadělá; dopnutí proto mění hlavně délky závěsů. Bez něj mostovka visutého mostu klesne až o 80 cm a podvalník po ní neprojede.

**Ustálení časovou simulací** (`src/jadro/ustaleni.ts`, koncepce 7.8): povolené lano nemá v nakreslené poloze příčnou tuhost a přímý výpočet rovnováhy na něm selže. Most se pak nechá pod tíhou usednout s kinetickým tlumením a výsledek se doladí přímým výpočtem. Používá to zkouška, rozbor i dopnutí (`najdiKlid`).

**Pilíř** (železobeton 1 × 2 m, 15 000 Kč/m, do 12 m): smí stát jen na základu vyznačeném v úrovni nebo na jiném pilíři (pravidlo `pilir-mimo-zaklad`). Je monolit: do styčníků je vetknutý po celé výšce, takže několik dílů nad sebou tvoří jeden sloup; ostatní pruty na něm leží kloubově, dokud styčník není svařený. Výborně snáší tlak, v ohybu se křehce zlomí.

**Svar** (1 500 Kč za každý prut ve styčníku): přídavek v paletě; klik na styčník ho svaří nebo svar zruší, s vybranými styčníky je svaří najednou (klávesa S). Svařený styčník přenáší ohyb. Na výkresu je plný čtvereček.

**Plastické klouby**: záznam zkoušky nese místa, kde se tvárný prut trvale ohnul, a kolik mezního natočení už je pryč; při přehrávání je označí prstenec od žluté po červenou.

**Nadměrný náklad** (`src/zkouska/vozidla.ts`): 120 t, 10 km/h, těžký tahač a podvalník s osmi řadami kol po 11,25 t; žádná řada nenese víc než 11,5 t.

**Kapitola 4 – Údolí** (využití nejvíc namáhaného prutu):

| Úroveň | Rozpětí | Provoz | Čemu učí | Průchod / rozpočet / mistrovská | Co neprojde |
|---|---|---|---|---|---|
| 4-01 Tři pole | 54 m, dva základy v řece | 2 tahače s návěsem, nákladní auto, 2 auta | pilíře zkrátí rozpětí | 38 / 46 / 29 % | tytéž příhrady bez pilířů; mostovka na pilířích bez příhrad |
| 4-02 Bez jediné vzpěry | 48 m, tři základy, nad vozovkou se nestaví | kolona 3 nákladních aut, autobus, tahač | svar: spojitý nosník a rám | 80 / 80 / 55 % | bez svarů; svary jen nad pilíři; bez středního pilíře (plastické klouby) |
| 4-03 Na lanech | 60 m, základ uprostřed | kolona 4 nákladních aut, autobus, tahač | zavěšený most, kotevní lana, dopnutí | 42 / 58 / 32 % | bez lan; bez kotevních lan (pylon se zlomí); pylon 8 m |
| 4-04 Náklad století | 72 m, pylony na březích, kotvy v zemi | podvalník 120 t, 2 nákladní auta | visutý most, nosné lano, dopnutí | 58 / 66 / 54 % | nedopnutá lana (prověsí se); obyčejné lano místo nosného; bez kotevních lan |

V 4-01 dostane rozpočtovou medaili most se šikmými vzpěrami z půlky pilířů. V 4-03 a 4-04 rozhoduje výška pylonu: nižší je levnější a víc namáhaný, vyšší naopak.

Každá úroveň má ukázku a odstavec „Ve skutečnosti“ (viadukt Millau, první svařovaný silniční most v Maurzycích, zavěšený most ve Strömsundu, most 1915 Çanakkale). Zdroje jsou v popisu pull requestu.

**Jak je splněno kritérium milníku**

- *Visutý a zavěšený referenční most unese kolonu kamionů* (`test/lana.test.ts`): kolona čtyř nákladních aut přejede oba referenční mosty bez porušení, využití pod 70 %.
- *Úrovně projdou testem vyhratelnosti*: všech dvacet úrovní, každá medaile i mosty, které neprojít mají.
- Dopnutí: referenční mosty kampaně jsou dopnuté (mostovka pod vlastní tíhou do 2 mm od výkresu), výsledek dopnutí odpovídá tomu, co most opravdu dělá, a tah v nosném laně sedí se vzorcem pro parabolu.
- Testy: 804 jednotkových, 136 kontrol v prohlížeči (z toho 11 nových v `test/e2e/udoli.e2e.ts` a 4 nové ukázky).

**Co se při kalibraci ukázalo**

- **Zavěšený most bez kotevních lan nevydrží ani jedno nákladní auto.** Lana z pole táhnou hlavu pylonu k zatížené straně a betonový pylon se v ohybu zlomí. Kotevní lana do opěr to vyřeší; je z toho ukázka úrovně 4-03.
- **Svařená mostovka visutému mostu škodí.** Nosné lano se pod podvalníkem přetvoří o desítky centimetrů a tuhá mostovka se s ním musí ohnout; kloubová to udělá bez namáhání. Skutečné visuté mosty mají ztužující nosník dimenzovaný právě na tohle.
- **Pylon visutého mostu nesmí stát ve styčníku mostovky.** Vodorovné síly z mostovky by ho ohýbaly. Základy pylonů jsou proto čtyři metry za opěrami.
- **Mostovka se pod podvalníkem smí prohnout nejvýš o 1,5 m**; víc se počítá jako pád (pravidlo existuje od M2). U nedopnutého visutého mostu rozhoduje právě to, nic se nezlomí.

**Oprava jádra.** Díly svislého lana, které po zřícení dopadly na stejné místo terénu, měly nulovou délku a výpočet se na dělení nulou rozpadl. Takový díl teď bere směr z výchozí polohy (lano v tom stavu nic nenese); totéž tlumič.

**Formát návrhu má verzi 3**: předpětí lana smí být záporné i větší než 1. Starší návrhy se načtou beze změny.

**Verze fyziky zůstává 5.** Výsledky dosavadních úrovní i otisky regresní sady jsou stejné. Lana a pilíře hráč dosud použít nemohl, takže jejich změny (ustálení, vetknutý pilíř) žádný uložený rekord neovlivní.

**Drobnosti**

- Ukázka v okně se zadáním se zvětší tak, aby se do ní vešly oba mosty celé (pylony, kotevní lana).
- Při přehrávání se nekreslí skryté dělicí styčníky lan; lano vypadá jako lano, ne jako řetěz.

### Nezávislé recenze M4b (22. 11. 2026)

Tři čerstvé recenze nad hotovým milníkem: recenze kódu, hraní kapitoly 4 v prohlížeči očima nováčka a nezávislá kontrola fyziky (vlastní řešič řetězovky, rámová statika, mezní plastická analýza). Kontrola fyziky potvrdila, že lana, oba referenční mosty s lany, zatížení pilířů, plastické klouby i nadměrný náklad sedí s ručním výpočtem většinou hluboko pod 1 %; dosavadní úrovně mají stejné otisky jako na `main`.

**Zapracováno**

- *Editor.* Právě nakreslené lano (a lano vybrané nástrojem Napínák) zůstává vybrané jen kvůli napínáku: volba jiného prvku v paletě ho už nepřepíše a zrcadlení se jím neomezí (dřív se poslední díl nosného lana potichu změnil na obyčejné lano). Lano změněné na jiné lano si nechá napínák. Zrcadlení výběru se ohlásí. Dlouhý tah mostovky nebo pilíře se sám rozdělí na stejné díly (náhled ukáže „10 × 6 m“).
- *Dopnutí.* Horní mez tahu 70 % pevnosti (rovné nosné lano už dopnutí „nedotáhne“ na třicetinásobek pevnosti; řekne, že tvar nedrží, a poradí průvěs nebo vyšší pylony). Dolní mez tahu jen 1 % (pětiprocentní byla u silných lan staticky nesplnitelná a kazila tvar). Vodorovná poloha styčníků pylonu má menší váhu (dopnutí nerovná ohyb pylonu kotevními lany). Výsledek nikdy není horší než vstup; most s vratkou klidovou polohou a lana bez mostovky a pylonu vracejí „nejde“. Opakovaný stisk N už nefrontuje další výpočty. Referenční mosty mají napínáky přepočítané (`PREDPETI`).
- *Zkouška.* Lano, které by ve výchozím stavu neslo víc než trojnásobek pevnosti (napínák v krajní poloze), se přetrhne už při napínání: je to první událost v čase nula a díly lana se povolí. Dřív přetržení vymrštilo zbytek mostu rychlostí přes 2 000 m/s a hra hlásila „výpočet se rozpadl“. Výsledek nese průvěs mostovky v klidu (`pruvesVKlidu`) a u mostu s lany, který neobstál a visel přes 10 cm, poradí dopnutí.
- *Ustálení.* Kus ve volném pádu se pozná hned (ne až po třiceti sekundách děje), stav dál než 6 m od výkresu se nebere ani jako vyvážený, neplatné číslo se nepočítá za klid, ustálení nenechá v prutech trvalé přetvoření. Body, kde se stýkají jen lana, smějí dál (volně visící lano už mostu nebere klidovou polohu); podpory ne. Soustava ze samých povolených lan má platný krok výpočtu (dřív NaN a zkouška bez provozu neskončila).
- *Pravidla.* Na základ patří jen pilíř (v 4-01 šly místo pilířů postavit ocelové sloupy a pilíř nebyl potřeba) a pilíř se smí naklonit nejvýš o polovinu výšky (položený sloužil jako betonový trám čtyřikrát únosnější než mostovka).
- *Obrazovka.* Nastavení výběru (napínák, svar, závaží, tlumič) drží u spodního okraje palety, takže je vidět i v okně vysokém 720 px; tlačítko „Jdu stavět“ zůstává na dohled; panel výsledku je nad popisovým polem a milionové ceny se do pole vejdou; svar má tmavý obrys a křížek; popisek „základ“ je vidět i při oddálení; znaménko u lana odpovídá tlačítkům napínáku (+ dotaženo).
- *Texty výsledku.* Bez „tah, tah“, přetržené lano je „lano se přetrhlo“, stejný prut ve stejném okamžiku jen jednou, „most obstál, i když prut nevydržel“, vysvětlení momentu těsně pod únosností (vyčerpaná tvárnost), pohodlí v autobusu bez známky tam, kde se nehodnotí, a „neměřeno“ místo nuly; srozumitelnější „dopnout nejde“ a návod k napínáku.
- *Kampaň.* Úroveň s rozestavěným mostem zůstává odemčená, i když před ni přibyla nová kapitola.

**Nezapracováno (a proč)**

- **Vlastní tíha svařených prutů je soustředěná do styčníků bez momentů vetknutí.** U spojité svařené mostovky a rámu (4-02) jsou podporové momenty od vlastní tíhy o 6 % menší a momenty v poli o 6–13 % větší než podle rámové teorie; rozhodující průřez mistrovského mostu 4-02 by měl 57 % místo 54,6 %. Kloubové mostovky (všechny starší úrovně) jsou přesné. Oprava je změna jádra pro všechny pruty s tuhými konci, tedy nová verze fyziky a nové otisky všech úrovní; udělá se na začátku M5 (železnice bude spojité nosníky potřebovat), ne v rámci slučování M4b.
- **Pravidlo pádu 1,5 m proti poddajnosti visutého mostu.** Referenční mosty 4-04 se pod podvalníkem prohnou o 1,0–1,3 m (statika sedí) a mistrovský je mezi nimi nejblíž meze. Pravidlo se měří od spojnice trasy. Nechává se; k přezkoumání v M8 spolu s laděním kapitoly.
- **Vratká rovnováha se bere jako klidová poloha** (vzpínadlo z lan pod kloubovou mostovkou, pylon nad Eulerovou silou). Dopnutí takový most odmítne, zkouška ho pustí a provoz ho shodí. Přímý výpočet rovnováhy selhává, když lano při zatížení povolí; používá se jen pro brnknutí do 8 kN, kde se to neprojeví.
- **Modelové volby pilíře a průřezu:** vzpěrná délka pilíře je nakreslený díl, ohybová únosnost pilíře je štědrá (9,3 MNm proti odhadu 4–6 MNm), plastický moment se zmenšuje i tlakem (u ocelobetonu přísné), podpory drží i tah (kotvy 4-04 až −4,6 MN). Na výsledky současných úrovní nemá nic z toho vliv; zapsáno pro M8.
- **Dopnutí špatně nakresleného nosného lana** („V“, „schody“) trvá až deset sekund; hráč dostane radu, tvar se neopraví sám.
- **Hraní:** v 4-03 dopnutí nic nezmění na medailích (N se vyplatí až v 4-04), 4-02 nemá rozhodování (svařit vše stačí), mistrovská 4-01 je snazší než rozpočtová. Ladění obtížnosti kapitoly patří do M8, až budou data z deníku hraní (M4c).
- **Drobný vzhled:** název úrovně se v režimu zkoušky zkracuje, jízdní řád v 4-03 a 4-04 ořezává osa frekvencí, v okně širokém 1 024 px se zmenší časová osa, popisky využití se u visutého mostu při oddálení překrývají, nadměrný náklad projíždí pod prověšeným nosným lanem bez kolize, graf „průhyb uprostřed“ v 4-03 měří u pylonu, čísla prutů ve výsledku nejsou na výkresu. Na M8.
- **Mechanismus neoznačí volné styčníky.** Když most nemá klidovou polohu, text to říká a přehrání ukáže, kde se láme; zvýraznění volných kloubů přímo na výkresu zatím není.

**Co ověřeno není**

- Jak se lana a dopnutí ovládají rukou: testy v prohlížeči kreslí a klikají, ale pohodlí neposoudí.
- Dopnutí mostů, které nejsou zavěšené ani visuté (lana jako táhla příhrady, vzpínadla): mělo by fungovat stejně, zkoušené je jen na referenčních mostech a několika vadných.

## M3b — výsledek

Pátá kapitola: lávky ve městě, po kterých nejde útvar, ale dav. K tomu laděný tlumič a nástroje, kterými hráč vidí, proč se most houpe: rezonanční křivka, tvary kmitání, budič, grafy a záznam porušení.

**Nový provoz** (`src/zkouska/vozidla.ts`, `provoz.ts`)

| Provoz | Jak se chová |
|---|---|
| Dav | Řady přes šířku mostovky, 1,1 m/s. Každá řada má svůj krok kolem 1,7 Hz (rozptyl 0,15 Hz) a svou fázi. Lidé v řadě nejdou v taktu, takže síla řady roste s odmocninou z počtu lidí, ne s počtem. |
| Běžecký závod | Řady nejvýš po třech, 3 m/s, každý svým tempem v úzkém pásmu (rozptyl 0,07 Hz kolem tempa z úrovně). |
| Průvod s kapelou | Vpředu kapela (třetina lidí) pochodem přesně v taktu, za ní volně jdoucí dav. |
| Skákající dav | Dojde doprostřed mostu, zastaví, skáče v taktu po zadanou dobu a odejde. Doskok má špičku kolem 2,7 váhy a budí i na dvojnásobku a trojnásobku rytmu. |

- **Ztráta kroku** (koncepce 7.7, `src/jadro/bremena.ts`): když se mostovka pod člověkem houpe víc než 2,5 m/s², jeho budicí síla slábne; nad 6 m/s² z ní zbývá čtvrtina. Rezonance tak neroste donekonečna.
- **Výsledek počítá lidi**, ne řady, ve kterých je simulace vede: „Přešli a přejeli všichni (120)“.
- **Požadovaný komfort úrovně** (`nejhorsiKomfort`): úroveň může chtít klidnější most než jen „ne nepřijatelný“. Nábřeží (5-01) smí kmitat nejvýš 0,5 m/s².

**Laděný tlumič** (`src/data/katalog.ts`, `src/zkouska/stavba.ts`)

- Závaží na pružině s tlumičem, zavěšené metr pod styčníkem mostovky. Výběr styčníku a klávesa L; závaží po 50 kg až do meze úrovně, ladění po 0,05 Hz v rozsahu 0,8–6 Hz. Stojí 30 000 Kč za kus a 30 Kč za kilogram.
- Nový tlumič se sám naladí na první vlastní frekvenci mostu s lidmi; doladit ho musí hráč.
- Zrcadlení tlumiče přenáší. Po zřícení mostu závaží odpadne.

**Analytický panel** (klávesa A nebo tlačítko dole; `src/hra/uroven.ts`, `src/vykres/grafy.ts`)

- *Při stavbě*: **rezonanční křivka** (jak silně mostovka odpoví na buzení v kterém rytmu, pro prázdný most i most s lidmi, s pásmy kroků z jízdního řádu) a **tvary kmitání** (tři nejnižší; po kliknutí se most na výkresu rozhýbe). Křivku počítá `src/jadro/odezva.ts` modální redukcí v pomocném vlákně po každé úpravě. Svislé měřítko si pamatuje nejvyšší špičku, aby bylo vidět, o kolik ji tlumič srazil; kliknutí na graf ho přizpůsobí.
- *Při zkoušce*: průběhy v čase (průhyb uprostřed, kmitání mostovky s vyznačenou mezí, využití vybraného prutu), **síly ve vybraném prutu** (osová síla, moment, co rozhoduje a kolik z únosnosti) a **reakce podpor**.
- V úrovních s rezonanční křivkou je panel otevřený od začátku.

**Budič** (klávesa U; `src/zkouska/budic.ts`)

- Kliknutím na styčník do něj budič začne tlačit a tahat silou 2 kN. Buď **přeladí celý rozsah** 0,5–6 Hz tam a zpět (80 s) a řekne, kde most rezonuje, nebo buší **ve stálém rytmu** (14 s) a změří jeden bod. Po přeladění se sám nastaví na nalezený rytmus.
- Co naměří, se kreslí přes spočítanou rezonanční křivku (tenká čára a tečky), takže hráč vidí, že výpočet a pokus říkají totéž. Do medailí se nepočítá.
- *Odchylka od koncepce:* koncepce mluví o táhle frekvence, kterým hráč rezonanci „najde rukou“ za běhu. Zkouška se ale počítá napřed a pak přehrává, takže živé táhlo by znamenalo jiný způsob simulace. Přelaďování dá stejné poznání bez něj.

**Záznam porušení a porovnání pokusů**

- Výsledek řekne, co selhalo první a proč, s čísly: „Jako první selhal prut 5 (lehký trám): vzpěr, tlak 82,4 kN při únosnosti 92,2 kN“. Tlačítko **Přehrát první porušení zpomaleně** skočí kousek před zlom, označí prut a přehraje ho desetinovou rychlostí.
- U ceny, největšího využití a kmitání je řádek „minule … · rozdíl …“ proti předchozí zkoušce.

**Kapitola 5 – Lávka ve městě**, čtyři úrovně s referenčními mosty (kmitání v m/s²):

| Úroveň | Rozpětí | Provoz | Čemu učí | Průchod / rozpočet / mistrovská | Co neprojde |
|---|---|---|---|---|---|
| 5-01 Nábřeží | 48 m | dav 120 lidí | hmota lidí most zpomalí; mez 0,5 m/s² | 0,31 / 0,30 / 0,23 | dvoumetrová příhrada: prázdná 2,3 Hz, s lidmi 2,0 Hz (1,28) |
| 5-02 Městský běh | 32 m, výška do 1 m | 40 běžců kolem 2,6 Hz | laděný tlumič | 1,42 / 1,65 / 0,84 | stejný most bez tlumiče (3,75) |
| 5-03 Slavnost | 36 m, výška do 1 m | průvod 48 lidí, kapela 2,0 Hz | ladit na most s lidmi | 1,40 / 1,84 / 0,87 | bez tlumiče (4,26); tlumič naladěný na 3,2 Hz (2,62) |
| 5-04 Koncert na mostě | 32 m, výška do 2 m | 30 lidí skáče 2,2 Hz | dvojnásobek rytmu, krátká pole mostovky | 1,86 / 2,15 / 1,50 | bez tlumiče (3,76); dlouhá pole mostovky (3,90) |

Každá úroveň má ukázku (bez prvku a s prvkem) a odstavec „Ve skutečnosti“: Golden Gate 1987, tlumič v Tchaj-pej 101, lávka Solférino, tribuny Millennium Stadium. Ukázky dlouhých dějů se přehrávají zrychleně a okno to říká. Zdroje faktů jsou v popisu pull requestu.

V přehledu kampaně je pátá kapitola hned za druhou; třetí a čtvrtá (silnice, údolí) přijdou s M4a a M4b a zařadí se před ni. Rekordy se ukládají podle čísla úrovně, takže se tím nic neztratí.

**Jak je splněno kritérium milníku**

- *Laděný tlumič rozdělí rezonanční špičku* (`test/ladeny-tlumic.test.ts`): na spočítané křivce jsou místo jedné špičky dvě nižší po stranách původní; totéž potvrzuje časová simulace s budičem. V prohlížeči to hlídá `test/e2e/mesto.e2e.ts`: po zavěšení tlumiče klesne nejvyšší špička pod polovinu a přibude vrchol.
- *Úrovně projdou testem vyhratelnosti* (`test/vyhratelnost.test.ts`): všech dvanáct úrovní, každá medaile i mosty, které neprojít mají.
- Testy na konci M3b: 649 jednotkových, 99 kontrol v prohlížeči.

**Formáty.** Úroveň má verzi 3 (`nejvetsiTlumic`, `rezonancniKrivka`, `budic`, `nejhorsiKomfort`, u položky jízdního řádu `trvani`), návrh verzi 2 (laděný tlumič ve styčníku). Starší soubory se načítají přes převod.

**Co se při kalibraci ukázalo**

- Dav sám o sobě most do rezonance nedostane tak snadno jako útvar: síly řad se sčítají odmocninou. Rozhoduje u něj hmota (120 lidí je skoro deset tun), která most zpomalí do pásma kroků.
- Lidé most tlumí, takže špička s lidmi je nižší a širší než u prázdného mostu. Tlumič naladěný podle prázdného mostu je vedle; v úrovni 5-03 to stojí mistrovskou medaili.
- Skákání je nejtvrdší zatížení ve hře. Čtyřmetrová pole dřevěné mostovky se pod doskoky rozdrnčí sama a tlumič na tom nic nezmění; pomůžou jen krátká pole.
- Budič při přelaďování ukazuje špičku o něco později, než kde opravdu je (most potřebuje čas, aby se rozkmital). Proto jede tam a zpět a bere průměr; trefí se na desetinu hertzu.

**Co ověřeno není**

- Jak se s panelem a budičem pracuje člověku, který je vidí poprvé. Testy ověřují, že fungují, ne že jsou srozumitelné.
- Obtížnost páté kapitoly: je nastavená z referenčních mostů stejně jako dřív, ale úrovně s tlumičem jsou první, kde hráč ladí dvě čísla najednou.
- Jiné prohlížeče než Chromium.

## M4a — výsledek

Třetí kapitola: okresní silnice. Těžká doprava, ocelobetonová mostovka a těžký ocelový profil; mosty, které nesou hlavně samy sebe.

**Vozidla** (`src/zkouska/vozidla.ts`, kresba ve `src/vykres/provoz.ts`)

| Vozidlo | Hmotnost | Nápravy | Rychlost | Pérování |
|---|---|---|---|---|
| Dodávka | 3,5 t | 2 (1,6 + 1,9 t) | 50 km/h | 1,5 Hz, útlum 30 % |
| Autobus | 18 t | 2 (6,5 + 11,5 t) | 40 km/h | vzduchové, 1,2 Hz, útlum 25 % |
| Nákladní auto | 26 t | 3 (7 + 9,5 + 9,5 t) | 40 km/h | listová pera, 2,8 Hz, útlum 12 % |
| Tahač s návěsem | 40 t | 5 (6,5 + 11,5 + 3 × 7,33 t) | 40 km/h | tahač pera, návěs vzduch 1,6 Hz |

Každá náprava je karoserie na pérování nad kolem na pneumatice, stejně jako u osobního auta. Tahač s návěsem je hotový a otestovaný, v úrovních přijde až ve čtvrté kapitole. Provoz v obou směrech hra uměla už dřív; nově může úroveň vozidlům předepsat rozestup a rychlost (kolona).

**Ocelobetonová mostovka** (`src/data/katalog.ts`): železobetonová deska 200 mm na ocelových nosnících IPE 240 po 1,5 m, přepočtená na ocel. Váží 520 kg na metr čtvereční (dřevěná 34), v ohybu unese 317 kNm na metr šířky (dřevěná 34) a je stokrát tužší. V tahu nese jen ocel, v tlaku hlavně beton. Poruší se tvárně. Pole do 6 m, 12 000 Kč/m.

**Nerovnost vozovky** (`src/jadro/nerovnost.ts`): profil silnice s normovým spektrem (ISO 8608, třídy A, B, C; směrodatná odchylka výšky 4, 8 a 16 mm), počítaný jen aritmetikou z násady úrovně, takže stejná úroveň má vždy stejnou silnici. Kola po něm jedou před mostem i na něm; chodci ne. Vyšší třída je táž silnice, jen dvakrát hrbolatější.

**Brzdění** (`src/zkouska/provoz.ts`): položka jízdního řádu může vozidlům nařídit zabrzdit na mostě (výchozí zpomalení 5 m/s²), postát a rozjet se. Celá skupina brzdí naráz. Kola tlačí vozovku podélnou silou (zpomalení / g) × tlak kola a vůz se předkloní: přední náprava se přitíží, zadní odlehčí.

**Pohodlí cestujících**: měří se svislé zrychlení karoserie autobusu, dokud jede po mostě (stejný filtr a třídy jako u chodců). Bonus `komfort-cestujicich` rozhoduje o mistrovské medaili; výsledek má řádek „Pohodlí v autobusu“.

**Jak je splněno kritérium milníku** (`test/nerovnost.test.ts`)

- *Dynamické zvýšení od nerovností odpovídá očekávanému rozsahu.* Největší průhyb 24m příhradového mostu pod nákladním autem (staticky 4,2 mm) proti pomalému přejezdu po rovné vozovce, šest různých silnic každé třídy:

  | Vozovka | Zvýšení v průměru | Rozpětí jednotlivých přejezdů |
  |---|---|---|
  | rovná, 40 km/h | 5 % | — |
  | nová (A) | 8 % | 1 až 15 % |
  | běžná (B) | 14 % | 7 až 25 % |
  | rozbitá (C) | 26 % | 13 až 46 % |

  Koncepce čekala 15 až 30 %; tomu odpovídá běžná až rozbitá vozovka. Test hlídá pásma kolem těchto hodnot a to, že zvýšení s třídou roste.
- *Úrovně projdou testem vyhratelnosti*: všech šestnáct úrovní, každá medaile i mosty, které neprojít mají.
- Testy: 728 jednotkových, 121 kontrol v prohlížeči (z toho 8 nových v `test/e2e/silnice.e2e.ts` a 4 nové ukázky).

**Kapitola 3 – Okresní silnice** (využití nejvíc namáhaného prutu):

| Úroveň | Rozpětí | Provoz | Čemu učí | Průchod / rozpočet / mistrovská | Co neprojde |
|---|---|---|---|---|---|
| 3-01 Okresní silnice | 24 m | dodávka, 2 auta, autobus | vlastní tíha: mostovka má sto tun | 44 / 66 / 38 % | metr vysoká příhrada se zlomí dřív, než kdo přijede |
| 3-02 Pod vedením | 36 m, výška do 3 m | 2 nákladní auta, autobus, dodávka | vzpěr a těžký profil na tlačený pás | 53 / 62 / 51 % | horní pás z lehkého profilu; dvanáctimetrový lehký pás vybočí vlastní tíhou |
| 3-03 Linka přes rokli | 30 m | 2 autobusy, 2 auta | příhrada pod mostovkou; pohodlí v autobusu | 65 / 48 / 25 %; autobus 0,16 / 0,26 / 0,13 m/s² | metr vysoká příhrada nad mostovkou |
| 3-04 Kolona | 2 × 24 m, skála uprostřed | kolona 4 nákladních aut brzdí, autobus | brzdná síla a pilíř; oba konce na posuvných ložiskách | 49 / 73 / 36 % | příhrada bez pilíře; pilíř z lehkého profilu se pod brzdící kolonou podlomí |

Každá úroveň má ukázku a odstavec „Ve skutečnosti“ (most v Québecu 1907, Eulerův vzorec 1744, spřažené mosty, pevné a posuvné ložisko a brzdná síla podle normy). Zdroje jsou v popisu pull requestu.

**Co se při kalibraci ukázalo**

- **Most nese hlavně sám sebe.** Na 30 m dělá vlastní tíha tři čtvrtiny namáhání; nákladní auto přidá zbytek. Proto nerovnost vozovky, která zvětší účinek auta o desítky procent, změní celkové namáhání jen o jednotky procent. Rozhoduje u lehkých mostů, ne u těchto.
- **Příhrada pod mostovkou je zhruba dvakrát účinnější než stejná nad ní**: tlak nese betonová mostovka a ocel jen táhne, takže se nic nevzpírá. Je to fyzikálně správně a je z toho lekce úrovně 3-03. V úrovních 3-01 a 3-02 je prostor pod mostem zakázaný (průjezdný profil), aby zůstala lekce o tíze a vzpěru.
- **Ocel se láme tvárně**, takže most s několika „porušeními“ často ještě drží a provoz přejede; počítá se to jako průchod, stejně jako dosud. Úroveň 3-02 má proto dvě nákladní auta za sebou: jedno by most s lehkým pásem jen ohnulo.
- **Pohodlí v autobusu určuje hlavně vozovka.** Na běžné silnici vychází 0,4 až 0,6 m/s² na jakémkoli mostě; most rozhoduje jen na hladké vozovce (tuhý 0,12, měkký 0,28 m/s²). Úroveň 3-03 má proto vozovku rovnou.
- **Brzdění rozhoduje tam, kde vodorovnou sílu nese štíhlý tlačený prut.** U mostu s pevnou podporou na břehu zmizí v mostovce. Úroveň 3-04 má proto oba konce na posuvných ložiskách a pevný bod jen na skále: lehké nohy pilíře projíždějící kolonu unesou na hraně, brzdící ne.

**Formát úrovně má verzi 4**: nerovnost vozovky začala platit (`zadna`, A, B, C) a položky jízdního řádu umějí `rozestup`, `rychlost` a `brzdeni`. Starší úrovně třídu nerovnosti uváděly, ale hra ji nepočítala; převod jim dává `zadna`, takže jejich výsledky se nezměnily.

**Verze fyziky zůstává 5.** Výsledky všech dosavadních úrovní i otisky regresní sady jsou stejné; přibyly jen nové věci.

**Drobnosti**

- Úroveň, kterou hráč už prošel, zůstává odemčená, i když se před ni zařadila nová kapitola (kapitola 3 před kapitolu 5).
- Popisek zakázané zóny se drží ve viditelné části výkresu (v malém okně ukázky býval uříznutý).
- Zadání popisuje vozovku a brzdění; paleta ukazuje ocelobetonovou mostovku silnější čarou.

**Co ověřeno není**

- Jak působí obtížnost: úrovně jsou nastavené z referenčních mostů jako dřív, ale hráč má víc cest (nad mostovkou, pod ní, různé pilíře).
- Jiné prohlížeče než Chromium.
- Zvuky těžkých vozidel jsou pracovní (hlasitější verze zvuku auta); načisto v M9.

## Úprava po M3b: paleta prvků

Zadavatel po sloučení M3b: „ve stavebních prvcích nikde nevidím laděný tlumič a budič; vlevo nahoře jsou jen dvě věci, mostovka a lehký ocelový profil“. Měl pravdu: laděný tlumič (a v druhé kapitole závaží) se objevil až po výběru styčníku nástrojem Výběr a budič byl mezi nástroji zašedlý, dokud nestál most.

**Co se změnilo**

- **Laděný tlumič a závaží jsou položky palety** mezi stavebními prvky, s cenou a mezí úrovně. Kliknutí na položku (nebo její číslo; tlumič i klávesa L) zapne věšení: kliknutí na styčník do něj přídavek pověsí a rovnou ho vybere, takže se vlevo dole objeví jeho nastavení. Kliknutí na styčník, který přídavek už má, ho jen vybere. Escape věšení ukončí.
- Dosavadní cesta (vybrat styčník nástrojem Výběr a nastavit) funguje dál.
- **Další tlumič je stejný jako ten, který most už má** (stejné závaží i ladění). Dřív se druhý tlumič položený hned po prvním naladil na výchozí 2 Hz, protože rozbor mostu se zrovna přepočítával.
- **Brnknutí a budič mají vlastní skupinu „Pokusy“** hned pod prvky, s krátkým popisem, a nejsou zašedlé: bez mostu poradí, že ho nejdřív potřebují.
- Popisky sousedních tlumičů se na výkresu nepřekrývají (každý druhý z těsné řady je o řádek níž).
- Okno se zadáním vypisuje mezi tím, z čeho se staví, i závaží.

**Poučení.** Co úroveň nově dovoluje, musí být vidět na prázdném výkresu, ne až po kroku, o kterém hráč neví. Platí to i pro prvky dalších kapitol (napínák lana, svar, píst).

## Oprava po M3b: ukázka úrovně 5-04

**Co se stalo.** Pravý most ukázky 5-04 (tři laděné tlumiče) stál 724 647 Kč při rozpočtu úrovně 720 000 Kč. Zkouška v pracovním vlákně takový most odmítne jako neplatný vstup, takže ukázka skončila hlášením „ukázku se nepodařilo spočítat“ a levá strana zůstala na „počítá se…“.

**Proč to testy nechytily.** Jednotkový test ukázek pouštěl zkoušku přímo, mimo kontrolu návrhu, a rozpočet výslovně nehlídal. V prohlížeči se zkoušely jen ukázky 2-04, 5-01 a 5-02.

**Oprava**

- Ukázka předvádí princip, ne hospodaření: `ukazkaUrovne` vrací obě strany s úrovní bez rozpočtu, takže dražší most projde kontrolou. Ostatní pravidla úrovně (povolené prvky, zóny, meze tlumičů) platí dál.
- Jednotkový test ukázek teď jde stejnou cestou jako hra (zpráva `start` přes `BehZkousky` včetně kontroly návrhu).
- Test v prohlížeči otevře **všech osm úrovní s ukázkou** a počká, až se každá rozehraje.
- Stejná kontrola odhalila druhou, dosud skrytou chybu: brnknutí a budič měly jít pustit i na mostě dražším než rozpočet (hra to tak říká a tlačítka to dovolí), ale pracovní vlákno pokus odmítlo. Opraveno v `BehZkousky`, s testem.

**Poučení.** Když test z nějakého pravidla dělá výjimku, musí stejnou výjimku dělat i hra; jinak test hlídá něco jiného, než co uvidí hráč. A co se kreslí v prohlížeči, to se má v prohlížeči i zkoušet pro každou úroveň, ne pro vzorek.

## M3z — výsledek

Hra dostala zvuk. Nemá žádné nahrávky: všechno se skládá za běhu z šumu a jednoduchých tónů.

**Zvuky jsou pracovní.** Zadavatel je nechává ve hře jako prozatímní a rozhodl, že se **předělají pomocí ElevenLabs, až budou hotové ostatní fáze projektu** (milník M9 v koncepci). Do té doby se syntezátor neladí: nové prvky a nový provoz dostanou jen jednoduchý pracovní zvuk, aby hra nebyla němá. Rozdělení na „co má zaznít“ (`deje.ts`) a „jak to zní“ (`syntezator.ts`) výměnu usnadní: nahradí se jen druhá vrstva, okamžiky a síly zvuků i jejich testy zůstanou.

**Co je slyšet**

| Zvuk | Kdy | Podle čeho se mění |
|---|---|---|
| Vrzání | prut je namáhaný nad 10 % | využití (častěji a hlasitěji), změna zatížení (živé zatížení vrže víc než stálé), materiál (ocel sténá hlouběji; lano nevrže) |
| Lupání a cinkání | prut je nad 80 % | čím blíž k mezi, tím hustěji; dřevo lupe, ocel a lano cinkají |
| Zlom | porušení prutu, přesně v jeho okamžiku | materiál (dřevo praskne s třískami, ocel zazvoní, lano švihne, beton se drtí), délka prutu (delší zní hlouběji) |
| Sjetí z ložiska | konec mostu sjede z posuvné podpory | — |
| Šplouchnutí a dopad | spadlý účastník nebo troska projde hladinou nebo dosedne na zem | rychlost pádu, velikost (auto šplouchne víc než člověk) |
| Kroky | došlap člověka na mostě, ve chvíli největší krokové síly | chodec, běžec; útvar došlápne naráz jako jeden silný krok |
| Kola | kolo přejede spáru mostovky; k tomu souvislý hluk valení | auto žuchne, jízdní kolo klapne |
| Drnčení | mostovka se pod lidmi houpe víc než 1 m/s² | u meze 2,5 m/s² drnčí skoro souvisle |
| Brnknutí | pokus nástrojem Brnknout | — |

**Jak to funguje**

- `src/zvuk/deje.ts` (bez prohlížeče): `Poslech` jde záznamem spolu s přehráváním a pro každý úsek vrátí, co v něm zaznělo. Všechno odvozuje ze záznamu a událostí zkoušky, nic se nepřidává do simulace. Náhodu nahrazuje otisk času a čísla prutu, takže stejný záznam zní pokaždé stejně.
- Zvuky proto fungují i při zpomalení (zní hlouběji a pomaleji), zrychlení a krokování; **skok po časové ose je potichu** a co už ve vodě leží, znovu nešplouchne.
- `src/zvuk/syntezator.ts`: skládá zvuky nad `BaseAudioContext`; stejný kód hraje do sluchátek i počítá do paměti pro měření. Zvuk přichází z té strany, kde na plátně je. Výstup má měkký omezovač, aby zřícení (desítky zvuků naráz) nepřebudilo výstup.
- `src/zvuk/ozvuceni.ts`: zvukový kontext vzniká až se spuštěním zkoušky nebo přepnutím hlasitosti, tedy na gesto hráče. Do té doby hra o zvuk prohlížeč vůbec nežádá.
- **Hlasitost** v liště a klávesou Z: nahlas, potichu, vypnuto. Pamatuje se v prohlížeči; novou hlasitost hra předvede vrznutím. Dokud jsou zvuky pracovní, začíná hra **potichu** (rozhodnutí zadavatele z 22. 11. 2026).
- **Stránka `/zvuky.html`**: každý zvuk jde pustit zvlášť, k tomu tři krátké děje (most pod rostoucím zatížením, zřícení, pochod) a tabulka změřené hlasitosti, délky a barvy. Slouží zadavateli k připomínkám („vrzání dřeva je moc…“) a testům.

**Změna ve zkoušce (verze fyziky 4).** Zkouška dřív končila 1,5 s poté, co poslední účastník dojel nebo spadl; kdo spadl do hlubokého údolí jako poslední, zůstal na konci záznamu viset ve vzduchu a nedopadl. Teď děj pokračuje, dokud všichni spadlí nejsou na zemi nebo ve vodě (nejdéle 5 s), a teprve pak doběhne. Mění to délku záznamu a konečný stav jen u mostů, ze kterých někdo spadl; otisky regresní sady i výsledky všech referenčních mostů zůstaly stejné.

**Jak je splněno kritérium milníku**

- *Každé porušení a pád vyvolá zvuk ve správném okamžiku záznamu* (`test/zvuk.test.ts`): na mostě, který se pod auty rozláme (15 porušení, sjetí, 6 pádů), má každé porušení zlom se stejným časem a v místě prutu, sjetí svůj zvuk, a každý spadlý šplouchne nebo dopadne přesně ve snímku, kdy v záznamu projde hladinou nebo dosedne. Platí při přehrávání po snímcích, desetkrát jemněji i čtyřikrát hruběji.
- *Vrzání sílí s využitím*: na trámu se stálým využitím počet i hlasitost vrznutí s využitím roste a každé vrznutí, které zazní při menším využití, zazní i při větším. Referenční most úrovně 1-03 pro průchod vrže víc než dvakrát tolik co most s mistrovskou rezervou.
- *Ztlumení se pamatuje*: jednotkový test úložiště a v prohlížeči nové načtení stránky (`test/e2e/zvuk.e2e.ts`).
- *Bez gesta hráče hra nevydá ani tón*: test v prohlížeči počítá vytvořené zvukové kontexty a spuštěné zdroje zvuku. Před spuštěním zkoušky jsou obojí nula, i když v zadání běží ukázka a hráč kliká v paletě; se ztlumeným zvukem zůstávají nula i při zkoušce.
- Navíc: každý zvuk spočítaný do paměti není němý, nepřebudí výstup a včas dozní; celé scény (chodci, auto, pochod, zřícení) mají rozumný poměr hlasitostí a omezovač zasahuje jen při zřícení.
- Na konci M3z procházelo 534 jednotkových testů a 83 kontrol v prohlížeči.

**Co ověřeno není**

- **Jak to zní.** Zvuky jsem ladil podle čísel (hlasitost, délka, střední kmitočet), ne ušima: ve vývojovém prostředí není čím poslouchat. Že vrzání zní jako vrzání a ne jako bzučák, musí posoudit zadavatel. Proto je tu stránka `/zvuky.html`.
- Zvuk v jiných prohlížečích než Chromium (Safari zvukový kontext probouzí přísněji).

**Co chybí a kam patří:** dunění vlaku a těžkých vozidel (s vlakem a náklaďákem), zvuky stavění (položení prutu), zvuk výsledku a medailí, vítr a voda v pozadí. Nic z toho nebylo v zadání milníku; kdyby to zadavatel chtěl, je to malá práce.

## M3a — výsledek

Druhá kapitola: ocelové lávky, na kterých nerozhoduje únosnost, ale to, na jaké frekvenci most kmitá a v jakém rytmu po něm lidé jdou.

**Co přibylo**

- **Běžec a pochodující útvar** (`src/zkouska/vozidla.ts`, `provoz.ts`). Běžec došlapuje půlvlnami sinusu s letovou fází (první harmonická π/2 váhy, druhá −2/3). Útvar jde v řadách přes šířku mostovky a všichni ve stejné fázi kroku; nad 2,4 Hz běží. Lidé v řadě se slučují do jednoho účastníka.
- **Komfort** (`src/jadro/komfort.ts`): zrychlení mostovky v pásmu 0,5–10 Hz průměrované přes sekundu, třídy podle koncepce. **Nepřijatelné kmitání (nad 2,5 m/s²) je neúspěch**, i když nikdo nespadl. Bonus `komfort-chodcu` rozhoduje o mistrovské medaili ve druhé kapitole. Při přehrávání je okamžitá hodnota v legendě.
- **Osa frekvencí** (dole při stavbě, jen v úrovních, které ji zapnou): vlastní frekvence mostu prázdného i s lidmi proti krokům z jízdního řádu a jejich dvojnásobkům; varuje, když se potkají. Počítá ji maticový rozbor v pracovním vlákně (`src/zkouska/rozbor.ts`, zpráva `rozbor` v protokolu) po každé úpravě.
- **Závaží** ve styčníku (výběr styčníku a tlačítka v paletě, krok 100 kg, mez dává úroveň) a **viskózní tlumič** jako prvek palety se silou 5–200 kN·s/m nastavitelnou po výběru. Zrcadlení přenáší obojí.
- **Brnknutí** (nástroj B): stažený a puštěný styčník rozkmitá most; záznam se přehraje a výsledek řekne, na kolika hertzích kmitá. Do medailí se nepočítá.
- **Ukázky v okně se zadáním** (`src/hra/ukazka.ts`, scény v `urovne/ukazky.ts`): dva mosty vedle sebe ve stejné situaci, jeden bez prvku, který úroveň učí, a druhý s ním. Oba se doopravdy počítají v pracovním vlákně a přehrávají se dokola; pohyb mostu je zvětšený (typicky 20×), aby bylo houpání vidět. Pod každým běží okamžité kmitání a na konci verdikt. Ukázku mají úrovně 1-01 (trojúhelník), 2-02 (rezonance: stejný most, jiný rytmus), 2-03 (závaží) a 2-04 (tlumiče). Test `test/ukazky.test.ts` hlídá, že levý most opravdu neobstojí, pravý ano a rozdíl dělá to, co popisek tvrdí.
- **„Ve skutečnosti“** v okně se zadáním: krátká souvislost se skutečnými mosty (příhrady, rezonance, pád mostu v Broughtonu 1831 a rozkaz „zrušit krok“, Millennium Bridge a jeho tlumiče). Údaje jsou ověřené vyhledáním; zdroje jsou v popisu pull requestu.
- **Kapitola 2 – Lávka**, čtyři úrovně s referenčními mosty:

| Úroveň | Rozpětí | Provoz | Čemu učí | Co neprojde |
|---|---|---|---|---|
| 2-01 Ocelová lávka | 24 m | chodci a běžec | ocel, osa frekvencí; bonus chce krátká pole mostovky | most bez diagonál |
| 2-02 Ranní rozcvička | 28 m | 4 běžci v taktu 3 Hz | vyhnout se kroku i jeho dvojnásobku | nízká příhrada (3,4 Hz) i dvoumetrová (6,2 Hz) |
| 2-03 Čestná jednotka | 32 m | 24 lidí pochodem 2,3 Hz | výšku omezuje zóna; závaží most zpomalí | nízká příhrada bez závaží |
| 2-04 Přehlídka | 32 m | útvar třikrát: 1,7, 2,0 a 2,3 Hz | vyladit výšku, nebo dát tlumiče do kotev | nízká i vysoká příhrada bez tlumičů |

**Jak je splněno kritérium milníku** (`test/rezonance.test.ts`): útvar pochodující na vlastní frekvenci lávky zvýší zrychlení mostovky víc než čtyřikrát proti pochodu mimo rezonanci a přes hranici nepřijatelného; dva tlumiče ho vrátí pod limit a útvar projde. V prohlížeči totéž prochází `test/e2e/rezonance.e2e.ts` včetně závaží, tlumiče a brnknutí myší.

Testy: 511 jednotkových, 70 kontrol v prohlížeči.

**Formát úrovně má verzi 2**: přibylo `nejvetsiZavazi` a `osaFrekvenci`. Soubory první kapitoly zůstaly ve verzi 1 a načítají se přes převod.

**Co se při kalibraci ukázalo**

- Lidé na mostě nejsou jen zátěž: jejich těla (hmota na pružině s třetinovým útlumem) most výrazně tlumí. Útvar proto nemá ostrou rezonanční špičku a most rozkmitá v širším pásmu kolem vlastní frekvence.
- Čtyřmetrová pole dřevěné mostovky se pod běžci prohýbají sama o sobě; deset běžců v taktu neprošlo ani po velmi tuhém mostě. Úroveň 2-02 má proto čtyři běžce a mistrovská medaile vede přes dvoumetrová pole.
- Dřevěná mostovka jako tlačený pás dlouhé příhrady pod mostovkou nevydrží; lávky druhé kapitoly mají příhradu nad mostovkou, kde je mostovka tažená.
- Tlumič do kotvy pomáhá podle toho, jak moc se v jeho místě most hýbe; ve čtvrtinách rozpětí je potřeba 100–200 kN·s/m.

**Co M3a vědomě neobsahuje**

- Ztrátu kroku při silném kmitání (koncepce 7.7): doplněno v M3b.
- Laděný tlumič, rezonanční křivku, grafy a analytický panel: doplněno v M3b.
- Pružinu v paletě: jádro ji umí, ale bez laděného tlumiče nemá ve hře využití.

## M2 — výsledek

Hra se dá hrát: přehled kampaně, čtyři úrovně první kapitoly, stavba mostu myší, zkouška s provozem, přehrávání na časové ose, medaile a ukládání.

**Co je ve hře**

- **Přehled kampaně** (`/`): karty úrovní s náhledem výkresu a rozpracovaného mostu, medaile, nejlevnější most, zámky. Další úroveň se odemkne průchodem předchozí; pro testování jde dole odemknout všechno. Úroveň jde otevřít i adresou `/?uroven=1-03`.
- **Stavba** (`src/editor/`, `src/hra/uroven.ts`): tažením ze styčníku nebo kotvy vznikne prut zvoleného prvku; most roste jen z podpor. Editor nedovolí nic, co by zkouška odmítla, a řekne proč (příliš dlouhý prut, terén, dvojitý prut). Výběr kliknutím a obdélníkem, mazání, posun styčníku (nástroj Výběr nebo Alt), změna prvku vybraných prutů, zrcadlení podle osy mostu, zpět a znovu, smazání všeho.
- **Rozpočet**: pruh v liště s ryskou inženýrského rozpočtu; most dražší než rozpočet na zkoušku nejde.
- **Zkouška** (`src/zkouska/zkouska.ts`, `provoz.ts`, `vozidla.ts`): chodec s krokovou silou, cyklista, osobní auto s pérováním a pneumatikami, jízda v obou směrech. Počítá se v pracovním vlákně mnohonásobně rychleji, než se přehrává.
- **Zadání úrovně** vyskočí v okně při otevření úrovně bez mostu (text, kdo přes most půjde, z čeho se staví, medaile); zůstává i vlevo v paletě a jde otevřít znovu.
- **Přehrávání**: časová osa se značkami výjezdů, porušení a pádů, rychlosti ⅒×, ¼×, 1×, 4×, krokování po 0,02 s (tlačítka nebo čárka a tečka), skok na konec. Pruty jsou obarvené podle využití, tah dvojitou čarou; hodně namáhané pruty podkresluje záře.
- **Čísla využití**: u každého prutu procenta, při zkoušce okamžitá, při stavbě největší z poslední zkoušky. Jdou vypnout v legendě nebo klávesou C; volba se pamatuje.
- **Vyhodnocení**: tři medaile s podmínkami, cena, největší využití, výpis porušení; všechno jde rozkliknout na časové ose. Porovnání s minulým pokusem. Tlačítko Diagnostika dá text s verzí, mostem a výsledkem.
- **Obálka namáhání**: po návratu ke stavbě zůstanou pruty obarvené největším využitím; kliknutí na prut řekne kolik, čím a kdy. Při přehrávání kliknutí na prut skočí do toho okamžiku.
- **Ukládání** (`src/hra/uloziste.ts`): rozpracovaný most každé úrovně a rekordy v paměti prohlížeče, průběžně. Export a import mostu jako text.

**Kapitola 1 – Potok** (`urovne/1-0x.json`, referenční řešení v `urovne/reseni.ts`)

| Úroveň | Rozpětí | Provoz | Rozpočet / inženýrský | Bonus (největší využití) | Nejlevnější referenční most |
|---|---|---|---|---|---|
| 1-01 Lávka přes potok | 8 m | 3 chodci | 45 000 / 33 500 Kč | do 9 % | 31 095 Kč |
| 1-02 Cyklostezka | 12 m | 3 cyklisté, 2 chodci | 60 000 / 40 000 Kč | do 8 % | 38 653 Kč |
| 1-03 První auto | 16 m | 2 auta, chodec, cyklista | 110 000 / 80 000 Kč | do 25 % | 78 266 Kč |
| 1-04 Hluboké údolí | 24 m | 3 auta, 2 cyklisté, 2 chodci | 200 000 / 125 000 Kč | do 20 % | 117 600 Kč |

Každá úroveň má tři referenční mosty (průchod, rozpočet, mistrovská) a dva, které spadnout mají. Test vyhratelnosti (`test/vyhratelnost.test.ts`) ověřuje, že každý dopadne, jak má.

**Jak je splněno kritérium milníku**

- *Všechny úrovně projdou testem vyhratelnosti*: `test/vyhratelnost.test.ts`, 30 kontrol.
- *Test postaví most myší a vyhraje*: `test/e2e/hra.e2e.ts` nakreslí v bezhlavém prohlížeči myší věšadlo na úrovni 1-01, pustí zkoušku mezerníkem a získá medaile za průchod a rozpočet.
- *Uložení a načtení dá shodný otisk*: tentýž test po novém načtení stránky a po exportu a importu dostane stejný otisk výpočtu; v Node to hlídá `test/zkouska.test.ts`.

Testy: 427 jednotkových, 59 kontrol v prohlížeči.

**Změny fyziky v M2 (verze 2)**

- **Průřezy dřeva** zvolené pro hru (viz tabulka verzí dole). S původními masivními trámy využil provoz první kapitoly jen pár procent únosnosti.
- **Posuvná podpora má úložnou délku 0,5 m** (`src/jadro/loziska.ts`). Konec mostu, který se posune dál, z ložiska sjede a podporu ztratí. Dřív se při zřícení posuvná podpora rozjela po své rovině přes celé údolí a most na ní visel ve vzduchu. Zkoušel jsem i dorazy; ty ale mostovku bez ztužení zachytily jako houpací lávku a prošla zkouškou.
- **Trosky a spadlí účastníci dopadají na terén** a ve vodě je brzdí odpor (`src/jadro/teren.ts`).
- **Styčník, který po porušení osiří**, se zastaví a nekreslí.

**Co M2 vědomě neobsahuje**

- Svary, lana, pilíře, závaží a tlumiče v editoru (jádro je umí; hráči se zpřístupní v M3a a M4b).
- Komfort chodců a cestujících; medaile s tímto bonusem zatím získat nejde (v kapitole 1 žádná taková není).
- Záznam porušení se zpomaleným přehráním a analytický panel (M3b).
- Dotykové ovládání a úzké obrazovky (M8). Pod 900 px šířky se schová popisové pole, hrát se dá od zhruba 1 000 px.
- Nápověda uvnitř hry kromě zadání úrovně a řádku s ovládáním.

**Poučení z M2**

- Dorazy posuvné podpory vypadaly jako čistě vizuální oprava a změnily, které mosty projdou. Na změnu fyziky musí vždy odpovědět test vyhratelnosti, ne jen pohled.
- Výsledek zkoušky je spočítaný dřív, než se přehraje. Medaile se proto ukazují až s koncem přehrávání; jinak hra prozradí konec předem.
- Lištu, výsledkový panel i paletu bylo nutné prohlédnout na snímcích: první verze se při zkoušce nevešla na šířku a panel zakrýval most.

## M1b — výsledek

Podrobně v [`M1B-JADRO.md`](./M1B-JADRO.md). Stručně:

- **Jádro je úplné** (`src/jadro/`): nosník, lano, pružina s tlumičem, závaží, zatížení mezi styčníky, posouzení namáhání, plasticita, porušení se změnou stavby za běhu, pohyblivé zatížení (síla, kolo na pneumatice, chodec), řídicí smyčka `Simulace`.
- **Ověření**: všech 15 skupin úloh z koncepce kap. 7.10 vychází v tolerancích; čísla jsou v tabulce v `M1B-JADRO.md`.
- **Regresní sada**: 20 referenčních mostů s otisky (`src/zkouska/regrese.ts`, `regrese-otisky.json`), k tomu poloviční krok, zrcadlový most a 40 náhodných mostů. Node a Chromium dávají bitově stejné otisky.
- **Zkušebna** (`/zkusebna.html`): 9 případů včetně zlomení vazníku, plastického nosníku, vzpěru, přejezdu síly a laděného tlumiče; porušení jsou vyznačená na časové ose.
- **Shoda výpočtu** (`/otisky.html`): přepočítá regresní sadu v prohlížeči zadavatele.
- **Stavba mostu z návrhu** (`sestavMost` v `src/zkouska/stavba.ts`): podpory, klouby a svary, skryté dělení, lana, pružiny, trasy.
- **Rychlost s úplným jádrem**: největší most 4,1× až 6,5×, běžná úroveň 58× až 106× reálného času.
- **Verze fyziky je 1.**

Testy: 311 jednotkových, 34 kontrol v prohlížeči.

### Co jádro zatím neumí (a kdy to přijde)

- Zkouška úrovně s jízdním řádem a vozidla s karoserií: doplněno v M2. Hodnocení komfortu: M3a.
- Kolize trosek s terénem: doplněno v M2. Nerovnost vozovky: M4a. Výchozí poloha povolených lan ustálením v čase: M4b. Píst: M6.
- Hlídání bilance energie z koncepce (kap. 7.5) nahrazuje jednodušší pojistka: neplatné číslo nebo rychlost přes 2 000 m/s zkoušku zastaví (`Simulace.rozpadla`).
- Vzpěr konstrukce jako celku vychází při hrubém dělení o něco výš (viz `M1B-JADRO.md`, bod 5); možné zpřesnění je popsané tamtéž.
- Hodnoty materiálů jsou zčásti jen z paměti (hlavička `src/data/katalog.ts`). Hotové (`hotovo: true`) jsou dřevěná mostovka, oba dřevěné a oba ocelové pruty, pružina a tlumič; prvky s předběžnými hodnotami kontrola návrhu odmítá.

### Poučení z M1b

- Ověřovací úlohy samy nestačí. Tři skutečné chyby (kontakt kola rozkmitávající styčníky mostovky, odhad kroku u povoleného lana, kolo opřené o utržený kus mostovky) našla až regresní sada s mosty postavenými tak, jak je postaví hráč.
- Snímek obrazovky odhalil, že trosky padají zpomaleně; testy to neviděly, protože kontrolovaly jen okamžik porušení.
- Výchozí stav každého případu má být skutečná rovnováha; jinak se konstrukce na začátku rozezní.
- Všechno, co vstupuje do simulace, smí počítat jen sčítáním, násobením, dělením a odmocninou. Operátor mocniny a `Math.hypot` do jádra, katalogu ani stavby mostu nepatří.

## M1a — výsledek

Podrobně v [`M1A-MERENI.md`](./M1A-MERENI.md). Stručně:

- Explicitní výpočet se skutečnými tuhostmi stačí: největší referenční most 7× až 12× rychleji než reálný čas, běžná úroveň přes 100×. Zálohy z koncepce nejsou potřeba.
- Krok určuje jen podélná vlna v nejkratším prutu: 1 600 až 6 400 kroků za sekundu.
- Tlumení: vlastním tvarům přímo, nejvyšším frekvencím přes tuhost (ξ = 0,1).
- Jádro nepoužívá goniometrické funkce.

**Co v jádře už je** (`src/jadro/`): korotační nosník se smykem a klouby, lano, soustředění hmot, velocity Verlet, tři druhy tlumení, volba kroku, hustá matice tuhosti, Newtonovo hledání rovnováhy s rozpoznáním mechanismu, vlastní tvary, nejvyšší frekvence. Pokryto 36 testy proti analytickým řešením.

**Měřicí nástroje** jsou ve složce `mereni/` a na stránce `/mereni.html`. Od M1b měří úplnou zkoušku včetně posuzování porušení a kol na pneumatikách.

## M0 — co je hotovo

- Kostra projektu v `mostmistr/`: vlastní `package.json`, zámek závislostí, tři konfigurace typové kontroly, `netlify.toml` s pevnou verzí Node.
- Modrákové plátno: rastr 1 m se zvýrazněním po 5 m, terén v řezu se šrafováním, hladina, podpory, základ pro pilíř, zakázaná zóna, předmostí, niveleta, osa a kóta rozpětí, rám výkresu.
- Kamera: zoom kolem kurzoru, posun, celý výkres; oddálit lze nejvýš na celý výkres a pohled nejde odsunout mimo něj.
- Popisové pole s názvem úrovně, měřítkem, verzí hry, otiskem sestavení a verzí fyziky.
- Formát úrovně a návrhu mostu s číslem verze, řetězem převodů a kontrolou; katalog prvků a druhů provozu.
- Rozhraní zkoušky (`src/zkouska/protokol.ts`) a pracovní vlákno. Zatím umí jen ohlásit verzi fyziky.
- Zkušební úroveň `urovne/0-00.json`. Není součástí kampaně.

## M0 — jak je ověřeno

- `npm run check`: typová kontrola hry, vrstev bez prohlížeče a testů. Ověřeno i negativně: soubor v `src/jadro/`, který sáhne na `document`, kontrolou neprojde.
- `npm test`: 79 jednotkových testů (kamera, rastr, formátování, slovník, formát úrovně a návrhu, běh zkoušky).
- `npm run test:e2e`: 15 kontrol v bezhlavém Chromiu nad hotovým sestavením. Stránka se načte bez chyb, plátno není prázdné, zoom drží bod pod kurzorem, posun myší i klávesnicí funguje, pracovní vlákno odpovídá.
- Sestavení s proměnnou `COMMIT_REF` vloží otisk commitu do popisového pole.

Průchod v prohlížeči při vývoji odhalil dvě chyby, které jiné testy neviděly: pořadí inicializace plátna a kamery, a chybějící dolní mez oddálení.

## M0 — co ověřeno není

- **Jak hra na Netlify vypadá a ovládá se.** Sestavení a nasazení `main@97a1637` prošlo (zadavatel poslal snímek z Netlify). Že výkres funguje i při pohledu očima, zatím nepotvrdil.
- **Jiné prohlížeče než Chromium.**
- **Ovládání touchpadem.** Kolečko i dvouprstý posun zoomují; posun je pravým tlačítkem nebo šipkami. Mezerník od M2 pouští zkoušku a výkres už neposouvá.

## Vědomě odloženo

- Formát rekordu a ceny prvků: doplněno v M2 (`src/data/ulozeni.ts`, `src/data/katalog.ts`).
- Ověření hodnot materiálů proti zdrojovým normám: z vývojového prostředí se normy otevřít nepodařilo; u každé hodnoty je v katalogu poznamenáno, zda je potvrzená.

## Co je potřeba od zadavatele

1. **Nastavit heslo správce v Netlify** (proměnná prostředí `MM_SPRAVCE_HESLO`, rozsah Functions, pak nové nasazení); postup je v `docs/ZPETNA-VAZBA.md`. Bez něj se zpětná vazba i deník ukládají, ale nejdou číst. Po nastavení otevřít `/sprava.html` a říct, jestli se přihlášení a první data ukázala.
2. Když se něco chová divně: po zkoušce tlačítko Diagnostika a poslat zkopírovaný text.

Stále neověřeno: shoda výpočtu ve Firefoxu a Safari (`/otisky.html`); zadavatel ji odložil.

## Další krok

M5 Železnice (na začátku oprava vlastní tíhy svařených prutů, viz recenze M4b), M6 Pohyblivé mosty, M7 Režimy, M8 Doladění; každý s interními testy a nezávislou recenzí. Zvuky se neladí; načisto se udělají v M9 pomocí ElevenLabs.

## Zpětná vazba zadavatele

- 20. 11. 2026: první nasazení na Netlify selhalo, protože `main` tehdy složku `mostmistr` ještě neobsahovala; po sloučení M0 prošlo. K běžící hře zatím žádná zpětná vazba.
- 20. 11. 2026: zadavatel pustil `/mereni.html` na svém počítači (Chrome 157, Windows, sestavení `0.2.0 e4e2146`); výsledky jsou v `M1A-MERENI.md`. Projekt na Netlify se jmenuje `mostmistr`, náhledy mají adresu `deploy-preview-N--mostmistr.netlify.app`.
- Rozhodnutí zadavatele: pull requesty sledovat a selhání sestavení opravovat samostatně; slučovat jen s jeho souhlasem.
- 20. 11. 2026: zadavatel schválil sloučení M1b a pokračování na M2. Kontrolu `/otisky.html` ve Firefoxu a Safari odložil („teď ne“).
- 21. 11. 2026: M2 je v pull requestu č. 4 s náhledem `deploy-preview-4--mostmistr.netlify.app`. Zadavatel si hru nejdřív zahraje a obtížnost první kapitoly posoudí sám. Do jeho vyjádření se M2 neslučuje a M3a nezačíná.
- 21. 11. 2026, po prvním hraní: „Je to fajn.“ Čtyři přání:
  1. Zadání úrovně jako vyskakovací okno, aby se hráč před stavbou zamyslel; instrukce mají zůstat i vlevo. **Hotovo.**
  2. Možnost zkoušku zpomalit a sledovat ji postupně. Rychlosti na časové ose už byly (¼×), ale přehlédl je. **Doplněno** ⅒×, krokování a popisek „Rychlost“; zmínka i v okně se zadáním.
  3. Zvýraznit zatížení prutů, případně malá procenta u prutů s možností vypnout. **Hotovo**: čísla využití, legenda, citlivější barevná škála (žlutá od 40 %, dřív od 50 %), záře u prutů nad 60 %.
  4. Zvuky zatěžování a pohybu po mostě, od vrzání po praskání a zřícení. Sám řekl, že to může počkat.
- 21. 11. 2026, po úpravách: zadavatel rozhodl **M2 sloučit a pokračovat na M3a**. **Zvuky chce hned po M3a** jako samostatný milník (v koncepci M3z). **Obtížnost první kapitoly je akorát**; další kapitoly se mají ladit stejně, tedy z referenčních mostů.

- 22. 11. 2026, k náhledu M3z: „Nechme tyhle zvuky zatím jako pracovní“ a **zvuky se budou ještě předělávat pomocí ElevenLabs, ale až po dokončení ostatních fází projektu**. Zapsáno jako milník M9 v koncepci. Pozn.: v dialogu s otázkou nešly odkazy zkopírovat ani otevřít; odkazy na náhled proto vždy posílat přímo do textu odpovědi.

- 22. 11. 2026: zadavatel rozhodl **M3z sloučit a pokračovat na M3b**; pracovní zvuky mají být ve výchozím stavu **zapnuté potichu**.

- 22. 11. 2026: zadavatel rozhodl **M3b sloučit a jít na M4a**. Hned potom na tabletu našel chybu: **v úrovni 5-04 se neukázala ukázka** („ukázku se nepodařilo spočítat“). Opraveno, viz „Oprava po M3b“; zadavatel opravu nechal sloučit hned.

- 22. 11. 2026, vzápětí: „ve stavebních prvcích nikde nevidím laděný tlumič a budič“. Upraveno, viz „Úprava po M3b: paleta prvků“; zadavatel úpravu nechal sloučit hned (verze 0.7.2).

- 22. 11. 2026: zadavatel rozhodl **M4a sloučit a jít na M4b** (verze 0.8.0). Pozn.: jeho snímky chyb byly z adresy `deploy-preview-7`, tedy ze zmrazeného náhledu staršího pull requestu; opravy se do starých náhledů nedostanou. Při hlášení opravy vždy poslat odkaz na nový náhled a říct, že starý odkaz zůstává starý.

- 22. 11. 2026, k pull requestu M4b: zadavatel chce, abych **prošel všechny milníky za sebou**, každý **detailně interně otestoval, pustil nezávislé recenze a zapracoval vylepšení**. Na dotaz rozhodl: **slučovat mám sám** po testech a recenzi. Zároveň chce **zpětnou vazbu od hráčů přímo ve hře**, která se eviduje a dá se řešit, a **podrobné záznamy toho, jak hráči hrají a stavějí**, pro ladění prostředí a zábavnosti. Rozhodl: ukládat **na Netlify** (funkce a úložiště, stránka správce chráněná heslem) a záznam hraní mít **zapnutý s viditelným upozorněním a vypínačem**. Zařazeno jako milník M4c před M5.

- 21. 11. 2026, po vyzkoušení M3a s ukázkami: „Přijde mi to fajn, pokračuj dále.“ M3a sloučeno do `main`, následuje M3z.

- 21. 11. 2026, k pull requestu M3a, ještě před hraním: zadavatel chce, aby hra **ukázala, proč je nutné tlumiče a další prvky používat a k čemu jsou**: „jednoduše herně, ale s odkazem na reálný smysl“. **Hotovo**: ukázky dvou mostů vedle sebe a odstavec „Ve skutečnosti“ v okně se zadáním. Platí to i pro další kapitoly: každý nový prvek má dostat ukázku a souvislost se skutečností.

## Verze fyziky

| Verze | Změna |
|---|---|
| 0 | Jádro neexistuje |
| 1 | První úplné jádro (M1b): nosník se smykem, lano, pružina s tlumičem, plasticita, porušení, pohyblivé zatížení, skryté dělení prutů |
| 2 | Kalibrace první kapitoly (M2): štíhlejší průřezy dřeva (lehký trám 2× 60 × 120 mm, těžký 2× 120 × 240 mm, mostovka z fošen 80 mm). Styčník, který po porušení osiří, se zastaví. Posuvná podpora má úložnou délku 0,5 m; konec mostu, který z ní sjede, podporu ztratí. Verze 2 vznikla celá v M2 a před ní žádná hratelná verze nevyšla. |
| 3 | Hodnocení kmitání (M3a): měří se zrychlení mostovky pod lidmi a nepřijatelné kmitání je neúspěch. Otisky referenčních mostů se nezměnily; změnilo se, které mosty zkouškou projdou. Referenční mosty první kapitoly vycházejí 0,2 až 1,9 m/s², tedy pod hranicí. |
| 4 | Konec děje (M3z): zkouška nekončí, dokud ti, kdo spadli, nedopadnou na zem nebo do vody (nejdéle 5 s po posledním pádu). Mění se délka záznamu a konečný stav mostů, ze kterých někdo spadl. Otisky referenčních mostů ani výsledky referenčních řešení se nezměnily. |
| 5 | Ztráta kroku (M3b): budicí síla člověka slábne, když se mostovka pod ním houpe víc než 2,5 m/s²; nad 6 m/s² z ní zbývá čtvrtina. Mění se kmitání mostů, které se rozhoupaly přes mez (nízká příhrada úrovně 2-03 bez závaží: 5,51 → 4,16 m/s², dál neprojde). Ve výsledku se lidé počítají po jednom, ne po řadách. Otisky referenčních mostů ani to, která referenční řešení projdou, se nezměnily. |
