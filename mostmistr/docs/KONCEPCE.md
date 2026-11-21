# Mostmistr — analýza a herní koncepce

Verze 0.2 · po nezávislé recenzi · **schváleno 20. 11. 2026** · stav vývoje: [`STAV.md`](./STAV.md)

Náhled zamýšlené obrazovky: [`mockup-obrazovka.svg`](./mockup-obrazovka.svg) · přehled změn proti verzi 0.1 je v kapitole 15.

---

## 1. Shrnutí

Mostmistr je 2D stavitelská hra do prohlížeče kreslená jako technický výkres (modrák). Hráč navrhne most z prutů, lan a pilířů, spustí zatěžovací zkoušku a sleduje, jestli přes něj přejdou lidé, přejedou auta a projede nákladní vlak.

Hra stojí na třech pilířích:

1. **Fyzika počítaná jako ve stavební dynamice.** Skutečné jednotky, skutečné materiály a průřezy. Prut se nepřetrhne „při síle 100“, ale tahem na mezi pevnosti, vzpěrem podle štíhlosti, smykem nebo ohybem pod kolem. Ocel se před zlomením ohne, dřevo praskne naráz.
2. **Dynamika jako herní mechanika.** Most má vlastní frekvence. Pochodující útvar, běžecký závod nebo průvod s kapelou ho dokážou rozkmitat, i když je staticky v pořádku. Hráč se brání stejně jako inženýři: změnou tuhosti, hmoty, nebo laděným tlumičem.
3. **Pestrý provoz.** Od jednoho chodce přes auta, autobusy a kamiony v obou směrech až po nákladní vlak a lodě pod zvedacím mostem.

Jde o **původní hru v žánru stavění mostů**: vlastní název, úrovně, grafika i kód. Z existujících her nepřebíráme nic kromě obecného principu žánru.

---

## 2. Rozhodnutí

| Téma | Rozhodnutí |
|---|---|
| Pracovní název | **Mostmistr** |
| Inženýrská hloubka | Hra s inženýrským jádrem: čitelná ve výchozím stavu, čísla v rozbalovacím analytickém panelu |
| Režimy | Kampaň s rozpočtem · Sandbox · Výzvy o efektivitu (editor úrovní zatím ne) |
| Pokročilé prvky | Tlumiče kmitů a závaží · hydraulika a zvedací mosty s loděmi · tuhé (svařované) styčníky · předpínání lan |
| Platforma | Desktop (myš + klávesnice); ovládání stavěné tak, aby šel později doplnit dotyk |
| Umístění | Podsložka `mostmistr/` v tomto repozitáři, Učedníkova noc zůstává beze změny |
| Zkoušení a provoz | Netlify; stálá větev `main` na stálé adrese, za každý milník pull request s náhledem |
| Priorita po základní verzi | Lidé, rezonance a tlumiče |
| Jazyk | Čeština; texty od začátku ve slovníku, aby šla doplnit angličtina |
| Měřítko | Rastr 1 m, rozpětí úrovní 10 až 150 m |
| Průřezy | U dřeva a oceli vždy dva profily: lehký a těžký |
| Měna a tón | Rozpočet v korunách, názvy úrovní podle smyšlených českých míst |
| Synchronní zatížení | Jen jevy, které skutečně existují (útvar, běžecký závod, průvod s kapelou, skákající dav). Běžný dav se na most „neladí“. |
| Editor úrovní | Mimo rozsah; úrovně jsou data, takže ho půjde doplnit později |

---

## 3. Analýza žánru

**Co žánru funguje a co zachováme**

- Krátká smyčka *postav → zkus → uprav*. Zkouška musí jít spustit jednou klávesou a přerušit okamžitě.
- Čitelná zpětná vazba: barva prutu říká, jak moc je namáhaný.
- Rozpočet jako hlavní omezení. Postavit most, který vydrží, je snadné. Postavit ho levně je hádanka.
- Radost z pádu. Zřícení musí být podívaná a zároveň vysvětlení, co se pokazilo.

**Kde se žánr typicky zjednodušuje a co uděláme jinak**

| Typické řešení v žánru | Mostmistr |
|---|---|
| Univerzální herní fyzikální engine, iterační řešič na ~60 Hz. Tuhost spojů závisí na počtu iterací, umělé tlumení pohltí kmitání. | Vlastní řešič stavební dynamiky, tisíce kroků za sekundu, tlumení jen fyzikální. |
| Abstraktní jednotky, materiály laděné od oka. | Metry, kilogramy, newtony. Ocel S355, lepené dřevo GL24h, beton C30/37, skutečné průřezy. |
| Porušení = překročení jedné mezní síly v prutu. | Tah, tlak se vzpěrem, smyk, ohyb, kombinace. Ocel se plasticky ohne, dřevo a lana prasknou. |
| Jen kloubové styčníky. | Klouby i tuhé spoje přenášející ohybový moment, plastické klouby. |
| Dynamika jen jako vedlejší efekt. | Vlastní frekvence, rezonance, komfort chodců, tlumiče jako plnohodnotná mechanika. |
| Auta, občas vlak. | Chodci, běžci, davy, pochodující útvary, cyklisté, auta, autobusy, kamiony, nadměrný náklad, vlak, lodě. |

---

## 4. Herní smyčka a režimy

**Smyčka jedné úrovně**

1. **Zadání:** výkres s terénem, kotvami, základy pro pilíře, zakázanými zónami, rozpočtem a jízdním řádem.
2. **Stavba:** kreslení prutů na rastru 1 m, volba materiálu a průřezu, typu styčníku.
3. **Analýza (volitelná):** okamžitý statický výpočet pod vlastní tíhou, vlastní frekvence mostu, „brnknutí“ do mostovky.
4. **Zkouška:** simulace provozu. Počítá se na pozadí rychleji, než se přehrává, takže hráč může po časové ose skákat.
5. **Vyhodnocení:** medaile, cena, obálka namáhání, komfort. Při pádu záznam porušení.
6. **Úprava** a zpět na krok 2. Hra ukáže rozdíl proti minulému pokusu.

