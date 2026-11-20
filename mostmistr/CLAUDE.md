# Mostmistr — pokyny pro práci v této složce

2D hra o stavění mostů s vlastním fyzikálním jádrem. Závazné zadání je `docs/KONCEPCE.md`.
**Než začneš, přečti `docs/STAV.md`**: říká, který milník je hotový, co je rozpracované a jakou zpětnou vazbu dal zadavatel. Na konci práce ho aktualizuj.

## Příkazy

Spouštěj ve složce `mostmistr/`.

- `npm run check` — typová kontrola všech tří konfigurací
- `npm test` — jednotkové testy
- `npm run build` — kontrola, testy a sestavení (totéž spouští Netlify)
- `npm run test:e2e` — sestavení a průchod hrou v bezhlavém prohlížeči; snímky do `test/e2e/vystup/` nebo do složky z proměnné `MM_SNIMKY`

Před každým pushem musí projít `npm run build` i `npm run test:e2e`. Po změně vzhledu si snímky prohlédni; testy nepoznají, že výkres vypadá špatně.

## Pravidla

- **Jazyk.** Zadavatel mluví česky. Identifikátory jsou česky bez diakritiky (`Stycnik`, `nakresliVykres`), komentáře a texty česky s diakritikou. Pojmy drž shodné s koncepcí.
- **Vrstvy.** `src/jadro/`, `src/data/` a většina `src/zkouska/` nesmí znát prohlížeč; hlídá to `tsconfig.jadro.json`. Fyzika i hodnocení zkoušky musí jít spustit v Node.
- **Rozhraní zkoušky.** Hra se simulací mluví jen zprávami z `src/zkouska/protokol.ts`. Stejné zprávy tečou přes Web Worker i v testech.
- **Žádná fyzikální knihovna ani herní framework.** Jádro je vlastní a ověřuje se proti analytickým řešením (koncepce, kap. 7.10).
- **Jednotky.** Metry, kilogramy, newtony, sekundy. Osa y světa míří nahoru. Rastr je 1 m.
- **Formáty dat mají verze.** Změna formátu úrovně nebo návrhu znamená zvýšit verzi, přidat převod do řetězu a ponechat starý soubor jako test. Ceny a vlastnosti prvků žijí jen v `src/data/katalog.ts`.
- **Verze fyziky.** `VERZE_FYZIKY` se zvyšuje, kdykoli se změní výsledek zkoušky stejného mostu. Změnu popiš v `docs/STAV.md`.
- **Texty.** Všechny texty pro hráče jdou přes `src/ui/slovnik.ts`.
- **Barvy.** Žlutá je vyhrazená pro varování. Využití prutů má jednu škálu bílá → žlutá → červená; tlak plná čára, tah dvojitá.
- **Kořen repozitáře neměň.** Je v něm jiný, nesouvisející projekt.
- **Poctivé zástupné kusy.** Co ještě není hotové, to hra odmítne nebo neukáže. Nepředstírej výsledek, který nikdo nespočítal.

## Postup po milnících

Milníky a jejich kritéria jsou v koncepci, kap. 12. Každý milník končí pull requestem do větve `main`. Netlify k němu vyrobí náhled, zadavatel ho vyzkouší a po jeho schválení se sloučí. Hru si sám nezahraješ, proto ke každé úrovni patří referenční řešení a test vyhratelnosti.

## Prostředí

- Playwright je připnutý na verzi předinstalovanou v cloudovém kontejneru (1.63.0); jinou verzi neinstaluj, nenašla by prohlížeč.
- V kontejneru je jen Chromium. Shodu ve Firefoxu a Safari ověřuje zadavatel.
- Dokumentace Netlify (`docs.netlify.com`) z kontejneru není dostupná; vyhledávání funguje.
