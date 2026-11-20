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
  "zkusebna.most.nazev": "Příhradový most s koly",
  "zkusebna.most.popis":
    "Nízká dřevěná kloubová příhrada o rozpětí 24 m, po které jede šest kol po deseti tunách. Barva prutu ukazuje, jak moc je namáhaný; únosnost ve vzpěru se zatím neposuzuje. Součet sil v podporách musí odpovídat tíze mostu a kol.",
  "zkusebna.rezonance.nazev": "Rezonance nosníku",
  "zkusebna.rezonance.popis":
    "Na prostý nosník 12 m působí uprostřed síla 2 kN, která kmitá přesně v jeho vlastní frekvenci. Staticky by ho prohnula o 3 mm. S útlumem 1 % se má rozkmitat asi padesátkrát víc.",
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
  "zkusebna.overeni.reakce": "Součet reakcí v podporách",
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
