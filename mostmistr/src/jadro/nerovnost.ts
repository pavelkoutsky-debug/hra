// Nerovnost vozovky: náhodný výškový profil silnice, po kterém jedou kola.
//
// Bez nerovností by vozidlo most dynamicky skoro nezatížilo; teprve hrboly rozhoupou
// karoserii a rozskáčou nápravy, a ty pak do mostovky buší (koncepce, kap. 7.6).
//
// Profil odpovídá normovému popisu silnic (ISO 8608): výkonová hustota klesá s druhou
// mocninou prostorové frekvence, G(n) = G₀·(n₀/n)², n₀ = 0,1 cyklu na metr. Takové spektrum
// má náhodná procházka; aby profil neodplaval, vrací se s délkou `DELKA_NAVRATU` k nule
// (Ornsteinův–Uhlenbeckův proces). Rozptyl přírůstku na metr je q = 2π²·G₀·n₀².
// Vzorky jsou po čtvrt metru a vyhlazené přes tři sousedy: kratší vlny pneumatika stejně
// přejede celou stopou. Mezi vzorky se prokládá kubickou křivkou, takže profil má spojitý sklon.
//
// Počítá se jen sčítáním, násobením, dělením a odmocninou a náhoda je z násady, takže
// stejná úroveň má ve všech prohlížečích bitově stejnou silnici.

import { nahoda } from "./nahoda";

/** Třídy nerovnosti: A nová hladká vozovka, B běžná, C rozbitá. */
export type TridaVozovky = "A" | "B" | "C";

/** Střední hodnota G₀ třídy v m³ (ISO 8608: A 16, B 64, C 256 · 10⁻⁶). */
const HUSTOTA: Readonly<Record<TridaVozovky, number>> = { A: 16e-6, B: 64e-6, C: 256e-6 };
const N0 = 0.1;
/** Vzdálenost vzorků profilu, m. */
const KROK = 0.25;
/** Délka, na které se profil vrací k nule, m; delší vlny vozidlo necítí jako hrboly. */
const DELKA_NAVRATU = 10;

export interface Nerovnost {
  /** Poloha prvního vzorku a vzdálenost vzorků, m. */
  x0: number;
  krok: number;
  /** Výšky nad rovnou vozovkou, m. */
  vysky: Float64Array;
}

/** Směrodatná odchylka výšky profilu dané třídy, m: A 4 mm, B 8 mm, C 16 mm. */
export function odchylkaNerovnosti(trida: TridaVozovky): number {
  const q = 2 * Math.PI * Math.PI * HUSTOTA[trida] * N0 * N0;
  return Math.sqrt((q * DELKA_NAVRATU) / 2);
}

/**
 * Vyrobí profil vozovky třídy `trida` mezi `od` a `po` (m). Stejná násada dá stejný profil.
 * Vyšší třída má stejný tvar jako nižší se stejnou násadou, jen dvakrát vyšší: tatáž silnice,
 * jen víc rozbitá.
 */
export function vytvorNerovnost(od: number, po: number, trida: TridaVozovky, nasada: number): Nerovnost {
  const pocet = Math.max(4, Math.ceil((po - od) / KROK) + 1);
  const nahodne = nahoda(nasada);
  /** Přibližně normální náhodné číslo: součet čtyř rovnoměrných, střed 0, rozptyl 1. */
  const normalni = (): number => (nahodne() + nahodne() + nahodne() + nahodne() - 2) * Math.sqrt(3);
  const sigma = odchylkaNerovnosti(trida);
  // Zeslabení za jeden krok: e^(−k) ≈ 1 − k + k²/2 pro k = KROK/DELKA_NAVRATU = 1/40.
  const k = KROK / DELKA_NAVRATU;
  const zeslabeni = 1 - k + (k * k) / 2;
  const sum = sigma * Math.sqrt(1 - zeslabeni * zeslabeni);

  // Dva vzorky navíc na každé straně pro vyhlazení okrajů.
  const surove = new Float64Array(pocet + 2);
  surove[0] = sigma * normalni();
  for (let i = 1; i < surove.length; i++) surove[i] = zeslabeni * surove[i - 1]! + sum * normalni();
  const vysky = new Float64Array(pocet);
  for (let i = 0; i < pocet; i++) vysky[i] = 0.25 * surove[i]! + 0.5 * surove[i + 1]! + 0.25 * surove[i + 2]!;
  return { x0: od, krok: KROK, vysky };
}

/**
 * Výška profilu v místě `x`. Mezi vzorky kubická křivka procházející vzorky (Catmull–Rom);
 * před prvním a za posledním vzorkem profil pokračuje vodorovně.
 */
export function vyskaNerovnosti(n: Nerovnost, x: number): number {
  const { vysky } = n;
  const posledni = vysky.length - 1;
  const poloha = (x - n.x0) / n.krok;
  if (!(poloha > 0)) return vysky[0]!;
  if (poloha >= posledni) return vysky[posledni]!;
  const i = Math.floor(poloha);
  const t = poloha - i;
  const p1 = vysky[i]!;
  const p2 = vysky[i + 1]!;
  const p0 = i > 0 ? vysky[i - 1]! : p1;
  const p3 = i + 2 <= posledni ? vysky[i + 2]! : p2;
  return (
    p1 +
    0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)))
  );
}
