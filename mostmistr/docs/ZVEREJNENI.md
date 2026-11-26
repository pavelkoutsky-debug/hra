# Zveřejnění hry

Hra běží na `mostmistr.netlify.app` a **od 25. 11. 2026 je veřejná** (do té doby byla za
přihlášením Netlify a viděl ji jen zadavatel). Tenhle dokument říká, co se při zveřejnění dělalo,
co se potom ověřilo a s jakým výsledkem, co zbývá ověřit a co bylo k soukromí rozhodnuto.

## Co bylo rozhodnuto (zadavatel, 24. 11. 2026)

- **Záznam hraní zůstává, jak je:** zapnutý od prvního otevření hry, s upozorněním a vypínačem
  (hráč se může odhlásit). Recenze před zveřejněním doporučila souhlas předem; zadavatel zvolil
  dnešní podobu. Hra to říká na rovinu v okně Soukromí a kontakt („od prvního otevření“).
- **Provozovatel a kontakt:** bez jména a e-mailu, „hru provozují její autoři“; žádosti a dotazy
  jdou oknem Napiš nám. Hráč v okně Soukromí vidí své číslo hráče a správce podle něj umí jeho
  data smazat.
- **Uchování dat:** deník hraní 12 měsíců, zprávy 24 měsíců; starší server maže sám.
- **Naplánovaná úloha denního rozboru se zakládá až po zveřejnění** (web za přihlášením jí
  odpovídá chybou 401 a nikdo na něm nehraje).

Kdyby se některé rozhodnutí změnilo, patří změna sem, do textů `soukromi.*` ve slovnících
a do `docs/ZPETNA-VAZBA.md`.

**Verze 0.24.0 (26. 11. 2026): záznam hraní nese víc.** Aby šlo poznat, proč lidé odcházejí
v prvních minutách, zapisuje hra nově i to, které obrazovky hráč otevřel (přehled, pískoviště,
komise, list, zkušebna, okna Soukromí a Napiš nám), čím udělal první akci na stránce (myš, dotyk,
klávesa) a po kolika sekundách, proč zkouška neprošla, které značky a rady mu hra ukázala a jak
posouval styčníky. Pořád jsou to čísla a krátké kódy pod náhodným číslem prohlížeče; rozhodnutí
výše se nemění a text okna Soukromí (`soukromi.denik`, oba jazyky) nové údaje jmenuje.

## Před zveřejněním (Netlify)

1. **Hesla** (Project configuration → Environment variables, rozsah Functions):
   - `MM_SPRAVCE_HESLO`: heslo stránky správce, aspoň 16 znaků.
   - `MM_ROZBOR_HESLO`: heslo denního rozboru, aspoň 16 znaků, bez diakritiky, **jiné** než heslo
     správce a **stejné** jako síťový tajný údaj uložený v prostředí „Mostmistr – denní rozbor“
     (Claude Code na webu). Když si hodnotu nepamatuješ, zadej v prostředí novou.
2. **Nové nasazení** (Deploys → Trigger deploy): funkce si proměnné čtou při nasazení.
3. **Vypnout přihlášení** pro ostrý web: tlačítko **Make public** na přehledu projektu, nebo
   Project configuration → General → Visitor access (podle tarifu „Project visibility“ nebo
   „Password Protection“). Náhledy pull requestů můžou zůstat chráněné.
4. **Zkouška v anonymním okně:** hra se načte bez přihlášení; `/sprava.html` pustí dovnitř heslem
   správce; zpráva z okna Napiš nám se ve správě objeví; most zapsaný do žebříčku je v okně
   žebříčku i ve správě.
5. **Jiné prohlížeče:** otevřít `/otisky.html` ve Firefoxu, v Safari a na telefonu; stránka musí
   hlásit shodu u všech scénářů („Všech 23 otisků souhlasí“). (Stroje JavaScriptu těch prohlížečů dávají stejné otisky jako
   Chrome, viz `npm run stroje`; skutečné prohlížeče na skutečných zařízeních ale nikdo nezkoušel.)
6. **Odkaz v chatu:** poslat si odkaz na most (Sdílet) do aplikace, kde se ukazují náhledy,
   a podívat se, jestli má obrázek a popis.

## Po zveřejnění

7. **Denní rozbor.** Hotovo 25. 11. 2026: naplánovaná úloha je založená (jednou denně, pokaždé
   nová relace, prostředí „Mostmistr – denní rozbor“, bez konektorů, zadání z `docs/ROZBOR.md`)
   a první ruční běh uložil rozbor.
