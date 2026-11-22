// Kreslení účastníků provozu jako čárových bokorysů: osobní auto, cyklista a chodec.
// Polohy bere ze snímku záznamu (styčníky kol a karoserie), krok chodce z času děje.

import type { Bod } from "../data/geometrie";
import { CEKA, PREJEL, type PopisUcastnika } from "../zkouska/provoz";
import { KADENCE_BEHU } from "../zkouska/vozidla";
import type { Snimek } from "../zkouska/zaznam";
import { BARVY } from "./barvy";
import { svetNaObraz, type Kamera, type Rozmer } from "./kamera";

type Kontext = CanvasRenderingContext2D;

/** Nakreslí všechny účastníky, kteří právě jedou nebo leží spadlí. */
export function nakresliProvoz(
  ctx: Kontext,
  kamera: Kamera,
  rozmer: Rozmer,
  ucastnici: readonly PopisUcastnika[],
  snimek: Snimek,
): void {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.setLineDash([]);
  ctx.strokeStyle = BARVY.caraSilna;
  ctx.fillStyle = BARVY.pozadi;
  const m = kamera.meritko;
  const bod = (i: number): Bod | null => {
    const x = snimek.polohy[2 * i];
    const y = snimek.polohy[2 * i + 1];
    return x === undefined || y === undefined ? null : { x, y };
  };

  ucastnici.forEach((u, poradi) => {
    const stav = snimek.provoz[poradi];
    if (stav === undefined || stav === CEKA || stav === PREJEL) return;
    const kola = u.kola.map(bod);
    if (kola.some((k) => k === null)) return;
    const naObraz = (b: Bod): Bod => svetNaObraz(kamera, rozmer, b);
    ctx.lineWidth = Math.max(1.4, Math.min(2.2, 0.05 * m));
    if (u.druh === "auto") {
      const karoserie = u.karoserie.map(bod);
      if (karoserie.some((k) => k === null)) return;
      nakresliAuto(ctx, kola.map((k) => naObraz(k!)), karoserie.map((k) => naObraz(k!)), u.vyska * m, u.smer);
    } else if (u.druh === "cyklista") {
      nakresliCyklistu(ctx, kola.map((k) => naObraz(k!)), u.vyska * m, u.smer);
    } else {
      let faze = 2 * Math.PI * (u.kadence ?? 1.9) * Math.max(0, snimek.cas - u.start) + uhelFaze(u.faze);
      const bezi =
        u.druh === "bezec" || u.druh === "bezecky-zavod" || (u.druh === "utvar" && (u.kadence ?? 0) >= KADENCE_BEHU);
      let postava = bezi ? nakresliBezce : nakresliChodce;
      // Skákající dav: kdo došel na místo, stojí; při skákání je ve vzduchu v té půlce
      // rytmu, kdy na mostovku netlačí.
      let vyskok = -1;
      const skok = u.skok;
      if (skok && snimek.cas >= skok.prichod && snimek.cas < skok.odchod) {
        faze = 0;
        postava = nakresliChodce;
        if (snimek.cas >= skok.od && snimek.cas < skok.do) {
          vyskok = Math.max(0, -Math.sin(2 * Math.PI * skok.kadence * (snimek.cas - skok.od)));
        }
      }
      // Řada: lidé vedle sebe se v bokorysu kryjí; vzdálenější jsou o kousek vzadu a bledší.
      const lidi = u.lidi ?? 1;
      const teziste = naObraz(kola[0]!);
      for (let i = lidi - 1; i >= 0; i--) {
        ctx.globalAlpha = i === 0 ? 1 : 0.45;
        const misto: Bod = { x: teziste.x - u.smer * 0.24 * i * m, y: teziste.y - 0.05 * i * m };
        if (vyskok >= 0) nakresliSkokana(ctx, misto, u.vyska * m, u.smer, vyskok);
        else postava(ctx, misto, u.vyska * m, u.smer, faze);
      }
      ctx.globalAlpha = 1;
    }
  });
  ctx.restore();
}

function uhelFaze(faze: [number, number] | undefined): number {
  return faze ? Math.atan2(faze[1], faze[0]) : 0;
}

function kolo(ctx: Kontext, stred: Bod, r: number): void {
  ctx.beginPath();
  ctx.arc(stred.x, stred.y, r, 0, 2 * Math.PI);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(stred.x, stred.y, Math.max(1, r * 0.4), 0, 2 * Math.PI);
  ctx.stroke();
}

/**
 * Osobní auto: karoserie nesená dvěma styčníky nad nápravami. Kreslí se v soustavě,
 * jejíž osa vede od zadní nápravy k přední, takže se s karoserií naklání.
 */