**Časová osa zkoušky**

- Ve spodní části obrazovky je osa s jízdním řádem: kdo a kdy přes most půjde.
- Na ose jsou značky událostí: první porušení, největší využití, největší kmitání.
- Hráč může skočit na kteroukoli značku, nebo spustit zkoušku až od vybrané události.
- Přehrávání lze zpomalit, zrychlit, zastavit a krokovat.

**Režimy**

- **Kampaň s rozpočtem.** Sedm kapitol s rostoucí obtížností, postupné odemykání materiálů a typů provozu.
- **Sandbox.** Volná stavba bez rozpočtu, všechny prvky, vozidla se pouštějí ručně, nastavitelná šířka údolí. K tomu budič s táhlem frekvence na pokusy s rezonancí.
- **Výzvy o efektivitu.** Běží na úrovních kampaně s jinou metrikou a s prahy bronz, stříbro, zlato:
  - nejlevnější most,
  - nejlehčí most,
  - zkouška do zlomu: zatížení roste, dokud most nespadne, a boduje se únosnost na korunu.

**Hodnocení v kampani: tři nezávislé medaile**

| Medaile | Podmínka |
|---|---|
| Průchod | Všichni přešli a přejeli, nikdo nespadl. Na úrovních s chodci navíc kmitání nesmí být nepřijatelné. |
| Rozpočet | Úspěšná zkouška s cenou pod „inženýrským rozpočtem“. Ten je na ukazateli rozpočtu vyznačen ryskou. |
| Mistrovská | Úspěšná zkouška a bonus úrovně: rezerva únosnosti (největší využití pod prahem úrovně), komfort chodců, nebo komfort cestujících v autobusu či vlaku. *(Upřesněno v M2: práh rezervy je údaj úrovně odvozený z referenčního mostu; v první kapitole 8 až 25 %, protože dřevo má proti chodcům a jednomu autu velkou rezervu.)* |

Medaile za rozpočet a mistrovskou lze získat různými návrhy. Nejlevnější most nemusí být zároveň nejpohodlnější.

---

## 5. Stavební prvky

Pevnosti jsou střední hodnoty skutečných materiálů, ne normové hodnoty s rezervou. Čísla v tabulce jsou výchozí návrh a v milníku M1 je ověřím proti normám; ceny a průřezy se doladí při kalibraci úrovní. *(M2: průřezy dřeva zeštíhleny na lehký trám 2× 60 × 120 mm, těžký 2× 120 × 240 mm a mostovku z fošen 80 mm; ceny jsou v `src/data/katalog.ts`.)*

**Nosné prvky**

| Prvek | Chování | Jak se poruší | Výchozí parametry | Největší délka |
|---|---|---|---|---|
| Dřevěná mostovka | Pojízdná, lehká, levná | Křehce: praskne | GL24h · E 11,5 GPa · ohyb ~32 MPa · 420 kg/m³ | 4 m |
| Ocelobetonová mostovka | Pojízdná, těžká, únosná | Tvárně: ohne se | Spřažená deska, velká vlastní tíha | 6 m |
| Kolejiště | Pojízdné jen pro kolejová vozidla | Tvárně | Kolej na mostnicích | 6 m |
| Dřevěný trám | Tah, tlak, ohyb; brzy se vzpírá | Křehce | GL24h, lehký a těžký průřez | 6 m |
| Ocelový nosník | Tah, tlak, ohyb | Tvárně: trvale se ohne, pak se zlomí | S355 · E 210 GPa · kluz ~400 MPa · pevnost ~510 MPa · 7 850 kg/m³ | 12 m |
| Ocelové lano | Jen tah, v tlaku prověsí | Křehce: praskne a švihne | Spirálové · E 150 GPa · pevnost ~1 400 MPa | 60 m |
| Betonový pilíř | Výborný v tlaku, slabý v tahu, těžký | V tahu křehce, v tlaku drcením | C30/37 · E 33 GPa · tlak ~38 MPa · 2 500 kg/m³ | 12 m |

**Pokročilé prvky**

| Prvek | K čemu je |
|---|---|
| Napínák lana | Lanu se nastaví předpětí. Ladí se tím tvar a tuhost zavěšených a visutých mostů. |
| Automatické dopnutí | Tlačítko, které lana napne tak, aby mostovka pod vlastní tíhou držela nakreslený tvar. Napínák pak slouží k ručnímu doladění. |
| Viskózní tlumič | Prut, který klade odpor rychlosti. Tlumí kmitání. Rozsah nastavení je omezený. *(M3a: 5 až 200 kN·s/m v devíti stupních.)* |
| Pružina | Prut s volitelnou tuhostí. |
| Závaží | Hmota ve styčníku. Protizávaží zvedacích mostů a hmota laděných tlumičů. |
| Laděný tlumič | Závaží + pružina + tlumič. Hráč ho ladí v hertzech na vlastní frekvenci mostu. |
| Hydraulický píst | Prut se dvěma stavy (zasunutý, vysunutý), které se přepínají na časové ose zkoušky. Zvedá a sklápí most. |

**Styčníky a podpory**

| Prvek | Chování |
|---|---|
| Kloub (výchozí, zdarma) | Pruty se ve styčníku volně natáčejí. Konstrukce musí být ztužená trojúhelníky. |
| Svar (tuhý spoj) | Nastavuje se na styčník a platí se za každý připojený prut. Přenáší ohybový moment. Při přetížení v něm vznikne plastický kloub. |
| Dělicí zámek | Styčník, který se při zvedání mostu rozpojí a po sklopení zase zamkne. |
| Pevná kotva, posuvné ložisko, vetknutí | Dané úrovní. V analytickém panelu ukazují reakce. Posuvné ložisko má úložnou délku 0,5 m: konec mostu, který se posune dál, z něj sjede a spadne. *(Doplněno v M2.)* |

**Pravidla stavby**

