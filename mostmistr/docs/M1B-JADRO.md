# Mostmistr — M1b: fyzikální jádro a jeho ověření

20. 11. 2026 · výstup milníku M1b (koncepce, kap. 7 a 12)

## Závěr

**Jádro je hotové a ověřené.** Všechny úlohy z kapitoly 7.10 koncepce vycházejí v tolerancích, regresní sada dvaceti mostů dává v Node i v Chromiu bitově stejné otisky a kritérium rychlosti platí i s úplným jádrem.

| Co | Stav |
|---|---|
| Ověřovací úlohy proti známým řešením | 15 z 15 skupin prochází (tabulka níže) |
| Regresní sada | 20 referenčních mostů, otisky shodné v Node a v Chromiu |
| Automatické testy | 311 jednotkových, 34 kontrol v prohlížeči |
| Zkušebna (`/zkusebna.html`) | 9 případů s porovnáním s teorií a rychlostí výpočtu |
| Rychlost s úplným jádrem | největší most 4,1× až 6,5×, běžná úroveň 58× až 106× reálného času |

Verze fyziky je od tohoto milníku **1**.

## Ověření proti známým řešením

Čísla jsou z automatických testů (`test/jadro-*.test.ts`) a ze zkušebny; tytéž případy běží v Node i v prohlížeči.

| Úloha (koncepce 7.10) | Vyšlo | Má vyjít | Poznámka |
|---|---|---|---|
| Síly v prutech příhrady | odchylka pod 0,005 % | styčníková metoda | |
| Průhyb konzoly a prostého nosníku se smykem | odchylka pod 0,0001 % | vzorce pružnosti | |
| Součet reakcí pod mostem s kolonou | 682,1 kN | 680,6 kN | průměr za 2 s jízdy |
| Konzola stočená momentem | odchylka konce < 0,5 % délky | čtvrtkruh, půlkruh, kruh | celý kruh potřebuje 48 dílů |
| Volně zavěšené lano | průvěs do 0,5 %, síly do 0,1 % | řetězovka | |
| Napjaté lano | první tři frekvence na 4 desetinná místa | struna | |
| Vlastní frekvence nosníku | 4,805 Hz | 4,819 Hz | rozdíl je smyk a dělení na 8 dílů |
| Zachování energie | 0,01 ppm (kyvadlo), 16 ppm (nosník) | 0 | |
| Útlum kmitání | odchylka pod 0,5 % | zadaný útlum | každý tlumený tvar zvlášť |
| Ustálená rezonance, chodec v rezonanci | 49,98× | 50× = 1/(2ζ) | |
| Vzpěr děleného sloupu | +0,4 % při 16 dílech | Eulerova síla | viz „Co jsem zjistil“, bod 5 |
| Vzpěr se smykem | do 2 % | Engesser | |
| Vzpěr rámu stranou | do 1 % | kh·tan(kh) = 6·I_b·h/(I_c·L_b) | |
| Tvar sloupu po vybočení | 2,63 m | 2,60 m (elastika) | velké průhyby |
| Mezní zatížení vetknutého nosníku | 95,1 a 127,2 kN/m | 95,2 a 127,3 kN/m | první klouby a zhroucení |
| Vazník zatížený do zlomu | 1 417 kN | 1 417 kN | posudek vzpěru krokve |
| Přejezd síly | součinitel 1,260, průběh do 0,33 % | 1,258 (Frýba) | tři rychlosti do 1 % |
| Přejezd odpružené hmoty | nosník do 1 %, hmota do 2 % | nezávislý výpočet | 8 vlastních tvarů, Runge–Kutta |
| Chodec jdoucí v rezonanci | do 2 % | nezávislý výpočet | tři harmonické složky kroku |
| Laděný tlumič | 5,74× a 19,90× | 5,75× a 20,00× (Den Hartog) | nosník a závaží |
| Zjemnění dělení a kroku | konverguje | | poloviční krok: rozdíl < 0,01 % |

## Regresní sada

Dvacet mostů se scénáři v `src/zkouska/regrese.ts`: trámové a příhradové mosty kloubové i svařené, lávka s chodci, útvarem v rezonanci a laděným tlumičem, dav třiceti lidí, oblouk, zavěšený most s předepnutými lany, most s pilířem, pružné uložení, konzola, řetěz (mechanismus s velkými natočeními) a tři scénáře končící zřícením.

- **Otisk** je kontrolní součet poloh, natočení, rychlostí a plastických deformací po doběhnutí. Uložené otisky jsou v `src/zkouska/regrese-otisky.json`.
- **Node a Chromium dávají stejné otisky** (test `test/e2e/otisky.e2e.ts`). Firefox a Safari ve vývojovém prostředí nejsou; ověří je stránka `/otisky.html` u zadavatele.
- **Poloviční krok** dá u pěti klidných scénářů stejné průhyby do 1 %.
- **Zrcadlový most** dá zrcadlový výsledek do 0,2 % největšího průhybu. Shoda není bitová: rovnováha, vlastní tvary a nejvyšší frekvence se hledají iteračně.
- **Čtyřicet náhodně nakreslených mostů** (většinou mechanismy, které se hned zřítí) nevyrobí neplatná čísla ani nesmyslné rychlosti.

