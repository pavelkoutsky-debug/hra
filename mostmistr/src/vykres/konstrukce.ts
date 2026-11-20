// Kreslení konstrukce ze záznamu simulace: pruty obarvené podle využití, styčníky,
// podpory a kola.

import type { TypKotvy } from "../data/uroven";
import { CARA_LANO, CARA_MOSTOVKA, type Snimek, type Topologie } from "../zkouska/zaznam";
import { BARVY } from "./barvy";
import { svetNaObraz, type Kamera, type Rozmer } from "./kamera";
import { barvaVyuziti } from "./skala";
import { nakresliZnackuPodpory } from "./vykres";

/** Pod tímto využitím se prut kreslí jako nenamáhaný: bíle a plnou čarou. */
const PRAH_VYUZITI = 0.02;

function mezi(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** Styčníky, do kterých vede aspoň jeden tuhý konec prutu; počítá se jednou na stavbu. */
const tuheStycniky = new WeakMap<Topologie, Uint8Array>();

function tuhe(t: Topologie): Uint8Array {
  let pole = tuheStycniky.get(t);
  if (!pole) {
    pole = new Uint8Array(t.stycniku);
    for (let e = 0; e < t.prvekA.length; e++) {
      if (t.cara[e] === CARA_LANO) continue;
      if ((t.klouby[e]! & 1) === 0) pole[t.prvekA[e]!] = 1;
      if ((t.klouby[e]! & 2) === 0) pole[t.prvekB[e]!] = 1;
    }
    tuheStycniky.set(t, pole);
  }
  return pole;
}

function typPodpory(bity: number): TypKotvy | null {
  if ((bity & 3) === 0) return null;
  if ((bity & 4) !== 0) return "vetknuti";
  return (bity & 3) === 3 ? "pevna" : "posuvna";
}

/**
 * Nakreslí konstrukci ve stavu `s`. Tlak je plná čára, tah dvojitá; barva jde od bílé
 * přes žlutou k červené podle využití.
 */
export function nakresliKonstrukci(
  ctx: CanvasRenderingContext2D,
  kamera: Kamera,
  rozmer: Rozmer,
  t: Topologie,
  s: Snimek,
  polomerKola: number,
): void {
  const m = kamera.meritko;
  const bod = (i: number): { x: number; y: number } =>
    svetNaObraz(kamera, rozmer, { x: s.polohy[2 * i]!, y: s.polohy[2 * i + 1]! });

  ctx.save();
  ctx.lineCap = "round";
  ctx.setLineDash([]);

  // Mostovka se kreslí první, aby ji ostatní pruty ve styčnících překryly.
  for (const jenMostovka of [true, false]) {
    for (let e = 0; e < t.prvekA.length; e++) {
      const cara = t.cara[e]!;
      if ((cara === CARA_MOSTOVKA) !== jenMostovka) continue;
      const a = bod(t.prvekA[e]!);
      const b = bod(t.prvekB[e]!);
      const vyuziti = s.vyuziti[e]!;
      const tloustka =
        cara === CARA_MOSTOVKA ? mezi(0.22 * m, 4.5, 9) : cara === CARA_LANO ? 1.6 : mezi(0.13 * m, 3, 6);

      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = barvaVyuziti(vyuziti);
      ctx.lineWidth = tloustka;
      ctx.stroke();

      // Tah: středem čáry vede proužek v barvě pozadí, takže vypadá jako dvojitá.
      if (vyuziti > PRAH_VYUZITI && cara !== CARA_LANO) {
        ctx.strokeStyle = BARVY.pozadi;
        ctx.lineWidth = Math.max(1.2, tloustka * 0.3);
        ctx.stroke();
      }
    }
  }

  // Styčníky: kloub jako prázdné kolečko, tuhý spoj jako malá plná značka.
  const tuhy = tuhe(t);
  const polomer = mezi(0.11 * m, 2.8, 5);
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = BARVY.caraSilna;
  for (let i = 0; i < t.stycniku; i++) {
    const p = bod(i);
    ctx.beginPath();
    if (tuhy[i]) {
      ctx.arc(p.x, p.y, Math.max(1.5, polomer * 0.45), 0, 2 * Math.PI);
      ctx.fillStyle = BARVY.caraSilna;
      ctx.fill();
    } else {
      ctx.arc(p.x, p.y, polomer, 0, 2 * Math.PI);
      ctx.fillStyle = BARVY.pozadi;
      ctx.fill();
      ctx.stroke();
    }
  }

  for (let i = 0; i < t.stycniku; i++) {
    const typ = typPodpory(t.podpory[i]!);
    if (typ) nakresliZnackuPodpory(ctx, bod(i), typ, m);
  }

  // Kola: obrys s ráfkem.
  const r = polomerKola * m;
  ctx.strokeStyle = BARVY.caraSilna;
  ctx.fillStyle = BARVY.pozadi;
  ctx.lineWidth = 1.8;
  for (let i = 0; i + 1 < s.kola.length; i += 2) {
    const p = svetNaObraz(kamera, rozmer, { x: s.kola[i]!, y: s.kola[i + 1]! });
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(p.x, p.y, r * 0.45, 0, 2 * Math.PI);
    ctx.stroke();
  }
  ctx.restore();
}