function nakresliAuto(ctx: Kontext, kola: Bod[], karoserie: Bod[], r: number, smer: number): void {
  const predni = karoserie[0]!;
  const zadni = karoserie[1]!;
  const dx = predni.x - zadni.x;
  const dy = predni.y - zadni.y;
  const rozvor = Math.hypot(dx, dy) || 1;
  // Jednotkový vektor dopředu a kolmice nahoru (na obrazovce míří y dolů).
  const ex = dx / rozvor;
  const ey = dy / rozvor;
  let nx = ey;
  let ny = -ex;
  if (ny > 0) {
    nx = -nx;
    ny = -ny;
  }
  // Bod karoserie: `podel` od zadní nápravy dopředu, `vys` nad osou styčníků, v násobcích rozvoru.
  const p = (podel: number, vys: number): [number, number] => [
    zadni.x + ex * podel * rozvor + nx * vys * rozvor,
    zadni.y + ey * podel * rozvor + ny * vys * rozvor,
  ];
  const obrys: [number, number][] = [
    p(-0.3, -0.04),
    p(-0.3, 0.2),
    p(-0.08, 0.24),
    p(0.12, 0.42),
    p(0.62, 0.42),
    p(0.86, 0.22),
    p(1.3, 0.17),
    p(1.33, -0.04),
  ];
  ctx.beginPath();
  obrys.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Okna.
  ctx.beginPath();
  for (const [a, b] of [
    [p(0.02, 0.25), p(0.16, 0.37)],
    [p(0.16, 0.37), p(0.58, 0.37)],
    [p(0.58, 0.37), p(0.76, 0.24)],
    [p(0.76, 0.24), p(0.02, 0.25)],
    [p(0.38, 0.37), p(0.38, 0.25)],
  ] as const) {
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
  }
  ctx.stroke();
  for (const k of kola) kolo(ctx, k, r);
  void smer;
}

