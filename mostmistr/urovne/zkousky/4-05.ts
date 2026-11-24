// Referenční mosty zkouškové úrovně 4-05 „Jediný základ“: silnice 72 m přes údolí, ve kterém se
// dá založit jediný pilíř, a ten nestojí uprostřed: 48 m od levé opěry a 24 m od pravé. Pod
// delším polem se stavět nesmí. Přes most jedou dva tahače s návěsem, kolona nákladních aut
// proti nim a autobus.
//
// Co úroveň zkouší: zavěšený most ze 4-03 má dvě stejná pole a lana na obou stranách pylonu se
// vyvažují. Tady visí vlevo dvakrát delší pole než vpravo, pylon to táhne doleva a všechno, co
// ho drží, je kotevní lano do pravé opěry. Obyčejné lano na to nestačí (potřebuje nosné lano ze
// 4-04, nebo aspoň dvě vedle sebe) a nízký pylon dá lanům malý úhel a přetíží je. Mistrovská
// chce pylon nakloněný nad delší pole, vysoký svislý s dvojitým kotvením, nebo svislý
// dvacetimetrový s jediným nosným kotevním lanem (ten splní bonus jen těsně).
//
// Úroveň nedovoluje ocelové pruty, jen mostovku, pilíř a lana. Recenze obtížnosti M12c našla,
// že lehká příhrada nad delším polem (pět až šest metrů vysoká, bez jediného lana) dávala
// rozpočtovou medaili v šedesáti ze sto deseti tvarů a levněji než zavěšený most; zkouška
// kapitoly o lanech se tak dala složit bez lan. Mosty autora ocel nepoužívají.

import type { IdPrvku } from "../../src/data/katalog";
import { Kreslic } from "../../src/data/kreslic";
import type { NavrhMostu } from "../../src/data/navrh";
import type { ReseniUrovne } from "../reseni";

const LANO: IdPrvku = "lano";
const NOSNE: IdPrvku = "lano-nosne";
const PILIR: IdPrvku = "pilir";

const ROZPETI = 72;
/** Jediný základ: x pilíře a hloubka jeho paty. */
const X = 48;
const PATA = -14;
/** Styčníky mostovky delšího a kratšího pole, do kterých vedou lana. */
const DLOUHE = [6, 12, 18, 24, 30, 36, 42];
const KRATKE = [54, 60, 66];

function navrh(stav: (k: Kreslic) => void, predpeti: readonly number[] = []): NavrhMostu {
  const k = new Kreslic("4-05");
  stav(k);
  // Napínáky lan v pořadí, v jakém jsou lana nakreslená, jak je spočítalo dopnutí (`dopniLana`).
  const most = k.navrh();
  let lano = 0;
  return {
    ...most,
    pruty: most.pruty.map((p) => (p.prvek === LANO || p.prvek === NOSNE ? { ...p, predpeti: predpeti[lano++] ?? 0 } : p)),
  };
}

/** Ocelobetonová mostovka z dvanácti polí po šesti metrech. */
function vozovka(k: Kreslic): void {
  for (let x = 0; x < ROZPETI; x += 6) k.prut("mostovka-ocelobeton", [x, 0], [x + 6, 0]);
}

/** Svislý pilíř od paty do výšky `hlava` se styčníky ve výškách `deleni` (díl měří nejvýš 12 m). */
function pilir(k: Kreslic, hlava: number, deleni: readonly number[] = []): void {
  const vysky = [PATA, ...deleni.filter((y) => y > PATA && y < hlava).sort((a, b) => a - b), hlava];
  for (let i = 0; i + 1 < vysky.length; i++) {
    for (let y = vysky[i]!; y < vysky[i + 1]!; y += 12) k.prut(PILIR, [X, y], [X, Math.min(vysky[i + 1]!, y + 12)]);
  }
}

/**
 * Zavěšený most se svislým pylonem: lana z hlavy do styčníků `lana` (opěry smějí být mezi nimi),
 * `kotevni` říká, z čeho je lano do pravé opěry, a `druhe` přidá druhé kotevní lano o metr níž.
 */
function svisly(vrchol: number, lana: readonly number[], kotevni: IdPrvku, druhe: boolean, predpeti: readonly number[]): NavrhMostu {
  return navrh((k) => {
    vozovka(k);
    pilir(k, vrchol, druhe ? [0, vrchol - 1] : [0]);
    for (const x of lana) k.prut(x === ROZPETI ? kotevni : LANO, [X, vrchol], [x, 0]);
    if (druhe) k.prut(LANO, [X, vrchol - 1], [ROZPETI, 0]);
  }, predpeti);
}