- Mostovka se ve styčnících chová jako každý jiný prut: ve výchozím stavu je kloubově dělená, svar ji udělá průběžnou.
- Pilíře lze stavět jen na základech vyznačených ve výkresu.
- Úroveň může mít zakázané zóny, například průjezdný profil pod mostem nebo plavební dráhu.
- Paleta ukazuje jen prvky, které jsou v dané úrovni odemčené.

---

## 6. Provoz: lidé, vozidla, vlaky, lodě

**Lidé**

| Kdo | Hmotnost | Rychlost a kadence | Jak zatěžuje |
|---|---|---|---|
| Chodec | 80 kg | 1,2–1,8 m/s, tedy 1,6–2,4 Hz při kroku 0,75 m | Periodická síla v rytmu kroku |
| Běžec | 75 kg | 3 m/s, 2,5–3,2 Hz | Větší rázy, letová fáze |
| Dav | desítky lidí | Hustý dav zpomalí na ~1 m/s a ~1,5 Hz | Náhodné frekvence a fáze; účinek roste zhruba s odmocninou počtu |
| Pochodující útvar | desítky lidí | 1,5 m/s, jedna kadence | Všichni ve stejné fázi. Nejnebezpečnější zdroj rezonance. |
| Běžecký závod | desítky běžců | ~3 m/s, úzké pásmo kadence | Fáze náhodné, ale frekvence blízko sebe |
| Průvod s kapelou | kapela + dav | 1,2 m/s | Kapela pochoduje v taktu, dav za ní jde volně |
| Skákající dav | desítky lidí | stojí, 2–2,8 Hz | Skáče v rytmu hudby. Největší dynamické účinky. |

**Vozidla a plavidla**

| Kdo | Hmotnost | Rychlost | Čím je zajímavý |
|---|---|---|---|
| Cyklista | 95 kg | 5–6 m/s | Lehký, rychlý |
| Motocykl | 300 kg | 50 km/h | |
| Osobní auto | 1,5 t | 50 km/h | 2 nápravy |
| Dodávka | 3,5 t | 50 km/h | |
| Autobus | 18 t | 40 km/h | 2 nápravy; komfort cestujících |
| Nákladní auto | 26 t | 40 km/h | 3 nápravy |
| Tahač s návěsem | 40 t | 40 km/h | 5 náprav, kloub mezi tahačem a návěsem |
| Traktor s vlekem | 15 t | 20 km/h | Pomalý, dlouho zatěžuje |
| Nadměrný náklad | 120 t | 10 km/h | Mnohonápravový podvalník |
| Lokomotiva | 88 t | 40–60 km/h | 4 nápravy po 22 t, podvozky |
| Nákladní vůz | 22 t prázdný / 90 t ložený | podle lokomotivy | 4 nápravy |
| Osobní vůz | 45 t | podle lokomotivy | Komfort cestujících |
| Loď | — | pomalu | Pohyblivý průjezdný profil; nic neváží, ale nesmí narazit |

**Pravidla provozu**

- **Rezonance v pásmu.** Lávka se nezkouší jednou kadencí. Útvar přejde několikrát: pomalým pochodem, rychlým pochodem a během. Jinak by šlo rezonanci obejít jedním závažím, protože rezonanční špička je široká jen 1–3 % frekvence.
- **Obousměrný provoz.** Protisměrná vozidla jedou ve dvou pruzích „za sebou do hloubky“. Míjejí se bez srážky a obě zatěžují stejnou mostovku. Vzdálenější pruh se kreslí tenčí čarou.
- **Šířka mostu.** Každá úroveň určuje šířku mostovky a hmotnost vybavení (zábradlí, vozovkové vrstvy). Z toho vychází hmotnost na metr i počet lidí vedle sebe.
- **Nerovnost vozovky.** Vozovka má drobné nerovnosti podle normového profilu a práh na přechodu z břehu. Stav vozovky je parametr úrovně: nová silnice zatíží most méně než rozbitá.
- **Více mostovek.** Úroveň může mít silnici a kolej v různých výškách.
- **Události v jízdním řádu.** Kamion, který na mostě zabrzdí. Kolona v pravidelných rozestupech. Dva vlaky za sebou. Loď, kvůli které se most musí zvednout.

---

## 7. Fyzikální model

Tohle je jádro hry a největší část práce.

### 7.1 Proč vlastní řešič

Běžné herní enginy (Box2D, Matter.js, Rapier) řeší vazby iteračně při ~60 Hz a jsou laděné na věrohodný vzhled. Pro stavbu mostů mají tři vady: tuhost spojů závisí na nastavení řešiče, síly v prutech jsou zašuměné a umělé tlumení zkresluje kmitání. Rezonanci na nich poctivě modelovat nejde. Proto navrhuji vlastní jádro bez závislostí, psané pro tento účel a ověřované proti analytickým řešením.

### 7.2 Model konstrukce

- **Styčník:** poloha (x, y), natočení, hmotnost soustředěná z připojených prutů a vybavení.
- **Prut:** rovinný nosníkový prvek se smykovou poddajností (Timošenkův) v korotační formulaci. Přenáší osovou sílu, ohybový moment a posouvající sílu a platí i pro velké posuny a natočení při pádu.
- **Konce prutu:** každý konec je kloub, nebo tuhý spoj. Kloubový prut se chová jako klasický příhradový prut.
- **Skryté dělení.** Dlouhé pruty a lana se uvnitř jádra rozdělí na několik úseků (nikdy kratších než 1 m), pokud jejich vlastní kmitání spadá do pásma, na kterém záleží (v M1b stanoveno na 30 Hz; dva díly na každý ohybový tvar v pásmu). Hráč to nevidí. Díky tomu má dlouhý nosník vlastní kmitání, lano skutečný průvěs a vzpěr vznikne sám od sebe.
- **Zatížení mezi styčníky** (kolo uprostřed pole, vlastní tíha): přenáší se do styčníků přesnými vzorci pro daný typ uložení a ohybový moment uvnitř prutu se dopočítává analyticky.
- **Dráha kola** je hladká křivka proložená mostovkou, ne lomená čára. Jinak by každý zlom ve styčníku dával nefyzikální ráz.
- **Lana:** jen tah, nulová ohybová tuhost, předpětí zkrácením klidové délky.
- **Písty:** prut s řízenou klidovou délkou a omezenou silou.
- **Tlumiče a pružiny:** síla úměrná rychlosti, respektive protažení.

