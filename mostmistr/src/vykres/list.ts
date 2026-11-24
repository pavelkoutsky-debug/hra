// Závěrečný list kampaně jako obrázek: záhlaví se souhrnem a pod ním mosty hráče po
// kapitolách. Kreslí stejnými funkcemi jako výkres a náhledy v přehledu, do plátna pevné šířky.

import type { NavrhMostu } from "../data/navrh";
import type { Uroven } from "../data/uroven";
import { BARVY, PISMO, cara } from "./barvy";
import { celyVyrez } from "./kamera";
import { nakresliNavrh } from "./navrh";
import { nakresliVykres } from "./vykres";

/** Šířka obrázku listu a kolik úrovní je v řadě (kapitola má čtyři až pět úrovní: jedna řada). */
export const SIRKA_LISTU = 1600;
const SLOUPCU = 5;
const OKRAJ = 40;
const MEZERA = 16;
const VYSKA_ZAHLAVI = 210;
const VYSKA_NADPISU_KAPITOLY = 44;
const VYSKA_POPISKU = 46;
const SIRKA_DLAZDICE = (SIRKA_LISTU - 2 * OKRAJ - (SLOUPCU - 1) * MEZERA) / SLOUPCU;
/** Náhled má stejný poměr stran jako karta v přehledu. */
const VYSKA_NAHLEDU = Math.round((SIRKA_DLAZDICE * 170) / 280);

/** Jedna úroveň v obrázku listu. */
export interface DlazdiceListu {
  uroven: Uroven;
  most: NavrhMostu | null;
  /** Řádek pod náhledem: „1-03 · První auto“. */
  nazev: string;
  /** Druhý řádek: medaile a cena, nebo poznámka, že most chybí. */
  popis: string;
}

/** Co má obrázek listu nakreslit. */
export interface ObsahListu {
  hra: string;
  nadpis: string;
  veta: string;
  /** Čísla v záhlaví: popisek a hodnota. */
  cisla: readonly { popisek: string; hodnota: string }[];
  kapitoly: readonly { nadpis: string; dlazdice: readonly DlazdiceListu[] }[];
  adresa: string;
}

function radDlazdic(pocet: number): number {
  return Math.max(1, Math.ceil(pocet / SLOUPCU));
}

/** Výška obrázku listu v pixelech pro daný obsah. */
export function vyskaListu(obsah: ObsahListu): number {
  let vyska = VYSKA_ZAHLAVI;
  for (const kapitola of obsah.kapitoly) {
    vyska += VYSKA_NADPISU_KAPITOLY + radDlazdic(kapitola.dlazdice.length) * (VYSKA_NAHLEDU + VYSKA_POPISKU + MEZERA);
  }
  return vyska + OKRAJ;
}

/** Nakreslí náhled úrovně s mostem do obdélníku `sirka` × `vyska` s levým horním rohem v počátku kontextu. */
export function nakresliNahledMostu(ctx: CanvasRenderingContext2D, uroven: Uroven, most: NavrhMostu | null, sirka: number, vyska: number): void {
  const rozmer = { sirka, vyska };
  const kamera = celyVyrez(uroven.vyrez, rozmer, 4);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, sirka, vyska);
  ctx.clip();
  nakresliVykres(ctx, { uroven, kamera, rozmer, kurzor: null, nahled: true });
  if (most) {
    nakresliNavrh(ctx, kamera, rozmer, {
      navrh: most,
      vybranePruty: new Set(),
      vybraneStycniky: new Set(),
      tah: null,
      zacatek: null,
      problemy: [],
      obalka: null,
    });
  }
  ctx.restore();
}

function zkrat(ctx: CanvasRenderingContext2D, text: string, sirka: number): string {
  if (ctx.measureText(text).width <= sirka) return text;
  let kratsi = text;
  while (kratsi.length > 1 && ctx.measureText(`${kratsi}…`).width > sirka) kratsi = kratsi.slice(0, -1);
  return `${kratsi}…`;
}