/** Zavěšený most s pylonem nakloněným nad delší pole: hlava je o `posun` metrů vlevo od paty. */
function sikmy(vrchol: number, posun: number, predpeti: readonly number[]): NavrhMostu {
  return navrh((k) => {
    vozovka(k);
    pilir(k, 0);
    k.prut(PILIR, [X, 0], [X - posun / 2, vrchol / 2]);
    k.prut(PILIR, [X - posun / 2, vrchol / 2], [X - posun, vrchol]);
    for (const x of [...DLOUHE, ...KRATKE]) k.prut(LANO, [X - posun, vrchol], [x, 0]);
    k.prut(NOSNE, [X - posun, vrchol], [ROZPETI, 0]);
  }, predpeti);
}

/** Svařená mostovka na pilíři rozevřeném do V: šikmé pilíře ze základu do styčníků 42 a 54 m, bez lan. */
function vecko(): NavrhMostu {
  return navrh((k) => {
    vozovka(k);
    for (let x = 6; x < ROZPETI; x += 6) k.bod(x, 0, { svar: true });
    k.prut(PILIR, [X, PATA], [X - 3, PATA / 2]);
    k.prut(PILIR, [X - 3, PATA / 2], [X - 6, 0]);
    k.prut(PILIR, [X, PATA], [X + 3, PATA / 2]);
    k.prut(PILIR, [X + 3, PATA / 2], [X + 6, 0]);
  });
}

const VSECHNA = [...DLOUHE, ...KRATKE, ROZPETI];

// Průchod: to, co hráč zná ze 4-03 a 4-04, jen vyšší. Svislý pylon 22 m, kotevní lano do pravé
// opěry nosné a pod ním ještě jedno obyčejné. Unese s rezervou, ale stojí víc, než inženýrský
// rozpočet dovolí.
const pruchod = svisly(22, VSECHNA, NOSNE, true, [0.209, 0.187, 0.165, 0.146, 0.13, 0.117, 0.11, 0.112, 0.122, 0.135, 0.195, 0.052]);

// Rozpočtová: pylon 20 m a kotvení ze dvou obyčejných lan. Levné a nic se neporuší, ale kotevní
// lana jedou na tři čtvrtiny pevnosti: rezervu, kterou chce mistrovská, nemají.
const rozpocet = svisly(20, VSECHNA, LANO, true, [0.226, 0.2, 0.176, 0.154, 0.135, 0.12, 0.11, 0.113, 0.124, 0.14, 0.468, 0.398]);

// Mistrovská: pylon 20 m nakloněný o čtyři metry nad delší pole a jedno nosné kotevní lano.
// Lana delšího pole jsou strmější, kotevní lano má delší rameno a nic nejede přes polovinu pevnosti.
const mistrovska = sikmy(20, 4, [0.208, 0.184, 0.161, 0.14, 0.124, 0.112, 0.108, 0.12, 0.134, 0.153, 0.249]);

export const reseni: ReseniUrovne = {
  pruchod,
  rozpocet,
  mistrovska,
  pady: [
    { nazev: "jen mostovka", navrh: navrh((k) => vozovka(k)) },
    {
      nazev: "mostovka na pilíři, bez lan",
      navrh: navrh((k) => {
        vozovka(k);
        pilir(k, 0);
      }),
    },
    // Nízký pylon: lana mají malý úhel a kotevní lano se přetrhne.
    { nazev: "nízký pylon 14 m, lana do všech styčníků i opěr", navrh: svisly(14, [...DLOUHE, ...KRATKE, 0, ROZPETI], LANO, false, [0.483, 2.094, 1.326, 1.79, 1.723, 1.864, 1.328, -0.816, -0.78, -1.908, 0.472, -0.609]) },
    // Most jako ve 4-03: jedno obyčejné kotevní lano dvakrát delší pole neudrží.
    { nazev: "pylon 18 m s jedním obyčejným kotevním lanem", navrh: svisly(18, [...DLOUHE, ...KRATKE, 0, ROZPETI], LANO, false, [0.751, 0.775, 0.805, 0.833, 0.838, 0.766, 0.528, -0.297, -0.504, -0.542, -0.554, 0.05]) },
    // Bez kotevního lana se pylon ohne nad delší pole a zlomí se.
    { nazev: "pylon 18 m bez kotevního lana", navrh: svisly(18, [...DLOUHE, ...KRATKE], LANO, false, [3.333, 5.469, 10.184, 5.751, 10.117, 5.152, 5.443, -3.503, -5.374, -5.807]) },
    // Nakloněný pylon musí být dost vysoký: osmnáctimetrový se v patě zlomí.
    { nazev: "nakloněný pylon jen 18 m", navrh: sikmy(18, 4, [0.226, 0.198, 0.171, 0.147, 0.127, 0.113, 0.108, 0.123, 0.14, 0.162, 0.266]) },
    // Bez lan: svařená mostovka (lekce 4-02) na pilíři do V zkrátí delší pole jen o šest metrů.
    { nazev: "svařená mostovka na pilíři do V, bez lan", navrh: vecko() },
  ],
};
