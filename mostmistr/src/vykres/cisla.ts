// Čísla využití u prutů: malé popisky v procentech uprostřed prutu, podobně jako kóta
// přerušující čáru na výkresu. Popisky, které by se překryly, se posunou podél prutu; když
// není kam, vynechají se. Přednost mají nejvíc namáhané pruty a u mostu z mnoha prutů se
// popíšou jen ty: využití ostatních je vidět z barvy a po kliknutí na prut.

import type { Bod } from "../data/geometrie";
import { procenta } from "../ui/formaty";
import { BARVY, PISMO } from "./barvy";
import { barvaVyuziti } from "./skala";

/** Prut k popsání: konce v pixelech plátna a využití (znaménko nehraje roli). */
export interface CisloVyuziti {
  a: Bod;
  b: Bod;
  vyuziti: number;
  /**
   * Podle čeho se pruty vybírají a řadí, když se číslo mění v čase (přehrávání zkoušky):
   * největší využití prutu za celou zkoušku. Bez něj rozhoduje `vyuziti`. Výběr pak mezi
   * snímky nepřeskakuje z prutu na prut.
   */
  vaha?: number;
}

/** Pod touto délkou prutu na obrazovce se číslo nekreslí; nevešlo by se. */
const NEJKRATSI_PRUT = 30;
/** Pod tímto využitím se číslo nekreslí: prut prakticky nic nenese. */
const NEJMENSI_VYUZITI = 0.005;
/**
 * Kolik čísel se nanejvýš kreslí: u mostu z desítek prutů by popisky zakryly most. Zůstanou
 * nejvíc namáhané pruty; prut využitý aspoň z `VZDY_OD` má číslo vždycky.
 */
export const NEJVIC_CISEL = 16;
export const VZDY_OD = 0.8;
/** Místa podél prutu, která se zkoušejí postupně, když je střed obsazený. */
const MISTA = [0.5, 0.36, 0.64, 0.26, 0.74];
const VYSKA = 13;

interface Obdelnik {
  x: number;
  y: number;
  sirka: number;
}

function prekryva(a: Obdelnik, b: Obdelnik): boolean {
  return Math.abs(a.x - b.x) * 2 < a.sirka + b.sirka + 4 && Math.abs(a.y - b.y) < VYSKA + 2;
}

/** Nakreslí čísla využití. Kontext musí mít jako jednotku CSS pixel. */
export function nakresliCislaVyuziti(ctx: CanvasRenderingContext2D, polozky: readonly CisloVyuziti[]): void {
  const serazene = polozky
    .map((p) => ({ ...p, vyuziti: Math.abs(p.vyuziti), vaha: Math.abs(p.vaha ?? p.vyuziti) }))
    .filter((p) => Math.hypot(p.b.x - p.a.x, p.b.y - p.a.y) >= NEJKRATSI_PRUT)
    .sort((p, q) => q.vaha - p.vaha)
    .filter((p, poradi) => poradi < NEJVIC_CISEL || p.vyuziti >= VZDY_OD)
    .filter((p) => p.vyuziti >= NEJMENSI_VYUZITI);

  ctx.save();
  ctx.font = `10px ${PISMO}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const obsazeno: Obdelnik[] = [];
  for (const p of serazene) {
    const text = procenta(p.vyuziti).replace("\u00a0", " ");
    const sirka = ctx.measureText(text).width + 8;
    let misto: Obdelnik | null = null;
    for (const podil of MISTA) {
      const kandidat = { x: p.a.x + (p.b.x - p.a.x) * podil, y: p.a.y + (p.b.y - p.a.y) * podil, sirka };
      if (!obsazeno.some((o) => prekryva(o, kandidat))) {
        misto = kandidat;
        break;
      }
    }
    if (!misto) continue;
    obsazeno.push(misto);
    const barva = barvaVyuziti(p.vyuziti);
    ctx.fillStyle = BARVY.pozadi;
    ctx.fillRect(misto.x - sirka / 2, misto.y - VYSKA / 2, sirka, VYSKA);
    ctx.strokeStyle = barva;
    ctx.lineWidth = 1;
    ctx.strokeRect(Math.round(misto.x - sirka / 2) + 0.5, Math.round(misto.y - VYSKA / 2) + 0.5, Math.round(sirka), VYSKA);
    ctx.fillStyle = barva;
    ctx.fillText(text, misto.x, misto.y + 0.5);
  }
  ctx.restore();
}
