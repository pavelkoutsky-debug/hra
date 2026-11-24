// Referenční mosty úrovně 8-01 „Trať na lanech“ (závěrečná kapitola: zavěšený železniční most).
// Trať přes údolí s řekou v jednom poli 96 m (opěry x = 0 pevná a 96 posuvná). Základy pylonů
// jsou na březích (x = −6 a 102), kotvy kotevních lan dál od řeky (x = −30 a 126). Pod mostovkou
// se stavět nesmí (údolí s řekou), nad středem pole (28,5 až 67,5 m) jen do výšky 4 m, u opěr
// musí zůstat volný prostor nad kolejí (zóny u vjezdu na most) a těsně u pylonu (metr od dříku
// směrem k řece) se do výšky 18 m nestaví nic. Přes most jede rychlík a za ním uhelný vlak,
// který na mostě zastaví.
//
// Co úroveň kombinuje: zavěšený most ze 4-03 a 4-04 (pylony na základech, vějíř lan, nosná
// kotevní lana, napínáky z dopnutí) a železnici z 6-03 (těžký vlak, přejezd polí). Prostředek
// pole musí přenést nízký ztužující nosník (příhrada 4 m) zavěšený na krajních lanech: lana
// z pylonu k řece smějí vycházet jen nad 18 m (zóna u pylonu) a pod strop středu (4 m v x = 28,5)
// se z té výšky dostanou nejdál do styčníku 37 (vpravo 59). Strmější lano do středu narazí do
// stropu, plošší začíná pod 18 m. Lano nebo táhlo z volného styčníku v pásu vějíře by muselo
// mířit pod plošší přímku, než jakou dají lana z pylonu nad 18 m, takže ho drží jen lano do
// mostovky u břehu, a to s mnohonásobným tahem (zkoušeno 20 takových mostů, žádný neprošel).
// Bez příhrady tak zbude 22 m kolejiště bez lan a ani svařené ho vlak nepřejede; příhrada bez lan
// takové pole nepřeklene a konzola z pylonů bez lan, která by vlak unesla, stojí přes 5,3 milionu. Zóny u opěr berou
// oporu konzolové příhradě, která by jinak lana nahradila ocelovým táhlem do kotev.
// Recenze M14 našla, že s dřívějším stropem 4,5 m a bez zóny u pylonu lana z 15 a 12 m dosáhla
// do styčníků 42 a 48 a most bez příhrady dostal rozpočtovou medaili; takový most dnes neprojde
// kontrolou návrhu (lana pod 18 m vedou do zóny u pylonu).

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
  /** Výška, ze které vede lano do styčníku 36 (jinak z hlavy); z hlavy výš než 22 m by narazilo do stropu středu. */
  vyska36?: number;
  /** Druhé lano do styčníku 36 o dva metry níž. */
  druhe36?: boolean;
  /** Kotevní lana: z hlavy, a další o dva metry níž. */
  kotevni: readonly IdPrvku[];
}

