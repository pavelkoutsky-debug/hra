# Mostmistr — M1a: měření kroku, tlumení a výkonu

20. 11. 2026 · výstup milníku M1a (koncepce, kap. 7.3 a 12)

## Závěr

**Kritérium je splněno, žádná ze záloh není potřeba.** Explicitní výpočet se skutečnými tuhostmi materiálů stačí:

| Kritérium | Požadavek | Naměřeno |
|---|---|---|
| Největší referenční most (300 styčníků, 597 prutů, 60 kol) | aspoň 3× rychleji než reálný čas | 7,4× se svařenými styčníky, 12× s kloubovými |
| Běžná úroveň kampaně (26 styčníků, 49 prutů, 12 kol) | aspoň 10× | 100× až 175× |

Měřeno v bezhlavém Chromiu 157 na jednom jádře procesoru Xeon 2,1 GHz. To je spíš pomalejší stroj než běžný notebook, ale **na tvém počítači to ověřené není**. Stránka `/mereni.html` to změří za deset sekund.

Čísla zahrnují most, kola a obě tlumení. Nezahrnují kontrolu porušení, plný model vozidel, chodce ani skryté dělení dlouhých prutů. Odhaduji, že to krok prodraží nejvýš dvakrát až třikrát; u běžných úrovní zbývá rezerva o řád, u největšího mostu se svařenými styčníky by se rezerva vyčerpala. Skutečnou cenu změří M1b.

## Co jsem zjistil

### 1. Krok výpočtu určuje jen podélná vlna v nejkratším prutu

Explicitní integrace je stabilní jen s krokem kratším, než za jaký proběhne vlna nejkratším prutem. U svařených prutů hrozilo, že mez bude určovat příčné kmitání a kroků bude potřeba až čtyřikrát víc (na to upozornila recenze).

Vyřešily to dvě věci:

- **Nosník se smykovou poddajností.** Krátké tlusté pruty jsou díky ní v ohybu měkčí, tak jako ve skutečnosti.
- **Pravidlo pro rotační setrvačnost.** Každý tuhý konec prutu dostane nejmenší rotační setrvačnost, při které ohybové kmitání prutu ještě nepřevýší podélné. Vzorec je odvozený a v testech ověřený: samotný prvek má nejvyšší frekvenci rovnou osové na čtyři desetinná místa, pro kloubové i svařené konce.

Potřebný počet kroků na sekundu děje (včetně rezervy a tlumení nejvyšších frekvencí, pro samotný prvek, tedy nejhorší případ):

| Prvek | Rychlost vlny | Prut 1 m | Prut 2 m | Prut 4 m |
|---|---|---|---|---|
| Dřevěný trám (oba průřezy) | 5 230 m/s | 6 420 | 3 210 | 1 610 |
| Ocelový nosník (oba průřezy) | 5 170 m/s | 6 350 | 3 180 | 1 590 |
| Ocelové lano (napnuté) | 4 340 m/s | 5 330 | 2 670 | 1 330 |
| Dřevěná mostovka | 4 280 m/s | 5 250 | 2 630 | 1 310 |
| Betonový pilíř 1 × 1 m | 3 630 m/s | 4 460 | 2 230 | 1 120 |
| Ocelobetonová mostovka | 3 190 m/s | 3 910 | 1 960 | 980 |
| Kolejiště | 2 950 m/s | 3 620 | 1 810 | 910 |

Rozhoduje délka nejkratšího prutu v mostě, ne průřez. Most bez metrových prutů se počítá dvakrát rychleji. V sestavené konstrukci mají styčníky hmotu od více prutů a kroků je potřeba ještě o něco méně (referenční mosty: 2 300 až 4 400).

Průřezy jsou předběžné, z běžných tabulek; do katalogu přijdou v M1b po ověření proti normám. Na výsledek to nemá vliv, protože rychlost vlny je vlastnost materiálu.

### 2. Dlouhé pruty stačí dělit na málo dílů

Chyba vlastních frekvencí prostého nosníku 12 m proti přesnému řešení:

