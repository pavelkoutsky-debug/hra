# Mostmistr — nezávislá recenze hry (23. 11. 2026)

Výtah z recenze, kterou si zadavatel nechal po dokončení M8 udělat „s odstupem“: jedno vlastní
hraní všech kapitol a dva nezávislí hráči bez znalosti kódu. Celý text s obrázky má zadavatel
jako dokument; tady je to, na co se odkazují milníky M10 až M16 (koncepce, kap. 12).
Verdikt recenze: 7 z 10. Fyzika a technické provedení jsou silné, slabé je to, co hra hráči
řekne a ukáže.

## Co nefunguje nebo mate
Nejvážnější problémy nejsou ve fyzice, ale v tom, co hra hráči řekne a ukáže. Řazeno podle závažnosti pro hráče.
### 1. Nestabilní most dostane vždy stejnou odbornou větu
Tři různé chyby (jen mostovka, střecha bez sloupku, zvětšená střecha v 1-03) skončily doslova stejným textem: „Most nemá pod vlastní tíhou klidovou polohu: některé styčníky nic nepodpírá, nebo chybí ztužení.“
- Hra neukáže, které místo se skládá. Dovětek „jako první sjel konec mostu z posuvné podpory“ vede špatným směrem.
- Je to nejčastější chyba začátečníka a „klidová poloha“ ani „ztužení“ nejsou slova hráče.
- Hra o nestabilitě ví už při stavbě: osa frekvencí u takového mostu píše „most zatím nemá vlastní kmitání“.
### 2. Nástroje kmitání neříkají totéž co zkouška
V kapitolách 2 a 5, tedy v nejoriginálnější části hry, se oba hráči zasekli na tomtéž: udělali, co zadání radí, a výsledek se zhoršil nebo nezměnil.
- 2-02: dva mosty naladěné podle zadání (osa bez varování, 5,09 a 7,32 Hz) propadly s kmitáním 3,98 a 3,95 m/s². Most z nápovědy na 5,30 Hz prošel.
- Příčina, ověřená v modelu: síla kroku má tři harmonické složky, osa ale ukazuje jen krok, jeho dvojnásobek a jedinou vlastní frekvenci mostu. Končí navíc na 6 Hz.
- 5-02: zadání říká naladit tlumič na frekvenci mostu s lidmi. Osa ukazovala 2,18 Hz, jenže to už je číslo i s tlumičem. Přeladění kmitání zhoršilo z 1,42 na 1,82 m/s²; holý most má 2,48 Hz.
- Čtyři čísla pro jeden most: Budič 2,90 Hz, Brnknutí 4,23 Hz, špička křivky 2,65 Hz, osa 2,07 Hz.
- Kmitání není vidět. Při „nepřijatelných“ 4,76 m/s² most na obrazovce stojí a mění se jen číslo v legendě: výchylka kolem 1 cm je zlomek pixelu. Ukázky v zadání pohyb zvětšují, zkouška ne.

Úroveň 2-02, most prvního hráče naladěný podle zadání: „Most neobstál“ kvůli kmitání 3,98 m/s². Na výkresu není pohyb vidět a hra neřekne, který rytmus se trefil.
### 3. Výhra a prohra nemají váhu a výsledek zakrývá most
Okno výsledku zakryje pravou polovinu mostu přesně ve chvíli, kdy má hráč vidět, že stojí.
- V okně jsou 3 medaile, 3 výzvy po třech stupních, 4 měření se srovnáním, 5 až 6 tlačítek a „otisk“ s hashem.
- Úspěch a neúspěch se liší jen nadpisem a tlačítkem „Další úroveň“.
- Po poslední úrovni přibude v přehledu jediný pruh textu „Kampaň dokončena“.
- Po pádu vozidla a chodci spořádaně stojí na dně rokle.

Výhra v 1-01 v okně 1440 × 900: okno výsledku leží přes pravou polovinu mostu, který právě obstál.
### 4. Medaile a výzvy neměří to, co slibují
- Mistrovská bývá ze tří nejlehčí. V 3-01 a 6-01 padla na první pokus: stačí stavět s rezervou, na cenu se nehledí. Limity (9 %, 32 %, 57 %) působí nahodile.
- Rozpočtovou dostal most, kterému prut povolil v čase 0. Hra k tomu napsala „Most obstál, i když prut 6 nevydržel“. Ověřeno na snímku.
- Zlato výzev padá bez snahy. „O 26 % lepší než most autora“ v 1-01, zlato za nejlehčí most v 3-01 (mostovka váží 100 t ze 108 t), „o 9 % lepší“ v 6-01.
- Tři medaile jdou získat třemi různými mosty. „Levně a zároveň bezpečně“ hra nikdy nechce.

