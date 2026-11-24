// Referenční mosty úrovně 8-01 „Trať na lanech“ (závěrečná kapitola: zavěšený železniční most).
// Trať přes údolí s řekou v jednom poli 96 m (opěry x = 0 pevná a 96 posuvná). Základy pylonů
// jsou na březích (x = −6 a 102), kotvy kotevních lan dál od řeky (x = −30 a 126). Pod mostovkou
// se stavět nesmí (údolí s řekou), nad středem pole (28,5 až 67,5 m) jen do výšky 4,5 m, a u opěr
// musí zůstat volný prostor nad kolejí (zóny u vjezdu na most). Přes most jede rychlík a za ním
// uhelný vlak, který na mostě zastaví.
//
// Co úroveň kombinuje: zavěšený most ze 4-03 a 4-04 (pylony na základech, vějíř lan, nosná
// kotevní lana, napínáky z dopnutí) a železnici z 6-03 (těžký vlak, přejezd polí). Lana z pylonů
// dosáhnou nejdál do styčníků 36 a 60, prostředních 24 m musí přenést nízký ztužující nosník
// (příhrada 4 m) zavěšený na krajních lanech. Bez příhrady se lana a pylon pod vlakem přetíží,
// příhrada bez lan takové pole nepřeklene. Zóny u opěr berou oporu konzolové příhradě, která by
// jinak lana nahradila ocelovým táhlem do kotev.

import type { IdPrvku } from "../../src/data/katalog";
import { Kreslic } from "../../src/data/kreslic";
import type { NavrhMostu } from "../../src/data/navrh";
import type { ReseniUrovne } from "../reseni";

const O: IdPrvku = "ocel-lehka";
const TO: IdPrvku = "ocel-tezka";
const LANO: IdPrvku = "lano";
const NOSNE: IdPrvku = "lano-nosne";
const PILIR: IdPrvku = "pilir";

const L = 96;
/** Základy pylonů a kotvy kotevních lan (levý, pravý břeh). */
const PYLON = [-6, 102] as const;
const KOTVA = [-30, 126] as const;
/** Styčníky mostovky, do kterých vedou lana z levého pylonu (vpravo zrcadlově). */
const VEJIR = [6, 12, 18, 24, 30, 36];

/** Zrcadlení: x na levém břehu → x na straně `s` (0 levá, 1 pravá). */
const X = (s: number, x: number): number => (s === 0 ? x : L - x);

function navrh(stav: (k: Kreslic) => void, predpeti: readonly number[] = []): NavrhMostu {
  const k = new Kreslic("8-01");
  stav(k);
  // Napínáky lan v pořadí, v jakém jsou lana nakreslená, jak je spočítalo dopnutí (`dopniLana`).
  const most = k.navrh();
  let lano = 0;
  return {
    ...most,
    pruty: most.pruty.map((p) => (p.prvek === LANO || p.prvek === NOSNE ? { ...p, predpeti: predpeti[lano++] ?? 0 } : p)),
  };
}

/** Kolejiště 0–96 po šesti metrech; `deleni` přidá styčníky (Warren se svislicemi chce 3 m). */
function kolej(k: Kreslic, deleni: readonly number[] = []): void {
  const uzly = [...new Set([...Array.from({ length: L / 6 + 1 }, (_, i) => 6 * i), ...deleni])].sort((a, b) => a - b);
  for (let i = 0; i + 1 < uzly.length; i++) k.prut("kolejiste", [uzly[i]!, 0], [uzly[i + 1]!, 0]);
}

/** Pylon (pilíř) od základu do výšky `vrchol` se styčníky ve výškách `uchyty`; díl nejvýš 12 m. */
function pylon(k: Kreslic, x: number, vrchol: number, uchyty: readonly number[]): void {
  const vysky = [...new Set([0, ...uchyty.filter((y) => y > 0 && y < vrchol), vrchol])].sort((a, b) => a - b);
  for (let i = 0; i + 1 < vysky.length; i++) {
    for (let y = vysky[i]!; y < vysky[i + 1]!; y += 12) k.prut(PILIR, [x, y], [x, Math.min(vysky[i + 1]!, y + 12)]);
  }
}

