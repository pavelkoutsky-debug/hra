# Mostmistr — analýza a herní koncepce

Verze 0.1 · pracovní dokument ke společnému projití · **stav: čeká na schválení, vývoj nezačal**

Náhled zamýšlené obrazovky: [`mockup-obrazovka.svg`](./mockup-obrazovka.svg)

---

## 1. Shrnutí

Mostmistr je 2D stavitelská hra do prohlížeče kreslená jako technický výkres (modrák). Hráč navrhne most z prutů, lan a pilířů, spustí zatěžovací zkoušku a sleduje, jestli přes něj přejdou lidé, přejedou auta a projede nákladní vlak.

Hra stojí na třech pilířích:

1. **Fyzika počítaná jako ve stavební dynamice.** Skutečné jednotky, skutečné materiály a průřezy. Prut se nepřetrhne „při síle 100“, ale tahem na mezi pevnosti, vzpěrem podle štíhlosti nebo ohybem pod kolem.
2. **Dynamika jako herní mechanika.** Most má vlastní frekvence. Pochodující útvar nebo dav ho dokáže rozkmitat, i když je staticky v pořádku. Hráč se brání stejně jako inženýři: změnou tuhosti, hmoty, nebo laděným tlumičem.
3. **Pestrý provoz.** Od jednoho chodce přes auta, autobusy a kamiony v obou směrech až po nákladní vlak a lodě pod zvedacím mostem.

Jde o **původní hru v žánru stavění mostů**: vlastní název, úrovně, grafika i kód. Z existujících her nepřebíráme nic kromě obecného principu žánru.

---

## 2. Rozhodnutí z úvodního kola

| Téma | Rozhodnutí |
|---|---|
| Pracovní název | **Mostmistr** |
| Inženýrská hloubka | Hra s inženýrským jádrem: čitelná ve výchozím stavu, čísla v rozbalovacím analytickém panelu |
| Režimy | Kampaň s rozpočtem · Sandbox · Výzvy o efektivitu (editor úrovní zatím ne) |
| Pokročilé prvky | Tlumiče kmitů a závaží · hydraulika a zvedací mosty s loděmi · tuhé (svařované) styčníky · předpínání lan |
| Platforma | Desktop (myš + klávesnice); ovládání stavěné tak, aby šel později doplnit dotyk |
| Umístění | Podsložka `mostmistr/` v tomto repozitáři, Učedníkova noc zůstává beze změny |
| Zkoušení a provoz | Netlify (tvůj účet), nasazení přímo z repozitáře |
| Priorita po základní verzi | Lidé, rezonance a tlumiče |
| Jazyk | Čeština; texty od začátku ve slovníku, aby šla doplnit angličtina |
| Měřítko | Rastr 1 m, rozpětí úrovní 10 až 150 m |
| Průřezy | U dřeva a oceli vždy dva profily: lehký a těžký |
| Měna a tón | Rozpočet v korunách, názvy úrovní podle smyšlených českých míst |
| Synchronizace davu | Ve hře mírně zesílená oproti skutečnosti (vědomý ústupek kvůli hratelnosti) |
| Editor úrovní | Mimo rozsah; úrovně jsou data, takže ho půjde doplnit později |

---

## 3. Analýza žánru

**Co žánru funguje a co zachováme**

- Krátká smyčka *postav → zkus → uprav*. Zkouška musí jít spustit jedním klávesem a přerušit okamžitě.
- Čitelná zpětná vazba: barva prutu říká, jak moc je namáhaný.
- Rozpočet jako hlavní omezení. Postavit most, který vydrží, je snadné. Postavit ho levně je hádanka.
- Radost z pádu. Zřícení musí být podívaná a zároveň vysvětlení, co se pokazilo.

**Kde se žánr typicky zjednodušuje a co uděláme jinak**