### 7.3 Integrace v čase

- Explicitní symplektická integrace (velocity Verlet) s pevným krokem.
- Krok se určí z postavené konstrukce podle nejtužšího a nejlehčího místa. Očekávám **6 000 až 12 000 kroků za sekundu**.
- Při tak malém kroku je chyba integrace pro frekvence, na kterých záleží (do desítek Hz), zanedbatelná a metoda sama nepřidává žádné tlumení.
- Simulace běží v samostatném vlákně (Web Worker), aby neblokovala kreslení.

**Tato metoda nemá velkou rezervu.** Krok určuje stabilita, ne přesnost, a tlumení, zkrácené pruty i hráčem nastavené tlumiče ho mohou násobně zkrátit. Proto milník M1 začíná měřením (M1a) s kritériem:

- největší referenční most (300 styčníků, 600 prutů, 60 kol) se počítá aspoň 3× rychleji než reálný čas,
- běžná úroveň kampaně aspoň 10× rychleji.

Když kritérium nevyjde, mám připravené zálohy v tomto pořadí: omezit nejkratší délku u masivních průřezů, uměle zvýšit setrvačnost jen u nejvyšších frekvencí (stovky Hz, daleko za vším, co hráč pozná), přepsat jádro do WebAssembly.

Recenzent změřil zjednodušené jádro na 16–18 mikrosekund na krok pro největší referenční most. To odpovídá zhruba 5× reálnému času bez kol, porušení a tlumení.

**Výsledek M1a:** kritérium je splněno (největší most 7× až 12×, běžná úroveň přes 100×) a zálohy nejsou potřeba. Počet kroků vyšel 1 600 až 6 400 za sekundu podle délky nejkratšího prutu. Podrobnosti jsou v [`M1A-MERENI.md`](./M1A-MERENI.md).

**Výsledek M1b:** s úplným jádrem (porušení, kola na pneumatikách, obě tlumení) vychází největší most 4,1× až 6,5× a běžná úroveň 58× až 106×; kritérium platí dál. Nejdelší krok je omezen na 1 ms. Podrobnosti a ověření proti teorii jsou v [`M1B-JADRO.md`](./M1B-JADRO.md).

### 7.4 Tlumení

- Jen fyzikální. Každý materiál má poměrný útlum podle měření na skutečných mostech (ocel ~0,5 %, beton ~1 %, dřevo ~1,5 %).
- Tlumení se zadává přímo prvním zhruba deseti vlastním tvarům mostu. Útlum tvaru se určí podle toho, jakou část deformační energie nesou jednotlivé materiály.
- Rezonanční zesílení pak odpovídá zadanému útlumu přesně.
- K tomu malé tlumení nejvyšších frekvencí, které odstraní numerické zvonění v silách prutů.
- Po prvním porušení se konstrukce změní a vlastní tvary přestanou platit. Od té chvíle se použije jednodušší tlumení úměrné hmotě. Vztahuje se jen ke kmitání: pohyb, kterým se část konstrukce hýbe jako tuhý celek (pád utrženého kusu, sklápění zlomené poloviny mostu kolem podpory), nebrzdí. *(Upřesněno v M1b.)*

### 7.5 Porušení

| Namáhání | Kritérium | Co se stane |
|---|---|---|
| Tah | Napětí dosáhne pevnosti | Dřevo a lano se přetrhnou. Ocel se nejdřív protáhne, pak přetrhne. |
| Tlak | Vzpěr: dělené pruty vybočí samy, k tomu kontrola podle štíhlosti | Prut vybočí a zlomí se uprostřed |
| Smyk | Posouvající síla dosáhne únosnosti průřezu | Prut se ustřihne. U krátkých polí mostovky rozhoduje smyk dřív než ohyb. |
| Ohyb v poli | Kombinace osové síly a momentu překročí únosnost | Dřevo se zlomí. V oceli vznikne plastický kloub. |
| Ohyb ve svaru | Moment dosáhne plastické únosnosti | Plastický kloub: spoj drží moment na mezi a trvale se natáčí |
| Lano | Tah dosáhne pevnosti | Lano praskne a švihne |

**Tvárné porušení oceli.** Plastický kloub není volný kloub. Drží moment na plastické mezi a natáčí se, dokud nevyčerpá mezní natočení (asi 3 až 6 stupňů). Teprve pak se zlomí. Důsledky:

- přetížený ocelový most se viditelně a trvale prohne, a může ještě držet,
- zatížení se přerozdělí do zbytku konstrukce, jako ve skutečnosti,
- vetknutý nosník unese správnou mezní hodnotu; s volným kloubem by padal asi o čtvrtinu dřív.

**Pojistky stability výpočtu**

- Kloub po porušení vzniká jen uprostřed nebo ve čtvrtinách prutu, aby nevznikl libovolně krátký úsek.
- Nově vzniklé styčníky mají zaručenou nejmenší hmotu.
- Tlumiče se integrují poloimplicitně.
- Jádro hlídá, že se výpočet nerozešel. Když se rozejde, zkouška se zastaví s chybou, ne s „výbuchem“ mostu. *(V M1b jako pojistka na neplatná čísla a nesmyslné rychlosti; hlídání bilance energie zatím není.)*

Porušení se vyhodnocuje z krátce vyhlazeného průběhu, aby prut nepraskl kvůli numerické špičce trvající zlomek milisekundy. Trosky se dál simulují a kolidují s terénem.

Na začátku zkoušky se vlastní tíha nezapne skokem. Most startuje z předem spočítané rovnovážné polohy.

