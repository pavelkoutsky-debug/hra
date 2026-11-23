// Kreslení koleje: pražce přes čáru kolejiště a přes koleje na předmostí.

import { BARVY } from "./barvy";

/**
 * Pražce koleje na předmostí: od konce trasy `kotva` směrem `smer` (−1 doleva, 1 doprava)
 * až k okraji obrazu. Rozteč se měří od konce trasy, takže pražce při posunu pohledu stojí
 * na místě.
 */
export function nakresliPrazcePredmosti(
  ctx: CanvasRenderingContext2D,
  kotva: { x: number; y: number },
  smer: 1 | -1,
  sirkaObrazu: number,
  m: number,
  tloustka: number,
): void {
  const roztec = 0.6 * m * Math.max(1, Math.ceil(5 / (0.6 * m)));
  const pul = tloustka / 2;
  // První viditelný pražec: přeskočí ty, které jsou mimo obraz.
  const odKraje = smer === 1 ? -kotva.x : kotva.x - sirkaObrazu;
  let i = Math.max(0, Math.floor(odKraje / roztec - 0.5));
  ctx.save();
  ctx.lineCap = "butt";
  ctx.strokeStyle = BARVY.pozadi;
  ctx.lineWidth = Math.min(2.4, Math.max(1, 0.07 * m));
  ctx.beginPath();
  for (; ; i++) {
    const x = kotva.x + smer * roztec * (i + 0.5);
    if (x < -roztec || x > sirkaObrazu + roztec) {
      if ((smer === 1 && x > sirkaObrazu) || (smer === -1 && x < 0)) break;
      continue;
    }
    ctx.moveTo(x, kotva.y + pul);
    ctx.lineTo(x, kotva.y - pul);
  }
  ctx.stroke();
  ctx.restore();
}

/**
 * Pražce kolejiště: krátké příčné čárky v barvě pozadí přes čáru mostovky, po 0,6 m
 * (při malém měřítku řidší, aby nesplynuly). Kolej je podle nich na výkresu poznat na první pohled.
 */
export function nakresliPrazce(
  ctx: CanvasRenderingContext2D,
  a: { x: number; y: number },
  b: { x: number; y: number },
  m: number,
  tloustka: number,
): void {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const delka = Math.hypot(dx, dy);
  if (delka < 1) return;
  const ex = dx / delka;
  const ey = dy / delka;
  // Rozteč je celý násobek 0,6 m a aspoň pět pixelů; pražce jsou od začátku prvku souměrně.
  const roztec = 0.6 * m * Math.max(1, Math.ceil(5 / (0.6 * m)));
  const pocet = Math.max(1, Math.round(delka / roztec));
  const krok = delka / pocet;
  const pul = tloustka / 2;
  ctx.save();
  ctx.lineCap = "butt";
  ctx.strokeStyle = BARVY.pozadi;
  ctx.lineWidth = Math.min(2.4, Math.max(1, 0.07 * m));
  ctx.beginPath();
  for (let i = 0; i < pocet; i++) {
    const x = a.x + ex * krok * (i + 0.5);
    const y = a.y + ey * krok * (i + 0.5);
    ctx.moveTo(x - ey * pul, y + ex * pul);
    ctx.lineTo(x + ey * pul, y - ex * pul);
  }
  ctx.stroke();
  ctx.restore();
}