| Počet dílů | 1. frekvence | 2. frekvence | 3. frekvence |
|---|---|---|---|
| 2 | −0,8 % | — | — |
| 3 | −0,2 % | −3,5 % | — |
| 4 | −0,1 % | −1,0 % | −6,6 % |
| 6 | −0,1 % | −0,4 % | −1,4 % |

Pomlčka znamená, že tolik dílů daný tvar zachytit neumí. S obvyklým soustředěním rotační setrvačnosti (m·L²/24) by chyba první frekvence byla −9,3 % při dvou dílech a −2,5 % při čtyřech. Pravidlo z bodu 1 tedy zároveň výrazně zpřesňuje výpočet.

Důsledek pro skryté dělení: prut, jehož vlastní kmitání spadá do pásma zájmu, stačí rozdělit na dva díly, velmi dlouhý na čtyři.

### 3. Tlumení: vlastním tvarům přímo, nejvyšším frekvencím přes tuhost

Ověřil jsem tři varianty; u všech naměřený útlum odpovídá teorii na setiny.

| Varianta | Co dělá | Cena |
|---|---|---|
| Úměrné hmotě | Tlumí hlavně nejnižší tvar; druhý tvar nosníku už jen čtvrtinově | žádná |
| Úměrné tuhosti | Tlumí hlavně vysoké frekvence; zkracuje krok | viz tabulka níže |
| Vlastním tvarům | Každý z prvních deseti tvarů dostane přesně zadaný útlum | největší most +16 %; malé mosty až dvojnásobek |

Zkrácení kroku tlumením úměrným tuhosti, podle útlumu ξ, který dostane nejvyšší frekvence soustavy. Měření sedí se vzorcem √(1 + ξ²) − ξ na tři desetinná místa:

| Útlum nejvyšší frekvence ξ | 0,05 | 0,1 | 0,2 | 0,5 | 1 | 2 | 4 |
|---|---|---|---|---|---|---|---|
| Kroků navíc | 5 % | 10 % | 22 % | 62 % | 2,4× | 4,2× | 8,1× |

Tlumit půl procentem frekvenci 2 Hz jen přes tuhost by znamenalo ξ ≈ 4, tedy osmkrát víc kroků. To potvrzuje výpočet z recenze.

**Rozhodnutí:** tlumení vlastních tvarů pro prvních deset tvarů, k tomu tlumení úměrné tuhosti s ξ = 0,1 jen proti numerickému zvonění. Krok se volí jako 0,9 meze stability. Dohromady to stojí o 23 % kroků víc než holá mez.

Rozklad ceny jednoho kroku u největšího svařeného mostu: konstrukce 74 %, tlumení přes tuhost 10 %, tlumení vlastních tvarů 12 %, šedesát kol 4 %. U malých mostů má desátý tvar vysokou frekvenci, síly se musí přepočítávat každý krok a tlumení tvarů cenu kroku zhruba zdvojnásobí. Ty ale mají rezervu dvou řádů. V M1b to půjde zlevnit tím, že se vlastním tvarům bude tlumit jen to, co nepokryje tlumení přes tuhost.

### 4. Integrace v čase je přesná a energii nemění

- Mez stability vychází přesně: krok 2 % pod mezí je stabilní, 2 % nad ní výpočet diverguje.
- Perioda volného kmitání se shoduje s maticovým výpočtem na čtyři desetinná místa.
- Prut padající jako kyvadlo o 90° a zpět zachová energii s odchylkou pod jednu miliontinu. Formulace tedy zvládá velké rotace.
- Síly prvků jsou přesným gradientem deformační energie a pohyb celku jako tuhého tělesa žádné síly nevyvolá.

### 5. Jádro nepotřebuje goniometrické funkce

Natočení styčníku se ukládá jako jednotkový vektor a deformace prvku se měří sinem úhlu. Vnitřní smyčka tak používá jen sčítání, násobení, dělení a odmocninu, které dávají ve všech prohlížečích bitově stejný výsledek. Vlastní implementace sinu a kosinu, se kterou koncepce počítala, pro jádro není potřeba.

### 6. Výkon

Bezhlavé Chromium 157, jedno jádro Xeon 2,1 GHz, medián ze sekundového měření. „Jen most“ je konstrukce s tlumením úměrným hmotě. „S provozem“ přidává kola, tlumení vlastních tvarů a tlumení nejvyšších frekvencí.

