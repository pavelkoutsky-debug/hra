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
  "První úroveň 1-01 vede hráče po krocích: výkres ukazuje, odkud kam táhnout další díl mostovky, a po dokončení mostovky zvýrazní tlačítko Zkouška.",
  "Stavba: nástroj Výběr a posun (klik, rámeček, tažení styčníkem posune i připojené pruty, víc vybraných styčníků se posouvá naráz, šipky posouvají o krok rastru), zrcadlení, Zpět a Znovu, mazání, import a export mostu.",
  "Kontrola při stavbě: značka u místa, kde se most složí vlastní vahou, u volného prutu, u mostovky, která nenavazuje na břeh, a u prutu, který se při poslední zkoušce porušil jako první; řádek rad pod výkresem podle zvoleného nástroje.",
  "Zkouška: přehrávání s časovou osou, rychlostmi a krokováním, barvy a čísla využití prutů, zpomalený záběr na první porušení (jde vypnout), klidné úseky se přehrávají rychleji.",
  "Výsledek: pruh s verdiktem, jednou větou o příčině a medailemi, razítko SCHVÁLENO nebo ZAMÍTNUTO, v podrobnostech čísla, důvod u každé nezískané medaile a rada k prvnímu porušení. Když most neprojde podruhé po sobě stejně, hra radu ukáže sama i s tlačítkem nápovědy.",
  "Nápověda úrovně má tři kroky: princip se skicou, soupis materiálu a obrys mostu na výkresu; obrysy mostů pro medaile až po projití úrovně.",
  "Medaile: průchod, rozpočtová (levný most, na kterém se nic neporušilo) a mistrovská (rozpočtová a k ní bonus úrovně). Výzvy o nejlevnější a nejlehčí most a o únosnost na korunu (zkouška do zlomu), žebříčky všech hráčů ke každé úrovni.",
  "Kmitání: osa frekvencí s odhadem kmitání pod lidmi, rada, co ho sníží, pokusy Brnknutí a Budič, laděný tlumič s tlačítkem Naladit na rytmus.",
  "Lana: napínák u každého lana a tlačítko Dopnout lana; značka při stavbě, když mostovka pod vlastní tíhou visí mimo výkres.",
  "Další režimy: pískoviště s vlastním údolím, provozem a dílnou uložených prací, Havarijní komise (opravit cizí spadlý most nejvýš třemi změnami), závěrečný list s mosty hráče.",
  "Sdílení: odkaz na most, obrázek mostu ke stažení, výzva kamarádovi na levnější most, odkaz na scénář z pískoviště.",
  "Ovládání a jazyk: myš a klávesnice, dotyk (jeden prst kreslí, dva posouvají a zvětšují), rozložení pro telefon, čeština a angličtina, zvuk ze syntezátoru se třemi stupni hlasitosti.",
  "Zpětná vazba a soukromí: okno Napiš nám (druh, text, hodnocení, volitelně e-mail a přiložený most), okno Soukromí a kontakt s vypínačem záznamu hraní.",
];
