// Náhoda pro simulaci: dav, fáze kroku, později nerovnosti vozovky.
// Stejná násada dá ve všech prohlížečích stejnou řadu čísel; používají se jen
// celočíselné operace, dělení a odmocnina.

/** Generátor náhodných čísel 0 až 1 (Mulberry32). */
export function nahoda(nasada: number): () => number {
  let stav = nasada >>> 0;
  return () => {
    stav = (stav + 0x6d2b79f5) >>> 0;
    let t = stav;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Náhodná fáze jako jednotkový vektor (cos, sin): bod uvnitř kruhu promítnutý na kružnici. */
export function nahodnaFaze(nahodne: () => number): [number, number] {
  for (;;) {
    const x = 2 * nahodne() - 1;
    const y = 2 * nahodne() - 1;
    const d = x * x + y * y;
    if (d > 0.01 && d <= 1) {
      const delka = Math.sqrt(d);
      return [x / delka, y / delka];
    }
  }
}
