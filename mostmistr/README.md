# Mostmistr

2D stavění mostů do prohlížeče, kreslené jako technický výkres, s vlastním fyzikálním jádrem.
Hráč navrhne most, spustí zatěžovací zkoušku a sleduje, jestli přes něj přejdou lidé, přejedou auta a projede vlak.

- Koncepce hry: [`docs/KONCEPCE.md`](docs/KONCEPCE.md)
- Co je hotovo a co se chystá: [`docs/STAV.md`](docs/STAV.md)
- Měření kroku, tlumení a výkonu fyziky: [`docs/M1A-MERENI.md`](docs/M1A-MERENI.md)
- Fyzikální jádro a jeho ověření proti teorii: [`docs/M1B-JADRO.md`](docs/M1B-JADRO.md)

Projekt žije v podsložce repozitáře a je nezávislý na projektu v jeho kořeni.

## Vývoj

```bash
npm install
```

```bash
npm run dev
```

| Příkaz | Co dělá |
|---|---|
| `npm run dev` | Vývojový server s okamžitým promítnutím změn |
| `npm run check` | Typová kontrola (hra, vrstvy bez prohlížeče, testy a konfigurace) |
| `npm test` | Jednotkové testy |
| `npm run build` | Typová kontrola, jednotkové testy a sestavení do `dist/` |
| `npm run test:e2e` | Sestavení a průchod hrou v bezhlavém prohlížeči |
| `npm run preview` | Náhled hotového sestavení |
| `npm run mereni` | Měření výkonu fyzikálního jádra v bezhlavém prohlížeči |
| `npm run otisky` | Znovu zapíše otisky regresní sady (jen po vědomé změně fyziky) |

Průchod hrou potřebuje Chromium pro Playwright (`npx playwright install chromium`).
Snímky obrazovky ukládá do `test/e2e/vystup/`.

Hra je na stránce `/`: bez parametru ukáže přehled kampaně, s `?uroven=1-02` otevře úroveň.
Zkušební výkres `?uroven=0-00` do kampaně nepatří a slouží testům výkresu.

Vedle hry se sestavují čtyři pomocné stránky:

| Stránka | K čemu je |
|---|---|
| `/zkusebna.html` | Ověřovací případy jádra s porovnáním s teorií |
| `/otisky.html` | Přepočítá regresní sadu v prohlížeči a porovná otisky; kontrola, že fyzika počítá všude stejně |
| `/mereni.html` | Měření rychlosti výpočtu na daném počítači |
| `/zvuky.html` | Každý zvuk hry jde pustit zvlášť; tabulka změřené hlasitosti, délky a barvy |

## Struktura

| Složka | Obsah | Zná prohlížeč? |
|---|---|---|
| `src/jadro/` | Fyzika | Ne |
| `src/zkouska/` | Rozhraní zkoušky, stavba mostu z návrhu, provoz a vozidla, zkouška úrovně, rozbor vlastních frekvencí, záznam, regresní sada | Jen `klient.ts` a `pracovnik.ts` |
| `src/data/` | Formáty úrovní, návrhů mostů a uloženého postupu, katalog prvků, ceny | Ne |
| `src/zkusebna/` | Ověřovací případy jádra a stránka `zkusebna.html` | Jen `stranka.ts` a `pracovnik.ts` |
| `src/editor/` | Stavební režim: úpravy návrhu, pravidla kreslení, výběr, historie | Ne (neví nic o plátně) |
| `src/hra/` | Obrazovka úrovně, přehled kampaně, ukládání do paměti prohlížeče | Ano |
| `src/zvuk/` | Zvuk: co má při přehrávání záznamu zaznít (`deje.ts`), syntezátor a zvukový kontext | `deje.ts` ne, zbytek ano |
| `src/vykres/` | Kreslení výkresu, kamera, ovládání | Ano |
| `src/ui/` | Texty, formátování, panely | Ano |
| `urovne/` | Data úrovní a jejich referenční řešení | — |
| `mereni/` | Měření výkonu, stránky `mereni.html`, `otisky.html` a `zvuky.html` | Jen stránky a jejich pracovní vlákna |
| `test/` | Jednotkové testy a průchod hrou | — |

Vrstvy bez prohlížeče hlídá `tsconfig.jadro.json`: typová kontrola v nich odmítne cokoli z DOM.

## Nasazení

Netlify, základní složka `mostmistr`. Příkaz sestavení a výstupní složku určuje `netlify.toml`.
Stálá větev `main` se nasazuje na stálou adresu, každý pull request dostane vlastní náhled.