/** Nakreslí celý list do plátna `SIRKA_LISTU` × `vyskaListu(obsah)` (kontext v pixelech plátna). */
export function nakresliList(ctx: CanvasRenderingContext2D, obsah: ObsahListu): void {
  const vyska = vyskaListu(obsah);
  ctx.fillStyle = BARVY.pozadi;
  ctx.fillRect(0, 0, SIRKA_LISTU, vyska);
  ctx.strokeStyle = BARVY.cara;
  ctx.lineWidth = 2;
  ctx.strokeRect(12, 12, SIRKA_LISTU - 24, vyska - 24);

  // Záhlaví: název hry, nadpis listu, věta a řada čísel.
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.fillStyle = BARVY.popisek;
  ctx.font = `15px ${PISMO}`;
  ctx.fillText(obsah.hra.toUpperCase(), OKRAJ, 54);
  ctx.textAlign = "right";
  ctx.fillText(obsah.adresa, SIRKA_LISTU - OKRAJ, 54);
  ctx.textAlign = "left";
  ctx.fillStyle = BARVY.caraSilna;
  ctx.font = `40px ${PISMO}`;
  ctx.fillText(zkrat(ctx, obsah.nadpis, SIRKA_LISTU - 2 * OKRAJ), OKRAJ, 104);
  ctx.fillStyle = BARVY.cara;
  ctx.font = `17px ${PISMO}`;
  ctx.fillText(zkrat(ctx, obsah.veta, SIRKA_LISTU - 2 * OKRAJ), OKRAJ, 136);
  const sirkaCisla = (SIRKA_LISTU - 2 * OKRAJ) / Math.max(1, obsah.cisla.length);
  obsah.cisla.forEach((udaj, i) => {
    const x = OKRAJ + i * sirkaCisla;
    ctx.fillStyle = BARVY.popisek;
    ctx.font = `12px ${PISMO}`;
    ctx.fillText(zkrat(ctx, udaj.popisek.toUpperCase(), sirkaCisla - 12), x, 168);
    ctx.fillStyle = BARVY.caraSilna;
    ctx.font = `22px ${PISMO}`;
    ctx.fillText(zkrat(ctx, udaj.hodnota, sirkaCisla - 12), x, 194);
  });

  let y = VYSKA_ZAHLAVI;
  for (const kapitola of obsah.kapitoly) {
    ctx.strokeStyle = cara(0.4);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(OKRAJ, y + 8.5);
    ctx.lineTo(SIRKA_LISTU - OKRAJ, y + 8.5);
    ctx.stroke();
    ctx.fillStyle = BARVY.cara;
    ctx.font = `17px ${PISMO}`;
    ctx.fillText(zkrat(ctx, kapitola.nadpis, SIRKA_LISTU - 2 * OKRAJ), OKRAJ, y + 34);
    y += VYSKA_NADPISU_KAPITOLY;
    kapitola.dlazdice.forEach((dlazdice, i) => {
      const x = OKRAJ + (i % SLOUPCU) * (SIRKA_DLAZDICE + MEZERA);
      const vrch = y + Math.floor(i / SLOUPCU) * (VYSKA_NAHLEDU + VYSKA_POPISKU + MEZERA);
      ctx.save();
      ctx.translate(x, vrch);
      nakresliNahledMostu(ctx, dlazdice.uroven, dlazdice.most, SIRKA_DLAZDICE, VYSKA_NAHLEDU);
      ctx.restore();
      ctx.strokeStyle = BARVY.cara;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, vrch + 0.5, SIRKA_DLAZDICE - 1, VYSKA_NAHLEDU - 1);
      ctx.fillStyle = BARVY.caraSilna;
      ctx.font = `14px ${PISMO}`;
      ctx.fillText(zkrat(ctx, dlazdice.nazev, SIRKA_DLAZDICE), x, vrch + VYSKA_NAHLEDU + 19);
      ctx.fillStyle = dlazdice.most ? BARVY.cara : BARVY.popisek;
      ctx.font = `13px ${PISMO}`;
      ctx.fillText(zkrat(ctx, dlazdice.popis, SIRKA_DLAZDICE), x, vrch + VYSKA_NAHLEDU + 38);
    });
    y += radDlazdic(kapitola.dlazdice.length) * (VYSKA_NAHLEDU + VYSKA_POPISKU + MEZERA);
  }
}
