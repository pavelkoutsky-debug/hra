// Zpomalený záběr na první porušení: ztmavení okolí, značka místa a popisek.
// Průběh záběru v čase počítá `src/hra/rezie.ts`; tady se jen kreslí.
// Stejným popiskem se při stavbě značí místo, kde by se most bez klidové polohy složil.

import type { Bod } from "../data/geometrie";
import { BARVY, PISMO } from "./barvy";
import { svetNaObraz, type Kamera, type Rozmer } from "./kamera";

type Kontext = CanvasRenderingContext2D;

export interface KresbaZaberu {
  /** Místo porušení ve světě, m. */
  misto: Bod;
  /** Jak velký kus mostu záběr ukazuje, m. */
  rozsah: number;
  /** Míra záběru od 0 do 1: s ní okolí tmavne a značka sílí. */
  mira: number;
  /** Co se stalo, jedním řádkem. */
  popis: string;
  /** Drobný řádek pod popiskem: jak záběr přeskočit. */
  rada: string;
  /** Kolik pixelů od horního okraje plátna zabírá hlášení nad výkresem: popisek se mu vyhne. */
  vrch?: number;
}

/**
 * Nakreslí záběr přes hotový výkres. Okolí místa ztmavne, kolem místa je kroužek se čtyřmi
 * ryskami (jako zaměřovací značka na výkresu) a od něj vede odkazová čára k popisku.
 */
export function nakresliZaber(ctx: Kontext, kamera: Kamera, rozmer: Rozmer, z: KresbaZaberu): void {
  const mira = z.mira <= 0 ? 0 : z.mira >= 1 ? 1 : z.mira;
  if (mira === 0) return;
  const stred = svetNaObraz(kamera, rozmer, z.misto);
  const polomer = polomerZaberu(kamera, rozmer, z.rozsah);

  ctx.save();
  // Ztmavení okolí: uprostřed nic, k okrajům plátna tma.
  const vnejsi = Math.sqrt(rozmer.sirka * rozmer.sirka + rozmer.vyska * rozmer.vyska);
  const stin = ctx.createRadialGradient(stred.x, stred.y, polomer * 1.1, stred.x, stred.y, Math.max(polomer * 2.6, 0.45 * vnejsi));
  stin.addColorStop(0, "rgba(4, 20, 46, 0)");
  stin.addColorStop(1, `rgba(4, 20, 46, ${(0.8 * mira).toFixed(3)})`);
  ctx.fillStyle = stin;
  ctx.fillRect(0, 0, rozmer.sirka, rozmer.vyska);

  ctx.globalAlpha = mira;
  ctx.strokeStyle = BARVY.varovani;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(stred.x, stred.y, polomer, 0, 2 * Math.PI);
  ctx.stroke();
  ctx.beginPath();
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    ctx.moveTo(stred.x + dx * (polomer - 7), stred.y + dy * (polomer - 7));
    ctx.lineTo(stred.x + dx * (polomer + 9), stred.y + dy * (polomer + 9));
  }
  ctx.stroke();
  nakresliPopisek(ctx, rozmer, stred, polomer, z.popis, z.rada, z.vrch ?? 0);
  ctx.restore();
}

/** Poloměr zaměřovacího kroužku záběru v pixelech: podle velikosti toho, co ukazuje. */
function polomerZaberu(kamera: Kamera, rozmer: Rozmer, rozsah: number): number {
  const mensi = Math.min(rozmer.sirka, rozmer.vyska);
  return Math.max(34, Math.min(0.3 * mensi, 0.5 * rozsah * kamera.meritko + 18));
}

/** Rozdělí text na řádky nejvýš `sirka` pixelů široké; dělí v mezerách. */
function zalom(ctx: Kontext, text: string, sirka: number): string[] {
  const radky: string[] = [];
  let radek = "";
  for (const slovo of text.split(" ")) {
    const zkouska = radek ? `${radek} ${slovo}` : slovo;
    if (radek && ctx.measureText(zkouska).width > sirka) {
      radky.push(radek);
      radek = slovo;
    } else radek = zkouska;
  }
  if (radek) radky.push(radek);
  return radky;
}

/**
 * Popisek značky: rámeček s tučným textem a drobným řádkem pod ním, spojený odkazovou čárou
 * s kroužkem o poloměru `polomer` kolem `stred`. Bývá nahoře vpravo od značky; u okraje plátna
 * se překlopí na druhou stranu. Text, který by se na plátno nevešel (telefon), se zalomí.
 * Barvu čáry a průhlednost nechává, jak je nastavil volající.
 */
