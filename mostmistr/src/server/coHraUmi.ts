// Co hra už umí: krátký přehled pro denní rozbor (`co=podklady`, pole `hraUmi`).
//
// Rozbor píše jazykový model, který repozitář hry nevidí. První rozbor po zveřejnění (25. 11. 2026)
// proto navrhl dvě věci, které ve hře byly (vedení prvního kroku v 1-01 a posun styčníku). Tenhle
// seznam mu říká, co už existuje: takovou věc nemá navrhovat znovu, ale když čísla ukazují, že
// nezabírá, má navrhnout, jak ji udělat viditelnější nebo lepší.
//
// **Drž ho aktuální:** nová věc, kterou hráč ve hře vidí nebo používá, sem patří jednou větou
// (`test/rozbor.test.ts` hlídá délku). Je to text autorů, ne data od hráčů.

export const CO_HRA_UMI: readonly string[] = [
  "Kampaň: 38 úrovní v osmi kapitolách (lávky, kmitání, silnice, pilíře a lana, město, železnice, zvedací mosty, finále); pátá úroveň kapitol 1 až 7 je zkouška bez nápovědy. Úrovně se odemykají po jedné, další kapitola po dvou projitých úrovních té předchozí.",
  "Přehled: nový hráč má nahoře jedno tlačítko, které ho pustí do 1-01, vracející se hráč tlačítko Pokračovat do další neprošlé úrovně.",
  "Zadání úrovně: dvě věty, pod nimi „Více o úloze“, u úrovní s novým prvkem ukázka (dva mosty vedle sebe: bez prvku a s ním) a odstavec o skutečném mostě; slovníček 22 pojmů s vysvětlením na kliknutí.",
  "První úroveň 1-01 vede hráče po krocích: výkres ukazuje, odkud kam táhnout další díl mostovky; po dokončení mostovky hra sama vybere levnější Lehký trám na zbytek mostu a zvýrazní tlačítko Zkouška, a po první neúspěšné zkoušce řekne, že mostovku musí něco držet. Most dražší než rozpočet zkouška nepustí a hlášení říká, o kolik je dražší a že mostovka patří jen na cestu.",
  "Stavba: nástroj Výběr a posun (klik, rámeček; tažení za vybraný styčník posune celý výběr i s připojenými pruty, šipky ho posouvají po metru, styčníky v podporách zůstávají stát), zrcadlení, Zpět a Znovu, mazání, import a export mostu. Po první prošlé zkoušce hra na posun jednou upozorní.",
  "Kontrola při stavbě: značka u místa, kde se most složí vlastní vahou, u volného prutu, u mostovky, po které nikdo nepůjde (přejíždí kraj břehu bez styčníku, leží mimo trasu nebo za jejím koncem), a u prutu, který se při poslední zkoušce porušil jako první; řádek rad pod výkresem podle zvoleného nástroje. Tah mostovky přetažený za kraj břehu editor sám ukončí na kraji a řekne proč.",
  "Zkouška: přehrávání s časovou osou, rychlostmi a krokováním, barvy a čísla využití prutů, zpomalený záběr na první porušení (jde vypnout), klidné úseky se přehrávají rychleji.",
  "Výsledek: pruh s verdiktem, jednou větou o příčině a medailemi, razítko SCHVÁLENO nebo ZAMÍTNUTO, v podrobnostech čísla, důvod u každé nezískané medaile a rada k prvnímu porušení. Když most neprojde podruhé po sobě stejně, hra radu ukáže sama v pruhu výsledku i s tlačítkem nápovědy, nechá ji tam, dokud se stejná chyba opakuje, a po návratu ke stavbě ji ukazuje u označeného prutu.",
  "Nápověda úrovně má tři kroky: princip se skicou, soupis materiálu a obrys mostu na výkresu; obrysy mostů pro medaile až po projití úrovně.",
  "Medaile: průchod, rozpočtová (levný most, na kterém se nic neporušilo) a mistrovská (rozpočtová a k ní bonus úrovně). Výzvy o nejlevnější a nejlehčí most a o únosnost na korunu (zkouška do zlomu), žebříčky všech hráčů ke každé úrovni.",
  "Kmitání: osa frekvencí s odhadem kmitání pod lidmi, rada, co ho sníží, pokusy Brnknutí a Budič, laděný tlumič s tlačítkem Naladit na rytmus.",
  "Lana: napínák u každého lana a tlačítko Dopnout lana; značka při stavbě, když mostovka pod vlastní tíhou visí mimo výkres.",
  "Další režimy: pískoviště s vlastním údolím, provozem a dílnou uložených prací, Havarijní komise (opravit cizí spadlý most nejvýš třemi změnami), závěrečný list s mosty hráče.",
  "Sdílení: odkaz na most, obrázek mostu ke stažení, výzva kamarádovi na levnější most, odkaz na scénář z pískoviště.",
  "Ovládání a jazyk: myš a klávesnice, dotyk (jeden prst kreslí, dva posouvají a zvětšují), rozložení pro telefon, čeština a angličtina, zvuk ze syntezátoru se třemi stupni hlasitosti.",
  "Zpětná vazba a soukromí: okno Napiš nám (druh, text, hodnocení, volitelně e-mail a přiložený most), okno Soukromí a kontakt s vypínačem záznamu hraní.",
];

