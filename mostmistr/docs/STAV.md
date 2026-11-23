# Mostmistr — stav vývoje

Poslední aktualizace: 23. 11. 2026

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
| M5 Železnice | Hotovo, po třech nezávislých recenzích sloučeno do `main` (23. 11. 2026) |
| M6 Pohyblivé mosty | Hotovo, po třech nezávislých recenzích sloučeno do `main` (23. 11. 2026) |
| M7 Režimy | Hotovo, po třech nezávislých recenzích sloučeno do `main` (23. 11. 2026) |
| M8 Doladění | Hotovo, po třech nezávislých recenzích sloučeno do `main` (23. 11. 2026) |
| M9 Zvuk načisto (ElevenLabs) | **Nedělá se.** Zadavatel 23. 11. 2026 rozhodl nechat zvuky, jak jsou (ze syntezátoru) |
| M10 Pád a výsledek | Hotovo, po třech nezávislých recenzích sloučeno do `main` (23. 11. 2026) |
| M11 Kmitání a nápověda | Další na řadě |
| M12 Obtížnost a medaile | Čeká |
| M13 Sdílení mostu | Čeká |
| M14 Finále kampaně | Čeká |
| M15 Dílna a Havarijní komise | Čeká |
| M16 Žebříčky a denní rozbor | Čeká; potřebuje od zadavatele heslo správce v Netlify a povolený přístup k webu hry |

## Kde práce stojí (23. 11. 2026)

- **M5** a **M6** jsou sloučené do `main` (pull requesty 13 a 14).
- **M7 Režimy** je hotový a po třech nezávislých recenzích sloučený do `main` (viz „M7 — výsledek“ a „Nezávislé recenze M7“).
- **M8 Doladění** je hotový a po třech nezávislých recenzích sloučený do `main` (viz „M8 — výsledek“ a „Nezávislé recenze M8“).
- **M9** (zvuky načisto pomocí ElevenLabs) se nedělá: zadavatel 23. 11. 2026 rozhodl nechat zvuky ze syntezátoru, jak jsou.
- **Nezávislá recenze hry** (23. 11. 2026, výtah v `docs/RECENZE.md`) dala hře 7 z 10 a dvacet doporučení. Zadavatel je nechal zařadit všechna a přidal dvě vlastní zadání; z toho jsou **milníky M10 až M16** (koncepce, kap. 12).
- **M10 Pád a výsledek** je hotový (viz „M10 — výsledek“). Pokračuje se M11.

## M10 — výsledek

Pád a výsledek: první milník po nezávislé recenzi hry (návrhy 1, 2, 5, 12 a 16 z `docs/RECENZE.md`) a přání zadavatele mít při pádu „bullet time“ s přiblížením. Verze hry 0.15.0; fyzika se nezměnila (verze 8, otisky regresní sady stejné).

**Zpomalený záběr na první poruchu** (`src/hra/rezie.ts`, `src/vykres/zaber.ts`).

- Zkouška je spočítaná dřív, než ji hráč vidí, takže přehrávání předem ví, kdy a kde most poprvé povolí. Třetinu sekundy před tím se čas plynule zpomalí na desetinu a pohled najede na to místo (nejvýš čtyřnásobné přiblížení; dlouhý prut se nepřibližuje natěsno, ať je vidět i mostovka) a sleduje ho, jak padá; po zlomu se nejdřív vrátí čas, pak pohled. Celý záběr trvá asi pět sekund skutečného času.
- V záběru okolí ztmavne, místo je v zaměřovacím kroužku, povolený prut je čárkovaně vidět i přes vozidla a popisek říká, co se stalo („První porušení · prut 5 · vzpěr · 100 %“). Nad výkresem je věta bez čísel, zato s radou („…Byl stlačený a vybočil do strany… Zkrať ho dalším styčníkem, dej silnější prvek, nebo udělej příhradu vyšší“).
- Záběr patří první poruše: porušení prutu, sjetí z posuvné podpory, nárazu lodi do prutu, pádu někoho z mostu, kterému nic neprasklo, a u mostu, který se skládá vlastní vahou, místu, kde se propadá. Pokusy (brnknutí, budič) záběr nemají, zkouška do zlomu ano.
- Hráči nic nevnucuje: tlačítko na časové ose („Zpomalení: zap/vyp“) ho vypne a volba se pamatuje, a co povolilo, řekne věta nad výkresem i tak; Esc nebo kliknutí ho přeskočí (další Esc se teprve vrací ke stavbě); kdo skočí po časové ose, krokuje nebo dá Na konec, záběr nedostane; kdo během záběru pohne pohledem, toho záběr dál nevede. Stejné porušení podruhé za sebou dostane jen krátký záběr (poloviční časy, zpomalení na čtvrtinu). Při omezených animacích v systému se zpomalí jen čas.
- Zvolená rychlost přehrávání se nemění. Při pomalém přehrávání (¼×, ⅒×) se časy záběru úměrně zkrátí, při rychlém ho snímek nepřeskočí. Tlačítko ve výsledku přehraje porušení znovu, i když je záběr vypnutý.
- Efekty pádu (`src/zkouska/efekty.ts`, `src/vykres/efekty.ts`): trosky v místě zlomu, šplouchnutí toho, co dopadlo do vody (i auta), a lidé se při pádu převrátí, místo aby stáli vzpřímeně na dně. Všechno se počítá z času děje a ze záznamu, takže krokování i přehrání dávají totéž.

**Kontrola stability při stavbě a věta o složení** (`src/zkouska/slozeni.ts`).

- Most bez klidové polohy dostal dřív vždy stejnou větu („nemá pod vlastní tíhou klidovou polohu…“). Teď hra určí, jestli se opravdu složí, kde a proč: nechá most sekundu děje padat a měří, o kolik klesly styčníky mostovky. Složení je propad o metr (nebo o 15 cm, když mezitím něco povolilo nebo sjelo z podpory); místo je styčník mostovky, který klesl nejvíc. Tři důvody: styčník mostovky nic nedrží; zlomí se tu jako v kloubu, chybí trojúhelník; most není ukotvený na obou březích.
- „Nemá klidovou polohu“ ještě není pád: řetěz mostovky mezi dvěma pevnými podporami (7-02, 7-04) se prověsí o pár decimetrů a drží, most na dvou posuvných ložiskách (3-04) sjede až pod provozem a volně visící prut se jen rozkýve. O těch hra neříká, že se složí; volný prut označí poznámkou „Tenhle prut nic nedrží“ a ve výsledku ho zmíní i u mostu, který prošel.
- **Při stavbě:** rozbor v pomocném vlákně teď běží v každé úrovni (dřív jen s osou frekvencí nebo lany) a jakmile mostovka vede od břehu k břehu, výkres označí místo čárkovaným kroužkem s popiskem „Tady se most složí“ a důvodem. Dokud mostovka nevede přes celé údolí, značka není: hráč teprve staví.
- **Ve výsledku:** věta říká, co nedrží, a radí, co s tím; radí jen to, co úroveň dovoluje (vzpěra a zavěšení vždy, svar, lano a pilíř jen tam, kde jsou). Věta o prvním porušení se u složeného mostu neukazuje: sjetí z podpory nebo zlom prutu je tam následek.
- Most, kterému se pod vlastní tíhou hned vzepře nebo rozdrtí prut (3-02 „dvanáctimetrový horní pás“, 3-04 „příhrada bez pilíře“), se neskládá: do první poruchy se pohne o milimetry a příčinu řekne věta o prvním porušení. Ze 38 referenčních mostů kampaně bez klidové polohy hra hlásí složení u 34; zbylé čtyři jsou právě 3-02, 3-04, 7-02 a 7-04.

**Výsledek zkoušky** (`index.html`, `src/styly.css`, `ukazVysledek` v `src/hra/uroven.ts`).

- Výsledek je pruh nahoře přes šířku výkresu: verdikt, jedna věta (po prohře i příčina: „Jako první povolil prut 5 (označený na výkresu): vzpěr.“ nebo „Složil se vlastní vahou: styčník mostovky nic nedrží.“), tři medaile s názvy a hlavní tlačítka. Po výhře je hlavní Další úroveň, po prohře Upravit most. Dřív okno zakrývalo pravou polovinu mostu a výhra s prohrou se lišily jen nadpisem.
- Do rohu výkresu nad popisové pole padne razítko **SCHVÁLENO** (zelené) nebo **ZAMÍTNUTO** (červené) s číslem listu a datem; nad koncem mostu zprůhlední. Pokusy razítko nemají.
- Když most neprojde kvůli poruše, pruh přijde dvě sekundy děje po ní (po doběhnutí záběru), ne až na konci časové osy: u referenčních pádů to dřív znamenalo čekat 10 až 38 sekund nad troskami. Zkoušky bez poruchy (kmitání, loď, most, který se nezvedl) a ty, které projdou, ukazují výsledek na konci.
- Čísla (cena, využití, kmitání, porušení), podmínky medailí, výzvy, celá věta o prvním porušení s čísly a radou a tlačítka Nahlásit chybu a Napiš nám jsou v podrobnostech na tlačítko. Na telefonu se podrobnosti při návratu v čase zavřou, v širokém okně zůstávají.
- Po návratu ke stavbě zůstane na výkresu značka „Tady to povolilo první“ s číslem prutu a způsobem, dokud hráč most nezmění.
- Analytický panel a hlášení nad výkresem, které leží taky nahoře, se pod pruh posunou.

**Úklid vývojářských položek** (návrh 5).

- Zkušebna není v liště přehledu, ale jako odkaz „Zkušebna výpočtu“ v patičce. „Diagnostika“ se jmenuje „Nahlásit chybu“ a je v podrobnostech výsledku.
- Otisk zkoušky ve výsledku, verze fyziky v popisovém poli a otisk sestavení u verze (v popisovém poli i v patičce přehledu) nejsou vidět: jsou v hlášení chyby a v bublině; v popisovém poli je místo verze fyziky počet prutů. Zaškrtávátko „Odemknout všechny úrovně“ se ukáže jen s `?vyvoj=1` v adrese, nebo když už je zapnuté.
- Oznámení o záznamu hraní je v přehledu až pod řádkem s postupem a je drobnější; v paletě úrovně je pod nástroji, ne nad nimi.

**Drobné chyby z recenze** (návrh 12) a z hraní.

- Po načtení mostu z okna Import má pozornost výkres: mezerník spustí zkoušku (dřív znovu otevřel Import). Chyba importu už neukazuje vnitřní „navrh:“.
- Zkouška do zlomu se počítá do výzvy i po návratu do úrovně: hra si pamatuje otisky několika posledních mostů, které úrovní prošly, s verzí fyziky a s otiskem úrovně (po přeladění úrovně starý průchod neplatí).
- Rozdíl proti minulému pokusu se počítá ze zobrazených hodnot: 43 % → 44 % je „+1 %“ (dřív „+2 %“ ze zaokrouhlení přesného rozdílu).
- Dlouhý tah mostovky nebo pilíře se dělí na co nejmíň dílů: 5 m čtyřmetrové mostovky jsou díly 3 + 2 m (dřív pět metrových), 7 m jsou 4 + 3 m.
- Kde na trase chybí mostovka, řekne hra hned při spuštění zkoušky („Na trase od 4 m do 8 m chybí mostovka…“), ne až ve výsledku.
- „Přešli všichni“ u samých chodců, „Přejeli všichni“ u samých vozidel. První porušení se všude jmenuje stejně („povolil“).

**Ověření:** 1 140 testů jednotek a 249 testů v prohlížeči (Chromium), obojí po zapracování recenzí. Firefox, Safari a skutečný telefon se dál nezkoušely.

### Nezávislé recenze M10 (23. 11. 2026)

Tři čerství recenzenti bez znalosti mých závěrů: recenze kódu, hraní očima nováčka v prohlížeči (stovka zkoušek v 15 úrovních, okno, telefon, angličtina) a nezávislá kontrola posudku stability (vlastní kinematický výpočet, 107 umělých mostů a všechny referenční).