| Typické řešení v žánru | Mostmistr |
|---|---|
| Univerzální herní fyzikální engine, iterační řešič na ~60 Hz. Tuhost spojů závisí na počtu iterací, umělé tlumení pohltí kmitání. | Vlastní řešič stavební dynamiky, tisíce kroků za sekundu, tlumení jen fyzikální. |
| Abstraktní jednotky, materiály laděné od oka. | Metry, kilogramy, newtony. Ocel S355, lepené dřevo GL24h, beton C30/37, skutečné průřezy. |
| Porušení = překročení jedné mezní síly v prutu. | Tah, tlak se vzpěrem podle štíhlosti, ohyb, kombinace. Porušení vytvoří kloub nebo přetržení. |
| Jen kloubové styčníky. | Klouby i tuhé spoje přenášející ohybový moment, plastické klouby. |
| Dynamika jen jako vedlejší efekt. | Vlastní frekvence, rezonance, komfort chodců, tlumiče jako plnohodnotná mechanika. |
| Auta, občas vlak. | Chodci, běžci, davy, pochodující útvary, cyklisté, auta, autobusy, kamiony, nadměrný náklad, vlak, lodě. |

---

## 4. Herní smyčka a režimy

**Smyčka jedné úrovně**

1. **Zadání:** výkres s terénem, kotvami, rozpočtem a jízdním řádem (kdo a kdy přes most půjde).
2. **Stavba:** kreslení prutů na rastru 1 m, volba materiálu a průřezu, typu styčníku.
3. **Analýza (volitelná):** okamžitý statický výpočet pod vlastní tíhou a vlastní frekvence mostu.
4. **Zkouška:** simulace provozu v reálném čase, zpomalení, pauza, krokování.
5. **Vyhodnocení:** hvězdy, cena, rezerva únosnosti, komfort chodců. Při pádu záznam porušení.
6. **Úprava** a zpět na krok 2.

**Režimy**

- **Kampaň s rozpočtem.** Kapitoly s rostoucí obtížností, postupné odemykání materiálů a typů provozu.
- **Sandbox.** Volná stavba bez rozpočtu, všechny prvky, vozidla se pouštějí ručně, nastavitelná šířka údolí. Zároveň pískoviště na pokusy s fyzikou.
- **Výzvy o efektivitu.** Stejné zadání, hodnotí se nejlevnější, nejlehčí nebo nejtužší most. Rekordy se ukládají v prohlížeči.

**Hodnocení v kampani**

- ★ všichni přešli a přejeli, nikdo nespadl
- ★★ splněn „inženýrský rozpočet“ (přísnější než povolený)
- ★★★ bonusová podmínka úrovně: rezerva únosnosti (největší využití pod 80 %), nebo komfort chodců (zrychlení mostovky pod limitem)

---

## 5. Stavební prvky

Hodnoty jsou výchozí návrh podle skutečných materiálů; ceny a průřezy se doladí při kalibraci úrovní.

**Nosné prvky**

| Prvek | Chování | Předobraz | Výchozí parametry |
|---|---|---|---|
| Dřevěná mostovka | Pojízdná, lehká, levná, malá únosnost v ohybu | Lepené dřevo GL24h | E 11,5 GPa · pevnost v ohybu 24 MPa · 420 kg/m³ |
| Ocelobetonová mostovka | Pojízdná, těžká, únosná | Spřažená deska | Vysoká tuhost, velká vlastní tíha |
| Kolejiště | Pojízdné jen pro kolejová vozidla | Kolej na mostnicích | Vyšší tíha na metr, tuhé |
| Dřevěný trám | Tah, tlak, ohyb; brzy se vzpírá | GL24h, 2 průřezy | Levný, lehký, do délky 6 m |
| Ocelový nosník | Tah, tlak, ohyb | Ocel S355, lehký a těžký profil | E 210 GPa · mez kluzu 355 MPa · 7 850 kg/m³ |
| Ocelové lano | Jen tah, v tlaku prověsí | Spirálové lano | E ~160 GPa · pevnost ~1 570 MPa |
| Betonový pilíř | Výborný v tlaku, slabý v tahu, těžký | Železobeton C30/37 | E 33 GPa · tlak 30 MPa · 2 500 kg/m³ |

