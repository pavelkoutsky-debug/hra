// Zápis čísel a údajů v jazyce hry. Česky desetinná čárka a úzká mezera mezi tisíci, anglicky
// desetinná tečka a čárka mezi tisíci; v obou typografické minus.

import { aktualniJazyk } from "./slovnik";

const MINUS = "−";

const anglicky = (): boolean => aktualniJazyk() === "en";

/**
 * Oddělí tisíce v celé části čísla. Anglicky čárkou vždy (1,000), česky úzkou nedělitelnou
 * mezerou od pěti číslic (27 018; čtyřmístné číslo se česky smí psát dohromady).
 */
function seskupTisice(cela: string): string {
  if (anglicky()) return cela.replace(/\B(?=(\d{3})+$)/g, ",");
  return cela.length < 5 ? cela : cela.replace(/\B(?=(\d{3})+$)/g, "\u202f");
}

export function cislo(hodnota: number, mist: number): string {
  // −0,00 nechceme; zaokrouhlená nula je prostě nula.
  const zaokrouhlene = Number(hodnota.toFixed(mist));
  const [cela = "0", desetinna] = Math.abs(zaokrouhlene).toFixed(mist).split(".");
  const zapis = desetinna === undefined ? seskupTisice(cela) : `${seskupTisice(cela)}${anglicky() ? "." : ","}${desetinna}`;
  return (zaokrouhlene < 0 ? MINUS : "") + zapis;
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

/** Podíl jako procenta bez desetinných míst; 0,756 → „76 %“ (anglicky bez mezery: „76%“). */
export function procenta(podil: number): string {
  return `${celeCislo(podil * 100)}${anglicky() ? "" : "\u00a0"}%`;
}

/** Hmotnost: do tuny v kilogramech, výš v tunách s jedním desetinným místem. */
export function hmotnost(kg: number): string {
  return kg < 1000 ? `${celeCislo(kg)}\u00a0kg` : `${cislo(kg / 1000, 1)}\u00a0t`;
}

/**
 * Rozdíl dvou hodnot se znaménkem tak, jak ho hráč vidí: počítá se ze zaokrouhlených hodnot,
 * ne z přesných. Využití 42,6 % a 44,4 % se píše „43 %“ a „44 %“, takže rozdíl je „+1 %“,
 * ne „+2 %“. `nasobek` říká, kolika nejmenším zobrazeným dílkům odpovídá jednotka hodnoty
 * (procenta ze podílu 100, koruny 1, kN z newtonů 0,001): zaokrouhluje se stejně jako v zápisu.
 * Null, když obě hodnoty vypadají stejně.
 */
export function zobrazenyRozdil(nove: number, stare: number, zapis: (hodnota: number) => string, nasobek: number): string | null {
  const dilku = Math.round(nove * nasobek) - Math.round(stare * nasobek);
  if (dilku === 0 || zapis(nove) === zapis(stare)) return null;
  return `${dilku > 0 ? "+" : "−"}${zapis(Math.abs(dilku) / nasobek)}`;
}
