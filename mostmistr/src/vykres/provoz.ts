// Kreslení účastníků provozu jako čárových bokorysů: auta, dodávka, autobus, nákladní vozy,
// lokomotiva a železniční vozy, cyklista a chodec.
// Polohy bere ze snímku záznamu (styčníky kol a karoserie), krok chodce z času děje.

import type { Bod } from "../data/geometrie";
import { CEKA, type PopisUcastnika } from "../zkouska/provoz";
import { KADENCE_BEHU } from "../zkouska/vozidla";
import type { Snimek } from "../zkouska/zaznam";
import { BARVY } from "./barvy";
import { svetNaObraz, type Kamera, type Rozmer } from "./kamera";

type Kontext = CanvasRenderingContext2D;

/** Za jak dlouho se člověk, který spadl z mostu, převrátí naležato, v sekundách děje. */
const DOBA_PREVRACENI = 0.7;

/** Nakreslí všechny účastníky, kteří právě jedou nebo leží spadlí. */
export function nakresliProvoz(
  ctx: Kontext,
  kamera: Kamera,
  rozmer: Rozmer,
  ucastnici: readonly PopisUcastnika[],
  snimek: Snimek,
  /** Čas pádu každého účastníka (undefined, kdo nespadl): kdo padá, převrací se. */
  pady: readonly (number | undefined)[] = [],
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
    // Kdo most přejel, jede dál po předmostí a je vidět, dokud nevyjede z obrazu: vlak se tak
    // za mostem nerozpadá na vozy, které po jednom mizí.
    if (stav === undefined || stav === CEKA) return;
    const kola = u.kola.map(bod);
    if (kola.some((k) => k === null)) return;
    const naObraz = (b: Bod): Bod => svetNaObraz(kamera, rozmer, b);
    ctx.lineWidth = Math.max(1.4, Math.min(2.2, 0.05 * m));
    if (u.druh === "auto") {
      const karoserie = u.karoserie.map(bod);
      if (karoserie.some((k) => k === null)) return;
      nakresliAuto(ctx, kola.map((k) => naObraz(k!)), karoserie.map((k) => naObraz(k!)), u.vyska * m, u.smer);
    } else if (
      u.druh === "dodavka" ||
      u.druh === "autobus" ||
      u.druh === "nakladni" ||
      u.druh === "souprava" ||
      u.druh === "nadmerny"
    ) {
      const karoserie = u.karoserie.map(bod);
      if (karoserie.some((k) => k === null)) return;
      nakresliVuz(ctx, u.druh, kola.map((k) => naObraz(k!)), karoserie.map((k) => naObraz(k!)), m, u.vyska * m);
    } else if (u.druh === "lokomotiva" || u.druh === "vuz-nakladni" || u.druh === "vuz-prazdny" || u.druh === "vuz-osobni") {
      const karoserie = u.karoserie.map(bod);
      if (karoserie.some((k) => k === null)) return;
      nakresliKolejoveVozidlo(ctx, u.druh, kola.map((k) => naObraz(k!)), karoserie.map((k) => naObraz(k!)), m, u.vyska * m);
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
        // Kdo spadl, nezůstane stát vzpřímeně na dně: během pádu se převrátí a zůstane ležet.
        const pad = pady[poradi];
        const preklopeni = pad === undefined ? 0 : Math.min(1, Math.max(0, (snimek.cas - pad) / DOBA_PREVRACENI));
        if (preklopeni > 0) {
          ctx.save();
          ctx.translate(misto.x, misto.y);
          ctx.rotate(u.smer * preklopeni * 0.47 * Math.PI);
          ctx.translate(-misto.x, -misto.y);
        }
        if (vyskok >= 0) nakresliSkokana(ctx, misto, u.vyska * m, u.smer, vyskok);
        else postava(ctx, misto, u.vyska * m, u.smer, preklopeni > 0 ? 0 : faze);
        if (preklopeni > 0) ctx.restore();
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

/**
 * Soustava souřadnic karoserie: počátek v `pocatek`, osa míří od bodu `zadni` k bodu `predni`
 * a kolmice nahoru. Vrací funkci, která metry podél osy a nad ní převede na body obrazu.
 */
function ramVozu(pocatek: Bod, predni: Bod, zadni: Bod, m: number): (podel: number, vys: number) => [number, number] {
  const dx = predni.x - zadni.x;
  const dy = predni.y - zadni.y;
  const delka = Math.hypot(dx, dy) || 1;
  const ex = dx / delka;
  const ey = dy / delka;
  // Kolmice nahoru (na obrazovce míří y dolů), ať vůz jede kterýmkoli směrem.
  let nx = ey;
  let ny = -ex;
  if (ny > 0) {
    nx = -nx;
    ny = -ny;
  }
  return (podel, vys) => [pocatek.x + (ex * podel + nx * vys) * m, pocatek.y + (ey * podel + ny * vys) * m];
}

type Bod2 = [number, number];

function obrys(ctx: Kontext, body: readonly Bod2[]): void {
  ctx.beginPath();
  body.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function cary(ctx: Kontext, usecky: readonly (readonly [Bod2, Bod2])[]): void {
  ctx.beginPath();
  for (const [a, b] of usecky) {
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
  }
  ctx.stroke();
}

/** Kabina nákladního vozu a tahače: čelo `celo` metrů před přední nápravou, zadní stěna `zad` za ní. */
function nakresliKabinu(ctx: Kontext, p: (podel: number, vys: number) => Bod2, celo: number, zad: number): void {
  obrys(ctx, [p(celo, 0.05), p(celo, 1.2), p(celo - 0.15, 1.95), p(zad, 1.95), p(zad, 0.05)]);
  obrys(ctx, [p(celo - 0.1, 1.15), p(celo - 0.22, 1.8), p(zad + 0.75, 1.8), p(zad + 0.75, 1.15)]);
}

/**
 * Užitkové vozidlo. Rozměry jsou v metrech vůči přední nápravě (dopředu kladně) a vůči
 * spojnici styčníků karoserie; ty odpovídají modelům ve `vozidla.ts`. Vůz se kreslí
 * v soustavě svých styčníků, takže se s nimi naklání, a návěs má svou vlastní, spojenou
 * s tahačem na točně.
 */
function nakresliVuz(
  ctx: Kontext,
  druh: "dodavka" | "autobus" | "nakladni" | "souprava" | "nadmerny",
  kola: Bod[],
  karoserie: Bod[],
  m: number,
  r: number,
): void {
  const predni = karoserie[0]!;
  const p = ramVozu(predni, predni, karoserie[1]!, m);
  if (druh === "dodavka") {
    obrys(ctx, [p(-5, -0.44), p(-5, 1.66), p(-0.1, 1.66), p(0.55, 0.5), p(0.95, 0.3), p(1, -0.44)]);
    obrys(ctx, [p(-0.15, 1.5), p(0.42, 0.55), p(-0.85, 0.55), p(-0.85, 1.5)]);
    cary(ctx, [[p(-1, -0.44), p(-1, 1.66)]]);
  } else if (druh === "autobus") {
    obrys(ctx, [p(-9.3, -0.7), p(-9.3, 1.9), p(-9.1, 2), p(2.45, 2), p(2.7, 1.2), p(2.7, -0.7)]);
    // Pás oken s příčkami a čelní sklo.
    const usecky: [Bod2, Bod2][] = [
      [p(-9, 1.55), p(2.38, 1.55)],
      [p(-9, 0.4), p(2.6, 0.4)],
      [p(2.38, 1.55), p(2.6, 0.4)],
    ];
    for (let x = -9; x < 2.3; x += 1.42) usecky.push([p(x, 0.4), p(x, 1.55)]);
    cary(ctx, usecky);
  } else if (druh === "nakladni") {
    obrys(ctx, [p(-7.8, -0.25), p(-7.8, 0.05), p(1.4, 0.05), p(1.4, -0.25)]);
    nakresliKabinu(ctx, p, 1.4, -0.6);
    obrys(ctx, [p(-7.75, 0.15), p(-7.75, 2.25), p(-0.85, 2.25), p(-0.85, 0.15)]);
    cary(ctx, [-6.03, -4.3, -2.58].map((x): [Bod2, Bod2] => [p(x, 0.15), p(x, 2.25)]));
  } else if (druh === "nadmerny") {
    // Těžký tahač, za ním podvalník: nízká plošina na osmi řadách kol a na ní náklad (transformátor).
    obrys(ctx, [p(-5.4, -0.25), p(-5.4, 0.05), p(1.4, 0.05), p(1.4, -0.25)]);
    nakresliKabinu(ctx, p, 1.4, -0.9);
    const prvni = karoserie[3];
    const posledni = karoserie[karoserie.length - 1];
    if (prvni && posledni && karoserie.length > 4) {
      const n = ramVozu(prvni, prvni, posledni, m);
      const konec = -1.5 * (karoserie.length - 4) - 0.9;
      // Labutí krk od točny tahače dolů na plošinu.
      const [kx, ky] = p(-3.9, 0.35);
      const [lx, ly] = n(1.6, 0.25);
      cary(ctx, [[[kx, ky], [lx, ly]]]);
      obrys(ctx, [n(1.6, -0.05), n(1.6, 0.3), n(konec, 0.3), n(konec, -0.05)]);
      // Náklad: skříň transformátoru s chladiči a průchodkami.
      obrys(ctx, [n(0.3, 0.3), n(0.3, 3.1), n(konec + 1.3, 3.1), n(konec + 1.3, 0.3)]);
      const zebra: [Bod2, Bod2][] = [];
      for (let x = -0.6; x > konec + 2; x -= 1.1) zebra.push([n(x, 0.6), n(x, 2.8)]);
      zebra.push([n(-1.5, 3.1), n(-1.5, 3.8)], [n(-4, 3.1), n(-4, 3.8)], [n(-6.5, 3.1), n(-6.5, 3.8)]);
      cary(ctx, zebra);
    }
  } else {
    // Tahač: rám a kabina. Návěs leží vpředu na točně nad hnací nápravou a vzadu na třech nápravách.
    obrys(ctx, [p(-4.6, -0.25), p(-4.6, 0.05), p(1.4, 0.05), p(1.4, -0.25)]);
    nakresliKabinu(ctx, p, 1.4, -0.9);
    const [tx, ty] = p(-3.2, 0.35);
    const tocna: Bod = { x: tx, y: ty };
    const zadni = karoserie.slice(2);
    if (zadni.length > 0) {
      const stred: Bod = { x: 0, y: 0 };
      for (const k of zadni) {
        stred.x += k.x / zadni.length;
        stred.y += k.y / zadni.length;
      }
      // Střed náprav návěsu zvednutý na výšku točny, aby ložná plocha vedla od točny k němu.
      const [zx, zy] = ramVozu(stred, predni, karoserie[1]!, m)(0, 0.35);
      const n = ramVozu(tocna, tocna, { x: zx, y: zy }, m);
      obrys(ctx, [n(-5, -0.3), n(-5, 0.1), n(-11.6, 0.1), n(-11.6, -0.3)]);
      obrys(ctx, [n(1.9, 0.1), n(1.9, 2.55), n(-11.9, 2.55), n(-11.9, 0.1)]);
      cary(ctx, [-1.55, -5, -8.45].map((x): [Bod2, Bod2] => [n(x, 0.1), n(x, 2.55)]));
    }
  }
  for (const k of kola) kolo(ctx, k, r);
}

/** Výplň skříní kolejových vozidel: barva pozadí, přes kterou prosvítá konstrukce za vozem. */
const PRUSVITNA_SKRIN = "rgba(16, 63, 120, 0.5)";

/**
 * Kolejové vozidlo. Rozměry jsou v metrech vůči prvnímu dvojkolí (dopředu kladně) a vůči
 * spojnici styčníků skříně, která leží 0,9 m nad osami kol; odpovídají modelům ve `vozidla.ts`.
 * Skříň se kreslí v soustavě svých styčníků, takže se s nimi naklání; podvozky drží u kol.
 */
function nakresliKolejoveVozidlo(
  ctx: Kontext,
  druh: "lokomotiva" | "vuz-nakladni" | "vuz-prazdny" | "vuz-osobni",
  kola: Bod[],
  karoserie: Bod[],
  m: number,
  r: number,
): void {
  const predni = karoserie[0]!;
  const p = ramVozu(predni, predni, karoserie[karoserie.length - 1]!, m);
  // Skříně jsou poloprůhledné: vlak je delší než most a jinak by po celou dobu průjezdu
  // zakrýval příhradu, kterou hráč postavil nad kolejí.
  ctx.save();
  ctx.fillStyle = PRUSVITNA_SKRIN;
  // Podvozky: rám mezi dvojkolími, o kus nad osami kol.
  for (let i = 0; i + 1 < kola.length; i += 2) {
    const a = kola[i]!;
    const b = kola[i + 1]!;
    const q = ramVozu(a, a, b, m);
    obrys(ctx, [q(0.55, 0.05), q(0.55, 0.3), q(-Math.hypot(b.x - a.x, b.y - a.y) / m - 0.55, 0.3), q(-Math.hypot(b.x - a.x, b.y - a.y) / m - 0.55, 0.05)]);
  }
  if (druh === "lokomotiva") {
    // Skříň se dvěma kabinami, pod ní rám s nárazníky, na střeše sběrač.
    obrys(ctx, [p(2.6, -0.5), p(2.6, 0.9), p(2.15, 2.25), p(-13.25, 2.25), p(-13.7, 0.9), p(-13.7, -0.5)]);
    obrys(ctx, [p(2.45, 1), p(2.1, 2.05), p(1.15, 2.05), p(1.15, 1)]);
    obrys(ctx, [p(-13.55, 1), p(-13.2, 2.05), p(-12.25, 2.05), p(-12.25, 1)]);
    const zebra: [Bod2, Bod2][] = [
      [p(2.6, -0.2), p(2.85, -0.2)],
      [p(-13.7, -0.2), p(-13.95, -0.2)],
      [p(0.6, 0.4), p(-11.7, 0.4)],
      // Sběrač stažený na střechu: trolej se na výkresu nekreslí a zdvižený by trčel do příhrady.
      [p(-3.5, 2.25), p(-2.3, 2.42)],
      [p(-2.3, 2.42), p(-3.5, 2.58)],
      [p(-4, 2.58), p(-3, 2.58)],
    ];
    for (let x = -0.4; x > -11; x -= 1.3) zebra.push([p(x, 1.1), p(x, 1.9)]);
    cary(ctx, zebra);
  } else if (druh === "vuz-osobni") {
    obrys(ctx, [p(2.2, -0.4), p(2.2, 2.3), p(1.95, 2.6), p(-23.45, 2.6), p(-23.7, 2.3), p(-23.7, -0.4)]);
    // Pás oken s příčkami a dveře na koncích.
    const usecky: [Bod2, Bod2][] = [
      [p(0.4, 1.95), p(-21.9, 1.95)],
      [p(0.4, 1), p(-21.9, 1)],
      [p(2.2, -0.15), p(2.45, -0.15)],
      [p(-23.7, -0.15), p(-23.95, -0.15)],
    ];
    for (let x = 0.4; x > -22; x -= 1.86) usecky.push([p(x, 1), p(x, 1.95)]);
    for (const x of [1.9, 1, -22.5, -23.4]) usecky.push([p(x, -0.3), p(x, 2.1)]);
    cary(ctx, usecky);
  } else {
    // Otevřený nákladní vůz: rám, bočnice se sloupky a u loženého vozu hromada nákladu.
    obrys(ctx, [p(1.35, -0.4), p(1.35, -0.1), p(-12.15, -0.1), p(-12.15, -0.4)]);
    obrys(ctx, [p(1.3, -0.1), p(1.3, 1.8), p(-12.1, 1.8), p(-12.1, -0.1)]);
    const usecky: [Bod2, Bod2][] = [
      [p(1.35, -0.25), p(1.62, -0.25)],
      [p(-12.15, -0.25), p(-12.42, -0.25)],
    ];
    for (let x = -0.4; x > -11.5; x -= 1.7) usecky.push([p(x, -0.1), p(x, 1.8)]);
    cary(ctx, usecky);
    if (druh === "vuz-nakladni") {
      ctx.beginPath();
      const hromada: Bod2[] = [p(1, 1.8), p(-0.4, 2.3), p(-3.8, 2.15), p(-6.6, 2.4), p(-9.6, 2.2), p(-11.8, 1.8)];
      hromada.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
      ctx.stroke();
    }
  }
  ctx.restore();
  for (const k of kola) kolo(ctx, k, r);
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