**Pokročilé prvky**

| Prvek | K čemu je |
|---|---|
| Napínák lana | Lanu se nastaví předpětí. Ladí se tím tvar a tuhost zavěšených a visutých mostů. |
| Viskózní tlumič | Prut, který klade odpor rychlosti. Tlumí kmitání. |
| Pružina | Prut s volitelnou tuhostí. |
| Závaží | Hmota ve styčníku. Protizávaží zvedacích mostů a hmota laděných tlumičů. |
| Laděný tlumič | Závaží + pružina + tlumič. Hráč ho ladí v hertzech na vlastní frekvenci mostu. |
| Hydraulický píst | Prut, který v dané fázi zkoušky mění délku. Zvedá a sklápí most. |

**Styčníky a podpory**

| Prvek | Chování |
|---|---|
| Kloub (výchozí, zdarma) | Pruty se ve styčníku volně natáčejí. Konstrukce musí být ztužená trojúhelníky. |
| Tuhý spoj (svar, za příplatek) | Přenáší ohybový moment. Při přetížení v něm vznikne plastický kloub. |
| Dělicí zámek | Styčník, který se při zvedání mostu rozpojí a po sklopení zase zamkne. |
| Pevná kotva, posuvné ložisko, vetknutí | Dané úrovní. V analytickém panelu ukazují reakce. |

---

## 6. Provoz: lidé, vozidla, vlaky, lodě

| Kdo | Hmotnost | Rychlost | Čím je zajímavý |
|---|---|---|---|
| Chodec | 80 kg | 1,3–1,5 m/s | Kroková frekvence 1,6–2,4 Hz, periodická síla do mostovky |
| Běžec | 75 kg | 3 m/s | 2,5–3,2 Hz, větší rázy |
| Dav | desítky lidí | 1–1,4 m/s | Náhodné frekvence a fáze, při silném kmitání se lidé zčásti sladí |
| Pochodující útvar | desítky lidí | 1,5 m/s | Všichni ve stejné fázi. Nejnebezpečnější zdroj rezonance. |
| Cyklista | 95 kg | 5–6 m/s | Lehký, rychlý |
| Motocykl | 300 kg | 50 km/h | |
| Osobní auto | 1,5 t | 50 km/h | 2 nápravy |
| Dodávka | 3,5 t | 50 km/h | |
| Autobus | 18 t | 40 km/h | 2 nápravy |
| Nákladní auto | 26 t | 40 km/h | 3 nápravy |
| Tahač s návěsem | 40 t | 40 km/h | 5 náprav, kloub mezi tahačem a návěsem |
| Traktor s vlekem | 15 t | 20 km/h | Pomalý, dlouho zatěžuje |
| Nadměrný náklad | 120 t | 10 km/h | Mnohonápravový podvalník |
| Lokomotiva | 88 t | 40–60 km/h | 4 nápravy po 22 t, podvozky |
| Nákladní vůz | 22 t prázdný / 90 t ložený | podle lokomotivy | 4 nápravy, spřáhla s vůlí |
| Osobní vůz | 45 t | podle lokomotivy | |
| Loď | — | pomalu | Neváží na mostě nic, ale potřebuje průjezdný profil |

**Obousměrný provoz.** Ve 2D pohledu z boku jedou protisměrná vozidla ve dvou pruzích „za sebou do hloubky“. Míjejí se bez srážky a obě zatěžují stejnou mostovku. Vzdálenější pruh se kreslí tenčí čarou.

**Více mostovek.** Úroveň může mít silnici a kolej v různých výškách, například dvoupatrový most.

**Události v jízdním řádu.** Kamion, který na mostě zabrzdí. Kolona, která zastaví. Dva vlaky za sebou. Loď, kvůli které se most musí zvednout.

---

## 7. Fyzikální model

Tohle je jádro hry a největší část práce.

### 7.1 Proč vlastní řešič