## Rychlost

Měřeno stránkou `/mereni.html` v bezhlavém Chromiu 157 na jednom jádře procesoru Xeon 2,1 GHz. „Zkouška“ je úplný výpočet: most, kola na pneumatikách, obě tlumení a průběžné posuzování namáhání a porušení.

| Most | Styčníky | Prvků / kol | Kroků za sekundu děje | Holé jádro | Zkouška |
|---|---|---|---|---|---|
| Běžná úroveň | kloubové | 49 / 12 | 2 100 | 351× | 106× |
| Běžná úroveň | svařené | 49 / 12 | 2 450 | 181× | 58× |
| Velká úroveň | kloubové | 121 / 30 | 2 100 | 150× | 41× |
| Velká úroveň | svařené | 121 / 30 | 2 450 | 82× | 25× |
| Největší most | kloubové | 597 / 60 | 3 880 | 15,8× | 6,5× |
| Největší most | svařené | 597 / 60 | 4 200 | 9,8× | 4,1× |

Kritérium koncepce (největší most aspoň 3×, běžná úroveň aspoň 10×) je splněno. Úplná zkouška stojí dvakrát až třikrát víc než holé jádro, jak odhadoval M1a. U největšího svařeného mostu je rezerva malá; kdyby plný model vozidel nebo vlak ubraly další třetinu, přijde na řadu první záloha z koncepce (omezit nejkratší délku masivních průřezů) nebo úsporné počítání tlumení vlastních tvarů.

Příprava zkoušky (rovnováha, vlastní tvary, nejvyšší frekvence) trvá u běžné úrovně desítky milisekund, u největšího mostu 0,5 až 1,3 sekundy.

## Co jsem zjistil

### 1. Kontakt kola se nesmí vázat na natáčení styčníků

Regresní sada odhalila chybu, kterou ověřovací úlohy neviděly: v kloubové ocelové příhradě se dřevěná mostovka pod devítitunovým vozem „zlomila“ při využití 14 %. Kolo jede po ohybové čáře prvku (ne po lomené čáře mezi styčníky), a ta závisí na natočení styčníků. Tlumič pneumatiky přes ni brzdil i natáčení lehkého styčníku uprostřed pole mostovky, jehož kmitání je nejrychlejší v celém mostě, a explicitní výpočet se rozkmital.

Oprava: tuhost pneumatiky dál sleduje ohybovou čáru (kolo jede hladce), ale rychlost pro tlumič se bere ze spojnice styčníků. Tuhost kontaktu navíc vstupuje do volby kroku výpočtu. Kolo se neopírá o kus mostovky, který je víc než půl metru nad ním nebo strmější než 60°.

### 2. Tlumič se počítá implicitně

Tuhý viskózní tlumič je běžný stavební prvek, ale explicitní výpočet s ním diverguje, jakmile c·dt přesáhne dvojnásobek brzděné hmoty. Síla tlumiče se proto počítá až po všech ostatních silách z rychlosti, jakou se prvek bude prodlužovat po jejich působení. Pro běžné tlumiče je to lichoběžníkové pravidlo (přesnost druhého řádu), pro velmi tuhé přechází ve zpětný Eulerův krok, který rychlost ustálí naráz a nepřekmitává. Ustálená rychlost pod stálou silou vychází přesně F/c. Ověřeno i s tlumičem tisíckrát tužším, než je kritické tlumení.

### 3. Tlumení po porušení nebrzdí pád

Koncepce po prvním porušení předepisuje tlumení úměrné hmotě. V té podobě by ale utržený prut padal jako v oleji: mezní rychlost pádu by byla g/α, u tuhé malé konstrukce kolem 1 m/s. Tlumení se proto vztahuje k pohybu, kterým se souvislá část konstrukce smí hýbat jako tuhý celek:

- část bez podpory: posun a otáčení (volný pád, let trosek),
- část držená jedním bodem: otáčení kolem něj (zlomená polovina mostu se sklápí, prut se kývá),
- část držená víckrát: žádný; tlumí se celá rychlost.

Tlumí se tak jen deformace a kmitání. Součinitel α je shora omezen na 0,25 s⁻¹; most, který porušení přežil, má na 3 Hz útlum kolem 0,7 %.

### 4. Nejdelší krok je jedna milisekunda

Měkká soustava (závaží na pružině, lehká lávka) by podle meze stability směla mít krok i desítky milisekund, ale výpočet by pak špatně vystihl děje, na kterých záleží. S tisícem kroků za sekundu je chyba frekvence kmitání 20 Hz pod 0,1 %.

