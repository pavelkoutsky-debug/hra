# Mostmistr — stav vývoje

Poslední aktualizace: 20. 11. 2026

## Milníky

| Milník | Stav |
|---|---|
| M0 Základy | Hotovo v kódu; čeká na propojení Netlify a potvrzení zadavatele |
| M1a Průzkum (krok, tlumení, výkon) | Nezačato |
| M1b Jádro | Nezačato |
| M2 První hratelná verze | Nezačato |
| M3a až M8 | Nezačato |

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

- **Nasazení na Netlify.** Konfiguraci jsem z kontejneru nemohl vyzkoušet. Kritérium milníku („na Netlify je výkres, jde posouvat a zoomovat, popisové pole ukazuje verzi“) potvrdí až zadavatel.
- **Jiné prohlížeče než Chromium.**
- **Ovládání touchpadem.** Kolečko i dvouprstý posun teď zoomují; posun je pravým tlačítkem, mezerníkem s tažením nebo šipkami.

## Vědomě odloženo

- Formát rekordu: přijde s ukládáním v M2.
- Ceny a mechanické vlastnosti prvků v katalogu: v M1b po ověření proti normám. Do té doby má každý prvek `hotovo: false` a kontrola návrhu ho odmítne.
- Vlastní goniometrické funkce a regresní sada s otisky: s jádrem v M1b.

## Co je potřeba od zadavatele

1. V Netlify založit projekt z repozitáře `pavelkoutsky-debug/hra`: základní složka (Base directory) `mostmistr`, produkční větev `main`.
2. Otevřít náhled u pull requestu M0 a potvrdit, že výkres funguje.
3. Schválit sloučení M0 do `main`.

## Další krok

M1a: změřit potřebný počet kroků výpočtu, variantu tlumení a výkon pro všechny prvky katalogu a tři referenční mosty. Kritérium a zálohy jsou v koncepci, kap. 7.3.

## Zpětná vazba zadavatele

Zatím žádná k běžící hře.

## Verze fyziky

| Verze | Změna |
|---|---|
| 0 | Jádro neexistuje |
