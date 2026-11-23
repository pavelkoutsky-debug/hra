// Kreslení konstrukce ze záznamu simulace: pruty obarvené podle využití, pružiny,
// styčníky, závaží, podpory, kola a šipky vnějších sil.

import type { TypKotvy } from "../data/uroven";
import { cislo } from "../ui/formaty";
import {
  CARA_LANO,
  CARA_MOSTOVKA,
  CARA_PRUZINA,
  CARA_SKRYTA,
  CARA_TLUMIC,
  STYCNIK_BEZNY,
  STYCNIK_ZAVAZI,
  type Snimek,
  type Topologie,
} from "../zkouska/zaznam";
import { BARVY, PISMO } from "./barvy";
import { nakresliPrazce } from "./kolej";
import { svetNaObraz, type Kamera, type Rozmer } from "./kamera";
import { barvaVyuziti } from "./skala";
import { nakresliZnackuPodpory } from "./vykres";

/** Pod tímto využitím se prut kreslí jako nenamáhaný: bíle a plnou čarou. */
const PRAH_VYUZITI = 0.02;
/** Od tohoto využití prut podkresluje záře v barvě využití; sílí až k mezi únosnosti. */
const PRAH_ZARE = 0.6;

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
      if (t.cara[e] === CARA_LANO || t.cara[e] === CARA_PRUZINA || t.cara[e] === CARA_TLUMIC) continue;
      if ((t.klouby[e]! & 1) === 0) pole[t.prvekA[e]!] = 1;
      if ((t.klouby[e]! & 2) === 0) pole[t.prvekB[e]!] = 1;
    }
    tuheStycniky.set(t, pole);
  }
  return pole;
}

/**
 * Styčníky uvnitř lana: vedou do nich jen díly jednoho a téhož lana (skryté dělení, případně
 * volný konec přetrženého lana). Nekreslí se, lano má vypadat jako lano, ne jako řetěz.
 */
const uvnitrLana = new WeakMap<Topologie, Uint8Array>();