/**
 * Co která čísla v podkladech znamenají (`co=podklady`, pole `vysvetlivky`). Zadání úlohy je
 * uložené mimo repozitář a mění se ručně; nové pole souhrnu proto dostane vysvětlivku tady
 * a úloha se o něm dozví sama. Klíč je cesta k poli, hodnota jedna až tři věty.
 */
export const VYSVETLIVKY_PODKLADU: Readonly<Record<string, string>> = {
  hraUmi:
    "Co hra už umí. Nic z toho nenavrhuj jako novinku; když čísla ukazují, že to nezabírá, navrhni, jak to udělat viditelnější nebo lepší.",
  "souhrn.bezUrovne":
    "Hráči, kteří neotevřeli žádnou úroveň kampaně. jenPrehled: viděli jen přehled; piskoviste, komise, list, zkusebna, soukromi, vazba: kam šli místo toho (můžou se překrývat); bezObrazovky: stránka se nedonačetla. sAkci a bezAkce: jestli na stránce vůbec něco udělali (bezAkce bývá robot, který stahuje náhled odkazu, nebo okamžitý odchod); zbytek do hracu je neznámý (starší verze hry, která akci nezapisovala, nebo sezení začaté před půlnocí).",
  "souhrn.urovne[].hracuBezZkousky":
    "Otevřeli úroveň a nepustili ani jednu zkoušku. hracuNaDotyku: hráči úrovně na dotykovém zařízení; hracuBezZkouskyNaDotyku: kolik z hráčů bez zkoušky bylo na dotyku; hracuBezPrutu: kolik hráčů úrovně v ní za to období nenakreslilo ani jeden prut (patří sem i ten, kdo jen zkoušel most uložený dřív nebo cizí most z odkazu).",
  "souhrn.urovne[].selhani":
    "Proč zkoušky neprošly a kolikrát. „prvek/způsob“ je prut, který povolil první (vzper je vybočení tlačeného prutu). Ostatní názvy jsou příčiny bez porušeného prutu: složil se vlastní vahou, mostovka nedosáhla na předmostí, kmitání nad mezí, průhyb nad mezí, opřel se o terén, sjel z podpory, někdo spadl, někdo nepřejel, loď narazila, křídlo se překlopilo, zámek nezapadl, pohyblivý most, povolil prut, výpočet se rozpadl. „bez porušení“ jsou zkoušky, u kterých příčina není známá: hlavně ze starší verze hry, která ji neposílala.",
  "souhrn.urovne[].hracuSNapovedou":
    "Hráči, kteří si otevřeli nápovědu úrovně; hracuSObrysem si nechali ukázat i obrys mostu na výkresu.",
  "souhrn.urovne[].rady":
    "Rada po druhém stejném nezdaru za sebou (hra ji ukáže sama v pruhu výsledku) a kolikrát která zazněla. hracuSRadou: kolik hráčů ji vidělo; hracuSRadouPrusli: kolik z nich potom zkouškou prošlo (počítá se první průchod po radě, i u hráče, který úroveň prošel už dřív a radu dostal při zlevňování); zkousekPoRade: medián zkoušek od rady do toho průchodu; hracuNapovedaZRady: kolik z nich z rady otevřelo nápovědu.",
  "souhrn.urovne[].posunu":
    "Posuny styčníků nástrojem Výběr a posun nebo šipkami. hracuSPosunem: kolik hráčů posun použilo; posunu: kolik posunů bylo; posunuVic: z toho víc styčníků naráz; posunuKlavesou: z toho šipkou.",
  "souhrn.urovne[].zkousekOdmitnuto":
    "Zkoušky, které hra nepustila, protože most porušoval pravidla úrovně (pokusy se nepočítají). zkousekNadRozpocet: z toho proto, že byl dražší než rozpočet; hracuSOdmitnutim: kolika hráčů se to týkalo. Hodně odmítnutí kvůli rozpočtu v první úrovni znamená, že nováčci staví z drahého prvku.",
  "souhrn.urovne[].znacky":
    "Značky, kterými hra při stavbě upozornila na mostovku, po které nikdo nepůjde, a kolikrát se ukázaly. Když jich je hodně a mezera v mostovce dál končí zkoušky, značka nezabírá.",
  zebricky:
    "overeni: kolik zkoušek server pustil; prijato a zlepseni: zápisy; odmitnuto: podle důvodu. Počítají se i zkoušky autorů na ostrém webu včetně schválně poslaných podvrhů: ojedinělé odmítnutí „otisk“ bez zprávy od hráče proto není důkaz chyby, opakované u víc úrovní nebo se zprávou hráče ano.",
  obecne:
    "Den je v UTC. Zkoušky autorů v prohlížeči mají záznam hraní vypnutý a v souhrnu nejsou. Hráč je náhodné číslo prohlížeče, ne člověk: kdo hraje na telefonu i na počítači, je dvakrát.",
};
