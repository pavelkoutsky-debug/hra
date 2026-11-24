// Referenční mosty zkouškové úrovně 5-05 „Dva rytmy“: městská lávka 36 m, výš než metr nad
// mostovku ani pod ni se stavět nesmí. Nejdřív přes ni proběhne lidový běh (36 běžců, 2,4 Hz),
// hned za ním jde průvod s kapelou (48 lidí, kapela v taktu 1,8 Hz). Metr vysoká příhrada kmitá
// prázdná na 2,1 až 2,2 Hz, s lidmi kolem 1,7 Hz: jeden rytmus má těsně pod sebou, druhý těsně
// nad sebou a tužší ani měkčí ji udělat nejde. Tlumič naladěný na průvod rozštěpí vrchol a horní
// půlku pošle k rytmu běžců; tlumič naladěný na běžce nechá průvod skoro být. Projde až most se
// dvěma tlumiči (kmitání do 1,0 m/s²), mistrovská (do 0,8 m/s²) chce oba největší, každý na svůj
// rytmus, a pole mostovky kratší než čtyři metry, která pod dvojnásobkem rytmu běhu nedrnčí.

import type { IdPrvku } from "../../src/data/katalog";
import { Kreslic } from "../../src/data/kreslic";
import type { NavrhMostu, TlumicStycniku } from "../../src/data/navrh";
import type { ReseniUrovne } from "../reseni";

const O: IdPrvku = "ocel-lehka";
const ROZPETI = 36;

/** Laděný tlumič pod styčníkem mostovky: [x, hmotnost závaží v kg, ladění v Hz]. */
type Tlumic = readonly [number, number, number];

function navrh(stav: (k: Kreslic) => void): NavrhMostu {
  const k = new Kreslic("5-05");
  stav(k);
  return k.navrh();
}

/** Styčníky mostovky po stejných polích od opěry k opěře. */
function poPolich(pole: number): number[] {
  return Array.from({ length: ROZPETI / pole + 1 }, (_, i) => i * pole);
}

/** Pole mostovky 4 m a uprostřed dvě dvoumetrová, aby měl most styčník v půli (jako v 5-03). */
const PO_CTYRECH_SE_STREDEM = [0, 4, 8, 12, 16, 18, 20, 24, 28, 32, 36];

function mostovka(k: Kreslic, xs: readonly number[]): void {
  for (let i = 0; i + 1 < xs.length; i++) k.prut("mostovka-drevo", [xs[i]!, 0], [xs[i + 1]!, 0]);
}

function zaves(k: Kreslic, tlumice: readonly Tlumic[]): void {
  for (const [x, hmota, frekvence] of tlumice) {
    const tlumic: TlumicStycniku = { hmota, frekvence };
    k.bod(x, 0, { tlumic });
  }
}

/**
 * Metr vysoká příhrada nad mostovkou se svislicí nad každým vnitřním styčníkem `xs`; diagonály
 * klesají ke středu rozpětí.
 */
function plna(xs: readonly number[], tlumice: readonly Tlumic[] = []): NavrhMostu {
  return navrh((k) => {
    mostovka(k, xs);
    const vnitrni = xs.slice(1, -1);
    k.prut(O, [0, 0], [vnitrni[0]!, 1]);
    k.prut(O, [vnitrni.at(-1)!, 1], [ROZPETI, 0]);
    for (let i = 0; i + 1 < vnitrni.length; i++) k.prut(O, [vnitrni[i]!, 1], [vnitrni[i + 1]!, 1]);
    for (const x of vnitrni) k.prut(O, [x, 0], [x, 1]);
    for (let i = 0; i + 1 < vnitrni.length; i++) {
      const [a, b] = [vnitrni[i]!, vnitrni[i + 1]!];
      const kStredu = a < ROZPETI / 2;
      k.prut(O, kStredu ? [a, 1] : [a, 0], kStredu ? [b, 0] : [b, 1]);
    }
    zaves(k, tlumice);
  });
}

/**
 * Lehká metrová příhrada: horní styčníky jen nad styčníky mostovky `vrcholy` (spojuje je horní
 * pás a každý stojí na svislici); ostatní styčníky mostovky drží šikminy k nejbližšímu hornímu
 * styčníku vlevo a vpravo, opěry jedna šikmina. Proti plné příhradě ušetří asi desetinu oceli.
 */