**Zapracováno z kontroly výpočtu**

- **Hra říkala „most se složí“ i o mostech, které stojí.** První verze brala za složení každý most, kterému zkouška nenašla klidovou polohu a který byl mechanismus při nepatrném zatížení: tedy i most s volným prutem (pak dostal SCHVÁLENO), tažený pás ze dvou kusů v přímce, řetěz mostovky mezi pevnými podporami (referenční pády 7-02 a 7-04 „jen mostovka“) a příhradu na dvou posuvných ložiskách (3-04). Pravidlo je přepsané na skutečný propad mostovky (viz výše); `jeMechanismus` zmizel i s prahem, který u lan nedával smysl, a s výpočtem v hlavním vlákně.
- **Místo:** značka patřila styčníku, který se nejvíc hýbal, takže u napůl postavených krokví mířila na vrchol hotového trojúhelníku místo na styčník mostovky, který se propadl. Teď je to vždy styčník mostovky s největším poklesem.
- **Důvod „drží jen jedna podpora“** vyšel i u mostu se závažím na podpoře (stavba značí takový styčník jinak): podpory se počítají z kotev úrovně.
- **Věty:** „neunesl ani vlastní váhu“ a „ještě pod vlastní vahou“ jen při poruše v první půlsekundě; věta o chybějícím trojúhelníku už nemluví o čtyřúhelníku, který tam být nemusí; rada nezmiňuje trámy v ocelových úrovních a nabízí svar, lano a pilíř tam, kde je úroveň má.
- Test `test/slozeni.test.ts` už nepravdu nevyžaduje (dřív chtěl u 7-02 a 7-04 složení) a nemá podmíněné kontroly.

**Zapracováno z recenze kódu**

- Návrat ke stavbě během záběru nechával pohled přiblížený (zkouška se zahodila dřív, než se záběr zrušil).
- Hlášení nad výkresem leželo celé pod pruhem výsledku; na telefonu pod ním ležel i začátek analytického panelu; posun se nepřepočítal po změně šířky okna.
- Tlačítko „Přehrát porušení“ u brnknutí nic nepřehrálo a posunulo čas na nulu: u pokusů se nenabízí a čas se mění, až když je co přehrát. Brnknutí do mostu, který se složí, to v pruhu řekne.
- Skok v čase z podrobností výsledku je zavíral, takže seznam porušení nešel proklikat (v širokém okně teď zůstávají).
- Změna pohledu před začátkem záběru vypínala přiblížení jen někdy; změna velikosti okna během záběru vracela starý pohled.
- Při ⅒× trval záběr čtvrt minuty a při 4× ho mohl snímek přeskočit.
- Po neúspěchu v už projité úrovni nebylo hlavní žádné tlačítko; razítko překrývalo konec mostu (4-03, 7-04).
- `zobrazenyRozdil` hádal krok zaokrouhlení a na hranici se spletl (0 % → 60 % vyšlo „+59 %“): krok se předává.
- Otisk prošlého mostu nenesl podobu úrovně; důvod složení chyběl v deníku hraní; `tsconfig.jadro.json` nehlídal nové moduly bez prohlížeče.
- Testy, které nemohly selhat: vypnutý záběr se kontroloval dřív, než k porušení došlo; „kdo si čas posouvá sám“ zkoušel jen Na konec; brnknutí s porušením nezkoušel nikdo.

**Zapracováno z hraní**

- Věta o přetížení byla žargon bez rady („vzpěr, tlak 81,7 kN při únosnosti 92,2 kN; s ostatním namáháním dohromady 100 %“): nad výkresem je teď krátká věta s radou podle způsobu porušení, čísla zůstala v podrobnostech.
- Čísla prutů na výkresu nejsou: prut, o kterém pruh mluví, je označený, a po návratu ke stavbě zůstane značka, kde to povolilo první.
- Verdikt přicházel až na konci časové osy (10 až 38 s po pádu).
- Záběr byl napotřetí otravný a vypínač se jmenoval jako akce („Zpomalit pád“); s vypnutým záběrem zmizela i věta o příčině; na telefonu stálo „Esc nebo kliknutí“ a popisek přetekl okraj.
- Kroužek záběru zůstával stát a most pod ním odpadl; u dlouhého pilíře byl výřez tak těsný, že nebyla vidět mostovka; auto zakrývalo praskající prut.
- Pády bez prasklého prutu neměly záběr ani větu (teď záběr na první pád a věta o mezeře hned při spuštění).
- Pruh u nárazu lodi odkazoval na řádek schovaný v podrobnostech; věta o prvním porušení byla v podrobnostech až dole; po nárazu lodi chybělo tlačítko přehrání.

**Nezapracováno a proč**

- **Kmitání bez dramatu** (2-02, 5-02: všichni přejdou, verdikt „rozkmital se“ přijde až na konci a číslo je v podrobnostech) a **zvětšený pohyb při zkoušce**: patří do M11 (sjednocení nástrojů kmitání).
- **Příčiny v kapitole 7** (věta „buď píst přetlačil, nebo ho nic nedrží“ místo „pravé křídlo nemá píst“ nebo „nesvařený styčník“; křídlo se složí při zvedání a záběr přijde až na náraz lodi): chce posudek pohyblivého mostu, který zatím není; do M12 s přeladěním úrovní.
- **Co hra ví před zkouškou a neřekne** (nedopnutá lana s mostovkou 0,8 m pod výkresem; visutý most bez závěsu, kterému ustálení najde „klid“ s průvěsem 2,7 m): do M11 k nápovědě při stavbě.
- **Kývání volného prutu se počítá do kmitání mostovky** (most s volným prutem pak neprojde pro „kmitání 7,7 m/s²“): je to pravdivý otřes mostovky od prutu, který do ní škube; měnit hodnocení by byla změna fyziky. Hra teď aspoň řekne, který prut to je.
- **Výkon záběru bez grafické karty** (plátno 3840 × 2160 v bezhlavém prohlížeči: 30 až 50 ms na snímek kvůli přechodu přes celé plátno a spodní vrstvě kreslené při pohybu pohledu): na 1280 × 720 pokles není a s grafickou kartou je výplň levná. Zkoušel jsem ztmavení prvkem stránky, ale ztmavilo by i popisek záběru; nechávám, dokud se neukáže na skutečném zařízení.
- **Obálka a „největší využití“ po pádu** počítají i s tím, co se dělo, když už most padal (šest červených prutů po návratu ke stavbě): značka prvního porušení říká, který byl první; zbytek do M11 (čitelnost).
- **Vypínač záběru při stavbě:** je jen na časové ose; popisek záběru teď říká, kde se vypíná.
- **Slovník pojmů** („vzpěr“, „plastický kloub“, „plavební profil“), **dlouhá zadání**, **„stupně výzev 0 z 252“** v přehledu, **oznámení o záznamu** jako první text hry, **Export/Import jako JSON** v paletě: M12 a M13.
- **Oříznutý název úrovně a jízdní řád**, **„inž.“ písmem 9 px**: M11 (čitelnost).

## M8 — výsledek

Doladění: angličtina, dotykové ovládání a telefon, plynulost přehrávání, drobnosti odložené z recenzí M5 až M7 a oprava fyziky z kontroly výpočtů M7. Verze hry 0.14.0, verze fyziky 8, formát uloženého postupu 3.

**Angličtina** (`src/ui/slovnik-en.ts`, `src/ui/jazyk.ts`, `src/ui/formaty.ts`).

- Druhý slovník se stejnými klíči (866 textů) a anglické názvy všech úrovní; test hlídá, že žádný klíč nechybí, že texty doplňují stejné hodnoty a že v angličtině nezůstala česká věta.
- Jazyk se bere z adresy (`?jazyk=en`), z uložené volby, jinak z jazyka prohlížeče (čeština a slovenština česky, ostatní anglicky). Přepínač je v liště přehledu; přepnutí stránku načte znovu.
- Čísla, částky, procenta a data se píšou podle jazyka (anglicky desetinná tečka, čárka mezi tisíci, „23 Nov 2026“). Měna zůstává Kč.
- `test/e2e/jazyk.e2e.ts` projde v angličtině přehled, zadání, stavbu, nápovědu, výsledek úspěšné i neúspěšné zkoušky, analýzu, pohyblivý most se zkouškou do zlomu, zkušebnu a pískoviště a hledá viditelný text s českým písmenem.

**Dotyk a úzké okno** (`src/vykres/ovladani.ts`, konec `src/styly.css`).

- Jeden prst kreslí a vybírá jako levé tlačítko, dva prsty výkres posouvají a zvětšují; druhý prst rozdělaný tah zruší a zbylý prst po gestu nic nekreslí. Stisk prstu se ohlásí až po 140 ms nebo po pohybu o 8 px, aby první prst gesta nic nenakreslil ani nespustil.
- Do 1100 px šířky lišta úrovně nemá název hry a ovládání přehrávání se láme (dřív táhlo času uteklo za okraj), do 900 px mizí pruh rozpočtu a tlačítka zoomu, do 700 px (telefon na výšku) se obrazovka skládá pod sebe: výkres, časová osa a paleta dole ve dvou sloupcích; při zkoušce paleta ustoupí. Na dotykových zařízeních mají tlačítka větší plochu.
- `test/e2e/dotyk.e2e.ts` posílá prohlížeči skutečné dotyky (ladicí protokol): kreslení prstem, zvětšení a posun dvěma prsty, zrušení tahu, ťuknutí, telefon 390 × 844 a okno 1000 × 700 (nic nepřetéká, tlačítka a táhlo času jsou v okně).

**Plynulost** (kritérium milníku: největší úroveň drží 60 snímků za sekundu).

- Skript hry potřebuje na snímek při přehrávání 1 až 2 ms (95. percentil pod 4 ms) i na největším mostě kampaně (5-01, 93 prutů) a v největším davu (5-04).
- Spodní vrstva výkresu (rastr, voda, terén se šrafami, zóny) se při přehrávání kreslí jednou a pak jen přenáší (`UlozenaVrstva`). V kontejneru bez grafické karty to na plátně 3840 × 2160 zvedlo přehrávání z 15 na 60 snímků za sekundu; na 1280 × 720 zmizely občasné dlouhé snímky.
- `test/e2e/snimky.e2e.ts` to měří (čísla ukládá do `snimky.json`) a hlídá, že uložená vrstva vypadá na pixel stejně jako kreslená přímo.

**Odložené drobnosti z recenzí**

- Pohyblivé mosty: pevné kotvy mají popisek podle úlohy („čep křídla“, „kotva pro píst“).
- Časová osa: ukazatel u značky ukáže bublinu s časem a popisem (výjezd, porušení prutu, pád, zvedání mostu, loď).
- Zadání: medaile jsou nahoře v pravém sloupci (byly pod okrajem okna).
- Chyba importu mostu v angličtině říká jen, že text není most (věty kontroly dat jsou jen česky); most z novější verze hry má vlastní větu v obou jazycích.
- Stránka správce nakreslí i most z pískoviště: údolí odhadne z mostu (rozpětí podle mostovky, hloubka podle nejnižšího styčníku), protože nastavení hráče deník nenese; odkaz vede do pískoviště.

**Fyzika (verze 8)**, podle nezávislé kontroly výpočtů M7:

- Plastický moment tlačeného průřezu se krátí únosností v tlaku (dřív v tahu, takže tlačená ocelobetonová mostovka byla v ohybu slabší než tažená, opak toho, co hra učí).
- Vzpěrná délka se bere přes řetěz prutů v přímce spojených svarem, mezi místy, kde ho něco opravdu drží proti vybočení (dřív stačil svar uprostřed tlačeného prutu a jeho únosnost byla až dvojnásobná). Co řetěz drží a co ne, je v „Nezávislé recenze M8“.
- Zkouška do zlomu čeká se zátěží, dokud se otevírá plastický kloub: ocelobetonové pole 6 m dává 451,6 až 451,7 kN/m při zatěžování 4× až 64× rychlejším i pomalejším (ručně 451,8). Zkoušku ukončují hodiny zátěže, ne čas děje.
- Referenční mosty, mosty, které mají spadnout, i ukázky dopadají v běžných zkouškách stejně (vyhratelnost beze změny); změnily se únosnosti při zkoušce do zlomu (`npm run vyzvy`).

