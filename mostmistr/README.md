# Mostmistr

2D stavění mostů do prohlížeče, kreslené jako technický výkres, s vlastním fyzikálním jádrem.
Hráč navrhne most, spustí zatěžovací zkoušku a sleduje, jestli přes něj přejdou lidé, přejedou auta a projede vlak.

- Koncepce hry: [`docs/KONCEPCE.md`](docs/KONCEPCE.md)
- Co je hotovo a co se chystá: [`docs/STAV.md`](docs/STAV.md)

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

Průchod hrou potřebuje Chromium pro Playwright (`npx playwright install chromium`).
Snímky obrazovky ukládá do `test/e2e/vystup/`.

## Struktura

| Složka | Obsah | Zná prohlížeč? |
|---|---|---|
| `src/jadro/` | Fyzika | Ne |
| `src/zkouska/` | Rozhraní zkoušky, běh simulace, pracovní vlákno | Jen `klient.ts` a `pracovnik.ts` |
| `src/data/` | Formáty úrovní a návrhů mostů, katalog prvků | Ne |
| `src/editor/` | Stavební režim (od milníku M2) | Ano |
| `src/vykres/` | Kreslení výkresu, kamera, ovládání | Ano |
| `src/ui/` | Texty, formátování, panely | Ano |
| `urovne/` | Data úrovní | — |
| `test/` | Jednotkové testy a průchod hrou | — |

Vrstvy bez prohlížeče hlídá `tsconfig.jadro.json`: typová kontrola v nich odmítne cokoli z DOM.

## Nasazení

Netlify, základní složka `mostmistr`. Příkaz sestavení a výstupní složku určuje `netlify.toml`.
Stálá větev `main` se nasazuje na stálou adresu, každý pull request dostane vlastní náhled.