Úroveň 3-01, most druhého hráče: největší využití 102 %, prut 6 povolil vzpěrem v čase 0,0 s, a přesto „Most obstál“ s medailí za rozpočet.
### 5. Průchod je snadný a lekce se nevynucují
- První hráč prošel úrovně 1-02 až 1-04 na první pokus; 1-03 bez těžkého trámu, o který v úrovni jde.
- Druhý hráč prošel 4-03 i bez dopnutí lan (43 % bez, 44 % s ním). Mechanika, kterou úroveň představuje, na výsledek neměla vliv.
- Průchozí mosty v kapitole 1 měly využití 7 až 45 %, takže barevná škála zůstává bledá a prut za provozu skoro nikdy nepraskne.
- Zadání často řešení rovnou popíše („vzpěra z kotvy“).
### 6. Stěny textu a odborná slova
- Okno zadání má 244 slov už na první úrovni a 411 až 441 slov v 4-04, 6-03 a 7-04 (změřeno). Pravý sloupec se do okna nevejde.
- „Pás“, „vzpěr“, „využití“, „kloub“ nikde nejsou vysvětlené.
- Úrovně 1-02 až 2-01 nemají ukázku, ačkoli zavádějí nové věci.
### 7. Vývojářské věci v hráčském rozhraní
- „Zkušebna“ v hlavním menu je ověřovací laboratoř řešiče, ne herní režim.
- „Diagnostika“ vedle „Upravit most“ slibuje rozbor, ale otevře výpis pro hlášení chyb.
- „Otisk“ s hashem, „FYZIKA v8“, hash verze a zaškrtávátko „Odemknout všechny úrovně (pro testování)“.
- První věta, kterou nový hráč čte, je oznámení o záznamu hraní.
### 8. Čitelnost a rozložení
- Při 93 prutech (5-01) štítky s procenty most zakryjí; volba je jen vše, nebo nic.
- Paleta se od kapitoly 4 nevejde na výšku 900 px; v Pískovišti má asi 1 860 px a nástroje jsou až dole.
- Písmo 9 až 11 px je ve 29 pravidlech stylu (změřeno); název úrovně v liště a jízdní řád jsou uříznuté.
### 9. Stavba kampaně
- Mechaniky se představí a zahodí: lana zmizí po kapitole 4, tlumiče po 5, vlak po 6. Žádná úroveň je nekombinuje.
- Kapitola 7 je rozsahem stavby nejmenší, takže závěr působí jako dovětek.
- Úrovně se odemykají přísně po jedné. Zásek v 4-04 zavře i lávky a vlaky, které na něj nenavazují.
### 10. Drobné chyby a tření
- Změna materiálu číslem ani Shift+klik nejsou nikde napsané; řádek rad pod výkresem je stejný pro všechny nástroje.
- Po Importu zůstane pozornost na tlačítku a mezerník místo zkoušky znovu otevře Import.
- Do zlomu po návratu do úrovně hlásí, že most „ještě neprošel“, i když za něj hráč má medaile.
- „Přešli a přejeli všichni (4)“ a zároveň „autobus po celém mostě nepřejel“; změna 43 % na 44 % se vypíše jako „rozdíl +2 %“.
- Tah 5 m se rozdělí na 5 × 1 m; po zavření Analýzy zůstane výsledek sbalený a „Další úroveň“ schované.
- Dlouhé zkoušky: 5-01 trvá 83 s, 2-04 78 s, Budič 81 s při rychlosti 1×.

## Doporučení a kam se zařadila

Zadavatel 23. 11. 2026 rozhodl zařadit všechna doporučení (balíčky A, B i C recenze).