Běžné herní enginy (Box2D, Matter.js, Rapier) řeší vazby iteračně při ~60 Hz a jsou laděné na věrohodný vzhled. Pro stavbu mostů mají tři vady: tuhost spojů závisí na nastavení řešiče, síly v prutech jsou zašuměné a umělé tlumení zkresluje kmitání. Rezonanci na nich poctivě modelovat nejde. Proto navrhuji vlastní jádro bez závislostí, psané pro tento účel a ověřované proti analytickým řešením.

### 7.2 Model konstrukce

- **Styčník:** poloha (x, y), natočení, hmotnost soustředěná z připojených prutů.
- **Prut:** rovinný nosníkový prvek (Euler–Bernoulli) v korotační formulaci. Přenáší osovou sílu, ohybový moment a posouvající sílu a platí i pro velké posuny a natočení při pádu.
- **Konce prutu:** každý konec je kloub, nebo tuhý spoj. Kloubový prut se chová jako klasický příhradový prut.
- **Zatížení mezi styčníky** (kolo uprostřed pole, vlastní tíha): přenáší se do styčníků přesnými vzorci pro daný typ uložení a ohybový moment uvnitř prutu se dopočítává analyticky. Mostovka se tedy pod kolem opravdu ohýbá a může se pod ním zlomit.
- **Lana:** jen tah, nulová ohybová tuhost, předpětí zkrácením klidové délky.
- **Písty:** prut s řízenou klidovou délkou a omezenou silou.
- **Tlumiče a pružiny:** síla úměrná rychlosti, respektive protažení.

### 7.3 Integrace v čase

- Explicitní symplektická integrace (velocity Verlet) s pevným krokem.
- Krok se určí z postavené konstrukce podle nejtužšího a nejlehčího místa, typicky **5 000 až 10 000 kroků za sekundu**. Díky tomu lze použít skutečné tuhosti oceli a betonu bez změkčování.
- Při tak malém kroku je chyba integrace pro frekvence, na kterých záleží (do desítek Hz), řádu tisícin procenta a metoda sama nepřidává žádné tlumení.
- Odhad výkonu: 300 styčníků, 600 prutů a 60 kol vychází na desítky mikrosekund na krok, tedy zhruba 3 ms výpočtu na snímek při 60 FPS. To je odhad, který ověřím měřením v milníku M1.

### 7.4 Tlumení

Jen fyzikální. Každý materiál má poměrný útlum podle měření na skutečných mostech (ocel ~0,5 %, beton ~1 %, dřevo ~1,5 %). Parametry tlumení se nastaví podle vypočtených vlastních frekvencí konkrétního mostu. Ocelová lávka se tak rozkmitá výrazně snáz než dřevěná, jako ve skutečnosti.

### 7.5 Porušení

| Namáhání | Kritérium | Co se stane |
|---|---|---|
| Tah | Napětí dosáhne pevnosti | Prut se přetrhne |
| Tlak | Vzpěr podle štíhlosti a uložení konců, s plynulým přechodem do meze kluzu | Uprostřed prutu vznikne kloub, prut se složí |
| Ohyb v poli | Kombinace osové síly a momentu překročí únosnost průřezu | V místě největšího momentu vznikne kloub |
| Ohyb v tuhém spoji | Moment dosáhne plastické únosnosti | Tuhý spoj se změní na kloub |
| Lano | Tah dosáhne pevnosti | Lano praskne a švihne |

Porušení se vyhodnocuje z krátce vyhlazeného průběhu, aby prut nepraskl kvůli numerické špičce trvající zlomek milisekundy. Trosky se dál simulují a kolidují s terénem a vodou.

Na začátku zkoušky se vlastní tíha nezapne skokem. Most startuje z předem spočítané rovnovážné polohy, jinak by ho poškodil nefyzikální ráz.

### 7.6 Vozidla a kontakt s mostovkou

