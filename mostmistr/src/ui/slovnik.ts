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
