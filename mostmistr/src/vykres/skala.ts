// Barevná škála využití prutu: bílá → žlutá → oranžová → červená.
// Jedna škála pro tah i tlak; ty se na výkresu liší vzorem čáry.

const ZASTAVKY: readonly (readonly [number, number, number, number])[] = [
  [0, 255, 255, 255],
  [0.5, 255, 209, 102],
  [0.8, 255, 154, 77],
  [1, 255, 77, 61],
];

/** Barva pro využití 0 (bez namáhání) až 1 (mez únosnosti); hodnoty mimo rozsah se oříznou. */
export function barvaVyuziti(vyuziti: number): string {
  const u = Math.min(1, Math.max(0, Math.abs(vyuziti)));
  for (let i = 1; i < ZASTAVKY.length; i++) {
    const [u0, r0, g0, b0] = ZASTAVKY[i - 1]!;
    const [u1, r1, g1, b1] = ZASTAVKY[i]!;
    if (u <= u1) {
      const t = (u - u0) / (u1 - u0);
      const slozka = (a: number, b: number): number => Math.round(a + (b - a) * t);
      return `rgb(${slozka(r0, r1)}, ${slozka(g0, g1)}, ${slozka(b0, b1)})`;
    }
  }
  return "rgb(255, 77, 61)";
}