### 5. Vzpěr: prvek sám se pod tlakem neohýbá

Vybočení se v jádře děje ve styčnících, ne uvnitř prvku. Kritická síla proto vychází o (π/n)²/12 vyšší, kde n je počet prvků na půlvlnu vybočení: 5 % při čtyřech dílech, 1,3 % při osmi, 0,4 % při šestnácti. Vztah je v testech ověřen na tři platné číslice.

Pro hru to znamená:

- Vzpěr jednotlivého prutu hlídá posudek (tlak plus Eulerova síla na celou délku prutu), který zasáhne vždy dřív, než by prut vybočil sám.
- Vybočení konstrukce jako celku (rám stranou, oblouk, horní pás přes několik polí) řeší jádro samo a jeho přesnost závisí na počtu prvků v půlvlně: rám se šesti prvky na sloup vyšel do 1 %.
- Kdyby to někdy nestačilo, jde do prvku doplnit člen, který vliv osové síly na ohyb uvnitř prvku zahrne (chyba pak klesá se čtvrtou mocninou). Zasáhlo by to do plasticity i zatížení mezi styčníky, proto jsem to nechal jako možné zpřesnění.

### 6. Geometrická nelinearita je v číslech vidět

Jádro počítá rovnováhu na deformované konstrukci. V ověřování se to projevilo dvakrát: lehký nosník rozkmitaný chodcem na 22 cm odpovídá o 1,6 % méně než lineární teorie, a vazník pod lisem si sedne o půl procenta výšky, takže krokve nesou o 0,4 % víc. V obou případech má pravdu jádro; zkušebna proto píše rovnováhu vazníku pro sklon krokve těsně před zlomem.

### 7. Povolené lano a krok výpočtu

Povolené lano žádnou tuhost nemá, ale během zkoušky se může napnout. Krok výpočtu s tím počítá předem: k nejvyšší frekvenci soustavy se přičte horní odhad toho, co by přidala napnutá lana. Jinak by se výpočet po napnutí lana rozkmital.

### 8. Útlum tvarů mostu z více materiálů

Každý z prvních deseti vlastních tvarů dostane útlum vážený podle toho, kolik deformační energie v něm nesou prvky z kterého materiálu (ocel 0,5 %, beton 1 %, dřevo 1,5 %). Tlumení úměrné tuhosti, které potlačuje numerické zvonění nejvyšších frekvencí, se od zadaného útlumu odečítá, aby měl tvar dohromady přesně tolik, kolik má mít.

### 9. Co zaručuje bitovou shodu mezi prohlížeči

Jádro, katalog i stavba mostu z návrhu používají jen sčítání, násobení, dělení a odmocninu. Goniometrické funkce, `Math.hypot` ani operátor mocniny tu být nesmějí: norma jim nepředepisuje přesné zaokrouhlení. Fáze kroku chodce se otáčí racionálním vzorcem, vyšší harmonické se počítají z první algebraicky, náhodné fáze davu vznikají bez goniometrie.

## Skryté dělení prutů

Prut se dělí podle toho, kolik jeho vlastních ohybových tvarů leží v pásmu do 30 Hz (kroky lidí, houpání vozidel, poskakování náprav): dva díly na každý tvar, díl nikdy kratší než metr. Lana se dělí po dvou metrech, aby měla průvěs a mohla kmitat.

| Prut | První ohybová frekvence | Dílů |
|---|---|---|
| Ocel 2× HEB 200, 4 m | 43 Hz | 1 |
| Ocel 2× HEB 200, 6 m | 19 Hz | 2 |
| Ocel 2× HEB 200, 12 m | 4,8 Hz | 4 |
| Dřevo 2× 140 × 280, 5,7 m | 21 Hz | 2 |
| Dřevěná mostovka, pole 4 m | 14 Hz | 2 |

## Co hotové není

- **Zkouška úrovně s jízdním řádem** (vozidla s karoserií a nápravami, hodnocení průjezdu, komfort) přijde s první hratelnou verzí v M2. Jádro pro ni má stavební kameny: jedoucí sílu, styčník na pružině s tlumičem a budicí sílu kroku.
- **Trosky nekolidují s terénem**; po zřícení padají mimo výkres. Přijde v M2.
- **Hlídání bilance energie** z koncepce zatím nahrazuje jednodušší pojistka: výpočet se zastaví, když se objeví neplatné číslo nebo rychlost přes 2 000 m/s.
- **Výchozí poloha povolených lan** (visutý most) se zatím nehledá ustálením v čase; předepnutá lana fungují. Přijde s lany ve hře v M4b.
- **Píst** jádro neumí (M6).
- **Hodnoty materiálů a průřezů** jsou zčásti jen z paměti; stav ověření je v hlavičce `src/data/katalog.ts`. Prvky s předběžnými hodnotami (ocelobetonová mostovka, kolejiště, lano, pilíř) kontrola návrhu zatím odmítá.
