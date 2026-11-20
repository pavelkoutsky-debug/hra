// Všechny texty hry na jednom místě, aby šla později doplnit angličtina.

const CS = {
  "hra.nazev": "Mostmistr",
  "lista.oddalit": "Oddálit",
  "lista.priblizit": "Přiblížit",
  "lista.celyVykres": "Celý výkres",
  "napoveda.ovladani": "kolečko: zoom · pravé tlačítko nebo mezerník + tažení: posun · Home: celý výkres",
  "pole.nazev": "Název",
  "pole.meritko": "Měřítko",
  "pole.list": "List",
  "pole.verze": "Verze",
  "pole.fyzika": "Fyzika",
  "pole.datum": "Datum",
  "pole.fyzikaNedostupna": "nedostupná",
  "vykres.hladina": "hladina {vyska}",
  "vykres.zakazanaZona": "zakázaná zóna",
  "vykres.zaklad": "základ",
  "souradnice.bod": "x = {x} m · y = {y} m",
  "chyba.nacteni": "Výkres se nepodařilo načíst: {duvod}",
  "lista.zkusebna": "Zkušebna",
  "lista.hra": "Zpět na výkres",
  "zkusebna.nadpis": "Zkušebna",
  "zkusebna.pripad": "Případ",
  "zkusebna.prehrat": "Přehrát",
  "zkusebna.zastavit": "Zastavit",
  "zkusebna.odZacatku": "Od začátku",
  "zkusebna.rychlost": "Rychlost přehrávání",
  "zkusebna.cas": "Čas děje",
  "zkusebna.overeni": "Porovnání s teorií",
  "zkusebna.sloupec.velicina": "Veličina",
  "zkusebna.sloupec.namereno": "Vyšlo",
  "zkusebna.sloupec.ocekavano": "Má vyjít",
  "zkusebna.sloupec.vysledek": "Shoda",
  "zkusebna.sedi": "sedí",
  "zkusebna.nesedi": "nesedí",
  "zkusebna.pocitaSe": "Počítá se… {procent} %",
  "zkusebna.vypocet": "Výpočet",
  "zkusebna.vypocetUdaj": "{kroku} kroků za {ms} ms · {nasobek}× rychleji než děj",
  "zkusebna.krok": "Krok {mikro} µs · {naSekundu} kroků na sekundu děje",
  "zkusebna.legenda.vyuziti": "Využití",
  "zkusebna.legenda.tlak": "tlak",
  "zkusebna.legenda.tah": "tah",
  "zkusebna.chyba": "Výpočet selhal: {duvod}",
  "zkusebna.mereni": "Měření výkonu",
  "zkusebna.otisky": "Shoda výpočtu",
  "zkusebna.poruseni": "Porušení",
  "zkusebna.poruseni.zadne": "Konstrukce vydržela bez porušení.",
  "zkusebna.poruseni.radek": "{cas} s · prut {prut}: {zpusob}, {nasledek}",
  "zkusebna.poruseni.dalsi": "… a dalších {pocet}",
  "zkusebna.zpusob.tah": "tah",
  "zkusebna.zpusob.tlak": "tlak",
  "zkusebna.zpusob.vzper": "vzpěr",
  "zkusebna.zpusob.ohyb": "ohyb",
  "zkusebna.zpusob.smyk": "smyk",
  "zkusebna.nasledek.rozlomeni": "prut se zlomil",
  "zkusebna.nasledek.odpojeni": "konec se utrhl",
  "zkusebna.nasledek.kloub": "vznikl plastický kloub",
  "zkusebna.most.nazev": "Příhradový most s kolonou",
  "zkusebna.most.popis":
    "Nízká kloubová příhrada z těžkých dřevěných trámů o rozpětí 24 m. Ze břehu na ni najíždí kolona šesti kol po šesti tunách; každé kolo je hmota na pneumatice a jede 4 m/s. Barva prutu ukazuje, jak moc je namáhaný. Dokud je celá kolona na mostě, musí součet sil v podporách odpovídat tíze mostu a kol.",
  "zkusebna.pretizeni.nazev": "Vazník zatížený do zlomu",
  "zkusebna.pretizeni.popis":
    "Dřevěný vazník o rozpětí 8 m: dvě krokve a táhlo. Lis tlačí na vrchol stále větší silou. Krokve jsou tlačené a štíhlé, proto má první povolit krokev vzpěrem, a to při síle, kterou dává posudek prutu. Táhlo do té doby nese vodorovnou složku síly v krokvi. Po zlomu lis povolí a vazník se zřítí.",
  "zkusebna.plast.nazev": "Mezní únosnost vetknutého nosníku",
  "zkusebna.plast.popis":
    "Ocelový nosník 8 m vetknutý na obou koncích pod rovnoměrným zatížením, které pomalu roste. Nejdřív zplastizují vetknutí, ale nosník nespadne: momenty se přerozdělí do pole. Zhroutí se až po vzniku třetího plastického kloubu uprostřed, při zatížení o třetinu větším.",
  "zkusebna.vzper.nazev": "Vzpěr štíhlého sloupu",
  "zkusebna.vzper.popis":
    "Ocelový sloup 8 m s kloubem dole a vedením nahoře má od výroby nepatrnou křivost 8 mm. Síla na hlavě roste po stupních. Pod kritickou silou se křivost jen zvětšuje podle známého vzorce; nad ní sloup vybočí a ustálí se ve tvaru, který popisuje teorie velkých průhybů (elastika). Únosnost oceli se tu neposuzuje, sloup zůstává pružný.",
  "zkusebna.prejezd.nazev": "Přejezd síly po nosníku",
  "zkusebna.prejezd.popis":
    "Po prostém nosníku 20 m přejede síla 30 kN čtvrtinou kritické rychlosti (asi 63 km/h). Nosník se prohne víc, než kdyby na něm síla stála, a po jejím odjezdu dál kmitá. Průběh průhybu středu má odpovídat Frýbovu řešení pohyblivého zatížení.",
  "zkusebna.rezonance.nazev": "Chodec v rezonanci",
  "zkusebna.rezonance.popis":
    "Uprostřed prostého nosníku 12 m pochoduje na místě chodec o váze 80 kg přesně v rytmu jeho vlastní frekvence. Síla kroku kolísá o 40 % váhy. S útlumem 1 % se má nosník rozkmitat padesátkrát víc, než kdyby stejná síla působila staticky.",
  "zkusebna.tlumic.nazev": "Laděný tlumič",
  "zkusebna.tlumic.popis":
    "Stejný nosník a stejný chodec, ale nosník sám nemá žádné tlumení. Uprostřed pod ním visí na pružině s tlumičem závaží o dvacetině hmoty kmitajícího nosníku, naladěné podle Den Hartoga. Místo neomezeného rozkmitání se nosník ustálí na několikanásobku statického průhybu; kmitá hlavně závaží.",
  "zkusebna.nosnik.nazev": "Vlastní frekvence nosníku",
  "zkusebna.nosnik.popis":
    "Prostý nosník 12 m je prohnut o 15 cm do tvaru svého prvního kmitu a puštěn. Bez tlumení kmitá ve vlastní frekvenci, kterou lze spočítat vzorcem. Amplituda ani energie se nesmí měnit.",
  "zkusebna.kyvadlo.nazev": "Prut jako kyvadlo",
  "zkusebna.kyvadlo.popis":
    "Vodorovný prut 4 m zavěšený za konec je puštěn a kývá se o plných 180°. Zkouší to, že výpočet zvládá velká natočení: perioda má odpovídat fyzickému kyvadlu a energie se nesmí měnit.",
  "zkusebna.overeni.perioda": "Perioda kyvu",
  "zkusebna.overeni.nejnizsiPoloha": "Nejnižší poloha konce",
  "zkusebna.overeni.odchylkaEnergie": "Největší odchylka energie",
  "zkusebna.overeni.frekvence": "Vlastní frekvence",
  "zkusebna.overeni.amplituda": "Amplituda po třech sekundách",
  "zkusebna.overeni.zesileni": "Zesílení proti statickému průhybu",
  "zkusebna.overeni.zesileniSTlumicem": "Zesílení kmitání nosníku",
  "zkusebna.overeni.zesileniZavazi": "Zesílení kmitání závaží",
  "zkusebna.overeni.dynamickySoucinitel": "Největší průhyb proti statickému",
  "zkusebna.overeni.odchylkaPrubehu": "Největší odchylka průběhu",
  "zkusebna.overeni.reakce": "Součet reakcí v podporách",
  "zkusebna.overeni.silaPriPoruseni": "Síla lisu při zlomu",
  "zkusebna.overeni.tahVTahle": "Tah v táhle před zlomem",
  "zkusebna.overeni.zlomenyPrut": "Zlomený prut (1 a 2 jsou krokve)",
  "zkusebna.overeni.prvniKlouby": "Zatížení, při kterém zplastizují vetknutí",
  "zkusebna.overeni.mezniZatizeni": "Zatížení, při kterém vznikne třetí kloub",
  "zkusebna.overeni.zvetseniPriPolovine": "Zvětšení křivosti při ½ kritické síly",
  "zkusebna.overeni.zvetseniPriCtyrechPetinach": "Zvětšení křivosti při ⅘ kritické síly",
  "zkusebna.overeni.pruhybPoVyboceni": "Průhyb středu po vybočení",
} as const;

export type KlicTextu = keyof typeof CS;

/** Vrátí text podle klíče a doplní hodnoty na místa označená {jmenem}. */
export function t(klic: KlicTextu, hodnoty: Readonly<Record<string, string | number>> = {}): string {
  return CS[klic].replace(/\{(\w+)\}/g, (cele: string, jmeno: string) => {
    const hodnota = hodnoty[jmeno];
    return hodnota === undefined ? cele : String(hodnota);
  });
}

export function jeKlicTextu(klic: string): klic is KlicTextu {
  return klic in CS;
}