| Č. | Návrh | Přínos | Pracnost | Řeší | Milník |
|---|---|---|---|---|---|
| 1 | Kontrola stability už při stavbě a konkrétní rozbor pádu. Zvýraznit pole nebo styčník, který se složí; věty podle příčiny | velký | střední | problém 1 | M10 |
| 2 | Kompaktní výsledek s razítkem. Verdikt, medaile, jedna věta a „Další úroveň“ v pruhu mimo most; razítko SCHVÁLENO nebo ZAMÍTNUTO do rohu výkresu; čísla na rozkliknutí | velký | malá až střední | problém 3 | M10 |
| 3 | Sjednotit nástroje kmitání. Osa se všemi tvary a harmonickými, které rozhodují; frekvence holého mostu pro ladění tlumiče; stejné číslo z Brnknutí, Budiče i osy; zvětšený pohyb při zkoušce | velký | střední | problém 2 | M11 |
| 4 | Přestavět medaile. Mistrovská chce rezervu i rozpočet zároveň; rozpočtová jen pro most bez povoleného prutu; zlato výzev nad most autora | velký | malá až střední | problém 4 | M12 |
| 5 | Uklidit vývojářské prvky. Zkušebna do patičky, „Diagnostika“ jako „Nahlásit chybu“, schovat otisk a testovací odemykání, oznámení o záznamu až pod nadpis | střední | malá | problém 7 | M10 |
| 6 | Třístupňová nápověda. Nejdřív princip jednou větou a skicou, pak materiál, nakonec obrys; zvlášť nápověda k medailím | velký | malá až střední | problémy 1 a 5 | M11 |
| 7 | Kratší zadání. Dvě věty a ukázka, zbytek pod „Více“; ukázka v každé úrovni, která něco zavádí; slovníček pojmů na kliknutí | střední | střední | problém 6 | M12 |
| 8 | Vedený první krok v 1-01. Duch prvního prutu „táhni odsud sem“, popisek pevné a posuvné podpory | střední | střední | problémy 1 a 6 | M12 |
| 9 | Přeladit kapitolu 1 a vynutit lekce. Využití průchozích mostů 60 až 90 %; v 1-03 potřeba těžkého trámu, v 4-03 potřeba dopnutí lan | střední | malá až střední | problém 5 | M12 |
| 10 | Odemykání po kapitolách. Další kapitola po dvou úrovních ze čtyř | střední | malá | problém 9 | M12 |
| 11 | Čitelnost. Štítky jen u nejvytíženějších prutů, paleta a zadání na výšku 900 px, rady podle zvoleného nástroje, údaje o vybraném prutu | střední | střední | problémy 8 a 10 | M11 |
| 12 | Opravit drobné chyby. Pozornost po Importu, Do zlomu po návratu, zaokrouhlení rozdílu, dělení 5 m, sbalený výsledek po Analýze | malý až střední | malá | problém 10 | M10 |
| 13 | Sdílení mostu odkazem a výzva „překonej mou cenu“. Export a Import už existují, chybí odkaz a obrázek výkresu | velký | malá až střední | důvod se vrátit | M13 |
| 14 | Finále kampaně a závěrečná kapitola, která kombinuje mechaniky. Zavěšený železniční most, lávka na lanech s tlumičem, zvedací most s vlakem; na konci list se souhrnem a galerií mostů | velký | střední až velká | problémy 3 a 9 | M14 |
| 15 | Těžké varianty údolí a zkouškové úrovně bez návodu. Poloviční rozpočet, těžší provoz, bez jedné podpory | střední až velký | střední | problém 5 | M12 |
| 16 | Podívaná při pádu. Samočinné zpomalení a přiblížení prvního porušení, šplouchnutí, trosky | střední | střední | problém 3 | M10 |
| 17 | Pískoviště jako dílna. Víc uložených mostů s náhledem, hotová údolí na jeden klik, písty a lodě, volitelný cíl, sdílení scénáře | střední | střední až velká | obsah | M15 |
| 18 | Nový režim Havarijní komise. Dostaneš cizí most, který spadl; najdi příčinu a oprav ho nejvýš třemi změnami | velký | střední až velká | obsah | M15 |
| 19 | Žebříčky tří měřítek na úroveň. Výsledek je deterministický a má otisk, takže jde ověřit | velký | velká | důvod se vrátit | M16 |
| 20 | Zkrátit hluché časy dlouhých zkoušek. Samočinně zrychlit, dokud se nic neděje | malý | malá | problém 10 | M12 |

K návrhu 16 zadavatel přidal vlastní zadání: zpomalení a přiblížení místa, které povolilo
první („bullet time“), musí jít vypnout. K návrhu 19 přidal automatický rozbor zpětné vazby
a deníku hraní jednou za 24 hodin s návrhy dalších verzí.
