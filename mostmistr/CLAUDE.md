# Mostmistr — pokyny pro práci v této složce

2D hra o stavění mostů s vlastním fyzikálním jádrem. Závazné zadání je `docs/KONCEPCE.md`.
**Než začneš, přečti `docs/STAV.md`**: říká, který milník je hotový, co je rozpracované a jakou zpětnou vazbu dal zadavatel. Na konci práce ho aktualizuj.

## Příkazy

Spouštěj ve složce `mostmistr/`.

- `npm run check` — typová kontrola všech tří konfigurací
- `npm test` — jednotkové testy
- `npm run build` — kontrola, testy a sestavení (totéž spouští Netlify)
- `npm run test:e2e` — sestavení a průchod hrou v bezhlavém prohlížeči; snímky do `test/e2e/vystup/` nebo do složky z proměnné `MM_SNIMKY`
- `MM_TRVANI=1000 npm run mereni` — měření výkonu jádra v bezhlavém prohlížeči; výsledky vypíše a uloží do `mereni.json` ve složce snímků
- `npm run otisky` — znovu zapíše otisky regresní sady; jen po vědomé změně fyziky (viz „Verze fyziky“)

Před každým pushem musí projít `npm run build` i `npm run test:e2e`. Po změně vzhledu si snímky prohlédni; testy nepoznají, že výkres vypadá špatně.

## Pravidla

- **Jazyk.** Zadavatel mluví česky. Identifikátory jsou česky bez diakritiky (`Stycnik`, `nakresliVykres`), komentáře a texty česky s diakritikou. Pojmy drž shodné s koncepcí.
- **Vrstvy.** `src/jadro/`, `src/data/` a většina `src/zkouska/` nesmí znát prohlížeč; hlídá to `tsconfig.jadro.json`. Fyzika i hodnocení zkoušky musí jít spustit v Node.
- **Rozhraní zkoušky.** Hra se simulací mluví jen zprávami z `src/zkouska/protokol.ts`. Stejné zprávy tečou přes Web Worker i v testech.
- **Žádná fyzikální knihovna ani herní framework.** Jádro je vlastní a ověřuje se proti analytickým řešením (koncepce, kap. 7.10).
- **Jednotky.** Metry, kilogramy, newtony, sekundy. Osa y světa míří nahoru. Rastr je 1 m.
- **Bitová shoda mezi prohlížeči.** Všechno, co vstupuje do simulace (`src/jadro/`, `src/data/katalog.ts`, `src/zkouska/stavba.ts`, `src/zkouska/regrese.ts`), smí počítat jen sčítáním, násobením, dělením a odmocninou. `Math.sin`, `Math.cos`, `Math.atan2`, `Math.hypot` ani operátor `**` nedávají všude stejné bity. Natočení se drží jako jednotkový vektor. V testech, zkušebně a kreslení goniometrie nevadí.
- **Pole v jádře.** Stav simulace je v plochých `Float64Array`; ve vnitřních smyčkách nic nealokuj.
- **Formáty dat mají verze.** Změna formátu úrovně nebo návrhu znamená zvýšit verzi, přidat převod do řetězu a ponechat starý soubor jako test. Ceny a vlastnosti prvků žijí jen v `src/data/katalog.ts`.
- **Verze fyziky.** `VERZE_FYZIKY` se zvyšuje, kdykoli se změní výsledek zkoušky stejného mostu. Pozná se to tak, že test `test/regrese.test.ts` ohlásí jiný otisk. Když je změna záměrná: zvyš verzi, popiš změnu v `docs/STAV.md` a zapiš otisky znovu (`npm run otisky`). Když záměrná není, je to chyba.
- **Simulace.** Zkoušku krokuje třída `Simulace` (`src/jadro/simulace.ts`): volí krok a tlumení, posuzuje namáhání, provádí porušení. Provoz a jiné vnější síly do ní vstupují rozhraním `Zatizeni`; kola a chodci jsou `Bremena`. Samotný `krok` integrátoru volej přímo jen v testech jádra.
- **Výchozí stav je rovnováha.** Před zkouškou se hledá `najdiRovnovahu`; konstrukce puštěná z nakreslené polohy by se rozezněla.
- **Úrovně.** Každá úroveň kampaně má v `urovne/reseni.ts` most pro každou medaili a mosty, které spadnout mají; `test/vyhratelnost.test.ts` hlídá, že dopadnou, jak mají. Po každé změně fyziky, katalogu nebo úrovně ho pusť: i oprava, která vypadá jen vizuálně, umí změnit, které mosty projdou.
- **Hra a zkouška.** Obrazovku úrovně řídí `src/hra/uroven.ts`. Každá zkouška dostane vlastní pracovní vlákno, které se po výsledku nebo zastavení ukončí; zprávy z opuštěné zkoušky tak nemůžou dorazit do nové. Výsledek a medaile se hráči ukazují až na konci přehrávání.
- **Rozbor při stavbě.** Vlastní frekvence pro osu frekvencí počítá `src/zkouska/rozbor.ts` v pomocném pracovním vlákně na zprávu `rozbor`; odpověď nese `id` žádosti a zastaralé se zahazují. Hlavní vlákno fyziku nepočítá.
- **Kmitání a komfort.** Zrychlení mostovky měří `src/jadro/komfort.ts`; nad 2,5 m/s² most neobstojí. Lidé na mostě ho sami tlumí, takže úrovně s rezonancí se ladí simulací, ne odhadem.
- **Každý nový prvek má ukázku.** Zadavatel chce, aby hráč pochopil, proč prvek potřebuje: úroveň, která učí něco nového, má v `urovne/ukazky.ts` dvojici mostů (bez prvku a s ním) a ve slovníku popisek `ukazka.<id>.*` a odstavec `skutecnost.<id>` o skutečných mostech. Fakta ověř vyhledáním; `test/ukazky.test.ts` hlídá, že ukázka předvádí, co tvrdí.
- **Háčky pro testy v prohlížeči.** `body[data-rezim]` (prehled, stavba, zkouska), `body[data-zkouska]` (pocita, hotovo, chyba), `body[data-otisk]`, `body[data-pruty]` a `canvas[data-kamera]` (střed a měřítko pohledu; podle něj test spočítá, kam kliknout). Neměň je bez úpravy `test/e2e/hra.e2e.ts`.
- **Texty.** Všechny texty pro hráče jdou přes `src/ui/slovnik.ts`.
- **Barvy.** Žlutá je vyhrazená pro varování. Využití prutů má jednu škálu bílá → žlutá → červená (`src/vykres/skala.ts`; legenda v `src/styly.css` má stejné zastávky); tlak plná čára, tah dvojitá.
- **Kořen repozitáře neměň.** Je v něm jiný, nesouvisející projekt.
- **Poctivé zástupné kusy.** Co ještě není hotové, to hra odmítne nebo neukáže. Nepředstírej výsledek, který nikdo nespočítal.

## Postup po milnících

Milníky a jejich kritéria jsou v koncepci, kap. 12. Každý milník končí pull requestem do větve `main`. Netlify k němu vyrobí náhled, zadavatel ho vyzkouší a po jeho schválení se sloučí. Hru si sám nezahraješ, proto ke každé úrovni patří referenční řešení a test vyhratelnosti.

## Prostředí

- Playwright je připnutý na verzi předinstalovanou v cloudovém kontejneru (1.63.0); jinou verzi neinstaluj, nenašla by prohlížeč.
- V kontejneru je jen Chromium. Shodu ve Firefoxu a Safari ověřuje zadavatel.
- Dokumentace Netlify (`docs.netlify.com`) z kontejneru není dostupná; vyhledávání funguje.
