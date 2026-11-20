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

Vedle hry se sestavují tři pomocné stránky:

| Stránka | K čemu je |
|---|---|
| `/zkusebna.html` | Ověřovací případy jádra s porovnáním s teorií |
| `/otisky.html` | Přepočítá regresní sadu v prohlížeči a porovná otisky; kontrola, že fyzika počítá všude stejně |
| `/mereni.html` | Měření rychlosti výpočtu na daném počítači |

## Struktura

| Složka | Obsah | Zná prohlížeč? |
|---|---|---|
| `src/jadro/` | Fyzika | Ne |
| `src/zkouska/` | Rozhraní zkoušky, stavba mostu z návrhu, záznam, regresní sada | Jen `klient.ts` a `pracovnik.ts` |
| `src/data/` | Formáty úrovní a návrhů mostů, katalog prvků | Ne |
| `src/zkusebna/` | Ověřovací případy jádra a stránka `zkusebna.html` | Jen `stranka.ts` a `pracovnik.ts` |
| `src/editor/` | Stavební režim (od milníku M2) | Ano |
| `src/vykres/` | Kreslení výkresu, kamera, ovládání | Ano |
| `src/ui/` | Texty, formátování, panely | Ano |
| `urovne/` | Data úrovní | — |
| `mereni/` | Měření výkonu, stránky `mereni.html` a `otisky.html` | Jen stránky a jejich pracovní vlákna |
| `test/` | Jednotkové testy a průchod hrou | — |

Vrstvy bez prohlížeče hlídá `tsconfig.jadro.json`: typová kontrola v nich odmítne cokoli z DOM.

## Nasazení

Netlify, základní složka `mostmistr`. Příkaz sestavení a výstupní složku určuje `netlify.toml`.
Stálá větev `main` se nasazuje na stálou adresu, každý pull request dostane vlastní náhled.