### 7.6 Vozidla a kontakt s mostovkou

- Vozidlo je karoserie (svislý pohyb a houpání) na nápravách s pružinami a tlumiči. Je to stejný typ modelu, jaký se používá při inženýrském výpočtu interakce vozidla s mostem.
- Vozidlo jede po mostovce předepsanou rychlostí. Brzdění je událost jízdního řádu, která do mostovky přenese podélnou sílu.
- Pneumatika je pružina se skutečnou radiální tuhostí. Kontakt je jednostranný, kolo může odskočit.
- Když se mostovka pod vozidlem poruší, vozidlo se stane volným tělesem a padá.
- Tahač a návěs spojuje točnice, vagóny spřáhla s pružením.
- Vlak má skříň, podvozky a dvojkolí.

Bez nerovností vozovky by vozidla most dynamicky téměř nezatížila: recenzent spočítal rozdíl 0,2 % proti pouhé pohyblivé síle. S nerovnostmi vychází dynamické zvýšení o 15 až 30 %, což odpovídá skutečnosti.

### 7.7 Lidé

- Chodec je hmota na pružině s tlumičem (lidské tělo) a k tomu budicí síla kroku složená z několika harmonických složek. Dav tak mostu přidává hmotu i tlumení.
- Běh a skákání mají letovou fázi a větší dynamické účinky.
- Při silném kmitání lidé zpomalí a ztratí krok, takže síla, kterou do mostu vnášejí, neroste donekonečna. *(V M3a zatím ne; přijde s davem v M3b.)*
- **Dav se na kmitající most neladí.** U svislého kmitání to není spolehlivě doložené, takže synchronní zatížení dělají jen zdroje z kapitoly 6.
- **Komfort** se hodnotí třídami podle zrychlení mostovky (do 0,5 m/s² výborný, do 1 střední, do 2,5 nízký, nad 2,5 nepřijatelný). Zrychlení se měří v pásmu 0,5–10 Hz a vyhlazené přes jednu sekundu, aby o výsledku nerozhodl jediný náraz.

### 7.8 Výpočty ve stavebním režimu

Vedle časové simulace má jádro druhou, maticovou cestu výpočtu:

- **Statika pod vlastní tíhou** přímým řešením soustavy rovnic. Odezva v milisekundách, takže se průhyb a využití prutů přepočítávají při každé úpravě.
- **Odhalení mechanismu:** když konstrukce není tvarově určitá, hra ukáže, která část se rozhýbe.
- **Modální analýza:** prvních několik vlastních frekvencí a tvarů kmitání, pro prázdný i obsazený most. Šedesát lidí sníží frekvenci lehké lávky zhruba o desetinu.
- **Rezonanční křivka:** jak silně most odpovídá na buzení v závislosti na frekvenci. Je na ní vidět, jak laděný tlumič rozdělí špičku na dvě nižší.
- **Automatické dopnutí lan** používá tentýž výpočet.

Pro povolená lana, kde přímý výpočet selhává, slouží jako záloha ustálení časovou simulací. Obě cesty se zároveň navzájem kontrolují.

### 7.9 Determinismus

Pevný krok, pevné pořadí výpočtu a pevné násady pro náhodný dav a nerovnosti vozovky. Jádro se obejde bez goniometrických funkcí (natočení drží jako jednotkový vektor), takže používá jen operace, které dávají všude bitově stejný výsledek. Stejný most se zachová stejně v každém prohlížeči a záznam zkoušky jde přehrát přesně znovu. Každý výsledek nese číslo verze fyziky.

### 7.10 Ověřování přesnosti

**Proti známým řešením**

| Test | Porovnává se s |
|---|---|
| Síly v prutech staticky určité příhrady | Styčníková metoda |
| Průhyb prostého a vetknutého nosníku včetně smyku | Vzorce pružnosti |
| Součet reakcí | Celková tíha konstrukce a provozu |
| Konzola stočená koncovým momentem do kruhu | Přesné řešení velkých natočení |
| Tvar zavěšeného lana | Řetězovka |
| Vlastní frekvence nosníku a napjatého lana | Analytické vzorce |
| Volné kmitání bez tlumení | Zachování energie v čase |
| Útlum kmitání | Zadaný poměrný útlum |
| Ustálená rezonance | Zesílení 1/(2ζ) |
| Vzpěr děleného prutu a rámu | Řešič sám vybočí při síle blízké Eulerově |
| Mezní zatížení vetknutého nosníku | Plastická mezní analýza |
| Přejezd síly a odpružené hmoty po nosníku | Klasické řešení pohyblivého zatížení (Frýba) |
| Chodec v rezonanci | Ustálená odezva pro daný útlum |
| Laděný tlumič | Optimální ladění podle Den Hartoga |
| Zjemnění dělení a kroku | Výsledek konverguje |

**Proti sobě samému (regrese)**

- Sada asi dvaceti referenčních mostů se scénáři. Po daném počtu kroků se porovná otisk stavu.
- Změna otisku znamená změnu fyziky. Musí se zvýšit číslo verze a zapsat, co se změnilo.
- Doplňkové kontroly: zrcadlově otočený most dá zrcadlový výsledek, poloviční krok dá stejný výsledek v toleranci, náhodně generované mosty nevyrobí neplatná čísla.
- Shodu mezi Node a Chromiem ověřím sám. Firefox a Safari v mém prostředí nejsou, proto hra dostane stránku, která otisk spočítá u tebe.

### 7.11 Vědomá zjednodušení

- Hra je 2D. Příčné kmitání (do stran), kroucení a vítr nemodelujeme.
- Plasticita je soustředěná do kloubů. Únava materiálu, teplota a dotvarování se neřeší.
- Spřáhla vagónů nemají vůli. Trosky kolidují jen s terénem, ne mezi sebou.
- Loď je pohyblivý průjezdný profil, ne těleso.
- Vozidla jedou předepsanou rychlostí; prokluz kol se nepočítá.
- Pevnosti jsou střední hodnoty bez normových součinitelů bezpečnosti, aby most padal tam, kde by skutečně selhal.

