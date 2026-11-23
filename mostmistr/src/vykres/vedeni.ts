// Vedený první krok na výkresu: duch prvního dílu mostovky s pokynem a popisky podpor.

import type { Bod } from "../data/geometrie";
import { BARVY, PISMO } from "./barvy";
import { svetNaObraz, type Kamera, type Rozmer } from "./kamera";

export interface Vedeni {
  /** Odkud kam má hráč táhnout, ve světových souřadnicích. */
  od: Bod;
  po: Bod;
  /** Pokyn nad duchem prutu. */
  popis: string;
  /**
   * Popisky podpor pod jejich značkami: celý text a krátký pro úzké plátno, kde by se celé
   * popisky překryly. `vlevo` je podpora na levém břehu: její popisek jde od ní doleva.
   */
  podpory: readonly { misto: Bod; text: string; kratce: string; vlevo: boolean }[];
  /** Kde na duchovi je právě běžící tečka, 0 až 1; null ji nekreslí (omezený pohyb). */
  faze: number | null;
}

/** Štítek s tmavým podkladem; `vlevo` je levý okraj podkladu. */
function stitek(ctx: CanvasRenderingContext2D, text: string, vlevo: number, y: number, barva: string): void {
  const sirka = ctx.measureText(text).width;
  ctx.fillStyle = "rgb(8 32 68 / 0.9)";
  ctx.fillRect(vlevo, y - 9, sirka + 6, 18);
  ctx.fillStyle = barva;
  ctx.textAlign = "left";
  ctx.fillText(text, vlevo + 3, y);
}

/** Levý okraj štítku vystředěného na `x`, který se drží na plátně. */
function vystredeny(ctx: CanvasRenderingContext2D, text: string, x: number, rozmer: Rozmer): number {
  const sirka = ctx.measureText(text).width + 6;
  return Math.max(4, Math.min(rozmer.sirka - sirka - 4, x - sirka / 2));
}

/** Nakreslí ducha prutu (čárkovaně, se šipkou na konci a kroužkem na začátku), pokyn a popisky podpor. */
export function nakresliVedeni(ctx: CanvasRenderingContext2D, kamera: Kamera, rozmer: Rozmer, v: Vedeni): void {
  const od = svetNaObraz(kamera, rozmer, v.od);
  const po = svetNaObraz(kamera, rozmer, v.po);
  const dx = po.x - od.x;
  const dy = po.y - od.y;
  const delka = Math.hypot(dx, dy);
  if (!(delka > 1)) return;
  const ux = dx / delka;
  const uy = dy / delka;
  ctx.save();
  ctx.lineCap = "butt";
  // Tmavý podklad, ať je duch vidět i přes čáru trasy.
  ctx.strokeStyle = "rgb(8 32 68 / 0.75)";
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(od.x, od.y);
  ctx.lineTo(po.x, po.y);
  ctx.stroke();
  ctx.strokeStyle = BARVY.varovani;
  ctx.fillStyle = BARVY.varovani;
  ctx.lineWidth = 3;
  ctx.setLineDash([8, 6]);
  ctx.beginPath();
  ctx.moveTo(od.x, od.y);
  ctx.lineTo(po.x - 10 * ux, po.y - 10 * uy);
  ctx.stroke();
  ctx.setLineDash([]);
  // Šipka na konci a kroužek na začátku: odkud kam.
  ctx.beginPath();
  ctx.moveTo(po.x, po.y);
  ctx.lineTo(po.x - 14 * ux - 7 * uy, po.y - 14 * uy + 7 * ux);
  ctx.lineTo(po.x - 14 * ux + 7 * uy, po.y - 14 * uy - 7 * ux);
  ctx.closePath();
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(od.x, od.y, 9, 0, 2 * Math.PI);
  ctx.stroke();
  if (v.faze !== null) {
    const f = Math.max(0, Math.min(1, v.faze));
    ctx.beginPath();
    ctx.arc(od.x + f * dx, od.y + f * dy, 5, 0, 2 * Math.PI);
    ctx.fill();
  }
  ctx.font = `bold 12px ${PISMO}`;
  ctx.textBaseline = "middle";
  stitek(ctx, v.popis, vystredeny(ctx, v.popis, (od.x + po.x) / 2, rozmer), Math.min(od.y, po.y) - 24, BARVY.varovani);
  // Popisky podpor: levá doleva, pravá doprava, ať si nepřekážejí. Celé texty jen tehdy,
  // když se na plátno vejdou všechny; jinak krátké.
  ctx.font = `11px ${PISMO}`;
  const PRESAH = 14;
  const okraje = (cele: boolean): { vlevo: number; vpravo: number; text: string; y: number }[] =>
    v.podpory.map((podpora) => {
      const p = svetNaObraz(kamera, rozmer, podpora.misto);
      const text = cele ? podpora.text : podpora.kratce;
      const sirka = ctx.measureText(text).width + 6;
      const vlevo = podpora.vlevo ? p.x + PRESAH - sirka : p.x - PRESAH;
      return { vlevo, vpravo: vlevo + sirka, text, y: p.y + 38 };
    });
  const vejdouSe = (stitky: { vlevo: number; vpravo: number }[]): boolean =>
    stitky.every((a, i) => a.vlevo >= 2 && a.vpravo <= rozmer.sirka - 2 && stitky.every((b, j) => j <= i || a.vpravo + 6 <= b.vlevo || b.vpravo + 6 <= a.vlevo));
  const cele = okraje(true);
  for (const s of vejdouSe(cele) ? cele : okraje(false)) stitek(ctx, s.text, s.vlevo, s.y, BARVY.caraSilna);
  ctx.restore();
}
