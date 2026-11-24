// Referenční mosty úrovně 8-02 „Lávka na lanech“ (závěrečná kapitola: zavěšená lávka s laděnými
// tlumiči). Lávka 60 m přes údolí (opěry x = 0 pevná a 60 posuvná), pod mostovkou se stavět
// nesmí. Mostovka je ocelobetonová deska, stožáry stojí na opěrách a kotevní lana vedou do kotev
// 16 m za opěrami. Uprostřed lávky je vyhlídka: mezi 28 a 32 m nesmí nic vést výš než 0,9 m nad
// mostovku (zábradlí). Přes lávku jde slavnostní útvar 40 lidí v kroku 2 Hz a proti němu
// procesí 12 lidí v pomalém kroku 1,6 Hz.
//
// Co úroveň kombinuje: zavěšený most ze 4-03 (stožáry, vějíř lan, kotevní lana, napínáky
// z dopnutí) a laděný tlumič z 5-02 až 5-04 (osa frekvencí, ladění na rytmus). Lana mostovku
// unesou levně, ale hlavy stožárů se s kotevními lany houpou a lávka má svislé tvary mezi 1 a
// 3 Hz. Útvar v kroku 2 Hz rozkmitá každou zkoušenou zavěšenou lávku (stožáry 6 až 12 m, pole
// 3 až 6 m, nosná kotevní lana, pylony na pilířích) přes mez 1,0 m/s² (1,1 až 4,7 m/s²) a hra
// radí naladit tlumič na 2,0 Hz; procesí 1,6 Hz chytí měkké lanové soustavy, které útvaru
// utečou (poloviční visutá lávka). Tlumič mostovku neunese. Vyhlídka bere visuté lávce nosné
// lano a příhradě horní pás: obě by bez ní útvaru i procesí utekly.

import type { IdPrvku } from "../../src/data/katalog";
import { Kreslic } from "../../src/data/kreslic";
import type { NavrhMostu } from "../../src/data/navrh";
import type { ReseniUrovne } from "../reseni";

const DESKA: IdPrvku = "mostovka-ocelobeton";
const O: IdPrvku = "ocel-lehka";
const LANO: IdPrvku = "lano";

const L = 60;
/** Styčníky mostovky po šesti metrech. */
const USEKY = [0, 6, 12, 18, 24, 30, 36, 42, 48, 54, 60];
/** Kotvy kotevních lan za levou a pravou opěrou. */
const KOTVA = [-16, 76] as const;

/** Laděný tlumič pod styčníkem mostovky: [x, hmotnost závaží v kg, ladění v Hz]. */
type Tlumic = readonly [number, number, number];

function navrh(stav: (k: Kreslic) => void, predpeti: readonly number[] = []): NavrhMostu {
  const k = new Kreslic("8-02");
  stav(k);
  // Napínáky lan v pořadí, v jakém jsou lana nakreslená, jak je spočítalo dopnutí (`dopniLana`).
  const most = k.navrh();
  let lano = 0;
  return { ...most, pruty: most.pruty.map((p) => (p.prvek === LANO ? { ...p, predpeti: predpeti[lano++] ?? 0 } : p)) };
}

function mostovka(k: Kreslic, xs: readonly number[] = USEKY): void {
  for (let i = 0; i + 1 < xs.length; i++) k.prut(DESKA, [xs[i]!, 0], [xs[i + 1]!, 0]);
}

function tlumice(k: Kreslic, t: readonly Tlumic[]): void {
  for (const [x, hmota, frekvence] of t) k.bod(x, 0, { tlumic: { hmota, frekvence } });
}

/**
 * Zavěšená lávka: ocelové stožáry výšky `vez` na obou opěrách, z hlavy každého vějíř lan do
 * styčníků své poloviny (do středu 30 m z obou), kotevní lano do kotvy za opěrou.
 */
function zavesena(vez: number, t: readonly Tlumic[], predpeti: readonly number[]): NavrhMostu {
  return navrh((k) => {
    mostovka(k);
    for (const [x, kotva] of [[0, KOTVA[0]], [L, KOTVA[1]]] as const) {
      k.prut(O, [x, 0], [x, vez]);
      for (const cil of USEKY.slice(1, -1)) if (x === 0 ? cil <= L / 2 : cil >= L / 2) k.prut(LANO, [x, vez], [cil, 0]);
      k.prut(LANO, [x, vez], [kotva, 0]);
    }
    tlumice(k, t);
  }, predpeti);
}

/**
 * Poloviční visutá lávka: z hlavy stožáru nosné lano přes body nad styčníky 6 až 24 m do
 * styčníku mostovky 28 m (vyhlídku obejde), z bodů svislé závěsy; vpravo zrcadlově.
 */