---

## 8. Nástroje pro hráče

**Výchozí zobrazení**

- Barva prutu podle využití: jedna škála bílá → žlutá → červená pro tah i tlak. Tlak je plná čára, tah dvojitá. *(M2, na přání zadavatele: u prutů jsou navíc čísla využití v procentech, která jdou vypnout, a pruty nad 60 % podkresluje záře.)*
- Žlutá je vyhrazená pro varování. Podpory, tlumiče a ovládací prvky ji nepoužívají.
- Rozpočet s ryskou inženýrského rozpočtu, tlačítko zkoušky, časová osa.

**Obálka namáhání**

- Po zkoušce si každý prut pamatuje své největší využití, čím bylo způsobené (tah, vzpěr, smyk, ohyb) a kdy nastalo.
- Kliknutí na prut skočí na časové ose do toho okamžiku.
- Hráč vidí, které pruty mají rezervu a kde může ubrat.

**Porovnání s minulým pokusem**

Rozdíl ceny, největšího využití a největšího zrychlení proti předchozí zkoušce.

**Hraní s dynamikou**

- **Brnknutí:** mostovku lze myší stáhnout a pustit. Most se rozkmitá ve své vlastní frekvenci.
- **Budič:** v sandboxu a ve výukových úrovních zařízení s táhlem frekvence. Hráč rezonanci najde rukou.

**Analytický panel (rozbalovací)**

- Síly v kN, momenty v kNm, využití v % a způsob, jakým prut rozhoduje.
- Reakce v podporách.
- Vlastní frekvence prázdného a obsazeného mostu, animované tvary kmitání, rezonanční křivka.
- Grafy: průhyb uprostřed rozpětí, zrychlení mostovky, využití vybraného prutu.

**Záznam porušení**

Po pádu hra skočí na první porušení, přehraje ho zpomaleně, označí prut, který selhal první, a řekne proč: například „Prut 14: vzpěr, tlak 412 kN při únosnosti 380 kN“.

**Pro testování**

- Tlačítko „kopírovat diagnostiku“: verze hry, úroveň, návrh mostu a výsledek zkoušky jako text, který mi pošleš.
- Ladicí nabídka: odemknout vše, skočit na úroveň.

---

## 9. Vizuální styl a ovládání

- **Modrák.** Tmavě modré pozadí, bílé a světlé čáry, jemný metrový rastr se zvýrazněním po 5 m.
- **Výkresové konvence.** Kóty rozpětí a výšek, osy čerchovaně, terén v řezu se šrafováním, značky podpor jako ve statických schématech, rohové popisové pole s názvem úrovně, měřítkem, verzí hry a medailemi.
- **Vozidla a lidé** jako čárové bokorysy v témže stylu. Chodci jsou panáčci, jejichž krok odpovídá skutečné fázi jejich zatížení.
- **Zkouška** běží na stejném výkresu, jen „oživne“: pruty se obarví podle využití.
- **Zvuk:** procedurálně generované vrzání, praskání, šplouchnutí a dunění vlaku. Původně až v posledním milníku; na přání zadavatele předsunuto do samostatného milníku M3z hned po M3a. *(M3z: hra nemá žádné nahrávky; zvuky se odvozují ze záznamu zkoušky, takže znějí i při zpomaleném přehrávání a krokování, a skok po časové ose je potichu. Dunění vlaku přijde s vlakem.)*

**Ovládání editoru**

| Akce | Ovládání |
|---|---|
| Nakreslit prut | Tažení myší ze styčníku |
| Posunout styčník | Tažení styčníku v režimu výběru (klávesa V) nebo s klávesou Alt |
| Vybrat oblast | Tažení obdélníku |
| Změnit materiál hotového prutu | Výběr a klávesa materiálu (číslice podle pořadí v paletě) |
| Smazat | Delete |
| Zrcadlit podle osy mostu | M |
| Zpět a znovu | Ctrl+Z, Ctrl+Y |
| Zoom a posun | Kolečko, pravé tlačítko |
| Spustit a zastavit zkoušku | Mezerník |
| Pozastavit přehrávání, skočit na konec | P, End |
| Krokovat záznam zpět a vpřed | čárka, tečka |
| Brnknout do mostu | B a tažení styčníku dolů |
| Závaží ve styčníku, síla tlumiče | výběr a tlačítka − a + v paletě |
| Zapnout a vypnout čísla využití u prutů | C |
| Hlasitost zvuku: nahlas, potichu, vypnuto | Z nebo tlačítko v liště |

---

## 10. Kampaň

| Kapitola | Téma | Nové prvky | Nový provoz | Dynamické téma |
|---|---|---|---|---|
| 1. Potok | Trojúhelník drží | Dřevo, dřevěná mostovka | Chodec, cyklista, osobní auto | Průhyb pod vlastní tíhou |
| 2. Lávka I | Most, který se houpe | Lehký ocelový profil, osa frekvencí, závaží, viskózní tlumič | Běžec, pochodující útvar | Rezonance v pásmu kadencí |
| 3. Okresní silnice | Tíha a vzpěr | Těžký ocelový profil, ocelobetonová mostovka | Dodávka, autobus, nákladní auto, obousměrný provoz | Nerovná vozovka, brzdící kamion, kolona |
| 4. Údolí | Velké rozpětí | Lano, napínák, pilíř, svar | Tahač s návěsem, nadměrný náklad | Předpětí lana ladí frekvenci |
| 5. Lávka II | Město v pohybu | Laděný tlumič, rezonanční křivka | Dav, běžecký závod, průvod s kapelou, skákající dav | Ladění tlumiče pro obsazený most |
| 6. Trať | Železnice | Kolejiště, dvoupatrové mosty | Lokomotiva, nákladní a osobní vozy | Rázy náprav, komfort cestujících |
| 7. Přístav | Pohyblivé mosty | Hydraulický píst, dělicí zámek | Lodě, fáze zkoušky | Ráz při dosednutí mostu |