/** Nejširší popisek značky na výkresu (px): delší text se láme. */
const NEJSIRSI_POPISEK = 430;

function nakresliPopisek(ctx: Kontext, rozmer: Rozmer, stred: Bod, polomer: number, popis: string, rada: string, vrch = 0): void {
  // Dlouhá rada se láme do sloupce: řádek přes celou šířku výkresu by zakryl pás mostu pod sebou.
  const nejvic = Math.max(120, Math.min(NEJSIRSI_POPISEK, rozmer.sirka - 36));
  ctx.font = `bold 13px ${PISMO}`;
  const radkyPopisu = zalom(ctx, popis, nejvic);
  const sirkaPopisu = Math.max(...radkyPopisu.map((r) => ctx.measureText(r).width));
  ctx.font = `11px ${PISMO}`;
  const radkyRady = rada ? zalom(ctx, rada, nejvic) : [];
  const sirkaRady = Math.max(0, ...radkyRady.map((r) => ctx.measureText(r).width));
  const sirka = Math.max(sirkaPopisu, sirkaRady) + 20;
  const vyska = 10 + 18 * radkyPopisu.length + 15 * radkyRady.length;
  const vpravo = stred.x + polomer + 26 + sirka <= rozmer.sirka - 8;
  // Nahoře smí být jen tehdy, když se vejde pod hlášení nad výkresem (`vrch`).
  const nahore = stred.y - polomer - 14 - vyska >= 8 + vrch;
  const kotvaX = stred.x + (vpravo ? 0.707 : -0.707) * polomer;
  const kotvaY = stred.y + (nahore ? -0.707 : 0.707) * polomer;
  const rohX = vpravo ? kotvaX + 22 : kotvaX - 22;
  const rohY = nahore ? kotvaY - 18 : kotvaY + 18;
  const x = Math.max(8, Math.min(rozmer.sirka - 8 - sirka, vpravo ? rohX : rohX - sirka));
  const y = Math.max(8 + vrch, Math.min(rozmer.vyska - 8 - vyska, nahore ? rohY - vyska : rohY));
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(kotvaX, kotvaY);
  ctx.lineTo(rohX, rohY);
  ctx.stroke();
  ctx.fillStyle = "rgba(11, 47, 92, 0.94)";
  ctx.fillRect(x, y, sirka, vyska);
  ctx.strokeRect(x + 0.5, y + 0.5, sirka - 1, vyska - 1);
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillStyle = BARVY.varovani;
  ctx.font = `bold 13px ${PISMO}`;
  radkyPopisu.forEach((r, i) => ctx.fillText(r, x + 10, y + 14 + 18 * i));
  ctx.fillStyle = BARVY.popisek;
  ctx.font = `11px ${PISMO}`;
  radkyRady.forEach((r, i) => ctx.fillText(r, x + 10, y + 14 + 18 * radkyPopisu.length + 15 * i));
}

/**
 * Značka při stavbě: tady by se most složil. Čárkovaný kroužek kolem styčníku a popisek
 * s důvodem; nic neztmavuje, hráč pod ní dál staví.
 */
export function nakresliSlozeni(ctx: Kontext, kamera: Kamera, rozmer: Rozmer, misto: Bod, popis: string, rada: string): void {
  const stred = svetNaObraz(kamera, rozmer, misto);
  const polomer = 22;
  ctx.save();
  ctx.strokeStyle = BARVY.varovani;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.arc(stred.x, stred.y, polomer, 0, 2 * Math.PI);
  ctx.stroke();
  nakresliPopisek(ctx, rozmer, stred, polomer, popis, rada);
  ctx.restore();
}

/**
 * Místo, o kterém mluví pruh výsledku (podpora, ze které most sjel, místo, kde ležel na zemi,
 * styčník, který nic nedrží): čárkovaný kroužek bez popisku, popisek je věta v pruhu.
 */
export function nakresliOznaceneMisto(ctx: Kontext, kamera: Kamera, rozmer: Rozmer, misto: Bod): void {
  const stred = svetNaObraz(kamera, rozmer, misto);
  ctx.save();
  ctx.strokeStyle = BARVY.varovani;
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.arc(stred.x, stred.y, 22, 0, 2 * Math.PI);
  ctx.stroke();
  ctx.restore();
}