function pulVisuta(vez: number, predpeti: readonly number[]): NavrhMostu {
  const xs = [0, 6, 12, 18, 24, 28, 32, 36, 42, 48, 54, 60];
  return navrh((k) => {
    mostovka(k, xs);
    for (const s of [0, 1]) {
      const X = (x: number): number => (s === 0 ? x : L - x);
      k.prut(O, [X(0), 0], [X(0), vez]);
      k.prut(LANO, [X(0), vez], [KOTVA[s]!, 0]);
      const body: [number, number][] = [[X(0), vez]];
      for (const x of [6, 12, 18, 24]) body.push([X(x), Math.max(1, Math.round(vez * (1 - x / 28) * (1 - x / 28)))]);
      body.push([X(28), 0]);
      for (let i = 0; i + 1 < body.length; i++) k.prut(LANO, body[i]!, body[i + 1]!);
      for (const [x, y] of body.slice(1, -1)) k.prut(LANO, [x, y], [x, 0]);
    }
  }, predpeti);
}

/** Ocelová příhrada 3 m nad mostovkou, přerušená vyhlídkou: dvě poloviny spojené jen mostovkou 24–36. */
function preruseniPrihrada(): NavrhMostu {
  return navrh((k) => {
    mostovka(k);
    for (const s of [0, 1]) {
      const X = (x: number): number => (s === 0 ? x : L - x);
      k.prut(O, [X(0), 0], [X(6), 3]);
      for (const [a, b] of [[6, 12], [12, 18], [18, 24]]) k.prut(O, [X(a!), 3], [X(b!), 3]);
      for (const x of [6, 12, 18, 24]) k.prut(O, [X(x), 0], [X(x), 3]);
      for (const [a, b] of [[6, 12], [12, 18], [18, 24]]) k.prut(O, [X(a!), 3], [X(b!), 0]);
    }
  });
}

// Napínáky z automatického dopnutí (`dopniLana`) v pořadí, v jakém jsou lana nakreslená.
const PREDPETI: Readonly<Record<string, readonly number[]>> = {
  "pruchod": [0.064, 0.074, 0.104, 0.131, 0.058, 0.402, 0.086, 0.135, 0.109, 0.08, 0.071, 0.427],
  "rozpocet": [0.063, 0.07, 0.086, 0.112, 0.056, 0.355, 0.074, 0.115, 0.09, 0.075, 0.068, 0.371],
  "mistrovska": [0.064, 0.07, 0.086, 0.119, 0.055, 0.362, 0.074, 0.122, 0.09, 0.075, 0.069, 0.378],
  "bez tlumice": [0.063, 0.07, 0.086, 0.106, 0.056, 0.348, 0.073, 0.109, 0.09, 0.075, 0.068, 0.363],
  "vedle": [0.064, 0.07, 0.086, 0.119, 0.055, 0.362, 0.074, 0.122, 0.09, 0.075, 0.069, 0.378],
  "pulvisuta": [0.345, 0.371, 1.766, 1.081, 5.216, -7.897, -6.129, -5.011, 6.619, 50, 0.348, 0.292, 1.675, -0.009, 6.717, -8.022, -6.055, -4.794, 8.709, 50],
};

export const reseni: ReseniUrovne = {
  // Stožáry 8 m a čtyři tlumiče: projde, ale je dražší než inženýrský rozpočet a kmitá přes limit bonusu.
  pruchod: zavesena(8, [[18, 1200, 2], [24, 1200, 2], [36, 1200, 2], [42, 1200, 2]], PREDPETI["pruchod"] ?? []),
  // Stožáry 9 m a dva lehké tlumiče (600 kg) na rytmus útvaru: vejde se do rozpočtu, bonus mine.
  rozpocet: zavesena(9, [[24, 600, 2], [36, 600, 2]], PREDPETI["rozpocet"] ?? []),
  // Stožáry 9 m a dva největší tlumiče na rytmus útvaru v kmitnách protisouměrného tvaru (24 a 36 m).
  mistrovska: zavesena(9, [[24, 1200, 2], [36, 1200, 2]], PREDPETI["mistrovska"] ?? []),
  pady: [
    // Ocelobetonová deska 60 m bez podpory se složí.
    { nazev: "jen mostovka", navrh: navrh((k) => mostovka(k)) },
    // Lana mostovku unesou, ale útvar ji rozkmitá přes mez (jen jedna mechanika).
    { nazev: "zavěšená lávka bez tlumiče", navrh: zavesena(9, [], PREDPETI["bez tlumice"] ?? []) },
    // Tlumiče na holé mostovce: kmitání by zkrotily, ale mostovku neunesou.
    { nazev: "tlumiče bez lan", navrh: navrh((k) => { mostovka(k); tlumice(k, [[24, 1200, 2], [36, 1200, 2]]); }) },
    // Tuhá příhrada se přes vyhlídku nedostane; dvě poloviny spojené mostovkou jsou mechanismus.
    { nazev: "příhrada přerušená vyhlídkou", navrh: preruseniPrihrada() },
    // Tlumiče naladěné na pomalé procesí místo na útvar: útvar lávku rozkmitá.
    { nazev: "tlumiče naladěné na procesí", navrh: zavesena(9, [[24, 1200, 1.6], [36, 1200, 1.6]], PREDPETI["vedle"] ?? []) },
    // Poloviční visutá lávka (obejde vyhlídku): bez tlumiče ji rozkmitá procesí.
    { nazev: "poloviční visutá lávka", navrh: pulVisuta(12, PREDPETI["pulvisuta"] ?? []) },
  ],
};