- Cílem jsou zhruba 4 úrovně na kapitolu, celkem kolem 28.
- Kapitoly vznikají průběžně s milníky, ne až na konci.
- Každá úroveň má v repozitáři referenční řešení pro každou medaili a mosty, které spadnout mají. Automatický test ověří, že úroveň jde vyhrát a nejde vyhrát triviálně.
- Rozpočet úrovně se odvozuje z ceny referenčního řešení.
- Úrovně omezují stavební prostor (výška, průjezdný profil), aby obtížnost nestála jen na ceně.

---

## 11. Technická architektura

**Jazyk a nástroje:** TypeScript, Vite, Vitest, Playwright. Žádný herní framework ani fyzikální knihovna. Vykreslování v Canvas 2D, ovládací prvky v HTML a CSS.

**Vrstvy v `mostmistr/`**

| Složka | Obsah | Zná prohlížeč? |
|---|---|---|
| `src/jadro/` | Fyzika: konstrukce, integrátor, porušení, vozidla, lidé, maticové výpočty | Ne |
| `src/zkouska/` | Jízdní řád, fáze, hodnocení, medaile | Ne |
| `src/editor/` | Stavební režim, nástroje, zpět a znovu | Ano |
| `src/vykres/` | Vykreslování, kamera, výkresové prvky | Ano |
| `src/ui/` | Panely, časová osa, slovník textů | Ano |
| `urovne/` | Data úrovní a referenční řešení | — |
| `test/` | Ověřovací sada, regrese, vyhratelnost, průchod hrou | — |

**Rozhraní zkoušky**

- Vstup: návrh mostu, úroveň, násada náhody, verze fyziky a vstupy hráče s číslem kroku.
- Výstup: snímky stavu a události (porušení, průjezd, pád).
- Stejné rozhraní běží v Node při testech i ve Web Workeru ve hře. Vykreslování snímky prokládá.
- Záznam, přehrání, časová osa a bezhlavé ověřování z toho vyplývají samy.

**Formáty dat**

- Úroveň, návrh mostu a rekord mají číslo verze a řetěz převodů ze starších verzí.
- Schéma počítá s celým rozsahem hry od začátku. Prvky, které ještě nejsou hotové, kontrola odmítne.
- Rekordy se váží na úroveň a verzi fyziky. Ceny jsou jen v katalogu prvků.
- Návrh mostu jde exportovat a importovat jako text. Každý most, který mi pošleš, se může stát trvalým testem.

**Kontrola kvality**

- Před každým pushem rychlá sada: typová kontrola, ověřovací testy fyziky, regrese.
- Před každým milníkem plná sada: vyhratelnost všech úrovní a průchod hrou v bezhlavém prohlížeči, kdy test postaví most myší a vyhraje.

**Nasazení**

- Netlify nasazuje stálou větev `main` na stálou adresu. Uložený postup ve hře tak přežije.
- Za každý milník otevřu pull request. Netlify k němu vyrobí náhled; po tvém schválení se sloučí.
- `mostmistr/` má vlastní `package.json`, zámek závislostí a `netlify.toml` s pevnou verzí Node. Projekt v kořeni repozitáře zůstává nedotčený.
- Sestavení spouští typovou kontrolu a rychlé testy. Popisové pole ve hře ukazuje verzi sestavení.
- Jednorázové propojení repozitáře v Netlify uděláš ty (základní složka `mostmistr`).

**Návaznost mezi sessions**

Každá moje session začíná bez paměti. Proto v repozitáři povedu `mostmistr/CLAUDE.md` (příkazy, pravidla, rozhodnutí) a `docs/STAV.md` (co je hotovo, co je rozpracované, tvoje zpětná vazba s verzí sestavení).

---

## 12. Plán vývoje

Každý milník končí pull requestem a verzí, kterou si můžeš zahrát na Netlify.

| Milník | Obsah | Hotovo, když |
|---|---|---|
| **M0 Základy** | Kostra projektu, větev `main`, Netlify, sestavení s testy, modrákové plátno, kamera, rozhraní zkoušky, schémata dat | Na Netlify je výkres s rastrem, jde posouvat a zoomovat, popisové pole ukazuje verzi |
| **M1a Průzkum** | Měření kroku, tlumení a výkonu pro všechny prvky katalogu a tři referenční mosty | Tabulka výsledků a splněné kritérium rychlosti z kapitoly 7.3, nebo zvolená záloha |
| **M1b Jádro** | Prvky, klouby a svary, lana, pružiny, tlumiče, závaží, integrátor, porušení s plasticitou, maticová statika a vlastní tvary, ověřovací a regresní sada | Testy z kapitoly 7.10 procházejí v tolerancích. Na Netlify je „zkušebna“ s ověřovacími případy a ukazatelem rychlosti na tvém počítači. |
| **M2 První hratelná verze** | Editor, dřevo, mostovka, zkouška ve workeru, časová osa, barvy využití, obálka, osobní auto, chodec, kapitola 1, ukládání a export | Všechny úrovně projdou testem vyhratelnosti, test postaví most myší a vyhraje, uložení a načtení dá shodný otisk |
| **M3a Rezonance** | Běžec, útvar, lehká ocel, osa frekvencí, závaží, viskózní tlumič, komfort, brnknutí, kapitola 2 | Automatický test: útvar na vlastní frekvenci mnohonásobně zvýší zrychlení a tlumič ho vrátí pod limit komfortu |
| **M3z Zvuk** | Procedurálně generované zvuky: vrzání podle využití prutů, praskání a lámání při porušení, dopad a šplouchnutí, kroky a kola na mostovce; hlasitost a ztlumení. *(Předsunuto z M8 na přání zadavatele po prvním hraní M2.)* | Automatický test: každé porušení a pád vyvolá zvuk ve správném okamžiku záznamu, vrzání sílí s využitím, ztlumení se pamatuje a bez gesta hráče hra nevydá ani tón |
| **M3b Dav a analýza** | Dav, běžecký závod, průvod, skákající dav, laděný tlumič, analytický panel, rezonanční křivka, budič, grafy, záznam porušení, porovnání pokusů, kapitola 5 | Laděný tlumič v testu rozdělí rezonanční špičku; úrovně projdou testem vyhratelnosti |
| **M4a Těžká doprava** | Nákladní vozidla, autobus, souprava, obousměrný provoz, nerovnost vozovky, brzdění, těžká ocel, ocelobetonová mostovka, kapitola 3 | Dynamické zvýšení od nerovností odpovídá očekávanému rozsahu; úrovně projdou |
| **M4b Velká rozpětí** | Lana, napínák, automatické dopnutí, pilíře, svary v editoru, viditelné plastické klouby, kapitola 4 | Visutý a zavěšený referenční most unese kolonu kamionů; úrovně projdou |
| **M5 Železnice** | Kolejiště, lokomotiva, vagóny, dvoupatrové mosty, kapitola 6 | Nákladní vlak přejede referenční most; úrovně projdou |
| **M6 Pohyblivé mosty** | Písty, dělicí zámky, fáze na časové ose, lodě, kapitola 7 | Most se zvedne, loď propluje, most se sklopí, provoz pokračuje; úrovně projdou |
| **M7 Režimy** | Odemykání, medaile, úplný sandbox, výzvy včetně zkoušky do zlomu, nápověda | Test projde kampaň od první do poslední úrovně s referenčními řešeními |
| **M8 Doladění** | Výkon, dotykové ovládání, angličtina, doladění zvuku pro prvky a provoz z pozdějších kapitol | Největší úroveň drží 60 snímků za sekundu, všechny texty jsou ve slovníku v obou jazycích |