**Ověření:** 1 082 testů jednotek a 221 testů v prohlížeči (Chromium), obojí po zapracování recenzí. Firefox a Safari se dál nezkoušely; skutečný telefon taky ne (jen emulace mobilního zobrazení v Chromiu).

### Nezávislé recenze M8 (23. 11. 2026)

Tři čerství agenti bez znalosti mých závěrů: recenze kódu, hraní v angličtině a na emulovaném telefonu a tabletu (372 snímků) a nezávislá kontrola fyziky (vlastní rovinný řešič v Pythonu s velkými posuny a plastickými klouby). Kontrola fyziky potvrdila opravu plastického momentu: 20 případů (prosté, vetknuté a spojité nosníky, rámy, věšadla, vzpínadla) sedí na její výpočet do 2 %, většina do 0,3 %; všech 84 referenčních mostů má v běžné zkoušce otisk bitově stejný jako před M8 a všech 28 hodnot v `zlomy.json` přeměřila se shodou.

**Zapracováno**

- *Vzpěrná délka šla obejít* (fyzika, vysoká závažnost; recenze kódu totéž). Řetěz prutů ukončil jakýkoli třetí prut ve styčníku: metrový pahýl do vzduchu, tlumič nebo jedno lano zvedly únosnost sloupu o 45 až 123 %. Teď styčník řetězu drží jen podpora, která brání pohybu napříč, nosník, od jehož druhého konce se po nosnících dojde k podpoře mimo řetěz nebo k oběma koncům řetězu (vzpěra, diagonála, sloupek vzpínadla), a lana jen tehdy, když táhnou na obě strany. Pahýl (i dvojitý), tlumič, pružina, píst, jediné lano a trojúhelník přistavěný jen k řetězu ho nedrží. Referenční mosty se nezměnily (vyhratelnost i `zlomy.json` stejné), změnil se jeden otisk mostu, který má spadnout.
- *Zkouška do zlomu končila podle času děje* (fyzika, střední; recenze kódu totéž). Hodiny zátěže po zplastizování většinu času stojí, a tak silný tvárný most skončil v 60. sekundě děje jako „vydržel“ s menší zátěží, než unese. Teď zkoušku ukončují hodiny zátěže; čas děje má jen pojistku 180 s a výsledek pak poctivě říká, že most nepovolil, ale zkouška na něj nenaložila všechno. Test: ocelobetonové pole, kterému zátěž doroste k mezi těsně před koncem, se zlomí v 61. sekundě děje při statické mezi.
- *Rezerva mistrovského mostu 4-04* klesla prodloužením vzpěrné délky pylonu na 0,8 %: limit medaile je 57 % místo 56 % (mistrovský most 55,6 %, most pro průchod 57,9 %).
- *Telefon na výšku* (hraní, tři chyby, které hráče zastavily). Popis osy frekvencí roztáhl stránku na 535 až 615 px: okno zadání ujelo mimo obrazovku a stránka šla odtáhnout prstem. Teď se jízdní řád a osa frekvencí vejdou (do 1100 px na vlastních řádcích), `.hra` má pojistku proti přetečení a stažení prstů mimo výkres nezvětší stránku. Výkresu zbývalo 191 px výšky, teď 345 px: lišta má dva řádky, nadpisy osy na telefonu nejsou, analýza začíná zavřená. Zpět a Smazat jsou i v liště, cíle pro prst mají 44 px, návod na první úrovni mluví o prstech.
- *Výsledek zakrýval most i analýzu*: jde sbalit do řádku s verdiktem. Na telefonu se sbalí sám, když se hráč vrátí v čase nebo ťukne na odkaz ve výsledku, a všude tam, kde by ležel přes právě otevřený analytický panel; na konci děje se rozbalí. V širokém okně při posunu v čase zůstává (jeho tlačítka mají být po ruce).
- *Panel zámku zakrýval panel svaru* (oba se lepily na stejné místo): nastavení drží u spodku palety jeden společný obal.
- *Bublina časové osy*: stejné řádky se slučují, pády řad davu se sčítají („z mostu padá 12 lidí“), výjezdy se píšou jako v jízdním řádu („vyráží: útvar 24 lidí“), most bez pístu nehlásí zvedání, text se zalamuje a drží v okně, pojem je stejný jako ve výsledku (posuvná podpora). Ukáže se i nad čárkami výjezdů a po ťuknutí prstem (zůstane 3 s).
- *Dotyk*: nástroj, který stiskem hned jedná (svar, zámek, závaží, budič, výběr prutu při zkoušce), čeká na zvednutí prstu; druhý prst položený po prodlevě už nic nepřepne (test s 320 ms).
- *Angličtina*: chyba importu bez české cesty, titulek zkušebny, odkazy na české stránky označené „(Czech only)“, procenta bez mezery i v legendě, tisíce oddělené i v číslech s desetinnými místy, `<noscript>` v obou jazycích, 30 formulací podle tabulky testera (například „Edit bridge“ všude stejně, „cylinder“ místo „piston“, „gold at 31,100 Kč or less“). Česky „Na druhý břeh se dostalo 0 z 3“ místo „Přejelo 0 z 3“ u chodců.
- *Jazyk bez paměti prohlížeče* nešel přepnout: volbu teď nese adresa a odkazy ji předávají dál. Deník hraní zapisuje jazyk hry („en/de-DE“) a přepnutí jazyka.
- *Rekord únosnosti na korunu přežil změnu fyziky* (prahy se přeměřily, rekord ne): formát uložení 3 si u rekordu pamatuje verzi fyziky a rekord změřený jinou verzí neplatí; hráč se to dozví u výzvy.
- *Drobnosti*: popisky „mělká/hluboká kotva pro píst“, jednotky v nadpisech grafů malými písmeny, plný text položky jízdního řádu v bublině a posun řádu kolečkem, tlačítko Přehrát/Pauza drží šířku, dvojice tlačítek v úzké paletě nepřetékají, uložená vrstva výkresu má v klíči hustotu pixelů a po zkoušce se uvolní.

**Nezapracováno, a proč**

- *Posudek ukazuje u tlačeného tvárného prutu přes 100 % dřív, než vznikne kloub* (fyzika, nízká): posudek násobí moment, který už druhý řád obsahuje. Je to na bezpečné straně a únosnost je správně (rozhoduje kloub); změna posudku by pohnula využitím všech ocelových mostů a limity mistrovských medailí by se musely ladit znovu. Zapsáno jako známá nepřesnost zobrazení.
- *Imperfekce tlačených prutů a kritická síla z vlastního čísla celé konstrukce* (fyzika, doporučení): pravidlo vzpěrné délky zůstává pravidlem podle grafu. Trojúhelník přistavěný k půlce sloupu se nepočítá vůbec, ačkoli sloup ve skutečnosti asi o dvě třetiny zpevní; je to opatrná strana.
- *Rezervy 6-03* (průchod 98,5 %, rozpočet 98,7 % využití): mosty procházejí a výpočet je bitově opakovatelný; přestavba referenčních mostů kvůli rezervě se nedělala.
- *Zkouška do zlomu trvá u tvárných mostů až dvakrát déle* (6-04: 18 → 34 s): zrychlené přehrávání úseku se stojícími hodinami se nedělalo.
- *Číslo se v zadání může odtrhnout od jednotky* („nejvýš 1,6 / m/s²“): v paletě opraveno, v textech zadání ne; nezlomitelné mezery ve všech větách by změnily asi 200 očekávání v testech.
- *Tři různé „rozpočty“ v zadání, pořadí oddílů zadání, drobné popisky při velkém oddálení na telefonu* (hraní): ponecháno.
- *Skutečný telefon a tablet, Firefox, Safari*: nezkoušeno, jen emulace v Chromiu.

## M7 — výsledek

Herní režimy: výzvy o efektivitu se zkouškou do zlomu, sandbox, nápověda a dokončení kampaně. Verze hry 0.13.0, verze fyziky 7 (výsledky dosavadních zkoušek se nemění), formát uloženého postupu 2.

**Zkouška do zlomu** (`src/zkouska/zlom.ts`, `VstupZkousky.zlom`). Místo provozu se na mostovku všech tras rovnoměrně přikládá zátěž, dokud se neporuší první prut, most nesjede z podpory nebo nepovolí píst; pak děj tři sekundy dobíhá.

- Zatížení roste s třetí mocninou času (20 N/m za s³): po 10 s leží na metru mostovky 20 kN, po 20 s 160 kN, po 30 s 540 kN. Stejná zkouška tak změří dřevěnou lávku i železniční viadukt; referenční mosty kampaně se lámou mezi 5. a 27. sekundou. Po 60 s zátěž neroste (most „unesl všechno“).
- Zátěž jsou stejné síly po půl metru na mostovce (stejná cesta jako kola a chodci), takže ohyb mostovky mezi styčníky se počítá.
- Výsledek (`VysledekZkousky.zlom`): zatížení na metr, celková síla, okamžik a prut, který povolil první. Medaile se neudělují; most nad rozpočet zkoušku nedostane.
- Zkoušku dostane jen most, jehož mostovka vede od břehu k břehu (jinak by zátěž neměla na čem ležet), a do výzvy se počítá jen mostu, který před tím prošel běžnou zkouškou.
- Ověřeno proti ručnímu výpočtu (`test/zlom.test.ts`): prosté dřevěné pole 4 m se zlomí při 8·M/L² s odchylkou 0,2 %; u křehkého porušení výsledek nezávisí na rychlosti zatěžování (do 3 % při 4× až 16× rychlejším zatěžování), u tvárného o pár procent ano (viz recenze níže); dvakrát širší mostovka unese dvakrát víc.

**Výzvy o efektivitu** (`src/data/vyzvy.ts`, `urovne/vyzvy.ts`, `src/hra/vyzvy.ts`). Na každé úrovni kampaně tři výzvy s prahy bronz, stříbro, zlato:

- *Nejlevnější most* a *nejlehčí most* se měří při každé zkoušce, která projde (není na to zvláštní režim); rekord úrovně si je pamatuje.
- *Únosnost na korunu* měří zkouška do zlomu (tlačítko „Do zlomu“ mezi pokusy v paletě, klávesa D).
- Zlato odpovídá nejlepšímu referenčnímu mostu úrovně, takže je vždy dosažitelné (hlídá test). Stříbro a bronz dávají rezervu 15 % a 40 % jen na nosnou konstrukci (mostovku hráč úsporou neovlivní; jinak by u těžkých mostů dostal bronz každý), nejmíň ale 2 % a 5 % celého mostu, aby stupně nesplynuly; u ceny navíc stříbro a bronz nepřekročí třetinu a dvě třetiny cesty od zlata k rozpočtu úrovně. U únosnosti na korunu je to 70 % a 45 % referenčního mostu.
- Stupně se porovnávají v číslech, která hráč vidí (`zobrazenaHodnota`): cena na koruny, hmotnost na tři platné číslice, únosnost na desetinu tuny na 100 000 Kč.
- Únosnost referenčních mostů je uložená v `urovne/zlomy.json` (hra ji při spuštění počítat nemůže); `npm run vyzvy` ji změří znovu a test hlídá, že uložená čísla platí.
- Ve hře: zlato každé výzvy v zadání úrovně, seznam výzev se všemi stupni ve výsledku (jakmile je úroveň projitá), „výzvy n z 9“ na kartě v přehledu, poznámka „o X % lepší než most autora hry“.

**Sandbox „Pískoviště“** (`src/data/sandbox.ts`, `src/hra/sandbox.ts`, adresa `?sandbox`, vstup z přehledu). Volná stavba bez rozpočtu, medailí a rekordů se všemi hotovými prvky kromě pístu a pružiny.