interface Zaveseni {
  vrchol: number;
  /** Lana z hlavy do styčníků vějíře (které z nich nosná). */
  lana?: readonly number[];
  nosna?: readonly number[];
  /** Druhé lano do styčníku 36 o dva metry níž. */
  druhe36?: boolean;
  /** Kotevní lana: z hlavy, a další o dva metry níž. */
  kotevni: readonly IdPrvku[];
}

/** Pylony, vějíře a kotevní lana obou břehů. */
function zaveseni(k: Kreslic, z: Zaveseni): void {
  for (const s of [0, 1]) {
    const px = PYLON[s]!;
    for (const x of z.lana ?? VEJIR) k.prut(z.nosna?.includes(x) ? NOSNE : LANO, [px, z.vrchol], [X(s, x), 0]);
    if (z.druhe36) k.prut(LANO, [px, z.vrchol - 2], [X(s, 36), 0]);
    z.kotevni.forEach((prvek, j) => k.prut(prvek, [px, z.vrchol - 2 * j], [KOTVA[s]!, 0]));
    const uchyty = [z.vrchol, ...(z.druhe36 ? [z.vrchol - 2] : []), ...z.kotevni.map((_, j) => z.vrchol - 2 * j)];
    pylon(k, px, z.vrchol, uchyty);
  }
}

/** Prattova příhrada 36–60 výšky `h` nad kolejí (diagonály ke středu), horní pás z `pas`. */
function pratt(k: Kreslic, pas: IdPrvku = O, h = 4): void {
  k.prut(O, [36, 0], [42, h]);
  k.prut(O, [54, h], [60, 0]);
  for (let x = 42; x < 54; x += 6) k.prut(pas, [x, h], [x + 6, h]);
  for (const x of [42, 48, 54]) k.prut(O, [x, 0], [x, h]);
  k.prut(O, [42, h], [48, 0]);
  k.prut(O, [48, 0], [54, h]);
}

/** Warrenova příhrada 36–60 výšky 4 m se svislicemi (vrcholy nad středy polí), horní pás z `pas`. */
function warren(k: Kreslic, pas: IdPrvku = O): void {
  for (let x = 36; x < 60; x += 6) {
    k.prut(O, [x, 0], [x + 3, 4]);
    k.prut(O, [x + 3, 4], [x + 6, 0]);
    if (x + 6 < 60) k.prut(pas, [x + 3, 4], [x + 9, 4]);
    k.prut(O, [x + 3, 0], [x + 3, 4]);
  }
}

const WARREN_STYCNIKY = [39, 45, 51, 57];

// Průchod: vysoký pylon 24 m, vějíř, dvě lana do styčníku 36 a lehká Prattova příhrada uprostřed.
// Unese s rezervou, ale lehký horní pás příhrady jede na dvě třetiny únosnosti: na mistrovskou
// to nestačí a vysoké betonové pylony jsou drahé.
const pruchod = navrh((k) => {
  kolej(k);
  zaveseni(k, { vrchol: 24, druhe36: true, kotevni: [NOSNE, NOSNE] });
  pratt(k);
}, [0.008, 0.002, -0.001, -0.003, -0.004, 0.034, 0.044, 0.021, 0.012, 0.013, 0.008, 0.005, 0.003, 0.002, 0.073, -0.016, 0.025, 0.007]);

// Rozpočtová: nižší pylon 20 m a Prattova příhrada s těžkým horním pásem. Nic se neporuší, ale
// kolejiště na konci příhrady, kde ho kola přejíždějí v šestimetrových polích, jede na 73 %.
const rozpocet = navrh((k) => {
  kolej(k);
  zaveseni(k, { vrchol: 20, druhe36: true, kotevni: [NOSNE, NOSNE] });
  pratt(k, TO);
}, [0.009, 0.005, 0.004, 0.004, 0.006, 0.049, 0.062, 0.028, 0.02, 0.017, 0.014, 0.013, 0.012, 0.013, 0.102, -0.021, 0.033, 0.013]);