function lehka(xs: readonly number[], vrcholy: readonly number[], tlumice: readonly Tlumic[] = []): NavrhMostu {
  return navrh((k) => {
    mostovka(k, xs);
    for (let i = 0; i + 1 < vrcholy.length; i++) k.prut(O, [vrcholy[i]!, 1], [vrcholy[i + 1]!, 1]);
    for (const x of vrcholy) k.prut(O, [x, 0], [x, 1]);
    for (const x of xs) {
      if (vrcholy.includes(x)) continue;
      const vlevo = vrcholy.filter((v) => v < x).at(-1);
      const vpravo = vrcholy.find((v) => v > x);
      if (vlevo !== undefined) k.prut(O, [x, 0], [vlevo, 1]);
      if (vpravo !== undefined) k.prut(O, [x, 0], [vpravo, 1]);
    }
    zaves(k, tlumice);
  });
}

/** Rytmy úrovně: takt kapely a kadence běžců, Hz. */
const PRUVOD = 1.8;
const BEH = 2.4;

export const reseni: ReseniUrovne = {
  // Jiná cesta: plná příhrada z 5-03 (pole 4 m, uprostřed dvě dvoumetrová) a tři největší tlumiče
  // kolem středu, všechny naladěné stejně na 2,15 Hz, mezi oba rytmy. Projde (0,88 m/s²), ale tři
  // tlumiče se do inženýrského rozpočtu nevejdou a čtyřmetrová pole mostovky nedají bonus.
  pruchod: plna(PO_CTYRECH_SE_STREDEM, [
    [16, 1200, 2.15],
    [18, 1200, 2.15],
    [20, 1200, 2.15],
  ]),
  // Lehká příhrada z 5-03 (pole 4 m, uprostřed dvě dvoumetrová) a dva menší tlumiče souměrně
  // kolem středu, jeden na průvod, druhý na běžce. Projde (0,94 m/s²), ale čtyřmetrová pole
  // mostovky drnčí pod dvojnásobkem rytmu běhu a bonus je daleko. S tlumiči po 700 kg neprojde.
  rozpocet: lehka(PO_CTYRECH_SE_STREDEM, [4, 12, 18, 24, 32], [
    [16, 800, PRUVOD],
    [20, 800, BEH],
  ]),
  // Lehká příhrada s poli mostovky 3 m (svislice po šesti metrech) a dva největší tlumiče
  // u středu: jeden na takt kapely, druhý těsně nad rytmus běžců (kmitání 0,74 m/s²).
  mistrovska: lehka(poPolich(3), [6, 12, 18, 24, 30], [
    [15, 1200, PRUVOD],
    [18, 1200, 2.45],
  ]),
  pady: [
    { nazev: "jen mostovka", navrh: navrh((k) => mostovka(k, poPolich(4))) },
    { nazev: "metrová příhrada bez tlumiče", navrh: plna(poPolich(2)) },
    // Most pro průchod z 5-03, které má stejné rozpětí: jeden tlumič na kapelu pochodující 2,0 Hz.
    { nazev: "most z 5-03 beze změny", navrh: plna(poPolich(4), [[16, 600, 2]]) },
    // Jedna lekce: největší tlumič uprostřed naladěný na průvod. Průvod zkrotí, běžce zhorší.
    { nazev: "jeden tlumič naladěný na průvod", navrh: plna(poPolich(2), [[18, 1200, PRUVOD]]) },
    // Jedna lekce: největší tlumič uprostřed naladěný na běžce. Průvod most rozhoupe dál.
    { nazev: "jeden tlumič naladěný na běžce", navrh: plna(poPolich(2), [[18, 1200, BEH]]) },
    // Dva největší tlumiče, ale oba na jeden rytmus: běžci zůstávají.
    {
      nazev: "dva tlumiče, oba naladěné na průvod",
      navrh: plna(poPolich(2), [
        [16, 1200, PRUVOD],
        [20, 1200, PRUVOD],
      ]),
    },
    // Správné tlumiče na dobrém mostě, jen malé: po 600 kg nestačí (rozpočtová má po 800 kg).
    {
      nazev: "dva malé tlumiče na řídké příhradě",
      navrh: lehka(PO_CTYRECH_SE_STREDEM, [4, 12, 18, 24, 32], [
        [16, 600, PRUVOD],
        [20, 600, BEH],
      ]),
    },
  ],
};
