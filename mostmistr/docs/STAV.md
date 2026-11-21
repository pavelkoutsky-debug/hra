# Mostmistr — stav vývoje

Poslední aktualizace: 21. 11. 2026

## Milníky

| Milník | Stav |
|---|---|
| M0 Základy | Hotovo, sloučeno do `main`, nasazeno na Netlify (20. 11. 2026) |
| M1a Průzkum (krok, tlumení, výkon) | Hotovo, sloučeno do `main`; kritérium splněno i na počítači zadavatele |
| M1b Jádro | Hotovo, sloučeno do `main` (20. 11. 2026) |
| M2 První hratelná verze | Hotovo, čeká na vyzkoušení zadavatelem a sloučení (pull request M2) |
| M3a až M8 | Nezačato |

## M2 — výsledek

Hra se dá hrát: přehled kampaně, čtyři úrovně první kapitoly, stavba mostu myší, zkouška s provozem, přehrávání na časové ose, medaile a ukládání.

**Co je ve hře**

- **Přehled kampaně** (`/`): karty úrovní s náhledem výkresu a rozpracovaného mostu, medaile, nejlevnější most, zámky. Další úroveň se odemkne průchodem předchozí; pro testování jde dole odemknout všechno. Úroveň jde otevřít i adresou `/?uroven=1-03`.
- **Stavba** (`src/editor/`, `src/hra/uroven.ts`): tažením ze styčníku nebo kotvy vznikne prut zvoleného prvku; most roste jen z podpor. Editor nedovolí nic, co by zkouška odmítla, a řekne proč (příliš dlouhý prut, terén, dvojitý prut). Výběr kliknutím a obdélníkem, mazání, posun styčníku (nástroj Výběr nebo Alt), změna prvku vybraných prutů, zrcadlení podle osy mostu, zpět a znovu, smazání všeho.
- **Rozpočet**: pruh v liště s ryskou inženýrského rozpočtu; most dražší než rozpočet na zkoušku nejde.
- **Zkouška** (`src/zkouska/zkouska.ts`, `provoz.ts`, `vozidla.ts`): chodec s krokovou silou, cyklista, osobní auto s pérováním a pneumatikami, jízda v obou směrech. Počítá se v pracovním vlákně mnohonásobně rychleji, než se přehrává.
- **Přehrávání**: časová osa se značkami výjezdů, porušení a pádů, rychlosti ¼×, 1×, 4×, skok na konec. Pruty jsou obarvené podle využití, tah dvojitou čarou.
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

Testy: 419 jednotkových, 57 kontrol v prohlížeči.

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

1. Na náhledu pull requestu M2 projít kapitolu 1: jde most postavit pohodlně, je jasné, proč něco nejde, vypadá zkouška a zřícení věrohodně?
2. Říct, jestli obtížnost sedí: rozpočty a prahy mistrovské medaile jsou odvozené z referenčních mostů, ne z hraní člověkem.
3. Když se něco chová divně: po zkoušce tlačítko Diagnostika a poslat zkopírovaný text.
4. Schválit sloučení M2 do `main`.

Stále neověřeno: shoda výpočtu ve Firefoxu a Safari (`/otisky.html`); zadavatel ji odložil.

## Další krok

M3a, rezonance: běžec a pochodující útvar, lehká ocel, osa frekvencí, závaží, viskózní tlumič v editoru, měření komfortu, brnknutí, kapitola 2.

## Zpětná vazba zadavatele

- 20. 11. 2026: první nasazení na Netlify selhalo, protože `main` tehdy složku `mostmistr` ještě neobsahovala; po sloučení M0 prošlo. K běžící hře zatím žádná zpětná vazba.
- 20. 11. 2026: zadavatel pustil `/mereni.html` na svém počítači (Chrome 157, Windows, sestavení `0.2.0 e4e2146`); výsledky jsou v `M1A-MERENI.md`. Projekt na Netlify se jmenuje `mostmistr`, náhledy mají adresu `deploy-preview-N--mostmistr.netlify.app`.
- Rozhodnutí zadavatele: pull requesty sledovat a selhání sestavení opravovat samostatně; slučovat jen s jeho souhlasem.
- 20. 11. 2026: zadavatel schválil sloučení M1b a pokračování na M2. Kontrolu `/otisky.html` ve Firefoxu a Safari odložil („teď ne“).
- 21. 11. 2026: M2 je v pull requestu č. 4 s náhledem `deploy-preview-4--mostmistr.netlify.app`. Zadavatel si hru nejdřív zahraje a obtížnost první kapitoly posoudí sám. Do jeho vyjádření se M2 neslučuje a M3a nezačíná.

## Verze fyziky

| Verze | Změna |
|---|---|
| 0 | Jádro neexistuje |
| 1 | První úplné jádro (M1b): nosník se smykem, lano, pružina s tlumičem, plasticita, porušení, pohyblivé zatížení, skryté dělení prutů |
| 2 | Kalibrace první kapitoly (M2): štíhlejší průřezy dřeva (lehký trám 2× 60 × 120 mm, těžký 2× 120 × 240 mm, mostovka z fošen 80 mm). Styčník, který po porušení osiří, se zastaví. Posuvná podpora má úložnou délku 0,5 m; konec mostu, který z ní sjede, podporu ztratí. Verze 2 vznikla celá v M2 a před ní žádná hratelná verze nevyšla. |
