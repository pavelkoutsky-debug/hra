// Kresba drobných efektů při pádu mostu: šplouchnutí na hladině a trosky v místě zlomu.
// Co a kdy se má ukázat, určuje `src/zkouska/efekty.ts` ze záznamu zkoušky.

import { DOBA_SPLOUCHNUTI, DOBA_TROSEK, rozhoz, type Splouchnuti, type Zlom } from "../zkouska/efekty";
import { BARVY } from "./barvy";
import { svetNaObraz, type Kamera, type Rozmer } from "./kamera";

type Kontext = CanvasRenderingContext2D;

/** Tíhové zrychlení pro let kapek a trosek, m/s². */
const TIHA = 9.81;

/**
 * Šplouchnutí v čase děje `cas`: dvě vlnky, které se po hladině rozbíhají do stran, a pár
 * kapek, které vyletí a spadnou zpátky. Čím prudší dopad, tím výš a dál.
 */
export function nakresliSplouchnuti(
  ctx: Kontext,
  kamera: Kamera,
  rozmer: Rozmer,
  hladina: number,
  seznam: readonly Splouchnuti[],
  cas: number,
): void {
  const m = kamera.meritko;
  ctx.save();
  ctx.strokeStyle = BARVY.voda;
  ctx.fillStyle = BARVY.voda;
  ctx.lineCap = "round";
  seznam.forEach((d, poradi) => {
    const t = cas - d.cas;
    if (t < 0 || t > DOBA_SPLOUCHNUTI) return;
    const zbyva = 1 - t / DOBA_SPLOUCHNUTI;
    const sila = Math.min(1, d.sila / 9);
    const stred = svetNaObraz(kamera, rozmer, { x: d.x, y: hladina });
    // Vlnky: ploché oblouky, které se rozšiřují a slábnou.
    ctx.lineWidth = 1.5;
    for (const zpozdeni of [0, 0.18]) {
      const tv = t - zpozdeni;
      if (tv <= 0) continue;
      const polomer = (0.35 + 2.4 * tv * (0.5 + 0.5 * sila)) * m;
      ctx.globalAlpha = 0.85 * zbyva;
      ctx.beginPath();
      ctx.ellipse(stred.x, stred.y, polomer, Math.max(1.5, 0.12 * polomer), 0, Math.PI, 2 * Math.PI);
      ctx.stroke();
    }
    // Kapky: vyletí šikmo vzhůru a po balistické křivce spadnou.
    const kapek = 5 + Math.round(4 * sila);
    for (let k = 0; k < kapek; k++) {
      const vx = (rozhoz(poradi * 16 + k, 0) - 0.5) * 2 * (1.2 + 1.8 * sila);
      const vy = (0.5 + 0.5 * rozhoz(poradi * 16 + k, 1)) * (2.2 + 3.2 * sila);
      const y = vy * t - 0.5 * TIHA * t * t;
      if (y < 0) continue;
      ctx.globalAlpha = 0.9 * zbyva;
      ctx.beginPath();
      ctx.arc(stred.x + vx * t * m, stred.y - y * m, Math.max(1.2, 0.045 * m), 0, 2 * Math.PI);
      ctx.fill();
    }
  });
  ctx.restore();
}

/**
 * Trosky v místě zlomu v čase děje `cas`: pár úlomků, které se rozletí a padají, a krátký
 * záblesk přesně v okamžiku zlomu. Úlomky jsou čárky v barvě varování, ať je zlom na první
 * pohled vidět i ve zmenšeném výkresu.
 */
export function nakresliTrosky(ctx: Kontext, kamera: Kamera, rozmer: Rozmer, seznam: readonly Zlom[], cas: number): void {
  const m = kamera.meritko;
  ctx.save();
  ctx.strokeStyle = BARVY.varovani;
  ctx.lineCap = "round";
  seznam.forEach((z, poradi) => {
    const t = cas - z.cas;
    if (t < 0 || t > DOBA_TROSEK) return;
    const zbyva = 1 - t / DOBA_TROSEK;
    const stred = svetNaObraz(kamera, rozmer, { x: z.x, y: z.y });
    // Záblesk: kroužek, který se během desetiny sekundy rozšíří a zmizí.
    if (t < 0.12) {
      ctx.globalAlpha = 1 - t / 0.12;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(stred.x, stred.y, (0.25 + 5 * t) * m, 0, 2 * Math.PI);
      ctx.stroke();
    }
    const ulomku = 7;
    ctx.lineWidth = Math.max(1.2, 0.05 * m);
    for (let k = 0; k < ulomku; k++) {
      const uhel = 2 * Math.PI * rozhoz(poradi * 8 + k, 0);
      const rychlost = 1.5 + 3.5 * rozhoz(poradi * 8 + k, 1);
      const x = Math.cos(uhel) * rychlost * t;
      const y = Math.sin(uhel) * rychlost * t + 1.2 * t - 0.5 * TIHA * t * t;
      // Úlomek se za letu otáčí.
      const natoceni = uhel + (4 + 8 * rozhoz(poradi * 8 + k, 2)) * t;
      const delka = (0.12 + 0.16 * rozhoz(poradi * 8 + k, 3)) * m;
      ctx.globalAlpha = 0.95 * zbyva;
      ctx.beginPath();
      ctx.moveTo(stred.x + x * m - Math.cos(natoceni) * delka, stred.y - y * m - Math.sin(natoceni) * delka);
      ctx.lineTo(stred.x + x * m + Math.cos(natoceni) * delka, stred.y - y * m + Math.sin(natoceni) * delka);
      ctx.stroke();
    }
  });
  ctx.restore();
}
