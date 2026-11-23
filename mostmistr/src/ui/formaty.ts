// Zápis čísel a údajů v jazyce hry. Česky desetinná čárka a úzká mezera mezi tisíci, anglicky
// desetinná tečka a čárka mezi tisíci; v obou typografické minus.

import { aktualniJazyk } from "./slovnik";

const MINUS = "−";

const anglicky = (): boolean => aktualniJazyk() === "en";

export function cislo(hodnota: number, mist: number): string {
  // −0,00 nechceme; zaokrouhlená nula je prostě nula.
  const zaokrouhlene = Number(hodnota.toFixed(mist));
  const zapis = Math.abs(zaokrouhlene).toFixed(mist);
  return (zaokrouhlene < 0 ? MINUS : "") + (anglicky() ? zapis : zapis.replace(".", ","));
}

export function delka(metry: number): string {
  return `${cislo(metry, 2)} m`;
}

/** Výšková kóta se znaménkem, jak se píše na výkresech: +2,00 nebo −6,00. */
export function vyskovaKota(metry: number): string {
  const zapis = cislo(metry, 2);
  return metry > 0 && zapis !== cislo(0, 2) ? `+${zapis}` : zapis;
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

const MESICE_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

export function datum(den: Date): string {
  if (anglicky()) return `${den.getDate()} ${MESICE_EN[den.getMonth()]} ${den.getFullYear()}`;
  return `${den.getDate()}. ${den.getMonth() + 1}. ${den.getFullYear()}`;
}

/** Celé číslo s oddělenými tisíci: česky úzkou nedělitelnou mezerou (33 500), anglicky čárkou (33,500). */
export function celeCislo(hodnota: number): string {
  const zaokrouhlene = Math.round(hodnota);
  const zapis = String(Math.abs(zaokrouhlene)).replace(/\B(?=(\d{3})+$)/g, anglicky() ? "," : "\u202f");
  return zaokrouhlene < 0 ? MINUS + zapis : zapis;
}

/** Částka v korunách, např. „33 500 Kč“. */
export function koruny(castka: number): string {
  return `${celeCislo(castka)}\u00a0Kč`;
}

/** Podíl jako procenta bez desetinných míst; 0,756 → „76 %“. */
export function procenta(podil: number): string {
  return `${celeCislo(podil * 100)}\u00a0%`;
}

/** Hmotnost: do tuny v kilogramech, výš v tunách s jedním desetinným místem. */
export function hmotnost(kg: number): string {
  return kg < 1000 ? `${celeCislo(kg)}\u00a0kg` : `${cislo(kg / 1000, 1)}\u00a0t`;
}
