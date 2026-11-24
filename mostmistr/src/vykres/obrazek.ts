// Obrázek výkresu ke sdílení: úroveň s mostem a pod ní popisové pole (název, cena, hmotnost,
// medaile, adresa hry). Kreslí stejnými funkcemi jako výkres ve hře, jen do plátna pevné
// velikosti, takže obrázek vypadá stejně na telefonu i na velkém monitoru.

import type { Obdelnik } from "../data/geometrie";
import type { NavrhMostu } from "../data/navrh";
import type { Uroven } from "../data/uroven";
import { BARVY, PISMO, cara } from "./barvy";
import { celyVyrez } from "./kamera";
import { nakresliNavrh } from "./navrh";
import { nakresliVykres } from "./vykres";

/** Rozměr obrázku v pixelech (poměr stran, jaký chtějí náhledy odkazů). */
export const SIRKA_OBRAZKU = 1200;
export const VYSKA_OBRAZKU = 630;
/** Výška popisového pole pod výkresem. */
const VYSKA_POLE = 92;
/** Okraj kolem mostu v metrech; pod ním a nad ním aspoň tolik, aby bylo vidět údolí. */
const OKRAJ = 3;

export interface PopisObrazku {
  /** Název hry. */
  hra: string;
  /** Úroveň: „1-03 · První auto“. */
  uroven: string;
  /** Údaje o mostě vpravo: cena, hmotnost, medaile. */
  udaje: readonly string[];
  /** Adresa hry (bez protokolu). */
  adresa: string;
}

/**
 * Výřez světa, který má obrázek ukázat: most se vším, k čemu se váže (kotvy, základy, konce
 * tras), s okrajem a v mezích výřezu úrovně. Prázdný návrh ukáže kotvy a trasy.
 */
export function vyrezObrazku(uroven: Uroven, navrh: NavrhMostu): Obdelnik {
  const body = [...navrh.stycniky, ...uroven.kotvy, ...uroven.zaklady, ...uroven.trasy.flatMap((t) => [t.zacatek, t.konec])];
  let xMin = Infinity;
  let xMax = -Infinity;
  let yMin = Infinity;
  let yMax = -Infinity;
  for (const b of body) {
    xMin = Math.min(xMin, b.x);
    xMax = Math.max(xMax, b.x);
    yMin = Math.min(yMin, b.y);
    yMax = Math.max(yMax, b.y);
  }
  if (!(xMin <= xMax)) return uroven.vyrez;
  const v = uroven.vyrez;
  return {
    xMin: Math.max(v.xMin, xMin - OKRAJ),
    xMax: Math.min(v.xMax, xMax + OKRAJ),
    yMin: Math.max(v.yMin, yMin - OKRAJ),
    yMax: Math.min(v.yMax, yMax + OKRAJ),
  };
}

/** Text zkrácený tak, aby se vešel do `sirka` pixelů; na konci tři tečky. */
function zkrat(ctx: CanvasRenderingContext2D, text: string, sirka: number): string {
  if (ctx.measureText(text).width <= sirka) return text;
  let kratsi = text;
  while (kratsi.length > 1 && ctx.measureText(`${kratsi}…`).width > sirka) kratsi = kratsi.slice(0, -1);
  return `${kratsi}…`;
}

/**
 * Nakreslí obrázek mostu do plátna `SIRKA_OBRAZKU` × `VYSKA_OBRAZKU` (kontext v pixelech
 * plátna). `obalka` je využití prutů z poslední zkoušky téhož mostu, nebo null: pruty se pak
 * kreslí bez barev využití.
 */
export function nakresliObrazekMostu(
  ctx: CanvasRenderingContext2D,
  uroven: Uroven,
  navrh: NavrhMostu,
  popis: PopisObrazku,
  obalka: readonly { vyuziti: number; tah: boolean }[] | null = null,
): void {
  const rozmer = { sirka: SIRKA_OBRAZKU, vyska: VYSKA_OBRAZKU - VYSKA_POLE };
  const kamera = celyVyrez(vyrezObrazku(uroven, navrh), rozmer, 28);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, rozmer.sirka, rozmer.vyska);
  ctx.clip();
  nakresliVykres(ctx, { uroven, kamera, rozmer, kurzor: null });
  nakresliNavrh(ctx, kamera, rozmer, {
    navrh,
    vybranePruty: new Set(),
    vybraneStycniky: new Set(),
    tah: null,
    zacatek: null,
    problemy: [],
    obalka,
  });
  ctx.restore();

  // Popisové pole: jako rohové razítko výkresu, jen přes celou šířku.
  const y = rozmer.vyska;
  ctx.fillStyle = "#0b2f5c";
  ctx.fillRect(0, y, SIRKA_OBRAZKU, VYSKA_POLE);
  ctx.strokeStyle = BARVY.cara;
  ctx.lineWidth = 2;
  ctx.strokeRect(1, y + 1, SIRKA_OBRAZKU - 2, VYSKA_POLE - 2);
  ctx.lineWidth = 1;
  ctx.strokeStyle = cara(0.5);
  ctx.strokeRect(0.5, 0.5, SIRKA_OBRAZKU - 1, VYSKA_OBRAZKU - 1);

  const okraj = 24;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.fillStyle = BARVY.popisek;
  ctx.font = `13px ${PISMO}`;
  ctx.fillText(popis.hra.toUpperCase(), okraj, y + 28);
  ctx.fillStyle = BARVY.caraSilna;
  ctx.font = `26px ${PISMO}`;
  ctx.fillText(zkrat(ctx, popis.uroven, SIRKA_OBRAZKU * 0.48), okraj, y + 62);
  ctx.fillStyle = BARVY.popisek;
  ctx.font = `13px ${PISMO}`;
  ctx.fillText(popis.adresa, okraj, y + 82);

  ctx.textAlign = "right";
  ctx.fillStyle = BARVY.caraSilna;
  ctx.font = `22px ${PISMO}`;
  const [hlavni, ...dalsi] = popis.udaje;
  if (hlavni !== undefined) ctx.fillText(zkrat(ctx, hlavni, SIRKA_OBRAZKU * 0.46), SIRKA_OBRAZKU - okraj, y + 40);
  ctx.fillStyle = BARVY.cara;
  ctx.font = `15px ${PISMO}`;
  if (dalsi.length > 0) ctx.fillText(zkrat(ctx, dalsi.join("  ·  "), SIRKA_OBRAZKU * 0.46), SIRKA_OBRAZKU - okraj, y + 70);
  ctx.textAlign = "left";
}