// Mistrovská: pylon 22 m a Warrenova příhrada se svislicemi a těžkým horním pásem. Kolejiště má
// uprostřed styčník po třech metrech, takže kola přejíždějí kratší pole; nic nejede přes 58 %.
const mistrovska = navrh((k) => {
  kolej(k, WARREN_STYCNIKY);
  zaveseni(k, { vrchol: 22, druhe36: true, kotevni: [NOSNE, NOSNE] });
  warren(k, TO);
}, [0.008, 0.004, 0.001, 0, 0.001, 0.057, 0.062, 0.031, 0.018, 0.015, 0.012, 0.009, 0.008, 0.008, 0.109, -0.022, 0.037, 0.009]);

export const reseni: ReseniUrovne = {
  pruchod,
  rozpocet,
  mistrovska,
  pady: [
    { nazev: "jen mostovka", navrh: navrh((k) => kolej(k)) },
    // Zavěšený most jako ve 4-03: lana a pylony bez ztužující příhrady. Střed pole visí jen na
    // kolejišti, lana do 36 se pod vlakem přetíží a pylon se ohne.
    {
      nazev: "zavěšený most jako ve 4-03, bez příhrady",
      navrh: navrh((k) => {
        kolej(k);
        zaveseni(k, { vrchol: 24, kotevni: [NOSNE] });
      }, [0.007, 0.002, -0.002, -0.004, -0.071, 0.639, 0.041, -1.948, -2.327, -2.421, -2.385, -2.288, -1.294, 2.364]),
    },
    // Příhrada jako v 6-03, bez lan: čtyři metry výšky na 84 m pole nestačí.
    {
      nazev: "příhrada bez lan, jen čtyři metry vysoká",
      navrh: navrh((k) => {
        kolej(k);
        k.prut(O, [6, 0], [12, 4]);
        k.prut(O, [84, 4], [90, 0]);
        for (let x = 12; x < 84; x += 6) k.prut(O, [x, 4], [x + 6, 4]);
        for (let x = 12; x <= 84; x += 6) k.prut(O, [x, 0], [x, 4]);
        for (let x = 12; x < 84; x += 6) {
          if (x < 48) k.prut(O, [x, 4], [x + 6, 0]);
          else k.prut(O, [x, 0], [x + 6, 4]);
        }
      }),
    },
    // Příhrada visí jen na jednom obyčejném laně do styčníku 36: to se pod stojícím vlakem přetrhne.
    {
      nazev: "jediné lano do styčníku 36",
      navrh: navrh((k) => {
        kolej(k);
        zaveseni(k, { vrchol: 20, kotevni: [NOSNE, NOSNE] });
        pratt(k);
      }, [0.009, 0.006, 0.004, 0.005, 0.006, 0.103, 0.031, 0.009, 0.016, 0.014, 0.012, 0.012, 0.013, 0.109, 0.031, 0.009]),
    },
    // Jediné obyčejné kotevní lano pylon neudrží (stačilo ve 4-03, vlak je několikrát těžší).
    {
      nazev: "pylon 20 m s jedním obyčejným kotevním lanem",
      navrh: navrh((k) => {
        kolej(k);
        zaveseni(k, { vrchol: 20, druhe36: true, kotevni: [LANO] });
        pratt(k);
      }, [0.008, 0.005, 0.003, 0.004, 0.005, 0.05, 0.048, 0.228, 0.016, 0.013, 0.012, 0.011, 0.012, 0.088, -0.006, 0.229]),
    },
  ],
  vyzvy: [
    // Nejlevnější most, který jsem našel: nízká příhrada 3 m a kotvení z jednoho nosného
    // a jednoho obyčejného lana. Projde neporušený, pylony jedou na 97 %.
    {
      nazev: "pylon 20 m, příhrada 3 m, kotevní lano nosné a obyčejné",
      navrh: navrh((k) => {
        kolej(k);
        zaveseni(k, { vrchol: 20, druhe36: true, kotevni: [NOSNE, LANO] });
        pratt(k, O, 3);
      }, [0.008, 0.005, 0.004, 0.004, 0.006, 0.049, 0.047, 0.041, 0.05, 0.016, 0.014, 0.012, 0.012, 0.013, 0.092, -0.043, 0.042, 0.048]),
    },
  ],
};