- Hráč nastavuje rozpětí údolí (6 až 72 m), hloubku (3 až 24 m), vodu, počet základů pro pilíře (0 až 3) a druh trasy (lávka, silnice, trať).
- Provoz si skládá sám: až deset položek jízdního řádu (kolik, čeho, odkud, kdy). Koncepce chce „vozidla se pouštějí ručně“; zkouška se ale počítá napřed a pak přehrává, takže se provoz skládá předem (stejné řešení jako u budiče v M3b).
- Z nastavení vzniká úroveň stejného formátu jako úrovně kampaně (id 0-01), takže ji editor, zkouška i rozbor umějí beze změny. Změna provozu nebo vody most nechá, změna údolí ho po potvrzení smaže.
- Základů je tolik, kolik se do údolí vejde (aspoň tři metry od sebe), jinak nastavení řekne, kolik jich smí být. Po trati jedou vlaky jedním směrem (jedna kolej).
- Budič, osa frekvencí, rezonanční křivka a laděný tlumič jsou tam, kde chodí lidé (lávka a silnice).

**Nápověda** (`src/hra/napoveda.ts`, `src/data/soupis.ts`). Na úrovních kampaně tlačítko nahoře v paletě (vedle Zadání):

- nejdřív soupis mostu, který úrovní projde (kolik prutů kterého prvku a kolik metrů, svary, zámky, napínáky, závaží s hmotností, tlumiče s laděním, zdvih pístu, cena a jestli se vejde do medaile za rozpočet),
- na další kliknutí jeho obrys na výkresu (čárkované čáry, kroužky ve styčnících a popisky u svarů, zámků, závaží, tlumičů a pístů); který prut je z čeho, obrys neříká.
- Po třetí zkoušce, která v jedné návštěvě neprojde, hra nápovědu jednou připomene.
- Nápověda se bere z referenčního mostu pro průchod, takže je vždy pravdivá a nepotřebuje ručně psané rady.

**Kampaň:** přehled ukazuje postup (projité úrovně, medaile, stupně výzev) a dokončenou kampaň oznámí zvlášť; výsledek poslední úrovně nabídne „Kampaň dokončena“, jen když je projitá každá úroveň.

**Deník hraní:** nové události `napoveda` (krok 1 soupis, 2 obrys), `napoveda.nabidnuta`, `sandbox.nastaveni`; `zkouska.konec` nese druh pokusu `zlom`, únosnost a stupně výzev. Souhrn správce má u každé úrovně, kolik hráčů si otevřelo nápovědu (a obrys) a kolik zkoušelo do zlomu.

**Jak je to ověřeno**

- `test/zlom.test.ts`, `test/vyzvy.test.ts`, `test/sandbox.test.ts`, `test/soupis.test.ts`, `test/ulozeni.test.ts` (převod uloženého postupu z verze 1).
- `test/e2e/kampan.e2e.ts`: **kritérium milníku** – z čisté paměti prohlížeče projde všech 28 úrovní s referenčními mosty, každá odemkne další a po poslední je kampaň dokončená.
- `test/e2e/rezimy.e2e.ts`: výzvy a zkouška do zlomu, sandbox (nastavení údolí a provozu, trať) a nápověda v prohlížeči.
- Regresní sada má scénář `zkouska-do-zlomu`. Scénáře s celou zkouškou teď krokuje zkouška, ne samotná simulace: dřív se v nich most vůbec nezvedal (zvedání řídí zkouška mezi kroky). Otisky `vlak-brzdi-na-stycich` a `sklopny-most` se proto změnily, výpočet ne.

**Co ověřeno není / modelové volby**

- Zlato ve výzvách je úroveň referenčních mostů, které nevznikaly jako nejlevnější, nejlehčí ani nejúnosnější možné: hráč je může překonat (hra mu to řekne). Prahy se dají zpřísnit podle toho, co hráči opravdu postaví (deník to zaznamená).
- Zkouška do zlomu zatěžuje celou mostovku rovnoměrně; nejhorší poloha zátěže (jen půl mostu) se nezkouší.
- U pohyblivých mostů se při zkoušce do zlomu most nezvedá a píst, který povolí, je první porušení.
- Sandbox nemá pohyblivé mosty (píst, zámek, lodě) a údolí má vždy stejný tvar se šikmými svahy.
- Nápověda ukazuje jeden most; jiná řešení (levnější, pro mistrovskou) neradí.

### Nezávislé recenze M7 (23. 11. 2026)

Tři čerství agenti bez znalosti mých závěrů: recenze kódu, hraní nových režimů v prohlížeči očima nováčka a nezávislá kontrola výpočtů (vlastní rámová MKP v Pythonu, lineární i geometricky nelineární). Kontrola výpočtů potvrdila zkoušku do zlomu: křehká porušení sedí na ručním výpočtu do 0,3 %, referenční mosty 4-03 a 4-04 na nelineárním výpočtu do 0,3 %, ceny a hmotnosti všech 84 referenčních mostů s rozdílem nula.

**Zapracováno**

- **Zkouška do zlomu bez mostovky dávala nesmyslný rekord** (všechny tři recenze; 1-01 s pěti trámy bez mostovky „unesl“ 15 502 t na 100 000 Kč). Zkouška teď chce mostovku od břehu k břehu: hra ji bez ní nepustí a řekne proč, jádro ji odmítne (`neplatny-vstup`).
- **Zlato za únosnost dostal most, který úrovní neprojde** (most bez závaží, bez tlumiče, bez pístu). Do výzvy se počítá jen mostu, který v téže návštěvě prošel běžnou zkouškou; jinak výsledek řekne, že se zatím nepočítá.
- **Zkouška do zlomu stavěla jiný most než běžná zkouška** (mostovka pohyblivého mostu nedělená po metru, svar místo čepu v zámku). Pokusy i zkouška do zlomu teď staví most podle úrovně, jak je; vypíná se jen řízení zvedání. Únosnosti kapitoly 7 se tím změnily o 0,2 % (`npm run vyzvy`).
- **Most bez klidové polohy** zkouška do zlomu dál zatěžovala až 20 s; teď skončí po třech sekundách. Neplatný nárůst zátěže zkouška odmítne (dřív z něj vyšla zkouška bez provozu, která „prošla“).
- **Prahy výzev:** bronz za cenu byl na sedmi úrovních nad rozpočtem (dostal ho každý most, který prošel), v kapitole 7 měly všechny stupně hmotnosti stejné číslo a zobrazení stupně nerozlišilo („936 kg · bez stupně · bronz do 936 kg“). Nová pravidla jsou popsaná výše; test chce ostré pořadí v zobrazených číslech a bronz pod rozpočtem na každé úrovni. Píst se počítá do hmotnosti mostu (200 kg/m jako ve zkoušce).
- **Výsledek výzev** rozlišuje rekord a právě zkoušený most („rekord 36,0 t (tenhle most 22,8 t)“). Zadání ukazuje jen zlato každé výzvy (devět čísel na první úrovni mátlo). Stupně výzev se v přehledu počítají jen na projitých úrovních.
- **„Kampaň dokončena“** se ukazovala i po průchodu poslední úrovně otevřené adresou; teď jen když je projitá každá úroveň, jinak „Zpět na přehled“. Dokončená kampaň má v přehledu vlastní oznámení.
- **Nápověda a „Údolí a provoz“ byly hluboko pod okrajem palety** (až dvě a půl obrazovky). Zadání, Nápověda a nastavení pískoviště jsou teď nahoře v paletě.
- **Nápověda tvrdila, že její most „není nejlevnější ani nejlepší“,** i když na třech zkoušených úrovních získal medaili za rozpočet. Věta se skládá podle skutečné ceny. Soupis říká hmotnost závaží, ladění tlumičů a zdvih pístu, obrys má tmavý podklad (je vidět i na hranici zakázané zóny) a popisky přídavků.
- **Pískoviště:** medaile se tam neukazují a rekordy nezapisují; změna vody most nemaže; počet základů odpovídá nastavení (dřív jich potichu bylo míň a překrývaly se) a stojí souměrně; vlaky proti sobě na jedné koleji nastavení odmítne; přepnutí druhu trasy dá výchozí jízdní řád; plný jízdní řád řekne proč nepřidává; hlášení o počtu říká rozsah; bez paměti prohlížeče nese nastavení adresa; nečitelné nastavení zahodí i most z neznámého údolí; pružina (bez nastavení tuhosti) v paletě není; lávka má vybavení 60 kg/m jako v kampani; analýza je po otevření zavřená.
- **Drobnosti:** při zkoušce do zlomu je razítko průhledné a legenda se láme vedle něj (údaj o zátěži byl schovaný), šipky mají jednotku kN/m, píst, který povolil, je vypsaný mezi porušeními, zdvojená věta o klidové poloze zmizela, nápověda se nepřipomíná tomu, kdo ji už otevřel, rekord bez nových polí už nezahodí celý postup, test „most nad rozpočet“ zkouší opravdu rozpočet.
- **Testy:** most s mezerou, bez mostovky a prázdný; stavba pohyblivého mostu do zlomu; nejlepší ze tří referenčních mostů (ne jen uložený); úložiště sandboxu; každý druh provozu je v nabídce sandboxu, nebo vědomě vynechaný.

**Nezapracováno (a proč)**

- **Plastický moment se v tlaku krátí únosností v tahu** (`src/jadro/sily.ts`): tlačená ocelobetonová mostovka je v ohybu o 13 až 20 % slabší, než říká posudek, tedy opak toho, co hra učí. A **svařený styčník uprostřed tlačeného prutu půlí vzpěrnou délku** (až dvojnásobná únosnost za cenu svaru). Obojí je starší než M7 a mění výsledky běžných zkoušek: oprava znamená novou verzi fyziky, vyhratelnost všech úrovní a nové prahy. Patří do M8 jako samostatný krok s přeladěním.
- **Tvárné porušení při zkoušce do zlomu závisí na rychlosti zatěžování** (+3 až +8 % proti statické mezi; zátěž roste i ve chvíli, kdy se kloub teprve otáčí). Hráč i referenční most se měří stejně, takže výzvu to nekřiví; oprava (zátěž neroste, dokud přibývá plastická práce) do M8 spolu s předchozím.
- **Vzpěr se u děleného prutu počítá dvakrát** (Rankine i skutečný průhyb), štíhlé dřevo je o 8 až 14 % opatrnější než vlastní vzorec hry. Modelová volba na bezpečné straně; k rozhodnutí v M8.
- **Zkouška do zlomu zatěžuje celý most naráz.** U zavěšeného mostu, příhrady přes pilíř a oblouku je horší zatížit půlku (poměr 0,39 až 0,75). Je to zapsaná modelová volba; výzva měří rovnoměrné zatížení.
- **První porušení ukončí zkoušku, i když jde o vedlejší prut,** a nadbytečný prut tak umí únosnost „snížit“. Ošidit se tím nedá; nechává se.
- **Zlato je snadné** (na 1-01 jde postavit most 2,7× účinnější než referenční). Prahy se zpřísní podle toho, co hráči opravdu postaví (deník to zaznamená).
- **Správce nevidí most ze sandboxu** (v deníku není nastavení údolí) a řádek 0-01 v souhrnu míchá všechna údolí. Do M8.
- **Dva vlaky za sebou na trati se mohou dohnat** a zkouška to nepozná (stejně jako auta); nastavení hlídá jen protisměr.
- **V okně užším než 1000 px** se nevejde lišta a časová osa: řeší M8 (dotyk a úzké okno).

## M6 — výsledek

Pohyblivé mosty: píst, dělicí zámek, ocelová mostovka, fáze zkoušky, lodě a kapitola 7 „Přístav“. Verze hry 0.12.0, verze fyziky 7 (výsledky dosavadních mostů se nemění), formát úrovně 6, formát návrhu 4.

