// Referenční mosty úrovně 8-02 „Lávka na lanech“ (závěrečná kapitola: zavěšená lávka s laděnými
// tlumiči). Lávka 60 m přes údolí (opěry x = 0 pevná a 60 posuvná), pod mostovkou se stavět
// nesmí. Mostovka je ocelobetonová deska, pylony jsou železobetonové pilíře na základech 4 m za
// opěrami (x = −4 a 64) a kotevní lana vedou do kotev 16 m za opěrami. Uprostřed lávky je
// vyhlídka: mezi 28 a 32 m nesmí nic vést výš než 0,9 m nad mostovku (zábradlí). Nad celým
// údolím vede ve výšce 10,5 m vedení: výš se stavět nesmí. Přes lávku jde slavnostní útvar 40 lidí
// v kroku 2 Hz a proti němu procesí 16 lidí v pomalém kroku 1,6 Hz.
//
// Co úroveň kombinuje: zavěšený most ze 4-03 (pylony, vějíř lan, kotevní lana, napínáky
// z dopnutí) a laděný tlumič z 5-02 až 5-04 (osa frekvencí, ladění na rytmus).
//
// Proč paleta nemá ocel (přeladění M14 po recenzi obtížnosti): s ocelovými pruty šla lávka
// postavit bez tlumiče. Krátký šikmý ocelový stožár (hlava nad mostovkou, třeba v (5,5)) nebo
// ocelová táhla místo lan posunou vlastní frekvence lávky mezi rytmy útvaru a procesí a lávka
// pak bez tlumiče kmitá stejně málo (0,75 až 0,9 m/s²) jako zavěšená lávka s tlumiči; laděný
// tlumič totiž ubere jen rezonanci, ne kmitání mimo ni. Pylon z pilíře stojí jen na základu
// a nakloní se nejvýš o polovinu výšky, takže hlava zůstane nad opěrou nebo za ní; lávka na
// lanech z takového pylonu má vlastní frekvence 1,2 až 1,9 Hz, mezi rytmy obou skupin a jejich
// násobky, a bez tlumiče kmitá přes mez (ze 185 zkoušených mostů bez tlumiče nejméně 1,14 m/s²,
// kromě visutých lávek s pylonem nad 10 m, které zavírá vedení). Procesí má 16 lidí (dřív 12),
// aby chytilo i měkkou lávku bez lan do části styčníků, která útvaru uteče dolů.

import type { IdPrvku } from "../../src/data/katalog";
import { Kreslic } from "../../src/data/kreslic";
import type { NavrhMostu } from "../../src/data/navrh";
import type { ReseniUrovne } from "../reseni";

const DESKA: IdPrvku = "mostovka-ocelobeton";
const PILIR: IdPrvku = "pilir";
const LANO: IdPrvku = "lano";
const NOSNE: IdPrvku = "lano-nosne";

const L = 60;
/** Styčníky mostovky po šesti metrech. */
const USEKY = [0, 6, 12, 18, 24, 30, 36, 42, 48, 54, 60];
/** Základy pylonů a kotvy kotevních lan za levou a pravou opěrou. */
const ZAKLAD = [-4, 64] as const;
const KOTVA = [-16, 76] as const;

/** Laděný tlumič pod styčníkem mostovky: [x, hmotnost závaží v kg, ladění v Hz]. */
type Tlumic = readonly [number, number, number];

function navrh(stav: (k: Kreslic) => void, predpeti: readonly number[] = []): NavrhMostu {
  const k = new Kreslic("8-02");
  stav(k);
  // Napínáky lan (i nosných) v pořadí, v jakém jsou lana nakreslená, jak je spočítalo dopnutí (`dopniLana`).
  const most = k.navrh();
  let lano = 0;
  return { ...most, pruty: most.pruty.map((p) => (p.prvek === LANO || p.prvek === NOSNE ? { ...p, predpeti: predpeti[lano++] ?? 0 } : p)) };
}

function mostovka(k: Kreslic, xs: readonly number[] = USEKY): void {
  for (let i = 0; i + 1 < xs.length; i++) k.prut(DESKA, [xs[i]!, 0], [xs[i + 1]!, 0]);
}

function tlumice(k: Kreslic, t: readonly Tlumic[]): void {
  for (const [x, hmota, frekvence] of t) k.bod(x, 0, { tlumic: { hmota, frekvence } });
}

/** Souřadnice x na straně `s` (0 levá, 1 pravá, zrcadlově). */
const strana = (s: number, x: number): number => (s === 0 ? x : L - x);

/**
 * Zavěšená lávka: pylon z pilíře ze základu do hlavy [hx, vez] (vlevo; vpravo zrcadlově),
 * z hlavy vějíř lan do styčníků `cile` své poloviny a kotevní lano do kotvy za opěrou.
 */
function zavesena(hx: number, vez: number, t: readonly Tlumic[], predpeti: readonly number[], cile: readonly number[] = [6, 12, 18, 24, 30]): NavrhMostu {
  return navrh((k) => {
    mostovka(k);
    for (const s of [0, 1]) {
      const hlava: [number, number] = [strana(s, hx), vez];
      k.prut(PILIR, [ZAKLAD[s]!, 0], hlava);
      for (const c of cile) k.prut(LANO, hlava, [strana(s, c), 0]);
      k.prut(LANO, hlava, [KOTVA[s]!, 0]);
    }
    tlumice(k, t);
  }, predpeti);
}

