# Mostmistr — stav vývoje

Poslední aktualizace: 20. 11. 2026

## Milníky

| Milník | Stav |
|---|---|
| M0 Základy | Hotovo, sloučeno do `main`, nasazeno na Netlify (20. 11. 2026) |
| M1a Průzkum (krok, tlumení, výkon) | Hotovo v kódu; kritérium splněno; čeká na schválení zadavatele |
| M1b Jádro | Nezačato |
| M2 První hratelná verze | Nezačato |
| M3a až M8 | Nezačato |

## M1a — výsledek

Podrobně v [`M1A-MERENI.md`](./M1A-MERENI.md). Stručně:

- Explicitní výpočet se skutečnými tuhostmi stačí: největší referenční most 7× až 12× rychleji než reálný čas, běžná úroveň přes 100×. Zálohy z koncepce nejsou potřeba.
- Krok určuje jen podélná vlna v nejkratším prutu: 1 600 až 6 400 kroků za sekundu.
- Tlumení: vlastním tvarům přímo, nejvyšším frekvencím přes tuhost (ξ = 0,1).
- Jádro nepoužívá goniometrické funkce.

**Co v jádře už je** (`src/jadro/`): korotační nosník se smykem a klouby, lano, soustředění hmot, velocity Verlet, tři druhy tlumení, volba kroku, hustá matice tuhosti, Newtonovo hledání rovnováhy s rozpoznáním mechanismu, vlastní tvary, nejvyšší frekvence. Pokryto 36 testy proti analytickým řešením.

**Co v jádře ještě není** (M1b): porušení a plasticita, pružina, tlumič a závaží jako prvky, skryté dělení prutů, zatížení mezi styčníky, kontakt a vozidla, regresní sada s otisky, ověřené hodnoty materiálů v katalogu, zkušebna.

**Měřicí nástroje** jsou ve složce `mereni/` a na stránce `/mereni.html`. Průřezy v `mereni/prurezy.ts` jsou předběžné.

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

- Formát rekordu: přijde s ukládáním v M2.
- Ceny a mechanické vlastnosti prvků v katalogu: v M1b po ověření proti normám. Do té doby má každý prvek `hotovo: false` a kontrola návrhu ho odmítne.
- Regresní sada s otisky: s jádrem v M1b. Vlastní goniometrické funkce nakonec potřeba nejsou (viz M1a).

## Co je potřeba od zadavatele

1. Otevřít hru na Netlify a potvrdit, že výkres z M0 funguje; poslat adresu projektu.
2. Na náhledu pull requestu M1a otevřít `/mereni.html`, spustit měření a poslat výsledky.
3. Schválit sloučení M1a do `main`.

## Další krok

M1b: dokončit jádro (viz „co v jádře ještě není“), ověřovací a regresní sada podle koncepce kap. 7.10, zkušebna na Netlify. Před začátkem ověřit hodnoty materiálů a průřezů proti normám.

## Zpětná vazba zadavatele

- 20. 11. 2026: první nasazení na Netlify selhalo, protože `main` tehdy složku `mostmistr` ještě neobsahovala; po sloučení M0 prošlo. K běžící hře zatím žádná zpětná vazba.

## Verze fyziky

| Verze | Změna |
|---|---|
| 0 | Jádro neexistuje |