- Vozidlo je tuhé těleso (karoserie) na neodpružených hmotách (nápravách) s pružinami a tlumiči. Je to stejný typ modelu, jaký se používá při inženýrském výpočtu interakce vozidla s mostem.
- Pneumatika je pružina se skutečnou radiální tuhostí. Kontakt je jednostranný, kolo může odskočit.
- Pohon a brzdění působí třecí silou v místě dotyku, omezenou přilnavostí. Brzdící kamion tak most opravdu tlačí podélně.
- Tahač a návěs spojuje točnice, vagóny spřáhla s vůlí a pružením.
- Vlak má skříň, podvozky a dvojkolí; tuhý kontakt kola s kolejnicí.

### 7.7 Lidé

- Chodec je hmota na pružině s tlumičem (lidské tělo) a k tomu budicí síla kroku složená z několika harmonických složek. Dav tak mostu přidává hmotu i tlumení, stejně jako ve skutečnosti.
- Běh a skákání mají letovou fázi a větší dynamické účinky.
- Pochodující útvar má společnou frekvenci a fázi. Dav má frekvence rozložené kolem 1,9 Hz a náhodné fáze.
- Když zrychlení mostovky překročí práh vnímání, část lidí v davu postupně sladí krok s kmitáním. Při velmi silném kmitání se lidé zastavují a drží zábradlí, což buzení zase sníží.
- **Komfort** se hodnotí třídami podle zrychlení mostovky (do 0,5 m/s² výborný, do 1 střední, do 2,5 nízký, nad 2,5 nepřijatelný), jak je zvykem u skutečných lávek.

### 7.8 Výpočty ve stavebním režimu

- **Statika pod vlastní tíhou:** ustálení stejným jádrem (dynamická relaxace). Funguje i pro lana a velké deformace. Výsledkem je průhyb, síly a využití prutů ještě před zkouškou.
- **Odhalení mechanismu:** když konstrukce není tvarově určitá, hra ukáže, která část se rozhýbe.
- **Modální analýza:** prvních několik vlastních frekvencí a tvarů kmitání, animovaných přímo na výkresu, s upozorněním, když frekvence padne do pásma chůze nebo běhu.

### 7.9 Determinismus

Pevný krok, pevné pořadí výpočtu a vlastní implementace goniometrických funkcí uvnitř jádra. Stejný most se zachová stejně v každém prohlížeči a záznam zkoušky jde přehrát přesně znovu. Pro výzvy o efektivitu je to nutnost.

### 7.10 Ověřování přesnosti

Jádro poběží i bez prohlížeče a bude mít sadu automatických testů proti známým řešením:

| Test | Porovnává se s |
|---|---|
| Síly v prutech staticky určité příhrady | Styčníková metoda |
| Průhyb prostého a vetknutého nosníku | Vzorce pružnosti |
| Součet reakcí | Celková tíha konstrukce a provozu |
| Vlastní frekvence nosníku a napjatého lana | Analytické vzorce |
| Volné kmitání bez tlumení | Zachování energie v čase |
| Útlum kmitání | Zadaný poměrný útlum |
| Ustálená rezonance | Zesílení 1/(2ζ) |
| Kritická síla ve vzpěru | Eulerův vzorec |
| Přejezd síly po nosníku | Klasické řešení pohyblivého zatížení (Frýba) |
| Laděný tlumič | Optimální ladění podle Den Hartoga |

U každého testu stanovím toleranci a výsledky ti ukážu jako tabulku v milníku M1.

### 7.11 Vědomá zjednodušení

- Hra je 2D. Příčné kmitání (do stran), kroucení a vítr nemodelujeme.
- Pruty mezi styčníky nemají vlastní příčné kmitání; ohyb uvnitř prutu je kvazistatický.
- Plasticita je zjednodušená na vznik kloubů. Únava materiálu, teplota a dotvarování se neřeší.
- Pevnosti jsou skutečné hodnoty bez normových součinitelů bezpečnosti, aby most padal tam, kde by skutečně selhal.

---

## 8. Nástroje pro hráče

