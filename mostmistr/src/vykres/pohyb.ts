// Kreslení pohyblivých mostů: píst, dělicí zámek, plavební profil a loď.

import type { Lod } from "../data/uroven";
import { BARVY, PISMO } from "./barvy";
import { svetNaObraz, type Kamera, type Rozmer } from "./kamera";

interface BodObrazu {
  x: number;
  y: number;
}

function mezi(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/**
 * Délka válce pístu v metrech: válec se vejde do pístu v jeho nejkratší poloze. Píst se
 * kreslí zasunutý, takže u kladného zdvihu je to nakreslená délka, u záporného o zdvih kratší.
 */
export function delkaValce(nakreslena: number, zdvih: number): number {
  return 0.88 * Math.min(nakreslena, nakreslena + zdvih);
}

/** Jak dlouho se loď před připlutím a po odplutí objevuje a mizí, v sekundách. */
export const NAJEZD_LODI = 0.6;

/**
 * Hydraulický píst: válec u konce `a`, pístnice ke konci `b`. `valec` je délka válce
 * v pixelech; je stálá, takže při vysouvání přibývá jen pístnice.
 */
export function nakresliPist(
  ctx: CanvasRenderingContext2D,
  a: BodObrazu,
  b: BodObrazu,
  m: number,
  barva: string,
  valec: number,
): void {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const delka = Math.hypot(dx, dy);
  if (!(delka > 0)) return;
  const ex = dx / delka;
  const ey = dy / delka;
  const pul = mezi(0.17 * m, 4, 8);
  const telo = Math.min(valec, 0.94 * delka);
  const bod = (podel: number, napric: number): [number, number] => [
    a.x + ex * podel - ey * napric,
    a.y + ey * podel + ex * napric,
  ];
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "butt";
  // Pístnice: silná světlá čára s tmavým středem, aby se nepletla s prutem.
  ctx.strokeStyle = barva;
  ctx.lineWidth = Math.max(2.4, 0.7 * pul);
  ctx.beginPath();
  ctx.moveTo(...bod(telo, 0));
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.strokeStyle = BARVY.pozadi;
  ctx.lineWidth = Math.max(0.8, 0.22 * pul);
  ctx.beginPath();
  ctx.moveTo(...bod(telo, 0));
  ctx.lineTo(...bod(delka - 2, 0));
  ctx.stroke();
  // Válec.
  ctx.fillStyle = BARVY.pozadi;
  ctx.strokeStyle = barva;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(...bod(0, -pul));
  ctx.lineTo(...bod(telo, -pul));
  ctx.lineTo(...bod(telo, pul));
  ctx.lineTo(...bod(0, pul));
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Víko válce, kterým pístnice prochází.
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(...bod(telo, -pul - 1.5));
  ctx.lineTo(...bod(telo, pul + 1.5));
  ctx.stroke();
  ctx.restore();
}

/**
 * Dělicí zámek ve styčníku: kosočtverec kolem styčníku. Odemčený je rozevřený na dvě
 * poloviny, mezi kterými je mezera.
 */
export function nakresliZamek(
  ctx: CanvasRenderingContext2D,
  p: BodObrazu,
  m: number,
  barva: string,
  otevreny: boolean,
): void {
  const r = mezi(0.24 * m, 7, 11);
  const mezera = otevreny ? 0.45 * r : 0;
  ctx.save();
  ctx.lineJoin = "miter";
  ctx.lineCap = "round";
  ctx.strokeStyle = BARVY.pozadi;
  ctx.lineWidth = 4.2;
  for (const pruchod of [0, 1]) {
    if (pruchod === 1) {
      ctx.strokeStyle = barva;
      ctx.lineWidth = 1.8;
    }
    ctx.beginPath();
    ctx.moveTo(p.x - mezera, p.y - r);
    ctx.lineTo(p.x - mezera - r, p.y);
    ctx.lineTo(p.x - mezera, p.y + r);
    if (!otevreny) {
      ctx.lineTo(p.x + r, p.y);
      ctx.closePath();
    } else {
      ctx.moveTo(p.x + mezera, p.y - r);
      ctx.lineTo(p.x + mezera + r, p.y);
      ctx.lineTo(p.x + mezera, p.y + r);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Plavební profil lodi: čárkovaný obdélník nad hladinou, do kterého při průjezdu lodi nesmí
 * zasahovat nic z mostu. `popisek` se píše dovnitř k hornímu okraji.
 */
export function nakresliPlavebniProfil(
  ctx: CanvasRenderingContext2D,
  kamera: Kamera,
  rozmer: Rozmer,
  hladina: number,
  lod: Lod,
  popisek: string | null,
  alfa: number,
): void {
  const a = svetNaObraz(kamera, rozmer, { x: lod.xMin, y: hladina + lod.vyska });
  const b = svetNaObraz(kamera, rozmer, { x: lod.xMax, y: hladina });
  ctx.save();
  ctx.globalAlpha = alfa;
  ctx.strokeStyle = BARVY.voda;
  ctx.lineWidth = 1.2;
  ctx.setLineDash([7, 5]);
  ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
  ctx.setLineDash([]);
  if (popisek && b.x - a.x > 60) {
    ctx.font = `11px ${PISMO}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = BARVY.voda;
    ctx.fillText(popisek, (a.x + b.x) / 2, a.y + 6, b.x - a.x - 8);
  }
  ctx.restore();
}

/**
 * Loď při pohledu zpředu (pluje kolmo k výkresu): trup, nástavba a stěžeň, který sahá až
 * k hornímu okraji plavebního profilu. `narazila` ji nakreslí barvou varování.
 */
export function nakresliLod(
  ctx: CanvasRenderingContext2D,
  kamera: Kamera,
  rozmer: Rozmer,
  hladina: number,
  lod: Lod,
  alfa: number,
  narazila: boolean,
): void {
  const stred = (lod.xMin + lod.xMax) / 2;
  const sirka = 0.72 * (lod.xMax - lod.xMin);
  const v = lod.vyska;
  const naObraz = (x: number, y: number): BodObrazu => svetNaObraz(kamera, rozmer, { x: stred + x, y: hladina + y });
  const barva = narazila ? BARVY.varovani : BARVY.caraSilna;
  const cesta = (body: [number, number][]): void => {
    ctx.beginPath();
    body.forEach(([x, y], i) => {
      const p = naObraz(x, y);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
  };
  const paluba = 0.26 * v;
  const strecha = 0.52 * v;
  ctx.save();
  ctx.globalAlpha = alfa;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = barva;
  ctx.fillStyle = BARVY.pozadi;
  ctx.lineWidth = 1.8;
  // Trup: u hladiny užší, k palubě se rozšiřuje; kýl je pod vodou.
  cesta([
    [-0.5 * sirka, paluba],
    [-0.34 * sirka, 0],
    [-0.12 * sirka, -0.1 * v],
    [0.12 * sirka, -0.1 * v],
    [0.34 * sirka, 0],
    [0.5 * sirka, paluba],
  ]);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Příď: svislá hrana uprostřed trupu.
  cesta([
    [0, paluba],
    [0, -0.1 * v],
  ]);
  ctx.stroke();
  // Nástavba s okny můstku.
  cesta([
    [-0.26 * sirka, paluba],
    [-0.26 * sirka, strecha],
    [0.26 * sirka, strecha],
    [0.26 * sirka, paluba],
  ]);
  ctx.fill();
  ctx.stroke();
  ctx.lineWidth = 1.2;
  cesta([
    [-0.2 * sirka, 0.43 * v],
    [0.2 * sirka, 0.43 * v],
  ]);
  ctx.stroke();
  // Stěžeň s ráhnem: jeho vrchol určuje výšku profilu.
  ctx.lineWidth = 1.6;
  cesta([
    [0, strecha],
    [0, 0.985 * v],
  ]);
  ctx.stroke();
  cesta([
    [-0.14 * sirka, 0.8 * v],
    [0.14 * sirka, 0.8 * v],
  ]);
  ctx.stroke();
  ctx.restore();
}

/**
 * Jak moc je loď v čase `cas` vidět (0 až 1): objevuje se krátce před připlutím, je pod
 * mostem po dobu průjezdu a pak mizí.
 */
export function viditelnostLodi(lod: Lod, cas: number): number {
  if (cas < lod.cas - NAJEZD_LODI || cas > lod.cas + lod.trvani + NAJEZD_LODI) return 0;
  if (cas < lod.cas) return (cas - (lod.cas - NAJEZD_LODI)) / NAJEZD_LODI;
  if (cas > lod.cas + lod.trvani) return (lod.cas + lod.trvani + NAJEZD_LODI - cas) / NAJEZD_LODI;
  return 1;
}