/** Lávka se stožárem z prutu mostovky na opěře, hlava v [3, 5], vějíř do 6 až 30 a kotevní lano. */
function stozarZMostovky(predpeti: readonly number[]): NavrhMostu {
  return navrh((k) => {
    mostovka(k);
    for (const s of [0, 1]) {
      const hlava: [number, number] = [strana(s, 3), 5];
      k.prut(DESKA, [strana(s, 0), 0], hlava);
      for (const c of [6, 12, 18, 24, 30]) k.prut(LANO, hlava, [strana(s, c), 0]);
      k.prut(LANO, hlava, [KOTVA[s]!, 0]);
    }
  }, predpeti);
}

/**
 * Poloviční visutá lávka: pylon z pilíře 10 m, z hlavy nosné lano přes body nad styčníky 6 až
 * 24 m do styčníku 28 m (vyhlídku obejde), z bodů svislé závěsy; vpravo zrcadlově.
 */
function pulVisuta(predpeti: readonly number[]): NavrhMostu {
  const xs = [0, 6, 12, 18, 24, 28, 32, 36, 42, 48, 54, 60];
  const body: [number, number][] = [[-4, 10], [6, 5], [12, 2], [18, 1], [24, 1], [28, 0]];
  return navrh((k) => {
    mostovka(k, xs);
    for (const s of [0, 1]) {
      const B = body.map(([x, y]) => [strana(s, x), y] as [number, number]);
      k.prut(PILIR, [ZAKLAD[s]!, 0], B[0]!);
      k.prut(LANO, B[0]!, [KOTVA[s]!, 0]);
      for (let i = 0; i + 1 < B.length; i++) k.prut(NOSNE, B[i]!, B[i + 1]!);
      for (const [x, y] of B.slice(1, -1)) k.prut(LANO, [x, y], [x, 0]);
    }
  }, predpeti);
}

// Napínáky z automatického dopnutí (`dopniLana`) v pořadí, v jakém jsou lana nakreslená.
const PREDPETI: Readonly<Record<string, readonly number[]>> = {
  "pruchod": [0.056, 0.076, 0.094, 0.115, 0.057, 0.563, 0.06, 0.08, 0.098, 0.118, 0.069, 0.577],
  "rozpocet": [0.056, 0.068, 0.091, 0.111, 0.062, 0.55, 0.059, 0.073, 0.094, 0.114, 0.074, 0.563],
  "mistrovska": [0.056, 0.069, 0.094, 0.115, 0.064, 0.563, 0.06, 0.073, 0.098, 0.118, 0.077, 0.578],
  "bez tlumice": [0.055, 0.068, 0.084, 0.102, 0.057, 0.522, 0.059, 0.072, 0.087, 0.105, 0.068, 0.533],
  "bez lan do 12 a 24": [1.158, 0.598, 0.334, -0.176, 1.838, 0.729, 0.293, 0.728],
  "stozar z mostovky": [0.028, 0.061, 0.104, 0.148, 0.105, 0.705, 0.025, 0.059, 0.103, 0.147, 0.08, 0.687],
  "pulvisuta": [-0.186, -0.193, 15.269, 18.525, -9.434, -44.323, 3.356, -50, -50, 11.029, 0.804, -0.474, 2.236, 2.406, 0.306, 2.829, -5.645, -49.538, -38.195, 50],
};

/** Pět tlumičů pod styčníky 18 až 42 m, všechny naladěné na rytmus útvaru. */
const PET = [18, 24, 30, 36, 42];

export const reseni: ReseniUrovne = {
  // Pylony s hlavou v (−1, 10) a šest tlumičů 1 200 kg: projde, ale je dražší než inženýrský rozpočet.
  pruchod: zavesena(-1, 10, [12, 18, 24, 36, 42, 48].map((x) => [x, 1200, 2] as const), PREDPETI["pruchod"] ?? []),
  // Tytéž pylony a pět lehčích tlumičů (800 kg) na rytmus útvaru: vejde se do rozpočtu, bonus mine.
  rozpocet: zavesena(-1, 10, PET.map((x) => [x, 800, 2] as const), PREDPETI["rozpocet"] ?? []),
  // Tytéž pylony a pět největších tlumičů (1 200 kg) na rytmus útvaru pod styčníky 18 až 42 m.
  mistrovska: zavesena(-1, 10, PET.map((x) => [x, 1200, 2] as const), PREDPETI["mistrovska"] ?? []),
  pady: [
    // Ocelobetonová deska 60 m bez podpory se složí.
    { nazev: "jen mostovka", navrh: navrh((k) => mostovka(k)) },
    // Lana mostovku unesou, ale útvar a procesí ji rozkmitají přes mez (jen jedna mechanika).
    { nazev: "zavěšená lávka bez tlumiče", navrh: zavesena(-1, 10, [], PREDPETI["bez tlumice"] ?? []) },
    // Tlumiče na holé mostovce: kmitání by zkrotily, ale mostovku neunesou.
    { nazev: "tlumiče bez lan", navrh: navrh((k) => { mostovka(k); tlumice(k, PET.map((x) => [x, 1200, 2] as const)); }) },
    // Měkká lávka bez lan do styčníků 12, 24, 36 a 48 (mostovka v nich visí): útvaru uteče dolů, procesí ji chytí.
    { nazev: "měkká lávka bez části lan", navrh: zavesena(-3, 10, [], PREDPETI["bez lan do 12 a 24"] ?? [], [6, 18, 30]) },
    // Tuhý šikmý stožár z prutu mostovky (hlava nad mostovkou), jak ho dřív šlo postavit z oceli: bez tlumiče kmitá.
    { nazev: "stožár z prutu mostovky bez tlumiče", navrh: stozarZMostovky(PREDPETI["stozar z mostovky"] ?? []) },
    // Poloviční visutá lávka s pylony 10 m (vyšší nepustí vedení): bez tlumiče ji rozkmitá útvar i procesí.
    { nazev: "poloviční visutá lávka", navrh: pulVisuta(PREDPETI["pulvisuta"] ?? []) },
  ],
};
