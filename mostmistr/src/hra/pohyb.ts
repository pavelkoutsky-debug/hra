// Pohyblivý most na výkresu přehrávané zkoušky: co je potřeba vědět z návrhu a z událostí,
// aby šly nakreslit písty, zámky a lodě. Sdílí to obrazovka úrovně a ukázka v zadání.

import { KATALOG, zdvihPistu } from "../data/katalog";
import type { NavrhMostu } from "../data/navrh";
import { BARVY } from "../vykres/barvy";
import { svetNaObraz, type Kamera, type Rozmer } from "../vykres/kamera";
import { delkaValce, nakresliZamek } from "../vykres/pohyb";
import type { Udalost } from "../zkouska/protokol";
import type { Snimek } from "../zkouska/zaznam";

/** Délka válce pístu v metrech pro kreslení záznamu; undefined u prutu, který píst není. */
export function valecPrutu(navrh: NavrhMostu, poradi: number): number | undefined {
  const prut = navrh.pruty[poradi];
  if (!prut || KATALOG[prut.prvek].druh !== "pist") return undefined;
  const a = navrh.stycniky.find((s) => s.id === prut.a);
  const b = navrh.stycniky.find((s) => s.id === prut.b);
  if (!a || !b) return undefined;
  const delka = Math.hypot(b.x - a.x, b.y - a.y);
  return delkaValce(delka, zdvihPistu(prut.zdvih, delka));
}

/** Stav pohyblivého mostu v čase `cas`: jsou zámky odemčené a které lodě už narazily. */
export function stavPohybu(udalosti: readonly Udalost[], cas: number): { odemceno: boolean; narazene: Set<number> } {
  const narazene = new Set<number>();
  let odemceno = false;
  for (const u of udalosti) {
    if (u.cas > cas) continue;
    if (u.druh === "lod" && u.stav === "narazila") narazene.add(u.lod);
    else if (u.druh === "pohyb" && u.faze === "odemceno") odemceno = true;
    else if (u.druh === "pohyb" && u.faze === "zamceno") odemceno = false;
  }
  return { odemceno, narazene };
}

/** Zámky mostu ve snímku záznamu: zamčený kosočtverec, po odemknutí rozevřený, tam, kde styčník právě je. */
export function nakresliZamkyZaznamu(
  ctx: CanvasRenderingContext2D,
  kamera: Kamera,
  rozmer: Rozmer,
  navrh: NavrhMostu,
  snimek: Snimek,
  odemceno: boolean,
): void {
  navrh.stycniky.forEach((st, i) => {
    if (!st.zamek || 2 * i + 1 >= snimek.polohy.length) return;
    const misto = svetNaObraz(kamera, rozmer, { x: snimek.polohy[2 * i]!, y: snimek.polohy[2 * i + 1]! });
    nakresliZamek(ctx, misto, kamera.meritko, BARVY.caraSilna, odemceno);
  });
}
