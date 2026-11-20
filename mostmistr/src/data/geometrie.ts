/** Bod ve světových souřadnicích: metry, osa y směřuje nahoru. */
export interface Bod {
  x: number;
  y: number;
}

/** Osově zarovnaný obdélník ve světových souřadnicích (metry). */
export interface Obdelnik {
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
}

export function jeUvnitr(o: Obdelnik, b: Bod): boolean {
  return b.x >= o.xMin && b.x <= o.xMax && b.y >= o.yMin && b.y <= o.yMax;
}