**Píst** (`src/jadro/pisty.ts`, `PIST` v katalogu). Hydraulický válec je osový prvek (pružina s tlumičem), jehož klidovou délku řídí zkouška. Hráč ho kreslí v poloze při sklopeném mostě a nastaví zdvih (kladný se vysouvá, záporný zasouvá, nejvýš polovina délky).

- Tuhost je tuhost sloupce oleje: objemový modul 1,5 GPa × plocha pístu 0,0616 m² (vrtání 280 mm) / délka, tedy 92 MN / délka.
- Největší síla 1 500 kN (tlak 25 MPa): přetlakový ventil nedovolí řízené rychlosti, aby součet síly oleje a škrcení mez přesáhl; píst pak jede pomaleji, stojí nebo ustupuje.
- Jede 0,4 m/s, rozjíždí se a dojíždí se zrychlením 0,4 m/s². Tlumič válce (1,5 MN·s/m, škrcení průtoku) brzdí jen odchylku od řízené rychlosti (`Soustava.rychlostKlidove`); bez toho by se křídlo na sloupci oleje houpalo jako na pružině.
- Ověřeno na křídle s čepem (`test/jadro-pisty.test.ts`): klidová síla podle rovnováhy momentů, úhel podle délky pístu, slabý píst se zastaví tam, kde mu síla přestane stačit, píst na hraně síly zvedá pomaleji.

**Dělicí zámek** (`src/jadro/zamky.ts`, přídavek styčníku, 25 000 Kč). Na začátku je zamčený přesně (podpora nebo společný styčník), takže klidová poloha i rozbor mostu jsou stejné jako bez zámku.

- *Na opěře s ložiskem* (styčník v posuvné kotvě): odemknutí vezme podporu a nechá dosedací plochu, která umí jen tlačit vzhůru (200 MN/m, útlum 30 %); po sklopení se podpora vrátí tam, kde konec dosedl. Na čep (pevnou kotvu), do vetknutí ani na základ zámek nepatří a kontrola návrhu ho tam odmítne.
- *Mezi dvěma částmi mostu*: odemknutí rozdělí styčník na dva (`rozdelStycnik`); po sklopení je spojí čep (4 000 MN/m, řádově jako mostovka křídla v tahu), který zapadne bez rázu a konce k sobě stáhne rychlostí 0,1 m/s.
- Zapadne, jen když jsou konce do 5 cm od sebe a nehýbou se vůči sobě rychleji než 0,2 m/s.
- Které pruty patří ke které části, pozná `zamkyNavrhu` z návrhu: části jsou to, co zbyde souvislé po vyjmutí zámků. Zámek, který nespojuje právě dvě části (nic nerozpojí, nebo se v něm potkávají tři, třeba i s pístem), zkouška odmítne s vysvětlením. Zámek je čep: svar v témže styčníku editor odebere.

**Fáze zkoušky a lodě** (formát úrovně 6: `pohyb: { zvednout, sklopit }`, `lode`). V čase `zvednout` se zámky odemknou a písty vysouvají, v čase `sklopit` se vracejí a po dojetí se zámky zkoušejí zamknout. Loď pluje kolmo k výkresu: po dobu průjezdu nesmí do jejího plavebního profilu (obdélník nad hladinou) zasahovat žádný prut; náraz most nepoškodí, ale zkouška neprojde. Průchod = všichni přejeli, všechny lodě propluly a most je na konci zamčený. Výsledek ukazuje průběh zvedání, největší sílu v pístu a ráz při dosednutí na opěru proti klidové síle. Nový bonus mistrovské medaile `dosednuti` (největší síla dosednutí v N).

**Ocelová mostovka** (`mostovka-ocel`): ortotropní plech 14 mm s lichoběžníkovými žebry, 196 kg na metr šířky (ocelobetonová 520), 33 300 cm⁴, plastický modul 2 127 cm³, 26 000 Kč/m, do 6 m. Hodnoty jsou spočítané z typického průřezu, ne převzaté z tabulek. Mostovka mostu, který se zvedá, se skrytě dělí po metru, aby ráz dosednutí nezávisel na tom, jak dlouhé díly hráč nakreslil.

**Ve hře:** píst a ocelová mostovka v paletě, zámek jako přídavek (klik na položku, pak na styčník), nastavení zdvihu se stavem a dobou zdvihu, plavební profil lodi na výkresu při stavbě, loď a rozevřený zámek při přehrávání, zvedání a lodě na liště jízdního řádu i na časové ose, věty ve výsledku (loď narazila, píst nestačil, most se nezamkl). Zvuky jsou pracovní (klapnutí zámku, náraz lodi).

**Kapitola 7 „Přístav“** (`urovne/7-0*.json`, řešení v `urovne/reseni.ts`, ukázky v `urovne/ukazky.ts`)

| Úroveň | Co učí | Referenční řešení |
|---|---|---|
| 7-01 Zvedací most, 12 m | Píst, zdvih, zámek na opěře, svařené křídlo | píst z kotvy pod čepem; z hlubší kotvy dosedne měkčeji (202 kN proti 310 až 353 kN, mez medaile 250 kN) |
| 7-02 Dvě křídla, 24 m | Zámek mezi křídly, zrcadlení; zavřený most se opírá o písty | dvě křídla po 12 m; trojúhelník nad kořenem křídla pro mistrovskou (využití 8 % proti 14 až 18 %) |
| 7-03 Dlouhé křídlo, 16 m | Rameno pístu: z mělké kotvy rychle a na hraně síly, z hluboké klidně, ale s větším zdvihem | hluboká kotva a zdvih 2,5 m dosedne silou 576 kN, mělká 690 až 827 kN (mez medaile 630 kN) |
| 7-04 Velký přístav, 32 m | Těžší křídla po 16 m: píst s krátkým ramenem zvednuté křídlo neudrží, křídlo klesne a loď narazí | písty z hlubokých kotev; trojúhelník nad kořenem křídla bere mostovce ohyb (18 % proti 37 %) |

Fakta v odstavcích „Ve skutečnosti“ jsou ověřená vyhledáním (23. 11. 2026): Tower Bridge (otevřen 30. 6. 1894, v prvním roce 6 194 zvednutí, dnes asi 800 ročně, křídlo přes 1 100 t, protizávaží 420 t), Erasmův most (otevřen 6. 9. 1996, sklopné pole 89 m), most Jacquese Chabana-Delmase (2013, zdvižné pole přes 100 m a asi 2 600 t, výška asi 53 m).

**Jak je to ověřeno**

- `test/jadro-pisty.test.ts`, `test/jadro-zamky.test.ts`: píst a zámky v jádře.
- `test/pohyblivy.test.ts`: stavba mostu s pístem a zámkem, pravidla návrhu, celý cyklus jednokřídlého i dvoukřídlého mostu, lodě, formát úrovně.
- `test/vyhratelnost.test.ts`, `test/ukazky.test.ts`: všechna řešení, pády a ukázky kapitoly 7.
- `test/e2e/pristav.e2e.ts`: kapitola v prohlížeči (stavba křídla myší, zdvih, zámek, zvednutí, loď, výsledek, dvě křídla); `mesto.e2e.ts` pouští ukázky.
- Regresní sada má scénář se sklopným mostem (`sklopny-most`).

**Co ověřeno není / modelové volby**

- **Protizávaží ve hře není.** Pokusy s rámem a závažím za čepem nedaly čisté chování (písty na hraně síly, převážené křídlo se nevracelo) a bez dalšího ladění by úroveň mátla. Koncepce ho nežádá; kandidát pro doladění.
- **Píst na hraně síly zkouškou může projít:** ventil ho zpomalí, ale křídlo se zvedne. Výsledek to hlásí („píst pracoval na mezi své síly“), průchod to nebere. Když ventil povolí pod zvednutým křídlem, křídlo klesne a loď narazí (úroveň 7-04).
- Víc pístů z různých kotev do jednoho křídla se pere (jejich délky se s úhlem mění různě); dva písty vedle sebe do stejných styčníků návrh neumí.
- Loď je jen plavební profil: nemá hmotnost, nedělá vlny a do mostu „narazí“ bez síly.
- Ráz při dosednutí závisí na tuhosti dosedací plochy (200 MN/m) a na tom, jak píst dojíždí; čísla jsou řádově věrohodná, ne změřená.
- Zavřený dvoukřídlý most se opírá o písty a čepy (skutečné mosty mají zadní závory); pod autobusem se uprostřed prohne o centimetry až decimetr.
- **Zámek mezi křídly je čep, který přenáší i tah.** Prověšený zavřený most proto nese část tíhy tahem v mostovce jako lano (v 7-04 asi třetinu); skutečný středový zámek přenáší jen smyk. Je to modelová volba: zámek začíná jako společný styčník, aby klidová poloha a rozbor seděly.
- **Píst je rychlejší než skutečný:** zdvih trvá 5 až 7 s, skutečné mosty se zvedají minutu a déle. Dynamické špičky síly jsou proto asi 1,5× statické a konec křídla dosedá rychlostí 0,5 až 2 m/s. Tuhost válce se při vysouvání nemění (skutečný sloupec oleje ano), píst nemá vzpěr ani dorazy a ventil je i mezí držení.
- Ložisko na opěře drží i nadzvednutí (vlastnost podpor od M1).

### Nezávislé recenze M6 (23. 11. 2026)

Tři recenze nad hotovým milníkem: recenze kódu, hraní kapitoly 7 v prohlížeči očima nováčka a nezávislá kontrola výpočtů. Statika, úhly, doby zdvihu, energie i geometrie lodí seděly s ručním výpočtem na procento; chyby byly v tom, co model dovolil, ve třech referenčních mostech a ve dvou měřených veličinách.

**Zapracováno z kontroly fyziky a recenze kódu**

- *Křídlo se překlápělo přes svislici.* Délka pístu je největší, když leží v přímce s čepem (úvrať); zdvih směl být až polovina délky pístu, což u všech kotev kapitoly vedlo za úvrať. Křídlo přepadlo dozadu nad silnici a tři referenční mosty (7-03 rozpočet, 7-04 průchod a mistrovská) tak náhodou procházely. Teď platí dvojí: kontrola návrhu odmítne zdvih, který by křídlo zvedl o víc než 70° (`otoceniKridla` v `src/data/navrh.ts`; čep křídla pozná tam, kde píst vede z kotvy a křídlo drží jediná pevná kotva), a zkouška neuzná most, jehož mostovka se otočila o víc než čtvrt kruhu (`pohyb.preklopeno`; chytí i křídlo bez pístu, které po odemknutí spadne). Panel zdvihu ukazuje, o kolik stupňů se křídlo zvedne.
- *Most, který nedosáhl na opěru, bral medaile.* Křídlo o metr kratší než kanál nepotřebovalo zámek a kola mezeru přejela. Most s mezerou na trase teď neprojde (`VysledekZkousky.mezera`) a bonus za měkké dosednutí dostane jen most, který na opěru opravdu dosedl.
- *„Klidová síla“ dosednutí byla špička při odlehnutí* (o 22 až 35 % víc než reakce opěry). Bere se reakce opěry těsně před odemknutím; s ručním výpočtem sedí do 2 %.
- *Ráz dosednutí závisel na dělení mostovky* (stejné křídlo: 6 + 6 m 462 kN, 12 × 1 m 307 kN), takže šla medaile získat nebo ztratit překreslením. Mostovka mostu, který se zvedá, se skrytě dělí po metru; dál už se výsledek nemění (po půl metru 307 kN). Meze medailí jsou znovu naladěné: 7-01 250 kN, 7-03 630 kN.
- *Zámek si pamatoval čísla prvků.* Porušení, které prvek u zámku rozdělilo, by zámek nechalo zamčený a po „zamknutí“ přivázalo střed mostu k nehybnému bodu. Zámek si pamatuje pruty druhé části a prvky dohledá při odemknutí; zámek, jehož druhé křídlo se utrhlo, už nic nespojí ani nepodepře.
- *Po zamknutí to byl jiný most.* Čep mezi křídly (200 MN/m) byl řádově měkčí než mostovka, takže se zavřený most po prvním zvednutí prověsil víc (7-04: 232 → 335 mm, píst o 30 % víc). Čep má teď vlastní tuhost 4 000 MN/m: 232 → 246 mm, píst o 4 % víc. Krok výpočtu se tím nezkrátil.
- *Ventil neplatil v kroku dojezdu.* Píst, který právě dojel, brzdil ještě se hýbající křídlo silou nad mez (až +31 % v jednom kroku). Ventil platí i tam.
- Ocelová mostovka: přepočet průřezu dal moment setrvačnosti 33 300 cm⁴ (bylo 33 600), průřezový modul 1 497 cm³, plastický modul 2 127 cm³ (bylo 1 860) a smykovou plochu 77 cm².
- Formát úrovně odmítne neznámý klíč ve fázích zkoušky a u lodi. Zámek a svar se v jednom styčníku vylučují (rozbor počítal svařený spoj, po sklopení tam byl čep). Píst má v obálce největší sílu, takže klik na něj při zkoušce řekne, kolik tlačil.
- Texty 7-04 tvrdily, že píst z mělké kotvy neunese zavřený most; ve skutečnosti neudrží zvednuté křídlo. Zadání, ukázka i komentář jsou opravené a pád „písty z mělkých kotev“ má zdvih, který se nepřeklápí. Text 7-02 už netvrdí, že by jedno křídlo bylo moc těžké.