/** Cyklista: dvě kola, rám a jezdec nakloněný dopředu. */
function nakresliCyklistu(ctx: Kontext, kola: Bod[], r: number, smer: number): void {
  const predni = kola[0]!;
  const zadni = kola[1]!;
  const rozvor = Math.hypot(predni.x - zadni.x, predni.y - zadni.y) || 1;
  const vpred = predni.x >= zadni.x ? 1 : -1;
  const j = rozvor; // měřítko postavy
  const sedlo: Bod = { x: zadni.x + vpred * 0.25 * j, y: zadni.y - 0.62 * j };
  const stred: Bod = { x: zadni.x + vpred * 0.42 * j, y: zadni.y };
  const riditka: Bod = { x: predni.x - vpred * 0.12 * j, y: predni.y - 0.7 * j };
  const hlava: Bod = { x: sedlo.x + vpred * 0.42 * j, y: sedlo.y - 0.62 * j };
  for (const k of kola) kolo(ctx, k, r);
  ctx.beginPath();
  // Rám.
  ctx.moveTo(zadni.x, zadni.y);
  ctx.lineTo(stred.x, stred.y);
  ctx.lineTo(sedlo.x, sedlo.y);
  ctx.lineTo(zadni.x, zadni.y);
  ctx.moveTo(stred.x, stred.y);
  ctx.lineTo(riditka.x, riditka.y);
  ctx.lineTo(predni.x, predni.y);
  ctx.moveTo(sedlo.x, sedlo.y);
  ctx.lineTo(riditka.x, riditka.y);
  // Jezdec: trup, paže, noha.
  ctx.moveTo(sedlo.x, sedlo.y);
  ctx.lineTo(hlava.x - vpred * 0.06 * j, hlava.y + 0.14 * j);
  ctx.lineTo(riditka.x, riditka.y);
  ctx.moveTo(sedlo.x, sedlo.y);
  ctx.lineTo(stred.x + vpred * 0.1 * j, stred.y - 0.25 * j);
  ctx.lineTo(stred.x, stred.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(hlava.x, hlava.y, 0.11 * j, 0, 2 * Math.PI);
  ctx.fill();
  ctx.stroke();
  void smer;
}

/**
 * Chodec: panáček, jehož těžiště je ve styčníku. Nohy a ruce se kývají ve fázi
 * krokové síly, kterou chodec působí na mostovku.
 */
function nakresliChodce(ctx: Kontext, teziste: Bod, vyska: number, smer: number, faze: number): void {
  // Těžiště je metr nad povrchem; postava měří 1,75 m.
  const j = vyska; // pixelů na metr výšky těžiště
  const kyv = Math.sin(faze / 2) * 0.45;
  const kycle: Bod = { x: teziste.x, y: teziste.y };
  const ramena: Bod = { x: teziste.x + smer * 0.03 * j, y: teziste.y - 0.48 * j };
  const hlava: Bod = { x: ramena.x + smer * 0.02 * j, y: ramena.y - 0.2 * j };
  const noha = (uhel: number): Bod => ({ x: kycle.x + Math.sin(uhel) * 0.98 * j * smer, y: kycle.y + Math.cos(uhel) * 0.98 * j });
  const ruka = (uhel: number): Bod => ({ x: ramena.x + Math.sin(uhel) * 0.55 * j * smer, y: ramena.y + Math.cos(uhel) * 0.55 * j });
  ctx.beginPath();
  ctx.moveTo(kycle.x, kycle.y);
  ctx.lineTo(ramena.x, ramena.y);
  for (const konec of [noha(kyv), noha(-kyv)]) {
    ctx.moveTo(kycle.x, kycle.y);
    ctx.lineTo(konec.x, konec.y);
  }
  for (const konec of [ruka(-kyv * 0.8), ruka(kyv * 0.8)]) {
    ctx.moveTo(ramena.x, ramena.y);
    ctx.lineTo(konec.x, konec.y);
  }
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(hlava.x, hlava.y, 0.13 * j, 0, 2 * Math.PI);
  ctx.fill();
  ctx.stroke();
}

/**
 * Skákající člověk: `vyskok` 0 stojí na mostovce v podřepu, 1 je nejvýš ve vzduchu
 * s rukama nad hlavou.
 */
function nakresliSkokana(ctx: Kontext, teziste: Bod, vyska: number, smer: number, vyskok: number): void {
  const j = vyska;
  // Ve vzduchu je o čtvrt metru výš; při doskoku jde těžiště v podřepu trochu dolů.
  const zdvih = (0.28 * vyskok - 0.08 * (1 - vyskok)) * j;
  const kycle: Bod = { x: teziste.x, y: teziste.y - zdvih };
  const ramena: Bod = { x: kycle.x + smer * 0.02 * j, y: kycle.y - 0.48 * j };
  const hlava: Bod = { x: ramena.x + smer * 0.02 * j, y: ramena.y - 0.2 * j };
  const chodidlo = teziste.y + 0.98 * j - 0.28 * vyskok * j;
  const pokrceni = 0.12 * (1 - vyskok) * j;
  ctx.beginPath();
  ctx.moveTo(kycle.x, kycle.y);
  ctx.lineTo(ramena.x, ramena.y);
  for (const strana of [-1, 1]) {
    // Noha: koleno vybočí dopředu, když je skokan v podřepu.
    ctx.moveTo(kycle.x, kycle.y);
    ctx.lineTo(kycle.x + smer * pokrceni + strana * 0.05 * j, (kycle.y + chodidlo) / 2);
    ctx.lineTo(kycle.x + strana * 0.07 * j, chodidlo);
    // Ruka: ve vzduchu nad hlavou, při doskoku podél těla.
    const uhel = (0.25 + 2.5 * vyskok) * strana;
    ctx.moveTo(ramena.x, ramena.y);
    ctx.lineTo(ramena.x + Math.sin(uhel) * 0.5 * j, ramena.y + Math.cos(uhel) * 0.5 * j);
  }
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(hlava.x, hlava.y, 0.13 * j, 0, 2 * Math.PI);
  ctx.fill();
  ctx.stroke();
}

/**
 * Běžec: trup nakloněný dopředu, nohy pokrčené v kolenou a s dlouhým krokem, ruce
 * ohnuté v loktech. Krok odpovídá fázi doskoků.
 */
function nakresliBezce(ctx: Kontext, teziste: Bod, vyska: number, smer: number, faze: number): void {
  const j = vyska;
  const kyv = Math.sin(faze / 2);
  const kycle: Bod = { x: teziste.x, y: teziste.y };
  const ramena: Bod = { x: teziste.x + smer * 0.16 * j, y: teziste.y - 0.46 * j };
  const hlava: Bod = { x: ramena.x + smer * 0.07 * j, y: ramena.y - 0.2 * j };
  // Noha ze dvou dílů: stehno a bérec. Švihová noha má koleno vpředu a patu vzadu.
  const noha = (vpred: number): [Bod, Bod] => {
    const koleno: Bod = { x: kycle.x + smer * (0.1 + 0.36 * vpred) * j, y: kycle.y + (0.5 - 0.1 * Math.abs(vpred)) * j };
    const pata: Bod = {
      x: koleno.x + smer * (-0.12 + 0.2 * vpred - 0.3 * Math.max(0, -vpred)) * j,
      y: koleno.y + (0.48 - 0.3 * Math.max(0, -vpred)) * j,
    };
    return [koleno, pata];
  };
  const ruka = (vpred: number): [Bod, Bod] => {
    const loket: Bod = { x: ramena.x + smer * 0.2 * vpred * j, y: ramena.y + 0.26 * j };
    const zapesti: Bod = { x: loket.x + smer * (0.2 + 0.08 * vpred) * j, y: loket.y - 0.06 * vpred * j - 0.04 * j };
    return [loket, zapesti];
  };
  ctx.beginPath();
  ctx.moveTo(kycle.x, kycle.y);
  ctx.lineTo(ramena.x, ramena.y);
  for (const [koleno, pata] of [noha(kyv), noha(-kyv)]) {
    ctx.moveTo(kycle.x, kycle.y);
    ctx.lineTo(koleno.x, koleno.y);
    ctx.lineTo(pata.x, pata.y);
  }
  for (const [loket, zapesti] of [ruka(-kyv), ruka(kyv)]) {
    ctx.moveTo(ramena.x, ramena.y);
    ctx.lineTo(loket.x, loket.y);
    ctx.lineTo(zapesti.x, zapesti.y);
  }
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(hlava.x, hlava.y, 0.13 * j, 0, 2 * Math.PI);
  ctx.fill();
  ctx.stroke();
}