/** Pylony, vějíře a kotevní lana obou břehů. */
function zaveseni(k: Kreslic, z: Zaveseni): void {
  for (const s of [0, 1]) {
    const px = PYLON[s]!;
    const v36 = z.vyska36 ?? z.vrchol;
    for (const x of z.lana ?? VEJIR) k.prut(z.nosna?.includes(x) ? NOSNE : LANO, [px, x === 36 ? v36 : z.vrchol], [X(s, x), 0]);
    if (z.druhe36) k.prut(LANO, [px, v36 - 2], [X(s, 36), 0]);
    z.kotevni.forEach((prvek, j) => k.prut(prvek, [px, z.vrchol - 2 * j], [KOTVA[s]!, 0]));
    const uchyty = [z.vrchol, v36, ...(z.druhe36 ? [v36 - 2] : []), ...z.kotevni.map((_, j) => z.vrchol - 2 * j)];
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

/** Warrenova příhrada 36–60 výšky 4 m se svislicemi (vrcholy nad středy polí), díly horního pásu z `pas`. */
function warren(k: Kreslic, pas: readonly IdPrvku[]): void {
  let i = 0;
  for (let x = 36; x < 60; x += 6) {
    k.prut(O, [x, 0], [x + 3, 4]);
    k.prut(O, [x + 3, 4], [x + 6, 0]);
    if (x + 6 < 60) k.prut(pas[i++]!, [x + 3, 4], [x + 9, 4]);
    k.prut(O, [x + 3, 0], [x + 3, 4]);
  }
}

const WARREN_STYCNIKY = [39, 45, 51, 57];

// Průchod: vysoký pylon 24 m (lana do 36 z 22 a 20 m, výš by narazila do stropu středu), vějíř
// a lehká Prattova příhrada uprostřed. Unese s rezervou, ale pata pylonu jede na tři čtvrtiny
// únosnosti: na mistrovskou to nestačí a vysoké betonové pylony jsou drahé.
const pruchod = navrh((k) => {
  kolej(k);
  zaveseni(k, { vrchol: 24, vyska36: 22, druhe36: true, kotevni: [NOSNE, NOSNE] });
  pratt(k);
}, [0.007, 0.002, -0.002, -0.004, -0.004, 0.051, 0.035, -0.006, 0.031, 0.012, 0.008, 0.004, 0.002, 0.002, 0.081, -0.019, 0.003, 0.027]);

// Rozpočtová: nejnižší pylon, ze kterého lana k řece projdou nad zónou u pylonu (21 m), a lehká
// Prattova příhrada jen 3 m vysoká. Nic se neporuší, ale horní pás příhrady jede na tři čtvrtiny.
const rozpocet = navrh((k) => {
  kolej(k);
  zaveseni(k, { vrchol: 21, druhe36: true, kotevni: [NOSNE, NOSNE] });
  pratt(k, O, 3);
}, [0.009, 0.005, 0.003, 0.002, 0.003, 0.043, 0.047, 0.02, 0.021, 0.016, 0.013, 0.011, 0.01, 0.01, 0.083, -0.011, 0.023, 0.017]);

// Mistrovská: pylon 22 m a Warrenova příhrada se svislicemi, horní pás těžký kromě dílu nad
// pravým koncem (vlaky jedou zleva). Kolejiště má uprostřed styčník po třech metrech, takže kola
// přejíždějí kratší pole; nic nejede přes 57 %.
const mistrovska = navrh((k) => {
  kolej(k, WARREN_STYCNIKY);
  zaveseni(k, { vrchol: 22, druhe36: true, kotevni: [NOSNE, NOSNE] });
  warren(k, [TO, TO, O]);
}, [0.008, 0.004, 0.001, 0, 0.001, 0.055, 0.061, 0.031, 0.017, 0.015, 0.011, 0.009, 0.007, 0.008, 0.101, -0.023, 0.035, 0.008]);

export const reseni: ReseniUrovne = {
  pruchod,
  rozpocet,
  mistrovska,
  pady: [
    { nazev: "jen mostovka", navrh: navrh((k) => kolej(k)) },
    // Zavěšený most jako ve 4-03: lana a pylony bez ztužující příhrady. Střed pole visí jen na
    // kolejišti, dopnutí ho v rovině neudrží (napínáky vyjdou záporné) a most povolí už vlastní
    // vahou, dřív než přijede vlak.
    {
      nazev: "zavěšený most jako ve 4-03, bez příhrady",
      navrh: navrh((k) => {
        kolej(k);
        zaveseni(k, { vrchol: 24, vyska36: 22, kotevni: [NOSNE] });
      }, [0.007, 0.001, -0.003, -0.004, -0.065, 0.597, 0.041, -1.096, -1.314, -1.369, -1.357, -1.327, -0.333, 1.146]),
    },
    // Obměna obejití z recenze M14 (lana z obou břehů se potkají uprostřed, žádná ocel), jak ji
    // dovolí zóny: lana nejdál do styčníku 37 z 20 m. Mezi 37 a 59 zbude 22 m kolejiště bez lan
    // a vlak ho nepřejede. Svařené kolejiště 30–66 nepomůže (zkoušeno, využití 5,0), ale zkouška
    // takového mostu trvá přes minutu, proto tu není.
    {
      nazev: "lana nejdál do styčníku 37, bez příhrady",
      navrh: navrh((k) => {
        kolej(k, [37, 59]);
        zaveseni(k, { vrchol: 22, druhe36: true, kotevni: [NOSNE, NOSNE] });
        for (const s of [0, 1]) k.prut(LANO, [PYLON[s]!, 20], [X(s, 37), 0]);
      }, [0.076, 0.083, 0.082, 0.079, 0.011, 0.192, 0.17, -0.081, -0.049, -0.14, -0.168, -0.174, -0.165, -0.251, 0.075, 0.046, 0.01, -0.044, 0.373, 0.269]),
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
    // Konzolová příhrada z pylonů bez lan: horní pás z dříku pylonu (20 m) klesá ke středu,
    // pylon drží ocelové táhlo do kotvy a střed nese Prattova příhrada 30–66. Pod rychlíkem
    // se vzepře diagonála u břehu a most se zborcí.
    {
      nazev: "konzolová příhrada z pylonů, bez lan",
      navrh: navrh((k) => {
        kolej(k);
        for (const s of [0, 1]) {
          const horni: [number, number][] = [[-6, 20], [0, 16], [6, 12], [12, 10], [18, 8], [24, 4], [30, 4]];
          for (let i = 0; i + 1 < horni.length; i++) k.prut(O, [X(s, horni[i]![0]), horni[i]![1]], [X(s, horni[i + 1]![0]), horni[i + 1]![1]]);
          for (const [x, y] of horni.slice(2)) k.prut(O, [X(s, x), 0], [X(s, x), y]);
          for (const [x, y] of horni.slice(3)) k.prut(O, [X(s, x), y], [X(s, x - 6), 0]);
          for (let i = 0; i < 4; i++) k.prut(O, [X(s, -6 - 6 * i), 20 - 5 * i], [X(s, -12 - 6 * i), 15 - 5 * i]);
          pylon(k, PYLON[s]!, 21, [20]);
        }
        for (let x = 30; x < 66; x += 6) k.prut(TO, [x, 4], [x + 6, 4]);
        for (let x = 36; x <= 60; x += 6) k.prut(O, [x, 0], [x, 4]);
        for (let x = 30; x < 66; x += 6) {
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
        zaveseni(k, { vrchol: 21, kotevni: [NOSNE, NOSNE] });
        pratt(k);
      }, [0.009, 0.005, 0.003, 0.003, 0.004, 0.099, 0.029, 0.008, 0.015, 0.012, 0.01, 0.01, 0.01, 0.105, 0.029, 0.008]),
    },
    // Jediné obyčejné kotevní lano pylon neudrží (stačilo ve 4-03, vlak je několikrát těžší).
    {
      nazev: "pylon 21 m s jedním obyčejným kotevním lanem",
      navrh: navrh((k) => {
        kolej(k);
        zaveseni(k, { vrchol: 21, druhe36: true, kotevni: [LANO] });
        pratt(k);
      }, [0.008, 0.004, 0.002, 0.002, 0.003, 0.049, 0.043, 0.222, 0.015, 0.012, 0.009, 0.009, 0.009, 0.086, -0.019, 0.223]),
    },
  ],
  vyzvy: [
    // Nejlevnější most, který jsem našel: nízká příhrada 3 m a kotvení z jednoho nosného
    // a jednoho obyčejného lana. Projde neporušený, paty pylonů jedou na 92 %.
    {
      nazev: "pylon 21 m, příhrada 3 m, kotevní lano nosné a obyčejné",
      navrh: navrh((k) => {
        kolej(k);
        zaveseni(k, { vrchol: 21, druhe36: true, kotevni: [NOSNE, LANO] });
        pratt(k, O, 3);
      }, [0.008, 0.004, 0.002, 0.002, 0.003, 0.045, 0.046, 0.039, 0.05, 0.015, 0.012, 0.01, 0.01, 0.01, 0.083, -0.011, 0.04, 0.049]),
    },
  ],
};