8. **Co umí ověřit jen ostrý web** (výsledky jsou v oddíle „Co se po zveřejnění ověřilo“):
   - přichází v každé žádosti hlavička `x-nf-client-connection-ip`? Zápis do žebříčku ze dvou sítí
     musí projít z obou; kdyby hlavička nechodila, žebříček odmítne každý zápis větou o adrese;
   - platí omezení počtu žádostí z `netlify/functions/*.mts` (patnáct zpráv za minutu → od
     jedenácté odpověď 429);
   - jak dlouho trvá ověření mostu na nejpomalejší úrovni (8-01, i zkouška do zlomu) a jestli se
     vejde do času funkce; podle toho případně snížit `NEJVIC_OVERENI_DENNE`;
   - dva zápisy do žebříčku ve stejnou chvíli se nepřepíšou (zápis s podmínkou v Netlify Blobs);
   - bezpečnostní hlavičky nic nerozbily: stažení obrázku mostu a listu, vývoz ve správě, zvuk,
     zkušebna;
   - neexistující adresa ukáže stránku hry, ne výchozí stránku Netlify;
   - po týdnu velikost úložiště a doba běhu funkcí v přehledu Netlify proti tarifu.
9. **První skutečné zprávy a zápisy** projít ve správě: nevhodné přezdívky a zprávy smazat,
   odmítnutí žebříčku z důvodu `otisk` brát vážně (zkouška u hráče dopadla jinak než na serveru).

## Co se po zveřejnění ověřilo (25. 11. 2026)

Zkoušky běžely z prostředí denního rozboru bezhlavým prohlížečem a přímými žádostmi; záznam hraní
měly vypnutý (`?zaznam=vypnout`), takže do čísel o hráčích nevstoupily.

- **V pořádku:** hra se načte bez přihlášení a bez chyby v konzoli (bezpečnostní hlavičky nic
  nerozbily); zpráva z okna Napiš nám dorazí; most jde zapsat do žebříčku a přečíst zpátky (server
  tedy adresu hráče z hlavičky Netlify dostává, jinak by zápis odmítl); dva zápisy do téhož
  žebříčku ve stejnou chvíli se oba zapsaly; odkaz na most se u příjemce otevře jako cizí most;
  obrázek mostu a list jdou stáhnout; zvuk se probudí; zkušebna, stránka zvuků, správa a shoda
  výpočtu (23 z 23 otisků v Chromiu) se načtou; neexistující adresa ukáže stránku hry; značky
  náhledu odkazu a obrázek 1200 × 630 web vydává; heslo denního rozboru server přijímá.
- **Denní rozbor běží:** naplánovaná úloha „Mostmistr – denní rozbor“ je založená (každý den ve
  4:43 našeho času, pokaždé nová relace, prostředí „Mostmistr – denní rozbor“, bez konektorů),
  první ruční běh uložil rozbor za 24. 11. 2026.
- **Nález: ověření velkého mostu trvá déle, než Netlify čeká na odpověď.** Most autora 8-01
  server ověřuje 27 až 31 s (běžná zkouška; do zlomu asi 21 s) a Netlify spojení, na kterém 30 s
  nic nepřišlo, ukončí chybou 504 („Inactivity Timeout“). Funkce přitom běží dál (limit 60 s)
  a výsledek si zapamatuje, takže druhý pokus projde za necelou sekundu. Hráč ale viděl „Zápis se
  nepovedl“. **Opraveno ve verzi 0.23.1:** hra po takové chybě zkouší zápis sama znovu a server
  týž most podruhé nepočítá (viz `CLAUDE.md`, „Žebříčky“). Ostatní úrovně jsou podle přepočtu
  z místního měření pod 20 s (5-01 asi 17 s, zlom 6-04 asi 16 s, 6-05 asi 12 s). Most, který by
  server nestihl ani za 60 s, zapsat nejde a hra to řekne; `NEJVIC_OVERENI_DENNE` zůstává 1 000.
- **Nepotvrzeno: omezení počtu žádostí.** Z prostředí vývoje se neprojevilo žádné ze čtyř
  (46 žádostí na `/api/vazba` za minutu při stropu 10, 48 na `/api/zebricek` při stropu 40;
  žádná odpověď 429). Buď žádosti z toho prostředí odcházejí z více adres, nebo tarif pravidla
  z funkcí neuplatňuje (dokumentace Netlify uvádí pro bezplatné tarify nejvýš dvě pravidla na
  projekt, hra má čtyři). Zkouška z jednoho připojení: v konzoli prohlížeče na stránce hry
  `for (let i = 1; i <= 15; i++) fetch("/api/vazba", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }).then((r) => console.log(i, r.status));`
  má vypsat desetkrát 400 a pak 429. Stropy, které hlídá server sám (zprávy, deník a zkoušky
  žebříčku na adresu a den), na tom nezávisí a platí.
- **Zbývá na zadavateli:** pohled do správy (zpráva a řádky ze zkoušek tam mají být), smazání
  zkušebních dat, `/otisky.html` ve Firefoxu, v Safari a na telefonu, náhled odkazu v chatu
  a po týdnu spotřeba v přehledu Netlify.

## Žádost hráče o smazání dat

Hráč napíše oknem Napiš nám a uvede číslo hráče (vidí ho v okně Soukromí a kontakt). Správce na
stránce `/sprava.html` zadá číslo do formuláře „Smazat data hráče“: smaže se jeho deník hraní,
jeho zprávy a jeho řádky v žebříčcích. Co má hráč v paměti svého prohlížeče (postup, mosty),
smaže si sám vymazáním dat stránky.
