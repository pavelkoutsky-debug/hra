# Mostmistr — stav vývoje

Poslední aktualizace: 20. 11. 2026

## Milníky

| Milník | Stav |
|---|---|
| M0 Základy | Hotovo, sloučeno do `main`, nasazeno na Netlify (20. 11. 2026) |
| M1a Průzkum (krok, tlumení, výkon) | Hotovo, sloučeno do `main`; kritérium splněno i na počítači zadavatele |
| M1b Jádro | Hotovo, sloučeno do `main` (20. 11. 2026) |
| M2 První hratelná verze | Rozpracováno |
| M3a až M8 | Nezačato |

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

- Zkouška úrovně s jízdním řádem, vozidla s karoserií, hodnocení průjezdu a komfortu: M2. `BehZkousky` do té doby zkoušku odmítá chybou `zkouska-neni-hotova`.
- Kolize trosek s terénem: M2. Nerovnost vozovky: M4a. Výchozí poloha povolených lan ustálením v čase: M4b. Píst: M6.
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
- **Ovládání touchpadem.** Kolečko i dvouprstý posun teď zoomují; posun je pravým tlačítkem, mezerníkem s tažením nebo šipkami.

## Vědomě odloženo

- Formát rekordu a ceny prvků: přijdou s ukládáním a rozpočtem v M2.
- Ověření hodnot materiálů proti zdrojovým normám: z vývojového prostředí se normy otevřít nepodařilo; u každé hodnoty je v katalogu poznamenáno, zda je potvrzená.

## Co je potřeba od zadavatele

1. Na náhledu pull requestu M1b otevřít `/zkusebna.html` a projít případy; hlavně jestli zřícení a kmitání vypadají věrohodně.
2. Otevřít `/otisky.html`, ideálně i ve Firefoxu nebo Safari, a poslat výsledek (stačí věta „všech 20 souhlasí“, při neshodě zkopírované výsledky).
3. Pustit znovu `/mereni.html`; čísla teď zahrnují úplné jádro.
4. Schválit sloučení M1b do `main`.

## Další krok

M2, první hratelná verze: editor, zkouška ve workeru s osobním autem a chodcem, časová osa, kapitola 1, ukládání. Před začátkem: ceny prvků a kolize trosek s terénem.

## Zpětná vazba zadavatele

- 20. 11. 2026: první nasazení na Netlify selhalo, protože `main` tehdy složku `mostmistr` ještě neobsahovala; po sloučení M0 prošlo. K běžící hře zatím žádná zpětná vazba.
- 20. 11. 2026: zadavatel pustil `/mereni.html` na svém počítači (Chrome 157, Windows, sestavení `0.2.0 e4e2146`); výsledky jsou v `M1A-MERENI.md`. Projekt na Netlify se jmenuje `mostmistr`, náhledy mají adresu `deploy-preview-N--mostmistr.netlify.app`.
- Rozhodnutí zadavatele: pull requesty sledovat a selhání sestavení opravovat samostatně; slučovat jen s jeho souhlasem.

## Verze fyziky

| Verze | Změna |
|---|---|
| 0 | Jádro neexistuje |
| 1 | První úplné jádro (M1b): nosník se smykem, lano, pružina s tlumičem, plasticita, porušení, pohyblivé zatížení, skryté dělení prutů |
| 2 | Kalibrace první kapitoly (M2): štíhlejší průřezy dřeva (lehký trám 2× 60 × 120 mm, těžký 2× 120 × 240 mm, mostovka z fošen 80 mm). Styčník, který po porušení osiří, se zastaví. |
