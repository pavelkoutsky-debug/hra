// Kreslení návrhu mostu ve stavebním režimu: pruty podle prvku, styčníky, výběr,
// rozdělaný tah myší a po zkoušce obálka namáhání.

import type { Bod } from "../data/geometrie";
import { KATALOG, LADENY_TLUMIC, type IdPrvku } from "../data/katalog";
import type { NavrhMostu, ProblemNavrhu } from "../data/navrh";
import type { Tah } from "../editor/editor";
import { cislo, delka as zapisDelky } from "../ui/formaty";
import { BARVY, PISMO, cara } from "./barvy";
import { svetNaObraz, type Kamera, type Rozmer } from "./kamera";
import { nakresliPruzinu, nakresliTlumic, nakresliZavazi } from "./konstrukce";
import { barvaVyuziti } from "./skala";

export interface StavNavrhu {
  navrh: NavrhMostu;
  vybranePruty: ReadonlySet<number>;
  vybraneStycniky: ReadonlySet<number>;
  tah: Tah | null;
  /** Bod rastru pod kurzorem, ze kterého lze začít kreslit. */
  zacatek: Bod | null;
  /** Problémy návrhu; dotčené pruty a styčníky se zvýrazní varovnou barvou. */
  problemy: readonly ProblemNavrhu[];
  /**
   * Největší využití každého prutu z poslední zkoušky (pořadí jako v návrhu) a to, zda
   * rozhodoval tah; null, když obálka není.
   */
  obalka: readonly { vyuziti: number; tah: boolean }[] | null;
}

/** Šířka popisku laděného tlumiče („1000 kg · 2,50 Hz“) na obrazovce, px. */
const SIRKA_POPISKU_TLUMICE = 110;

