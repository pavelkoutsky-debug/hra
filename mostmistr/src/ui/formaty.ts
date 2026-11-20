// Zápis čísel a údajů po česku: desetinná čárka, typografické minus.

const MINUS = "−";

export function cislo(hodnota: number, mist: number): string {
  // −0,00 nechceme; zaokrouhlená nula je prostě nula.
  const zaokrouhlene = Number(hodnota.toFixed(mist));
  const zapis = Math.abs(zaokrouhlene).toFixed(mist).replace(".", ",");
  return zaokrouhlene < 0 ? MINUS + zapis : zapis;
}

export function delka(metry: number): string {
  return `${cislo(metry, 2)} m`;
}

/** Výšková kóta se znaménkem, jak se píše na výkresech: +2,00 nebo −6,00. */
export function vyskovaKota(metry: number): string {
  const zapis = cislo(metry, 2);
  return metry > 0 && zapis !== "0,00" ? `+${zapis}` : zapis;
}

/** Jeden CSS pixel má podle definice 1/96 palce. */
const MM_NA_PIXEL = 25.4 / 96;

/**
 * Měřítko výkresu pro popisové pole, např. „1 : 150“. Vychází z toho, kolik
 * milimetrů obrazovky připadá na metr světa, a zaokrouhluje na hezké číslo.
 */
export function meritkoVykresu(pixeluNaMetr: number): string {
  const pomer = 1000 / (pixeluNaMetr * MM_NA_PIXEL);
  const krok = pomer < 20 ? 1 : pomer < 100 ? 5 : pomer < 1000 ? 10 : 50;
  return `1 : ${Math.max(1, Math.round(pomer / krok) * krok)}`;
}

export function datum(den: Date): string {
  return `${den.getDate()}. ${den.getMonth() + 1}. ${den.getFullYear()}`;
}