**Zapracováno z hraní**

- *Svar a hned potom zámek skončily na špatných styčnících:* klik na Zámek v paletě dal zámek na styčník, který po sobě nechal vybraný svar. Přídavek teď použije jen výběr z nástroje Výběr; klik zámkem nebo svarem mimo styčník poradí, co chybí.
- *7-02 šlo projít s jedním pístem* (křídlo bez pístu se kývalo skrz zem a zámek ho náhodou chytil) a jedním dlouhým křídlem se zámkem na čepu. Obojí teď neprojde (překlopení, zámek na čepu).
- Výsledek si neprotiřečí: „zamčeno“ jen u mostu se zámkem, „zvednuto“ jen s nenulovým zdvihem, píst na mezi se hlásí slovy místo čísla nad mezí, ráz po zřícení se nevypisuje, řádek dosednutí říká mez medaile, využití těsně u meze se píše na setiny procenta.
- Náraz lodi řekne, do kterého prutu (a kliknutí ho na výkresu označí). Medaile získaná dřív jiným mostem má ve výsledku vlastní značku a poznámku.
- Zrcadlení na pohyblivém mostě nechá v ose styčník pro zámek (dřív ho u křídla z dílů po 2 a 3 m spojilo v jeden prut) a nedá zámek na čep.
- Razítko v rohu výkresu zprůhlední, když zakrývá kotvu, základ, styčník nebo plavební profil (v 7-02 a 7-04 zakrývalo kotvy pro písty).
- Panel zdvihu říká i největší sílu pístu; zadání 7-01 radí, čím se dosáhne měkkého dosednutí. Inženýrský rozpočet 7-03 je 512 000 Kč, aby ho splnilo i křídlo ze čtyř dílů, na které editor šestnáctimetrový tah sám rozdělí.
- Souhrn deníku rozlišuje neúspěch kvůli lodi, zámku, překlopení a mezeře.

**Nezapracováno a proč**

- Zámek mezi křídly přenáší i tah a píst je rychlejší než skutečný: modelové volby, viz výše.
- Brnknutí na mostě s pístem dává nesmyslnou frekvenci; v kapitole 7 je brnknutí schované. Vyřeší se v M7 se sandboxem, kde se potkají.
- Úzké okno (pod 1 000 px): razítko, posuvník času a horní lišta; patří do M8 s dotykovým ovládáním.
- Čep a kotvy pro píst mají stejnou značku; značky na časové ose nemají nápovědu; medaile jsou v dlouhém zadání pod okrajem okna. Drobnosti pro M8.
- Zrcadlení po změně jednoho pístu přidá obraz na obě strany (čtyři písty): zrcadlení doplňuje, nemaže.
- V kapitole 7 je mezi mostem pro průchod a mostem pro rozpočet malý rozdíl ceny (mostovka, píst a zámek jsou skoro celá cena).
- Roh plavebního profilu v 7-01 leží na přímce 45° od čepu, takže píst do něj při některém zdvihu zasáhne o milimetry; výsledek teď řekne který prut, profil zůstal.
- Analýza: „průhyb uprostřed“ kreslí u zvednutého mostu zvednutí. Po 7-04 chybí zakončení kampaně (M7).

## M5 — výsledek

Železnice: kolejiště, vlak, kapitola 6 „Trať“ a cestou dvě opravy fyziky. Verze hry 0.11.0, verze fyziky 7 (po recenzích, viz níže), formát úrovně 5.

**Opravy fyziky**

- **Vlastní tíha prutů s tuhými konci** (nález z kontroly fyziky M4b). Tíha prutu se dřív dávala jen do styčníků; u svařeného nebo vetknutého prutu k ní patří i momenty vetknutí, bez kterých vycházely podporové momenty spojité mostovky o 6 % menší. Teď působí tíha po délce prutu (`pridejTihuPrvku` a `energieTihyPrvku` v `src/jadro/zatizeni.ts`, jako gradient polohové energie průhybu, takže se zachovává energie). Rám úrovně 4-02 sedí s rámovou teorií do 1 % (`test/vlastni-tiha.test.ts`).
- **Dilatační spára.** Konec mostovky na posuvném ložisku se pod brzdícím vlakem odsune od předmostí i o deset centimetrů. Kola do vzniklé mezery propadala a vracela se rázem několika meganewtonů (falešný smyk v krajním poli, pětinásobná reakce opěry). Kolo teď spáru do půl metru přejede po předmostí, pokud kraj mostovky zůstal ve výšce předmostí (`vDilatacniSpare` v `src/jadro/trasa.ts`); utržený díl spáru netvoří. Hlídá to test s vlakem brzdícím na vysokém pilíři (`test/vlak.test.ts`).
- Cestou nalezena a opravena příčina vzácného rozpadu výpočtu: tlumič kontaktu kola bral skok výšky mezi dvěma kusy utržené mostovky jako rychlost (`NEJVYSSI_RYCHLOST_POVRCHU` v `src/jadro/bremena.ts`).

**Kolejiště** (`kolejiste` v katalogu): kolej na dubových mostnicích a dvou podélnících IPE 600 (2 × 92 080 cm⁴, 560 kg na metr i s kolejnicemi, 16 000 Kč/m, do 6 m). Je to jedna kolej: šířka mostovky ho nenásobí a hmotnost vybavení úrovně nenese. Patří jen k trase druhu „kolej“; vlak po silniční mostovce nejede a auto po pražcích také ne. Původně zamýšlené IPE 500 se pod podvozkem loženého vozu prohýbaly o centimetr; s IPE 600 je průhyb 5 mm (1/1 200 rozpětí), jak se u železničních mostů žádá. I tak je to pro kola vlnovka s délkou vlny 6 m: ložený vůz, který se na pérování houpe 2,5krát za sekundu, míjí pole ve stejném rytmu při 55 km/h a síla jeho dvojkolí pak kolísá o čtvrtinu (při 40 km/h o desetinu, při 100 km/h o šestinu). Původní závěr, že IPE 600 houpání odstranily, byl chyba modelu, kterou našla kontrola fyziky: nedělené pole ukazovalo kolu rovnou tětivu.

**Vlak** (`src/zkouska/vozidla.ts`, `src/zkouska/provoz.ts`)

- Položka jízdního řádu druhu „lokomotiva“ se seznamem vozů (`vozy`, formát úrovně 5). Lokomotiva a každý vůz jsou samostatní účastníci nárazník na nárazník, všichni jedou rychlostí lokomotivy. Kolejová vozidla smějí jen na trasu druhu „kolej“.
- Lokomotiva 88 t (4 × 22 t), ložený nákladní vůz 90 t, prázdný 22 t, osobní vůz 45 t; každé vozidlo má čtyři dvojkolí ve dvou podvozcích. Lokomotiva a osobní vůz mají dvoustupňové vypružení (dvojkolí – rám podvozku – skříň), nákladní vůz jen prvotní. Hodnoty jsou typické, ne změřené.
- Uložení koleje pod dvojkolím má tuhost 120 MN/m. Kolej má vlastní nerovnosti (`src/jadro/nerovnost.ts`): třída A je svařená kolej s milimetrovými vlnami, B má po 25 m styky hluboké 3 mm, C zanedbané styky 6 mm. Naměřeno na zkušebním mostě při 60 km/h: styk třídy B přidá dvojkolí lokomotivy (těžké neodpružené hmoty) asi polovinu klidové síly, dvojkolí loženého vozu pětinu až čtvrtinu a prázdnému vozu víc než jeho celou tíhu. Přírůstek v kilonewtonech je u loženého a prázdného vozu skoro stejný (50 až 65 kN): ráz na styku na nákladu skoro nezávisí.
- Vlak umí na mostě zabrzdit (výchozí zpomalení 1 m/s², úroveň smí předepsat jiné) a rozjet se. Vyjíždí tak daleko před mostem, aby mu na zastavení v určeném místě stačila brzdná dráha; brzdná a tažná síla nabíhá a doznívá 1,5 s.
- Pohodlí cestujících se měří i na skříních osobních vozů; výsledek a mistrovská medaile pak mluví o vlaku.

**Ve hře:** kolejiště se kreslí s pražci, lokomotiva se sběračem a vozy jako bokorysy, trasa vedená skálou má tunel s portálem, zadání má větu o stavu koleje, jízdní řád vypisuje složení vlaku. Zvuk je stávající obecné valení a klapání spár (ladění zvuků patří do M9).

**Kapitola 6 „Trať“** (`urovne/6-0*.json`, řešení v `urovne/reseni.ts`, ukázky v `urovne/ukazky.ts`)

| Úroveň | Co učí | Referenční řešení |
|---|---|---|
| 6-01 První vlak, 30 m | Vlak je těžký (6 t/m) a delší než most; pod mostem se stavět nesmí | lehká příhrada od 3 m výšky; těžký tlačený pás pro mistrovskou |
| 6-02 Rychlík, 36 m | Tuhost: průhyb mostu rozhoupe skříň vozu; nad kolejí je trolej | příhrada pod kolejí; 2 m unese (2,2 m/s² ve voze), 6 m dá jízdu pod 0,3 m/s² |
| 6-03 Uhelný vlak, 72 m | Vlak nouzově zabrzdí (2,5 m/s²) a sílu nesou jen vysoké pilíře | svar hlavy pilíře s kolejištěm (pilíř na 97 %), nebo těžké vzpěry z půlky pilíře (49 %) |
| 6-04 Dvě patra, 48 m | Kolej a silnice devět metrů nad sebou jsou pásy jedné příhrady | svislice a diagonály mezi patry; svislice u podpor z těžkého profilu, z lehkého vybočí a most spadne |

Fakta v odstavcích „Ve skutečnosti“ jsou ověřená vyhledáním (22. 11. 2026): Negrelliho viadukt, mez zrychlení ve voze a mostovky podle evropské normy, most přes Firth of Forth, most přes Øresund. Původně zamýšlený údaj o normové brzdné síle se ověřit nepodařilo, proto v textech není.

**Jak je to ověřeno**

- `test/vlak.test.ts`: kolejiště, hmotnosti a vypružení vozidel, kontrola jízdního řádu s vlakem, složení vlaku, nerovnost koleje, průjezd vlaku, rázy na stycích, pohodlí ve voze, spára při brzdění, opakovatelnost.
- `test/vyhratelnost.test.ts` a `test/ukazky.test.ts`: všechna řešení, pády a ukázky kapitoly 6.
- `test/e2e/trat.e2e.ts`: kapitola v prohlížeči od přehledu po dvoupatrový most.

**Co ověřeno není / modelové volby**