**Výchozí zobrazení**

- Barva prutu podle využití, odlišený tah a tlak. Paleta zvolená tak, aby ji rozlišili i barvoslepí.
- Rozpočet, tlačítko zkoušky, rychlost simulace (¼× až 4×), pauza a krokování.

**Analytický panel (rozbalovací)**

- Síly v kN, momenty v kNm, využití v % a způsob, jakým prut rozhoduje (tah, vzpěr, ohyb).
- Reakce v podporách.
- Vlastní frekvence a animované tvary kmitání.
- Grafy: průhyb uprostřed rozpětí, zrychlení mostovky, využití vybraného prutu.

**Záznam porušení**

Po pádu hra přetočí poslední vteřiny zpomaleně, označí prut, který selhal první, a řekne proč: například „Prut 14: vzpěr, tlak 412 kN při únosnosti 380 kN“.

---

## 9. Vizuální styl a ovládání

- **Modrák.** Tmavě modré pozadí, bílé a světlé čáry, jemný metrový rastr se zvýrazněním po 5 m.
- **Výkresové konvence.** Kóty rozpětí a výšek, osy čerchovaně, terén v řezu se šrafováním, značky podpor jako ve statických schématech, rohové popisové pole s názvem úrovně, měřítkem a datem.
- **Vozidla a lidé** jako čárové bokorysy v témže stylu. Chodci jsou panáčci, jejichž krok odpovídá skutečné fázi jejich zatížení.
- **Zkouška** běží na stejném výkresu, jen „oživne“: pruty se obarví podle namáhání.
- **Zvuk:** procedurálně generované vrzání, praskání, šplouchnutí a dunění vlaku. Bez hudby, případně později.
- **Ovládání:** tažením myši prut, kolečkem zoom, pravým tlačítkem posun. Klávesy pro materiály, mazání, zrcadlení, zpět a znovu, mezerník spouští zkoušku.

---

## 10. Kampaň — osnova

| Kapitola | Téma | Nové prvky | Nový provoz |
|---|---|---|---|
| 1. Potok | Trojúhelník drží | Dřevo, dřevěná mostovka | Chodci, cyklisté, osobní auto |
| 2. Lávka | Most, který se houpe | Analytický panel, tlumič, závaží, laděný tlumič | Dav, běžci, pochodující útvar |
| 3. Okresní silnice | Tíha a vzpěr | Ocel, ocelobetonová mostovka | Dodávka, autobus, nákladní auto, obousměrný provoz |
| 4. Údolí | Velké rozpětí | Lano, napínák, betonový pilíř, tuhé spoje | Tahač s návěsem, nadměrný náklad |
| 5. Trať | Železnice | Kolejiště, dvoupatrové mosty | Lokomotiva, nákladní a osobní vozy |
| 6. Přístav | Pohyblivé mosty | Hydraulický píst, dělicí zámek | Lodě, fáze zkoušky |

Cílem je zhruba 5 úrovní na kapitolu, celkem kolem 30. Úrovně budou datové soubory (terén, kotvy, rozpočet, jízdní řád), takže přidání další je práce na obsahu, ne na kódu.

---

## 11. Technická architektura

- **Jazyk a nástroje:** TypeScript, Vite, Vitest. Žádný herní framework ani fyzikální knihovna.
- **Vykreslování:** Canvas 2D (čárová grafika, ostrá na displejích s vysokou hustotou). Ovládací prvky v HTML a CSS.
- **Struktura `mostmistr/`:**
  - `src/jadro/` — fyzika bez závislosti na prohlížeči (konstrukce, integrátor, porušení, vozidla, lidé, analýzy)
  - `src/hra/` — úrovně, jízdní řády, hodnocení, ukládání
  - `src/editor/` — stavební režim, nástroje, zpět a znovu
  - `src/vykres/` — vykreslování, kamera, výkresové prvky
  - `src/ui/` — panely, slovník textů
  - `urovne/` — data úrovní
  - `test/` — ověřovací sada fyziky a testy herní logiky