Tuhé spoje a plasticitu umí jádro od M1b, hráči se zpřístupní v M4b.

---

## 13. Rizika

| Riziko | Jak mu předejdu |
|---|---|
| Explicitní výpočet se skutečnými tuhostmi nemá rezervu | Měření jako první krok (M1a), jasné kritérium, tři připravené zálohy |
| Hru si sám nezahraji, ověřuji jen testy | Referenční řešení a test vyhratelnosti ke každé úrovni, průchod hrou v bezhlavém prohlížeči, tvoje exportované mosty jako testy |
| Nechtěná změna fyziky mezi verzemi | Regresní sada s otisky, číslo verze fyziky |
| Rezonanci jde obejít drobností | Buzení v pásmu kadencí, omezený stavební prostor, frekvence obsazeného mostu |
| Skutečné materiály jsou „příliš silné“ a hra je snadná | Obtížnost dělají rozpočet, rozpětí, omezený prostor a těžký provoz, ne oslabené materiály |
| Tuhé spoje udělají hádanky triviální | Cena svaru za každý prut, plastická únosnost, úrovně, kde nejsou povolené |
| Hráč nepochopí, proč most spadl kmitáním | Brnknutí a budič, dvě lávkové kapitoly, záznam porušení s vysvětlením |
| Rozsah je velký | Milníky s hratelným výstupem a měřitelným kritériem; po každém se můžeme rozhodnout, co dál |

---

## 14. Otevřené body

Žádné.

---

## 15. Změny proti verzi 0.1

Verzi 0.1 posoudili tři nezávislí recenzenti (fyzikální model, herní design, architektura a plán). Zapracováno:

**Opravy chyb**

- Synchronizace davu na svislé kmitání není doložená; nahrazena skutečnými zdroji synchronního zatížení.
- Počet kroků výpočtu opraven z 5–10 tisíc na 6–12 tisíc za sekundu; odhad výkonu nahrazen měřením a kritériem.
- Pevnosti materiálů změněny z normových na střední hodnoty; opraven modul a pevnost lana.
- Rychlost chůze svázána s krokovou frekvencí.
- Náhled obrazovky ukazoval prvky, které v dané kapitole nejsou odemčené.

**Hratelnost**

- Časová osa zkoušky s výpočtem napřed; obálka namáhání; porovnání pokusů.
- Brnknutí, budič a rezonanční křivka.
- Jedna barevná škála využití; žlutá jen pro varování.
- Rezonance v pásmu kadencí místo jedné frekvence.
- Kampaň v sedmi kapitolách, dynamika ve dvou krocích, dynamické téma v každé kapitole.
- Tři nezávislé medaile; nepřijatelné kmitání je neúspěch; výzvy s prahy a zkouškou do zlomu.
- Pravidla editoru: svar na styčník, pilíře jen na základech, zakázané zóny, posun, výběr a změna materiálu.

**Fyzika**

- Tvárné porušení oceli s plastickými klouby; kontrola smyku.
- Nerovnost vozovky a hladká dráha kola.
- Skryté dělení dlouhých prutů a lan; prvky se smykovou poddajností.
- Tlumení zadávané přímo vlastním tvarům.
- Šířka mostu a hmotnost vybavení v datech úrovně.
- Automatické dopnutí lan.
- Maticový výpočet statiky a vlastních tvarů.
- Zjednodušení: spřáhla bez vůle, trosky kolidují jen s terénem, loď jako průjezdný profil, vozidla s předepsanou rychlostí.

**Technika a plán**

- Simulace od začátku v samostatném vlákně s jednotným rozhraním zkoušky.
- Verzované formáty dat.
- Referenční řešení a test vyhratelnosti ke každé úrovni; regresní sada fyziky.
- Milníky rozdělené (M1a, M1b, M3a, M3b, M4a, M4b) a s měřitelnými kritérii.
- Nasazení přes stálou větev a pull requesty; poznámky pro návaznost mezi sessions.

**Nezapracováno z recenzí**

- Škrtání typů vozidel a dvoupatrových mostů: jde proti zadání.
- Odložení vlastních goniometrických funkcí: jsou levné a stojí na nich regresní testy.
- Dělení každého prutu na 2–4 úseky: výpočet by to ztrojnásobilo; dělí se jen tam, kde na tom záleží.