- Každá náprava nese svůj díl skříně samostatně (jako u silničních vozidel): kývání skříně mezi podvozky se nepočítá.
- Vozy vlaku nejsou svisle spřažené; když jeden spadne, ostatní jedou dál.
- Třecí tlumení nákladního podvozku je nahrazené viskózním (útlum 12 %).
- Nouzové brzdění v 6-03 (2,5 m/s²) je víc, než dokáže skutečný nákladní vlak (kolem 1 m/s²); odpovídá tomu, že se mosty navrhují na brzdnou sílu blízkou mezi adheze. Při 2 m/s² by holé pilíře držely staticky s rezervou 10 % a padaly jen díky rozhoupání, o chlup.
- Brzdná síla nabíhá a doznívá lineárně za 1,5 s (auta 0,3 s), kinematika vozidla přitom zůstává předepsaná; kolejnice nepřenášejí podélnou sílu do předmostí a otevřená dilatační spára je bez následků.
- Posudek ohybu se dělá ve čtvrtinách prutu: skutečné maximum pod kolem bývá o jednotky procent vyšší (vlastnost už z M1b).
- Ložený vůz má rozměry řady Eas, ale 90 t odpovídá traťové třídě D (22,5 t na nápravu); komentář u modelu to říká.

### Nezávislé recenze M5 (23. 11. 2026)

Tři recenze nad hotovým milníkem: recenze kódu, hraní kapitoly 6 v prohlížeči očima nováčka a nezávislá kontrola výpočtů. Hrubou chybu výpočtu nenašla žádná; vlastní tíha, kolejiště, klidová poloha vozidel i síly v příhradách sedí s ručním výpočtem do procent.

**Zapracováno z kontroly fyziky** (verze fyziky 7)

- *Kolo nevidělo průhyb neděleného pole kolejiště.* Pole 6 m kmitá nad pásmem 30 Hz, proto se skrytě nedělilo, a kloubový prut bez styčníku uprostřed ukazuje kolu rovnou tětivu. Mostovka silnice a koleje se teď dělí vždy aspoň na dva díly; lávky zůstávají, jak byly (chodec jde pomalu). Vozy se na vlně průhybů houpou, nejvíc kolem 55 km/h (viz „Kolejiště“ výše); na referenční mosty to má vliv do 5 %.
- *Brzdná síla mizela skokem.* Po zastavení se most rozkmital o ±9 cm a vodorovná reakce vycházela o polovinu větší než kvazistatická; o zlomení pilíře pak rozhodovala fáze kmitu při rozjezdu. Síla teď nabíhá a doznívá lineárně (vlak 1,5 s, auto 0,3 s), impuls zůstává hmotnost × změna rychlosti.
- *Přenos tíhy mezi nápravami nesplňoval rovnováhu momentů* (u čtyř náprav dával jen dvě třetiny klopného momentu a druhé dvojkolí předního podvozku odlehčoval). Nápravy se teď přitěžují úměrně vzdálenosti od těžiště; u dvou náprav vychází totéž co dřív.
- Úroveň 6-03 padala s holými pilíři jen díky dynamice a o chlup (využití 1,001 až 1,19, staticky 0,90). Brzdění je teď 2,5 m/s²: holé pilíře se zlomí i s těžkými pásy a s šestimetrovou příhradou (oba mosty jsou mezi těmi, které neprojdou).
- Opravené popisy: co na styku přidá lokomotiva a co vůz, vlastní frekvence vozidel v komentářích modelů, označení loženého vozu.

**Zapracováno z recenze kódu**

- *Vlak s výchozím zpomalením nezastavil tam, kde měl.* Brzdná dráha 139 m se do rozjezdu před mostem nevešla a plán ji mlčky ořízl: vlak zastavil až 76 m za místem. Kdo má na mostě zastavit, vyjíždí teď o brzdnou dráhu dřív (test hlídá polohu zastavení).
- Ukázky kapitoly 6 běží v prohlížečovém testu; ukázka mostu o dvou patrech má ve výřezu i vozidla horního patra.
- Pohodlí cestujících se měří u každého autobusu a osobního vozu zvlášť a jen po dobu, kdy sám jede po mostě; počítá se jen vozidlo, které most přejelo (spadlý autobus už nehlásí „nepřijatelné“). Kde jede autobus i osobní vůz, mluví řádek výsledku a medaile obecně o cestujících.
- Kontrola dat úrovně odmítne překlep v údajích vlaku, rozestup u lokomotivy, kolej bez kolejiště v povolených prvcích, bonus za pohodlí bez cestujících a trasy různého rozpětí.
- Pražce na předmostí stojí při posunu pohledu na místě. Regresní sada má scénář s vlakem (styky, brzdění, podvozky), takže stránka shody výpočtu hlídá i tyto cesty.

**Zapracováno z hraní**

- *Špatná nebo chybějící mostovka: vozidla propadla a hra neřekla proč.* Kolejiště jde položit jen na kolej a silniční mostovka na kolej ne (s hláškou při kreslení); když někdo spadne a na trase kus mostovky chybí, výsledek řekne kde. U mostu o více patrech jsou nivelety popsané slovy.
- *Vlak se za mostem rozpadal.* Kdo most přejel, jede dál po předmostí a je vidět, dokud nevyjede z obrazu.
- *Vlak zakrýval příhradu a čísla.* Skříně vozů jsou poloprůhledné, čísla využití se kreslí přes vozidla, sběrač lokomotivy je stažený.
- *6-04 byla příliš snadná a varování nic nestálo.* Silnice je devět metrů nad kolejí: lehké svislice u podpor vybočí a most spadne (je mezi mosty, které neprojdou). Inženýrský rozpočet (2 150 000 Kč) je těsně nad mostem s těžkými krajními svislicemi; referenční most pro průchod má těžké všechny svislice a rozpočtovou medaili nedá.
- *6-03: rada posílala do pádu.* Zadání říká, že každé pole potřebuje vlastní příhradu a že vzpěry z půlky pilíře mají být z těžkého profilu; referenční řešení vedou vzpěry ze styčníku, kde editor pilíř dělí sám. Ukázka se dívá na jeden pilíř zblízka.
- *6-02: ukázka byla řešením a vlevo se most lámal, i když text mluví o tuhosti.* Ukázka teď srovnává dvoumetrovou a osmimetrovou příhradu: obě vlak unesou, v mělké cítí cestující 2,2 m/s², v hluboké 0,2. Pohodlí ve vlaku se neřadí do tříd pro lávky, ale poměřuje s mezí velmi dobrého pohodlí podle normy (1 m/s²).
- Texty, které neseděly s čísly (síla brzdícího vlaku, průhyb, styky při stovce, „vybočí“ u prutu, který selže tlakem), a čeština.
- Zrcadlení spojí pás dotažený k ose s jeho obrazem v jeden prut (kloub na ose by tlačený pás složil). Dlouhý jízdní řád se v úzkém okně dá posunout.

**Nezapracováno (a proč)**

- **Styky kolejnic a trolej nejsou na výkresu vidět.** Polohy styků zná až plán provozu ve zkoušce; kreslení patří do doladění (M8).
- **Horní lišta se v okně užším než asi 1000 px nevejde** (týká se všech kapitol). Do M8.
- **Spadlému vozu v 6-04 terén vykopne podvozek, který je ještě v tunelu.** Jen vzhled pádu, výsledek zkoušky nemění.
- **Zvuk v 6-04:** spáry obou mostovek jsou v jedné množině a kola vlaku klapou i na spárách silniční mostovky. Zvuky jsou pracovní, řeší se v M9.
- **Trosky vozů se po pádu prolínají;** tunel je jen nevyšrafovaný obdélník s portálem. Na technickém výkresu snesitelné.
- **Úroveň starší verze s trasou „kolej“ a autem** by nově neprošla kontrolou; žádná taková neexistuje.
- **Tvar styku** (zaoblené V) dává proti jedinému zlomu při 80 až 100 km/h až o polovinu větší ráz lokomotivy; řád i nezávislost na nákladu sedí. Parametry Jenkinsova vzorce z normy se recenzentovi dohledat nepodařilo.
- Mrtvý kód (`jeVozidlo` už jen v testech, příznak `predbezne`) zůstal; nic neovlivňuje.

## M4c — výsledek

Zpětná vazba hráčů a deník hraní. Popis pro zadavatele, včetně toho, co nastavit v Netlify, je v `docs/ZPETNA-VAZBA.md`.

**Ve hře**

- Tlačítko **Napiš nám** v přehledu kampaně, v liště úrovně (v úzkém okně jen dole v paletě) a v panelu výsledku otevře okno: druh zprávy (něco nefunguje, obtížnost, nápad, pochvala, jiné), text s počitadlem znaků, jak hra baví (1 až 5), nepovinný e-mail a přílohy (most z výkresu a posledních nejvýš 150 kroků).
- **Deník hraní** (`src/denik/`): otevření a opuštění úrovně s časem, každý nakreslený prut (prvek, odkud kam, počet dílů), ostatní úpravy mostu, nástroje, každá zkouška s celým mostem a výsledkem (průchod, medaile, cena, využití, první porušení, kmitání, doba výpočtu), zkouška, kterou hra nepustila, a proč, dopnutí lan, zavření zadání, ovládání a chyby prohlížeče. Anonymně: náhodné číslo hráče v prohlížeči, žádné jméno ani adresa.
- **Zapnuto, jde vypnout** (rozhodnutí zadavatele): první návštěva upozorní, že hra anonymní záznam odesílá autorům a že jde vypnout; vypínač je v přehledu a v okně zpětné vazby a po vypnutí hra potvrdí, že se už nic neodesílá. S vypnutým záznamem se neposílá nic; zpětná vazba ano, je to výslovná zpráva. Adresa s `?zaznam=vypnout` záznam v prohlížeči potichu vypne (pro zkoušení autorů; nesou ji odkazy ze stránky správce).
- Odesílá se po dávkách (40 událostí nebo 20 s, po výsledku zkoušky a při opuštění stránky přes `sendBeacon`). Po třech nezdarech si deník dá pět minut přestávku; bez serveru (místní spuštění) tedy hře nic nechybí.

**Na serveru** (`src/server/`, funkce v `netlify/functions/`)

- `POST /api/denik` a `POST /api/vazba` přijímají jen žádosti ze stejného webu, kontrolují tvar a velikost dat (dávka do 96 kB, zpětná vazba do 400 kB) a ukládají do Netlify Blobs. Formulář má skryté pole jako past na roboty.
- `/api/sprava` vydává data jen s heslem správce (proměnná prostředí `MM_SPRAVCE_HESLO`, aspoň 8 znaků; bez ní odpovídá 503). Umí seznam a detail zpětné vazby, změnu stavu řešení s poznámkou, dny a sezení deníku, souhrn za den nebo období, vývoz dne po částech a mazání.
- **Souhrn** se počítá z „výtahů“ dnů (`src/denik/souhrn.ts`): co se o kterém hráči ve které úrovni ví. Výtahy jdou slučovat, takže souhrn za měsíc nečte znovu všechny dávky. Klíč dávky začíná časem příjmu, nové dávky tedy přibývají na konec; výtah dne si pamatuje klíč poslední započtené dávky a další žádost čte jen to nové. Platí to i pro dnešek; den s víc než 400 dávkami se dopočítá na víc žádostí a po půlnoci (UTC) se jednou přepočítá celý.
- Obsluha pracuje se standardními `Request` a `Response` a s úložištěm za rozhraním `SkladZaznamu`, takže stejný kód běží ve funkcích i v testech.

**Stránka správce** (`/sprava.html`): zpětná vazba se stavy nová → řeší se → vyřešeno / zamítnuto, s poznámkou, přiloženým mostem nakresleným na výkresu úrovně, kroky před odesláním a skokem na sezení hráče v deníku; deník po dnech s tabulkou po úrovních (hráči, průchody, zkoušky a minuty do průchodu, medaile, cena průchodu proti rozpočtům, použité prvky, důvody pádů) a sezení krok za krokem.

**Jak je to ověřeno**

