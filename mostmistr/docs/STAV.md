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
| M3z Zvuk (předsunuto z M8) | Hotovo jako **pracovní verze** (pull request M3z). Zadavatel chce zvuky později předělat pomocí ElevenLabs |
| M3b až M8 | Nezačato |
| M9 Zvuk načisto (ElevenLabs) | Až po dokončení všech ostatních milníků |

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
- **Hlasitost** v liště a klávesou Z: nahlas, potichu, vypnuto. Pamatuje se v prohlížeči; novou hlasitost hra předvede vrznutím.
- **Stránka `/zvuky.html`**: každý zvuk jde pustit zvlášť, k tomu tři krátké děje (most pod rostoucím zatížením, zřícení, pochod) a tabulka změřené hlasitosti, délky a barvy. Slouží zadavateli k připomínkám („vrzání dřeva je moc…“) a testům.

**Změna ve zkoušce (verze fyziky 4).** Zkouška dřív končila 1,5 s poté, co poslední účastník dojel nebo spadl; kdo spadl do hlubokého údolí jako poslední, zůstal na konci záznamu viset ve vzduchu a nedopadl. Teď děj pokračuje, dokud všichni spadlí nejsou na zemi nebo ve vodě (nejdéle 5 s), a teprve pak doběhne. Mění to délku záznamu a konečný stav jen u mostů, ze kterých někdo spadl; otisky regresní sady i výsledky všech referenčních mostů zůstaly stejné.

**Jak je splněno kritérium milníku**

- *Každé porušení a pád vyvolá zvuk ve správném okamžiku záznamu* (`test/zvuk.test.ts`): na mostě, který se pod auty rozláme (15 porušení, sjetí, 6 pádů), má každé porušení zlom se stejným časem a v místě prutu, sjetí svůj zvuk, a každý spadlý šplouchne nebo dopadne přesně ve snímku, kdy v záznamu projde hladinou nebo dosedne. Platí při přehrávání po snímcích, desetkrát jemněji i čtyřikrát hruběji.
- *Vrzání sílí s využitím*: na trámu se stálým využitím počet i hlasitost vrznutí s využitím roste a každé vrznutí, které zazní při menším využití, zazní i při větším. Referenční most úrovně 1-03 pro průchod vrže víc než dvakrát tolik co most s mistrovskou rezervou.
- *Ztlumení se pamatuje*: jednotkový test úložiště a v prohlížeči nové načtení stránky (`test/e2e/zvuk.e2e.ts`).
- *Bez gesta hráče hra nevydá ani tón*: test v prohlížeči počítá vytvořené zvukové kontexty a spuštěné zdroje zvuku. Před spuštěním zkoušky jsou obojí nula, i když v zadání běží ukázka a hráč kliká v paletě; se ztlumeným zvukem zůstávají nula i při zkoušce.
- Navíc: každý zvuk spočítaný do paměti není němý, nepřebudí výstup a včas dozní; celé scény (chodci, auto, pochod, zřícení) mají rozumný poměr hlasitostí a omezovač zasahuje jen při zřícení.
- Celkem prochází 534 jednotkových testů a 83 kontrol v prohlížeči.

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

- Ztrátu kroku při silném kmitání (koncepce 7.7): síla lidí zatím s kmitáním neklesá. Přijde s davem v M3b.
- Laděný tlumič, rezonanční křivku, grafy a analytický panel (M3b).
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

1. Rozhodnout, jestli se má pull request M3z s pracovními zvuky sloučit do `main` a jestli mají být pracovní zvuky ve výchozím stavu zapnuté.
2. Když se něco chová divně: po zkoušce tlačítko Diagnostika a poslat zkopírovaný text.

Stále neověřeno: shoda výpočtu ve Firefoxu a Safari (`/otisky.html`); zadavatel ji odložil.

## Další krok

M3b: dav, ztráta kroku při silném kmitání, laděný tlumič a analytický panel. Zvuky se teď neladí; načisto se udělají v M9 pomocí ElevenLabs.

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
