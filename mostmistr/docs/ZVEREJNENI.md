# Zveřejnění hry

Hra běží na `mostmistr.netlify.app`, ale do zveřejnění je **za přihlášením Netlify** (vidí ji jen
zadavatel). Tenhle dokument říká, co udělat, aby ji viděl každý, v jakém pořadí, co potom ověřit
a co bylo k soukromí rozhodnuto. Stav k 24. 11. 2026 (milník M17).

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

## Před zveřejněním (Netlify)

1. **Hesla** (Project configuration → Environment variables, rozsah Functions):
   - `MM_SPRAVCE_HESLO`: heslo stránky správce, aspoň 16 znaků.
   - `MM_ROZBOR_HESLO`: heslo denního rozboru, aspoň 16 znaků, bez diakritiky, **jiné** než heslo
     správce a **stejné** jako síťový tajný údaj uložený v prostředí „Mostmistr – denní rozbor“
     (Claude Code na webu). Když si hodnotu nepamatuješ, zadej v prostředí novou.
2. **Nové nasazení** (Deploys → Trigger deploy): funkce si proměnné čtou při nasazení.
3. **Vypnout přihlášení** pro ostrý web (Project configuration → Access & security → Visitor
   access). Náhledy pull requestů můžou zůstat chráněné.
4. **Zkouška v anonymním okně:** hra se načte bez přihlášení; `/sprava.html` pustí dovnitř heslem
   správce; zpráva z okna Napiš nám se ve správě objeví; most zapsaný do žebříčku je v okně
   žebříčku i ve správě.
5. **Jiné prohlížeče:** otevřít `/otisky.html` ve Firefoxu, v Safari a na telefonu; stránka musí
   hlásit shodu u všech scénářů. (Stroje JavaScriptu těch prohlížečů dávají stejné otisky jako
   Chrome, viz `npm run stroje`; skutečné prohlížeče na skutečných zařízeních ale nikdo nezkoušel.)
6. **Odkaz v chatu:** poslat si odkaz na most (Sdílet) do aplikace, kde se ukazují náhledy,
   a podívat se, jestli má obrázek a popis.

## Po zveřejnění

7. **Denní rozbor.** Říct Claudovi „web je veřejný“: založí naplánovanou úlohu (jednou denně,
   pokaždé nová relace, prostředí „Mostmistr – denní rozbor“, bez konektorů, zadání
   z `docs/ROZBOR.md`), pustí ji jednou ručně a ověří, že se rozbor objevil na stránce správce.
8. **Co umí ověřit jen ostrý web** (z kontejneru se funkce Netlify zavolat nedají):
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

## Žádost hráče o smazání dat

Hráč napíše oknem Napiš nám a uvede číslo hráče (vidí ho v okně Soukromí a kontakt). Správce na
stránce `/sprava.html` zadá číslo do formuláře „Smazat data hráče“: smaže se jeho deník hraní,
jeho zprávy a jeho řádky v žebříčcích. Co má hráč v paměti svého prohlížeče (postup, mosty),
smaže si sám vymazáním dat stránky.