- **Výkon:** stav simulace v typovaných polích. Když měření ukáže potřebu, přesune se jádro do Web Workeru; architektura to dovoluje, protože jádro nezná prohlížeč.
- **Ukládání:** rozpracované mosty, postup a rekordy v `localStorage`. Export a import návrhu jako text.
- **Nasazení:** Netlify s napojením na repozitář. Základní složka `mostmistr`, příkaz `npm run build`, výstup `dist`. Konfiguraci (`netlify.toml`) připravím já, jednorázové propojení repozitáře v Netlify uděláš ty. Pak se každý push na vývojovou větev sám nasadí.
- **Kontrola kvality u mě:** před každým pushem jednotkové testy, typová kontrola a automatický průchod hrou v bezhlavém prohlížeči se snímky obrazovky.

---

## 12. Plán vývoje

Každý milník končí verzí, kterou si můžeš zahrát na Netlify.

| Milník | Obsah | Hotovo, když |
|---|---|---|
| **M0 Základy** | Kostra projektu, nasazení, modrákové plátno, kamera | Na Netlify je výkres s rastrem, jde posouvat a zoomovat |
| **M1 Fyzikální jádro** | Styčníky, pruty, klouby a tuhé spoje, integrátor, porušení, statika, ověřovací sada | Testy z kapitoly 7.10 procházejí v tolerancích, změřený výkon |
| **M2 První hratelná verze** | Editor, dřevo a ocel, mostovka, zkouška, barvy namáhání, osobní auto, 5 úrovní, ukládání | Úroveň jde postavit, vyzkoušet, vyhrát i prohrát |
| **M3 Lidé a rezonance** | Chodci, běžci, dav, útvar, modální analýza, analytický panel, tlumiče, závaží, komfort, grafy, záznam porušení | Lávku jde rozkmitat pochodem a zkrotit laděným tlumičem |
| **M4 Těžká doprava a velká rozpětí** | Nákladní vozidla, autobus, souprava, obousměrný provoz, lana, předpínání, pilíře, tuhé spoje v editoru | Visutý a zavěšený most unese kolonu kamionů |
| **M5 Železnice** | Kolejiště, lokomotiva, vagóny, dvoupatrové mosty | Nákladní vlak přejede most |
| **M6 Pohyblivé mosty** | Písty, dělicí zámky, fáze zkoušky, lodě | Most se zvedne, loď propluje, most se sklopí, provoz pokračuje |
| **M7 Kampaň a režimy** | Všech 6 kapitol, odemykání, hvězdy, sandbox, výzvy, nápověda | Hru jde projít od začátku do konce |
| **M8 Doladění** | Zvuk, výkon, dotykové ovládání, angličtina | — |

Pořadí M3 před M4 odpovídá tvé prioritě. Tuhé spoje umí jádro od M1, hráči se zpřístupní v M4.

---

## 13. Rizika

| Riziko | Jak mu předejdu |
|---|---|
| Výkon při tisících kroků za sekundu u velkých mostů | Měření už v M1, krok podle konstrukce, Web Worker, v krajním případě omezení nejkratších prutů |
| Tuhé spoje udělají hádanky triviální | Cena svaru, omezená momentová únosnost, úrovně, kde nejsou povolené |
| Hráč nepochopí, proč most spadl kmitáním | Analytický panel, výukové úrovně v kapitole 2, záznam porušení s vysvětlením |
| Skutečné materiály jsou „příliš silné“ a hra je snadná | Obtížnost dělají rozpočet, rozpětí a těžký provoz, ne oslabené materiály |
| Šum při přejezdu kol přes styčníky | Pneumatika jako pružina, vyhlazené vyhodnocení porušení |
| Rozsah je velký | Milníky s hratelným výstupem; po každém se můžeme rozhodnout, co dál |

---

## 14. Otevřené body

Žádné. Body z verze 0.1 jsou uzavřené a zapsané v kapitole 2.