function mezi(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** Tloušťka čáry prutu podle prvku, v pixelech při měřítku `m` pixelů na metr. */
export function tloustkaPrutu(prvek: IdPrvku, m: number): number {
  const druh = KATALOG[prvek].druh;
  // Ocelobetonová mostovka je na výkresu silnější než dřevěná, jako ve skutečnosti.
  if (prvek === "mostovka-ocelobeton") return mezi(0.32 * m, 6.5, 12);
  if (druh === "mostovka") return mezi(0.22 * m, 4.5, 9);
  if (druh === "lano") return 1.6;
  if (druh === "pilir") return mezi(0.5 * m, 8, 18);
  // Těžký průřez se od lehkého liší jen tloušťkou; proužek uprostřed čáry je vyhrazený tahu.
  if (prvek === "drevo-tezke" || prvek === "ocel-tezka") return mezi(0.18 * m, 5.5, 8);
  return mezi(0.11 * m, 3.2, 4.5);
}

/** Nakreslí návrh mostu přes podklad úrovně. */
export function nakresliNavrh(ctx: CanvasRenderingContext2D, kamera: Kamera, rozmer: Rozmer, s: StavNavrhu): void {
  const m = kamera.meritko;
  const podleId = new Map(s.navrh.stycniky.map((st) => [st.id, st]));
  const naObraz = (b: Bod): Bod => svetNaObraz(kamera, rozmer, b);
  const spatnePruty = new Set<number>();
  const spatneStycniky = new Set<number>();
  for (const p of s.problemy) {
    if (p.prut !== undefined) spatnePruty.add(p.prut);
    if (p.stycnik !== undefined) spatneStycniky.add(p.stycnik);
  }

  ctx.save();
  ctx.lineCap = "round";
  ctx.setLineDash([]);

  // Mostovka první, aby ji ostatní pruty ve styčnících překryly.
  for (const jenMostovka of [true, false]) {
    s.navrh.pruty.forEach((p, poradi) => {
      if ((KATALOG[p.prvek].druh === "mostovka") !== jenMostovka) return;
      const a = podleId.get(p.a);
      const b = podleId.get(p.b);
      if (!a || !b) return;
      const pa = naObraz(a);
      const pb = naObraz(b);
      const tloustka = tloustkaPrutu(p.prvek, m);
      if (KATALOG[p.prvek].druh === "tlumic") {
        if (s.vybranePruty.has(p.id)) {
          ctx.beginPath();
          ctx.moveTo(pa.x, pa.y);
          ctx.lineTo(pb.x, pb.y);
          ctx.strokeStyle = "rgba(143, 208, 255, 0.55)";
          ctx.lineWidth = 12;
          ctx.stroke();
        }
        nakresliTlumic(ctx, pa, pb, m, spatnePruty.has(p.id) ? BARVY.varovani : BARVY.caraSilna);
        return;
      }
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      if (s.vybranePruty.has(p.id)) {
        // Výběr: světlá záře pod prutem.
        ctx.strokeStyle = "rgba(143, 208, 255, 0.55)";
        ctx.lineWidth = tloustka + 8;
        ctx.stroke();
      }
      const obalka = s.obalka?.[poradi];
      ctx.strokeStyle = spatnePruty.has(p.id)
        ? BARVY.varovani
        : obalka !== undefined
          ? barvaVyuziti(obalka.vyuziti)
          : BARVY.caraSilna;
      ctx.lineWidth = tloustka;
      ctx.stroke();
      // Tah: proužek v barvě pozadí středem čáry, stejně jako při zkoušce.
      if (obalka?.tah && obalka.vyuziti > 0.02 && KATALOG[p.prvek].druh !== "lano") {
        ctx.strokeStyle = BARVY.pozadi;
        ctx.lineWidth = Math.max(1.2, tloustka * 0.3);
        ctx.stroke();
      }
    });
  }

  // Závaží visí pod styčníkem; popisek říká kolik.
  for (const st of s.navrh.stycniky) {
    if (!st.zavazi) continue;
    const p = naObraz(st);
    nakresliZavazi(ctx, p, m);
    const sirka = mezi(0.7 * m, 16, 44);
    ctx.font = `10px ${PISMO}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = spatneStycniky.has(st.id) ? BARVY.varovani : BARVY.cara;
    ctx.fillText(`${st.zavazi} kg`, p.x, p.y + 0.6 * sirka + 9);
  }
  // Laděný tlumič: závaží na pružině pod styčníkem; popisek říká, kolik váží a na kolik hertzů je naladěné.
  // Popisky sousedních tlumičů by se překryly, proto každý druhý z těsné řady stojí o řádek níž.
  const sTlumicem = s.navrh.stycniky.filter((st) => st.tlumic).sort((a, b) => a.x - b.x || b.y - a.y);
  let minuleX = Number.NEGATIVE_INFINITY;
  let nize = false;
  for (const st of sTlumicem) {
    if (!st.tlumic) continue;
    const p = naObraz(st);
    nize = p.x - minuleX < SIRKA_POPISKU_TLUMICE ? !nize : false;
    minuleX = p.x;
    const zavazi = { x: p.x, y: p.y + LADENY_TLUMIC.zaves * m };
    nakresliPruzinu(ctx, p, zavazi, m);
    nakresliZavazi(ctx, zavazi, m);
    const sirka = mezi(0.7 * m, 16, 44);
    ctx.font = `10px ${PISMO}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = spatneStycniky.has(st.id) ? BARVY.varovani : BARVY.cara;
    ctx.fillText(
      `${st.tlumic.hmota} kg · ${cislo(st.tlumic.frekvence, 2)} Hz`,
      zavazi.x,
      zavazi.y + 0.6 * sirka + 9 + (nize ? 13 : 0),
    );
  }
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  // Styčníky: kloub jako prázdné kolečko.
  const polomer = mezi(0.11 * m, 2.8, 5);
  for (const st of s.navrh.stycniky) {
    const p = naObraz(st);
    ctx.beginPath();
    ctx.arc(p.x, p.y, polomer, 0, 2 * Math.PI);
    ctx.fillStyle = s.vybraneStycniky.has(st.id) ? "#8fd0ff" : BARVY.pozadi;
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = spatneStycniky.has(st.id) ? BARVY.varovani : BARVY.caraSilna;
    ctx.stroke();
  }

  // Místo, odkud lze táhnout nový prut.
  if (s.zacatek && !s.tah) {
    const p = naObraz(s.zacatek);
    ctx.beginPath();
    ctx.arc(p.x, p.y, polomer + 5, 0, 2 * Math.PI);
    ctx.strokeStyle = BARVY.caraSilna;
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }

  if (s.tah) nakresliTah(ctx, kamera, rozmer, s.tah, podleId);
  ctx.restore();
}

function nakresliTah(
  ctx: CanvasRenderingContext2D,
  kamera: Kamera,
  rozmer: Rozmer,
  tah: Tah,
  podleId: Map<number, Bod>,
): void {
  const naObraz = (b: Bod): Bod => svetNaObraz(kamera, rozmer, b);
  if (tah.druh === "obdelnik") {
    const a = naObraz(tah.od);
    const b = naObraz(tah.k);
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = cara(0.9);
    ctx.lineWidth = 1;
    ctx.fillStyle = "rgba(143, 208, 255, 0.12)";
    ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
    ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
    ctx.setLineDash([]);
    return;
  }

  const od = tah.druh === "posun" ? (podleId.get(tah.stycnik) ?? tah.od) : tah.od;
  if (tah.k.x === od.x && tah.k.y === od.y) return;
  const a = naObraz(od);
  const b = naObraz(tah.k);
  const barva = tah.duvod ? BARVY.varovani : BARVY.caraSilna;
  ctx.setLineDash([7, 5]);
  ctx.strokeStyle = barva;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(b.x, b.y, 5, 0, 2 * Math.PI);
  ctx.stroke();

  // Délka taženého prutu vedle jeho středu.
  if (tah.druh === "prut") {
    const metry = Math.hypot(tah.k.x - od.x, tah.k.y - od.y);
    const text = zapisDelky(metry);
    ctx.font = `12px ${PISMO}`;
    const sirka = ctx.measureText(text).width + 10;
    const x = (a.x + b.x) / 2 + 12;
    const y = (a.y + b.y) / 2 - 12;
    ctx.fillStyle = "rgba(11, 47, 92, 0.9)";
    ctx.fillRect(x - 5, y - 13, sirka, 18);
    ctx.fillStyle = barva;
    ctx.fillText(text, x, y);
  }
}