function vLane(t: Topologie): Uint8Array {
  let pole = uvnitrLana.get(t);
  if (!pole) {
    // 0 nic do styčníku nevede, 1 jen díly jednoho lana, 2 cokoli jiného.
    pole = new Uint8Array(t.stycniku);
    const lano = new Int32Array(t.stycniku).fill(-2);
    for (let e = 0; e < t.prvekA.length; e++) {
      if (t.cara[e] === CARA_SKRYTA) continue;
      for (const i of [t.prvekA[e]!, t.prvekB[e]!]) {
        if (t.cara[e] !== CARA_LANO || (lano[i] !== -2 && lano[i] !== t.prut[e])) pole[i] = 2;
        else if (pole[i] !== 2) {
          pole[i] = 1;
          lano[i] = t.prut[e]!;
        }
      }
    }
    uvnitrLana.set(t, pole);
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
  /** Tloušťka čáry prvku v pixelech; bez ní (nebo když vrátí undefined) se použije výchozí. */
  tloustkaPrvku?: (prvek: number) => number | undefined,
  /** Je prvek kolejiště? Kreslí se s pražci. */
  jeKolej?: (prvek: number) => boolean,
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
      if (cara === CARA_SKRYTA || (cara === CARA_MOSTOVKA) !== jenMostovka) continue;
      const a = bod(t.prvekA[e]!);
      const b = bod(t.prvekB[e]!);
      if (cara === CARA_PRUZINA) {
        nakresliPruzinu(ctx, a, b, m);
        continue;
      }
      if (cara === CARA_TLUMIC) {
        nakresliTlumic(ctx, a, b, m, BARVY.cara);
        continue;
      }
      const vyuziti = s.vyuziti[e]!;
      const tloustka =
        tloustkaPrvku?.(e) ??
        (cara === CARA_MOSTOVKA ? mezi(0.22 * m, 4.5, 9) : cara === CARA_LANO ? 1.6 : mezi(0.13 * m, 3, 6));

      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = barvaVyuziti(vyuziti);
      const sila = Math.abs(vyuziti);
      if (sila > PRAH_ZARE) {
        ctx.globalAlpha = 0.5 * Math.min(1, (sila - PRAH_ZARE) / (1 - PRAH_ZARE));
        ctx.lineWidth = tloustka + 10;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      ctx.lineWidth = tloustka;
      ctx.stroke();

      // Tah: středem čáry vede proužek v barvě pozadí, takže vypadá jako dvojitá.
      if (vyuziti > PRAH_VYUZITI && cara !== CARA_LANO) {
        ctx.strokeStyle = BARVY.pozadi;
        ctx.lineWidth = Math.max(1.2, tloustka * 0.3);
        ctx.stroke();
      }
      if (cara === CARA_MOSTOVKA && jeKolej?.(e)) nakresliPrazce(ctx, a, b, m, tloustka);
    }
  }

  // Styčníky: kloub jako prázdné kolečko, tuhý spoj jako malá plná značka.
  const tuhy = tuhe(t);
  const lanove = vLane(t);
  const polomer = mezi(0.11 * m, 2.8, 5);
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = BARVY.caraSilna;
  for (let i = 0; i < t.stycniku; i++) {
    const znacka = t.znacky[i]!;
    if (znacka !== STYCNIK_BEZNY) {
      if (znacka === STYCNIK_ZAVAZI) nakresliZavazi(ctx, bod(i), m);
      continue;
    }
    // Podepřený konec lana (kotva v zemi) se kreslí, i když do něj vede jen lano.
    if (lanove[i] === 1 && (t.podpory[i]! & 3) === 0) continue;
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

  // Plastické klouby: prstenec kolem styčníku, ve kterém se ocel trvale ohnula. Barva jde
  // po škále využití od žluté k červené podle toho, kolik mezního natočení už je pryč.
  for (let k = 0; k + 1 < s.klouby.length; k += 2) {
    const i = s.klouby[k]!;
    if (!(i < t.stycniku) || t.znacky[i] !== STYCNIK_BEZNY) continue;
    const podil = s.klouby[k + 1]!;
    const p = bod(i);
    ctx.beginPath();
    ctx.arc(p.x, p.y, polomer + 4.5, 0, 2 * Math.PI);
    ctx.strokeStyle = barvaVyuziti(0.4 + 0.6 * podil);
    ctx.lineWidth = 2.6;
    ctx.stroke();
  }
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = BARVY.caraSilna;

  for (let i = 0; i < t.stycniku; i++) {
    const typ = typPodpory(t.podpory[i]!);
    if (!typ) continue;
    const p = bod(i);
    if ((t.podpory[i]! & 3) === 1) {
      // Svislé vedení: drží jen vodorovný posun, proto se značka posuvné podpory opře o bok.
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(Math.PI / 2);
      nakresliZnackuPodpory(ctx, { x: 0, y: 0 }, typ, m);
      ctx.restore();
    } else {
      nakresliZnackuPodpory(ctx, p, typ, m);
    }
  }

  // Kola: obrys s ráfkem.
  const r = polomerKola * m;
  ctx.strokeStyle = BARVY.caraSilna;
  ctx.fillStyle = BARVY.pozadi;
  ctx.lineWidth = 1.8;
  for (let i = 0; i + 1 < s.kola.length; i += 2) {
    // Síla, která nemá pod sebou mostovku, polohu nemá.
    if (!Number.isFinite(s.kola[i + 1]!)) continue;
    const p = svetNaObraz(kamera, rozmer, { x: s.kola[i]!, y: s.kola[i + 1]! });
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(p.x, p.y, r * 0.45, 0, 2 * Math.PI);
    ctx.stroke();
  }

  nakresliSily(ctx, kamera, rozmer, s.sily);
  ctx.restore();
}

interface BodObrazu {
  x: number;
  y: number;
}

/** Pružina s tlumičem: pilovitá čára mezi krátkými rovnými konci. */
export function nakresliPruzinu(ctx: CanvasRenderingContext2D, a: BodObrazu, b: BodObrazu, m: number): void {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const delka = Math.hypot(dx, dy);
  if (!(delka > 0)) return;
  const ex = dx / delka;
  const ey = dy / delka;
  const ZUBU = 6;
  const sirka = mezi(0.14 * m, 3.5, 9);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(a.x + 0.2 * dx, a.y + 0.2 * dy);
  for (let i = 0; i < ZUBU; i++) {
    const podil = 0.2 + (0.6 * (i + 0.5)) / ZUBU;
    const strana = i % 2 === 0 ? 1 : -1;
    ctx.lineTo(a.x + podil * dx - strana * sirka * ey, a.y + podil * dy + strana * sirka * ex);
  }
  ctx.lineTo(a.x + 0.8 * dx, a.y + 0.8 * dy);
  ctx.lineTo(b.x, b.y);
  ctx.strokeStyle = BARVY.cara;
  ctx.lineWidth = 1.6;
  ctx.lineJoin = "round";
  ctx.stroke();
}

/**
 * Viskózní tlumič: válec s pístnicí. Válec je u konce `a`, píst s tyčí u konce `b`;
 * při pohybu konců se tyč do válce zasouvá.
 */
export function nakresliTlumic(ctx: CanvasRenderingContext2D, a: BodObrazu, b: BodObrazu, m: number, barva: string): void {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const delka = Math.hypot(dx, dy);
  if (!(delka > 0)) return;
  const ex = dx / delka;
  const ey = dy / delka;
  const pul = mezi(0.13 * m, 3.5, 7);
  // Válec má pevnou délku podle klidové délky prutu; píst je v jeho polovině.
  const zacatek = 0.22 * delka;
  const valec = Math.min(0.42 * delka, 0.7 * delka - zacatek + 0.2 * delka);
  const bod = (podel: number, napric: number): [number, number] => [
    a.x + ex * podel - ey * napric,
    a.y + ey * podel + ex * napric,
  ];
  ctx.save();
  ctx.strokeStyle = barva;
  ctx.fillStyle = BARVY.pozadi;
  ctx.lineWidth = 1.6;
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(...bod(zacatek, 0));
  ctx.stroke();
  // Válec otevřený směrem k pístnici.
  ctx.beginPath();
  ctx.moveTo(...bod(zacatek + valec, -pul));
  ctx.lineTo(...bod(zacatek, -pul));
  ctx.lineTo(...bod(zacatek, pul));
  ctx.lineTo(...bod(zacatek + valec, pul));
  ctx.fill();
  ctx.stroke();
  // Píst a pístnice.
  const pist = zacatek + 0.55 * valec;
  ctx.beginPath();
  ctx.moveTo(...bod(pist, -0.7 * pul));
  ctx.lineTo(...bod(pist, 0.7 * pul));
  ctx.moveTo(...bod(pist, 0));
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.restore();
}

/** Závaží: obdélník s vodorovnou čarou, zavěšený za střed horní hrany. */
export function nakresliZavazi(ctx: CanvasRenderingContext2D, p: BodObrazu, m: number): void {
  const sirka = mezi(0.7 * m, 16, 44);
  const vyska = 0.6 * sirka;
  ctx.fillStyle = BARVY.pozadi;
  ctx.strokeStyle = BARVY.caraSilna;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.rect(p.x - sirka / 2, p.y, sirka, vyska);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(p.x - sirka / 2, p.y + vyska / 2);
  ctx.lineTo(p.x + sirka / 2, p.y + vyska / 2);
  ctx.lineWidth = 1;
  ctx.stroke();
}

/** Nejmenší rozestup popisků sousedních šipek v pixelech; hustší šipky zůstanou bez popisku. */
const ROZESTUP_POPISKU = 74;

/** Šipky vnějších sil: hrot v působišti, u paty velikost síly v kilonewtonech. */
function nakresliSily(ctx: CanvasRenderingContext2D, kamera: Kamera, rozmer: Rozmer, sily: Float32Array): void {
  const delka = mezi(1.3 * kamera.meritko, 30, 64);
  ctx.strokeStyle = BARVY.caraSilna;
  ctx.fillStyle = BARVY.caraSilna;
  ctx.lineWidth = 1.6;
  ctx.font = `11px ${PISMO}`;
  ctx.textAlign = "center";
  let posledniPopisek: BodObrazu | null = null;
  for (let i = 0; i + 3 < sily.length; i += 4) {
    const fx = sily[i + 2]!;
    const fy = sily[i + 3]!;
    const velikost = Math.hypot(fx, fy);
    if (!(velikost > 0)) continue;
    const hrot = svetNaObraz(kamera, rozmer, { x: sily[i]!, y: sily[i + 1]! });
    // Osa y obrazu míří dolů, osa y světa nahoru.
    const sx = fx / velikost;
    const sy = -fy / velikost;
    const pata = { x: hrot.x - delka * sx, y: hrot.y - delka * sy };
    // Hrot šipky je kousek před působištěm, aby nepřekrýval značku styčníku.
    const spicka = { x: hrot.x - 7 * sx, y: hrot.y - 7 * sy };
    ctx.beginPath();
    ctx.moveTo(pata.x, pata.y);
    ctx.lineTo(spicka.x - 6 * sx, spicka.y - 6 * sy);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(spicka.x, spicka.y);
    ctx.lineTo(spicka.x - 9 * sx + 4 * sy, spicka.y - 9 * sy - 4 * sx);
    ctx.lineTo(spicka.x - 9 * sx - 4 * sy, spicka.y - 9 * sy + 4 * sx);
    ctx.closePath();
    ctx.fill();

    if (posledniPopisek && Math.hypot(pata.x - posledniPopisek.x, pata.y - posledniPopisek.y) < ROZESTUP_POPISKU) {
      continue;
    }
    posledniPopisek = pata;
    const kN = velikost / 1000;
    ctx.fillText(`${cislo(kN, kN < 100 ? 1 : 0)} kN`, pata.x - 12 * sx, pata.y - 12 * sy + 4);
  }
  ctx.textAlign = "start";
}