- `test/denik.test.ts`: sbírání a odesílání ve hře, kontrola příchozích dat, příjem, správa s heslem, souhrny a jejich slučování, mazání a skutečná knihovna Netlify Blobs proti jejímu místnímu serveru.
- `test/e2e/denik.e2e.ts`: hra v prohlížeči proti skutečné serverové obsluze zapojené do náhledového serveru: upozornění, stavba myší a zkouška, obsah deníku, zpětná vazba s mostem, vypnutý záznam, stránka správce od špatného hesla po smazání dne.

### Nezávislé recenze M4c (22. 11. 2026)

Dvě recenze nad hotovým milníkem: recenze kódu se zaměřením na bezpečnost a soukromí a vyzkoušení v prohlížeči očima hráče i zadavatele (stránka správce). Recenze kódu nenašla žádnou cestu, jak číst nebo mazat data bez hesla, ani způsob, jak dostat cizí skript na stránku správce.

**Zapracováno z recenze kódu**

- *Vypnutý záznam se po návratu tlačítkem Zpět ignoroval a dávky se přepisovaly.* Stránka vrácená z paměti prohlížeče se teď načte znovu, vypínač se čte z paměti před každým odesláním a platí hned ve všech panelech, čísla dávek se berou z paměti panelu a server nic nepřepíše (klíč dávky má náhodný dovětek).
- *Vypnutí posílalo i to, co čekalo ve frontě.* Teď odejde jen zpráva o vypnutí.
- *Bez paměti prohlížeče se záznam s každou stránkou znovu zapnul.* Volby se drží aspoň v paměti panelu; bez jakékoli paměti se deník nevede.
- *Veřejné adresy šly zneužít k zahlcení a k zamčení správy.* Omezení počtu žádostí u funkcí, strop zpráv na den, žádost bez hlavičky Origin se odmítá, seznam zpětné vazby se čte z malých záznamů a po stránkách, přihlášení správce nezávisí na načtení dat.
- *Vymyšlená dávka kazila statistiky.* Souhrn bere jen známé prvky a způsoby porušení a časy a ceny v rozumných mezích; texty a čísla v událostech mají meze už při příjmu.
- *Souhrn řadil sezení hráče podle čísla, ne podle času.* Sezení nese čas začátku, podle kterého se řadí i klíče v úložišti.
- *Při výpadku se ztrácely části dělené dávky a deník to po třech nezdarech vzdal natrvalo.* Nedoručené části se vracejí do fronty; po třech nezdarech pět minut přestávka; žádost odmítnutou natrvalo neopakuje.
- *Náhledy a ostrý web sdílely data.* Mají každý své úložiště a druh nasazení se bere z kontextu funkce (proměnná `CONTEXT` za běhu funkce není).
- Drobnosti: upozornění na záznam i v paletě úrovně (hráč s rozestavěným mostem zadání nevidí), Enter v poli e-mailu zprávu odešle, prázdný jazyk prohlížeče nevadí, chyby prohlížeče se nezapisují donekonečna, čas v úrovni běží jen s viditelnou stránkou, heslo správce jen bez diakritiky (hlavička žádosti jiné nesnese), vývoz a souhrn po menších částech.

**Nezapracováno z recenze kódu (a proč)**

- **Deník je anonymní jen do chvíle, kdy hráč napíše kontakt.** Zpětná vazba nese číslo hráče, aby šlo dohledat, co před zprávou dělal; je to záměr a okno zpětné vazby to hráči říká.
- **Souhlas předem.** Hra ukládá číslo hráče a vede statistiku s upozorněním a vypínačem, ne se souhlasem předem (tak to zadavatel 22. 11. zvolil). Pro zveřejnění širšímu publiku je to k rozhodnutí; viz `docs/ZPETNA-VAZBA.md`.
- **Heslo správce je jedno pro všechna nasazení.** Kdo by nasadil vlastní kód jako náhled, dostal by se k němu; Netlify cizí náhledy drží ke schválení. Popsáno v `docs/ZPETNA-VAZBA.md`.
- **Nad 200 různých textů chyb za den** nedává sloučení výtahů přesně totéž co výpočet najednou. Strop chrání před zahlcením; běžný den k němu nedojde.
- **Nečinnost hráče u viditelné stránky** se do času v úrovni počítá.

**Zapracováno z vyzkoušení v prohlížeči**

- *Souhrn dneška byl oříznutý na prvních 400 dávek.* Dávky se ukládají pod klíčem, který začíná časem příjmu, a výtah dne se dopočítává průběžně i pro den, který ještě běží (viz výše). Seznam sezení dne ukazuje, kdy dávky přišly.
- *Upozornění neříkalo, že záznam někam odchází.* Nový text: hra záznam odesílá autorům, co v něm je a že jde vypnout. Po vypnutí zůstane potvrzení, že se už nic neodesílá.
- *Okno zpětné vazby:* poděkování bez čísla zprávy a ne ve varovné barvě, počitadlo znaků, přílohy předem odškrtnuté u hráče s vypnutým záznamem, popis příloh říká, odkud kroky jsou, odeslání má časový limit 20 s a při nezdaru hra řekne, jak dlouho text vydrží.
- *Stránka správce:* detail zprávy drží u horního okraje okna (dřív zůstával nahoře mimo obraz), dlouhé slovo ve zprávě se zalomí, správné tvary počtů, srozumitelnější názvy sloupců, dny označené jako UTC, skok ze zprávy na sezení hráče, hra se ze správy otevírá v novém panelu a s vypnutým záznamem.
- *„Záznam si vypnulo“ počítalo i hráče, kteří ho zase zapnuli.* Počítá se poslední stav.
- *První klik mimo kreslení zapsal do deníku změnu stavby, která se nestala;* zkouška odmítnutá kvůli rozpočtu v deníku chyběla. Obojí opraveno.
- *Věta „most nemá klidovou polohu“ se ukazovala i u mostu, který prošel.* Teď jen u neúspěchu.
- *Lišta úrovně byla v úzkém okně přeplněná.* „Napiš nám“ je i dole v paletě a pod 1 180 px šířky zůstane jen tam; na telefonu zmizí z lišty přehledu nápis Kampaň.

**Kontrola nového ukládání deníku** (třetí nezávislý pohled, jen na přestavbu úložiště a souhrnu)

Náhodné zkoušky s tisícem dávek přes půlnoc, se souběžnými žádostmi správce a s mazáním po částech daly vždy stejný souhrn jako výpočet najednou; chybu, která by dávku na serveru započetla dvakrát nebo ji vynechala, kontrola nenašla. Zapracováno:

- *Dvě dávky téže stránky se mohly cestou předběhnout* (výsledek zkoušky odešel, zatímco předchozí dávka ještě letěla) a souhrn je pak četl v opačném pořadí. Hra posílá dávky po jedné a souhrn si dávky jednoho sezení srovná podle čísla dávky.
- *Dávka, kterou server uložil, ale odpověď se ke hře nedostala, se započetla dvakrát.* Hra ji posílá znovu beze změny pod stejným číslem a souhrn stejnou dávku podruhé přeskočí.
- *Záznamy uložené starším tvarem klíče* (jen v úložišti náhledů) zdržovaly souhrn dneška; souhrn, seznam sezení a vývoz je vynechávají, smazání dne je odstraní.
- *Potvrzení „záznam je vypnutý“ zůstalo viset, když hráč záznam zapnul jinde;* parametr `?zaznam=vypnout` zůstával v adrese a šířil by se se zkopírovaným odkazem. Opraveno; zpětná vazba má na odeslání minutu (s přiloženým mostem je větší).

Zůstává: srovnání pořadí a přeskočení dvojí dávky fungují jen mezi dávkami, které souhrn čte najednou (nejvýš 400 za sebou). Dvojice rozdělená touto hranicí se započte, jak přišla; je to vzácné a týká se jednoho hráče.

**Nezapracováno z vyzkoušení (a proč)**

- **Obrazovka úrovně na šířku telefonu** se nedá pohodlně ovládat. Hra je stavěná pro počítač a tablet; telefon patří do M8 (doladění).
- **Filtr souhrnu podle verze hry** a **upozornění na neuloženou poznámku správce** by se hodily, ale nejsou nutné pro první sběr dat; zapsáno pro M8.
- **Události se ztratí, když prohlížeč spadne nebo ho systém ukončí** dřív, než stihne odeslat poslední dávku (nejvýš 20 s hraní). Prohlížeč pro to spolehlivý prostředek nedává.

**Co ověřeno není**

- Funkce na Netlify: z vývojového prostředí se zavolat nedají. První skutečné ověření je náhled pull requestu; správu jde vyzkoušet až po nastavení hesla. Zvlášť: zda Netlify přijme zapsané omezení počtu žádostí, zda funkce pozná druh nasazení a zda kontrola hlavičky Origin sedí s adresou, pod kterou funkce žádost vidí (kdyby ne, deník by končil chybou 403 a na stránce správce by žádný nebyl).
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

Plán milníků je hotový (M0 až M8; M9 se na přání zadavatele nedělá). Další práce už není naplánovaná; co zůstává otevřené, kdyby se ve vývoji pokračovalo:

- **Neověřeno:** bitová shoda výpočtu ve Firefoxu a Safari (stránka `/otisky.html` je připravená, v kontejneru je jen Chromium) a hra na skutečném telefonu a tabletu (zkoušela se jen emulace).
- **Čeká na zadavatele:** heslo správce v Netlify pro stránku zpětné vazby a deníku hraní (viz „M4c — výsledek“).
- **Data od hráčů:** ladění obtížnosti podle deníku hraní, až nějaká data budou.
- **Vědomě nezapracované body recenzí** jsou u každého milníku v oddílu „Nezávislé recenze“ (u M8 například posudek tlačeného tvárného prutu a rezervy mostů 6-03).

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

- 23. 11. 2026, po sloučení M8: na otázku, jak pojmout M9 (ukázka šesti zvuků, celá sada, dvě varianty ke každému, nebo nic), zadavatel zvolil **„Zvuky nechat, jak jsou“**. M9 se nedělá a zvuky ze syntezátoru jsou konečné. Přes ElevenLabs se nic nevygenerovalo (jen odhad ceny: asi 55 kreditů za zvuk).

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
| 6 | Vlastní tíha po délce prutu (M5): tíha prvku působí jako spojité zatížení, ne jen ve styčnících; podporové momenty spojitých nosníků jsou správně. Mění se otisky všech referenčních mostů; pořadí medailí zůstalo. |
| 7 | Opravy po kontrole fyziky M5: mostovka silnice a koleje se dělí vždy aspoň na dva díly, brzdná a tažná síla nabíhá plynule, přenos tíhy mezi nápravami při brzdění splňuje rovnováhu momentů. Mění se výsledky úrovní s vlakem a s brzděním. |
| 8 | Vzpěr a plasticita podle nezávislé kontroly výpočtů M7 (M8). Plastický moment se v tlaku krátí únosností průřezu v tlaku, ne v tahu: tlačená ocelobetonová mostovka je v ohybu únosnější (při zkoušce do zlomu 3-03 +26 %, 4-01 +30 %, 6-04 +15 %). Vzpěrná délka se bere přes celý řetěz prutů, které ve svaru pokračují v přímce a nejsou tam ničím podepřené (pilíře nad sebou i bez svaru): svar uprostřed tlačeného prutu už jeho únosnost nezvedne (visutý most 4-04 při zkoušce do zlomu −11 %, pylon je jeden sloup). Zkouška do zlomu nezvyšuje zátěž, dokud přibývá plastická práce: tvárné porušení dává statickou mez nezávisle na rychlosti. Výsledky běžných zkoušek referenčních mostů, mostů, které mají spadnout, ani ukázek se nezměnily (vyhratelnost i otisky kromě scénáře zkoušky do zlomu jsou stejné). Po nezávislé kontrole M8 (ještě před vydáním verze 8): řetěz drží jen skutečná opora (ne pahýl, tlumič ani jediné lano) a zkoušku do zlomu ukončují hodiny zátěže, ne čas děje. |