| Most | Styčníky | Styčníků / prutů / kol | Kroků na sekundu děje | Jen most | S provozem | Násobek reálného času s provozem |
|---|---|---|---|---|---|---|
| Běžná úroveň | kloubové | 26 / 49 / 12 | 2 280 | 1,0 µs | 2,5 µs | 175× |
| Běžná úroveň | svařené | 26 / 49 / 12 | 2 440 | 1,5 µs | 4,0 µs | 102× |
| Velká úroveň | kloubové | 62 / 121 / 30 | 2 290 | 2,5 µs | 6,5 µs | 67× |
| Velká úroveň | svařené | 62 / 121 / 30 | 2 440 | 4,0 µs | 9,5 µs | 43× |
| Největší most | kloubové | 300 / 597 / 60 | 4 410 | 12 µs | 19 µs | 12× |
| Největší most | svařené | 300 / 597 / 60 | 4 410 | 19 µs | 30 µs | 7,4× |

Časy jsou na jeden krok. Hodiny v prohlížeči mají rozlišení 0,1 ms, takže nejmenší hodnoty jsou zaokrouhlené na půl mikrosekundy. Dvě opakování se lišila nejvýš o 8 %.

Největší most má metrová pole; běžná a velká úroveň dvoumetrová.

**Příprava před zkouškou** (nejvyšší frekvence, rovnováha pod vlastní tíhou, deset vlastních tvarů):

| Most | Neznámých | Čas |
|---|---|---|
| Běžná úroveň | 49 až 75 | do 50 ms |
| Velká úroveň | 120 až 182 | do 60 ms |
| Největší most, kloubový | 592 | 0,4 s |
| Největší most, svařený | 892 | 1,2 s |

U běžných úrovní stačí na okamžitou odezvu ve stavebním režimu. U největších mostů je vteřina moc; tam pomůže řešič, který využije řídkost matice.

## Co z toho plyne pro M1b

1. Prvek, pravidlo rotační setrvačnosti, integrátor a volba kroku zůstávají tak, jak jsou; jsou v `src/jadro/` a pokryté testy.
2. Tlumení: vlastní tvary + ξ = 0,1 přes tuhost. Po porušení mostu přejít na tlumení úměrné hmotě.
3. Rovnováhu hledá Newtonova metoda. Mechanismus se pozná podle nulového pivotu matice tuhosti ve výchozí poloze. Ukázalo se, že bez této kontroly by solver čtyřkloubový rám „vyřešil“ jeho překlopením.
4. Lano s nulovým napětím má pro maticové výpočty poloviční tuhost (táhne, netlačí). Statika a vlastní tvary se proto musí počítat až v poloze, kde jsou lana napnutá.

## Rizika, která zůstávají

| Riziko | Stav |
|---|---|
| Výkon na tvém počítači a v jiných prohlížečích | Neověřeno. Změří `/mereni.html`. |
| Porušení vytvoří kusy kratší než 1 m a krok by se musel zkrátit | Neřešeno. Plán: nové styčníky dostanou hmotu navíc tak, aby nejvyšší frekvence nevzrostla. Ověřit v M1b. |
| Viskózní tlumič nastavený hráčem může krok zkrátit | Neřešeno. Plán: poloimplicitní integrace tlumiče, omezený rozsah nastavení. |
| Plný model vozidel, chodci a kontrola porušení krok prodraží | Odhad 2× až 3×; změří M1b. |
| Příprava největších mostů trvá vteřinu | Řídký řešič v M1b, pokud to bude ve stavebním režimu vadit. |

## Jak měření zopakovat

V prohlížeči otevři `/mereni.html` a stiskni „Spustit měření“. Tlačítko „Kopírovat výsledky“ dá text, který mi můžeš poslat.

Z příkazové řádky ve složce `mostmistr/`:

```bash
MM_TRVANI=1000 npm run mereni
```

Tabulky v bodech 1 až 3 vycházejí z testů `test/jadro-dynamika.test.ts`, `test/jadro-tlumeni.test.ts` a `test/jadro-stabilita.test.ts`, které tytéž vlastnosti hlídají trvale.
